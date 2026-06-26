/**
 * Xbox Platform Resolver
 *
 * 2経路で Xbox Store / 公式ページ URL を解決する:
 * 1. IGDB websites に xbox.com 系の URL が含まれる
 * 2. Tavily 検索 "{title}" site:xbox.com/ja-JP/games → HEAD 200 検証
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { searchStorePage, fetchAndExtractTitle, stripStoreSuffix } from './tavily-search.js';
import { matchesAnyTitle } from './match.js';

const XBOX_URL_PATTERNS = ['xbox.com', 'microsoft.com/ja-jp/p/', 'microsoft.com/en-us/p/'];

// xbox.com / microsoft.com 内でゲームページではないパス
const XBOX_NON_GAME_PATH_PATTERNS = ['/news/', '/press/', '/blog/', '/support/', '/legal/', '/corporate/', '/sitemap'];

function isXboxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return XBOX_URL_PATTERNS.some((p) => lower.includes(p));
}

function isXboxGamePage(url: string): boolean {
  if (!isXboxUrl(url)) return false;
  const lower = url.toLowerCase();
  return !XBOX_NON_GAME_PATH_PATTERNS.some((p) => lower.includes(p));
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
    const xboxSite = input.igdbWebsites.find((w) => isXboxUrl(w.url) && isXboxGamePage(w.url));
    if (!xboxSite) {
      const hasXboxUrl = input.igdbWebsites.some((w) => isXboxUrl(w.url));
      attempts.push({
        method: 'igdb-website',
        ok: false,
        reason: hasXboxUrl
          ? 'Xbox URL is not a game page (news/press/blog path)'
          : 'no Xbox URL in IGDB websites',
      });
    } else {
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
    }
  } else {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  }

  // ─── 経路2: Tavily 検索 → ゲームページ検証 → HEAD 200 + タイトル照合 ──────────
  // ja-JP を先に試み、ゲームページ候補が得られなければ en-US にフォールバックする。
  // ja-JP に結果があっても全件 non-game-page の場合は en-US も試みる。
  const jaJpRaw = await searchStorePage(queryTitles, 'site:xbox.com/ja-JP/games', isXboxUrl);
  const jaJpCandidates = jaJpRaw.filter(isXboxGamePage);
  const rawCandidates = jaJpCandidates.length > 0
    ? jaJpRaw
    : await searchStorePage(queryTitles, 'site:xbox.com/en-US/games', isXboxUrl);
  const candidates = jaJpCandidates.length > 0
    ? jaJpCandidates
    : rawCandidates.filter(isXboxGamePage);
  if (candidates.length > 0) {
    for (const url of candidates) {
      const { alive, title: rawTitle } = await fetchAndExtractTitle(url);
      if (!alive) {
        attempts.push({ method: 'web-search', ok: false, reason: `dead url: ${url}` });
        continue;
      }
      // サフィックス除去後に完全一致（シリーズ続編誤マッチ防止）
      const pageTitle = rawTitle !== null ? stripStoreSuffix(rawTitle) : null;
      if (pageTitle !== null && !matchesAnyTitle(queryTitles, pageTitle, input.releaseDate, undefined, true)) {
        attempts.push({ method: 'web-search', ok: false, reason: `title mismatch: page="${pageTitle}"` });
        continue;
      }
      attempts.push({ method: 'web-search', ok: true });
      return {
        link: {
          platform: 'xbox',
          url,
          resolvedBy: 'web-search',
          confidence: pageTitle !== null ? 'high' : 'medium',
        },
        attempts,
      };
    }
    attempts.push({ method: 'web-search', ok: false, reason: 'all game-page candidates failed or title mismatch' });
  } else if (rawCandidates.length > 0) {
    attempts.push({ method: 'web-search', ok: false, reason: 'Tavily results were all non-game pages (news/press/blog)' });
  } else {
    attempts.push({ method: 'web-search', ok: false, reason: 'no Tavily results for Xbox' });
  }

  return { link: null, attempts };
}
