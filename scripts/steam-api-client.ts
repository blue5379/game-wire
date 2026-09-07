/**
 * Steam Storefront/API 呼び出しの一本化モジュール（Issue #360）
 *
 * 第20号のビルドで Steam API がラン全体で全滅した
 * （appdetails 10/10 失敗、storesearch 5/5 失敗、Storefront で HTTP 403 が1件観測）。
 * どの呼び出しにもリトライが無く、失敗理由に HTTP ステータスが残らない箇所もあったため、
 * 一時的な障害なのか恒久的な障害なのかを事後に切り分けられなかった。
 *
 * このモジュールは Steam への全 HTTP 呼び出しを一本化し、以下を提供する:
 * - リトライ + 指数バックオフ（Retry-After ヘッダがあれば優先）
 * - ラン単位のサーキットブレーカ（全滅検知。#360 対応方針4）+ クールダウン後の半開プローブ
 * - 適応型ペーシング（429 を観測すると呼び出し間隔を伸ばす）
 * - 呼び出し結果の集計（getSteamApiHealth）
 *
 * 呼び出し元（steam-entity.ts / resolvers/steam.ts / fetch-data.ts /
 * finalize-game-metadata.ts / fetch-steam.ts）の既存の fail-open 挙動・戻り値の意味は変えない。
 * このモジュールは「HTTP レベルの成否」だけを扱い、レスポンス本文の `success: false` 判定は
 * 呼び出し側の責務のままにする。
 *
 * ## PR #367 後の実測で判明した後退（このリビジョンの変更点の背景）
 *
 * PR #367（リトライ + サーキットブレーカの新設）後、`DEV_MODE=true npm run fetch-data` を
 * ライブ実行したところ、以下が実測された（2026-09-07）:
 * - `data/steam-api-health.json`: `{"total":250,"succeeded":155,"failed":95,
 *   "consecutiveFailures":5,"circuitOpen":true,"statusCounts":{"429":5,"circuit-open":90}}`。
 *   最初の155呼び出しは全部成功し、その直後に 429 が5連続で発生してサーキットが開き、
 *   残り90呼び出しが `attempts=0` で即失敗した。
 * - Storefront 補完で59件、Completeness Gate の R5（同一性照合）で対象5件中5件
 *   （appId 620=Portal 2 含む）が `circuit-open` によりスキップされた。Portal 2 の
 *   appdetails が落ちるわけがなく、これは Steam 障害ではなく自分のサーキットが原因だった。
 * - 別途 appdetails を実測したところ、ペーシング無し（実効約200ms間隔）で155件成功後に
 *   429、700ms間隔で200件成功後に429。Steam Storefront appdetails の実効上限は
 *   おおよそ200リクエスト/5分（約1.5秒間隔）と見積もれる。
 * - fetch-data の全フェーズ（Storefront補完→候補選定→Reconcile→公式URL取得→Gate）は
 *   1回のランの中で数分に及ぶ（実測ではラン開始から終了まで約5分）。
 *
 * つまり「429（レート制限）」と「本当の全滅（403/5xx/ネットワーク断）」を区別せずに同じ
 * consecutiveFailures で数えていたため、429 の連続がサーキットを誤って開かせ、
 * ラン後半の重要なフェーズ（R5 の同一性照合）まで巻き込んでいた。
 * このリビジョンでは (A) 適応型ペーシングで429の発生自体を減らし、(B) 429をサーキットの
 * 全滅検知から分離し、(C) クールダウン後に半開プローブで自動回復できるようにする。
 *
 * ## プロセスを跨いだ集計（writeSteamApiHealth / readSteamApiHealth / mergeSteamApiHealth）
 *
 * このモジュールの集計状態（getSteamApiHealth）はプロセス内変数であり、プロセスを跨がない。
 * ところが実際のパイプラインは `npm run fetch-data` → `npm run generate` → `build-issue.ts`
 * の**3つの別プロセス**で構成され（package.json / weekly-build.yml）、Steam を叩くのは
 * fetch-data（Storefront 補完・Resolver・Completeness Gate の R5）と build-issue
 * （事後の同一性照合）だけである。build-issue.ts が自プロセスの getSteamApiHealth() だけを
 * レポートに載せると、fetch-data プロセスで発生した大半の失敗（第20号の実測はほぼ全てここ）が
 * レポートから漏れる。そのため fetch-data プロセスの終了時にヘルス状態をファイルに書き出し、
 * build-issue プロセスがそれを読んで自プロセスの集計と合算する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** 1 回の Steam API リクエストのタイムアウト（ミリ秒）。単一 appdetails 用 */
export const STEAM_API_TIMEOUT_MS = 10000;

/**
 * リスト系（バルク）エンドポイント用のタイムアウト（ミリ秒）。
 *
 * `featuredcategories`（Top Sellers / New Releases / Coming Soon）と
 * `GetMostPlayedGames`（Top Played）はパイプラインの根データであり、失敗すると
 * `fetchTopSellers` / `fetchNewReleases` / `fetchTopPlayed` が `[]` を返して
 * 号の候補プールがゼロになりうる。`AbortSignal.timeout` は `await response.json()` の
 * 本文読み出しにも効くため、単一 appdetails と同じ STEAM_API_TIMEOUT_MS（10秒）だと
 * 応答がやや遅いだけで成功していたはずのケースまで 3 試行すべて abort しうる。
 * 単一 appdetails とバルクのリスト系では必要な時間予算が異なるため、別の定数として分離する。
 */
export const STEAM_LIST_API_TIMEOUT_MS = 30000;

/** 最大試行回数（初回 + リトライ） */
export const STEAM_MAX_ATTEMPTS = 3;

/** 指数バックオフの基準値（ミリ秒）。実際の待機は base × 2^(attempt-1) */
export const STEAM_RETRY_BASE_DELAY_MS = 1000;

/** Retry-After ヘッダ（秒数形式）を尊重する際の待機時間の上限（ミリ秒） */
export const STEAM_RETRY_AFTER_MAX_MS = 30000;

// ─── 適応型ペーシング（実測3・実測4対応） ─────────────────────────────────
//
// 実測4: 旧実装のペーシングは `storefrontEnrichedCount % 5 === 0` のときだけ 1000ms
// 待つもので、しかも成功パスにしか無く失敗した呼び出しは一切ペーシングされなかった。
// 実効間隔は約200msで、これで155件成功した時点で429が発生した（実測1）。
// 700ms間隔では200件成功して429が発生した（実測3）。
// このモジュールは「すべての HTTP 試行の直前」に間隔を空けることで、429 の発生自体を
// 減らす。429 を観測したら間隔を伸ばし、ラン中は下げない（Steam の窓は分単位のため、
// 下げるとすぐ叩き潰す）。

/** 通常時の最小リクエスト間隔（ミリ秒） */
export const STEAM_MIN_REQUEST_INTERVAL_MS = 400;

/** 429 を観測した後に間隔を上げる際の下限（ミリ秒）。実測3の「約1.5秒間隔」に対応 */
export const STEAM_RATE_LIMITED_INTERVAL_MS = 1500;

/** ペーシング間隔の上限（ミリ秒） */
export const STEAM_PACING_MAX_INTERVAL_MS = 3000;

/**
 * 連続失敗がこの件数に達したらサーキットを開く（= 全滅検知）。
 *
 * これが無いと weekly-build.yml の時間予算を食い潰す:
 * `.github/workflows/weekly-build.yml` は `timeout-minutes: 30`。Steam が全滅している状況で
 * 「約20の論理呼び出し × 最大3試行 × 10秒タイムアウト + バックオフ」を律直に全部やると
 * 10分超を無駄に消費し、記事生成・ビルド・デプロイという後続ステップの時間を圧迫する。
 * 連続失敗が閾値に達した時点で「Steam が落ちている」と判断し、以降は即座に失敗を返す。
 *
 * この閾値は 429（レート制限）では加算されない。429 は STEAM_RATE_LIMIT_CIRCUIT_THRESHOLD
 * という別カウンタで扱う（下記参照。理由は当該定数の JSDoc）。
 *
 * ### 半開（自動回復）について（このリビジョンで実装。旧 JSDoc の判断を反証）
 *
 * 旧リビジョンではここに「半開は実装しない: 週次バッチであり、次回の cron 実行そのものが
 * 実質的な回復チェックになる」と書いていたが、これは実測で反証された。
 * fetch-data の1回のランは Storefront 補完 → 候補選定 → Reconcile → 公式日本語URL取得 →
 * Completeness Gate という複数フェーズを持ち、実測ではラン開始から終了まで約5分かかる
 * （公式URL取得フェーズが Tavily + Bedrock で数分を要するため）。
 * 実測1（2026-09-07）では、ラン序盤の Storefront 補完で開いたサーキットが、
 * 約4分後に走る R5（同一性照合。fetch-data 内で最も重要度が高いフェーズ）を
 * 対象5件中5件（100%）スキップさせた。つまり「同一ラン内の別フェーズ」が
 * 実在し、かつ後のフェーズの方が前のフェーズより重要度が高いことがある以上、
 * 次回の cron 実行を待つのでは遅すぎる。STEAM_CIRCUIT_COOLDOWN_MS 経過後に
 * 1回だけプローブを通す半開状態を実装する（詳細は STEAM_CIRCUIT_COOLDOWN_MS 参照）。
 */
export const STEAM_CIRCUIT_FAILURE_THRESHOLD = 5;

/**
 * 429（レート制限）による論理呼び出しの連続失敗がこの件数に達したらサーキットを開く。
 *
 * 429 は STEAM_CIRCUIT_FAILURE_THRESHOLD の consecutiveFailures には加算しない
 * （リセットもしない）。理由: 429 はサーバが生きていることの証明であり、正しい対処は
 * 「止める」ではなく「遅くする」こと。サーキットブレーカの目的（このモジュール冒頭の
 * JSDoc）は全滅検知（403 全滅・5xx・ネットワーク断）であって、レート制限はその対処法が
 * 全く異なる別種の障害である。
 * 実測1では 429 が5件連続しただけで全滅検知（consecutiveFailures 由来のサーキット）が
 * 誤発火し、Portal 2（appId=620）の同一性照合まで落とした。これは Steam 障害ではなく
 * 自分の呼び出し過多が原因だった（実測3）。
 *
 * ただし 429 が無限に続く場合に走り続けないよう、別カウンタで上限を設ける。
 * このカウンタは成功でリセットする。
 */
export const STEAM_RATE_LIMIT_CIRCUIT_THRESHOLD = 10;

/**
 * サーキットが開いてから、次の1回のプローブ（半開）を許可するまでの待機時間（ミリ秒）。
 *
 * 実測2: fetch-data の全フェーズ（Storefront補完→候補選定→Reconcile→公式URL取得→
 * Completeness Gate）は1回のランで数分に及ぶ。60秒程度のクールダウンであれば、
 * ラン序盤で開いたサーキットがラン終盤の重要フェーズ（R5）に到達する前に回復を試みられる。
 */
export const STEAM_CIRCUIT_COOLDOWN_MS = 60000;

/**
 * リトライ対象の HTTP ステータス。
 *
 * ⚠️ 403 を含めている点が scripts/url-health.ts の RETRYABLE_STATUS_CODES と意図的に異なる。
 * url-health の 403 除外は「サイト側の Bot ブロック」を想定しており、これは待っても回復しない
 * 恒久的な拒否である。一方、Steam の 403 は Issue #360（第20号）で観測された唯一の実測失敗
 * モードであり、レート制限またはランナー IP への一時的なブロックに由来すると考えられる
 * （全ゲームで一律に失敗しており、個別ゲームが Bot 判定されたとは考えにくい）。
 * つまり同じステータスコードでも対象（汎用サイト vs Steam API）によって性質が違うため、
 * ここでは url-health とは逆の判断をしている。
 */
export const STEAM_RETRYABLE_STATUS: ReadonlySet<number> = new Set([
  403, 408, 425, 429, 500, 502, 503, 504,
]);

export type SteamFetchResult =
  | { ok: true; json: unknown; attempts: number }
  | { ok: false; reason: string; status?: number; attempts: number; circuitOpen: boolean };

export interface SteamApiHealth {
  /** 呼び出し試行した「論理呼び出し」数（リトライは数えない） */
  total: number;
  succeeded: number;
  failed: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
  /** HTTP ステータス別の失敗件数。ネットワーク例外は 'network' キーに集計 */
  statusCounts: Record<string, number>;
  /**
   * 観測した 429 レスポンスの総数（リトライで最終的に成功した分も含む。observability 用）。
   * optional: このフィールド追加前に書き出された旧スナップショット（readSteamApiHealth 経由）
   * には存在しないため、mergeSteamApiHealth はこのフィールドが無いスナップショットと
   * 混在しても壊れないようにする。
   */
  rateLimitHits?: number;
}

// ─── モジュール状態（プロセス内・ラン単位） ─────────────────────────────────
let total = 0;
let succeeded = 0;
let failed = 0;
let consecutiveFailures = 0;
let circuitOpen = false;
let circuitOpenedAt: number | undefined;
let probeInFlight = false;
let rateLimitConsecutiveFailures = 0;
let rateLimitHits = 0;
const statusCounts: Record<string, number> = {};

// ─── テスト用に注入可能な依存（本番コードからは configureSteamApiClient を呼ばない） ─────
let sleepImpl: (ms: number) => Promise<void> = defaultSleep;
let currentPacingIntervalMs = STEAM_MIN_REQUEST_INTERVAL_MS;
let lastRequestStartedAt: number | undefined;
/** 並列呼び出し（fetchSteamEntity の Promise.all 等）でもペーシングを直列化するための鎖 */
let pacingChain: Promise<void> = Promise.resolve();

function recordFailureStatus(key: string): void {
  statusCounts[key] = (statusCounts[key] ?? 0) + 1;
}

/** 429 以外の失敗を連続失敗としてカウントし、閾値に達していればサーキットを開く */
function recordFailure(statusKey: string): void {
  failed++;
  consecutiveFailures++;
  recordFailureStatus(statusKey);
  if (consecutiveFailures >= STEAM_CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
  }
}

/**
 * 429 の失敗を専用カウンタでカウントする（B対応）。
 * consecutiveFailures には触れない（加算もリセットもしない）。
 */
function recordRateLimitFailure(): void {
  failed++;
  rateLimitConsecutiveFailures++;
  recordFailureStatus('429');
  if (rateLimitConsecutiveFailures >= STEAM_RATE_LIMIT_CIRCUIT_THRESHOLD) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
  }
}

/** 429 を観測した際にペーシング間隔を伸ばす。ラン中は下げない（A対応） */
function bumpPacingIntervalForRateLimit(): void {
  currentPacingIntervalMs = Math.min(
    Math.max(currentPacingIntervalMs * 2, STEAM_RATE_LIMITED_INTERVAL_MS),
    STEAM_PACING_MAX_INTERVAL_MS
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * すべての HTTP 試行の直前で呼ぶ。現在のペーシング間隔（currentPacingIntervalMs）が
 * 前回のリクエスト開始から経過するまで待つ。
 *
 * `fetchSteamEntity` は英語/日本語を Promise.all で同時に投げるため、
 * 単純に「lastRequestStartedAt を見て待つ」だけでは同時に来た2本が同じ値を見て
 * 両方すぐ通ってしまう。pacingChain でウェイトの計算・更新自体を直列化することで、
 * 同時呼び出しでも間隔が空くことを保証する。
 */
async function gatePacing(): Promise<void> {
  const previous = pacingChain;
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  pacingChain = next;
  await previous;

  const now = Date.now();
  const elapsedMs = lastRequestStartedAt === undefined ? Infinity : now - lastRequestStartedAt;
  const waitMs = Math.max(0, currentPacingIntervalMs - elapsedMs);
  if (waitMs > 0) {
    await sleepImpl(waitMs);
  }
  lastRequestStartedAt = Date.now();
  release();
}

/**
 * サーキットの状態を評価する。
 * - 'proceed': サーキットは閉じている。通常どおり呼び出してよい
 * - 'probe': サーキットは開いているが、クールダウンを経過し、かつ他にプローブ中の
 *   呼び出しが無い。この呼び出しが半開プローブになる（呼び出し元が probeInFlight を
 *   立てて実際に fetch する）
 * - 'skip': サーキットが開いていて、クールダウン未経過またはプローブが既に進行中。
 *   即座に失敗を返す
 */
function evaluateCircuitGate(): 'proceed' | 'probe' | 'skip' {
  if (!circuitOpen) return 'proceed';
  if (probeInFlight) return 'skip';
  const cooldownElapsed =
    circuitOpenedAt !== undefined && Date.now() - circuitOpenedAt >= STEAM_CIRCUIT_COOLDOWN_MS;
  if (!cooldownElapsed) return 'skip';
  probeInFlight = true;
  return 'probe';
}

/** 半開プローブが成功した: サーキットを閉じ、両方の連続失敗カウンタをリセットする */
function closeCircuitAfterProbeSuccess(): void {
  circuitOpen = false;
  circuitOpenedAt = undefined;
  probeInFlight = false;
  console.warn(
    JSON.stringify({
      scope: 'steam-api-client',
      step: 'circuit-half-open-probe',
      result: 'recovered',
      reason: '半開プローブが成功したためサーキットを閉じた',
    })
  );
}

/** 半開プローブが失敗した: サーキットは開いたままで、クールダウンを現在時刻から再開する */
function reopenCircuitAfterProbeFailure(): void {
  probeInFlight = false;
  circuitOpenedAt = Date.now();
}

/**
 * Retry-After ヘッダ（秒数形式）を待機ミリ秒に変換する。
 * ヘッダが無い・不正な場合は undefined（呼び出し側で指数バックオフにフォールバックする）。
 * STEAM_RETRY_AFTER_MAX_MS でクランプする（Steam が極端に長い値を返した場合の防御）。
 */
function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers?.get?.('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds * 1000, STEAM_RETRY_AFTER_MAX_MS);
}

function warnUnlessQuiet(
  quiet: boolean | undefined,
  payload: Record<string, unknown>
): void {
  if (quiet) return;
  console.warn(JSON.stringify({ scope: 'steam-api-client', step: 'fetchSteamJson', ...payload }));
}

/**
 * Steam Storefront/API に GET リクエストを送り、JSON を返す。
 *
 * - リトライ対象ステータス（STEAM_RETRYABLE_STATUS）は指数バックオフで最大 STEAM_MAX_ATTEMPTS
 *   回まで再試行する。Retry-After ヘッダがあればそれを優先する。
 * - タイムアウト・ネットワーク例外もリトライ対象。
 * - 404 等の非リトライ対象ステータスは即座に失敗を返す（attempts: 1）。
 * - HTTP 200 でレスポンス本文が `success: false` のケースは判定しない。`{ ok: true, json }`
 *   を返し、判定は呼び出し側の責務とする（このレイヤはあくまで HTTP レベルの成否のみを見る）。
 * - すべての HTTP 試行の直前でペーシング（gatePacing）を待つ。429 を観測すると以降の
 *   間隔が伸びる（ラン中は下がらない）。
 * - 429 はサーキットの consecutiveFailures には加算しない。別カウンタ
 *   （STEAM_RATE_LIMIT_CIRCUIT_THRESHOLD）で扱う。
 * - サーキットが開いている間は、クールダウン（STEAM_CIRCUIT_COOLDOWN_MS）未経過なら
 *   fetch を呼ばず即座に失敗を返す。クールダウン経過後は1回だけ半開プローブとして
 *   実際に fetch する。
 *
 * @param url リクエスト先 URL
 * @param opts.fetchImpl テストで差し替える fetch 実装
 * @param opts.quiet true にすると失敗時の console.warn を抑止する
 */
export async function fetchSteamJson(
  url: string,
  opts?: { fetchImpl?: typeof fetch; quiet?: boolean }
): Promise<SteamFetchResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const quiet = opts?.quiet;

  total++;

  const gate = evaluateCircuitGate();
  if (gate === 'skip') {
    failed++;
    // 既にサーキットが開いている状態を維持するだけなので consecutiveFailures は増やさない。
    // ただし statusCounts には計上する（バグ3対応）: これを忘れると
    // sum(statusCounts) < failed になり、レポートを読む側が内訳を合算しても
    // 失敗総数に一致しない（サーキットで打ち切った分だけ内訳から漏れる）。
    recordFailureStatus('circuit-open');
    const reason = 'circuit-open: サーキット開放中のため呼び出しをスキップ (attempts=0)';
    warnUnlessQuiet(quiet, { url, reason, circuitOpen: true });
    return { ok: false, reason, attempts: 0, circuitOpen: true };
  }
  const isProbe = gate === 'probe';

  for (let attempt = 1; attempt <= STEAM_MAX_ATTEMPTS; attempt++) {
    await gatePacing();
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(STEAM_API_TIMEOUT_MS) });

      if (res.ok) {
        // バグ2対応: res.json() は本文が JSON でない場合（Steam が HTTP 200 で
        // HTML エラーページ等を返すケース）に throw しうる。カウンタ更新を
        // res.json() の成功より前に行うと、throw して catch に落ちた（= このループが
        // 継続 or 最終的に失敗する）場合でも succeeded++ / consecutiveFailures=0 が
        // 既に実行済みになってしまい、succeeded と failed の両方が加算されて
        // succeeded + failed > total になったり、サーキットが開くべき状況で
        // consecutiveFailures が誤ってリセットされたりする。
        // そのため res.json() の成功を確認した後にカウンタを更新する。
        const json = await res.json();
        succeeded++;
        consecutiveFailures = 0;
        rateLimitConsecutiveFailures = 0;
        if (isProbe) closeCircuitAfterProbeSuccess();
        return { ok: true, json, attempts: attempt };
      }

      if (res.status === 429) {
        rateLimitHits++;
        bumpPacingIntervalForRateLimit();
      }

      const retryable = STEAM_RETRYABLE_STATUS.has(res.status);
      const isLastAttempt = attempt === STEAM_MAX_ATTEMPTS;
      if (!retryable || isLastAttempt) {
        if (res.status === 429) {
          recordRateLimitFailure();
        } else {
          recordFailure(String(res.status));
        }
        if (isProbe) reopenCircuitAfterProbeFailure();
        const reason = `HTTP ${res.status} (attempts=${attempt})`;
        warnUnlessQuiet(quiet, { url, status: res.status, reason, attempts: attempt, circuitOpen });
        return { ok: false, reason, status: res.status, attempts: attempt, circuitOpen };
      }

      const retryAfterMs = parseRetryAfterMs(res);
      const backoffMs = retryAfterMs ?? STEAM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleepImpl(backoffMs);
    } catch (err) {
      const isLastAttempt = attempt === STEAM_MAX_ATTEMPTS;
      if (isLastAttempt) {
        recordFailure('network');
        if (isProbe) reopenCircuitAfterProbeFailure();
        const reason = `${String(err)} (attempts=${attempt})`;
        warnUnlessQuiet(quiet, { url, reason, attempts: attempt, circuitOpen });
        return { ok: false, reason, attempts: attempt, circuitOpen };
      }
      const backoffMs = STEAM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleepImpl(backoffMs);
    }
  }

  // 到達不能（ループは必ず return する）。TypeScript の網羅性チェック用。
  throw new Error('fetchSteamJson: unreachable');
}

/** 現在のラン内の呼び出し集計を返す（データパイプライン全体で共有するプロセス内状態） */
export function getSteamApiHealth(): SteamApiHealth {
  return {
    total,
    succeeded,
    failed,
    consecutiveFailures,
    circuitOpen,
    statusCounts: { ...statusCounts },
    rateLimitHits,
  };
}

/**
 * 依存を注入する（テスト専用）。本番コード（fetchSteamJson の呼び出し元）からは呼ばない。
 * resetSteamApiClient() で default に戻る。
 *
 * - sleepImpl: リトライのバックオフ待機・ペーシング待機の両方で使われる sleep 実装を差し替える
 * - minRequestIntervalMs: ペーシングの現在間隔（currentPacingIntervalMs）を直接上書きする
 */
export function configureSteamApiClient(opts: {
  sleepImpl?: (ms: number) => Promise<void>;
  minRequestIntervalMs?: number;
}): void {
  if (opts.sleepImpl !== undefined) sleepImpl = opts.sleepImpl;
  if (opts.minRequestIntervalMs !== undefined) currentPacingIntervalMs = opts.minRequestIntervalMs;
}

/** テスト用にモジュール状態を初期化する（configureSteamApiClient の設定も default に戻す） */
export function resetSteamApiClient(): void {
  total = 0;
  succeeded = 0;
  failed = 0;
  consecutiveFailures = 0;
  circuitOpen = false;
  circuitOpenedAt = undefined;
  probeInFlight = false;
  rateLimitConsecutiveFailures = 0;
  rateLimitHits = 0;
  for (const key of Object.keys(statusCounts)) {
    delete statusCounts[key];
  }
  sleepImpl = defaultSleep;
  currentPacingIntervalMs = STEAM_MIN_REQUEST_INTERVAL_MS;
  lastRequestStartedAt = undefined;
  pacingChain = Promise.resolve();
}

/** ステージ名付きのヘルススナップショット（プロセス跨ぎの受け渡し用） */
export interface SteamApiHealthSnapshot extends SteamApiHealth {
  /** このスナップショットを書き出したプロセス・ステージ名（例: 'fetch-data'） */
  stage: string;
}

/**
 * 現在の集計をファイルに書き出す（プロセス跨ぎの受け渡し用）。
 * 呼び出し元（fetch-data.ts）のプロセス終了前に呼ぶことを想定する。
 */
export function writeSteamApiHealth(filePath: string, stage: string): void {
  const snapshot: SteamApiHealthSnapshot = { ...getSteamApiHealth(), stage };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}

/**
 * スナップショットを読み込む。ファイルが無い・壊れている場合は undefined を返す
 * （DEV 実行や fetch-data を経ない単独実行で build-issue.ts を落とさないため）。
 *
 * rateLimitHits は必須フィールド検査に含めない: このフィールド追加前に書き出された
 * 旧スナップショットにはこのキーが無く、それを読めなくしてはいけない。
 */
export function readSteamApiHealth(filePath: string): SteamApiHealthSnapshot | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SteamApiHealthSnapshot> | null;
    if (
      !parsed ||
      typeof parsed.stage !== 'string' ||
      typeof parsed.total !== 'number' ||
      typeof parsed.succeeded !== 'number' ||
      typeof parsed.failed !== 'number' ||
      typeof parsed.consecutiveFailures !== 'number' ||
      typeof parsed.circuitOpen !== 'boolean' ||
      typeof parsed.statusCounts !== 'object' ||
      parsed.statusCounts === null
    ) {
      return undefined;
    }
    return parsed as SteamApiHealthSnapshot;
  } catch {
    return undefined;
  }
}

/**
 * 複数ステージの集計を合算する（レポート表示専用。判定ロジックの合流には使わない）。
 *
 * - total / succeeded / failed: 加算
 * - statusCounts: キーごとに加算
 * - circuitOpen: いずれかが true なら true（OR）。どのステージでも全滅検知が
 *   起きていた事実をレポート上で見失わないようにする。
 * - consecutiveFailures: 最大値。ステージは別プロセス・別時間帯（fetch-data → generate →
 *   build-issue の間に記事生成の実処理を挟む）で実行されるため、「ステージ A の末尾の失敗と
 *   ステージ B の先頭の失敗が連続している」という意味での連続性は定義できない。
 *   合算（加算）すると実態より深刻に見える誤解を生むため、各ステージ内で観測された
 *   最大の連続失敗数のみを代表値として残す。
 * - rateLimitHits: 加算。両方 undefined なら undefined のまま（旧スナップショットのみの
 *   合算では undefined を維持し、「観測していない」と「0件だった」を区別する）。
 *   片方でも数値を持つステージがあれば、無いステージは 0 として合算する。
 */
export function mergeSteamApiHealth(parts: SteamApiHealth[]): SteamApiHealth {
  const merged: SteamApiHealth = {
    total: 0,
    succeeded: 0,
    failed: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
    statusCounts: {},
  };
  let rateLimitHitsSum: number | undefined;
  for (const part of parts) {
    merged.total += part.total;
    merged.succeeded += part.succeeded;
    merged.failed += part.failed;
    merged.circuitOpen = merged.circuitOpen || part.circuitOpen;
    merged.consecutiveFailures = Math.max(merged.consecutiveFailures, part.consecutiveFailures);
    for (const [key, count] of Object.entries(part.statusCounts)) {
      merged.statusCounts[key] = (merged.statusCounts[key] ?? 0) + count;
    }
    if (part.rateLimitHits !== undefined) {
      rateLimitHitsSum = (rateLimitHitsSum ?? 0) + part.rateLimitHits;
    }
  }
  if (rateLimitHitsSum !== undefined) {
    merged.rateLimitHits = rateLimitHitsSum;
  }
  return merged;
}
