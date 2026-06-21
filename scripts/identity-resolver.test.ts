/**
 * Identity Resolver 単体テスト
 *
 * 設計書「検証方針 > Resolver 単体テスト」の8シナリオに対応。
 * fetch を vi.mock でモック。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveGameIdentity } from './identity-resolver.js';

// fetch をグローバルモック
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Tavily は環境変数が未設定なら実行されない設計。テスト中は未設定として扱う
vi.stubEnv('TAVILY_API_KEY', '');

beforeEach(() => {
  mockFetch.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー: Steam storesearch モックレスポンスを生成
// ─────────────────────────────────────────────────────────────────────────────

function makeSteamSearchResponse(items: { id: number; name: string; date?: string }[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        total: items.length,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          release: i.date ? { steam_release_date: i.date } : undefined,
        })),
      }),
  } as Response;
}

function makeSteamAppDetailsResponse(appId: number, name: string, date?: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        [appId]: {
          success: true,
          data: {
            name,
            release_date: date ? { date } : undefined,
          },
        },
      }),
  } as Response;
}

function makeFailedResponse() {
  return { ok: false, status: 404, json: () => Promise.resolve({}) } as Response;
}

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 1: #116 S&box（IGDB websites null）
// Steam storesearch で appId 590830, confidence=high
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ1: S&box IGDB websites null → storesearch で解決', () => {
  it('Steam storesearch で appId 590830 を解決し confidence=high を返す', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && (url.includes('S%26box') || url.includes('S&box') || url.includes('s-and-box'))) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 590830, name: 'S&box', date: '2026-04-28' }])
        );
      }
      // storesearch ヒット後の appdetails 再確認
      if (url.includes('appdetails') && url.includes('590830')) {
        return Promise.resolve(makeSteamAppDetailsResponse(590830, 'S&box', 'Apr 28, 2026'));
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'S&box',
      igdbSlug: 's-and-box',
      releaseDate: '2026-04-28',
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeDefined();
    expect(steamLink?.url).toContain('590830');
    expect(steamLink?.confidence).toBe('high');
    expect(steamLink?.resolvedBy).toBe('storesearch');
    expect(result.trace.steam?.attempts.some((a) => a.method === 'storesearch' && a.ok)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 2: Switch 専売（スプラトゥーン3）— Steam 空ヒット
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ2: Switch 専売ゲーム — Steam は空ヒット', () => {
  it('Steam storesearch がヒットせず stores に Steam が含まれない', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch')) {
        return Promise.resolve(
          makeSteamSearchResponse([]) // 空ヒット
        );
      }
      // HEAD check（Nintendo URL 検証）は全て失敗
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'Splatoon 3',
      titleJa: 'スプラトゥーン3',
      releaseDate: '2022-09-09',
      platforms: ['Nintendo Switch'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeUndefined();
    expect(result.trace.steam?.attempts.some((a) => a.method === 'storesearch' && !a.ok)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 3: マルチプラットフォーム（PC + PS5 + Xbox）
// Steam + PS + Xbox の3件が stores[] に乗る
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ3: マルチプラットフォーム — Steam + PS の2件が stores[] に乗る', () => {
  it('Steam と PlayStation の両リンクが stores に含まれる', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && url.toLowerCase().includes('elden')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 1245620, name: 'ELDEN RING', date: '2022-02-25' }])
        );
      }
      // storesearch ヒット後の appdetails 再確認
      if (url.includes('appdetails') && url.includes('1245620')) {
        return Promise.resolve(makeSteamAppDetailsResponse(1245620, 'ELDEN RING', 'Feb 25, 2022'));
      }
      // PlayStation HEAD check
      if (url.includes('playstation.com')) {
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }
      return Promise.resolve(makeFailedResponse());
    });

    // IGDB websites に PlayStation URL を含む
    const result = await resolveGameIdentity({
      title: 'Elden Ring',
      releaseDate: '2022-02-25',
      platforms: ['PC', 'PlayStation 5', 'Xbox Series X'],
      igdbWebsites: [
        { url: 'https://www.playstation.com/ja-jp/games/elden-ring/', category: 45 },
      ],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    const psLink = result.stores.find((s) => s.platform === 'playstation');

    expect(steamLink).toBeDefined();
    expect(psLink).toBeDefined();
    expect(steamLink?.url).toContain('1245620');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 4: Switch 専売だが実は Steam にも存在
// Nintendo + Steam 両方が stores[] に乗る
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ4: Switch ゲームが実は Steam にも存在 → 両方 stores[]', () => {
  it('Nintendo URL（IGDB）と Steam storesearch の両方が stores に入る', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && url.toLowerCase().includes('shovel')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 250760, name: 'Shovel Knight: Treasure Trove', date: '2014-06-26' }])
        );
      }
      // storesearch ヒット後の appdetails 再確認
      if (url.includes('appdetails') && url.includes('250760')) {
        return Promise.resolve(makeSteamAppDetailsResponse(250760, 'Shovel Knight: Treasure Trove', 'Jun 26, 2014'));
      }
      // Nintendo HEAD check
      if (url.includes('nintendo.com')) {
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'Shovel Knight',
      releaseDate: '2014-06-26',
      platforms: ['Nintendo Switch', 'PC'],
      igdbWebsites: [
        { url: 'https://www.nintendo.com/jp/software/shovel-knight/', category: 52 },
      ],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    const nintendoLink = result.stores.find((s) => s.platform === 'nintendo');

    expect(steamLink).toBeDefined();
    expect(nintendoLink).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 5: #46 同名異作品 — releaseDate 年差 > 2 で reject
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ5: 同名異作品 — 年差 > 2年でリジェクト', () => {
  it('storesearch でヒットしたが年差 > 2 のため Steam リンクなし', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && url.toLowerCase().includes('doom')) {
        // 1993年の Doom に対して 2016年の Doom がヒット → 年差 23年 → reject
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 2280, name: 'Doom', date: '2016-05-13' }])
        );
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'Doom',
      releaseDate: '1993-12-10',
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 6: #108 日本語タイトル — 英名/日本語名どちらかで一致
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ6: 日本語タイトルで一致', () => {
  it('storesearch が日本語タイトルで一致した場合も high confidence で解決', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && url.toLowerCase().includes('meccha')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 4704690, name: 'MECCHA CHAMELEON', date: '2024-01-01' }])
        );
      }
      if (url.includes('storesearch') && url.includes('%E3%82%81%E3%81%A3%E3%81%A1%E3%82%83')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 4704690, name: 'めっちゃカメレオン', date: '2024-01-01' }])
        );
      }
      // storesearch ヒット後の appdetails 再確認
      if (url.includes('appdetails') && url.includes('4704690')) {
        return Promise.resolve(makeSteamAppDetailsResponse(4704690, 'MECCHA CHAMELEON', 'Jan 1, 2024'));
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'MECCHA CHAMELEON',
      titleJa: 'めっちゃカメレオン',
      releaseDate: '2024-01-01',
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeDefined();
    expect(steamLink?.confidence).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 7: 記号タイトル（S&box, Half-Life: Alyx）— 正規化後に突合成功
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ7: 記号タイトル — 正規化後に突合成功', () => {
  it('Half-Life: Alyx が Half Life Alyx と一致して Steam URL を解決する', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('storesearch') && url.toLowerCase().includes('half')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 546560, name: 'Half-Life: Alyx', date: '2020-03-23' }])
        );
      }
      if (url.includes('appdetails') && url.includes('546560')) {
        return Promise.resolve(makeSteamAppDetailsResponse(546560, 'Half-Life: Alyx', 'Mar 23, 2020'));
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'Half-Life: Alyx',
      releaseDate: '2020-03-23',
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeDefined();
    expect(steamLink?.url).toContain('546560');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ 8: 全失敗 — stores: [], trace に全失敗理由
// ─────────────────────────────────────────────────────────────────────────────
describe('シナリオ8: 全経路失敗 — stores 空、trace に失敗理由', () => {
  it('全ての fetch が失敗した場合に stores が空で trace に失敗理由が記録される', async () => {
    mockFetch.mockResolvedValue(makeFailedResponse());

    const result = await resolveGameIdentity({
      title: 'Unknown Game XYZ',
      releaseDate: '2099-01-01',
      platforms: ['PC'],
    });

    expect(result.stores).toHaveLength(0);

    // Steam の全経路が失敗している
    expect(result.trace.steam?.attempts.every((a) => !a.ok)).toBe(true);

    // trace に失敗理由が記録されている
    const failedAttempts = result.trace.steam?.attempts.filter((a) => !a.ok) ?? [];
    expect(failedAttempts.length).toBeGreaterThan(0);
    expect(failedAttempts.every((a) => typeof a.reason === 'string')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// knownSteamAppId 経路のテスト
// ─────────────────────────────────────────────────────────────────────────────
describe('knownSteamAppId 経路', () => {
  it('knownSteamAppId が正しければ appdetails 検証なしで high confidence を返す', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('appdetails') && url.includes('590830')) {
        return Promise.resolve(
          makeSteamAppDetailsResponse(590830, 'S&box', '2026-04-28')
        );
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'S&box',
      releaseDate: '2026-04-28',
      knownSteamAppId: 590830,
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    expect(steamLink).toBeDefined();
    expect(steamLink?.url).toBe('https://store.steampowered.com/app/590830/');
    expect(steamLink?.confidence).toBe('high');
    expect(steamLink?.resolvedBy).toBe('cache');
  });

  it('knownSteamAppId が別ゲームの appId（name mismatch）→ storesearch にフォールバック', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('appdetails') && url.includes('999999')) {
        // 全く別のゲーム名を返す
        return Promise.resolve(
          makeSteamAppDetailsResponse(999999, 'Completely Different Game', '2020-01-01')
        );
      }
      if (url.includes('storesearch') && url.toLowerCase().includes('my')) {
        return Promise.resolve(
          makeSteamSearchResponse([{ id: 111111, name: 'My Game', date: '2022-01-01' }])
        );
      }
      if (url.includes('appdetails') && url.includes('111111')) {
        return Promise.resolve(makeSteamAppDetailsResponse(111111, 'My Game', 'Jan 1, 2022'));
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'My Game',
      releaseDate: '2022-01-01',
      knownSteamAppId: 999999,
      platforms: ['PC'],
    });

    const steamLink = result.stores.find((s) => s.platform === 'steam');
    // storesearch で解決されるはず
    expect(steamLink).toBeDefined();
    expect(steamLink?.resolvedBy).toBe('storesearch');
    expect(result.trace.steam?.attempts.find((a) => a.method === 'known-appid')?.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlayStation の IGDB websites 経路のテスト
// ─────────────────────────────────────────────────────────────────────────────
describe('PlayStation IGDB websites 経路', () => {
  it('IGDB に PlayStation URL がある場合に HEAD 200 で高確信度リンクを返す', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('playstation.com')) {
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }
      // Steam storesearch は空ヒット
      if (url.includes('storesearch')) {
        return Promise.resolve(makeSteamSearchResponse([]));
      }
      return Promise.resolve(makeFailedResponse());
    });

    const result = await resolveGameIdentity({
      title: 'God of War',
      releaseDate: '2018-04-20',
      platforms: ['PlayStation 4'],
      igdbWebsites: [
        { url: 'https://www.playstation.com/ja-jp/games/god-of-war/', category: 45 },
      ],
    });

    const psLink = result.stores.find((s) => s.platform === 'playstation');
    expect(psLink).toBeDefined();
    // Nintendo/PlayStation の IGDB 経路は HEAD のみで名前確認しないため medium
    expect(psLink?.confidence).toBe('medium');
    expect(psLink?.resolvedBy).toBe('igdb-website');
    expect(psLink?.url).toBe('https://www.playstation.com/ja-jp/games/god-of-war/');
  });
});
