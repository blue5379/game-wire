/**
 * Xbox Platform Resolver
 *
 * ロケール共通仕様（Issue #149）に従い、日本語サイト優先で Xbox Store /
 * 公式ページ URL を解決する。順序は scripts/resolvers/locale.ts を参照:
 *   A1. IGDB websites の日本語ゲームページ（xbox.com/ja-JP・microsoft.com/ja-jp 等）
 *   A2. Tavily 検索 site:xbox.com/ja-JP/games
 *   B1. IGDB websites の英語ゲームページ（xbox.com/en-US 等）
 *   B2. Tavily 検索 site:xbox.com/en-US/games
 */

import type { StoreLink } from '../types.js';
import { resolveByLocale, makeHeadVerifier, makeLenientTitleVerifier, type LocaleResolverInput } from './locale.js';

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

export interface XboxResolverInput extends LocaleResolverInput {}

export interface XboxResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * Xbox Resolver — 日本語優先で Xbox URL を解決する
 */
export async function resolveXbox(input: XboxResolverInput): Promise<XboxResolverResult> {
  return resolveByLocale(input, {
    platform: 'xbox',
    isPlatformUrl: isXboxUrl,
    isGamePage: isXboxGamePage,
    jaSearchScope: 'site:xbox.com/ja-JP/games',
    enSearchScope: 'site:xbox.com/en-US/games',
    // IGDB 経路は HEAD のみで名前確認できないため medium
    verifyIgdb: makeHeadVerifier(),
    verifySearch: makeLenientTitleVerifier(input),
    notGamePageReason: 'Xbox URL is not a game page (news/press/blog path)',
    noUrlReason: 'no Xbox URL in IGDB websites',
  });
}
