/**
 * Nintendo Platform Resolver
 *
 * 2経路で Nintendo Switch eShop / 公式ゲーム紹介ページ URL を解決する:
 * 1. IGDB websites に nintendo.com / nintendo.co.jp 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:nintendo.co.jp → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage } from './tavily-search.js';

const NINTENDO_URL_PATTERNS = ['nintendo.com', 'nintendo.co.jp'];

function isNintendoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NINTENDO_URL_PATTERNS.some((p) => lower.includes(p));
}

export interface NintendoResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface NintendoResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * Nintendo Resolver — 2経路で Nintendo URL を解決する
 */
export async function resolveNintendo(input: NintendoResolverInput): Promise<NintendoResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // ─── 経路1: IGDB websites（nintendo.com / nintendo.co.jp 系） ─────────────
  if (input.igdbWebsites?.length) {
    const nintendoSite = input.igdbWebsites.find((w) => isNintendoUrl(w.url));
    if (nintendoSite) {
      const alive = await headOk(nintendoSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'nintendo',
            url: nintendoSite.url,
            resolvedBy: 'igdb-website',
            // HEAD のみでは名前確認できないため medium とする（PR-3 で name check 追加予定）
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no Nintendo URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → HEAD 200 検証 ───────────────────────────────────
  const candidates = await searchStorePage(queryTitles, 'site:nintendo.co.jp', isNintendoUrl);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const alive = await headOk(url, 8000);
      if (alive) {
        attempts.push({ method: 'web-search', ok: true });
        return {
          link: {
            platform: 'nintendo',
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
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Nintendo' });
  }

  return { link: null, attempts };
}
