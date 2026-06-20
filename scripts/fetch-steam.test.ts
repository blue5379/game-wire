import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSameSteamApp, fetchSteamAppName } from './fetch-steam';

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
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function buildResponse(appId: number, name: string | undefined, ok = true) {
    return {
      ok,
      json: () =>
        Promise.resolve({
          [appId]: name === undefined
            ? { success: false }
            : { success: true, data: { name } },
        }),
    } as any;
  }

  it('英語名と日本語名の両方を返す（Storefront が言語別に異なる name を返すケース）', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('l=english')) {
        return Promise.resolve(buildResponse(4704690, 'MECCHA CHAMELEON'));
      }
      if (url.includes('l=japanese')) {
        return Promise.resolve(buildResponse(4704690, 'めっちゃカメレオン'));
      }
      return Promise.resolve(buildResponse(4704690, undefined, false));
    });

    const result = await fetchSteamAppName(4704690);
    expect(result).not.toBeNull();
    expect(result).toEqual({ en: 'MECCHA CHAMELEON', ja: 'めっちゃカメレオン' });
  });

  it('日本語ロケールが英語名と同じ name を返すケース（英語タイトルのゲーム）', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      buildResponse(2483190, 'Forza Horizon 6')
    );

    const result = await fetchSteamAppName(2483190);
    expect(result).toEqual({ en: 'Forza Horizon 6', ja: 'Forza Horizon 6' });
  });

  it('appId が存在しない（両ロケールとも success=false）→ null', async () => {
    global.fetch = vi.fn().mockResolvedValue(buildResponse(99999999, undefined));

    const result = await fetchSteamAppName(99999999);
    expect(result).toBeNull();
  });

  it('片方の言語のみ name を返す → 取れた方だけ載せる', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('l=english')) {
        return Promise.resolve(buildResponse(123, 'Some Game'));
      }
      return Promise.resolve(buildResponse(123, undefined));
    });

    const result = await fetchSteamAppName(123);
    expect(result).toEqual({ en: 'Some Game', ja: null });
  });

  it('日本語ロケール呼び出しは cc=jp パラメータを含む', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(456, 'Test'));
    global.fetch = fetchMock;

    await fetchSteamAppName(456);

    const calledUrls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(calledUrls.some((u) => u.includes('l=japanese') && u.includes('cc=jp'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('l=english'))).toBe(true);
  });

  it('fetch が throw → null（呼び出し側を巻き込まない）', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await fetchSteamAppName(4704690);
    expect(result).toBeNull();
  });
});
