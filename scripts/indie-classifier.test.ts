import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeDeveloperName,
  isLargeStudio,
  isIndieGame,
  pickNewReleaseLabelCompany,
  pickDeveloperGameCount,
} from './indie-classifier';
import type { GameData } from './types';

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

describe('normalizeDeveloperName', () => {
  it('lowercases', () => {
    expect(normalizeDeveloperName('CD Projekt RED')).toBe('cd projekt red');
  });

  it('collapses whitespace', () => {
    expect(normalizeDeveloperName('Square  Enix')).toBe('square enix');
  });

  it('removes ™®©', () => {
    expect(normalizeDeveloperName('Capcom™')).toBe('capcom');
  });

  it('removes Co., Ltd. suffix', () => {
    expect(normalizeDeveloperName('Capcom Co., Ltd.')).toBe('capcom');
  });

  it('removes Inc. suffix', () => {
    expect(normalizeDeveloperName('Nintendo Inc.')).toBe('nintendo');
  });

  it('removes 株式会社 prefix', () => {
    expect(normalizeDeveloperName('株式会社カプコン')).toBe('カプコン');
  });

  it('removes LLC suffix', () => {
    expect(normalizeDeveloperName('Supergiant Games LLC')).toBe('supergiant games');
  });

  // コードレビュー指摘（管理者実測で再現）: 「カンマ + Inc./Ltd./LLC」形式（"Co" を伴わない）
  // でサフィックスを除去すると、末尾にカンマだけが残ってしまい、"Co., Ltd." 形式や
  // カンマ無し形式と正規化結果が一致しなくなる不具合があった。
  it('"カンマ + Inc." 形式でも末尾カンマが残らず、カンマ無し表記と同じ値に正規化される', () => {
    expect(normalizeDeveloperName('Nippon Ichi Software, Inc.')).toBe(
      normalizeDeveloperName('Nippon Ichi Software')
    );
    expect(normalizeDeveloperName('Nippon Ichi Software, Inc.')).toBe('nippon ichi software');
  });

  it('"NIS America, Inc." も末尾カンマが残らず正規化される', () => {
    expect(normalizeDeveloperName('NIS America, Inc.')).toBe('nis america');
  });

  it('"カンマ + LLC" 形式でも末尾カンマが残らない', () => {
    expect(normalizeDeveloperName('Foo, LLC')).toBe('foo');
  });

  it('"カンマ + Ltd." 形式でも末尾カンマが残らない', () => {
    expect(normalizeDeveloperName('Bar, Ltd.')).toBe('bar');
  });

  it('語中のカンマは除去しない（末尾以外のカンマは保持する）', () => {
    // サフィックス除去の対象にならない語中カンマは、末尾カンマの後処理でも消してはいけない
    expect(normalizeDeveloperName('Foo, Bar Games')).toBe('foo, bar games');
  });

  it('既存の正常系は変わらない（回帰防止）: "Co., Ltd." 形式', () => {
    expect(normalizeDeveloperName('Capcom Co., Ltd.')).toBe('capcom');
  });

  it('既存の正常系は変わらない（回帰防止）: カンマ無し "Inc." 形式', () => {
    expect(normalizeDeveloperName('Marvelous Inc.')).toBe('marvelous');
  });
});

describe('isLargeStudio', () => {
  // 大手スタジオ - 正例
  it('CD Projekt RED is large', () => {
    expect(isLargeStudio('CD Projekt RED')).toEqual({ hit: true, matched: 'CD Projekt RED', list: 'large' });
  });

  it('CD Projekt Red (case variation) is large', () => {
    expect(isLargeStudio('CD Projekt Red')).toMatchObject({ hit: true, list: 'large' });
  });

  it('CD PROJEKT RED (all caps) is large', () => {
    expect(isLargeStudio('CD PROJEKT RED')).toMatchObject({ hit: true, list: 'large' });
  });

  it('cdpr alias is large', () => {
    expect(isLargeStudio('cdpr')).toMatchObject({ hit: true, list: 'large' });
  });

  it('CD Projekt alias is large', () => {
    expect(isLargeStudio('CD Projekt')).toMatchObject({ hit: true, list: 'large' });
  });

  it('CD Projekt S.A. alias is large', () => {
    expect(isLargeStudio('CD Projekt S.A.')).toMatchObject({ hit: true, list: 'large' });
  });

  it('capcom co., ltd. is large', () => {
    expect(isLargeStudio('Capcom Co., Ltd.')).toMatchObject({ hit: true, list: 'large' });
  });

  // コードレビュー指摘: normalizeDeveloperName の「カンマ + Inc.」末尾カンマ残留バグにより、
  // 静的リスト登録済み企業でもこの表記形式だと一致しなかった。修正後はヒットすること。
  it('静的リスト登録済み企業を「カンマ + Inc.」形式で渡してもヒットする（末尾カンマ残留バグの修正確認）', () => {
    expect(isLargeStudio('Nintendo, Inc.')).toMatchObject({ hit: true, list: 'large' });
  });

  it('株式会社カプコン is large', () => {
    expect(isLargeStudio('株式会社カプコン')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Rockstar Games is large', () => {
    expect(isLargeStudio('Rockstar Games')).toMatchObject({ hit: true, list: 'large' });
  });

  it('FromSoftware is large', () => {
    expect(isLargeStudio('FromSoftware')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Square Enix is large', () => {
    expect(isLargeStudio('Square Enix')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Bandai Namco Entertainment is large', () => {
    expect(isLargeStudio('Bandai Namco Entertainment')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Nintendo EPD is large', () => {
    expect(isLargeStudio('Nintendo EPD')).toMatchObject({ hit: true, list: 'large' });
  });

  it('miHoYo is large', () => {
    expect(isLargeStudio('miHoYo')).toMatchObject({ hit: true, list: 'large' });
  });

  it('HoYoverse is large', () => {
    expect(isLargeStudio('HoYoverse')).toMatchObject({ hit: true, list: 'large' });
  });

  // 大手子会社 - 正例
  it('Ninja Theory is subsidiary', () => {
    expect(isLargeStudio('Ninja Theory')).toEqual({ hit: true, matched: 'Ninja Theory', list: 'subsidiary' });
  });

  it('343 Industries is subsidiary', () => {
    expect(isLargeStudio('343 Industries')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Bethesda Game Studios is subsidiary', () => {
    expect(isLargeStudio('Bethesda Game Studios')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Naughty Dog is subsidiary', () => {
    expect(isLargeStudio('Naughty Dog')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Guerrilla Games is subsidiary', () => {
    expect(isLargeStudio('Guerrilla Games')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Insomniac Games is subsidiary', () => {
    expect(isLargeStudio('Insomniac Games')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('DICE is subsidiary', () => {
    expect(isLargeStudio('DICE')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Respawn Entertainment is subsidiary', () => {
    expect(isLargeStudio('Respawn Entertainment')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Infinity Ward is subsidiary', () => {
    expect(isLargeStudio('Infinity Ward')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Blizzard Entertainment is subsidiary', () => {
    expect(isLargeStudio('Blizzard Entertainment')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Firaxis Games is subsidiary', () => {
    expect(isLargeStudio('Firaxis Games')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  // インディー - 負例
  it('Supergiant Games is not large', () => {
    expect(isLargeStudio('Supergiant Games')).toEqual({ hit: false });
  });

  it('Hazelight Studios is not large', () => {
    expect(isLargeStudio('Hazelight Studios')).toEqual({ hit: false });
  });

  it('Pocketpair is not large', () => {
    expect(isLargeStudio('Pocketpair')).toEqual({ hit: false });
  });

  it('LocalThunk is not large', () => {
    expect(isLargeStudio('LocalThunk')).toEqual({ hit: false });
  });

  it('poncle is not large', () => {
    expect(isLargeStudio('poncle')).toEqual({ hit: false });
  });

  it('Tour De Pizza is not large', () => {
    expect(isLargeStudio('Tour De Pizza')).toEqual({ hit: false });
  });

  it('lemorion_1224 (personal dev account) is not large', () => {
    expect(isLargeStudio('lemorion_1224')).toEqual({ hit: false });
  });

  it('undefined is not large', () => {
    expect(isLargeStudio(undefined)).toEqual({ hit: false });
  });

  // 部分一致誤爆 - negative
  it('Sony Pictures Imageworks should not match Sony', () => {
    // "sony pictures imageworks" does NOT equal "sony", must be exact match after normalize
    expect(isLargeStudio('Sony Pictures Imageworks')).toEqual({ hit: false });
  });

  it('Konami Digital Entertainment matches Konami via alias', () => {
    // "Konami Digital Entertainment" should still match via alias
    expect(isLargeStudio('Konami Digital Entertainment')).toMatchObject({ hit: true });
  });

  // CRITICAL #1 修正確認: 'EA' 単体がブロックされること
  it('EA (single abbrev) is large', () => {
    expect(isLargeStudio('EA')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Electronic Arts is large', () => {
    expect(isLargeStudio('Electronic Arts')).toMatchObject({ hit: true, list: 'large' });
  });

  // CRITICAL #2 修正確認: Take-Two と Rockstar 地域スタジオがブロックされること
  it('Take-Two Interactive is large', () => {
    expect(isLargeStudio('Take-Two Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Rockstar North (GTA dev studio) is subsidiary', () => {
    expect(isLargeStudio('Rockstar North')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Rockstar San Diego is subsidiary', () => {
    expect(isLargeStudio('Rockstar San Diego')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  // WARNING 修正確認: Ubisoft 地域スタジオがブロックされること
  it('Ubisoft Massive is large', () => {
    expect(isLargeStudio('Ubisoft Massive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Ubisoft Nadeo is large', () => {
    expect(isLargeStudio('Ubisoft Nadeo')).toMatchObject({ hit: true, list: 'large' });
  });

  // Issue #167 修正: 新規追加スタジオの確認
  it('IO Interactive is large', () => {
    expect(isLargeStudio('IO Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Remedy Entertainment is large', () => {
    expect(isLargeStudio('Remedy Entertainment')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Larian Studios is large', () => {
    expect(isLargeStudio('Larian Studios')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Warhorse Studios is large', () => {
    expect(isLargeStudio('Warhorse Studios')).toMatchObject({ hit: true, list: 'large' });
  });

  it('4A Games is large', () => {
    expect(isLargeStudio('4A Games')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Techland is large', () => {
    expect(isLargeStudio('Techland')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Asobo Studio is large', () => {
    expect(isLargeStudio('Asobo Studio')).toMatchObject({ hit: true, list: 'large' });
  });

  it('People Can Fly is large', () => {
    expect(isLargeStudio('People Can Fly')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Bloober Team is large', () => {
    expect(isLargeStudio('Bloober Team')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Bohemia Interactive is large', () => {
    expect(isLargeStudio('Bohemia Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Saber Interactive is large', () => {
    expect(isLargeStudio('Saber Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Behaviour Interactive is large', () => {
    expect(isLargeStudio('Behaviour Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Behavior Interactive (US spelling) is large', () => {
    expect(isLargeStudio('Behavior Interactive')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Crystal Dynamics is large', () => {
    expect(isLargeStudio('Crystal Dynamics')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Eidos-Montréal is large', () => {
    expect(isLargeStudio('Eidos-Montréal')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Eidos Montreal (without accent) is large', () => {
    expect(isLargeStudio('Eidos Montreal')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Pearl Abyss is large', () => {
    expect(isLargeStudio('Pearl Abyss')).toMatchObject({ hit: true, list: 'large' });
  });

  it('SHIFT UP is large', () => {
    expect(isLargeStudio('SHIFT UP')).toMatchObject({ hit: true, list: 'large' });
  });

  it('CyberConnect2 is large', () => {
    expect(isLargeStudio('CyberConnect2')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Kojima Productions is large', () => {
    expect(isLargeStudio('Kojima Productions')).toMatchObject({ hit: true, list: 'large' });
  });

  it('PlatinumGames is large', () => {
    expect(isLargeStudio('PlatinumGames')).toMatchObject({ hit: true, list: 'large' });
  });

  it('KRAFTON is large', () => {
    expect(isLargeStudio('KRAFTON')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Quantic Dream is subsidiary (NetEase)', () => {
    expect(isLargeStudio('Quantic Dream')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  it('Unknown Worlds Entertainment is subsidiary (KRAFTON)', () => {
    expect(isLargeStudio('Unknown Worlds Entertainment')).toMatchObject({ hit: true, list: 'subsidiary' });
  });

  // 短縮エイリアスのポジティブテスト（タイポ検知）
  it('IOI (IO Interactive alias) is large', () => {
    expect(isLargeStudio('IOI')).toMatchObject({ hit: true, list: 'large' });
  });

  it('PCF (People Can Fly alias) is large', () => {
    expect(isLargeStudio('PCF')).toMatchObject({ hit: true, list: 'large' });
  });

  it('CC2 (CyberConnect2 alias) is large', () => {
    expect(isLargeStudio('CC2')).toMatchObject({ hit: true, list: 'large' });
  });

  it('4A (4A Games alias) is large', () => {
    expect(isLargeStudio('4A')).toMatchObject({ hit: true, list: 'large' });
  });

  // Eidos 単独誤爆ネガティブテスト（旧 Eidos Interactive ブランドが誤分類されないこと）
  it('Eidos Interactive (旧ブランド) is not large — eidos 単独エイリアスは削除済み', () => {
    expect(isLargeStudio('Eidos Interactive')).toEqual({ hit: false });
  });

  // NFD エンコードでも Eidos-Montréal にマッチすること
  it('Eidos-Montréal NFD encoding still matches (NFC normalization)', () => {
    const nfd = 'Eidos-Montréal'; // é を NFD で表現
    expect(isLargeStudio(nfd)).toMatchObject({ hit: true, list: 'large' });
  });

  // Issue #236: 親会社パブリッシャ自体が LARGE_DEVELOPERS に無かった穴の修正確認
  it('Xbox Game Studios is large', () => {
    expect(isLargeStudio('Xbox Game Studios')).toEqual({ hit: true, matched: 'Xbox Game Studios', list: 'large' });
  });

  it('Microsoft (alias) is large', () => {
    expect(isLargeStudio('Microsoft')).toMatchObject({ hit: true, list: 'large' });
  });

  it('Sony Interactive Entertainment is large', () => {
    expect(isLargeStudio('Sony Interactive Entertainment')).toEqual({
      hit: true,
      matched: 'Sony Interactive Entertainment',
      list: 'large',
    });
  });

  it('PlayStation Studios (alias) is large', () => {
    expect(isLargeStudio('PlayStation Studios')).toMatchObject({ hit: true, list: 'large' });
  });

  // Issue #236 実害ケース: ほの暮しの庭の developer 表記（実データ, 2026-08-10 スナップショット）
  it('Nippon Ichi Software, Inc.（実データ表記）はサフィックス正規化を経て Nippon Ichi Software にヒットする', () => {
    expect(isLargeStudio('Nippon Ichi Software, Inc.')).toEqual({
      hit: true,
      matched: 'Nippon Ichi Software',
      list: 'large',
    });
  });

  it('NIS America, Inc. は Nippon Ichi Software にヒットする', () => {
    expect(isLargeStudio('NIS America, Inc.')).toEqual({
      hit: true,
      matched: 'Nippon Ichi Software',
      list: 'large',
    });
  });

  // ネガティブコントロール: 無関係な会社・単体略称・作品名を巻き込まないこと
  it('Sony Pictures Imageworks is not large（sony 単体エイリアスは追加していない）', () => {
    expect(isLargeStudio('Sony Pictures Imageworks')).toEqual({ hit: false });
  });

  it('Microsoft Flight Simulator（作品名）is not large', () => {
    expect(isLargeStudio('Microsoft Flight Simulator')).toEqual({ hit: false });
  });

  it('Xbox（単体）is not large（xbox 単体エイリアスは追加していない）', () => {
    expect(isLargeStudio('Xbox')).toEqual({ hit: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isLargeStudio — 開発本数による規模判定（§3.4, Issue #231・PR-I その1）
// ─────────────────────────────────────────────────────────────────────────────
describe('isLargeStudio — developedCount（§3.4 開発本数による規模判定）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('境界値: developedCount = 19 は大手ではない', () => {
    expect(isLargeStudio('Unlisted Small Studio', 19)).toEqual({ hit: false });
  });

  it('境界値: developedCount = 20 は大手ではない（20は大手ではない、21から大手）', () => {
    expect(isLargeStudio('Unlisted Small Studio', 20)).toEqual({ hit: false });
  });

  it('境界値: developedCount = 21 は大手になる', () => {
    expect(isLargeStudio('Unlisted Small Studio', 21)).toEqual({
      hit: true,
      matched: 'Unlisted Small Studio',
      list: 'developed-count',
    });
  });

  it('OR判定①: 静的リストに無い名前 + developedCount 25 → 大手（matched は引数の文字列そのまま）', () => {
    expect(isLargeStudio('Some New Studio', 25)).toEqual({
      hit: true,
      matched: 'Some New Studio',
      list: 'developed-count',
    });
  });

  it('OR判定②: 静的リストにある名前（The Coalition）+ developedCount 8（閾値未満）でも大手のまま（list は従来値のまま）', () => {
    expect(isLargeStudio('The Coalition', 8)).toEqual({
      hit: true,
      matched: 'The Coalition',
      list: 'subsidiary',
    });
  });

  it('OR判定③: 静的リストにある名前 + developedCount undefined でも大手のまま（既存挙動を1ミリも変えない）', () => {
    expect(isLargeStudio('The Coalition')).toEqual({
      hit: true,
      matched: 'The Coalition',
      list: 'subsidiary',
    });
  });

  // 回帰ケース（Issue #231 / §8・実測値）
  it('[Issue #231] Arc System Works (241本) は大手判定になる', () => {
    expect(isLargeStudio('Arc System Works', 241).hit).toBe(true);
  });

  it('[Issue #231] Nihon Falcom (214本) は静的リスト経由で大手判定になる（本数判定ではなく list 一致であることを明示）', () => {
    // Nihon Falcom は静的リスト（LARGE_DEVELOPERS）に登録済みのため、本数判定を
    // 丸ごと削除しても本テストは通ってしまう（ミュータント検証で発見）。list を
    // 'large' まで assert することで、リスト経由であることを明示する。
    expect(isLargeStudio('Nihon Falcom', 214)).toEqual({
      hit: true,
      matched: 'Nihon Falcom',
      list: 'large',
    });
  });

  it('[Issue #231] 静的リスト未登録の名前 + 214本（Nihon Falcom と同じ件数）は本数判定経由で大手判定になる（list=developed-count）', () => {
    // 上のテストと同じ 214 という件数を、静的リストに存在しない名前に持たせる。
    // これにより本数判定ロジックが実際に働いていることを list の値で検証できる
    // （本数判定を削除すると { hit: false } になり、このテストが落ちる）。
    expect(isLargeStudio('Unlisted Studio With 214 Games', 214)).toEqual({
      hit: true,
      matched: 'Unlisted Studio With 214 Games',
      list: 'developed-count',
    });
  });

  it('[Issue #231] Nippon Ichi Software (187本) は大手判定になる', () => {
    expect(isLargeStudio('Nippon Ichi Software', 187).hit).toBe(true);
  });

  // 逆方向: インディー側に残ること
  it('[Issue #231] 逆方向: PocketPair (7本) は大手ではない', () => {
    expect(isLargeStudio('PocketPair', 7)).toEqual({ hit: false });
  });

  it('[Issue #231] 逆方向: Yacht Club Games (12本) は大手ではない', () => {
    expect(isLargeStudio('Yacht Club Games', 12)).toEqual({ hit: false });
  });

  it('[Issue #231] 逆方向: ZA/UM (6本) は大手ではない', () => {
    expect(isLargeStudio('ZA/UM', 6)).toEqual({ hit: false });
  });

  // 環境変数
  it('LARGE_STUDIO_DEVELOPED_THRESHOLD=50 のとき、count=30は大手にならず、count=51は大手になる', () => {
    vi.stubEnv('LARGE_STUDIO_DEVELOPED_THRESHOLD', '50');
    expect(isLargeStudio('Env Test Studio A', 30)).toEqual({ hit: false });
    expect(isLargeStudio('Env Test Studio B', 51)).toEqual({
      hit: true,
      matched: 'Env Test Studio B',
      list: 'developed-count',
    });
  });

  it('LARGE_STUDIO_DEVELOPED_THRESHOLD="0" のとき、count=1でも大手になる（`Number(x) || 20` の回帰防止）', () => {
    vi.stubEnv('LARGE_STUDIO_DEVELOPED_THRESHOLD', '0');
    expect(isLargeStudio('Env Test Studio C', 1)).toEqual({
      hit: true,
      matched: 'Env Test Studio C',
      list: 'developed-count',
    });
  });

  it('LARGE_STUDIO_DEVELOPED_THRESHOLD が不正値（"abc"）のとき既定の20に戻る', () => {
    vi.stubEnv('LARGE_STUDIO_DEVELOPED_THRESHOLD', 'abc');
    expect(isLargeStudio('Env Test Studio D', 20)).toEqual({ hit: false });
    expect(isLargeStudio('Env Test Studio E', 21)).toEqual({
      hit: true,
      matched: 'Env Test Studio E',
      list: 'developed-count',
    });
  });
});

describe('isIndieGame', () => {
  // Vol.12 再発防止: 実際に混入したケース
  it('[Vol.12 regression] Cyberpunk 2077 (CD Projekt RED) is NOT indie', () => {
    const game = makeGame({ title: 'Cyberpunk 2077', developer: 'CD Projekt RED' });
    const result = isIndieGame(game);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('large-studio');
    }
  });

  it('[Vol.12 regression] Hellblade II (Ninja Theory) is NOT indie', () => {
    const game = makeGame({ title: "Senua's Saga: Hellblade II", developer: 'Ninja Theory' });
    const result = isIndieGame(game);
    expect(result.ok).toBe(false);
  });

  // インディー正例
  it('Hades 2 (Supergiant Games) is indie', () => {
    const game = makeGame({ title: 'Hades II', developer: 'Supergiant Games' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('Palworld (Pocketpair) is indie', () => {
    const game = makeGame({ title: 'Palworld', developer: 'Pocketpair' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('Balatro (LocalThunk) is indie', () => {
    const game = makeGame({ title: 'Balatro', developer: 'LocalThunk' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('It Takes Two (Hazelight Studios) is indie', () => {
    const game = makeGame({ title: 'It Takes Two', developer: 'Hazelight Studios' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('Vampire Survivors (poncle) is indie', () => {
    const game = makeGame({ title: 'Vampire Survivors', developer: 'poncle' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('めっちゃカメレオン (lemorion_1224) is indie (individual dev, passes indie check)', () => {
    // developer がアカウント名でも isIndieGame は ok を返す
    // （個人開発ラベルへの変換は select-indie-with-fallback で行う）
    const game = makeGame({ title: 'めっちゃカメレオン', developer: 'lemorion_1224' });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  // developer なし
  it('game with no developer returns no-developer', () => {
    const game = makeGame({ title: 'Unknown Dev Game', developer: undefined });
    const result = isIndieGame(game);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no-developer');
    }
  });

  // publisher は判定に使わない
  it('publisher is NOT used for indie judgment', () => {
    // publisher が大手でも developer が独立スタジオならインディー
    const game = makeGame({
      title: 'It Takes Two',
      developer: 'Hazelight Studios',
      publisher: 'EA',
    });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  // Death Stranding - Kojima Productions は大手枠（仕様変更）
  it('Death Stranding (Kojima Productions) is NOT indie', () => {
    const game = makeGame({ title: 'Death Stranding', developer: 'Kojima Productions' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  // Bayonetta 3 - PlatinumGames は大手枠（仕様変更）
  it('Bayonetta 3 (PlatinumGames) is NOT indie', () => {
    const game = makeGame({ title: 'Bayonetta 3', developer: 'PlatinumGames' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  // 大手判定の追加ケース
  it('Final Fantasy (Square Enix) is NOT indie', () => {
    const game = makeGame({ title: 'Final Fantasy XVI', developer: 'Square Enix' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  it('Pokemon (Game Freak) is NOT indie', () => {
    const game = makeGame({ title: 'Pokémon Scarlet', developer: 'Game Freak' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  it('GTA V (Rockstar Games) is NOT indie', () => {
    const game = makeGame({ title: 'Grand Theft Auto V', developer: 'Rockstar Games' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  it('Starfield (Bethesda Game Studios) is NOT indie', () => {
    const game = makeGame({ title: 'Starfield', developer: 'Bethesda Game Studios' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  it('Halo Infinite (343 Industries) is NOT indie', () => {
    const game = makeGame({ title: 'Halo Infinite', developer: '343 Industries' });
    expect(isIndieGame(game)).toMatchObject({ ok: false });
  });

  // 開発本数による規模判定（§3.4, Issue #231）
  it('[Issue #231] Arc System Works (241本, 静的リスト外) is NOT indie（本数判定 OR）', () => {
    const game = makeGame({ title: 'ASW Game', developer: 'Arc System Works', developerGameCount: 241 });
    const result = isIndieGame(game);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('large-studio');
    }
  });

  it('[Issue #231] Nippon Ichi Software (187本, 静的リスト外) is NOT indie（本数判定 OR）', () => {
    const game = makeGame({ title: 'NIS Game', developer: 'Nippon Ichi Software', developerGameCount: 187 });
    expect(isIndieGame(game)).toMatchObject({ ok: false, reason: 'large-studio' });
  });

  it('[Issue #231] 逆方向: PocketPair (7本) is indie のまま', () => {
    const game = makeGame({ title: 'Palworld', developer: 'PocketPair', developerGameCount: 7 });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('[Issue #231] 逆方向: Yacht Club Games (12本) is indie のまま', () => {
    const game = makeGame({ title: 'Shovel Knight', developer: 'Yacht Club Games', developerGameCount: 12 });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  it('[Issue #231] 逆方向: ZA/UM (6本) is indie のまま', () => {
    const game = makeGame({ title: 'Disco Elysium', developer: 'ZA/UM', developerGameCount: 6 });
    expect(isIndieGame(game)).toEqual({ ok: true });
  });
});

describe('pickNewReleaseLabelCompany（Issue #180: 大手新作枠のラベル用企業名）', () => {
  it('developer が大手 → developer の canonical 名を返す', () => {
    expect(pickNewReleaseLabelCompany('nintendo', undefined)).toBe('Nintendo EPD');
  });

  it('受託開発（developer 小規模・publisher 大手）→ publisher の canonical 名を返す', () => {
    // Echoes of Aincrad 型: ラベルは「バンダイナムコ側」を使い、
    // game.developer 自体は受託スタジオ名（事実）のまま保持される前提
    const label = pickNewReleaseLabelCompany('Game Studio Inc.', 'Bandai Namco Entertainment Inc.');
    expect(label).toBeDefined();
    expect(isLargeStudio(label).hit).toBe(true);
  });

  it('どちらも大手でない → developer をそのまま返す（フォールバック）', () => {
    expect(pickNewReleaseLabelCompany('Small Studio', 'Small Publisher')).toBe('Small Studio');
  });

  it('developer 未定義・publisher も大手でない → undefined（呼び出し側が「注目新作」にする）', () => {
    expect(pickNewReleaseLabelCompany(undefined, 'Small Publisher')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pickDeveloperGameCount — developer 名とペアでなければ developerGameCount を採らない
// （コードレビュー指摘: 名前は Steam 由来の小規模スタジオ、件数は IGDB の共同開発会社という
// 取り違えを防ぐガード）
// ─────────────────────────────────────────────────────────────────────────────
describe('pickDeveloperGameCount — developer 名の一致をゲートにした developerGameCount 選択', () => {
  it('名前が完全一致する場合、source の件数が採用される', () => {
    expect(
      pickDeveloperGameCount('Arc System Works', undefined, 'Arc System Works', 241)
    ).toBe(241);
  });

  // コードレビュー指摘: normalizeDeveloperName の「カンマ + Inc.」末尾カンマ残留バグにより、
  // このガード自体の有効性が損なわれていた（IGDB が実際に返す表記形式のため実害あり）。
  it('名前が表記ゆれ（カンマ + Inc.）で一致する場合、source の件数が採用される（修正前は undefined になっていた）', () => {
    expect(
      pickDeveloperGameCount(
        'Nippon Ichi Software, Inc.',
        undefined,
        'Nippon Ichi Software',
        187
      )
    ).toBe(187);
  });

  it('名前が表記ゆれ（Co., Ltd.）で一致する場合、source の件数が採用される', () => {
    expect(
      pickDeveloperGameCount(
        'Nippon Ichi Software Co., Ltd.',
        undefined,
        'Nippon Ichi Software',
        187
      )
    ).toBe(187);
  });

  it('名前が食い違う場合、source の件数は採用されず current の件数が維持される', () => {
    expect(pickDeveloperGameCount('Small Studio', undefined, 'Big Port House', 241)).toBeUndefined();
    expect(pickDeveloperGameCount('Small Studio', 5, 'Big Port House', 241)).toBe(5);
  });

  it('current の名前が undefined の場合、source の件数は採用されない（current の件数をそのまま返す）', () => {
    expect(pickDeveloperGameCount(undefined, undefined, 'Big Port House', 241)).toBeUndefined();
    expect(pickDeveloperGameCount(undefined, 9, 'Big Port House', 241)).toBe(9);
  });

  it('source の名前が undefined の場合、source の件数は採用されない（current の件数をそのまま返す）', () => {
    expect(pickDeveloperGameCount('Small Studio', undefined, undefined, 241)).toBeUndefined();
    expect(pickDeveloperGameCount('Small Studio', 5, undefined, 241)).toBe(5);
  });

  it('どちらの名前も undefined の場合、件数も採らない（current の件数のみ）', () => {
    expect(pickDeveloperGameCount(undefined, undefined, undefined, 241)).toBeUndefined();
  });

  it('名前が一致し current の件数が既にある場合、source の件数（0 でも）で更新される（?? の優先順）', () => {
    // 呼び出し側が「source 優先」で使うケース（enrichGameFromIgdb 等）を想定した挙動確認。
    // 0 は「持っている」として扱われることを検証（|| だと欠損する回帰防止）。
    expect(pickDeveloperGameCount('Studio A', 99, 'Studio A', 0)).toBe(0);
  });

  it('名前が一致するが source の件数が undefined の場合、current の件数にフォールバックする', () => {
    expect(pickDeveloperGameCount('Studio A', 99, 'Studio A', undefined)).toBe(99);
  });
});
