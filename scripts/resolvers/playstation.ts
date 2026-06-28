/**
 * PlayStation Platform Resolver
 *
 * ロケール共通仕様（Issue #149）に従い、日本語サイト優先で PlayStation Store /
 * 公式ページ URL を解決する。順序は scripts/resolvers/locale.ts を参照:
 *   A1. IGDB websites の日本語ゲームページ（playstation.com/ja-jp 等）
 *   A2. Tavily 検索 site:playstation.com/ja-jp
 *   B1. IGDB websites の英語ゲームページ（playstation.com/en-us 等）
 *   B2. Tavily 検索 site:playstation.com/en-us
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { fetchAndExtractTitle, stripStoreSuffix } from './tavily-search.js';
import { matchesAnyTitle } from './match.js';
import { resolveByLocale, type LocaleResolverInput, type VerifyOutcome } from './locale.js';

const PLAYSTATION_URL_PATTERNS = ['playstation.com'];

// playstation.com 内でゲームページではないパス
const PLAYSTATION_NON_GAME_PATH_PATTERNS = ['/news/', '/press/', '/blog/', '/corporate/', '/support/', '/legal/', '/sitemap'];

function isPlayStationUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PLAYSTATION_URL_PATTERNS.some((p) => lower.includes(p));
}

function isPlayStationGamePage(url: string): boolean {
  if (!isPlayStationUrl(url)) return false;
  const lower = url.toLowerCase();
  return !PLAYSTATION_NON_GAME_PATH_PATTERNS.some((p) => lower.includes(p));
}

export interface PlayStationResolverInput extends LocaleResolverInput {}

export interface PlayStationResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * PlayStation Resolver — 日本語優先で PS URL を解決する
 */
export async function resolvePlayStation(input: PlayStationResolverInput): Promise<PlayStationResolverResult> {
  const queryTitles = [input.title, ...(input.titleJa ? [input.titleJa] : [])].filter(Boolean);

  // IGDB 経路: HEAD のみで名前確認できないため medium（将来的に name check を追加予定）
  const verifyIgdb = async (url: string): Promise<VerifyOutcome> => {
    const alive = await headOk(url, 8000);
    return alive ? { ok: true, confidence: 'medium' } : { ok: false, reason: 'HEAD check failed' };
  };

  // web-search 経路: GET でタイトル取得し照合する（取得失敗は false negative を許容し medium 採用）
  const verifySearch = async (url: string): Promise<VerifyOutcome> => {
    const { alive, title: rawTitle } = await fetchAndExtractTitle(url);
    if (!alive) return { ok: false, reason: `dead url: ${url}` };
    const pageTitle = rawTitle !== null ? stripStoreSuffix(rawTitle) : null;
    if (pageTitle !== null && !matchesAnyTitle(queryTitles, pageTitle, input.releaseDate, undefined, true)) {
      return { ok: false, reason: `title mismatch: page="${pageTitle}"` };
    }
    return { ok: true, confidence: pageTitle !== null ? 'high' : 'medium' };
  };

  return resolveByLocale(input, {
    platform: 'playstation',
    isPlatformUrl: isPlayStationUrl,
    isGamePage: isPlayStationGamePage,
    jaSearchScope: 'site:playstation.com/ja-jp',
    enSearchScope: 'site:playstation.com/en-us',
    verifyIgdb,
    verifySearch,
    notGamePageReason: 'PlayStation URL is not a game page (news/press/blog path)',
    noUrlReason: 'no PlayStation URL in IGDB websites',
  });
}
