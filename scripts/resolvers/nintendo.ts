/**
 * Nintendo Platform Resolver
 *
 * ロケール共通仕様（Issue #149）に従い、日本語サイト優先で Nintendo Switch eShop /
 * 公式ゲーム紹介ページ URL を解決する。順序は scripts/resolvers/locale.ts を参照:
 *   A1. IGDB websites の日本語ゲームページ（nintendo.co.jp 等）
 *   A2. Tavily 検索 site:nintendo.co.jp
 *   B1. IGDB websites の英語ゲームページ（nintendo.com 等）
 *   B2. Tavily 検索 site:nintendo.com
 */

import type { StoreLink } from '../types.js';
import { fetchAndExtractTitle, stripStoreSuffix } from './tavily-search.js';
import { matchesAnyTitle } from '../game-identity.js';
import { resolveByLocale, type LocaleResolverInput, type VerifyOutcome } from './locale.js';

const NINTENDO_URL_PATTERNS = ['nintendo.com', 'nintendo.co.jp'];

// nintendo 内でゲームページではないパス
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

export interface NintendoResolverInput extends LocaleResolverInput {}

export interface NintendoResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * GET でページタイトルを取り、サフィックス除去後に完全一致するか検証する。
 * タイトル取得失敗（null）は却下する（IGDB 経路・web-search 経路で共通）。
 */
function makeTitleVerifier(input: NintendoResolverInput) {
  const queryTitles = [input.title, ...(input.titleJa ? [input.titleJa] : [])].filter(Boolean);
  return async (url: string): Promise<VerifyOutcome> => {
    const { alive, title: rawTitle } = await fetchAndExtractTitle(url);
    if (!alive) return { ok: false, reason: `GET check failed: ${url}` };
    const pageTitle = rawTitle !== null ? stripStoreSuffix(rawTitle) : null;
    if (pageTitle === null) return { ok: false, reason: 'title extraction failed' };
    if (!matchesAnyTitle(queryTitles, pageTitle, input.releaseDate, undefined, true)) {
      return { ok: false, reason: `title mismatch: page="${pageTitle}"` };
    }
    return { ok: true, confidence: 'high' };
  };
}

/**
 * Nintendo Resolver — 日本語優先で Nintendo URL を解決する
 */
export async function resolveNintendo(input: NintendoResolverInput): Promise<NintendoResolverResult> {
  const verify = makeTitleVerifier(input);
  return resolveByLocale(input, {
    platform: 'nintendo',
    isPlatformUrl: isNintendoUrl,
    isGamePage: isNintendoGamePage,
    jaSearchScope: 'site:nintendo.co.jp',
    enSearchScope: 'site:nintendo.com',
    verifyIgdb: verify,
    verifySearch: verify,
    notGamePageReason: 'Nintendo URL is not a game page (IR/news/press/pdf path)',
    noUrlReason: 'no Nintendo URL in IGDB websites',
  });
}
