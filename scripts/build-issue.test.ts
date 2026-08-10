/**
 * build-issue ヘルパーのユニットテスト
 *
 * Issue #94: 不完全記事を hidden 扱いにする最終防衛線の判定ロジック。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isCriticallyIncompleteArticle, formatArticleForFrontmatter } from './build-issue.js';
import type { GeneratedArticle } from './generate-articles.js';
import type { RecommendedGame } from './types.js';

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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
});
