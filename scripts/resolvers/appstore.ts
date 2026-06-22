/**
 * App Store (iOS) Platform Resolver
 *
 * iTunes Search API（無料・認証不要）でアプリを検索し、名前突合で確信度を決める。
 * IGDB websites に apps.apple.com が含まれる場合は直接 HEAD 検証する。
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { matchesAnyTitle } from './match.js';

const APPSTORE_URL_PATTERNS = ['apps.apple.com', 'itunes.apple.com'];

function isAppStoreUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return APPSTORE_URL_PATTERNS.some((p) => lower.includes(p));
}

interface ItunesSearchResult {
  resultCount: number;
  results: {
    trackName?: string;
    trackViewUrl?: string;
    releaseDate?: string;
    kind?: string;
  }[];
}

export interface AppStoreResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface AppStoreResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * App Store Resolver — iTunes Search API で iOS アプリ URL を解決する
 */
export async function resolveAppStore(input: AppStoreResolverInput): Promise<AppStoreResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // ─── 経路1: IGDB websites（apps.apple.com 系） ──────────────────────────────
  if (input.igdbWebsites?.length) {
    const appStoreSite = input.igdbWebsites.find((w) => isAppStoreUrl(w.url));
    if (appStoreSite) {
      const alive = await headOk(appStoreSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'appstore',
            url: appStoreSite.url,
            resolvedBy: 'igdb-website',
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no App Store URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: iTunes Search API ──────────────────────────────────────────────
  for (const queryTitle of queryTitles) {
    let json: ItunesSearchResult;
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(queryTitle)}&media=software&limit=10&country=jp`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      json = (await res.json()) as ItunesSearchResult;
    } catch {
      continue;
    }

    if (!json?.results?.length) continue;

    for (const item of json.results) {
      if (!item.trackName || !item.trackViewUrl) continue;
      // kind=software のみ対象（music/movie を除外）
      if (item.kind && item.kind !== 'software') continue;

      if (matchesAnyTitle(queryTitles, item.trackName, input.releaseDate, item.releaseDate)) {
        attempts.push({ method: 'itunes-search', ok: true });
        return {
          link: {
            platform: 'appstore',
            url: item.trackViewUrl,
            resolvedBy: 'storesearch',
            confidence: 'high',
          },
          attempts,
        };
      }
    }
  }

  attempts.push({ method: 'itunes-search', ok: false, reason: 'no matching result in iTunes Search' });

  return { link: null, attempts };
}
