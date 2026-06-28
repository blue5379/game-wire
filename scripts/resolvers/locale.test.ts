/**
 * locale.ts — ロケール共通解決エンジン resolveByLocale のユニットテスト（Issue #149）
 *
 * Tavily 検索（searchStorePage）をモックし、JP優先・英語フォールバック・
 * 余計な英語検索のスキップ（コスト抑制）を検証する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// searchStorePage をモックして Tavily 検索結果を制御する
const mockSearch = vi.fn<(queryTitles: string[], scope: string, filter: (u: string) => boolean) => Promise<string[]>>();
vi.mock('./tavily-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tavily-search.js')>();
  return { ...actual, searchStorePage: (qt: string[], scope: string, filter: (u: string) => boolean) => mockSearch(qt, scope, filter) };
});

import { resolveByLocale } from './locale.js';
import type { LocaleResolverConfig, VerifyOutcome } from './locale.js';

beforeEach(() => {
  mockSearch.mockReset();
});

// テスト用 Nintendo 風 config（nintendo.com / nintendo.co.jp 両対応）
function makeConfig(overrides: Partial<LocaleResolverConfig> = {}): LocaleResolverConfig {
  return {
    platform: 'nintendo',
    isPlatformUrl: (u) => /nintendo\.(com|co\.jp)/i.test(u),
    isGamePage: (u) => !u.includes('/ir/'),
    jaSearchScope: 'site:nintendo.co.jp',
    enSearchScope: 'site:nintendo.com',
    // 検証は常に成功（URLそのものの採否ロジックを検証するため）
    verifyIgdb: async (): Promise<VerifyOutcome> => ({ ok: true, confidence: 'high' }),
    verifySearch: async (): Promise<VerifyOutcome> => ({ ok: true, confidence: 'high' }),
    notGamePageReason: 'not a game page',
    noUrlReason: 'no Nintendo URL in IGDB websites',
    ...overrides,
  };
}

describe('resolveByLocale — JP優先（Issue #149 fix #1）', () => {
  it('ja検索が英語URL（nintendo.com）しか返さない場合、それを採用せず英語フェーズへ進む', async () => {
    // ja検索（site:nintendo.co.jp）でも Tavily が英語URLを返すケースを再現
    mockSearch.mockImplementation(async (_qt, scope) => {
      if (scope.includes('co.jp')) return ['https://www.nintendo.com/us/store/products/foo/']; // 英語URL混入
      if (scope === 'site:nintendo.com') return ['https://www.nintendo.com/us/store/products/foo/'];
      return [];
    });

    const result = await resolveByLocale(
      { title: 'Foo', releaseDate: '2025-01-01' },
      makeConfig(),
    );

    // ja検索では英語URLを弾き、英語フェーズ(B2)で初めて採用される
    expect(result.link).not.toBeNull();
    expect(result.link?.url).toBe('https://www.nintendo.com/us/store/products/foo/');
    // ja検索は「全て非該当」で失敗し、en検索で成功している
    const jaFail = result.attempts.find((a) => a.reason?.startsWith('ja:'));
    expect(jaFail?.ok).toBe(false);
  });

  it('ja検索が日本語URL（nintendo.co.jp）を返す場合はそれを優先採用する', async () => {
    mockSearch.mockImplementation(async (_qt, scope) => {
      if (scope.includes('co.jp')) return ['https://www.nintendo.co.jp/switch/foo/'];
      return ['https://www.nintendo.com/us/store/products/foo/'];
    });

    const result = await resolveByLocale(
      { title: 'Foo', releaseDate: '2025-01-01' },
      makeConfig(),
    );

    expect(result.link?.url).toBe('https://www.nintendo.co.jp/switch/foo/');
    expect(result.link?.resolvedBy).toBe('web-search');
  });
});

describe('resolveByLocale — 英語検索スキップ（Issue #149 fix #2: コスト抑制）', () => {
  it('日本語ページが見つかった場合、英語スコープ検索を呼び出さない', async () => {
    mockSearch.mockImplementation(async (_qt, scope) => {
      if (scope.includes('co.jp')) return ['https://www.nintendo.co.jp/switch/foo/'];
      return ['https://www.nintendo.com/us/store/products/foo/'];
    });

    await resolveByLocale({ title: 'Foo' }, makeConfig());

    // ja検索が成功するので en検索（site:nintendo.com）は呼ばれない
    const scopes = mockSearch.mock.calls.map((c) => c[1]);
    expect(scopes).toContain('site:nintendo.co.jp');
    expect(scopes).not.toContain('site:nintendo.com');
  });

  it('日本語ページの候補が存在しない場合のみ英語スコープ検索を実行する', async () => {
    mockSearch.mockImplementation(async (_qt, scope) => {
      if (scope.includes('co.jp')) return []; // 日本語ヒットなし
      return ['https://www.nintendo.com/us/store/products/foo/'];
    });

    const result = await resolveByLocale({ title: 'Foo' }, makeConfig());

    const scopes = mockSearch.mock.calls.map((c) => c[1]);
    expect(scopes).toContain('site:nintendo.com'); // 英語検索が走る
    expect(result.link?.url).toBe('https://www.nintendo.com/us/store/products/foo/');
  });

  it('IGDB日本語ゲームページが検証成功なら検索自体を行わない（A1で確定）', async () => {
    mockSearch.mockResolvedValue([]);

    const result = await resolveByLocale(
      {
        title: 'Foo',
        igdbWebsites: [{ url: 'https://www.nintendo.co.jp/switch/foo/' }],
      },
      makeConfig(),
    );

    expect(result.link?.url).toBe('https://www.nintendo.co.jp/switch/foo/');
    expect(result.link?.resolvedBy).toBe('igdb-website');
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe('resolveByLocale — IGDBロケール優先順位', () => {
  it('IGDBに英語と日本語のゲームページが両方あるとき日本語を優先する', async () => {
    mockSearch.mockResolvedValue([]);

    const result = await resolveByLocale(
      {
        title: 'Foo',
        igdbWebsites: [
          { url: 'https://www.nintendo.com/us/store/products/foo/' },
          { url: 'https://www.nintendo.co.jp/switch/foo/' },
        ],
      },
      makeConfig(),
    );

    expect(result.link?.url).toBe('https://www.nintendo.co.jp/switch/foo/');
  });

  it('IGDB日本語ページが検証失敗（死リンク等）なら日本語検索→英語へフォールバックする', async () => {
    mockSearch.mockResolvedValue([]); // 検索は全て空
    const config = makeConfig({
      // IGDB検証は失敗させる
      verifyIgdb: async () => ({ ok: false, reason: 'HEAD check failed' }),
    });

    const result = await resolveByLocale(
      {
        title: 'Foo',
        igdbWebsites: [{ url: 'https://www.nintendo.co.jp/switch/foo/' }],
      },
      config,
    );

    // IGDB日本語が死んでいる→ ja検索(空)→ en検索(空) まで進んで最終的にnull
    expect(result.link).toBeNull();
    const scopes = mockSearch.mock.calls.map((c) => c[1]);
    expect(scopes).toContain('site:nintendo.co.jp');
    expect(scopes).toContain('site:nintendo.com'); // 日本語候補0件なので英語検索が走る
  });
});
