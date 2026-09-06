/**
 * fetchSteamEntity の単体テスト（Issue #179 PR-1）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSteamEntity, clearSteamEntityCache } from './steam-entity.js';

beforeEach(() => {
  clearSteamEntityCache();
  // 失敗理由の warn（Issue #363）でテスト出力が埋まらないように抑止する。
  // 内容を検証するテストは spy 越しに参照する
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** console.warn に出た JSON ログのうち scope が一致するものを返す */
function warnedLogs(scope: string): Record<string, unknown>[] {
  return vi
    .mocked(console.warn)
    .mock.calls.map(([first]) => {
      try {
        return JSON.parse(String(first)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((log): log is Record<string, unknown> => log?.scope === scope);
}

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

  it('同一 appId の2回目は fetch を呼ばない（両言語成功時のキャッシュ）', async () => {
    const mockFetch = makeFetch({
      'l=english': { '3': { success: true, data: { name: 'Cached', developers: [], publishers: [] } } },
      'l=japanese': { '3': { success: true, data: { name: 'キャッシュ', developers: [] } } },
    });

    await fetchSteamEntity(3, mockFetch as typeof fetch);
    await fetchSteamEntity(3, mockFetch as typeof fetch);
    // l=english と l=japanese で2回ずつ → 初回のみ（合計2回）
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('片言語失敗の場合はキャッシュせず、2回目も fetch を試みる', async () => {
    // 1回目: 日本語失敗 → nameJa=undefined → キャッシュしない
    // 2回目: 再度 fetch する（transient error から回復できる）
    let callCount = 0;
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      callCount++;
      const url = String(input);
      if (url.includes('l=english')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            '4': { success: true, data: { name: 'Partial', developers: [], publishers: [] } },
          }),
        } as Response);
      }
      // 日本語は常に失敗
      return Promise.resolve({ ok: false, status: 503 } as Response);
    });

    await fetchSteamEntity(4, mockFetch as typeof fetch);
    await fetchSteamEntity(4, mockFetch as typeof fetch);
    // 片言語失敗はキャッシュされないため、2回目も fetch が呼ばれる（合計4回）
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

/**
 * Issue #363: 第20号では appdetails が 10 回中 10 回失敗したが、403 / 429 /
 * タイムアウト / success:false の切り分けができなかった。
 * 言語別の失敗理由をログに残すことで、API 側の障害と appId 固有の問題を区別できるようにする。
 */
describe('fetchSteamEntity: 失敗理由の記録', () => {
  it('両言語失敗時に言語別の HTTP ステータスをログに残す', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const status = String(input).includes('l=english') ? 403 : 429;
      return Promise.resolve({ ok: false, status } as Response);
    });

    await fetchSteamEntity(51, mockFetch as typeof fetch);

    const logs = warnedLogs('steam-entity');
    expect(logs).toHaveLength(1);
    expect(logs[0].appId).toBe(51);
    expect(logs[0].english).toBe('HTTP 403');
    expect(logs[0].japanese).toBe('HTTP 429');
  });

  it('success:false は HTTP エラーと区別してログに残す（appId 固有の問題）', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ '52': { success: false } }),
      } as Response)
    );

    await fetchSteamEntity(52, mockFetch as typeof fetch);

    const logs = warnedLogs('steam-entity');
    expect(logs).toHaveLength(1);
    expect(String(logs[0].english)).toContain('success:false');
    expect(String(logs[0].japanese)).toContain('success:false');
  });

  it('ネットワーク例外の内容をログに残す', async () => {
    const mockFetch = vi.fn(() => Promise.reject(new Error('ETIMEDOUT')));

    await fetchSteamEntity(53, mockFetch as typeof fetch);

    const logs = warnedLogs('steam-entity');
    expect(String(logs[0].english)).toContain('ETIMEDOUT');
  });

  it('片言語だけ失敗した場合も、どちらがなぜ落ちたかをログに残す', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('l=english')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              '54': { success: true, data: { name: 'Half Fetched', developers: [] } },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 500 } as Response);
    });

    const entity = await fetchSteamEntity(54, mockFetch as typeof fetch);

    // fail-open の挙動は変えない（取れた言語で続行する）
    expect(entity?.nameEn).toBe('Half Fetched');
    const logs = warnedLogs('steam-entity');
    expect(logs).toHaveLength(1);
    expect(String(logs[0].reason)).toContain('one-language-failed');
    expect(logs[0].english).toBe('ok');
    expect(logs[0].japanese).toBe('HTTP 500');
  });

  it('両言語成功時はログを出さない', async () => {
    const mockFetch = makeFetch({
      'l=english': { '55': { success: true, data: { name: 'Fine', developers: [] } } },
      'l=japanese': { '55': { success: true, data: { name: '問題なし', developers: [] } } },
    });

    await fetchSteamEntity(55, mockFetch as typeof fetch);

    expect(warnedLogs('steam-entity')).toHaveLength(0);
  });
});
