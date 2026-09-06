/**
 * Google Play Platform Resolver
 *
 * Tavily 検索 "{title}" site:play.google.com → HEAD 200 検証
 * IGDB websites に play.google.com が含まれる場合は直接 HEAD 検証する。
 */

import type { StoreLink } from '../types.js';
import { checkUrlHealth } from '../url-health.js';
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
  igdbWebsites?: { url: string; category?: number; type?: number }[];
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
      // 単発 URL の生死を見る経路。warn は抑止するが理由は attempts[] に残す
      // （Issue #359 と同種の Bot ブロックが起きたとき痕跡が消えないように）
      const health = await checkUrlHealth(gpSite.url, 8000, { quiet: true });
      if (health.ok) {
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
      attempts.push({
        method: 'igdb-website',
        ok: false,
        reason: `到達性チェック失敗: ${health.reason ?? 'unknown'}`,
      });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no Google Play URL in IGDB websites' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → HEAD 200 検証 ───────────────────────────────────
  const candidates = await searchStorePage(queryTitles, 'site:play.google.com', isGooglePlayUrl);
  if (candidates.length > 0) {
    const candidateFailures: string[] = [];
    for (const url of candidates) {
      // 候補を順に試して落ちるのが正常な経路なので、失敗ログは抑止する。
      // ただし全滅した場合の理由は attempts[] に集約して残す
      const health = await checkUrlHealth(url, 8000, { quiet: true });
      if (health.ok) {
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
      candidateFailures.push(`${url} → ${health.reason ?? 'unknown'}`);
    }
    attempts.push({
      method: 'web-search',
      ok: false,
      reason: `全候補が到達性チェックで失敗: ${candidateFailures.join(', ')}`,
    });
  } else {
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Google Play' });
  }

  return { link: null, attempts };
}
