/**
 * fetchSteamEntity の単体テスト（Issue #179 PR-1）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSteamEntity, clearSteamEntityCache } from './steam-entity.js';

beforeEach(() => {
  clearSteamEntityCache();
});

function makeFetch(responses: Record<string, object>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [key, data] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
      }
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  });
}

describe('fetchSteamEntity', () => {
  it('英語・日本語の両方を取得して SteamEntity を返す', async () => {
    const mockFetch = makeFetch({
      'l=english': {
        '12345': {
          success: true,
          data: {
            name: 'Test Game EN',
            release_date: { date: 'Jan 1, 2024', coming_soon: false },
            developers: ['Dev Studio'],
            publishers: ['Pub Corp'],
          },
        },
      },
      'l=japanese': {
        '12345': {
          success: true,
          data: {
            name: 'テストゲーム',
            release_date: { date: '2024年1月1日', coming_soon: false },
            developers: ['Dev Studio'],
          },
        },
      },
    });

    const entity = await fetchSteamEntity(12345, mockFetch as typeof fetch);
    expect(entity).toBeDefined();
    expect(entity?.nameEn).toBe('Test Game EN');
    expect(entity?.nameJa).toBe('テストゲーム');
    expect(entity?.developers).toEqual(['Dev Studio']);
    expect(entity?.publishers).toEqual(['Pub Corp']);
    expect(entity?.releaseDate).toBe('Jan 1, 2024');
  });

  it('coming_soon=true のとき releaseDate を undefined にする', async () => {
    const mockFetch = makeFetch({
      'l=english': {
        '99': {
          success: true,
          data: {
            name: 'Upcoming Game',
            release_date: { date: 'Q1 2025', coming_soon: true },
            developers: [],
            publishers: [],
          },
        },
      },
      'l=japanese': {
        '99': {
          success: true,
          data: { name: 'アップカミングゲーム', release_date: { date: 'Q1 2025', coming_soon: true } },
        },
      },
    });

    const entity = await fetchSteamEntity(99, mockFetch as typeof fetch);
    expect(entity?.releaseDate).toBeUndefined();
  });

  it('日本語取得失敗 → nameJa=undefined, それ以外は返す（fail-open）', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('l=english')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            '1': { success: true, data: { name: 'Game EN', release_date: { date: 'Jan 1, 2024' }, developers: [] } },
          }),
        } as Response);
      }
      // 日本語は失敗
      return Promise.resolve({ ok: false, status: 503 } as Response);
    });

    const entity = await fetchSteamEntity(1, mockFetch as typeof fetch);
    expect(entity).toBeDefined();
    expect(entity?.nameEn).toBe('Game EN');
    expect(entity?.nameJa).toBeUndefined();
  });

  it('両方失敗 → undefined（fail-open）', async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response));
    const entity = await fetchSteamEntity(2, mockFetch as typeof fetch);
    expect(entity).toBeUndefined();
  });

  it('同一 appId の2回目は fetch を呼ばない（キャッシュ）', async () => {
    const mockFetch = makeFetch({
      'l=english': { '3': { success: true, data: { name: 'Cached', developers: [], publishers: [] } } },
      'l=japanese': { '3': { success: true, data: { name: 'キャッシュ', developers: [] } } },
    });

    await fetchSteamEntity(3, mockFetch as typeof fetch);
    await fetchSteamEntity(3, mockFetch as typeof fetch);
    // l=english と l=japanese で2回ずつ → 初回のみ（合計2回）
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
