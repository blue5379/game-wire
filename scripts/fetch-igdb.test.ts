/**
 * fetch-igdb の純関数ユニットテスト
 *
 * Issue #50 の根本因である `isRelevantSearchResult` の単語マッチが甘い問題、
 * および Issue #49b 対策の websites→公式URL推定ロジックの動作を保証する。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { __test, searchGameBySteamAppId } from './fetch-igdb.js';

const { isRelevantSearchResult, pickOfficialUrlFromWebsites, mapRawGameToIGDBGame } =
  __test;

describe('isRelevantSearchResult', () => {
  it('完全一致するタイトルは true', () => {
    expect(isRelevantSearchResult('Elden Ring', 'Elden Ring')).toBe(true);
  });

  it('部分文字列で結果がクエリを含む場合は true', () => {
    expect(
      isRelevantSearchResult('Hollow Knight', 'Hollow Knight: Silksong')
    ).toBe(true);
  });

  it('単語クエリ（"Balatro"）で完全一致は true', () => {
    expect(isRelevantSearchResult('Balatro', 'Balatro')).toBe(true);
  });

  it('Issue #50: stopword + 汎用語のみの一致は false にする', () => {
    // "The Legend of You" を検索して "The Legend of Heroes: Trails in the Sky" が
    // 返ってきた場合、共通単語は the/legend/of のみ → 別作品として拒絶すべき
    expect(
      isRelevantSearchResult(
        'The Legend of You',
        'The Legend of Heroes: Trails in the Sky'
      )
    ).toBe(false);
  });

  it('意味語が2語以上共通する場合は true', () => {
    // "Trails in the Sky FC" → "The Legend of Heroes: Trails in the Sky"
    // 共通: trails, sky（stopword除外後で2語）
    expect(
      isRelevantSearchResult(
        'Trails in the Sky FC',
        'The Legend of Heroes: Trails in the Sky'
      )
    ).toBe(true);
  });

  it('クエリ全体が stopword のみの場合は false', () => {
    expect(isRelevantSearchResult('the of and', 'The Legend of Zelda')).toBe(
      false
    );
  });

  it('1単語クエリ（"Hades"）が結果のいずれかと一致する場合は true', () => {
    expect(isRelevantSearchResult('Hades', 'Hades II')).toBe(true);
  });

  it('複数語クエリで stopword 以外が1語しか共通しない場合は false', () => {
    // "Final Fantasy XVI" vs "Final Battle" — 共通は "final" のみ
    expect(isRelevantSearchResult('Final Fantasy XVI', 'Final Battle')).toBe(
      false
    );
  });
});

describe('pickOfficialUrlFromWebsites', () => {
  it('category=1 のサイトを採用', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://en.wikipedia.org/wiki/Foo', category: 3 },
        { url: 'https://example.com/official', category: 1 },
      ])
    ).toBe('https://example.com/official');
  });

  it('空配列・undefined は undefined', () => {
    expect(pickOfficialUrlFromWebsites([])).toBeUndefined();
    expect(pickOfficialUrlFromWebsites(undefined)).toBeUndefined();
  });

  // Issue #117: ブロックリスト方式から許可リスト方式（category=1 のみ）へ転換。
  // 過去のフォールバック（非SNS・非ストアの先頭URLを機械採用）は
  // 無関係なスタジオサイトを採用してしまう構造的欠陥があったため廃止。
  it('Issue #117: category=1 が無ければ undefined（非SNS・非ストアURLでもフォールバック採用しない）', () => {
    // 過去はこの並びで ioi.dk のURLを返していたが、現在は category=1 不在のため undefined。
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://x.com/foo' },
        { url: 'https://store.steampowered.com/app/123' },
        { url: 'https://ioi.dk/007firstlightgame' },
      ])
    ).toBeUndefined();
  });

  it('Issue #117: category=1 が無い無関係サイトは採用しない（theminesa.studio パターン回帰防止）', () => {
    // Dungeon Blitz R の IGDB websites に theminesa.studio が登録されていた事象。
    // 旧フォールバックでは採用されていたが、新仕様では弾く。
    expect(
      pickOfficialUrlFromWebsites([{ url: 'https://theminesa.studio/' }])
    ).toBeUndefined();
  });

  it('Issue #117: Wikipedia/Wiki/Fandom は category=1 が無ければ採用しない', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://en.wikipedia.org/wiki/Foo' },
        { url: 'https://foo.fandom.com/wiki/Bar' },
      ])
    ).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRawGameToIGDBGame — searchGameByName と searchGameBySteamAppId 共通の変換ロジック
// ─────────────────────────────────────────────────────────────────────────────
describe('mapRawGameToIGDBGame', () => {
  it('involved_companies から developer/publisher を抽出し、画像URLを高解像度化する', () => {
    const result = mapRawGameToIGDBGame({
      id: 119133,
      name: 'Elden Ring',
      slug: 'elden-ring',
      summary: 'An action RPG.',
      genres: [{ name: 'Role-playing (RPG)' }],
      platforms: [{ name: 'PC (Microsoft Windows)' }],
      first_release_date: 1645747200, // 2022-02-25
      involved_companies: [
        { company: { name: 'Bandai Namco', country: 392 }, developer: false, publisher: true },
        { company: { name: 'FromSoftware', country: 392 }, developer: true, publisher: false },
      ],
      cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg' },
      screenshots: [{ url: '//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg' }],
      rating: 95,
      rating_count: 1000,
      websites: [{ url: 'https://store.steampowered.com/app/1245620', category: 13 }],
    });

    expect(result.id).toBe(119133);
    expect(result.developer).toBe('FromSoftware');
    expect(result.publisher).toBe('Bandai Namco');
    expect(result.developerCountry).toBe('日本');
    expect(result.releaseDate).toBe('2022-02-25');
    expect(result.coverUrl).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg'
    );
    expect(result.screenshotUrls).toEqual([
      'https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg',
    ]);
    expect(result.steamUrl).toBe('https://store.steampowered.com/app/1245620');
  });

  it('cover / screenshots / involved_companies が無くてもクラッシュしない', () => {
    const result = mapRawGameToIGDBGame({
      id: 1,
      name: 'Minimal',
      slug: 'minimal',
    });
    expect(result.developer).toBeUndefined();
    expect(result.coverUrl).toBeUndefined();
    expect(result.screenshotUrls).toBeUndefined();
    expect(result.releaseDate).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchGameBySteamAppId — Steam appId による IGDB 逆引き（Issue #166 ①）
// ─────────────────────────────────────────────────────────────────────────────
describe('searchGameBySteamAppId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockIgdbResponse(games: unknown[]): void {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(games),
    }) as unknown as typeof fetch;
  }

  it('games エンドポイントへ external_games ネストフィルタと uid を含むクエリを投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameBySteamAppId(1087090, 'client-id', 'token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/games');
    const body = String((init as { body: string }).body);
    // Steam を示す external_game_source=1 と、appId を文字列化した uid を検証
    expect(body).toContain('external_games.external_game_source = 1');
    expect(body).toContain('external_games.uid = "1087090"');
  });

  it('appId 逆引きヒット時、Steam名と IGDB名が食い違っても appId に対応する結果を返す', async () => {
    // Steam 上の候補は "Brick Game"（新作）だが、IGDB 側の正式名が異なるケースを想定。
    // 名前一致チェックを通さないため、appId に紐づく正しい結果を返せることを検証する。
    mockIgdbResponse([
      {
        id: 999,
        name: 'BRICK GAME (Retro Arcade Tribute)',
        slug: 'brick-game-retro-arcade-tribute',
        first_release_date: 1751587200, // 2025-07-04 付近
        involved_companies: [
          { company: { name: 'Daniel Shimmyo' }, developer: true, publisher: false },
        ],
        genres: [{ name: 'Arcade' }],
        platforms: [{ name: 'PC (Microsoft Windows)' }],
        websites: [{ url: 'https://store.steampowered.com/app/1087090', category: 13 }],
      },
    ]);

    const result = await searchGameBySteamAppId(1087090, 'client-id', 'token');

    expect(result).not.toBeNull();
    expect(result?.id).toBe(999);
    expect(result?.name).toBe('BRICK GAME (Retro Arcade Tribute)');
    expect(result?.developer).toBe('Daniel Shimmyo');
    expect(result?.steamUrl).toBe('https://store.steampowered.com/app/1087090');
  });

  it('IGDB に Steam website が無くても、逆引きに使った appId で steamUrl を補完する', async () => {
    // 表記ゆれケース: IGDB 正式名が Steam 名と異なり、かつ websites に Steam リンクが無い。
    // 逆引きで確定した appId を steamUrl に補完することで、下流の appId 整合判定を成立させる。
    mockIgdbResponse([
      {
        id: 777,
        name: 'Canonical Different Name',
        slug: 'canonical-different-name',
        websites: [{ url: 'https://example.com/official', category: 1 }],
      },
    ]);

    const result = await searchGameBySteamAppId(1087090, 'client-id', 'token');

    expect(result?.steamUrl).toBe('https://store.steampowered.com/app/1087090');
  });

  it('IGDB に Steam website がある場合はそれを優先する（補完で上書きしない）', async () => {
    mockIgdbResponse([
      {
        id: 888,
        name: 'Game',
        slug: 'game',
        websites: [{ url: 'https://store.steampowered.com/app/1245620', category: 13 }],
      },
    ]);

    const result = await searchGameBySteamAppId(1245620, 'client-id', 'token');
    expect(result?.steamUrl).toBe('https://store.steampowered.com/app/1245620');
  });

  it('appId 逆引きが0件なら null を返す', async () => {
    mockIgdbResponse([]);
    const result = await searchGameBySteamAppId(1087090, 'client-id', 'token');
    expect(result).toBeNull();
  });

  it('API エラー時は null を返す（fail-open）', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    }) as unknown as typeof fetch;

    const result = await searchGameBySteamAppId(1087090, 'client-id', 'token');
    expect(result).toBeNull();
  });
});
