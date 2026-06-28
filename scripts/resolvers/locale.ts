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
import { headOk } from '../url-health.js';
import { searchStorePage, fetchAndExtractTitle, stripStoreSuffix } from './tavily-search.js';
import { matchesAnyTitle } from './match.js';

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

/**
 * IGDB 由来 URL を HEAD のみで死活確認する verifier ファクトリ。
 * 名前確認ができないため confidence は medium 固定。
 * PlayStation / Xbox が共有する（IGDB の website は HEAD でしか検証できない）。
 */
export function makeHeadVerifier(timeoutMs = 8000): (url: string) => Promise<VerifyOutcome> {
  return async (url: string) => {
    const alive = await headOk(url, timeoutMs);
    return alive ? { ok: true, confidence: 'medium' } : { ok: false, reason: 'HEAD check failed' };
  };
}

/**
 * web-search 由来 URL を GET でタイトル取得して照合する verifier ファクトリ（寛容版）。
 * - タイトル取得失敗（null）は false negative を許容し medium で採用する
 * - タイトルが取得できた場合は完全一致を要求し、一致時 high・不一致時は却下
 * PlayStation / Xbox が共有する。Nintendo は null を却下する厳格版を独自に持つ。
 */
export function makeLenientTitleVerifier(input: LocaleResolverInput): (url: string) => Promise<VerifyOutcome> {
  const queryTitles = [input.title, ...(input.titleJa ? [input.titleJa] : [])].filter(Boolean);
  return async (url: string) => {
    const { alive, title: rawTitle } = await fetchAndExtractTitle(url);
    if (!alive) return { ok: false, reason: `dead url: ${url}` };
    const pageTitle = rawTitle !== null ? stripStoreSuffix(rawTitle) : null;
    if (pageTitle !== null && !matchesAnyTitle(queryTitles, pageTitle, input.releaseDate, undefined, true)) {
      return { ok: false, reason: `title mismatch: page="${pageTitle}"` };
    }
    return { ok: true, confidence: pageTitle !== null ? 'high' : 'medium' };
  };
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

  // requireJapanese=true（jaフェーズ）のとき、Tavily が site: スコープを無視して
  // 英語 URL を返しても isJapaneseUrl で弾く（JP優先の保証）。
  // candidateCount は「ロケール条件を満たすゲームページ候補が何件あったか」。
  const trySearch = async (
    scope: string,
    localeLabel: 'ja' | 'en',
    requireJapanese: boolean,
  ): Promise<{ link: StoreLink | null; candidateCount: number }> => {
    const raw = await searchStorePage(queryTitles, scope, config.isPlatformUrl);
    const candidates = raw.filter(
      (u) => config.isGamePage(u) && !triedUrls.has(u) && (!requireJapanese || isJapaneseUrl(u)),
    );
    if (candidates.length === 0) {
      if (raw.length > 0) {
        attempts.push({ method: 'web-search', ok: false, reason: `${localeLabel}: Tavily results were all non-game pages` });
      } else {
        attempts.push({ method: 'web-search', ok: false, reason: `${localeLabel}: no Tavily results` });
      }
      return { link: null, candidateCount: 0 };
    }
    for (const url of candidates) {
      triedUrls.add(url);
      const outcome = await config.verifySearch(url);
      if (outcome.ok) {
        attempts.push({ method: 'web-search', ok: true });
        return { link: makeLink(url, 'web-search', outcome.confidence), candidateCount: candidates.length };
      }
      attempts.push({ method: 'web-search', ok: false, reason: outcome.reason });
    }
    return { link: null, candidateCount: candidates.length };
  };

  // ─── Phase A: 日本語を探す ───────────────────────────────────────────────
  let link = await tryIgdb(igdbJa); // A1: IGDB 日本語ゲームページ
  if (link) return { link, attempts };
  const jaSearch = await trySearch(config.jaSearchScope, 'ja', true); // A2: 日本語スコープ検索
  if (jaSearch.link) return { link: jaSearch.link, attempts };

  // ─── Phase B: 英語にフォールバック ───────────────────────────────────────
  link = await tryIgdb(igdbEn); // B1: IGDB 英語/その他ゲームページ
  if (link) return { link, attempts };
  // B2: 英語スコープ検索。日本語検索でゲームページ候補が見つかった場合はスキップして
  // 余計な Tavily 呼び出し（レート制限・コスト）を抑える。候補 0 件＝日本語ページが
  // 存在しないと判断できる場合のみ英語サイトを探しに行く＝「日本語が無ければ英語」を保証する。
  if (jaSearch.candidateCount === 0) {
    const enSearch = await trySearch(config.enSearchScope, 'en', false);
    if (enSearch.link) return { link: enSearch.link, attempts };
  } else {
    attempts.push({ method: 'web-search', ok: false, reason: 'en: skipped (Japanese page candidates exist)' });
  }
  if (link) return { link, attempts };

  return { link: null, attempts };
}
