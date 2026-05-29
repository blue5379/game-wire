/**
 * validate-article のユニットテスト
 *
 * issue-008 のハルシネーション事案を再現するテストケースを含む。
 */

import { describe, it, expect } from 'vitest';
import {
  validateTitleConsistency,
  validateTitleVsIgdbSlug,
  validatePlatformConsistency,
  validatePersonAttribution,
  validateNumericClaims,
  validateArticles,
} from './validate-article.js';
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

describe('validateTitleConsistency', () => {
  it('issue-008 の Hero Company 事案を検出する（英語タイトルの誤短縮）', () => {
    const article = makeArticle({
      title: '歴史を変えた中隊を指揮せよ！戦術性が光るインディーRTS『Hero Company』',
      category: 'indie',
      game: {
        title: 'Company of Heroes',
        genre: ['RTS'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    const warnings = validateTitleConsistency(article);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('title-mismatch');
    expect(warnings[0].severity).toBe('high');
  });

  it('英語タイトルがそのまま含まれていれば警告しない', () => {
    const article = makeArticle({
      title: 'Company of Heroes が描く第二次世界大戦RTSの傑作',
      category: 'classic',
      game: {
        title: 'Company of Heroes',
        genre: ['RTS'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });

  it('日本語タイトルが含まれていれば警告しない', () => {
    const article = makeArticle({
      title: '『トモダチコレクション わくわく生活』が新登場',
      category: 'newRelease',
      game: {
        title: 'Tomodachi Life: Living the Dream',
        titleJa: 'トモダチコレクション わくわく生活',
        genre: ['Simulator'],
        platforms: ['Nintendo Switch'],
      },
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });

  it('特集記事はチェック対象外', () => {
    const article = makeArticle({
      title: '2026年5月第4週の注目ゲーム4選',
      category: 'feature',
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });
});

describe('validateTitleVsIgdbSlug', () => {
  it('issue-008 の Hero Company 事案を検出する（slug=company-of-heroes だが title=Hero Company）', () => {
    const article = makeArticle({
      title: '歴史を変えた中隊を指揮せよ！',
      category: 'indie',
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/company-of-heroes',
      },
      game: {
        title: 'Hero Company',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateTitleVsIgdbSlug(article);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('title-vs-igdb-slug');
    expect(warnings[0].severity).toBe('high');
  });

  it('slug と title が一致していれば警告しない', () => {
    const article = makeArticle({
      title: 'ARK 紹介',
      category: 'indie',
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/ark-survival-ascended',
      },
      game: {
        title: 'ARK: Survival Ascended',
        genre: [],
        platforms: ['PC'],
      },
    });

    expect(validateTitleVsIgdbSlug(article)).toHaveLength(0);
  });

  it('slug の "--1" 等のサフィックスを除去する', () => {
    const article = makeArticle({
      title: 'Atomic Heart DLC',
      category: 'newRelease',
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/atomic-heart-blood-on-crystal--1',
      },
      game: {
        title: 'Atomic Heart: Blood on Crystal',
        genre: [],
        platforms: ['PC'],
      },
    });

    expect(validateTitleVsIgdbSlug(article)).toHaveLength(0);
  });

  it('特集記事はチェック対象外', () => {
    const article = makeArticle({
      title: '今週の注目',
      category: 'feature',
    });

    expect(validateTitleVsIgdbSlug(article)).toHaveLength(0);
  });
});

describe('validatePlatformConsistency', () => {
  it('issue-008 の FiveM 事案を検出する（提供データに無い Linux/Mac の言及）', () => {
    const article = makeArticle({
      title: 'GTAVを無限に遊べるFiveM',
      category: 'classic',
      content: 'FiveMは現在、PC（Microsoft Windows）、Linux、Macでプレイ可能です。',
      game: {
        title: 'FiveM',
        genre: ['Shooter'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    const warnings = validatePlatformConsistency(article);
    const types = warnings.map((w) => w.evidence);
    expect(types).toContain('Linux');
    expect(types).toContain('Mac');
  });

  it('提供データに合致するプラットフォーム言及は警告しない', () => {
    const article = makeArticle({
      title: 'ARK',
      category: 'indie',
      content: 'PC（Microsoft Windows）と PlayStation 5、Xbox Series X|S で発売中。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'],
      },
    });

    expect(validatePlatformConsistency(article)).toHaveLength(0);
  });
});

describe('validatePersonAttribution', () => {
  it('issue-008 の Tomodachi Life 事案を検出する（ディレクター上野氏の発言）', () => {
    const article = makeArticle({
      title: 'Tomodachi Life',
      content:
        '開発チームのディレクター・上野氏によると、「小さな癖」機能の追加により、プレイヤーがMiiキャラクターに歩き方や食事の仕方などの特性や行動を与えられるようになったとのこと。',
      game: {
        title: 'Tomodachi Life',
        genre: [],
        platforms: ['Nintendo Switch'],
        developer: 'Nintendo',
      },
    });

    const warnings = validatePersonAttribution(article);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.evidence?.includes('上野'))).toBe(true);
  });

  it('issue-008 の ARK 事案を検出する（CTO Alex Williams 氏）', () => {
    const article = makeArticle({
      title: 'ARK',
      content: 'CTOのAlex Williams氏を中心に、少数精鋭のチームが開発とプログラミングの両面で手腕を発揮。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC'],
        developer: 'Studio Wildcard',
      },
    });

    const warnings = validatePersonAttribution(article);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.type === 'person-title')).toBe(true);
  });

  it('開発元名と一致する場合は警告しない', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: 'Studio Wildcard氏は語った。', // ありえない文だが照合テスト
      game: {
        title: 'Test',
        genre: [],
        platforms: ['PC'],
        developer: 'Studio Wildcard',
      },
    });

    const warnings = validatePersonAttribution(article);
    // 開発元名と一致するためスキップされる
    expect(
      warnings.filter((w) => w.evidence?.includes('Studio Wildcard'))
    ).toHaveLength(0);
  });
});

describe('validateNumericClaims', () => {
  it('issue-008 の ARK 事案を検出する（Steamレビュー 75,995 件）', () => {
    const article = makeArticle({
      title: 'ARK',
      content: 'Steamでは75,995件のレビューが投稿され、「賛否両論」の評価。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-review-count')).toBe(true);
  });

  it('issue-008 の Atomic Heart 事案を検出する（1000万ユーザー）', () => {
    const article = makeArticle({
      title: 'Atomic Heart',
      content: 'Atomic Heartは発売から約1年で1,000万ユーザーを突破する大ヒットを記録し',
      game: {
        title: 'Atomic Heart',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-large-count')).toBe(true);
  });

  it('issue-008 の Forza 事案を検出する（550台以上の実車）', () => {
    const article = makeArticle({
      title: 'Forza',
      content: '日本全国の実在する景観を550台以上の実車で駆け抜ける、オープンワールドレーシングの最高峰。',
      game: {
        title: 'Forza Horizon 6',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-vehicle-count')).toBe(true);
  });

  it('提供データに含まれる数値は警告しない（Metacritic 90 等）', () => {
    const article = makeArticle({
      title: 'Test',
      content: 'Metacriticスコアは90点。',
      game: {
        title: 'Test',
        genre: [],
        platforms: ['PC'],
        metascore: 90,
      },
    });

    // 90単独はパターンにマッチしないため空、年度検査も入らない
    const warnings = validateNumericClaims(article);
    expect(warnings).toHaveLength(0);
  });
});

describe('validateArticles (集約)', () => {
  it('複数記事から集計レポートを生成する', () => {
    const articles: GeneratedArticle[] = [
      makeArticle({
        title: 'Hero Company',
        category: 'indie',
        game: {
          title: 'Company of Heroes',
          genre: [],
          platforms: ['PC'],
        },
      }),
      makeArticle({
        title: 'Forza Horizon 6 が登場',
        category: 'newRelease',
        content: '550台以上の実車で駆け抜ける。',
        game: {
          title: 'Forza Horizon 6',
          genre: [],
          platforms: ['PC'],
        },
      }),
    ];

    const report = validateArticles(articles, 8);
    expect(report.issueNumber).toBe(8);
    expect(report.totalArticles).toBe(2);
    expect(report.totalWarnings).toBeGreaterThanOrEqual(2);
    expect(report.warningsBySeverity.high).toBeGreaterThanOrEqual(2);
  });
});
