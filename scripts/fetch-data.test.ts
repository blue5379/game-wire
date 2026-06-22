/**
 * fetch-data ヘルパーのユニットテスト
 *
 * Issue #94: Steam Storefront 補完で導入した正規化・品質ガード関数。
 */

import { describe, it, expect } from 'vitest';
import { parseSteamReleaseDate, isQualifiedCompanyName, removeZombieGames } from './fetch-data.js';
import type { SelectedGames, GameData } from './types.js';

// テスト用 GameData ファクトリ（必須フィールドのみ設定）
function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    title: 'Test Game',
    normalizedTitle: 'test game',
    genres: [],
    platforms: [],
    source: ['steam'],
    ...overrides,
  };
}

// テスト用 SelectedGames ファクトリ
function makeSelected(overrides: Partial<SelectedGames> = {}): SelectedGames {
  return {
    newReleases: [],
    newReleasesReserves: [],
    indies: [],
    indieReserves: [],
    featured: null,
    classic: null,
    ...overrides,
  };
}

describe('removeZombieGames - Issue #103 zombie ゲーム除去', () => {
  it('cover と sourceUrl が揃っているゲームはそのまま残す', () => {
    const game = makeGame({
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/123' },
    });
    const selected = makeSelected({ newReleases: [game], indies: [game] });

    removeZombieGames(selected);

    expect(selected.newReleases).toHaveLength(1);
    expect(selected.indies).toHaveLength(1);
  });

  it('coverImage が欠落したゲームを newReleases から除去する', () => {
    const zombie = makeGame({
      title: 'Zombie Game',
      sourceUrls: { steam: 'https://store.steampowered.com/app/999' },
      // coverImage なし
    });
    const ok = makeGame({
      title: 'OK Game',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/100' },
    });
    const selected = makeSelected({ newReleases: [zombie, ok] });

    removeZombieGames(selected);

    expect(selected.newReleases).toHaveLength(1);
    expect(selected.newReleases[0].title).toBe('OK Game');
  });

  it('sourceUrls が全くないゲームを indies から除去する', () => {
    const zombie = makeGame({
      title: 'No URL Indie',
      coverImage: 'https://example.com/cover.jpg',
      // sourceUrls なし
    });
    const selected = makeSelected({ indies: [zombie] });

    removeZombieGames(selected);

    expect(selected.indies).toHaveLength(0);
  });

  it('sourceUrls.steam が消えても sourceUrls.official があればゾンビにならない', () => {
    const game = makeGame({
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { official: 'https://example.com/official' },
    });
    const selected = makeSelected({ newReleases: [game] });

    removeZombieGames(selected);

    expect(selected.newReleases).toHaveLength(1);
  });

  it('featured が zombie なら null に置き換える', () => {
    const zombie = makeGame({
      title: 'Zombie Featured',
      coverImage: 'https://example.com/cover.jpg',
      // sourceUrls なし
    });
    const selected = makeSelected({ featured: zombie });

    removeZombieGames(selected);

    expect(selected.featured).toBeNull();
  });

  it('classic が zombie なら null に置き換える', () => {
    const zombie = makeGame({
      title: 'Zombie Classic',
      // coverImage なし
      sourceUrls: { steam: 'https://store.steampowered.com/app/1' },
    });
    const selected = makeSelected({ classic: zombie });

    removeZombieGames(selected);

    expect(selected.classic).toBeNull();
  });

  it('developer が欠落していてもゾンビ判定しない（cover + sourceUrl で判定）', () => {
    const game = makeGame({
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/200' },
      // developer なし
    });
    const selected = makeSelected({ indies: [game] });

    removeZombieGames(selected);

    expect(selected.indies).toHaveLength(1);
  });

  it('featured が null の場合は何も変えない（クラッシュしない）', () => {
    const selected = makeSelected({ featured: null, classic: null });

    expect(() => removeZombieGames(selected)).not.toThrow();
    expect(selected.featured).toBeNull();
    expect(selected.classic).toBeNull();
  });

  it('indieReserves は zombie フィルタの対象外（変更しない）', () => {
    const zombie = makeGame({ title: 'Reserve Zombie' }); // cover も sourceUrl もなし
    const selected = makeSelected({ indieReserves: [zombie] });

    removeZombieGames(selected);

    // indieReserves は finalize 未済なので触らない
    expect(selected.indieReserves).toHaveLength(1);
  });

  it('zombie 除去後に newReleasesReserves から不足分を補充する', () => {
    const zombie = makeGame({
      title: 'Zombie New',
      normalizedTitle: 'zombie new',
      coverImage: 'https://example.com/cover.jpg',
      // sourceUrls なし → zombie
    });
    const survivor = makeGame({
      title: 'Survivor',
      normalizedTitle: 'survivor',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1' },
    });
    const reserve = makeGame({
      title: 'Reserve Fill',
      normalizedTitle: 'reserve fill',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/2' },
    });
    const selected = makeSelected({
      newReleases: [zombie, survivor],
      newReleasesReserves: [reserve],
    });

    removeZombieGames(selected);

    expect(selected.newReleases).toHaveLength(2);
    expect(selected.newReleases.map((g) => g.title)).toContain('Survivor');
    expect(selected.newReleases.map((g) => g.title)).toContain('Reserve Fill');
  });

  it('reserves に条件を満たすものがなければ補充しない（cover 欠落の reserve は使わない）', () => {
    const zombie = makeGame({
      title: 'Zombie',
      normalizedTitle: 'zombie',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1' },
      // coverImage なし → zombie
    });
    const badReserve = makeGame({
      title: 'Bad Reserve',
      normalizedTitle: 'bad reserve',
      // coverImage なし → hasAllRequiredFields 不通過
      sourceUrls: { steam: 'https://store.steampowered.com/app/3' },
    });
    const selected = makeSelected({
      newReleases: [zombie],
      newReleasesReserves: [badReserve],
    });

    removeZombieGames(selected);

    expect(selected.newReleases).toHaveLength(0);
  });

  it('zombie がなければ reserves に手を付けない', () => {
    const ok = makeGame({
      title: 'OK Game',
      normalizedTitle: 'ok game',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1' },
    });
    const reserve = makeGame({
      title: 'Reserve',
      normalizedTitle: 'reserve',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/2' },
    });
    const selected = makeSelected({
      newReleases: [ok],
      newReleasesReserves: [reserve],
    });

    removeZombieGames(selected);

    // zombie なし → reserves は使わず newReleases は1件のまま
    expect(selected.newReleases).toHaveLength(1);
    expect(selected.newReleases[0].title).toBe('OK Game');
  });

  it('reserve が既に newReleases にいるタイトルと重複していれば補充しない', () => {
    const zombie = makeGame({
      title: 'Zombie',
      normalizedTitle: 'zombie',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1' },
      // coverImage なし
    });
    const survivor = makeGame({
      title: 'Survivor',
      normalizedTitle: 'survivor',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/2' },
    });
    // reserves に survivor と同じ normalizedTitle を持つゲームが入っている
    const duplicateReserve = makeGame({
      title: 'Survivor',
      normalizedTitle: 'survivor',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { official: 'https://example.com' },
    });
    const selected = makeSelected({
      newReleases: [zombie, survivor],
      newReleasesReserves: [duplicateReserve],
    });

    removeZombieGames(selected);

    // zombie 除去後 1件、reserve は重複なので補充されず 1件のまま
    expect(selected.newReleases).toHaveLength(1);
    expect(selected.newReleases[0].title).toBe('Survivor');
  });
});

describe('parseSteamReleaseDate', () => {
  it('Steam Storefront の "YYYY年M月D日" 形式を YYYY-MM-DD に正規化する', () => {
    expect(parseSteamReleaseDate('2026年6月9日')).toBe('2026-06-09');
  });

  it('1桁の月日もゼロ埋めする', () => {
    expect(parseSteamReleaseDate('2024年1月3日')).toBe('2024-01-03');
  });

  it('2桁の月日はそのまま', () => {
    expect(parseSteamReleaseDate('2025年12月31日')).toBe('2025-12-31');
  });

  it('undefined / 空文字は undefined を返す', () => {
    expect(parseSteamReleaseDate(undefined)).toBeUndefined();
    expect(parseSteamReleaseDate('')).toBeUndefined();
  });

  it('未確定文字列（"Coming Soon" 等）は undefined を返す', () => {
    expect(parseSteamReleaseDate('Coming Soon')).toBeUndefined();
    expect(parseSteamReleaseDate('近日公開')).toBeUndefined();
    expect(parseSteamReleaseDate('Q4 2026')).toBeUndefined();
  });

  it('英語フォーマットは未対応として undefined を返す', () => {
    expect(parseSteamReleaseDate('Jun 9, 2026')).toBeUndefined();
  });
});

describe('isQualifiedCompanyName', () => {
  it('通常の会社名は採用する', () => {
    expect(isQualifiedCompanyName('Square Enix')).toBe(true);
    expect(isQualifiedCompanyName('THQ Nordic')).toBe(true);
    expect(isQualifiedCompanyName('Mega Crit Games')).toBe(true);
    expect(isQualifiedCompanyName('Alkimia Interactive')).toBe(true);
  });

  it('日本語混在の会社名は採用する', () => {
    expect(isQualifiedCompanyName('株式会社カプコン')).toBe(true);
    expect(isQualifiedCompanyName('スクウェア・エニックス')).toBe(true);
  });

  it('Steam アカウント名そのままの形式（小文字英数字+_、20文字未満）は除外する', () => {
    expect(isQualifiedCompanyName('lemorion_1224')).toBe(false);
    expect(isQualifiedCompanyName('user123')).toBe(false);
    expect(isQualifiedCompanyName('a_b_c')).toBe(false);
  });

  it('長い英数字+_ の文字列は会社名として採用する（20文字以上）', () => {
    expect(isQualifiedCompanyName('long_company_name_here')).toBe(true);
  });

  it('スペース等を含む短い会社名は採用する（記号で account-name 判定を抜ける）', () => {
    expect(isQualifiedCompanyName('id Software')).toBe(true);
    expect(isQualifiedCompanyName('505 Games')).toBe(true);
  });

  it('短い純英数字（"EA" "2K" 等）は account-name 判定で除外される（仕様: 過剰削除を許容）', () => {
    // Steam Storefront は通常フルネーム（"Electronic Arts" 等）を返すため、
    // この false-negative は実運用上ほぼ問題にならない。
    expect(isQualifiedCompanyName('EA')).toBe(false);
    expect(isQualifiedCompanyName('2K')).toBe(false);
  });

  it('空文字は除外する', () => {
    expect(isQualifiedCompanyName('')).toBe(false);
  });
});
