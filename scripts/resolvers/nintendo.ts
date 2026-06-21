/**
 * Nintendo Platform Resolver
 *
 * 2経路で Nintendo Switch eShop / 公式ゲーム紹介ページ URL を解決する:
 * 1. IGDB websites に nintendo.com 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:nintendo.com/jp → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';

const NINTENDO_URL_PATTERNS = ['nintendo.com', 'nintendo.co.jp'];

function isNintendoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NINTENDO_URL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * URL の HEAD リクエストで 200 系ステータスかを検証する
 */
async function headCheck(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/**
 * Tavily で Nintendo 公式ページ候補を取得する
 * 環境変数 TAVILY_API_KEY が未設定の場合は空配列を返す
 */
async function searchWithTavily(queryTitles: string[]): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const { tavily } = await import('@tavily/core');
  const client = tavily({ apiKey });

  const query = `"${queryTitles[0]}" site:nintendo.com/jp`;
  try {
    const response = await client.search(query, {
      maxResults: 5,
      searchDepth: 'basic',
      topic: 'general',
    });
    return response.results
      .map((r) => r.url)
      .filter((url) => isNintendoUrl(url));
  } catch {
    return [];
  }
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

  // ─── 経路1: IGDB websites（nintendo.com 系） ──────────────────────────────
  if (input.igdbWebsites?.length) {
    const nintendoSite = input.igdbWebsites.find((w) => isNintendoUrl(w.url));
    if (nintendoSite) {
      const alive = await headCheck(nintendoSite.url);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'nintendo',
            url: nintendoSite.url,
            resolvedBy: 'igdb-website',
            confidence: 'high',
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
  const candidates = await searchWithTavily(queryTitles);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const alive = await headCheck(url);
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
