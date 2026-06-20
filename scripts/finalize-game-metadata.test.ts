import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData } from './types';

// モジュールを vi.mock で差し込む（ネットワーク・IGDB を切り離す）
vi.mock('./fetch-igdb.js', () => ({
  enrichGameWithIGDB: vi.fn().mockResolvedValue(null),
}));
vi.mock('./url-health.js', () => ({
  headOk: vi.fn().mockResolvedValue(true),
  getImageOrientation: vi.fn().mockResolvedValue('portrait'),
}));

import { finalizeGameMetadata } from './finalize-game-metadata';
import { enrichGameWithIGDB } from './fetch-igdb.js';
import { headOk, getImageOrientation } from './url-health.js';

const mockEnrich = vi.mocked(enrichGameWithIGDB);
const mockHeadOk = vi.mocked(headOk);
const mockGetOrientation = vi.mocked(getImageOrientation);

function makeGame(overrides: Partial<GameData>): GameData {
  return {
    title: 'Test Game',
    normalizedTitle: 'test game',
    genres: [],
    platforms: [],
    source: ['steam'],
    ...overrides,
  };
}

const REQUIRED_ALL = { cover: true, developer: true, sourceUrl: true, steamRecommendations: true } as const;
const REQUIRED_NO_DEV = { cover: true, developer: false, sourceUrl: true, steamRecommendations: true } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockHeadOk.mockResolvedValue(true);
  mockGetOrientation.mockResolvedValue('portrait');
  mockEnrich.mockResolvedValue(null);
});

describe('finalizeGameMetadata - date mismatch', () => {
  it('30-day diff → ok', async () => {
    const game = makeGame({
      releaseDate: '2026-01-01',
      steamAppId: 12345,
      coverImage: 'https://example.com/cover.jpg',
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    // IGDB returns release date 30 days later
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      releaseDate: '2026-01-31',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/test.jpg',
    } as any);
    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
  });

  it('100-day diff → date-mismatch', async () => {
    const game = makeGame({
      releaseDate: '2026-01-01',
      steamAppId: 12345,
      coverImage: 'https://example.com/cover.jpg',
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      releaseDate: '2026-04-11',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/test.jpg',
    } as any);
    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('date-mismatch');
  });

  it('only one date present → no date check', async () => {
    const game = makeGame({
      // no releaseDate in game
      steamAppId: 12345,
      coverImage: 'https://example.com/cover.jpg',
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      releaseDate: '2026-04-11',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/test.jpg',
    } as any);
    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
  });
});

describe('finalizeGameMetadata - coverImage priority chain', () => {
  it('IGDB cover URL HEAD 200 → coverImage = IGDB URL, orientation = portrait', async () => {
    const game = makeGame({
      steamAppId: 12345,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    const igdbCoverUrl = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1234.jpg';
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      coverUrl: igdbCoverUrl,
    } as any);
    mockHeadOk.mockResolvedValue(true);
    mockGetOrientation.mockResolvedValue('portrait');

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.coverImage).toBe(igdbCoverUrl);
      expect(result.game.coverImageOrientation).toBe('portrait');
    }
  });

  it('IGDB cover HEAD 404 → falls back to Steam CDN', async () => {
    const game = makeGame({
      steamAppId: 99999,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/99999' },
    });
    const igdbCoverUrl = 'https://images.igdb.com/igdb/image/upload/t_cover_big/broken.jpg';
    const steamCdnUrl = 'https://cdn.cloudflare.steamstatic.com/steam/apps/99999/library_600x900.jpg';
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      coverUrl: igdbCoverUrl,
    } as any);
    // IGDB cover HEAD fails, Steam CDN HEAD succeeds
    mockHeadOk.mockImplementation((url) => Promise.resolve(url === steamCdnUrl));
    mockGetOrientation.mockResolvedValue('portrait');

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.coverImage).toBe(steamCdnUrl);
      expect(result.game.coverImageOrientation).toBe('portrait');
    }
  });

  it('IGDB and Steam CDN both 404 → uses Steam Storefront header_image (landscape)', async () => {
    const game = makeGame({
      steamAppId: 4704690,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/4704690' },
    });
    const headerImageUrl = 'https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg';
    mockEnrich.mockResolvedValue(null);
    // Steam CDN library_600x900 → 404; Storefront header_image → 200
    mockHeadOk.mockImplementation((url: string) =>
      Promise.resolve(url === headerImageUrl)
    );
    mockGetOrientation.mockResolvedValue('landscape');

    // Stub Storefront API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '4704690': {
          success: true,
          data: {
            header_image: headerImageUrl,
            release_date: { coming_soon: false, date: '2026年6月9日' },
            developers: ['lemorion_1224'],
            publishers: ['lemorion_1224'],
            screenshots: [],
            recommendations: { total: 11179 },
          },
        },
      }),
    } as any);

    const result = await finalizeGameMetadata(game, REQUIRED_NO_DEV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.coverImage).toBe(headerImageUrl);
      expect(result.game.coverImageOrientation).toBe('landscape');
      expect(result.game.steamRecommendations).toBe(11179);
      // steamRawDeveloper should be saved even though isQualifiedCompanyName rejects it
      expect(result.game.steamRawDeveloper).toBe('lemorion_1224');
    }
  });

  it('all cover sources fail → coverImage = undefined → still-missing-required', async () => {
    const game = makeGame({
      steamAppId: 99999,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/99999' },
    });
    mockEnrich.mockResolvedValue(null);
    mockHeadOk.mockResolvedValue(false);
    // Storefront API returns no header_image
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '99999': {
          success: true,
          data: {
            header_image: '',  // 空 → フォールバックなし
            release_date: { coming_soon: false, date: '2026年1月1日' },
            developers: ['Some Studio'],
            publishers: ['Some Publisher'],
            screenshots: [],
          },
        },
      }),
    } as any);

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('still-missing-required');
  });

  it('portrait IGDB cover (264x374) → orientation portrait', async () => {
    const game = makeGame({
      steamAppId: 12345,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/portrait.jpg',
    } as any);
    mockHeadOk.mockResolvedValue(true);
    mockGetOrientation.mockResolvedValue('portrait');

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.coverImageOrientation).toBe('portrait');
  });

  it('landscape Steam header_image (460x215) → orientation landscape', async () => {
    const game = makeGame({
      steamAppId: 4704690,
      developer: 'lemorion_1224',
      sourceUrls: { steam: 'https://store.steampowered.com/app/4704690' },
    });
    mockEnrich.mockResolvedValue(null);
    // Steam CDN HEAD fails; header_image HEAD succeeds
    mockHeadOk.mockImplementation((url: string) =>
      Promise.resolve(url.includes('header'))
    );
    mockGetOrientation.mockResolvedValue('landscape');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '4704690': {
          success: true,
          data: {
            header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg',
            release_date: { coming_soon: false, date: '2026年6月9日' },
            developers: ['lemorion_1224'],
            publishers: ['lemorion_1224'],
            screenshots: [],
          },
        },
      }),
    } as any);

    const result = await finalizeGameMetadata(game, REQUIRED_NO_DEV);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.coverImageOrientation).toBe('landscape');
  });
});

describe('finalizeGameMetadata - IGDB field completion', () => {
  it('IGDB match → developer, publisher補完', async () => {
    const game = makeGame({
      steamAppId: 12345,
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/exists.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      developer: 'Completed Dev',
      publisher: 'Completed Pub',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/exists.jpg',
    } as any);
    mockHeadOk.mockResolvedValue(true);
    mockGetOrientation.mockResolvedValue('portrait');

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.developer).toBe('Completed Dev');
      expect(result.game.publisher).toBe('Completed Pub');
    }
  });

  it('existing developer is NOT overwritten by IGDB', async () => {
    const game = makeGame({
      developer: 'Original Dev',
      steamAppId: 12345,
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/exists.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue({
      id: 1, name: 'Test Game', slug: 'test-game',
      developer: 'IGDB Dev',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/exists.jpg',
    } as any);

    const result = await finalizeGameMetadata(game, REQUIRED_ALL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.developer).toBe('Original Dev');
  });
});

describe('finalizeGameMetadata - fetch count constraint', () => {
  it('IGDB and Storefront are each called at most once per candidate', async () => {
    const game = makeGame({
      steamAppId: 12345,
      // No coverImage or developer → triggers both IGDB and Storefront
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue(null);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '12345': {
          success: true,
          data: {
            header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/12345/header.jpg',
            release_date: { coming_soon: false, date: '2026年1月1日' },
            developers: ['Some Studio'],
            publishers: ['Some Publisher'],
            screenshots: [],
            recommendations: { total: 100 },
          },
        },
      }),
    } as any);
    global.fetch = fetchMock;

    await finalizeGameMetadata(game, REQUIRED_ALL);

    // IGDB は 1 回のみ
    expect(mockEnrich).toHaveBeenCalledTimes(1);
    // Steam Storefront API は 1 回のみ（needsStorefrontCompletion が true の間 1 回だけ fetch する）
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('store.steampowered.com/api/appdetails');
    expect(calledUrl).toContain('12345');
  });
});

describe('finalizeGameMetadata - structured error logging', () => {
  it('network error produces console.warn with structured JSON containing scope and step', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = makeGame({
      steamAppId: 12345,
      developer: 'Indie Dev',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    });
    mockEnrich.mockResolvedValue(null);
    // HEAD request throws network error → should produce structured warn
    mockHeadOk.mockRejectedValue(new Error('network failure'));
    global.fetch = vi.fn().mockRejectedValue(new Error('storefront network failure'));

    await finalizeGameMetadata(game, REQUIRED_ALL);

    expect(warnSpy).toHaveBeenCalled();

    // Every warn call must emit valid JSON with scope and step fields
    const jsonLogs = warnSpy.mock.calls
      .flat()
      .map((arg) => {
        try { return JSON.parse(String(arg)); } catch { return null; }
      })
      .filter(Boolean);

    expect(jsonLogs.length).toBeGreaterThan(0);
    for (const log of jsonLogs) {
      expect(log).toHaveProperty('scope', 'finalize-game-metadata');
      expect(log).toHaveProperty('step');
      expect(typeof log.step).toBe('string');
    }

    warnSpy.mockRestore();
  });
});
