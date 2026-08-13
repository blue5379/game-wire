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

import {
  searchGameHistory,
  searchGameInfo,
  formatSearchResultsForPrompt,
  flattenSearchResults,
  readSearchContentMaxLength,
  searchUpcomingInfo,
} from './fetch-web-search.js';
import type { ReleaseStatus } from './bedrock-client.js';

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
    await searchGameInfo('Chrono Trigger', 'classic', undefined, { releaseYear: 1995 });

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
    await searchGameInfo('Elden Ring', 'newRelease', undefined, { releaseYear: 2011 });

    // newRelease は「レビュー」→「開発者情報」の順で2回 search() を呼ぶ。
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Elden Ring" ゲーム レビュー 評価 感想');
  });

  it('indie カテゴリ: 発売年を渡してもレビュー検索のクエリは変わらない', async () => {
    await searchGameInfo('Hollow Knight', 'indie', undefined, { releaseYear: 2017 });

    // indie は「レビュー」→「開発者情報」→「Steamレビュー」の順で3回 search() を呼ぶ。
    expect(mockSearch).toHaveBeenCalledTimes(3);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Hollow Knight" ゲーム レビュー 評価 感想');
  });

  it('feature カテゴリ: 発売年を渡してもレビュー検索のクエリは変わらない', async () => {
    await searchGameInfo('Stardew Valley', 'feature', undefined, { releaseYear: 2016 });

    // feature はレビュー検索のみ1回。
    expect(mockSearch).toHaveBeenCalledTimes(1);
    const reviewQuery = mockSearch.mock.calls[0][0];
    expect(reviewQuery).toBe('"Stardew Valley" ゲーム レビュー 評価 感想');
  });
});

describe('formatSearchResultsForPrompt - 抜粋長をバリデータと揃える（§5.6 修正2 / Issue #307）', () => {
  /**
   * バリデータの sourcedFrom 判定は flattenSearchResults が保存する snippet
   * （既定 1500 字）に対して照合する。プロンプト側が 300 字だと、
   * 300〜1500 字の区間にある定量値が「LLM に渡っていないのにバリデータは根拠ありと判定する」
   * 偽陰性を生む（決着ブロックの実測: プロンプト内 10 個 vs 300〜1500 字のみ 31 個）。
   * したがって両者は同じ上限を使わなければならない。
   */
  const makeResult = (content: string) => ({
    title: 'T',
    url: 'https://example.com/a',
    content,
    score: 1,
  });

  it('プロンプトの抜粋と保存 snippet が同じ上限を使う（4ブロックすべて）', () => {
    // ⚠️ 改行を意図的に含める。実測で Tavily の content は 1500 字の窓の中に改行を持つ
    //（『The Witcher 3』の検索結果 6 件中 4 件。1500 字内の改行数は 33 / 3 / 8 / 14）。
    // 行分割に依存したアサーションは実装が正しくても落ちるため、抜粋文字列そのものを照合する。
    const content = `${'あ'.repeat(700)}\n${'い'.repeat(700)}\n${'う'.repeat(700)}`;
    const results = {
      gameTitle: 'G',
      reviews: [makeResult(content)],
      developerInfo: [makeResult(content)],
      steamReviews: [makeResult(content)],
      history: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };
    const prompt = formatSearchResultsForPrompt(results);
    const snippet = flattenSearchResults({
      gameTitle: 'G',
      reviews: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    })[0].snippet;

    expect(snippet.length).toBe(1500);
    // snippet と同一の文字列が、4ブロックそれぞれに1回ずつ現れる
    expect(prompt.split(snippet).length - 1).toBe(4);
    // 上限を超えた分は入らない（300 字実装でも通ってしまう緩いアサーションにしない）
    expect(prompt).not.toContain(content.slice(0, 1501));
  });

  it('上限より短いコンテンツは切られない', () => {
    const content = 'い'.repeat(400);
    const prompt = formatSearchResultsForPrompt({
      gameTitle: 'G',
      reviews: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    });
    expect(prompt).toContain(content);
  });

  it('境界値: 上限ちょうどのコンテンツは全文が入る', () => {
    const content = 'う'.repeat(readSearchContentMaxLength());
    const prompt = formatSearchResultsForPrompt({
      gameTitle: 'G',
      reviews: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    });
    expect(prompt).toContain(content);
  });

  it('境界値: 上限+1 字のコンテンツは上限で切られる', () => {
    const limit = readSearchContentMaxLength();
    const content = 'え'.repeat(limit + 1);
    const prompt = formatSearchResultsForPrompt({
      gameTitle: 'G',
      reviews: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    });
    expect(prompt).toContain('え'.repeat(limit));
    expect(prompt).not.toContain('え'.repeat(limit + 1));
  });

  it('環境変数 SEARCH_CONTENT_MAX_LENGTH で上限を変えると、プロンプトと snippet が揃って変わる', () => {
    vi.stubEnv('SEARCH_CONTENT_MAX_LENGTH', '500');
    const content = 'お'.repeat(2000);
    const results = {
      gameTitle: 'G',
      reviews: [makeResult(content)],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };
    expect(readSearchContentMaxLength()).toBe(500);
    expect(flattenSearchResults(results)[0].snippet.length).toBe(500);
    const excerpt = formatSearchResultsForPrompt(results)
      .split('\n')
      .find((l) => l.startsWith('  お'));
    expect(excerpt?.trim().length).toBe(500);
    vi.unstubAllEnvs();
  });

  it('SEARCH_CONTENT_MAX_LENGTH が不正な値なら既定値 1500 にフォールバックする', () => {
    for (const bad of ['', 'abc', 'NaN', '0', '-1']) {
      vi.stubEnv('SEARCH_CONTENT_MAX_LENGTH', bad);
      expect(readSearchContentMaxLength()).toBe(1500);
    }
    vi.unstubAllEnvs();
  });
});

describe('searchUpcomingInfo - 未発売記事の新規クエリ（§2.6）', () => {
  it('クエリ形式は「"タイトル" ゲーム 発売日 最新情報」（OR 演算子なし）', async () => {
    await searchUpcomingInfo('Big Walk');

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [query, options] = mockSearch.mock.calls[0];
    expect(query).toBe('"Big Walk" ゲーム 発売日 最新情報');
    expect(options).toMatchObject({ maxResults: 3, searchDepth: 'basic' });
  });

  it('クエリに OR 演算子が含まれない（§11.3.3(3) の回帰防止）', async () => {
    await searchUpcomingInfo('Duskfade');

    const [query] = mockSearch.mock.calls[0];
    expect(query).not.toContain(' OR ');
  });
});

describe('searchGameInfo - 未発売記事の検索セット分岐（§2.6）', () => {
  beforeEach(() => {
    mockSearch.mockResolvedValue({
      results: [
        { title: 'Result 1', content: 'Content 1', url: 'https://example.com/1', score: 0.9 },
        { title: 'Result 2', content: 'Content 2', url: 'https://example.com/2', score: 0.8 },
      ],
    });
  });

  it('未発売（発売予定）の newRelease で searchReviews が呼ばれず searchUpcomingInfo が呼ばれる', async () => {
    await searchGameInfo('Big Walk', 'newRelease', 'ExampleDev', { releaseStatus: '発売予定' });

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Big Walk" ゲーム 発売日 最新情報');
    expect(queries).toContain('"Big Walk" "ExampleDev" ゲーム 開発者 インタビュー OR 開発秘話 OR 開発ブログ');
    expect(queries).not.toContain('"Big Walk" ゲーム レビュー 評価 感想');
  });

  it('未発売（本日発売）の newRelease で searchReviews が呼ばれず searchUpcomingInfo が呼ばれる', async () => {
    await searchGameInfo('Duskfade', 'newRelease', 'StudioX', { releaseStatus: '本日発売' });

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Duskfade" ゲーム 発売日 最新情報');
    expect(queries).toContain('"Duskfade" "StudioX" ゲーム 開発者 インタビュー OR 開発秘話 OR 開発ブログ');
    expect(queries).not.toContain('"Duskfade" ゲーム レビュー 評価 感想');
  });

  it('発売済みの newRelease で searchReviews が呼ばれ searchUpcomingInfo は呼ばれない（従来どおり）', async () => {
    await searchGameInfo('Elden Ring', 'newRelease', 'FromSoftware', { releaseStatus: '発売済み' });

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Elden Ring" ゲーム レビュー 評価 感想');
    expect(queries).toContain('"Elden Ring" "FromSoftware" ゲーム 開発者 インタビュー OR 開発秘話 OR 開発ブログ');
    expect(queries).not.toContain('"Elden Ring" ゲーム 発売日 最新情報');
  });

  it('発売日不明（null）の newRelease で searchReviews が呼ばれる（従来どおり発売済み扱い）', async () => {
    await searchGameInfo('Unknown Game', 'newRelease', 'UnknownDev', { releaseStatus: null });

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Unknown Game" ゲーム レビュー 評価 感想');
    expect(queries).not.toContain('"Unknown Game" ゲーム 発売日 最新情報');
  });

  it('releaseStatus を渡さない場合は従来どおり searchReviews が呼ばれる', async () => {
    await searchGameInfo('Stardew Valley', 'newRelease', 'ConcernedApe');

    expect(mockSearch).toHaveBeenCalledTimes(2);
    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Stardew Valley" ゲーム レビュー 評価 感想');
  });

  it('Tavily 呼び出し回数は発売済み・未発売の両方で 2 回（±0）', async () => {
    await searchGameInfo('ReleasedGame', 'newRelease', 'DevA', { releaseStatus: '発売済み' });
    expect(mockSearch).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();

    await searchGameInfo('UpcomingGame', 'newRelease', 'DevB', { releaseStatus: '発売予定' });
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it('searchDeveloperInfo は未発売でも従来どおり呼ばれる（§2.6）', async () => {
    await searchGameInfo('Big Walk', 'newRelease', 'ExampleDev', { releaseStatus: '発売予定' });

    const queries = mockSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain('"Big Walk" "ExampleDev" ゲーム 開発者 インタビュー OR 開発秘話 OR 開発ブログ');
  });

  it('indie / classic / feature カテゴリは releaseStatus を渡しても挙動が変わらない', async () => {
    await searchGameInfo('Hollow Knight', 'indie', 'TeamCherry', { releaseStatus: '発売予定' });
    expect(mockSearch).toHaveBeenCalledTimes(3);
    const indieQueries = mockSearch.mock.calls.map((c) => c[0]);
    expect(indieQueries[0]).toBe('"Hollow Knight" ゲーム レビュー 評価 感想');

    vi.clearAllMocks();

    await searchGameInfo('Chrono Trigger', 'classic', undefined, { releaseYear: 1995, releaseStatus: '発売予定' });
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const classicQueries = mockSearch.mock.calls.map((c) => c[0]);
    expect(classicQueries[0]).toBe('"Chrono Trigger" ゲーム レビュー 評価 感想');

    vi.clearAllMocks();

    await searchGameInfo('Stardew Valley', 'feature', undefined, { releaseStatus: '発売予定' });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    const featureQueries = mockSearch.mock.calls.map((c) => c[0]);
    expect(featureQueries[0]).toBe('"Stardew Valley" ゲーム レビュー 評価 感想');
  });
});

describe('formatSearchResultsForPrompt と flattenSearchResults - upcomingInfo の追加（§2.6）', () => {
  it('upcomingInfo が formatSearchResultsForPrompt で【発売日・最新情報】ブロックとして出力される', () => {
    const results = {
      gameTitle: 'Big Walk',
      upcomingInfo: [
        { title: 'Release Date Announced', content: 'Content 1', url: 'https://example.com/1', score: 0.9 },
        { title: 'Latest News', content: 'Content 2', url: 'https://example.com/2', score: 0.8 },
      ],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };

    const formatted = formatSearchResultsForPrompt(results);
    expect(formatted).toContain('【発売日・最新情報】');
    expect(formatted).toContain('- Release Date Announced');
    expect(formatted).toContain('- Latest News');
  });

  it('upcomingInfo が flattenSearchResults で配列に含まれる', () => {
    const results = {
      gameTitle: 'Duskfade',
      upcomingInfo: [
        { title: 'Upcoming Info', content: 'Content', url: 'https://example.com/upcoming', score: 0.95 },
      ],
      developerInfo: [
        { title: 'Developer Info', content: 'DevContent', url: 'https://example.com/dev', score: 0.85 },
      ],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };

    const flattened = flattenSearchResults(results);
    expect(flattened).toHaveLength(2);
    expect(flattened.some((r) => r.url === 'https://example.com/upcoming')).toBe(true);
    expect(flattened.some((r) => r.url === 'https://example.com/dev')).toBe(true);
  });

  it('upcomingInfo が無い場合は【発売日・最新情報】ブロックが出力されない', () => {
    const results = {
      gameTitle: 'Game',
      developerInfo: [
        { title: 'Dev', content: 'C', url: 'https://example.com/d', score: 0.8 },
      ],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };

    const formatted = formatSearchResultsForPrompt(results);
    expect(formatted).not.toContain('【発売日・最新情報】');
  });

  it('upcomingInfo と reviews の両方がある場合、両方のブロックが出力される', () => {
    const results = {
      gameTitle: 'Game',
      reviews: [
        { title: 'Review', content: 'ReviewContent', url: 'https://example.com/r', score: 0.9 },
      ],
      upcomingInfo: [
        { title: 'Upcoming', content: 'UpcomingContent', url: 'https://example.com/u', score: 0.85 },
      ],
      searchedAt: '2026-08-13T00:00:00.000Z',
    };

    const formatted = formatSearchResultsForPrompt(results);
    expect(formatted).toContain('【レビュー情報】');
    expect(formatted).toContain('【発売日・最新情報】');
  });
});
