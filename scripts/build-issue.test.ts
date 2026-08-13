/**
 * build-issue ヘルパーのユニットテスト
 *
 * Issue #94: 不完全記事を hidden 扱いにする最終防衛線の判定ロジック。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isCriticallyIncompleteArticle,
  formatArticleForFrontmatter,
  collectFeatureEventHistoryEntries,
  collectHiddenArticleTitles,
} from './build-issue.js';
import type { GeneratedArticle } from './generate-articles.js';
import type { RecommendedGame, SourceUrls } from './types.js';

function makeArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    title: 'デフォルトタイトル',
    category: 'newRelease',
    summary: '',
    content: '',
    ...overrides,
  };
}

describe('isCriticallyIncompleteArticle', () => {
  it('coverImage / developer / publisher / releaseDate がすべて空ならクリティカル不完全', () => {
    const article = makeArticle({
      category: 'indie',
      game: {
        title: 'めっちゃカメレオン',
        genre: [],
        platforms: ['PC'],
      },
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(true);
  });

  it('coverImage があれば不完全ではない', () => {
    const article = makeArticle({
      category: 'indie',
      game: {
        title: 'X',
        genre: [],
        platforms: ['PC'],
        coverImage: 'https://example.com/cover.jpg',
      },
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(false);
  });

  it('releaseDate だけでも不完全ではない', () => {
    const article = makeArticle({
      category: 'indie',
      game: {
        title: 'X',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-06-09',
      },
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(false);
  });

  it('developer だけでも不完全ではない', () => {
    const article = makeArticle({
      category: 'indie',
      game: {
        title: 'X',
        genre: [],
        platforms: ['PC'],
        developer: 'Square Enix',
      },
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(false);
  });

  it('publisher だけでも不完全ではない', () => {
    const article = makeArticle({
      category: 'indie',
      game: {
        title: 'X',
        genre: [],
        platforms: ['PC'],
        publisher: 'Square Enix',
      },
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(false);
  });

  it('feature 記事（game フィールド無し）は対象外として false を返す', () => {
    const article = makeArticle({
      category: 'feature',
      game: undefined,
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(false);
  });

  it('newRelease で game フィールド自体が無いケースは不完全', () => {
    const article = makeArticle({
      category: 'newRelease',
      game: undefined,
    });
    expect(isCriticallyIncompleteArticle(article)).toBe(true);
  });
});

/**
 * Issue #247: recommendedGames[].officialUrl の出力ゲート。
 * article.sourceUrls.official（既存、258-274行目）と同じロジックを
 * recommendedGames にも適用し、Bluesky/Discord等の非公式URLが
 * 信頼済みソース判定・到達性チェックを経ずに出力される事故を防ぐ多層防御。
 */
describe('formatArticleForFrontmatter: recommendedGames の officialUrl ゲート', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeRecommendedGame(overrides: Partial<RecommendedGame> = {}): RecommendedGame {
    return {
      title: 'Slay the Spire II',
      officialUrl: 'https://www.megacrit.com/games/',
      ...overrides,
    };
  }

  it('officialUrlSource が由来不明（tavily でも igdb-official でもない）の場合、officialUrl を出力しない', async () => {
    // isUrlAlive が呼ばれても常に生存扱いになるようにしておき、
    // ソース判定そのものでスキップされていることを検証する（キャッシュ互換で残る旧値 'igdb-fallback' を想定）
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'feature',
      recommendedGames: [
        makeRecommendedGame({ officialUrlSource: 'igdb-fallback' as RecommendedGame['officialUrlSource'] }),
      ],
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).not.toContain('officialUrl: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が tavily でも、isUrlAlive が false を返す場合は officialUrl を出力しない', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const article = makeArticle({
      category: 'feature',
      recommendedGames: [makeRecommendedGame({ officialUrlSource: 'tavily' })],
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).not.toContain('officialUrl: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が tavily かつ isUrlAlive が true の場合、officialUrl を出力する（ポジティブコントロール）', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'feature',
      recommendedGames: [makeRecommendedGame({ officialUrlSource: 'tavily' })],
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).toContain('officialUrl: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が igdb-official かつ isUrlAlive が true の場合、officialUrl を出力する', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'feature',
      recommendedGames: [makeRecommendedGame({ officialUrlSource: 'igdb-official' })],
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).toContain('officialUrl: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が undefined の場合、isUrlAlive が true でも officialUrl を出力しない（source未定義も信頼できない扱いに厳格化。#247 code review 指摘#1対応）', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'feature',
      recommendedGames: [makeRecommendedGame({ officialUrlSource: undefined })],
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).not.toContain('officialUrl: "https://www.megacrit.com/games/"');
  });
});

/**
 * Issue #247 code review 指摘#3: resolveGatedOfficialUrl への切り出し後も、
 * article.sourceUrls.official 側の既存の後方互換の挙動（officialUrlSource未定義でも
 * 到達性チェックのみで通過する）が変わっていないことを担保する回帰テスト。
 */
describe('formatArticleForFrontmatter: sourceUrls.official の後方互換ゲート', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('officialUrlSource が undefined でも isUrlAlive が true なら official を出力する（キャッシュ互換）', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'newRelease',
      sourceUrls: {
        official: 'https://www.megacrit.com/games/',
      },
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).toContain('official: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が undefined でも isUrlAlive が false なら official を出力しない', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const article = makeArticle({
      category: 'newRelease',
      sourceUrls: {
        official: 'https://www.megacrit.com/games/',
      },
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).not.toContain('official: "https://www.megacrit.com/games/"');
  });

  it('officialUrlSource が信頼できないソース（igdb-fallback）の場合、isUrlAlive が true でも official を出力しない', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const article = makeArticle({
      category: 'newRelease',
      sourceUrls: {
        official: 'https://www.megacrit.com/games/',
        officialUrlSource: 'igdb-fallback' as SourceUrls['officialUrlSource'],
      },
    });

    const result = await formatArticleForFrontmatter(article);
    expect(result).not.toContain('official: "https://www.megacrit.com/games/"');
  });
});

/**
 * 特集がテーマとして使った記念日の履歴化（Issue #310 / PR-F）
 */
describe('collectFeatureEventHistoryEntries', () => {
  function featureArticle(featureEvent?: GeneratedArticle['featureEvent']): GeneratedArticle {
    return {
      title: '俳句の日特集：和の情緒を味わうゲーム',
      category: 'feature',
      summary: 'summary',
      content: 'content',
      featureEvent,
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('記念日名が同定できた特集記事を履歴エントリに変換する', () => {
    const entries = collectFeatureEventHistoryEntries(
      [featureArticle({ eventName: '俳句の日', source: 'backward', dayOffset: -3 })],
      20,
      '2026-08-22'
    );

    expect(entries).toEqual([
      { eventName: '俳句の日', issueNumber: 20, publishDate: '2026-08-22', source: 'backward' },
    ]);
  });

  it('記念日名が同定できなかった場合は履歴に残さない（誤った記念日で次号の除外を汚さない）', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const entries = collectFeatureEventHistoryEntries(
      [featureArticle({ source: 'backward', dayOffset: -3 })],
      20,
      '2026-08-22'
    );

    expect(entries).toEqual([]);
    // 同定できなくてもフォールバックの発火自体は出力に残す（§9.2-9）
    expect(
      logSpy.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes('[feature-event-fallback]')
      )
    ).toBe(true);
  });

  it('通常週（source=forward）ではフォールバックのログを出さない', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const entries = collectFeatureEventHistoryEntries(
      [featureArticle({ eventName: '山の日', source: 'forward', dayOffset: 3 })],
      20,
      '2026-08-08'
    );

    expect(entries).toHaveLength(1);
    expect(
      logSpy.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes('[feature-event-fallback]')
      )
    ).toBe(false);
  });

  it('featureEvent を持たない記事・特集以外の記事は無視する', () => {
    const nonFeature: GeneratedArticle = {
      title: '新作記事',
      category: 'newRelease',
      summary: 'summary',
      content: 'content',
      // 特集以外に featureEvent が付いていても記録しない
      featureEvent: { eventName: '混入した記念日', source: 'forward' },
    };

    const entries = collectFeatureEventHistoryEntries(
      [nonFeature, featureArticle(undefined)],
      20,
      '2026-08-22'
    );

    expect(entries).toEqual([]);
  });
});

describe('formatArticleForFrontmatter: featureEvent は公開 Markdown に出さない（Issue #310）', () => {
  it('featureEvent を持つ特集記事でも frontmatter に featureEvent が現れない', async () => {
    const article: GeneratedArticle = {
      title: '俳句の日特集',
      category: 'feature',
      summary: 'summary',
      content: 'content',
      featureEvent: { eventName: '俳句の日', source: 'backward', dayOffset: -3 },
    };

    const yaml = await formatArticleForFrontmatter(article);

    expect(yaml).not.toContain('featureEvent');
    // source / dayOffset のような内部値も漏れていないこと
    expect(yaml).not.toContain('backward');
    expect(yaml).not.toContain('dayOffset');
  });
});

describe('collectHiddenArticleTitles（Issue #311）', () => {
  /** hidden 判定を通る（＝メタデータが揃った）通常記事 */
  function completeArticle(title: string, category: GeneratedArticle['category']): GeneratedArticle {
    return {
      title,
      category,
      summary: '',
      content: '',
      game: {
        title: `${title} (game)`,
        genre: [],
        platforms: ['PC'],
        developer: 'Some Studio',
        coverImage: 'https://example.com/cover.jpg',
      },
    };
  }

  it('メタデータが揃った記事だけなら空集合', () => {
    const articles = [completeArticle('A', 'newRelease'), completeArticle('B', 'indie')];
    expect(collectHiddenArticleTitles(articles, new Set())).toEqual(new Set());
  });

  it('criticallyIncomplete な記事を hidden として拾う（Issue #94 の条件と一致させる）', () => {
    const incomplete: GeneratedArticle = {
      title: '不完全記事',
      category: 'indie',
      summary: '',
      content: '',
      game: { title: 'X', genre: [], platforms: [] },
    };
    const articles = [completeArticle('A', 'newRelease'), incomplete];
    expect(collectHiddenArticleTitles(articles, new Set())).toEqual(new Set(['不完全記事']));
  });

  it('game-source-mismatch の記事を hidden として拾う', () => {
    const articles = [completeArticle('A', 'newRelease'), completeArticle('混入記事', 'indie')];
    expect(collectHiddenArticleTitles(articles, new Set(['混入記事']))).toEqual(
      new Set(['混入記事'])
    );
  });

  it('両方の条件に該当しても集合なので1件にまとまる', () => {
    const incomplete: GeneratedArticle = {
      title: '両方該当',
      category: 'indie',
      summary: '',
      content: '',
      game: { title: 'X', genre: [], platforms: [] },
    };
    expect(collectHiddenArticleTitles([incomplete], new Set(['両方該当']))).toEqual(
      new Set(['両方該当'])
    );
  });

  it('mismatch 集合に号内に存在しないタイトルが入っていても集合には含めない', () => {
    const articles = [completeArticle('A', 'newRelease')];
    expect(collectHiddenArticleTitles(articles, new Set(['別の号の記事']))).toEqual(new Set());
  });
});
