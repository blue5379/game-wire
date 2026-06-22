/**
 * 既知ケースフィクスチャ回帰テスト（PR-6）
 *
 * scripts/__fixtures__/known-cases.json に記述された過去 issue を
 * 自動的にリグレッションテストとして実行する。
 *
 * 今後 issue が来るたびに known-cases.json に1行追加する運用。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveGameIdentity } from './identity-resolver.js';
import knownCases from './__fixtures__/known-cases.json';

// fetch をグローバルモック
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Tavily は環境変数が未設定なら実行されない
vi.stubEnv('TAVILY_API_KEY', '');

beforeEach(() => {
  mockFetch.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ型定義
// ─────────────────────────────────────────────────────────────────────────────

interface KnownCase {
  issue: number;
  scenario: string;
  input: {
    title: string;
    titleJa?: string;
    igdbSlug?: string;
    releaseDate?: string;
    platforms?: string[];
    igdbWebsites?: { url: string; category?: number }[];
    knownSteamAppId?: number;
  };
  steamSearchMock?: {
    items: { id: number; name: string; date?: string }[];
  };
  steamAppDetailsMock?: {
    appId: number;
    name: string;
    date?: string;
  };
  expected: {
    stores: { platform: string; confidence?: string }[];
  };
  expectedSteamEmpty?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// モックヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function setupMockFetch(tc: KnownCase) {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    // Steam Store Search
    if (url.includes('storesearch') && tc.steamSearchMock) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            total: tc.steamSearchMock!.items.length,
            items: tc.steamSearchMock!.items.map((i) => ({
              id: i.id,
              name: i.name,
              release: i.date ? { steam_release_date: i.date } : undefined,
            })),
          }),
      } as Response);
    }

    // Steam appdetails
    if (url.includes('appdetails') && tc.steamAppDetailsMock) {
      const appId = tc.steamAppDetailsMock.appId;
      if (url.includes(String(appId))) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              [appId]: {
                success: true,
                data: {
                  name: tc.steamAppDetailsMock!.name,
                  release_date: tc.steamAppDetailsMock!.date
                    ? { date: tc.steamAppDetailsMock!.date }
                    : undefined,
                },
              },
            }),
        } as Response);
      }
    }

    // HEAD checks for platform URLs（Nintendo/PlayStation/Xbox 等）
    if (url.includes('nintendo.com') || url.includes('playstation.com') || url.includes('xbox.com')) {
      return Promise.resolve({ ok: true, status: 200 } as Response);
    }

    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ駆動テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('既知ケース回帰テスト（known-cases.json）', () => {
  for (const tc of knownCases as KnownCase[]) {
    it(`Issue #${tc.issue}: ${tc.scenario}`, async () => {
      setupMockFetch(tc);

      const result = await resolveGameIdentity(tc.input);

      // Steam が存在しないことを個別に検証
      if (tc.expectedSteamEmpty) {
        const steamLink = result.stores.find((s) => s.platform === 'steam');
        expect(steamLink).toBeUndefined();
      }

      // expected.stores に列挙されたプラットフォームが stores に存在するか検証
      for (const expectedStore of tc.expected.stores) {
        const found = result.stores.find((s) => s.platform === expectedStore.platform);
        expect(
          found,
          `Issue #${tc.issue} "${tc.scenario}": platform "${expectedStore.platform}" が stores に見つからない`
        ).toBeDefined();

        if (expectedStore.confidence) {
          expect(
            found?.confidence,
            `Issue #${tc.issue}: confidence は "${expectedStore.confidence}" を期待`
          ).toBe(expectedStore.confidence);
        }
      }

      // expected.stores が空なら stores も空（expectedSteamEmpty に依らず常に検証）
      if (tc.expected.stores.length === 0) {
        expect(
          result.stores,
          `Issue #${tc.issue} "${tc.scenario}": stores が空でない`
        ).toHaveLength(0);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ構造の健全性チェック
// ─────────────────────────────────────────────────────────────────────────────

describe('known-cases.json 構造チェック', () => {
  it('全ケースに issue / scenario / input / expected フィールドがある', () => {
    for (const tc of knownCases as KnownCase[]) {
      expect(typeof tc.issue, `issue フィールドが数値でない: ${JSON.stringify(tc)}`).toBe('number');
      expect(typeof tc.scenario, `scenario フィールドが文字列でない`).toBe('string');
      expect(tc.input, 'input フィールドがない').toBeDefined();
      expect(typeof tc.input.title, 'input.title が文字列でない').toBe('string');
      expect(tc.expected, 'expected フィールドがない').toBeDefined();
      expect(Array.isArray(tc.expected.stores), 'expected.stores が配列でない').toBe(true);
    }
  });

  it('全ケースに重複した issue+scenario の組み合わせがない', () => {
    const keys = (knownCases as KnownCase[]).map((tc) => `${tc.issue}:${tc.scenario}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});
