/**
 * Steam 実体の二言語取得モジュール（Issue #179 PR-1）
 *
 * completeness-gate.ts の fetchSteamEntity（英語のみ）と
 * validate-article.ts の独自 fetch（日本語のみ）を一本化する。
 * 両方の言語を取得することで、game.title が日本語ローカライズ名の場合にも
 * title 軸で一致判定できる。
 *
 * HTTP 呼び出しは steam-api-client.ts の fetchSteamJson に統一する（Issue #360）。
 * リトライ・バックオフ・サーキットブレーカはそちらの責務であり、このモジュールは
 * 「取れた結果をどう解釈するか（success:false との切り分け等）」に責務を絞る。
 */

import { fetchSteamJson } from './steam-api-client.js';

export interface SteamEntity {
  appId: number;
  /** l=english の name。API 失敗時は undefined */
  nameEn?: string;
  /** l=japanese の name。API 失敗時は undefined */
  nameJa?: string;
  /** coming_soon=true の場合は undefined（発売日未確定を照合しない現行方針踏襲） */
  releaseDate?: string;
  developers: string[];
  publishers: string[];
}

/**
 * fetchSteamEntity の戻り値（判別可能ユニオン）。
 * 失敗理由（HTTP ステータス・success:false 等）を呼び出し元（レポート）まで伝えるため、
 * `SteamEntity | undefined` ではなく ok/reason を持つ形にする（Issue #360 修正⑦）。
 */
export type SteamEntityResult =
  | { ok: true; entity: SteamEntity }
  | { ok: false; reason: string };

/**
 * プロセス内キャッシュ（同一 appId の重複 fetch を防ぐ）。
 * 失敗結果は下記のとおりキャッシュしないため、値は常に成功時の SteamEntity のみ。
 */
const cache = new Map<number, SteamEntity>();

type AppDetailsData = {
  name?: string;
  release_date?: { date?: string; coming_soon?: boolean };
  developers?: string[];
  publishers?: string[];
};

/**
 * 1 言語分の appdetails 取得結果。
 *
 * 失敗時は理由を返す。「HTTP 403 でブロックされた（一過性・全ゲーム共通の障害）」と
 * 「success:false（その appId が当該リージョンで非公開）」を事後に区別するため
 * （Issue #363。第20号では appdetails が 10 回中 10 回失敗したが、切り分けられなかった）。
 */
type AppDetailsResult =
  | { ok: true; data: AppDetailsData }
  | { ok: false; reason: string };

async function fetchAppDetails(
  appId: number,
  lang: 'english' | 'japanese',
  fetchImpl: typeof fetch
): Promise<AppDetailsResult> {
  // cc=jp: 日本向けマガジンのため日本リージョンで取得する。
  // cc を省略するとランナーの IP リージョン（GitHub Actions は US）になり、
  // 日本域限定タイトルで success:false → fail-open で照合が黙ってスキップされ得る
  // （旧 validate-article 実装は cc=jp 付きだった。パリティ維持）。
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=jp&l=${lang}`;

  // HTTP レベルのリトライ・バックオフ・サーキットブレーカは steam-api-client.ts に委ねる。
  // quiet: true — 失敗時の warn は呼び出し元（下の fetchSteamEntity）が
  // scope:'steam-entity' として言語別にまとめて出すため、ここで重複させない。
  const result = await fetchSteamJson(url, { fetchImpl, quiet: true });
  if (!result.ok) {
    // result.reason には既に "(attempts=N)" が含まれる（fetchSteamJson が付与）。
    // サーキットが開いていた場合は reason に 'circuit-open' が含まれ、そのまま伝播する。
    return { ok: false, reason: result.reason };
  }

  const json = result.json as Record<string, { success?: boolean; data?: AppDetailsData }>;
  const entry = json[String(appId)];
  if (!entry?.success) {
    return {
      ok: false,
      reason: `success:false（cc=jp で非公開の可能性）(attempts=${result.attempts})`,
    };
  }
  if (!entry.data) {
    return { ok: false, reason: `success:true だが data が空 (attempts=${result.attempts})` };
  }
  return { ok: true, data: entry.data };
}

/**
 * Steam appdetails を l=english / l=japanese の2回呼んで SteamEntity を返す。
 * 片方失敗はそのフィールドのみ undefined（fail-open）。両方失敗時は
 * `{ ok: false, reason }` を返し、失敗理由（HTTP ステータス・success:false 等）を
 * 呼び出し元（レポート）まで伝える（Issue #360 修正⑦）。
 * プロセス内 Map でキャッシュする（同一 appId の再呼び出しは即返し）。
 *
 * @param appId   Steam アプリ ID
 * @param fetchImpl テストで差し替える fetch 実装（デフォルトはグローバル fetch）
 */
export async function fetchSteamEntity(
  appId: number,
  fetchImpl: typeof fetch = fetch
): Promise<SteamEntityResult> {
  const cached = cache.get(appId);
  if (cached !== undefined) return { ok: true, entity: cached };

  // 修正C（/code-review 指摘）: 以前は Promise.all で英語/日本語を同時に投げていたが、
  // fetchSteamJson はサーキットゲート評価（evaluateCircuitGate()）をペーシング
  // （gatePacing()）より前に同期的に行う。そのため、サーキットが開いてクールダウン
  // 経過済みの状態では「先に評価された英語が probe、日本語が必ず skip」に固定され、
  // プローブ（英語）が成功してサーキットが閉じた後も日本語側は既に skip 済みで
  // 失敗が確定してしまう。結果、両方失敗による fail-open ではなく「英語だけの
  // エンティティ」で照合が走り、game.title が日本語ローカライズ名のケースで
  // 誤って titleAxis='disagree' になりうる（scripts/game-identity.ts の
  // entityTitles = [nameEn, nameJa].filter(Boolean) 参照）。
  // 逐次（英語 → 日本語）にすれば、プローブ（英語）が成功した時点でサーキットが
  // 閉じるため、日本語は正常に proceed できる。英語が失敗すればサーキットは開いた
  // ままで日本語も skip → 両方失敗 → 既存の fail-open 経路に正しく落ちる。
  // 時間コストは増えない: gatePacing() が既に全 HTTP 試行を直列化しているため、
  // Promise.all で同時に投げても実際には1.5秒ずつ間隔が空いて実行されており、
  // 逐次化しても実時間は変わらない（並列化の利点はそもそも無かった）。
  const enResult = await fetchAppDetails(appId, 'english', fetchImpl);
  const jaResult = await fetchAppDetails(appId, 'japanese', fetchImpl);
  const enData = enResult.ok ? enResult.data : undefined;
  const jaData = jaResult.ok ? jaResult.data : undefined;

  // 両方失敗 → fail-open。失敗結果はキャッシュしない（次回呼び出しで再試行できる）。
  // ログを残すことで「照合して same だった」と「実体が取れず未照合」を build ログ上で区別できるようにする。
  if (!enData && !jaData) {
    console.warn(
      JSON.stringify({
        scope: 'steam-entity',
        appId,
        step: 'fetch-appdetails',
        reason: 'both-languages-failed (fail-open: 照合はスキップされる)',
        // 言語別の失敗理由。全ゲームで同じ HTTP ステータスが並べば API 側の障害、
        // success:false ならその appId 固有の問題と切り分けられる（Issue #363）
        english: enResult.ok ? 'ok' : enResult.reason,
        japanese: jaResult.ok ? 'ok' : jaResult.reason,
      })
    );
    // 失敗理由を呼び出し元（レポート）まで伝える（Issue #360 修正⑦）。
    // 材料は上の console.warn と同じ（english/japanese の reason）。
    return {
      ok: false,
      reason: `both-languages-failed（english=${enResult.ok ? 'ok' : enResult.reason} / japanese=${jaResult.ok ? 'ok' : jaResult.reason}）`,
    };
  }

  // 片言語のみ失敗した場合も理由を残す。nameEn/nameJa の欠落は title 軸の照合結果を
  // 変えるため、後から「なぜ片方だけ無いのか」を追えるようにしておく。
  // 判定条件は下のキャッシュガード（nameEn/nameJa の undefined 判定）と揃える:
  // AppDetailsData.name は optional なので success:true + data あり + name なしの応答は
  // ok:true になり、`!ok` だけを見ると「name が無いのに無言でキャッシュもされない」
  // ケースが唯一ログから漏れる（Issue #363 レビュー指摘）。
  const enName = enData?.name;
  const jaName = jaData?.name;
  if (enName === undefined || jaName === undefined) {
    const describe = (result: AppDetailsResult, name: string | undefined): string =>
      !result.ok ? result.reason : name === undefined ? 'HTTP 200 だが data.name が無い' : 'ok';
    console.warn(
      JSON.stringify({
        scope: 'steam-entity',
        appId,
        step: 'fetch-appdetails',
        reason: 'one-language-failed (残った言語のデータで続行)',
        english: describe(enResult, enName),
        japanese: describe(jaResult, jaName),
      })
    );
  }

  // developers / publishers は英語版を優先（日本語版は名前が同じ場合が多いが念のため）
  const base = enData ?? jaData!;

  // どちらかの言語データで coming_soon=true なら発売日は信頼しない（照合しない）。
  // 英語版のみで判断すると、英語が coming_soon=true でも日本語版が具体日を持つケースで
  // 誤って yearAxis=unknown に倒す可能性があるため、両方確認する。
  const comingSoon = (enData?.release_date?.coming_soon ?? false) || (jaData?.release_date?.coming_soon ?? false);
  const releaseDate = comingSoon ? undefined : base.release_date?.date;

  const entity: SteamEntity = {
    appId,
    nameEn: enData?.name,
    nameJa: jaData?.name,
    releaseDate,
    developers: (base.developers ?? []).filter((d): d is string => typeof d === 'string' && d.trim().length > 0),
    publishers: (base.publishers ?? []).filter((p): p is string => typeof p === 'string' && p.trim().length > 0),
  };

  // 片言語失敗（nameEn/nameJa が undefined）の場合はキャッシュしない。
  // 一時的なネットワーク障害による部分的な結果が固定されると、
  // 日本語 title のゲームが title 軸で常に disagree になる可能性があるため。
  if (entity.nameEn !== undefined && entity.nameJa !== undefined) {
    cache.set(appId, entity);
  }
  return { ok: true, entity };
}

/** テスト用: キャッシュをクリアする */
export function clearSteamEntityCache(): void {
  cache.clear();
}
