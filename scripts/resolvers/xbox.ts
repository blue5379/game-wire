/**
 * Xbox Platform Resolver
 *
 * 2経路で Xbox Store / 公式ページ URL を解決する:
 * 1. IGDB websites に xbox.com 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:xbox.com/ja-JP/games → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage } from './tavily-search.js';

const XBOX_URL_PATTERNS = ['xbox.com', 'microsoft.com/ja-jp/p/', 'microsoft.com/en-us/p/'];

function isXboxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return XBOX_URL_PATTERNS.some((p) => lower.includes(p));
}

export interface XboxResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface XboxResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * Xbox Resolver — 2経路で Xbox URL を解決する
 */
export async function resolveXbox(input: XboxResolverInput): Promise<XboxResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // ─── 経路1: IGDB websites（xbox.com 系） ────────────────────────────────────
  if (input.igdbWebsites?.length) {
    const xboxSite = input.igdbWebsites.find((w) => isXboxUrl(w.url));
    if (xboxSite) {
      const alive = await headOk(xboxSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'xbox',
            url: xboxSite.url,
            resolvedBy: 'igdb-website',
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no Xbox URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → HEAD 200 検証 ───────────────────────────────────
  // ja-JP と en-US の両スコープを試みる（ja-JP ページがない Western タイトルを救済）
  const jaJpCandidates = await searchStorePage(queryTitles, 'site:xbox.com/ja-JP/games', isXboxUrl);
  const candidates = jaJpCandidates.length > 0
    ? jaJpCandidates
    : await searchStorePage(queryTitles, 'site:xbox.com/en-US/games', isXboxUrl);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const alive = await headOk(url, 8000);
      if (alive) {
        attempts.push({ method: 'web-search', ok: true });
        return {
          link: {
            platform: 'xbox',
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
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Xbox' });
  }

  return { link: null, attempts };
}
