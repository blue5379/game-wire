/**
 * Google Play Platform Resolver
 *
 * Tavily 検索 "{title}" site:play.google.com → HEAD 200 検証
 * IGDB websites に play.google.com が含まれる場合は直接 HEAD 検証する。
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage } from './tavily-search.js';

const GOOGLEPLAY_URL_PATTERNS = ['play.google.com'];

function isGooglePlayUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return GOOGLEPLAY_URL_PATTERNS.some((p) => lower.includes(p));
}

export interface GooglePlayResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface GooglePlayResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * Google Play Resolver — 2経路で Google Play URL を解決する
 */
export async function resolveGooglePlay(input: GooglePlayResolverInput): Promise<GooglePlayResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // ─── 経路1: IGDB websites（play.google.com 系） ────────────────────────────
  if (input.igdbWebsites?.length) {
    const gpSite = input.igdbWebsites.find((w) => isGooglePlayUrl(w.url));
    if (gpSite) {
      const alive = await headOk(gpSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'googleplay',
            url: gpSite.url,
            resolvedBy: 'igdb-website',
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no Google Play URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → HEAD 200 検証 ───────────────────────────────────
  const candidates = await searchStorePage(queryTitles, 'site:play.google.com', isGooglePlayUrl);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const alive = await headOk(url, 8000);
      if (alive) {
        attempts.push({ method: 'web-search', ok: true });
        return {
          link: {
            platform: 'googleplay',
            url,
            resolvedBy: 'web-search',
            confidence: 'medium',
          },
          attempts,
        };
      }
    }
    attempts.push({ method: 'web-search', ok: false, reason: 'all candidates failed HEAD check' });
  } else {
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Google Play' });
  }

  return { link: null, attempts };
}
