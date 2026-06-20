/**
 * build-issue ヘルパーのユニットテスト
 *
 * Issue #94: 不完全記事を hidden 扱いにする最終防衛線の判定ロジック。
 */

import { describe, it, expect } from 'vitest';
import { isCriticallyIncompleteArticle } from './build-issue.js';
import type { GeneratedArticle } from './generate-articles.js';

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
