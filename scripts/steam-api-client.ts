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
 * - ラン単位のサーキットブレーカ（全滅検知。#360 対応方針4）
 * - 呼び出し結果の集計（getSteamApiHealth）
 *
 * 呼び出し元（steam-entity.ts / resolvers/steam.ts / fetch-data.ts /
 * finalize-game-metadata.ts）の既存の fail-open 挙動・戻り値の意味は変えない。
 * このモジュールは「HTTP レベルの成否」だけを扱い、レスポンス本文の `success: false` 判定は
 * 呼び出し側の責務のままにする。
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

/** 1 回の Steam API リクエストのタイムアウト（ミリ秒） */
export const STEAM_API_TIMEOUT_MS = 10000;

/** 最大試行回数（初回 + リトライ） */
export const STEAM_MAX_ATTEMPTS = 3;

/** 指数バックオフの基準値（ミリ秒）。実際の待機は base × 2^(attempt-1) */
export const STEAM_RETRY_BASE_DELAY_MS = 1000;

/** Retry-After ヘッダ（秒数形式）を尊重する際の待機時間の上限（ミリ秒） */
export const STEAM_RETRY_AFTER_MAX_MS = 30000;

/**
 * 連続失敗がこの件数に達したらサーキットを開く（= 全滅検知）。
 *
 * これが無いと weekly-build.yml の時間予算を食い潰す:
 * `.github/workflows/weekly-build.yml` は `timeout-minutes: 30`。Steam が全滅している状況で
 * 「約20の論理呼び出し × 最大3試行 × 10秒タイムアウト + バックオフ」を律直に全部やると
 * 10分超を無駄に消費し、記事生成・ビルド・デプロイという後続ステップの時間を圧迫する。
 * 連続失敗が閾値に達した時点で「Steam が落ちている」と判断し、以降は即座に失敗を返す。
 *
 * 半開（自動回復）は実装しない: これは週次バッチであり、次回の cron 実行そのものが
 * 実質的な回復チェックになる。同一ラン内で回復を試み続ける必要性が薄い。
 */
export const STEAM_CIRCUIT_FAILURE_THRESHOLD = 5;

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
}

// ─── モジュール状態（プロセス内・ラン単位） ─────────────────────────────────
let total = 0;
let succeeded = 0;
let failed = 0;
let consecutiveFailures = 0;
let circuitOpen = false;
const statusCounts: Record<string, number> = {};

function recordFailureStatus(key: string): void {
  statusCounts[key] = (statusCounts[key] ?? 0) + 1;
}

/** 連続失敗をカウントし、閾値に達していればサーキットを開く */
function recordFailure(statusKey: string): void {
  failed++;
  consecutiveFailures++;
  recordFailureStatus(statusKey);
  if (consecutiveFailures >= STEAM_CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpen = true;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * - サーキットが開いている間は fetch を呼ばず即座に失敗を返す。
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

  if (circuitOpen) {
    failed++;
    // 既にサーキットが開いている状態を維持するだけなので consecutiveFailures は増やさない。
    // ただし statusCounts には計上する（バグ3対応）: これを忘れると
    // sum(statusCounts) < failed になり、レポートを読む側が内訳を合算しても
    // 失敗総数に一致しない（サーキットで打ち切った分だけ内訳から漏れる）。
    recordFailureStatus('circuit-open');
    warnUnlessQuiet(quiet, {
      url,
      reason: `circuit-open: 連続失敗が${STEAM_CIRCUIT_FAILURE_THRESHOLD}件に達したため呼び出しをスキップ (attempts=0)`,
      circuitOpen: true,
    });
    return {
      ok: false,
      reason: `circuit-open: 連続失敗が${STEAM_CIRCUIT_FAILURE_THRESHOLD}件に達したため呼び出しをスキップ (attempts=0)`,
      attempts: 0,
      circuitOpen: true,
    };
  }

  for (let attempt = 1; attempt <= STEAM_MAX_ATTEMPTS; attempt++) {
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
        return { ok: true, json, attempts: attempt };
      }

      const retryable = STEAM_RETRYABLE_STATUS.has(res.status);
      const isLastAttempt = attempt === STEAM_MAX_ATTEMPTS;
      if (!retryable || isLastAttempt) {
        recordFailure(String(res.status));
        const reason = `HTTP ${res.status} (attempts=${attempt})`;
        warnUnlessQuiet(quiet, { url, status: res.status, reason, attempts: attempt, circuitOpen });
        return { ok: false, reason, status: res.status, attempts: attempt, circuitOpen };
      }

      const retryAfterMs = parseRetryAfterMs(res);
      const backoffMs = retryAfterMs ?? STEAM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await defaultSleep(backoffMs);
    } catch (err) {
      const isLastAttempt = attempt === STEAM_MAX_ATTEMPTS;
      if (isLastAttempt) {
        recordFailure('network');
        const reason = `${String(err)} (attempts=${attempt})`;
        warnUnlessQuiet(quiet, { url, reason, attempts: attempt, circuitOpen });
        return { ok: false, reason, attempts: attempt, circuitOpen };
      }
      const backoffMs = STEAM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await defaultSleep(backoffMs);
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
  };
}

/** テスト用にモジュール状態を初期化する */
export function resetSteamApiClient(): void {
  total = 0;
  succeeded = 0;
  failed = 0;
  consecutiveFailures = 0;
  circuitOpen = false;
  for (const key of Object.keys(statusCounts)) {
    delete statusCounts[key];
  }
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
  for (const part of parts) {
    merged.total += part.total;
    merged.succeeded += part.succeeded;
    merged.failed += part.failed;
    merged.circuitOpen = merged.circuitOpen || part.circuitOpen;
    merged.consecutiveFailures = Math.max(merged.consecutiveFailures, part.consecutiveFailures);
    for (const [key, count] of Object.entries(part.statusCounts)) {
      merged.statusCounts[key] = (merged.statusCounts[key] ?? 0) + count;
    }
  }
  return merged;
}
