/**
 * fetch-data ヘルパーのユニットテスト
 *
 * Issue #94: Steam Storefront 補完で導入した正規化・品質ガード関数。
 */

import { describe, it, expect } from 'vitest';
import { parseSteamReleaseDate, isQualifiedCompanyName, removeZombieGames, addPcPlatformIfMissing, enrichGameFromIgdb } from './fetch-data.js';
import type { SelectedGames, GameData, IGDBGame } from './types.js';

// テスト用 IGDBGame ファクトリ（必須フィールドのみ設定）
function makeIgdbGame(overrides: Partial<IGDBGame> = {}): IGDBGame {
  return {
    id: 1,
    name: 'Test Game',
    slug: 'test-game',
    ...overrides,
  };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// addPcPlatformIfMissing — Issue #144: Steam 解決時の PC プラットフォーム補完
// ─────────────────────────────────────────────────────────────────────────────
describe('addPcPlatformIfMissing — Steam 解決時の PC プラットフォーム補完', () => {
  it('platforms が PS4 のみの場合に PC (Microsoft Windows) を追加して true を返す', () => {
    const platforms = ['PlayStation 4'];
    const result = addPcPlatformIfMissing(platforms);
    expect(result).toBe(true);
    expect(platforms).toContain('PC (Microsoft Windows)');
    expect(platforms).toContain('PlayStation 4');
  });

  it('platforms に既に PC (Microsoft Windows) が含まれている場合は追加せず false を返す', () => {
    const platforms = ['PC (Microsoft Windows)', 'Xbox Series X|S'];
    const result = addPcPlatformIfMissing(platforms);
    expect(result).toBe(false);
    const pcCount = platforms.filter((p) => p.toLowerCase().includes('windows')).length;
    expect(pcCount).toBe(1);
  });

  it('"windows" を含む別表記がある場合も重複追加しない', () => {
    const platforms = ['PC (Windows)'];
    const result = addPcPlatformIfMissing(platforms);
    expect(result).toBe(false);
    expect(platforms).toHaveLength(1);
  });

  it('platforms が空の場合は追加して true を返す', () => {
    const platforms: string[] = [];
    const result = addPcPlatformIfMissing(platforms);
    expect(result).toBe(true);
    expect(platforms).toEqual(['PC (Microsoft Windows)']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameFromIgdb — Issue #166 再発対応: appId アンカーを持つ候補は appId 確証必須
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameFromIgdb — appId 整合性ガード', () => {
  it('Brick Game 再発ケース: appId=1087090・releaseDate 無しの候補に旧作（Steam URL 無し）が来たら上書きしない', () => {
    // Vol.14 再発の実際のケース: 新作 Brick Game（appId=1087090, IGDB 未登録）の
    // 名前検索フォールバックが旧作（1989, Steam URL 無し）を返した。
    // 旧実装は igdbAppId=undefined のため appId 不一致ガードをスルーしていた。
    const game = makeGame({
      title: 'Brick Game',
      normalizedTitle: 'brick game',
      steamAppId: 1087090,
      platforms: ['PC'],
      genres: [],
      // releaseDate なし（Steam 候補は発売日を持たない）
    });
    const igdbGame = makeIgdbGame({
      name: 'Brick Game',
      releaseDate: '1989-12-31',
      genres: ['Puzzle', 'Racing', 'Arcade'],
      developer: 'Shenzhen Xinfeilong Electronic Factory',
      // steamUrl なし（旧作は IGDB に Steam URL 未登録）
      coverUrl: 'https://images.igdb.com/co4ahd.jpg',
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(false);
    expect(game.releaseDate).toBeUndefined();
    expect(game.genres).toEqual([]);
    expect(game.developer).toBeUndefined();
    expect(game.coverImage).toBeUndefined();
  });

  it('Brick Game: 別 appId を持つ旧作 IGDB が来ても上書きしない（明示的 appId 不一致）', () => {
    const game = makeGame({
      title: 'Brick Game',
      normalizedTitle: 'brick game',
      steamAppId: 1087090,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Brick Game',
      releaseDate: '1989-12-31',
      genres: ['Puzzle', 'Racing', 'Arcade'],
      developer: 'Shenzhen Xinfeilong Electronic Factory',
      steamUrl: 'https://store.steampowered.com/app/9999999',
      coverUrl: 'https://images.igdb.com/co4ahd.jpg',
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(false);
    expect(game.releaseDate).toBeUndefined();
    expect(game.genres).toEqual([]);
    expect(game.developer).toBeUndefined();
    expect(game.coverImage).toBeUndefined();
  });

  it('appId 一致の正しい IGDB 結果は従来どおり全フィールド上書きする（回帰防止）', () => {
    const game = makeGame({
      title: 'Elden Ring',
      normalizedTitle: 'elden ring',
      steamAppId: 1245620,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Elden Ring',
      slug: 'elden-ring',
      releaseDate: '2022-02-25',
      genres: ['Role-playing (RPG)'],
      platforms: ['PC (Microsoft Windows)'],
      developer: 'FromSoftware',
      publisher: 'Bandai Namco',
      coverUrl: 'https://images.igdb.com/elden.jpg',
      steamUrl: 'https://store.steampowered.com/app/1245620',
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.releaseDate).toBe('2022-02-25');
    expect(game.genres).toEqual(['Role-playing (RPG)']);
    expect(game.developer).toBe('FromSoftware');
    expect(game.coverImage).toBe('https://images.igdb.com/elden.jpg');
    expect(game.igdbSlug).toBe('elden-ring');
  });

  it('steamAppId を持つ候補には IGDB 側 steamUrl なしの結果も拒否する（appId 確証必須）', () => {
    // searchGameBySteamAppId で確定した結果なら steamUrl が補完されるので sameByAppId=true になる。
    // ここは名前検索フォールバック経路（steamUrl 無し）が来た場合のテスト。
    const game = makeGame({
      title: 'Some Indie',
      normalizedTitle: 'some indie',
      steamAppId: 555,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Some Indie',
      slug: 'some-indie',
      genres: ['Indie'],
      developer: 'Solo Dev',
      // steamUrl なし → 名前検索フォールバック経路
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    // steamAppId があるが IGDB の steamUrl で確証できないため拒否
    expect(applied).toBe(false);
    expect(game.genres).toEqual([]);
    expect(game.developer).toBeUndefined();
  });

  it('appId が両方 undefined でも title+年が一致すれば従来どおり上書きする（名前検索フォールバック経路）', () => {
    const game = makeGame({
      title: 'Nameless Classic',
      normalizedTitle: 'nameless classic',
      releaseDate: '2010-05-01',
      platforms: [],
      genres: [],
      // steamAppId なし
    });
    const igdbGame = makeIgdbGame({
      name: 'Nameless Classic',
      slug: 'nameless-classic',
      releaseDate: '2010-05-01',
      genres: ['Adventure'],
      // steamUrl なし
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.genres).toEqual(['Adventure']);
  });

  it('appId 無し・title/年が食い違う名前検索結果は上書き拒否（Issue #50 の既存ガード維持）', () => {
    const game = makeGame({
      title: 'Foo',
      normalizedTitle: 'foo',
      releaseDate: '2024-01-01',
      platforms: [],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Completely Different Bar',
      releaseDate: '1999-01-01',
      genres: ['Sports'],
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(false);
    expect(game.genres).toEqual([]);
  });
});
