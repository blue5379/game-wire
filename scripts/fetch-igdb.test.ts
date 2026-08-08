/**
 * fetch-igdb の純関数ユニットテスト
 *
 * Issue #50 の根本因である `isRelevantSearchResult` の単語マッチが甘い問題、
 * および Issue #49b 対策の websites→公式URL推定ロジックの動作を保証する。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  __test,
  searchGameBySteamAppId,
  searchGameByName,
  enrichGameWithIGDB,
  fetchIGDBData,
} from './fetch-igdb.js';

const {
  isRelevantSearchResult,
  pickOfficialUrlFromWebsites,
  mapRawGameToIGDBGame,
  buildIgdbCommonFilters,
} = __test;

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

// ─────────────────────────────────────────────────────────────────────────────
// searchGameByName — mainGameOnly オプションで呼び出し元がフィルタ適用を切り替える（Issue #208）
//
// 設計変更の経緯: 当初 searchGameByName に無条件でフィルタ（成人向け除外 & Main Game 限定）を
// 適用したが、この関数は特集経路以外（メタデータ補完）からも呼ばれる。補完経路に
// game_type = 0 を強制すると DLC/エディションの正規メタデータ取得が壊れる
// （実測: Gothic 1 Remake, ARK: Survival Ascended 等が0件化）。
// そのため既定 false（フィルタ無し = 修正前と同一挙動）、mainGameOnly: true を渡した
// 呼び出し元（特集記事の実在検証経路）のみフィルタを適用する方式に変更した。
// ─────────────────────────────────────────────────────────────────────────────
describe('searchGameByName (Issue #208)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockIgdbResponse(games: unknown[]): void {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(games),
    }) as unknown as typeof fetch;
  }

  it('mainGameOnly 未指定（既定）のとき where 句を付けず、修正前と同形のクエリになる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Elden Ring', 'client-id', 'token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/games');
    const body = String((init as { body: string }).body);
    // where 句そのものが出ない（空の `where ;` も出さない）
    expect(body).not.toContain('where');
    // search / fields / limit のみで構成される
    expect(body).toMatch(/search\s+"[^"]*"\s*;/);
    expect(body).toMatch(/fields\s+[^;]+;/);
    expect(body).toMatch(/limit\s+\d+\s*;/);
  });

  it('mainGameOnly: false を明示指定したときも where 句を付けない（境界値）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Elden Ring', 'client-id', 'token', { mainGameOnly: false });

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).not.toContain('where');
  });

  it('mainGameOnly: true のとき buildIgdbCommonFilters() 由来の where 句を付ける', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Elden Ring', 'client-id', 'token', { mainGameOnly: true });

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toContain('where');
    expect(body).toContain(__test.buildIgdbCommonFilters());
  });

  it('mainGameOnly: true のとき where 句が game_type = 0 と themes != (42) を含む', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Elden Ring', 'client-id', 'token', { mainGameOnly: true });

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toContain('game_type = 0');
    expect(body).toContain('themes != (42)');
  });

  it('回帰防止: searchGameBySteamAppId のクエリには where フィルタを含めない（フィールド選択とは区別する）', async () => {
    // IGDB_GAME_FIELDS は searchGameByName と共有されており、後続 PR で game_type を
    // フィールドとして追加すると `not.toContain('game_type')` は誤って失敗する。
    // ここでは「where 句としてのフィルタ」の有無だけを見る。
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameBySteamAppId(1087090, 'client-id', 'token');

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).not.toContain('where game_type');
    expect(body).not.toContain('game_type = 0');
    expect(body).not.toContain('themes != (42)');
  });

  it('mainGameOnly: true のときクエリ構文が search / fields / where / limit の各句を ; 区切りで含む', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Elden Ring', 'client-id', 'token', { mainGameOnly: true });

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatch(/search\s+"[^"]*"\s*;/);
    expect(body).toMatch(/fields\s+[^;]+;/);
    expect(body).toMatch(/where\s+[^;]+;/);
    expect(body).toMatch(/limit\s+\d+\s*;/);
  });

  it('検索語にダブルクォートを含む場合もエスケープを保ったまま where 句が残る（mainGameOnly: true）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchGameByName('Baldur"s Gate 3', 'client-id', 'token', { mainGameOnly: true });

    const body = String((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toContain('Baldur\\"s Gate 3');
    expect(body).toContain('game_type = 0');
    expect(body).toContain('themes != (42)');
  });

  it('フィルタ適用後に0件が返る場合は null を返す（既存の0件パスの回帰防止）', async () => {
    mockIgdbResponse([]);
    const result = await searchGameByName('Elden Ring', 'client-id', 'token', { mainGameOnly: true });
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameWithIGDB — mainGameOnly の伝播範囲（Issue #208）
//
// mainGameOnly は searchGameByName にのみ伝播し、searchGameBySteamAppId（appId 逆引き）
// には絶対に伝播しない。appId は名前より強い同一性シグナルであり、DLC の appId 逆引きが
// フィルタで壊れると救済経路が失われるため。
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameWithIGDB — mainGameOnly propagation (Issue #208)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.IGDB_CLIENT_ID;
    delete process.env.IGDB_CLIENT_SECRET;
  });

  it('steamAppId 指定時、mainGameOnly: true を渡しても appId 逆引きクエリにはフィルタが乗らない', async () => {
    process.env.IGDB_CLIENT_ID = 'test-client-id';
    process.env.IGDB_CLIENT_SECRET = 'test-client-secret';

    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (String(url).includes('id.twitch.tv')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
        });
      }
      // appId 逆引きが1件ヒットするようにする（見つかれば名前検索は呼ばれない）
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Some Game', slug: 'some-game' },
          ]),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await enrichGameWithIGDB('Some Game', {
      steamAppId: 123456,
      mainGameOnly: true,
    });

    expect(result).not.toBeNull();
    const igdbCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('api.igdb.com')
    );
    // appId 逆引きヒット時は名前検索を呼ばないため IGDB 呼び出しは1回のみ
    expect(igdbCalls.length).toBe(1);
    const body = String((igdbCalls[0][1] as { body: string }).body);
    expect(body).toContain('external_games.uid = "123456"');
    expect(body).not.toContain('where game_type');
    expect(body).not.toContain('game_type = 0');
    expect(body).not.toContain('themes != (42)');
  });

  it('mainGameOnly: true を渡すと名前検索フォールバック経路にはフィルタが乗る', async () => {
    process.env.IGDB_CLIENT_ID = 'test-client-id';
    process.env.IGDB_CLIENT_SECRET = 'test-client-secret';

    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (String(url).includes('id.twitch.tv')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
        });
      }
      // appId 逆引きは0件 → 名前検索へフォールバック
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await enrichGameWithIGDB('Some Game', {
      steamAppId: 123456,
      mainGameOnly: true,
    });

    const igdbCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('api.igdb.com')
    );
    // appId 逆引き(0件) + 名前検索フォールバックで2回
    expect(igdbCalls.length).toBe(2);
    const nameSearchBody = String((igdbCalls[1][1] as { body: string }).body);
    expect(nameSearchBody).toContain('where');
    expect(nameSearchBody).toContain('game_type = 0');
    expect(nameSearchBody).toContain('themes != (42)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildIgdbCommonFilters — IGDB クエリで共通使用するフィルタ（Issue #207）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildIgdbCommonFilters (Issue #207)', () => {
  it('成人向け除外（Erotic = 42）と Main Game 限定（game_type = 0）を含む', () => {
    const filters = buildIgdbCommonFilters();
    // 正しいフィルタが含まれること（リテラル値で検証）
    expect(filters).toContain('game_type = 0');
    expect(filters).toContain('themes != (42)');
  });

  it('旧バグの themes != (37) を含まない（回帰防止）', () => {
    const filters = buildIgdbCommonFilters();
    // 間違った旧フィルタが含まれていないこと
    expect(filters).not.toContain('themes != (37)');
  });

  it('生成される文字列は IGDB クエリ where 句に埋め込める形式', () => {
    const filters = buildIgdbCommonFilters();
    // & で連結された条件式であること（クエリに埋め込み可能）
    expect(filters).toMatch(/game_type\s*=\s*0\s*&\s*themes\s*!=\s*\(\s*42\s*\)/);
  });

  it('gameTypes を複数指定すると括弧付きリストになり、成人向け除外は維持される', () => {
    const filters = buildIgdbCommonFilters({ gameTypes: [0, 8, 9] });
    expect(filters).toContain('game_type = (0,8,9)');
    expect(filters).toContain('themes != (42)');
  });

  it('境界値: gameTypes 要素1個（既定値）は括弧なしの game_type = 0 になる', () => {
    const filters = buildIgdbCommonFilters({ gameTypes: [0] });
    expect(filters).toContain('game_type = 0');
    expect(filters).not.toContain('game_type = (0)');
  });

  it('境界値: gameTypes 要素1個（既定と異なる値）でも括弧なしになる', () => {
    const filters = buildIgdbCommonFilters({ gameTypes: [8] });
    expect(filters).toContain('game_type = 8');
    expect(filters).not.toContain('game_type = (8)');
  });

  it('引数なし呼び出しと { gameTypes: [0] } の出力は文字列として完全一致する', () => {
    expect(buildIgdbCommonFilters({ gameTypes: [0] })).toBe(buildIgdbCommonFilters());
  });

  it('gameTypes に空配列を渡すと例外を投げる（無音で壊れたクエリを生成しない）', () => {
    expect(() => buildIgdbCommonFilters({ gameTypes: [] })).toThrow(
      /gameTypes must not be empty/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchIGDBData — 3つの母集団クエリが確実にフィルタを使用することを検証（Issue #207 統合テスト）
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchIGDBData - pool queries use filters (Issue #207)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.IGDB_CLIENT_ID;
    delete process.env.IGDB_CLIENT_SECRET;
  });

  it('3つの母集団クエリすべてが game_type = 0 & themes != (42) を含む', async () => {
    process.env.IGDB_CLIENT_ID = 'test-client-id';
    process.env.IGDB_CLIENT_SECRET = 'test-client-secret';

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      // Twitch OAuth token endpoint
      if (String(url).includes('id.twitch.tv')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
        });
      }
      // IGDB API endpoints
      if (String(url).includes('api.igdb.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchIGDBData();

    // IGDB API への呼び出しを抽出（Twitch OAuth 以外）
    const igdbCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('api.igdb.com')
    );
    const igdbBodies = igdbCalls.map(([, init]) => {
      const body = (init as { body?: string })?.body ?? '';
      return body;
    });

    // 3つの母集団クエリが投げられたこと
    expect(igdbBodies.length).toBe(3);

    // すべてのクエリが game_type = 0 & themes != (42) を含むこと（全体チェック）
    for (const body of igdbBodies) {
      expect(body).toContain('game_type = 0');
      expect(body).toContain('themes != (42)');
    }

    // 各クエリを区別してチェック（失敗時にどのクエリか特定できるように）
    const recentQuery = igdbBodies.find((b) => b.includes('hypes > 5'));
    const classicQuery = igdbBodies.find((b) => b.includes('hypes > 100'));
    const indieQuery = igdbBodies.find((b) => b.includes('rating_count > 5'));

    expect(recentQuery).toBeDefined();
    expect(recentQuery).toContain('game_type = 0');
    expect(recentQuery).toContain('themes != (42)');

    expect(classicQuery).toBeDefined();
    expect(classicQuery).toContain('game_type = 0');
    expect(classicQuery).toContain('themes != (42)');

    expect(indieQuery).toBeDefined();
    expect(indieQuery).toContain('game_type = 0');
    expect(indieQuery).toContain('themes != (42)');
  });
});
