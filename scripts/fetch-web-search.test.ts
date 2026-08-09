/**
 * fetch-web-search.ts のユニットテスト
 *
 * docs/article-category-spec.md §5.6 修正3（歴史検索のクエリに発売年を加える）の検証。
 * Tavily API（@tavily/core）は実ネットワークを叩かないようモックし、
 * search() に渡されたクエリ文字列を検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearch = vi.fn();

vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({
    search: mockSearch,
    extract: vi.fn(),
  })),
}));

import { searchGameHistory, searchGameInfo } from './fetch-web-search.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TAVILY_API_KEY = 'test-api-key';
  mockSearch.mockResolvedValue({ results: [] });
});

describe('searchGameHistory - クエリへの発売年の付加（§5.6 修正3）', () => {
  it('発売年を渡すとクエリに年が含まれる', async () => {
    await searchGameHistory('Chrono Trigger', 1995);

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [query] = mockSearch.mock.calls[0];
    expect(query).toBe('"Chrono Trigger" 1995 歴史 影響 名作 ゲーム業界');
  });

  it('境界値: 発売年を渡さない場合はクエリが従来どおりになる', async () => {
    await searchGameHistory('Chrono Trigger');

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [query] = mockSearch.mock.calls[0];
    expect(query).toBe('"Chrono Trigger" 歴史 影響 名作 ゲーム業界');
  });

  it('境界値: 発売年に undefined を明示的に渡した場合もクエリが従来どおりになる', async () => {
    await searchGameHistory('Chrono Trigger', undefined);

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [query] = mockSearch.mock.calls[0];
    expect(query).toBe('"Chrono Trigger" 歴史 影響 名作 ゲーム業界');
  });
});

describe('searchGameInfo - category: classic 経由での発売年の伝播（§5.6 修正3）', () => {
  it('classic カテゴリで発売年を渡すと、歴史検索のクエリに年が含まれる', async () => {
    await searchGameInfo('Chrono Trigger', 'classic', undefined, 1995);

    // classic は「レビュー」→「歴史」の順で2回 search() を呼ぶ。歴史検索は2番目。
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const historyQuery = mockSearch.mock.calls[1][0];
    expect(historyQuery).toBe('"Chrono Trigger" 1995 歴史 影響 名作 ゲーム業界');
  });

  it('classic カテゴリで発売年を渡さない場合、歴史検索のクエリは従来どおりになる', async () => {
    await searchGameInfo('Chrono Trigger', 'classic');

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const historyQuery = mockSearch.mock.calls[1][0];
    expect(historyQuery).toBe('"Chrono Trigger" 歴史 影響 名作 ゲーム業界');
  });
});

describe('searchGameInfo - classic 以外のカテゴリは発売年引数があっても挙動が変わらない（回帰防止）', () => {
  it('newRelease カテゴリ: 発売年を渡してもレビュー検索のクエリは変わらない', async () => {
    await searchGameInfo('Elden Ring', 'newRelease', undefined, 2011);

    // newRelease は「レビュー」→「開発者情報」の順で2回 search() を呼ぶ。
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Elden Ring" ゲーム レビュー 評価 感想');
  });

  it('indie カテゴリ: 発売年を渡してもレビュー検索のクエリは変わらない', async () => {
    await searchGameInfo('Hollow Knight', 'indie', undefined, 2017);

    // indie は「レビュー」→「開発者情報」→「Steamレビュー」の順で3回 search() を呼ぶ。
    expect(mockSearch).toHaveBeenCalledTimes(3);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Hollow Knight" ゲーム レビュー 評価 感想');
  });

  it('feature カテゴリ: 発売年を渡してもレビュー検索のクエリは変わらない', async () => {
    await searchGameInfo('Stardew Valley', 'feature', undefined, 2016);

    // feature はレビュー検索のみ1回。
    expect(mockSearch).toHaveBeenCalledTimes(1);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Stardew Valley" ゲーム レビュー 評価 感想');
  });
});
