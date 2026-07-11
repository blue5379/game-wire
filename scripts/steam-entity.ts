/**
 * Steam 実体の二言語取得モジュール（Issue #179 PR-1）
 *
 * completeness-gate.ts の fetchSteamEntity（英語のみ）と
 * validate-article.ts の独自 fetch（日本語のみ）を一本化する。
 * 両方の言語を取得することで、game.title が日本語ローカライズ名の場合にも
 * title 軸で一致判定できる。
 */

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

const STOREFRONT_TIMEOUT_MS = 10000;

/** プロセス内キャッシュ（同一 appId の重複 fetch を防ぐ） */
const cache = new Map<number, SteamEntity | undefined>();

type AppDetailsData = {
  name?: string;
  release_date?: { date?: string; coming_soon?: boolean };
  developers?: string[];
  publishers?: string[];
};

async function fetchAppDetails(
  appId: number,
  lang: 'english' | 'japanese',
  fetchImpl: typeof fetch
): Promise<AppDetailsData | undefined> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(STOREFRONT_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<
      string,
      { success?: boolean; data?: AppDetailsData }
    >;
    const entry = json[String(appId)];
    if (!entry?.success || !entry.data) return undefined;
    return entry.data;
  } catch {
    return undefined;
  }
}

/**
 * Steam appdetails を l=english / l=japanese の2回呼んで SteamEntity を返す。
 * 片方失敗はそのフィールドのみ undefined（fail-open）。両方失敗で undefined。
 * プロセス内 Map でキャッシュする（同一 appId の再呼び出しは即返し）。
 *
 * @param appId   Steam アプリ ID
 * @param fetchImpl テストで差し替える fetch 実装（デフォルトはグローバル fetch）
 */
export async function fetchSteamEntity(
  appId: number,
  fetchImpl: typeof fetch = fetch
): Promise<SteamEntity | undefined> {
  if (cache.has(appId)) return cache.get(appId);

  const [enData, jaData] = await Promise.all([
    fetchAppDetails(appId, 'english', fetchImpl),
    fetchAppDetails(appId, 'japanese', fetchImpl),
  ]);

  // 両方失敗 → fail-open。失敗結果はキャッシュしない（次回呼び出しで再試行できる）。
  if (!enData && !jaData) {
    return undefined;
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
  return entity;
}

/** テスト用: キャッシュをクリアする */
export function clearSteamEntityCache(): void {
  cache.clear();
}
