/**
 * Steam Platform Resolver
 *
 * 3経路で Steam ストア URL を解決する:
 * 1. knownSteamAppId が既知 → 直接 URL を構築（appdetails で名前検証）
 * 2. IGDB websites[type=13]（旧 category=13）に Steam URL が含まれる
 * 3. Steam Store Search API（storesearch）で title / titleJa / igdbSlug を検索
 */

import type { StoreLink } from '../types.js';
import { matchesAnyTitle } from '../game-identity.js';

/** Steam Store Search の単一アイテム */
interface SteamSearchItem {
  id: number;
  name: string;
  price?: { currency: string; initial: number; final: number };
  release?: { steam_release_date?: string };
}

interface SteamSearchResponse {
  total: number;
  items: SteamSearchItem[];
}

interface SteamAppDetailsData {
  name: string;
  release_date?: { date?: string };
}

/**
 * Steam API の呼び出し結果。
 *
 * 失敗を単に null で返すと「API が落ちていた（一過性）」と「名前が一致しなかった
 * （そのゲームは Steam に無い）」が区別できず、事後に切り分けられない。
 * 第20号では appdetails が 10 回中 10 回失敗したが、403 なのか 429 なのか
 * タイムアウトなのかを追えなかった（Issue #363）。
 */
type SteamApiOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; /** API 自体の障害（名前不一致ではない） */ apiFailure: boolean };

/**
 * Steam Store Search API でタイトルを検索し、最も一致度の高い appId を返す
 */
async function searchByTitle(
  queryTitles: string[],
  releaseDate?: string
): Promise<SteamApiOutcome<{ appId: number; name: string }>> {
  /** タイトルごとの失敗理由。全タイトルが API 障害なら apiFailure=true として返す */
  const failures: string[] = [];
  let apiFailures = 0;

  // 最初に英語タイトルで検索し、なければ日本語タイトルでリトライ
  for (const queryTitle of queryTitles) {
    let json: SteamSearchResponse;
    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(queryTitle)}&l=english&cc=US`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        failures.push(`"${queryTitle}": HTTP ${res.status}`);
        apiFailures++;
        continue;
      }
      json = (await res.json()) as SteamSearchResponse;
    } catch (err) {
      failures.push(`"${queryTitle}": ${String(err)}`);
      apiFailures++;
      continue;
    }

    if (!json?.items?.length) {
      failures.push(`"${queryTitle}": 検索結果 0 件`);
      continue;
    }

    for (const item of json.items) {
      if (matchesAnyTitle(queryTitles, item.name, releaseDate, item.release?.steam_release_date)) {
        return { ok: true, value: { appId: item.id, name: item.name } };
      }
    }
    failures.push(
      `"${queryTitle}": ${json.items.length} 件ヒットしたがタイトル一致なし（先頭: "${json.items[0]?.name ?? ''}"）`
    );
  }

  return {
    ok: false,
    reason: failures.join(' / ') || '検索対象タイトルなし',
    // 試したすべてのタイトルで API 呼び出し自体が失敗した場合のみ API 障害とみなす
    apiFailure: apiFailures > 0 && apiFailures === queryTitles.length,
  };
}

/**
 * appId から Steam ストア URL を構築する
 */
export function buildSteamUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}/`;
}

/**
 * Steam appdetails API でアプリ名を取得して名前一致を検証する。
 *
 * 失敗理由を返し、「API 障害」と「名前不一致（別ゲームの appId だった）」を
 * 呼び出し側が区別できるようにする（Issue #363）。
 */
async function verifyAppIdByName(
  appId: number,
  queryTitles: string[],
  releaseDate?: string
): Promise<SteamApiOutcome<{ name: string; date?: string }>> {
  let entry: { success?: boolean; data?: SteamAppDetailsData } | undefined;
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return { ok: false, reason: `appdetails HTTP ${res.status}`, apiFailure: true };
    }
    const json = (await res.json()) as Record<string, { success?: boolean; data?: SteamAppDetailsData }>;
    entry = json[String(appId)];
  } catch (err) {
    return { ok: false, reason: `appdetails ${String(err)}`, apiFailure: true };
  }

  if (!entry?.success) {
    return { ok: false, reason: 'appdetails success:false（appId 非公開か存在しない）', apiFailure: false };
  }
  if (!entry.data?.name) {
    return { ok: false, reason: 'appdetails success:true だが name が空', apiFailure: false };
  }

  const appName = entry.data.name;
  const appDate = entry.data.release_date?.date;
  if (!matchesAnyTitle(queryTitles, appName, releaseDate, appDate)) {
    return {
      ok: false,
      reason: `name mismatch（steam="${appName}"${appDate ? ` ${appDate}` : ''} vs 期待="${queryTitles.join('" / "')}"${releaseDate ? ` ${releaseDate}` : ''}）`,
      apiFailure: false,
    };
  }
  return { ok: true, value: { name: appName, date: appDate } };
}

/**
 * IGDB websites から Steam URL を抽出する
 */
function extractSteamUrlFromIgdb(
  igdbWebsites?: { url: string; category?: number; type?: number }[]
): string | null {
  if (!igdbWebsites) return null;
  // Steam タグ（type=13。Issue #234 以前は category=13）が理想だが、公式サイト扱いや
  // 未設定で store.steampowered.com が登録されているケースも救済するため URL 部分一致で拾う
  // （タグ優先の 2 パス探索が必要な経路は fetch-igdb.ts の pickSteamUrlFromWebsites 側にある）
  const site = igdbWebsites.find((w) => w.url.includes('store.steampowered.com'));
  return site?.url ?? null;
}

/**
 * Steam URL から appId を抽出する
 */
function extractAppId(url: string): number | undefined {
  const m = url.match(/\/app\/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

export interface SteamResolverInput {
  title: string;
  titleJa?: string;
  igdbSlug?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number; type?: number }[];
  knownSteamAppId?: number;
}

export interface SteamResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * Steam Resolver — 3経路で Steam ストア URL を解決する
 */
export async function resolveSteam(input: SteamResolverInput): Promise<SteamResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  // 突合に使うタイトル群（英語 → 日本語 → igdbSlug の順で試みる）
  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
    ...(input.igdbSlug ? [input.igdbSlug.replace(/-/g, ' ')] : []),
  ].filter(Boolean);

  // ─── 経路1: knownSteamAppId ───────────────────────────────────────────────
  if (input.knownSteamAppId !== undefined) {
    const verified = await verifyAppIdByName(input.knownSteamAppId, queryTitles, input.releaseDate);
    if (verified.ok) {
      attempts.push({ method: 'known-appid', ok: true });
      return {
        link: {
          platform: 'steam',
          url: buildSteamUrl(input.knownSteamAppId),
          resolvedBy: 'cache',
          confidence: 'high',
        },
        attempts,
      };
    }
    attempts.push({
      method: 'known-appid',
      ok: false,
      reason: `appId=${input.knownSteamAppId}: ${verified.reason}`,
    });
  }

  // ─── 経路2: IGDB websites[type=13]（旧 category=13） ──────────────────────
  const igdbSteamUrl = extractSteamUrlFromIgdb(input.igdbWebsites);
  if (igdbSteamUrl) {
    const appId = extractAppId(igdbSteamUrl);
    if (appId !== undefined) {
      const verified = await verifyAppIdByName(appId, queryTitles, input.releaseDate);
      if (verified.ok) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'steam',
            url: buildSteamUrl(appId),
            resolvedBy: 'igdb-website',
            confidence: 'high',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: `appId=${appId}: ${verified.reason}` });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'could not extract appId' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no Steam URL in IGDB websites' });
  }

  // ─── 経路3: Steam Store Search API ────────────────────────────────────────
  const searchResult = await searchByTitle(queryTitles, input.releaseDate);
  if (searchResult.ok) {
    // storesearch のタイトル一致だけでは誤マッチがあるため appdetails で再確認する
    const appId = searchResult.value.appId;
    const verified = await verifyAppIdByName(appId, queryTitles, input.releaseDate);
    if (verified.ok) {
      attempts.push({ method: 'storesearch', ok: true });
      return {
        link: {
          platform: 'steam',
          url: buildSteamUrl(appId),
          resolvedBy: 'storesearch',
          confidence: 'high',
        },
        attempts,
      };
    }
    attempts.push({
      method: 'storesearch',
      ok: false,
      reason: `storesearch は appId=${appId}（"${searchResult.value.name}"）にヒットしたが検証で不採用: ${verified.reason}`,
    });
  } else {
    attempts.push({
      method: 'storesearch',
      ok: false,
      // apiFailure=true なら Steam API 側の障害。差し替えても解消しないシグナルとして残す
      reason: `${searchResult.apiFailure ? 'storesearch API 障害' : 'storesearch 不一致'}: ${searchResult.reason}`,
    });
  }

  return { link: null, attempts };
}
