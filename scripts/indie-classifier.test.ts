import { describe, it, expect } from 'vitest';
import { normalizeDeveloperName, isLargeStudio, isIndieGame } from './indie-classifier';
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
});
