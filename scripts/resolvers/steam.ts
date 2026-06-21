/**
 * Steam Platform Resolver
 *
 * 3経路で Steam ストア URL を解決する:
 * 1. knownSteamAppId が既知 → 直接 URL を構築（appdetails で名前検証）
 * 2. IGDB websites[category=13] に Steam URL が含まれる
 * 3. Steam Store Search API（storesearch）で title / titleJa / igdbSlug を検索
 */

import type { StoreLink } from '../types.js';
import { matchesAnyTitle } from './match.js';

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
 * Steam Store Search API でタイトルを検索し、最も一致度の高い appId を返す
 */
async function searchByTitle(
  queryTitles: string[],
  releaseDate?: string
): Promise<{ appId: number; name: string } | null> {
  // 最初に英語タイトルで検索し、なければ日本語タイトルでリトライ
  for (const queryTitle of queryTitles) {
    let json: SteamSearchResponse;
    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(queryTitle)}&l=english&cc=US`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      json = (await res.json()) as SteamSearchResponse;
    } catch {
      continue;
    }

    if (!json?.items?.length) continue;

    for (const item of json.items) {
      if (matchesAnyTitle(queryTitles, item.name, releaseDate, item.release?.steam_release_date)) {
        return { appId: item.id, name: item.name };
      }
    }
  }

  return null;
}

/**
 * appId から Steam ストア URL を構築する
 */
export function buildSteamUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}/`;
}

/**
 * Steam appdetails API でアプリ名を取得して名前一致を検証する
 * 存在しない appId は null を返す
 */
async function verifyAppIdByName(
  appId: number,
  queryTitles: string[],
  releaseDate?: string
): Promise<{ name: string; date?: string } | null> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { success?: boolean; data?: SteamAppDetailsData }>;
    const entry = json[String(appId)];
    if (!entry?.success || !entry.data?.name) return null;
    const appName = entry.data.name;
    const appDate = entry.data.release_date?.date;
    if (!matchesAnyTitle(queryTitles, appName, releaseDate, appDate)) return null;
    return { name: appName, date: appDate };
  } catch {
    return null;
  }
}

/**
 * IGDB websites から Steam URL (category=13) を抽出する
 */
function extractSteamUrlFromIgdb(
  igdbWebsites?: { url: string; category?: number }[]
): string | null {
  if (!igdbWebsites) return null;
  const site = igdbWebsites.find(
    (w) => w.category === 13 && w.url.includes('store.steampowered.com')
  );
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
  igdbWebsites?: { url: string; category?: number }[];
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
    if (verified) {
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
    attempts.push({ method: 'known-appid', ok: false, reason: 'name mismatch or appdetails failed' });
  }

  // ─── 経路2: IGDB websites[category=13] ────────────────────────────────────
  const igdbSteamUrl = extractSteamUrlFromIgdb(input.igdbWebsites);
  if (igdbSteamUrl) {
    const appId = extractAppId(igdbSteamUrl);
    if (appId !== undefined) {
      const verified = await verifyAppIdByName(appId, queryTitles, input.releaseDate);
      if (verified) {
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
      attempts.push({ method: 'igdb-website', ok: false, reason: 'name mismatch' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'could not extract appId' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no Steam URL in IGDB websites' });
  }

  // ─── 経路3: Steam Store Search API ────────────────────────────────────────
  const searchResult = await searchByTitle(queryTitles, input.releaseDate);
  if (searchResult) {
    attempts.push({ method: 'storesearch', ok: true });
    return {
      link: {
        platform: 'steam',
        url: buildSteamUrl(searchResult.appId),
        resolvedBy: 'storesearch',
        confidence: 'high',
      },
      attempts,
    };
  }
  attempts.push({ method: 'storesearch', ok: false, reason: 'no matching result in storesearch' });

  return { link: null, attempts };
}
