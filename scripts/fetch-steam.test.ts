import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSameSteamApp, fetchSteamAppName, fetchSteamData } from './fetch-steam';

describe('isSameSteamApp - Issue #102 appId 取り違え検出', () => {
  // Vol.12 動作確認で実際に観測された取り違えケース
  it('「サイバーパンク2077 アルティメットエディション」 vs 「STAR WARS™ Empire at War - Gold Pack」→ 別ゲーム', () => {
    expect(
      isSameSteamApp(
        'サイバーパンク2077 アルティメットエディション',
        'STAR WARS™ Empire at War - Gold Pack'
      )
    ).toBe(false);
  });

  it('完全一致 → 同じゲーム', () => {
    expect(isSameSteamApp('Cyberpunk 2077', 'Cyberpunk 2077')).toBe(true);
  });

  it('前方一致（エディション拡張）→ 同じゲーム', () => {
    // Steam の Featured Categories が短縮名、Storefront が正式名というパターン
    expect(
      isSameSteamApp('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')
    ).toBe(true);
    expect(
      isSameSteamApp(
        'Cyberpunk 2077 アルティメットエディション',
        'Cyberpunk 2077'
      )
    ).toBe(true);
  });

  it('™ ® © の有無に関わらず一致', () => {
    expect(isSameSteamApp('Counter-Strike™ 2', 'Counter-Strike 2')).toBe(true);
  });

  it('大文字小文字の違いを無視', () => {
    expect(isSameSteamApp('CYBERPUNK 2077', 'cyberpunk 2077')).toBe(true);
  });

  it('空白の有無を無視', () => {
    expect(isSameSteamApp('Half Life 2', 'Half-Life 2')).toBe(true);
  });

  it('全く違うゲーム → 別ゲーム', () => {
    expect(isSameSteamApp('Dota 2', 'Counter-Strike 2')).toBe(false);
  });

  it('空文字は検証保留（true 扱い）', () => {
    expect(isSameSteamApp('', 'Anything')).toBe(true);
    expect(isSameSteamApp('Anything', '')).toBe(true);
  });

  it('短いタイトルでもプレフィックス一致しなければ別ゲーム', () => {
    // 'Doom' vs 'Doomsday' は 4/4=100% 共通だが、'Doom' がプレフィックスなので true
    expect(isSameSteamApp('Doom', 'Doomsday')).toBe(true);
    // 'Star Wars' vs 'Star Trek' は 'star' まで共通=4/8=50% → false
    expect(isSameSteamApp('Star Wars', 'Star Trek')).toBe(false);
  });

  it('日本語タイトルでも完全一致なら true', () => {
    expect(
      isSameSteamApp(
        'モンスターハンターワイルズ',
        'モンスターハンターワイルズ'
      )
    ).toBe(true);
  });

  it('日本語タイトル vs 英語タイトル（同ゲーム）→ false（言語差は別途吸収する設計）', () => {
    // この関数は Featured Categories と Storefront API を「同じ言語パラメータで」取得した
    // 結果同士の比較を想定している。多言語クロスチェックは行わない。
    expect(
      isSameSteamApp('エーペックスレジェンズ', 'Apex Legends')
    ).toBe(false);
  });

  // 境界値テスト（CLAUDE.md「境界値テスト必須」観点）
  it('1文字完全一致 → true', () => {
    expect(isSameSteamApp('a', 'a')).toBe(true);
  });

  it('1文字違い → false（共通プレフィックス 0/1=0% < 60%）', () => {
    expect(isSameSteamApp('a', 'b')).toBe(false);
  });

  it('共通プレフィックス 50% (= 1/2) → false（60% 閾値未満）', () => {
    expect(isSameSteamApp('ab', 'ac')).toBe(false);
  });

  it('共通プレフィックス 60% (= 3/5) → true（境界値ちょうど）', () => {
    expect(isSameSteamApp('abcde', 'abcxy')).toBe(true);
  });

  it('共通プレフィックス 40% (= 2/5) → false', () => {
    expect(isSameSteamApp('abcde', 'abxyz')).toBe(false);
  });
});

describe('fetchSteamAppName - Issue #108 多言語クロスチェック', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // fetchWithRetry は ok:true のみ return し、ok:false は throw する。
  // appId が存在しない場合は ok:true + success:false で表現する
  function buildResponse(appId: number, name: string | undefined) {
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          [appId]: name === undefined
            ? { success: false }
            : { success: true, data: { name } },
        }),
    } as Response;
  }

  it('英語名と日本語名の両方を返す（Storefront が言語別に異なる name を返すケース）', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('l=english')) {
        return Promise.resolve(buildResponse(4704690, 'MECCHA CHAMELEON'));
      }
      if (url.includes('l=japanese')) {
        return Promise.resolve(buildResponse(4704690, 'めっちゃカメレオン'));
      }
      return Promise.resolve(buildResponse(4704690, undefined));
    });

    const result = await fetchSteamAppName(4704690);
    expect(result).not.toBeNull();
    expect(result).toEqual({ en: 'MECCHA CHAMELEON', ja: 'めっちゃカメレオン' });
  });

  it('日本語ロケールが英語名と同じ name を返すケース（英語タイトルのゲーム）', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      buildResponse(2483190, 'Forza Horizon 6')
    );

    const result = await fetchSteamAppName(2483190);
    expect(result).toEqual({ en: 'Forza Horizon 6', ja: 'Forza Horizon 6' });
  });

  it('appId が存在しない（両ロケールとも success=false）→ null', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(buildResponse(99999999, undefined));

    const result = await fetchSteamAppName(99999999);
    expect(result).toBeNull();
  });

  it('片方の言語のみ name を返す → 取れた方だけ載せる', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('l=english')) {
        return Promise.resolve(buildResponse(123, 'Some Game'));
      }
      return Promise.resolve(buildResponse(123, undefined));
    });

    const result = await fetchSteamAppName(123);
    expect(result).toEqual({ en: 'Some Game', ja: null });
  });

  it('英語/日本語の両ロケール呼び出しに cc が明示される（IP 地域依存を排除）', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(buildResponse(456, 'Test'));

    await fetchSteamAppName(456);

    const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('l=japanese') && u.includes('cc=jp'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('l=english') && u.includes('cc=us'))).toBe(true);
  });

  it('fetch が全リトライ失敗 → null（呼び出し側を巻き込まない）', async () => {
    // fetchWithRetry はリトライ間に setTimeout を挟むため fake timer を使う
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const promise = fetchSteamAppName(4704690);
    // fetchWithRetry の delay * (i+1) 分だけ時間を進めてリトライを消化させる
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('fetchSteamData - Steam 経路の DLC 除外（PR-A）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  type FeaturedItem = {
    id: number;
    name: string;
    final_price?: number;
    discount_percent?: number;
  };

  type AppDetailsFixture = {
    name: string;
    type?: string;
    content_descriptors?: { ids: number[] };
  } | null; // null は success:false（appdetails 取得失敗）を表す

  /**
   * global.fetch を URL ベースで分岐させるモック。
   * - featuredcategories → top_sellers / new_releases / coming_soon
   * - GetMostPlayedGames → Top Played のランキング
   * - appdetails?appids=N → appId ごとの詳細（type, content_descriptors 等）
   */
  function mockSteamFetch(opts: {
    topSellers?: FeaturedItem[];
    newReleases?: FeaturedItem[];
    comingSoon?: FeaturedItem[];
    ranks?: { appid: number; rank: number; peak_in_game: number }[];
    appDetails: Record<number, AppDetailsFixture>;
  }) {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);

      if (url.includes('featuredcategories')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              top_sellers: opts.topSellers ? { items: opts.topSellers } : undefined,
              new_releases: opts.newReleases ? { items: opts.newReleases } : undefined,
              coming_soon: opts.comingSoon ? { items: opts.comingSoon } : undefined,
            }),
        } as Response);
      }

      if (url.includes('GetMostPlayedGames')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { ranks: opts.ranks ?? [] } }),
        } as Response);
      }

      if (url.includes('appdetails')) {
        const match = url.match(/appids=(\d+)/);
        const appId = match ? Number(match[1]) : NaN;
        const fixture = opts.appDetails[appId];
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              [appId]: fixture ? { success: true, data: fixture } : { success: false },
            }),
        } as Response);
      }

      // 未知の URL は空レスポンス（テスト対象外のパスを誤って踏んだ場合に気づけるようにする）
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
    });
  }

  /**
   * fetchSteamData() を fake timer 上で実行する共通ヘルパー。
   * 各ループ内の 200ms レート制限待機を実時間で消化すると
   * このスイートだけで数秒かかるため、fetchSteamAppName の既存テスト
   * （:177-187）と同じパターンで fake timer + runAllTimersAsync に乗せる。
   */
  async function runFetchSteamData() {
    vi.useFakeTimers();
    const promise = fetchSteamData();
    await vi.runAllTimersAsync();
    return promise;
  }

  // 2026-08-08 ライブ実測データ（appId/name/type はすべて実データ）
  const HONOGURASHI_NO_NIWA = { appId: 3934250, name: 'ほの暮しの庭' }; // top_sellers, type=game
  const SF6_YEAR4_ULTIMATE_PASS = {
    appId: 4412690,
    name: 'Street Fighter 6 - Year 4 アルティメットパス',
  }; // top_sellers, type=dlc
  const SF6_YEAR4_CHARACTER_PASS = {
    appId: 4412680,
    name: 'Street Fighter 6 - Year 4 キャラクターパス',
  }; // top_sellers, type=dlc
  const PALWORLD = { appId: 1623730, name: 'Palworld / パルワールド' }; // top_sellers/top_played, type=game
  const TIANLIANG_ZHIHOU = { appId: 4838500, name: '天亮之后' }; // new_releases, type=game
  const PIGHT = { appId: 2682270, name: 'Pight' }; // coming_soon, type=game
  const PIGHT_SOUNDTRACK = { appId: 4713630, name: 'Pight Soundtrack' }; // coming_soon, type=music (fullgame=Pight)

  it('type=game の Top Sellers 項目が採用される（appId・name が入る）', async () => {
    mockSteamFetch({
      topSellers: [
        { id: HONOGURASHI_NO_NIWA.appId, name: HONOGURASHI_NO_NIWA.name, final_price: 500 },
      ],
      appDetails: {
        [HONOGURASHI_NO_NIWA.appId]: {
          name: HONOGURASHI_NO_NIWA.name,
          type: 'game',
          content_descriptors: { ids: [5] },
        },
      },
    });

    const result = await runFetchSteamData();

    expect(result.success).toBe(true);
    const game = result.data!.topSellers.find((g) => g.appId === HONOGURASHI_NO_NIWA.appId);
    expect(game).toBeDefined();
    expect(game!.name).toBe(HONOGURASHI_NO_NIWA.name);
  });

  it('type=dlc の項目は除外され、同居する type=game は採用される（回帰: 実測「top_sellers 10件中2件がDLC」構成 = ほの暮しの庭 + SF6 Year4 パス2件）', async () => {
    mockSteamFetch({
      topSellers: [
        { id: HONOGURASHI_NO_NIWA.appId, name: HONOGURASHI_NO_NIWA.name, final_price: 500 },
        {
          id: SF6_YEAR4_ULTIMATE_PASS.appId,
          name: SF6_YEAR4_ULTIMATE_PASS.name,
          final_price: 0,
        },
        {
          id: SF6_YEAR4_CHARACTER_PASS.appId,
          name: SF6_YEAR4_CHARACTER_PASS.name,
          final_price: 0,
        },
      ],
      appDetails: {
        [HONOGURASHI_NO_NIWA.appId]: { name: HONOGURASHI_NO_NIWA.name, type: 'game' },
        [SF6_YEAR4_ULTIMATE_PASS.appId]: {
          name: SF6_YEAR4_ULTIMATE_PASS.name,
          type: 'dlc',
        },
        [SF6_YEAR4_CHARACTER_PASS.appId]: {
          name: SF6_YEAR4_CHARACTER_PASS.name,
          type: 'dlc',
        },
      },
    });

    const result = await runFetchSteamData();

    // ポジティブコントロール: ループが生きていて game は採用されることを確認した上で DLC 除外を見る
    const adoptedGame = result.data!.topSellers.find((g) => g.appId === HONOGURASHI_NO_NIWA.appId);
    expect(adoptedGame).toBeDefined();
    expect(adoptedGame!.name).toBe(HONOGURASHI_NO_NIWA.name);
    expect(
      result.data!.topSellers.find((g) => g.appId === SF6_YEAR4_ULTIMATE_PASS.appId)
    ).toBeUndefined();
    expect(
      result.data!.topSellers.find((g) => g.appId === SF6_YEAR4_CHARACTER_PASS.appId)
    ).toBeUndefined();
  });

  it('type=music の項目は除外され、同居する type=game は採用される（回帰: 実際の親子関係 Pight ⇔ Pight Soundtrack, coming_soon 経由）', async () => {
    mockSteamFetch({
      comingSoon: [
        { id: PIGHT.appId, name: PIGHT.name },
        { id: PIGHT_SOUNDTRACK.appId, name: PIGHT_SOUNDTRACK.name },
      ],
      appDetails: {
        [PIGHT.appId]: { name: PIGHT.name, type: 'game' },
        [PIGHT_SOUNDTRACK.appId]: { name: PIGHT_SOUNDTRACK.name, type: 'music' },
      },
    });

    const result = await runFetchSteamData();

    // ポジティブコントロール: coming_soon の処理ループが生きていて Pight 本編は
    // fetchSteamData 内で topSellers に統合されることを確認した上で Soundtrack 除外を見る
    const adopted = result.data!.topSellers.find((g) => g.appId === PIGHT.appId);
    expect(adopted).toBeDefined();
    expect(adopted!.name).toBe(PIGHT.name);
    expect(
      result.data!.topSellers.find((g) => g.appId === PIGHT_SOUNDTRACK.appId)
    ).toBeUndefined();
  });

  it('type=demo の項目は除外され、同居する type=game は採用される（境界値: game 以外の別種別）', async () => {
    // 観測実データに demo の実例はないため、appId は非衝突の合成値を使用する
    const DEMO_APP_ID = 5555550;
    mockSteamFetch({
      topSellers: [
        { id: HONOGURASHI_NO_NIWA.appId, name: HONOGURASHI_NO_NIWA.name },
        { id: DEMO_APP_ID, name: 'テストゲーム 体験版' },
      ],
      appDetails: {
        [HONOGURASHI_NO_NIWA.appId]: { name: HONOGURASHI_NO_NIWA.name, type: 'game' },
        [DEMO_APP_ID]: { name: 'テストゲーム 体験版', type: 'demo' },
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === HONOGURASHI_NO_NIWA.appId)).toBeDefined();
    expect(result.data!.topSellers.find((g) => g.appId === DEMO_APP_ID)).toBeUndefined();
  });

  it('境界値: data.type フィールドが存在しない場合は除外され、同居する type=game は採用される', async () => {
    const NO_TYPE_APP_ID = 5555551;
    mockSteamFetch({
      topSellers: [
        { id: HONOGURASHI_NO_NIWA.appId, name: HONOGURASHI_NO_NIWA.name },
        { id: NO_TYPE_APP_ID, name: 'type欠損アプリ' },
      ],
      appDetails: {
        [HONOGURASHI_NO_NIWA.appId]: { name: HONOGURASHI_NO_NIWA.name, type: 'game' },
        // type フィールド自体が無い（success:true だが type 未定義）
        [NO_TYPE_APP_ID]: { name: 'type欠損アプリ' },
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === HONOGURASHI_NO_NIWA.appId)).toBeDefined();
    expect(result.data!.topSellers.find((g) => g.appId === NO_TYPE_APP_ID)).toBeUndefined();
  });

  it('境界値: appdetails が success:false を返す場合は除外され、同居する type=game は採用される（挙動変更: 従来は Featured 側 name で採用されていた）', async () => {
    const NOT_FOUND_APP_ID = 5555552;
    mockSteamFetch({
      topSellers: [
        { id: HONOGURASHI_NO_NIWA.appId, name: HONOGURASHI_NO_NIWA.name },
        { id: NOT_FOUND_APP_ID, name: '取得失敗アプリ' },
      ],
      appDetails: {
        [HONOGURASHI_NO_NIWA.appId]: { name: HONOGURASHI_NO_NIWA.name, type: 'game' },
        [NOT_FOUND_APP_ID]: null, // success:false
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === HONOGURASHI_NO_NIWA.appId)).toBeDefined();
    expect(result.data!.topSellers.find((g) => g.appId === NOT_FOUND_APP_ID)).toBeUndefined();
  });

  it('Top Played 経路: type=dlc は除外され、type=game は採用される', async () => {
    mockSteamFetch({
      ranks: [
        { appid: PALWORLD.appId, rank: 1, peak_in_game: 100000 },
        { appid: SF6_YEAR4_ULTIMATE_PASS.appId, rank: 2, peak_in_game: 50000 },
      ],
      appDetails: {
        [PALWORLD.appId]: { name: PALWORLD.name, type: 'game' },
        [SF6_YEAR4_ULTIMATE_PASS.appId]: {
          name: SF6_YEAR4_ULTIMATE_PASS.name,
          type: 'dlc',
        },
      },
    });

    const result = await runFetchSteamData();

    const adopted = result.data!.topPlayed.find((g) => g.appId === PALWORLD.appId);
    expect(adopted).toBeDefined();
    expect(adopted!.name).toBe(PALWORLD.name);
    expect(
      result.data!.topPlayed.find((g) => g.appId === SF6_YEAR4_ULTIMATE_PASS.appId)
    ).toBeUndefined();
  });

  it('new_releases 経路: type=dlc は除外され、同居する type=game は採用される（ポジティブコントロール: 天亮之后）', async () => {
    mockSteamFetch({
      newReleases: [
        { id: TIANLIANG_ZHIHOU.appId, name: TIANLIANG_ZHIHOU.name },
        {
          id: SF6_YEAR4_ULTIMATE_PASS.appId,
          name: SF6_YEAR4_ULTIMATE_PASS.name,
          final_price: 0,
        },
      ],
      appDetails: {
        [TIANLIANG_ZHIHOU.appId]: { name: TIANLIANG_ZHIHOU.name, type: 'game' },
        [SF6_YEAR4_ULTIMATE_PASS.appId]: {
          name: SF6_YEAR4_ULTIMATE_PASS.name,
          type: 'dlc',
        },
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === TIANLIANG_ZHIHOU.appId)).toBeDefined();
    expect(
      result.data!.topSellers.find((g) => g.appId === SF6_YEAR4_ULTIMATE_PASS.appId)
    ).toBeUndefined();
  });

  it('既存挙動の回帰: type=game でも content_descriptors.ids に成人向けIDが含まれる場合は除外される', async () => {
    const ADULT_APP_ID = 5555553;
    mockSteamFetch({
      topSellers: [{ id: ADULT_APP_ID, name: '成人向けタイトル' }],
      appDetails: {
        [ADULT_APP_ID]: {
          name: '成人向けタイトル',
          type: 'game',
          content_descriptors: { ids: [3] },
        },
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === ADULT_APP_ID)).toBeUndefined();
  });

  it('既存挙動の回帰: type=game でも Featured name と Storefront name が乖離していれば isSameSteamApp で除外される', async () => {
    const MISMATCH_APP_ID = 32470;
    mockSteamFetch({
      topSellers: [
        { id: MISMATCH_APP_ID, name: 'サイバーパンク2077 アルティメットエディション' },
      ],
      appDetails: {
        // Issue #102 で観測された実際の取り違えペア
        [MISMATCH_APP_ID]: {
          name: 'STAR WARS™ Empire at War - Gold Pack',
          type: 'game',
        },
      },
    });

    const result = await runFetchSteamData();

    expect(result.data!.topSellers.find((g) => g.appId === MISMATCH_APP_ID)).toBeUndefined();
  });

  it('観測性の回帰: appId 取り違え かつ 実体が dlc の場合、type 除外より先に isSameSteamApp の mismatch 警告が出る（PR-A レビュー対応: 判定順序を isSameSteamApp → type に変更）', async () => {
    const MISMATCH_DLC_APP_ID = 5555554;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSteamFetch({
      topSellers: [
        { id: MISMATCH_DLC_APP_ID, name: 'Featured側の別タイトル名' },
      ],
      appDetails: {
        // Featured Categories の name と Storefront の実体名が乖離しており、
        // かつ実体の type が dlc であるケース（Issue #102 型の取り違え + PR-A の DLC 除外が重なる境界）
        [MISMATCH_DLC_APP_ID]: {
          name: '全く無関係なDLC名',
          type: 'dlc',
        },
      },
    });

    const result = await runFetchSteamData();

    // 除外される結果自体は変わらない
    expect(result.data!.topSellers.find((g) => g.appId === MISMATCH_DLC_APP_ID)).toBeUndefined();

    // 診断価値の高い appId/name mismatch 警告が出ること（type 除外より先に判定されるため）
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `appId/name mismatch in top_sellers: featured="Featured側の別タイトル名" storefront="全く無関係なDLC名" (appId: ${MISMATCH_DLC_APP_ID})`
      )
    );
    // type 除外側の「非ゲーム」ログはこの appId については出ない（mismatch で先に continue するため）
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(`Skipping non-game app`)
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Issue #297（別作品メタデータ混入）の回帰
  //
  // #297 の混入源は Featured Categories が返す (item.id, item.name) ペアの崩れで、
  // Issue #102 / PR #104（`a1e4f40`。2026-06-20 22:03 JST）で修正済み。
  // 混入記事 `issues-dev/issue-019.md` は同日 19:52 生成 = 修正の2時間11分前の生成物。
  //
  // top_sellers 経路の取り違え除外自体は上記 :510 で既に回帰済みなので、
  // ここで塞ぐのは既存スイートが検出できない次の2点:
  //   ① new_releases / coming_soon 経路にも同じガードが結線されていること
  //      （現状はどちらのガードを削除してもスイートは落ちない）
  //   ② 採用時の name が必ず Storefront 側から来ること
  //      （既存の採用系フィクスチャは Featured 名と Storefront 名が同一で、
  //        `storefrontName ?? item.name` の優先順を固定していない）
  // ② が #297 の「混入不能」条件そのもの: name を appId と同じ一次ソースから
  // 採ってさえいれば、Featured 側が崩れていても組み合わせは整合する。
  // ───────────────────────────────────────────────────────────────────────────

  // 2026-08-13 に Steam Storefront API を実際に叩いて確認した実データ
  /** appId 32470 の実体。developers=['Petroglyph'] / 2010年5月25日（混入記事の developer・releaseDate と一致） */
  const EMPIRE_AT_WAR = { appId: 32470, name: 'STAR WARS™ Empire at War - Gold Pack' };
  /** サイバーパンク2077 本体。type=game / developers=['CD PROJEKT RED'] / 2020年12月9日 */
  const CYBERPUNK_2077 = { appId: 1091500, name: 'サイバーパンク2077' };
  /** Issue #102 で Featured Categories が appId 32470 に対して返していた name */
  const CONTAMINATED_FEATURED_NAME = 'サイバーパンク2077 アルティメットエディション';

  it('new_releases 経路: appId 取り違えペア（32470 ⇔ サイバーパンク2077 アルティメットエディション）は除外され、同居する正しいペアは採用される', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSteamFetch({
      newReleases: [
        { id: TIANLIANG_ZHIHOU.appId, name: TIANLIANG_ZHIHOU.name },
        { id: EMPIRE_AT_WAR.appId, name: CONTAMINATED_FEATURED_NAME },
      ],
      appDetails: {
        [TIANLIANG_ZHIHOU.appId]: { name: TIANLIANG_ZHIHOU.name, type: 'game' },
        // type=game にすることで、除外しているのが PR-A の type ゲートではなく
        // isSameSteamApp の name 照合であることを分離する
        [EMPIRE_AT_WAR.appId]: { name: EMPIRE_AT_WAR.name, type: 'game' },
      },
    });

    const result = await runFetchSteamData();

    // ポジティブコントロール: new_releases のループが生きていること
    expect(
      result.data!.topSellers.find((g) => g.appId === TIANLIANG_ZHIHOU.appId)
    ).toBeDefined();
    expect(result.data!.topSellers.find((g) => g.appId === EMPIRE_AT_WAR.appId)).toBeUndefined();
    // 除外が new_releases 経路のガードによるものだと特定する
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `appId/name mismatch in new_releases: featured="${CONTAMINATED_FEATURED_NAME}" storefront="${EMPIRE_AT_WAR.name}" (appId: ${EMPIRE_AT_WAR.appId})`
      )
    );
  });

  it('coming_soon 経路: appId 取り違えペア（32470 ⇔ サイバーパンク2077 アルティメットエディション）は除外され、同居する正しいペアは採用される', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSteamFetch({
      comingSoon: [
        { id: PIGHT.appId, name: PIGHT.name },
        { id: EMPIRE_AT_WAR.appId, name: CONTAMINATED_FEATURED_NAME },
      ],
      appDetails: {
        [PIGHT.appId]: { name: PIGHT.name, type: 'game' },
        [EMPIRE_AT_WAR.appId]: { name: EMPIRE_AT_WAR.name, type: 'game' },
      },
    });

    const result = await runFetchSteamData();

    // ポジティブコントロール: coming_soon のループが生きていること
    expect(result.data!.topSellers.find((g) => g.appId === PIGHT.appId)).toBeDefined();
    expect(result.data!.topSellers.find((g) => g.appId === EMPIRE_AT_WAR.appId)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `appId/name mismatch in coming_soon: featured="${CONTAMINATED_FEATURED_NAME}" storefront="${EMPIRE_AT_WAR.name}" (appId: ${EMPIRE_AT_WAR.appId})`
      )
    );
  });

  it('混入不能の不変条件: Featured 名がエディション名で Storefront 名と異なっても前方一致なら採用され、採用される name は Storefront の正規名になる（同じ Featured 名でも appId が正しければ通る）', async () => {
    mockSteamFetch({
      topSellers: [
        // 取り違えテスト（:510 / 上記2件）と同一の Featured 名を、正しい appId と組んで渡す。
        // isSameSteamApp は前方一致を許容するので採用側に倒れる
        { id: CYBERPUNK_2077.appId, name: CONTAMINATED_FEATURED_NAME },
      ],
      appDetails: {
        [CYBERPUNK_2077.appId]: { name: CYBERPUNK_2077.name, type: 'game' },
      },
    });

    const result = await runFetchSteamData();

    const adopted = result.data!.topSellers.find((g) => g.appId === CYBERPUNK_2077.appId);
    expect(adopted).toBeDefined();
    // appId と name が同じ一次ソース（Storefront）から来ていること
    expect(adopted!.name).toBe(CYBERPUNK_2077.name);
    expect(adopted!.name).not.toBe(CONTAMINATED_FEATURED_NAME);
  });
});
