/**
 * Nintendo Platform Resolver
 *
 * 2経路で Nintendo Switch eShop / 公式ゲーム紹介ページ URL を解決する:
 * 1. IGDB websites に nintendo.com / nintendo.co.jp 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:nintendo.co.jp → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage, extractPageTitle } from './tavily-search.js';
import { matchesAnyTitle } from './match.js';

const NINTENDO_URL_PATTERNS = ['nintendo.com', 'nintendo.co.jp'];

// nintendo.co.jp 内でゲームページではないパス
const NINTENDO_NON_GAME_PATH_PATTERNS = ['/ir/', '/news/', '/press/', '/pdf/', '/csr/', '/investors/', '/corporate/'];

function isNintendoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NINTENDO_URL_PATTERNS.some((p) => lower.includes(p));
}

function isNintendoGamePage(url: string): boolean {
  if (!isNintendoUrl(url)) return false;
  const lower = url.toLowerCase();
  return !NINTENDO_NON_GAME_PATH_PATTERNS.some((p) => lower.includes(p));
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
    const nintendoSite = input.igdbWebsites.find((w) => isNintendoUrl(w.url) && isNintendoGamePage(w.url));
    if (!nintendoSite) {
      const hasNintendoUrl = input.igdbWebsites.some((w) => isNintendoUrl(w.url));
      attempts.push({
        method: 'igdb-website',
        ok: false,
        reason: hasNintendoUrl
          ? 'Nintendo URL is not a game page (IR/news/press/pdf path)'
          : 'no Nintendo URL in IGDB websites',
      });
    } else {
      const alive = await headOk(nintendoSite.url, 8000);
      if (alive) {
        attempts.push({ method: 'igdb-website', ok: true });
        return {
          link: {
            platform: 'nintendo',
            url: nintendoSite.url,
            resolvedBy: 'igdb-website',
            // HEAD のみでは名前確認できないため medium とする（将来的に name check を追加予定）
            confidence: 'medium',
          },
          attempts,
        };
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → ゲームページ検証 → HEAD 200 + タイトル照合 ──────────
  const candidates = await searchStorePage(queryTitles, 'site:nintendo.co.jp', isNintendoUrl);
  const gamePageCandidates = candidates.filter(isNintendoGamePage);
  if (gamePageCandidates.length > 0) {
    for (const url of gamePageCandidates) {
      const alive = await headOk(url, 8000);
      if (!alive) continue;
      // タイトル照合（取得失敗は uncertain として採用しない）
      const pageTitle = await extractPageTitle(url);
      if (pageTitle !== null && !matchesAnyTitle(queryTitles, pageTitle, input.releaseDate)) {
        attempts.push({ method: 'web-search', ok: false, reason: `title mismatch: page="${pageTitle}"` });
        continue;
      }
      attempts.push({ method: 'web-search', ok: true });
      return {
        link: {
          platform: 'nintendo',
          url,
          resolvedBy: 'web-search',
          confidence: pageTitle !== null ? 'high' : 'medium',
        },
        attempts,
      };
    }
    attempts.push({ method: 'web-search', ok: false, reason: 'all game-page candidates failed HEAD check or title mismatch' });
  } else if (candidates.length > 0) {
    attempts.push({ method: 'web-search', ok: false, reason: 'Tavily results were all non-game pages (IR/news/press/pdf)' });
  } else {
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Nintendo' });
  }

  return { link: null, attempts };
}
