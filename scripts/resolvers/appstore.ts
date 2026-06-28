/**
 * App Store (iOS) Platform Resolver
 *
 * ロケール共通仕様（Issue #149）に従い、日本語サイト優先でアプリ URL を解決する:
 *   A1. IGDB websites の日本語 URL（apps.apple.com/jp/...） → HEAD 検証
 *   A2. iTunes Search API country=jp → 名前突合
 *   B1. IGDB websites の英語/その他 URL（apps.apple.com/us/...） → HEAD 検証
 *
 * App Store の URL は ./jp/ ./us/ でロケールを表すが数値 ID は共通。日本語ストアページが
 * 取得できれば優先し、無ければ IGDB の外国語 URL にフォールバックする。
 */

import type { StoreLink } from '../types.js';
import { headOk } from '../url-health.js';
import { matchesAnyTitle } from './match.js';
import { isJapaneseUrl } from './locale.js';

const APPSTORE_URL_PATTERNS = ['apps.apple.com', 'itunes.apple.com'];

function isAppStoreUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return APPSTORE_URL_PATTERNS.some((p) => lower.includes(p));
}

interface ItunesSearchResult {
  resultCount: number;
  results: {
    trackName?: string;
    trackViewUrl?: string;
    releaseDate?: string;
    kind?: string;
  }[];
}

export interface AppStoreResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface AppStoreResolverResult {
  link: StoreLink | null;
  attempts: { method: string; ok: boolean; reason?: string }[];
}

/**
 * App Store Resolver — iTunes Search API で iOS アプリ URL を解決する
 */
export async function resolveAppStore(input: AppStoreResolverInput): Promise<AppStoreResolverResult> {
  const attempts: { method: string; ok: boolean; reason?: string }[] = [];

  const queryTitles = [
    input.title,
    ...(input.titleJa ? [input.titleJa] : []),
  ].filter(Boolean);

  // IGDB websites の App Store URL を日本語/その他ロケールに分割する
  const appStoreUrls = (input.igdbWebsites ?? []).map((w) => w.url).filter(isAppStoreUrl);
  const igdbJaUrl = appStoreUrls.find(isJapaneseUrl);
  const igdbEnUrl = appStoreUrls.find((u) => !isJapaneseUrl(u));

  const verifyIgdbUrl = async (url: string): Promise<StoreLink | null> => {
    const alive = await headOk(url, 8000);
    if (alive) {
      attempts.push({ method: 'igdb-website', ok: true });
      return { platform: 'appstore', url, resolvedBy: 'igdb-website', confidence: 'medium' };
    }
    attempts.push({ method: 'igdb-website', ok: false, reason: 'HEAD check failed' });
    return null;
  };

  if (!input.igdbWebsites?.length) {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
  } else if (appStoreUrls.length === 0) {
    attempts.push({ method: 'igdb-website', ok: false, reason: 'no App Store URL in IGDB websites' });
  }

  // ─── A1: IGDB websites の日本語 URL ────────────────────────────────────────
  if (igdbJaUrl) {
    const link = await verifyIgdbUrl(igdbJaUrl);
    if (link) return { link, attempts };
  }

  // ─── A2: iTunes Search API（country=jp） ───────────────────────────────────
  for (const queryTitle of queryTitles) {
    let json: ItunesSearchResult;
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(queryTitle)}&media=software&limit=10&country=jp`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      json = (await res.json()) as ItunesSearchResult;
    } catch {
      continue;
    }

    if (!json?.results?.length) continue;

    for (const item of json.results) {
      if (!item.trackName || !item.trackViewUrl) continue;
      // kind=software のみ対象（music/movie を除外）
      if (item.kind && item.kind !== 'software') continue;

      if (matchesAnyTitle(queryTitles, item.trackName, input.releaseDate, item.releaseDate)) {
        attempts.push({ method: 'itunes-search', ok: true });
        return {
          link: {
            platform: 'appstore',
            url: item.trackViewUrl,
            resolvedBy: 'storesearch',
            confidence: 'high',
          },
          attempts,
        };
      }
    }
  }

  attempts.push({ method: 'itunes-search', ok: false, reason: 'no matching result in iTunes Search' });

  // ─── B1: IGDB websites の英語/その他ロケール URL（日本語が取得できなかった場合） ──
  if (igdbEnUrl) {
    const link = await verifyIgdbUrl(igdbEnUrl);
    if (link) return { link, attempts };
  }

  return { link: null, attempts };
}
