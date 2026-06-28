/**
 * ストアリンク解決のロケール共通仕様（Issue #149）
 *
 * GameWire は日本向けサービスのため、全プラットフォームで
 * 「日本語サイトを優先し、無ければ英語サイトにフォールバックする」を共通仕様とする。
 *
 * 解決順序（4フェーズ）:
 *   A1. IGDB websites の「日本語ロケールのゲームページ」 → 検証 → 採用
 *   A2. 日本語スコープ検索（site:nintendo.co.jp / .../ja-jp 等） → 検証 → 採用
 *   B1. IGDB websites の「英語/その他ロケールのゲームページ」 → 検証 → 採用
 *   B2. 英語スコープ検索（site:nintendo.com / .../en-us 等） → 検証 → 採用
 *
 * 重要なのは B1（IGDB の外国語 URL）を A2（日本語サイト検索）より下位に置くこと。
 * これにより IGDB が米国版 URL しか持たないタイトルでも、日本語サイトが存在すれば
 * そちらを優先採用する。日本語サイトが無い場合のみ英語 URL にフォールバックする。
 *
 * このロケール順序を持つのは IGDB+Tavily 型のリゾルバ（Nintendo / PlayStation / Xbox）。
 * Steam / Google Play は base URL がロケール中立（閲覧時に自動で日本語化される）ため
 * URL を分岐させず中立のまま用いる。App Store は iTunes Search API の country で制御する。
 */

import type { StoreLink, StorePlatform } from '../types.js';
import { searchStorePage } from './tavily-search.js';

/** プラットフォーム解決の試行ログ1件 */
export type ResolveAttempt = { method: string; ok: boolean; reason?: string };

/** URL 候補の検証結果 */
export type VerifyOutcome =
  | { ok: true; confidence: StoreLink['confidence'] }
  | { ok: false; reason: string };

/**
 * URL が日本語ロケールのページかを判定する（全プラットフォーム共通ヒューリスティック）。
 * - nintendo.co.jp（日本専用ドメイン）
 * - store-jp.nintendo.com（任天堂 日本向けストア。.co.jp ではないため明示的に含める）
 * - パス /ja-jp/・/ja/・/jp/（PlayStation / Xbox / Apple など）
 */
const JA_LOCALE_PATTERNS = ['.co.jp', 'store-jp.', '/ja-jp', '/ja/', '/jp/'];

export function isJapaneseUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return JA_LOCALE_PATTERNS.some((p) => lower.includes(p));
}

export interface LocaleResolverInput {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
}

export interface LocaleResolverConfig {
  platform: StorePlatform;
  /** プラットフォームのドメイン判定（例: nintendo.com / nintendo.co.jp を含む） */
  isPlatformUrl: (url: string) => boolean;
  /** ゲームページ判定（IR/news などの非ゲームページを除外） */
  isGamePage: (url: string) => boolean;
  /** 日本語スコープ検索フィルタ（Tavily site:）例: 'site:nintendo.co.jp' */
  jaSearchScope: string;
  /** 英語スコープ検索フィルタ（Tavily site:）例: 'site:nintendo.com' */
  enSearchScope: string;
  /** IGDB websites 由来 URL の検証方法 */
  verifyIgdb: (url: string) => Promise<VerifyOutcome>;
  /** Tavily 検索由来 URL の検証方法 */
  verifySearch: (url: string) => Promise<VerifyOutcome>;
  /** プラットフォーム URL はあるがゲームページでない場合の理由表現 */
  notGamePageReason: string;
  /** プラットフォーム URL が IGDB websites に無い場合の理由表現 */
  noUrlReason: string;
}

export interface LocaleResolverResult {
  link: StoreLink | null;
  attempts: ResolveAttempt[];
}

/**
 * ロケール共通仕様（JP優先 → ENフォールバック）で StoreLink を解決する汎用エンジン。
 * Nintendo / PlayStation / Xbox の3リゾルバが共有する。
 */
export async function resolveByLocale(
  input: LocaleResolverInput,
  config: LocaleResolverConfig,
): Promise<LocaleResolverResult> {
  const attempts: ResolveAttempt[] = [];

  const queryTitles = [input.title, ...(input.titleJa ? [input.titleJa] : [])].filter(Boolean);

  // IGDB websites をゲームページに絞り、ロケールで分割する
  const platformUrls = (input.igdbWebsites ?? []).map((w) => w.url).filter(config.isPlatformUrl);
  const gamePages = platformUrls.filter(config.isGamePage);
  const igdbJa = gamePages.filter(isJapaneseUrl);
  const igdbEn = gamePages.filter((u) => !isJapaneseUrl(u));

  // search フェーズで再 GET しないよう、IGDB で試行済みの URL を記録する
  const triedUrls = new Set<string>();

  // IGDB websites にゲームページが無い場合の理由を一度だけ記録する
  if (gamePages.length === 0) {
    if (!input.igdbWebsites?.length) {
      attempts.push({ method: 'igdb-website', ok: false, reason: 'no IGDB websites provided' });
    } else if (platformUrls.length > 0) {
      attempts.push({ method: 'igdb-website', ok: false, reason: config.notGamePageReason });
    } else {
      attempts.push({ method: 'igdb-website', ok: false, reason: config.noUrlReason });
    }
  }

  const makeLink = (url: string, resolvedBy: StoreLink['resolvedBy'], confidence: StoreLink['confidence']): StoreLink => ({
    platform: config.platform,
    url,
    resolvedBy,
    confidence,
  });

  const tryIgdb = async (urls: string[]): Promise<StoreLink | null> => {
    for (const url of urls) {
      triedUrls.add(url);
      const outcome = await config.verifyIgdb(url);
      if (outcome.ok) {
        attempts.push({ method: 'igdb-website', ok: true });
        return makeLink(url, 'igdb-website', outcome.confidence);
      }
      attempts.push({ method: 'igdb-website', ok: false, reason: outcome.reason });
    }
    return null;
  };

  const trySearch = async (scope: string, localeLabel: 'ja' | 'en'): Promise<StoreLink | null> => {
    const raw = await searchStorePage(queryTitles, scope, config.isPlatformUrl);
    const candidates = raw.filter((u) => config.isGamePage(u) && !triedUrls.has(u));
    if (candidates.length === 0) {
      if (raw.length > 0) {
        attempts.push({ method: 'web-search', ok: false, reason: `${localeLabel}: Tavily results were all non-game pages` });
      } else {
        attempts.push({ method: 'web-search', ok: false, reason: `${localeLabel}: no Tavily results` });
      }
      return null;
    }
    for (const url of candidates) {
      triedUrls.add(url);
      const outcome = await config.verifySearch(url);
      if (outcome.ok) {
        attempts.push({ method: 'web-search', ok: true });
        return makeLink(url, 'web-search', outcome.confidence);
      }
      attempts.push({ method: 'web-search', ok: false, reason: outcome.reason });
    }
    return null;
  };

  // ─── Phase A: 日本語を探す ───────────────────────────────────────────────
  let link = await tryIgdb(igdbJa); // A1: IGDB 日本語ゲームページ
  if (link) return { link, attempts };
  link = await trySearch(config.jaSearchScope, 'ja'); // A2: 日本語スコープ検索
  if (link) return { link, attempts };

  // ─── Phase B: 英語にフォールバック ───────────────────────────────────────
  link = await tryIgdb(igdbEn); // B1: IGDB 英語/その他ゲームページ
  if (link) return { link, attempts };
  link = await trySearch(config.enSearchScope, 'en'); // B2: 英語スコープ検索
  if (link) return { link, attempts };

  return { link: null, attempts };
}
