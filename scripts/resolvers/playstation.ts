/**
 * PlayStation Platform Resolver
 *
 * 2経路で PlayStation Store / 公式ページ URL を解決する:
 * 1. IGDB websites に playstation.com 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:playstation.com/ja-jp → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage } from './tavily-search.js';

const PLAYSTATION_URL_PATTERNS = ['playstation.com'];

function isPlayStationUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PLAYSTATION_URL_PATTERNS.some((p) => lower.includes(p));
}

export interface PlayStationResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface PlayStationResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * PlayStation Resolver — 2経路で PS URL を解決する
 */
export async function resolvePlayStation(input: PlayStationResolverInput): Promise<PlayStationResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // ─── 経路1: IGDB websites（playstation.com 系） ────────────────────────────
  if (input.igdbWebsites?.length) {
    const psSite = input.igdbWebsites.find((w) => isPlayStationUrl(w.url));
    if (psSite) {
      const alive = await headOk(psSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'playstation',
            url: psSite.url,
            resolvedBy: 'igdb-website',
            // HEAD のみでは名前確認できないため medium とする（PR-3 で name check 追加予定）
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no PlayStation URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → HEAD 200 検証 ───────────────────────────────────
  const candidates = await searchStorePage(queryTitles, 'site:playstation.com/ja-jp', isPlayStationUrl);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const alive = await headOk(url, 8000);
      if (alive) {
        attempts.push({ method: 'web-search', ok: true });
        return {
          link: {
            platform: 'playstation',
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
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for PlayStation' });
  }

  return { link: null, attempts };
}
