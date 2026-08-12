/**
 * fetch-data ヘルパーのユニットテスト
 *
 * Issue #94: Steam Storefront 補完で導入した正規化・品質ガード関数。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseSteamReleaseDate,
  isQualifiedCompanyName,
  removeZombieGames,
  addPcPlatformIfMissing,
  enrichGameFromIgdb,
  buildNewReleaseCandidates,
  buildClassicCandidates,
  buildIndieCandidates,
  compareIndieCandidates,
  isAlreadySelected,
  deduplicateGames,
  isRemakeOrRemaster,
  isClassicRemakeAllowed,
  isClassicPoolGameType,
  isWithinIndieReleaseWindow,
  aggregateGames,
  toPersistableSelectedGames,
} from './fetch-data.js';
import { isFanGame } from './game-filter.js';
import { isIndieGame } from './indie-classifier.js';
import type { SelectedGames, GameData, IGDBGame, SteamData, YouTubeData, IGDBData } from './types.js';
import type { AmazonRankIndex } from './fetch-amazon-ranking.js';

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
    classic: null,
    ...overrides,
  };
}

// 実行時の「今日」から n 日前の YYYY-MM-DD 文字列を返す（テストフィクスチャ用）。
// isWithinIndieReleaseWindow の実装とは独立した単純な暦計算であり、実装のコピーではない。
function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
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

  it('classic が null の場合は何も変えない（クラッシュしない）', () => {
    const selected = makeSelected({ classic: null });

    expect(() => removeZombieGames(selected)).not.toThrow();
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

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameFromIgdb — gameType/aggregatedRating/aggregatedRatingCount/keywords の転記
// （タスクC: 新作枠リメイク明記・批評スコア・ファンゲーム判定用フィールドの追加取得）
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameFromIgdb — 新規フィールド（gameType/aggregatedRating/aggregatedRatingCount/keywords）の転記', () => {
  it('gameType/aggregatedRating/aggregatedRatingCount/keywords を GameData に転記する', () => {
    const game = makeGame({
      title: 'Resident Evil 4',
      normalizedTitle: 'resident evil 4',
      steamAppId: 2050650,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Resident Evil 4',
      steamUrl: 'https://store.steampowered.com/app/2050650',
      gameType: 8,
      aggregatedRating: 91.5,
      aggregatedRatingCount: 12,
      keywords: ['survival-horror', 'zombies'],
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.gameType).toBe(8);
    expect(game.aggregatedRating).toBe(91.5);
    expect(game.aggregatedRatingCount).toBe(12);
    expect(game.keywords).toEqual(['survival-horror', 'zombies']);
  });

  it('境界値: igdbGame 側に新規フィールドが無い場合、既存の game 側の値を保持する（?? 演算子の挙動）', () => {
    const game = makeGame({
      title: 'Resident Evil 4',
      normalizedTitle: 'resident evil 4',
      steamAppId: 2050650,
      platforms: ['PC'],
      genres: [],
      gameType: 8,
      aggregatedRating: 91.5,
      aggregatedRatingCount: 12,
      keywords: ['survival-horror'],
    });
    const igdbGame = makeIgdbGame({
      name: 'Resident Evil 4',
      steamUrl: 'https://store.steampowered.com/app/2050650',
      // gameType 等を指定しない
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.gameType).toBe(8);
    expect(game.aggregatedRating).toBe(91.5);
    expect(game.aggregatedRatingCount).toBe(12);
    expect(game.keywords).toEqual(['survival-horror']);
  });

  it('境界値: aggregatedRating/aggregatedRatingCount が 0 でも ?? により正しく採用される（|| だと欠損する回帰防止）', () => {
    const game = makeGame({
      title: 'Some Game',
      normalizedTitle: 'some game',
      steamAppId: 1,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Some Game',
      steamUrl: 'https://store.steampowered.com/app/1',
      aggregatedRating: 0,
      aggregatedRatingCount: 0,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.aggregatedRating).toBe(0);
    expect(game.aggregatedRatingCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameFromIgdb — totalRating/totalRatingCount/classicRemakeEligible の転記
// （§5.4/§5.5決着, Issue classic-slot-population）
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameFromIgdb — totalRating/totalRatingCount/classicRemakeEligible の転記', () => {
  it('totalRating/totalRatingCount/classicRemakeEligible を GameData に転記する', () => {
    const game = makeGame({
      title: 'Black Mesa',
      normalizedTitle: 'black mesa',
      steamAppId: 362890,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Black Mesa',
      steamUrl: 'https://store.steampowered.com/app/362890',
      totalRating: 87.7,
      totalRatingCount: 550,
      classicRemakeEligible: true,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.totalRating).toBe(87.7);
    expect(game.totalRatingCount).toBe(550);
    expect(game.classicRemakeEligible).toBe(true);
  });

  it('境界値: igdbGame 側に新規フィールドが無い場合、既存の game 側の値を保持する（?? 演算子の挙動）', () => {
    const game = makeGame({
      title: 'Black Mesa',
      normalizedTitle: 'black mesa',
      steamAppId: 362890,
      platforms: ['PC'],
      genres: [],
      totalRating: 87.7,
      totalRatingCount: 550,
      classicRemakeEligible: true,
    });
    const igdbGame = makeIgdbGame({
      name: 'Black Mesa',
      steamUrl: 'https://store.steampowered.com/app/362890',
      // totalRating 等を指定しない
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.totalRating).toBe(87.7);
    expect(game.totalRatingCount).toBe(550);
    expect(game.classicRemakeEligible).toBe(true);
  });

  it('境界値: totalRating/totalRatingCount が 0、classicRemakeEligible が false でも ?? により正しく採用される（|| だと欠損する回帰防止）', () => {
    const game = makeGame({
      title: 'Some Game',
      normalizedTitle: 'some game',
      steamAppId: 1,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Some Game',
      steamUrl: 'https://store.steampowered.com/app/1',
      totalRating: 0,
      totalRatingCount: 0,
      classicRemakeEligible: false,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.totalRating).toBe(0);
    expect(game.totalRatingCount).toBe(0);
    expect(game.classicRemakeEligible).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameFromIgdb — developerGameCount の転記（§3.4 開発本数による規模判定, Issue #231・PR-I その1）
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameFromIgdb — developerGameCount の転記（§3.4, Issue #231）', () => {
  it('igdbGame.developerGameCount を GameData に転記する', () => {
    const game = makeGame({
      title: 'Test Game',
      normalizedTitle: 'test game',
      steamAppId: 1,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Test Game',
      steamUrl: 'https://store.steampowered.com/app/1',
      developer: 'Some Studio',
      developerGameCount: 241,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.developerGameCount).toBe(241);
  });

  it('境界値: developerGameCount が 0 でも ?? により正しく採用される（|| だと欠損する回帰防止）', () => {
    const game = makeGame({
      title: 'Zero Count Game',
      normalizedTitle: 'zero count game',
      steamAppId: 2,
      platforms: ['PC'],
      genres: [],
    });
    // developer も igdbGame 側で設定する（developerGameCount は必ず同じ会社の developer と
    // ペアで来る実際のデータ形状に合わせる。§修正2: 名前が一致しないと件数を採らないゲートが
    // 入ったため、developer 無しで developerGameCount だけ、というフィクスチャは非現実的）。
    const igdbGame = makeIgdbGame({
      name: 'Zero Count Game',
      steamUrl: 'https://store.steampowered.com/app/2',
      developer: 'Zero Count Studio',
      developerGameCount: 0,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.developerGameCount).toBe(0);
  });

  it('igdbGame 側に developerGameCount が無い場合、既存の game 側の値を保持する', () => {
    const game = makeGame({
      title: 'Keep Existing',
      normalizedTitle: 'keep existing',
      steamAppId: 3,
      platforms: ['PC'],
      genres: [],
      developerGameCount: 99,
    });
    const igdbGame = makeIgdbGame({
      name: 'Keep Existing',
      steamUrl: 'https://store.steampowered.com/app/3',
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.developerGameCount).toBe(99);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // developer 名とのペアリングガード（コードレビュー指摘）
  //
  // enrichGameFromIgdb は `game.developer = igdbGame.developer || game.developer` を
  // developerGameCount の転記より先に実行するため、igdbGame.developer が truthy な限り
  // 上書き後の game.developer は必ず igdbGame.developer と一致する（`||` の性質上）。
  // そのため「名前が食い違う」ケースは、igdbGame.developer が falsy（取得できなかった）のに
  // developerGameCount だけが（本来ありえないが防御的に）付いてくるという形でのみ構築できる。
  // ─────────────────────────────────────────────────────────────────────────
  it('igdbGame.developer が取得できず developerGameCount だけがある場合、名前を確認できないため件数は採用されない', () => {
    const game = makeGame({
      title: 'Unverifiable Count Game',
      normalizedTitle: 'unverifiable count game',
      steamAppId: 4,
      platforms: ['PC'],
      genres: [],
      developer: 'Small Studio',
    });
    const igdbGame = makeIgdbGame({
      name: 'Unverifiable Count Game',
      steamUrl: 'https://store.steampowered.com/app/4',
      // developer が undefined のまま developerGameCount だけ来る、という本来ありえない
      // 組み合わせを防御的にテストする（実データでは mapRawGameToIGDBGame が両方を
      // 同じ involved_companies レコードから同時にセットするため通常は起こらない）。
      developerGameCount: 241,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    // developer は || により既存の 'Small Studio' のまま
    expect(game.developer).toBe('Small Studio');
    // developerGameCount は取り違えを防ぐため採用されない
    expect(game.developerGameCount).toBeUndefined();
    expect(isIndieGame(game)).toEqual({ ok: true });
  });

  // 表記ゆれ吸収そのもの（normalizeDeveloperName）は pickDeveloperGameCount の
  // ユニットテスト（indie-classifier.test.ts）で検証済み。ここでは、enrichGameFromIgdb
  // 経由でも件数が実際に isIndieGame の判定まで届くことを確認する。
  it('developer 名が一致する場合、件数が採用され isIndieGame が large-studio になる', () => {
    const game = makeGame({
      title: 'Alias Match Game',
      normalizedTitle: 'alias match game',
      steamAppId: 5,
      platforms: ['PC'],
      genres: [],
    });
    const igdbGame = makeIgdbGame({
      name: 'Alias Match Game',
      steamUrl: 'https://store.steampowered.com/app/5',
      developer: 'Nippon Ichi Software',
      developerGameCount: 187,
    });

    const applied = enrichGameFromIgdb(game, igdbGame);

    expect(applied).toBe(true);
    expect(game.developerGameCount).toBe(187);
    expect(isIndieGame(game)).toMatchObject({ ok: false, reason: 'large-studio' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isAlreadySelected — 号内カテゴリ間の重複判定（§6.3・正規化タイトル比較）
// ─────────────────────────────────────────────────────────────────────────────
describe('isAlreadySelected — 号内カテゴリ間の重複判定（正規化タイトル比較）', () => {
  it('大文字小文字違い・区切り文字違い（コロン→スペース）が同一と判定される', () => {
    // normalizeTitle が実際に吸収する差異のみを検証する。
    // 小文字化 + 全角/半角コロンをスペースに変換 + 連続空白圧縮:
    //   "Slay the Spire: II" → "slay the spire ii"
    //   "SLAY THE SPIRE II"  → "slay the spire ii"
    // 注: ローマ数字とアラビア数字の差（II と 2）は normalizeTitle では吸収されない
    // （実測: normalize.ts:19-27。§6.3 の記述に反するので、そのケースはテストしない）。
    const game = makeGame({ title: 'Slay the Spire: II', normalizedTitle: 'slay the spire ii' });
    const selected = [makeGame({ title: 'SLAY THE SPIRE II', normalizedTitle: 'slay the spire ii' })];

    expect(isAlreadySelected(game, selected)).toBe(true);
  });

  it('別作品は別と判定される', () => {
    const game = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    const selected = [makeGame({ title: 'Ori and the Blind Forest', normalizedTitle: 'ori and the blind forest' })];

    expect(isAlreadySelected(game, selected)).toBe(false);
  });

  it('null / undefined を含む配列でも安全に動く（誤って例外を投げたり誤マッチしたりしない）', () => {
    const game = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    const selected: (GameData | null | undefined)[] = [null, undefined];

    expect(() => isAlreadySelected(game, selected)).not.toThrow();
    expect(isAlreadySelected(game, selected)).toBe(false);
  });

  it('null 混在配列中に一致するゲームがあれば true を返す', () => {
    const game = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    const selected: (GameData | null | undefined)[] = [
      null,
      makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' }),
      undefined,
    ];

    expect(isAlreadySelected(game, selected)).toBe(true);
  });

  it('空配列では false を返す', () => {
    const game = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    expect(isAlreadySelected(game, [])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNewReleaseCandidates — 新作枠の候補構築（3軸スコア降順・§2.3）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildNewReleaseCandidates', () => {
  const releasedAfter = new Date('2026-05-01');

  it('3軸スコア降順に並ぶ（旧ソート＝批評スコア/igdbRating降順とは異なる順序になることを検証）', () => {
    // 旧ソートキー: 批評スコア || igdbRating || 0
    //   SteamHitNoName: 批評スコア/igdbRating とも無し → 0
    //   CriticHigh: 批評スコア=84 → 84
    //   旧ソートなら [CriticHigh, SteamHitNoName] の順になる
    //
    // 新ソート（3軸スコア, steamSlotCount=20）:
    //   SteamHitNoName: steam軸 raw=100*(1-(1-1)/20)=100 → score=100
    //   CriticHigh: critic軸 raw=84*min(1,4/4)=84 → score=84
    //   新ソートなら [SteamHitNoName, CriticHigh] の順になる（＝差し替えが効いている証拠）
    const steamHitNoName = makeGame({
      title: 'SteamHitNoName',
      normalizedTitle: 'steamhitnoname',
      releaseDate: '2026-06-01',
      steamRank: 1,
    });
    const criticHigh = makeGame({
      title: 'CriticHigh',
      normalizedTitle: 'critichigh',
      releaseDate: '2026-06-01',
      aggregatedRating: 84,
      aggregatedRatingCount: 4,
      igdbRatingCount: 5, // hasExistenceEvidence 用（steamRank なしでも存在根拠を持たせる。votesMin=15未満なのでスコアのvotes軸には寄与しない）
    });

    const result = buildNewReleaseCandidates([criticHigh, steamHitNoName], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).toEqual(['SteamHitNoName', 'CriticHigh']);
  });

  it('ファンゲーム（keywords経由）は候補から落ち、同じフィクスチャ内の通常ゲームは残る（ポジティブコントロール）', () => {
    const fanGame = makeGame({
      title: 'Totally A Fan Game',
      normalizedTitle: 'totally a fan game',
      releaseDate: '2026-06-01',
      steamRank: 5,
      keywords: ['unofficial', 'fangame'],
    });
    const normalGame = makeGame({
      title: 'Normal New Release',
      normalizedTitle: 'normal new release',
      releaseDate: '2026-06-01',
      steamRank: 3,
    });

    const result = buildNewReleaseCandidates([fanGame, normalGame], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).not.toContain('Totally A Fan Game');
    expect(result.map((g) => g.title)).toContain('Normal New Release');
  });

  it('境界値: releaseDate が releasedAfter と同日（それより後ではない）は除外される', () => {
    const boundary = makeGame({
      title: 'Boundary Same Day',
      normalizedTitle: 'boundary same day',
      releaseDate: '2026-05-01', // releasedAfter と同日 → "より後" ではない
      steamRank: 1,
    });

    const result = buildNewReleaseCandidates([boundary], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result).toHaveLength(0);
  });

  it('境界値: releaseDate が releasedAfter の1日後は含まれる', () => {
    const boundary = makeGame({
      title: 'Boundary Next Day',
      normalizedTitle: 'boundary next day',
      releaseDate: '2026-05-02',
      steamRank: 1,
    });

    const result = buildNewReleaseCandidates([boundary], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).toContain('Boundary Next Day');
  });

  it('クールダウン中のタイトルは除外され、同じフィクスチャ内のクールダウン外タイトルは残る', () => {
    const onCooldown = makeGame({
      title: 'Cooldown Game',
      normalizedTitle: 'cooldown game',
      releaseDate: '2026-06-01',
      steamRank: 1,
    });
    const notOnCooldown = makeGame({
      title: 'Fresh Game',
      normalizedTitle: 'fresh game',
      releaseDate: '2026-06-01',
      steamRank: 2,
    });

    const result = buildNewReleaseCandidates([onCooldown, notOnCooldown], {
      releasedAfter,
      cooldown: new Set(['cooldown game']),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).not.toContain('Cooldown Game');
    expect(result.map((g) => g.title)).toContain('Fresh Game');
  });

  it('releaseDate が無いゲームは除外される', () => {
    const noDate = makeGame({
      title: 'No Date Game',
      normalizedTitle: 'no date game',
      steamRank: 1,
      // releaseDate なし
    });

    const result = buildNewReleaseCandidates([noDate], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNewReleaseCandidates — 新作枠の探索窓は60日（Issue #260: selectGamesForArticles が
// 3ヶ月相当（setMonth(-3), 実測約91〜92日）で呼んでいたのを、仕様書§2.3・付録パラメータ表の
// 60日に揃えた回帰防止テスト）。
//
// selectGamesForArticles 自身は export されておらず直接テストできないため、実際に production
// が渡すのと同じ「releasedAfter = 今日から60日前」を releasedAfter に注入し、実装
// （buildNewReleaseCandidates 内の `releaseDate > releasedAfter`）を実際に呼び出して検証する。
// ─────────────────────────────────────────────────────────────────────────────
describe('buildNewReleaseCandidates — 新作枠の探索窓は60日（Issue #260）', () => {
  // 実装のコピーではなく、独立した単純な暦計算（daysAgoStr と同じ発想）。
  function sixtyDaysAgoFixture(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d;
  }

  it('59日前に発売されたタイトルは60日窓に含まれる（ポジティブ）', () => {
    const game = makeGame({
      title: 'Released 59 Days Ago',
      normalizedTitle: 'released 59 days ago',
      releaseDate: daysAgoStr(59),
      steamRank: 1,
    });

    const result = buildNewReleaseCandidates([game], {
      releasedAfter: sixtyDaysAgoFixture(),
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).toContain('Released 59 Days Ago');
  });

  it('ちょうど60日前に発売されたタイトルは窓外（境界: releasedAfterと同日は含まれない）', () => {
    const game = makeGame({
      title: 'Released 60 Days Ago',
      normalizedTitle: 'released 60 days ago',
      releaseDate: daysAgoStr(60),
      steamRank: 1,
    });

    const result = buildNewReleaseCandidates([game], {
      releasedAfter: sixtyDaysAgoFixture(),
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).not.toContain('Released 60 Days Ago');
  });

  it('61日前に発売されたタイトルは窓外（ネガティブ。旧3ヶ月窓なら含まれてしまっていたケース）', () => {
    const game = makeGame({
      title: 'Released 61 Days Ago',
      normalizedTitle: 'released 61 days ago',
      releaseDate: daysAgoStr(61),
      steamRank: 1,
    });

    const result = buildNewReleaseCandidates([game], {
      releasedAfter: sixtyDaysAgoFixture(),
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });

    expect(result.map((g) => g.title)).not.toContain('Released 61 Days Ago');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNewReleaseCandidates — Amazon 経路（§2.3 PR-B2、第4軸「国内販売」の配線）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildNewReleaseCandidates — Amazon経路（§2.3 PR-B2）', () => {
  const releasedAfter = new Date('2026-05-01');

  it('amazonRanks を渡すと、Amazon掲載のみで品質・実存条件を満たすゲームが候補に入る。渡さなければ同じゲームは候補に入らない（ポジティブコントロール）', () => {
    // 他のシグナル（steamRank/igdbRatingCount/aggregatedRatingCount）を
    // 一切持たない国内専用タイトルを想定
    const amazonOnly = makeGame({
      title: 'Amazon Only Game',
      normalizedTitle: 'amazon only game',
      releaseDate: '2026-06-01',
    });

    const amazonRanks: AmazonRankIndex = {
      lookup: (g) => (g.title === 'Amazon Only Game' ? 10 : undefined),
      size: 1,
    };

    const withAmazon = buildNewReleaseCandidates([amazonOnly], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
      amazonRanks,
    });
    expect(withAmazon.map((g) => g.title)).toContain('Amazon Only Game');

    // ポジティブコントロール: amazonRanks を渡さなければ同じゲームは候補に入らない
    const withoutAmazon = buildNewReleaseCandidates([amazonOnly], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
    });
    expect(withoutAmazon.map((g) => g.title)).not.toContain('Amazon Only Game');
  });

  it('amazonRanks を渡した場合に候補の並びが Amazon 順位を反映する', () => {
    const amazonTop = makeGame({
      title: 'Amazon Top',
      normalizedTitle: 'amazon top',
      releaseDate: '2026-06-01',
    });
    const amazonLow = makeGame({
      title: 'Amazon Low',
      normalizedTitle: 'amazon low',
      releaseDate: '2026-06-01',
    });

    const amazonRanks: AmazonRankIndex = {
      lookup: (g) => {
        if (g.title === 'Amazon Top') return 1;
        if (g.title === 'Amazon Low') return 40;
        return undefined;
      },
      size: 2,
    };

    const result = buildNewReleaseCandidates([amazonLow, amazonTop], {
      releasedAfter,
      cooldown: new Set(),
      steamTopSellersCount: 20,
      amazonRanks,
    });

    expect(result.map((g) => g.title)).toEqual(['Amazon Top', 'Amazon Low']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildClassicCandidates — 名作枠の候補構築（§5.4/§5.5/§5.8決着, Issue classic-slot-population）
//
// 旧仕様（批評スコア>80 or igdbRating>=80、igdbRating>=85なら無条件、それ以外はSteam/YouTube人気）
// は§5.4の母集団条件（total_rating>=85 & total_rating_count>=200）に一本化された。
// ─────────────────────────────────────────────────────────────────────────────
describe('buildClassicCandidates', () => {
  it('ファンゲームが落ち、同じフィクスチャ内の通常の名作候補（母集団条件を満たす）は残る（ポジティブコントロール・実測値ベース）', () => {
    // 実測値: Pokémon Infinite Fusion は他の全条件（人気・cover/summary）を通過して
    // 実際に選ばれていた（管理者が本日ライブ実測）。isFanGame 追加が無いと落ちないことの回帰防止。
    const infiniteFusion = makeGame({
      title: 'Pokémon Infinite Fusion',
      normalizedTitle: 'pokemon infinite fusion',
      totalRating: 98.4,
      totalRatingCount: 250,
      keywords: ['unofficial', 'turn-based-combat', 'fangame', 'turn-based-rpg', 'fanmade'],
      coverImage: 'https://example.com/cover.jpg',
      summary: 'A Pokémon fan game.',
    });
    const normalClassic = makeGame({
      title: 'The Witcher 3',
      normalizedTitle: 'the witcher 3',
      totalRating: 92,
      totalRatingCount: 5423,
      gameType: 0,
      coverImage: 'https://example.com/witcher3.jpg',
      summary: 'An open world RPG.',
    });

    const result = buildClassicCandidates([infiniteFusion, normalClassic], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('Pokémon Infinite Fusion');
    expect(result.map((g) => g.title)).toContain('The Witcher 3');
  });

  it('クールダウン中のタイトルは除外される。同じテストでクールダウン外の候補（母集団条件を満たす）が残ることも確認する', () => {
    const onCooldown = makeGame({
      title: 'Cooldown Classic',
      normalizedTitle: 'cooldown classic',
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });
    const notOnCooldown = makeGame({
      title: 'Not Cooldown Classic',
      normalizedTitle: 'not cooldown classic',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/cover2.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([onCooldown, notOnCooldown], {
      cooldown: new Set(['cooldown classic']),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('Cooldown Classic');
    expect(result.map((g) => g.title)).toContain('Not Cooldown Classic');
  });

  it('母集団条件を満たさない（total_rating_count<200）候補は除外される。境界値199/200を同じテストで確認する', () => {
    const below = makeGame({
      title: 'Below Threshold',
      normalizedTitle: 'below threshold',
      totalRating: 90,
      totalRatingCount: 199,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });
    const atThreshold = makeGame({
      title: 'At Threshold',
      normalizedTitle: 'at threshold',
      totalRating: 90,
      totalRatingCount: 200,
      gameType: 0,
      coverImage: 'https://example.com/cover2.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([below, atThreshold], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('Below Threshold');
    expect(result.map((g) => g.title)).toContain('At Threshold');
  });

  it('母集団条件を満たさない（total_rating<85）候補は除外される。境界値84/85を同じテストで確認する', () => {
    const below = makeGame({
      title: 'Below Rating Threshold',
      normalizedTitle: 'below rating threshold',
      totalRating: 84,
      totalRatingCount: 400,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });
    const atThreshold = makeGame({
      title: 'At Rating Threshold',
      normalizedTitle: 'at rating threshold',
      totalRating: 85,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/cover2.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([below, atThreshold], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('Below Rating Threshold');
    expect(result.map((g) => g.title)).toContain('At Rating Threshold');
  });

  it('totalRating/totalRatingCountが未定義の候補は除外される。同じテストで定義済みの候補が残ることも確認する', () => {
    const undefinedRating = makeGame({
      title: 'No Rating Data',
      normalizedTitle: 'no rating data',
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
      // totalRating / totalRatingCount 未設定
    });
    const withRating = makeGame({
      title: 'Has Rating Data',
      normalizedTitle: 'has rating data',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/cover2.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([undefinedRating, withRating], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('No Rating Data');
    expect(result.map((g) => g.title)).toContain('Has Rating Data');
  });

  it('coverImage または summary が欠落した候補は除外される（母集団条件は満たすフィクスチャで検証）', () => {
    const noCover = makeGame({
      title: 'No Cover',
      normalizedTitle: 'no cover',
      totalRating: 90,
      totalRatingCount: 400,
      summary: 'summary',
      // coverImage なし
    });
    const noSummary = makeGame({
      title: 'No Summary',
      normalizedTitle: 'no summary',
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/cover.jpg',
      // summary なし
    });

    const result = buildClassicCandidates([noCover, noSummary], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result).toHaveLength(0);
  });

  it('号内重複除外が newReleases / indies の2方向に効く', () => {
    const inNewReleases = makeGame({
      title: 'Already New Release',
      normalizedTitle: 'already new release',
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/1.jpg',
      summary: 's',
    });
    const inIndies = makeGame({
      title: 'Already Indie',
      normalizedTitle: 'already indie',
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/2.jpg',
      summary: 's',
    });
    const untouchedCandidate = makeGame({
      title: 'Untouched Classic',
      normalizedTitle: 'untouched classic',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/3.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates(
      [inNewReleases, inIndies, untouchedCandidate],
      {
        cooldown: new Set(),
        alreadySelected: [
          makeGame({ title: 'Already New Release', normalizedTitle: 'already new release' }),
          makeGame({ title: 'Already Indie', normalizedTitle: 'already indie' }),
        ],
      }
    );

    expect(result.map((g) => g.title)).toEqual(['Untouched Classic']);
  });

  it('alreadySelected に null/undefined が含まれても候補が誤って落ちない', () => {
    const game = makeGame({
      title: 'Should Survive',
      normalizedTitle: 'should survive',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([game], {
      cooldown: new Set(),
      alreadySelected: [null, undefined],
    });

    expect(result.map((g) => g.title)).toContain('Should Survive');
  });

  it('評価母数（totalRatingCount）降順に並ぶ（§5.8決着。批評スコア/igdbRatingによるソートは廃止）', () => {
    const lower = makeGame({
      title: 'Lower Count',
      normalizedTitle: 'lower count',
      totalRating: 86,
      totalRatingCount: 300,
      gameType: 0,
      coverImage: 'https://example.com/1.jpg',
      summary: 's',
    });
    const higher = makeGame({
      title: 'Higher Count',
      normalizedTitle: 'higher count',
      totalRating: 86,
      totalRatingCount: 5000,
      gameType: 0,
      coverImage: 'https://example.com/2.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([lower, higher], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).toEqual(['Higher Count', 'Lower Count']);
  });

  it('totalRatingCountが同値の場合は元の配列順を保つ（安定ソート）', () => {
    const first = makeGame({
      title: 'First In Array',
      normalizedTitle: 'first in array',
      totalRating: 86,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/1.jpg',
      summary: 's',
    });
    const second = makeGame({
      title: 'Second In Array',
      normalizedTitle: 'second in array',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/2.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([first, second], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).toEqual(['First In Array', 'Second In Array']);
  });

  it('Splatoon Raiders の実測値（誤選定の回帰防止）は新条件で確実に落ちる。同じテストでポジティブコントロール（Main Game・評価母数十分）が採用されることも確認する', () => {
    // 実測値そのもの（管理者が本日ライブAPIで確認済み）:
    // totalRating=91, totalRatingCount=7, igdbRating=95, igdbRatingCount=6, gameType=0
    // 現行の buildClassicCandidates は igdbRating>=85 経路で無条件通過させていたため誤選定していた。
    const splatoonRaiders = makeGame({
      title: 'Splatoon Raiders',
      normalizedTitle: 'splatoon raiders',
      totalRating: 91,
      totalRatingCount: 7,
      igdbRating: 95,
      igdbRatingCount: 6,
      gameType: 0,
      coverImage: 'https://example.com/splatoon-raiders.jpg',
      summary: 'summary',
    });
    // ポジティブコントロール: Main Game で評価母数が十分な候補
    const mainGameHighCount = makeGame({
      title: 'Well-Established Classic',
      normalizedTitle: 'well-established classic',
      totalRating: 92,
      totalRatingCount: 3548,
      gameType: 0,
      coverImage: 'https://example.com/classic.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([splatoonRaiders, mainGameHighCount], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain('Splatoon Raiders');
    expect(result.map((g) => g.title)).toContain('Well-Established Classic');
  });

  it('Issue #289 回帰防止: ジャンルで削られることなく、高評価母数のゲームが名作候補に含まれる', () => {
    // 実データに基づく GTA V 相当のゲーム（genres に Racing を含む、高評価母数）
    const gtaVLike = makeGame({
      title: 'Grand Theft Auto V',
      normalizedTitle: 'grand theft auto v',
      genres: ['Shooter', 'Racing', 'Adventure'],
      totalRating: 88.89,
      totalRatingCount: 5896,
      gameType: 0,
      coverImage: 'https://example.com/gtav.jpg',
      summary: 'An action-adventure game.',
    });
    // Witcher 3 相当（評価母数は GTA V より低い）
    const witcher3Like = makeGame({
      title: 'The Witcher 3: Wild Hunt',
      normalizedTitle: 'the witcher 3 wild hunt',
      genres: ['RPG', 'Adventure'],
      totalRating: 92.0,
      totalRatingCount: 5430,
      gameType: 0,
      coverImage: 'https://example.com/witcher3.jpg',
      summary: 'An open world RPG.',
    });

    const result = buildClassicCandidates([gtaVLike, witcher3Like], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    // GTA V は含まれる（ジャンルで除外されない）
    expect(result.map((g) => g.title)).toContain('Grand Theft Auto V');
    // 評価母数降順なので GTA V が上位
    expect(result[0].title).toBe('Grand Theft Auto V');
    expect(result[1].title).toBe('The Witcher 3: Wild Hunt');
  });

  it('Issue #289 回帰防止: alreadySelected が空でも null 要素を含んでもクラッシュしない', () => {
    const game = makeGame({
      title: 'Stable Game',
      normalizedTitle: 'stable game',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });

    const resultEmpty = buildClassicCandidates([game], {
      cooldown: new Set(),
      alreadySelected: [],
    });
    expect(resultEmpty.map((g) => g.title)).toContain('Stable Game');

    const resultWithNull = buildClassicCandidates([game], {
      cooldown: new Set(),
      alreadySelected: [null, undefined],
    });
    expect(resultWithNull.map((g) => g.title)).toContain('Stable Game');
  });

  it('Issue #289 回帰防止: 重複除外機構は動作する（alreadySelected に含まれるゲームは除外される）', () => {
    const toExclude = makeGame({
      title: 'To Exclude',
      normalizedTitle: 'to exclude',
      totalRating: 90,
      totalRatingCount: 500,
      gameType: 0,
      coverImage: 'https://example.com/exclude.jpg',
      summary: 'summary',
    });
    const toInclude = makeGame({
      title: 'To Include',
      normalizedTitle: 'to include',
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
      coverImage: 'https://example.com/include.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([toExclude, toInclude], {
      cooldown: new Set(),
      alreadySelected: [toExclude],
    });

    expect(result.map((g) => g.title)).not.toContain('To Exclude');
    expect(result.map((g) => g.title)).toContain('To Include');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deduplicateGames — 新規フィールドのマージ（修正1）
// 重複エントリをマージするとき gameType/aggregatedRating/aggregatedRatingCount/keywords が
// 黙って捨てられていた回帰の防止（fetch-data.ts:616-636 付近のマージブロック）
// ─────────────────────────────────────────────────────────────────────────────
describe('deduplicateGames — 新規フィールドのマージ（修正1）', () => {
  it('Steam側がprimaryに選ばれるとき、IGDB側の重複からgameType/aggregatedRating/aggregatedRatingCount/keywordsを引き継ぐ', () => {
    // primary 選定基準は steamRank 昇順 → steamRank を持つ Steam 側が primary になる。
    // IGDB 側は steamRank を持たないため duplicate 側に回る。
    const steamEntry = makeGame({
      title: 'Test Game',
      normalizedTitle: 'test game',
      steamAppId: 123,
      steamRank: 1,
      source: ['steam'],
    });
    const igdbEntry = makeGame({
      title: 'Test Game',
      normalizedTitle: 'test game',
      steamAppId: 123,
      source: ['igdb'],
      gameType: 8,
      aggregatedRating: 85.24,
      aggregatedRatingCount: 25,
      keywords: ['unofficial', 'fangame'],
    });

    const result = deduplicateGames([steamEntry, igdbEntry]);

    expect(result).toHaveLength(1);
    expect(result[0].gameType).toBe(8);
    expect(result[0].aggregatedRating).toBe(85.24);
    expect(result[0].aggregatedRatingCount).toBe(25);
    expect(result[0].keywords).toEqual(['unofficial', 'fangame']);
  });

  it('回帰の実害: マージ後の primary は isFanGame() で true になる。ポジティブコントロールとして非ファンゲームの重複ペアは false のまま', () => {
    const fanSteamEntry = makeGame({
      title: 'Fan Made Thing',
      normalizedTitle: 'fan made thing',
      steamAppId: 111,
      steamRank: 1,
      source: ['steam'],
    });
    const fanIgdbEntry = makeGame({
      title: 'Fan Made Thing',
      normalizedTitle: 'fan made thing',
      steamAppId: 111,
      source: ['igdb'],
      keywords: ['fangame'],
    });

    // ポジティブコントロール: keywords がファンゲームを示さない同種の重複ペア
    const normalSteamEntry = makeGame({
      title: 'Normal Game',
      normalizedTitle: 'normal game',
      steamAppId: 222,
      steamRank: 2,
      source: ['steam'],
    });
    const normalIgdbEntry = makeGame({
      title: 'Normal Game',
      normalizedTitle: 'normal game',
      steamAppId: 222,
      source: ['igdb'],
      keywords: ['open-world'],
    });

    const result = deduplicateGames([fanSteamEntry, fanIgdbEntry, normalSteamEntry, normalIgdbEntry]);

    const fan = result.find((g) => g.title === 'Fan Made Thing')!;
    const normal = result.find((g) => g.title === 'Normal Game')!;

    expect(isFanGame(fan)).toBe(true);
    expect(isFanGame(normal)).toBe(false);
  });

  it('境界値: dup.keywords が空配列のとき primary の既存 keywords を潰さない', () => {
    const primaryWithKeywords = makeGame({
      title: 'Has Keywords',
      normalizedTitle: 'has keywords',
      steamAppId: 333,
      steamRank: 1,
      source: ['steam'],
      keywords: ['open-world'],
    });
    const dupEmptyKeywords = makeGame({
      title: 'Has Keywords',
      normalizedTitle: 'has keywords',
      steamAppId: 333,
      source: ['igdb'],
      keywords: [],
    });

    const result = deduplicateGames([primaryWithKeywords, dupEmptyKeywords]);

    expect(result[0].keywords).toEqual(['open-world']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deduplicateGames — totalRating/totalRatingCount/classicRemakeEligible のマージ
// （§5.4/§5.5決着, Issue classic-slot-population。「忘れやすい」と明記された転記箇所）
// ─────────────────────────────────────────────────────────────────────────────
describe('deduplicateGames — totalRating/totalRatingCount/classicRemakeEligible のマージ', () => {
  it('Steam側がprimaryに選ばれるとき、IGDB側の重複からtotalRating/totalRatingCount/classicRemakeEligibleを引き継ぐ', () => {
    const steamEntry = makeGame({
      title: 'Black Mesa',
      normalizedTitle: 'black mesa',
      steamAppId: 362890,
      steamRank: 1,
      source: ['steam'],
    });
    const igdbEntry = makeGame({
      title: 'Black Mesa',
      normalizedTitle: 'black mesa',
      steamAppId: 362890,
      source: ['igdb'],
      totalRating: 87.7,
      totalRatingCount: 550,
      classicRemakeEligible: true,
    });

    const result = deduplicateGames([steamEntry, igdbEntry]);

    expect(result).toHaveLength(1);
    expect(result[0].totalRating).toBe(87.7);
    expect(result[0].totalRatingCount).toBe(550);
    expect(result[0].classicRemakeEligible).toBe(true);
  });

  it('回帰の実害: マージ後の primary が buildClassicCandidates の母集団条件を通過する。ポジティブコントロールとして母集団条件を満たさない重複ペアは通過しない', () => {
    const qualifiesSteam = makeGame({
      title: 'Qualifies Game',
      normalizedTitle: 'qualifies game',
      steamAppId: 111,
      steamRank: 1,
      source: ['steam'],
      coverImage: 'https://example.com/q.jpg',
      summary: 's',
    });
    const qualifiesIgdb = makeGame({
      title: 'Qualifies Game',
      normalizedTitle: 'qualifies game',
      steamAppId: 111,
      source: ['igdb'],
      totalRating: 90,
      totalRatingCount: 400,
      gameType: 0,
    });

    const belowSteam = makeGame({
      title: 'Below Threshold Game',
      normalizedTitle: 'below threshold game',
      steamAppId: 222,
      steamRank: 2,
      source: ['steam'],
      coverImage: 'https://example.com/b.jpg',
      summary: 's',
    });
    const belowIgdb = makeGame({
      title: 'Below Threshold Game',
      normalizedTitle: 'below threshold game',
      steamAppId: 222,
      source: ['igdb'],
      totalRating: 90,
      totalRatingCount: 100, // < 200
    });

    const merged = deduplicateGames([qualifiesSteam, qualifiesIgdb, belowSteam, belowIgdb]);
    const result = buildClassicCandidates(merged, { cooldown: new Set(), alreadySelected: [] });

    expect(result.map((g) => g.title)).toContain('Qualifies Game');
    expect(result.map((g) => g.title)).not.toContain('Below Threshold Game');
  });

  it('境界値: dup.totalRatingCount が 0 でも primary の値が未設定なら採用される（?? の挙動、|| だと欠損する回帰防止）', () => {
    const primaryNoRating = makeGame({
      title: 'Zero Count Game',
      normalizedTitle: 'zero count game',
      steamAppId: 333,
      steamRank: 1,
      source: ['steam'],
    });
    const dupZeroRating = makeGame({
      title: 'Zero Count Game',
      normalizedTitle: 'zero count game',
      steamAppId: 333,
      source: ['igdb'],
      totalRating: 0,
      totalRatingCount: 0,
      classicRemakeEligible: false,
    });

    const result = deduplicateGames([primaryNoRating, dupZeroRating]);

    expect(result[0].totalRating).toBe(0);
    expect(result[0].totalRatingCount).toBe(0);
    expect(result[0].classicRemakeEligible).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deduplicateGames — developerGameCount のマージ（§3.4 開発本数による規模判定, Issue #231・PR-I その1）
// PR-B で deduplicateGames が新フィールドをマージし忘れて差し戻された教訓を踏まえ、
// マージ後の値が isIndieGame の判定に実際に効くことまで検証する。
// ─────────────────────────────────────────────────────────────────────────────
describe('deduplicateGames — developerGameCount のマージ（§3.4, Issue #231）', () => {
  it('primary に developerGameCount が無く dup にある場合、developer 名が一致すればマージ後 primary が isIndieGame で large-studio になる（値が生き残っている証拠）', () => {
    // primary 選定基準は steamRank 昇順 → steamRank を持つ Steam 側が primary になる。
    const primary = makeGame({
      title: 'Merge Test Game',
      normalizedTitle: 'merge test game',
      steamAppId: 700,
      steamRank: 1,
      source: ['steam'],
      developer: 'Arc System Works', // 静的リスト外の名前。本数判定のみで large-studio になることを検証
    });
    const dup = makeGame({
      title: 'Merge Test Game',
      normalizedTitle: 'merge test game',
      steamAppId: 700,
      source: ['igdb'],
      // developerGameCount は同じ会社（Arc System Works）の developed 件数として、
      // developer 名とペアで来るのが実データの形（コードレビュー指摘のガード対応）
      developer: 'Arc System Works',
      developerGameCount: 241,
    });

    const result = deduplicateGames([primary, dup]);

    expect(result).toHaveLength(1);
    expect(result[0].developerGameCount).toBe(241);
    expect(isIndieGame(result[0])).toMatchObject({ ok: false, reason: 'large-studio' });
  });

  it('developer 名が表記ゆれ（Co., Ltd.）込みで一致する場合も、dup の developerGameCount が採用される', () => {
    const primary = makeGame({
      title: 'Alias Merge Game',
      normalizedTitle: 'alias merge game',
      steamAppId: 701,
      steamRank: 1,
      source: ['steam'],
      developer: 'Nippon Ichi Software Co., Ltd.',
    });
    const dup = makeGame({
      title: 'Alias Merge Game',
      normalizedTitle: 'alias merge game',
      steamAppId: 701,
      source: ['igdb'],
      developer: 'Nippon Ichi Software',
      developerGameCount: 187,
    });

    const result = deduplicateGames([primary, dup]);

    expect(result[0].developerGameCount).toBe(187);
    expect(isIndieGame(result[0])).toMatchObject({ ok: false, reason: 'large-studio' });
  });

  it('developer 名が食い違う場合、dup の developerGameCount は採用されない（isIndieGame が large-studio にならない）', () => {
    const primary = makeGame({
      title: 'Mismatch Merge Game',
      normalizedTitle: 'mismatch merge game',
      steamAppId: 702,
      steamRank: 1,
      source: ['steam'],
      developer: 'Small Studio', // Steam 由来の小規模スタジオ名
    });
    const dup = makeGame({
      title: 'Mismatch Merge Game',
      normalizedTitle: 'mismatch merge game',
      steamAppId: 702,
      source: ['igdb'],
      developer: 'Big Port House', // IGDB 側の別会社（共同開発会社等）
      developerGameCount: 241,
    });

    const result = deduplicateGames([primary, dup]);

    expect(result[0].developer).toBe('Small Studio');
    expect(result[0].developerGameCount).toBeUndefined();
    expect(isIndieGame(result[0])).toEqual({ ok: true });
  });

  it('境界値: primary が既に developerGameCount を持つ場合は dup の値で上書きしない（?? の挙動）', () => {
    const primary = makeGame({
      title: 'Keep Primary Count',
      normalizedTitle: 'keep primary count',
      steamAppId: 800,
      steamRank: 1,
      source: ['steam'],
      developerGameCount: 5,
    });
    const dup = makeGame({
      title: 'Keep Primary Count',
      normalizedTitle: 'keep primary count',
      steamAppId: 800,
      source: ['igdb'],
      developerGameCount: 999,
    });

    const result = deduplicateGames([primary, dup]);

    expect(result[0].developerGameCount).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateGames — totalRating/totalRatingCount/classicRemakeEligible の転記
// （§5.4/§5.5決着, Issue classic-slot-population。マッチ時ブランチと新規エントリ生成の2箇所）
// ─────────────────────────────────────────────────────────────────────────────
describe('aggregateGames — totalRating/totalRatingCount/classicRemakeEligible の転記', () => {
  const EMPTY_STEAM: SteamData = { topSellers: [], topPlayed: [], fetchedAt: '' };
  const EMPTY_YOUTUBE: YouTubeData = { trendingVideos: [], fetchedAt: '' };

  it('新規エントリ生成: IGDB 単独ゲームに totalRating/totalRatingCount/classicRemakeEligible が転記される', async () => {
    const igdbData: IGDBData = {
      games: [
        {
          id: 30,
          name: 'Solo Classic Game',
          slug: 'solo-classic-game',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-classic.jpg',
          totalRating: 92.4,
          totalRatingCount: 3548,
          classicRemakeEligible: undefined,
        },
      ],
      fetchedAt: '',
    };

    const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData);

    const game = games.find((g) => g.title === 'Solo Classic Game');
    expect(game).toBeDefined();
    expect(game!.totalRating).toBe(92.4);
    expect(game!.totalRatingCount).toBe(3548);
  });

  it('新規エントリ生成: classicRemakeEligible=true が転記される（リメイク許可の実データ）', async () => {
    const igdbData: IGDBData = {
      games: [
        {
          id: 31,
          name: 'Allowed Remake Game',
          slug: 'allowed-remake-game',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-remake.jpg',
          gameType: 8,
          totalRating: 90,
          totalRatingCount: 667,
          classicRemakeEligible: true,
        },
      ],
      fetchedAt: '',
    };

    const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData);

    const game = games.find((g) => g.title === 'Allowed Remake Game');
    expect(game).toBeDefined();
    expect(game!.classicRemakeEligible).toBe(true);
  });

  it('aggregateGames → buildClassicCandidates の統合: Final Fantasy VII Remake（親 game_type=10 で母集団外、レビュー指摘バグの回帰）が名作枠候補として残る。ポジティブコントロールとして The Last of Us Remastered（親 game_type=0 で母集団内）は落ちる', async () => {
    // classicRemakeEligible はここでは「修正済みの computeClassicRemakeEligible が実測データで
    // 計算する値」を直接与える（IGDBData は mapPoolRawGameToIGDBGame 通過後の形なので、
    // parent_game 自体はこの層には残らない）。fetch-igdb.test.ts 側で computeClassicRemakeEligible
    // 自体が game_type=10 の親を正しく「母集団外」と判定することは別途検証済み。
    const igdbData: IGDBData = {
      games: [
        {
          id: 50,
          name: 'Final Fantasy VII Remake',
          slug: 'final-fantasy-vii-remake',
          genres: ['RPG'],
          coverUrl: 'https://images.igdb.com/cover-ff7r.jpg',
          summary: 'A remake of a classic RPG.',
          gameType: 8,
          totalRating: 89,
          totalRatingCount: 501,
          // 親 Final Fantasy VII: total_rating=87.8, total_rating_count=1630（閾値超え）だが
          // game_type=10（拡張版扱い）で母集団外 → 修正済みロジックでは true（許可）
          classicRemakeEligible: true,
        },
        {
          id: 51,
          name: 'The Last of Us Remastered',
          slug: 'the-last-of-us-remastered-3',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-tlour.jpg',
          summary: 'A remastered version of a classic game.',
          gameType: 9,
          totalRating: 95,
          totalRatingCount: 1693,
          // 親 The Last of Us: total_rating=92.2, total_rating_count=3548, game_type=0 で母集団内
          // → false（除外）
          classicRemakeEligible: false,
        },
      ],
      fetchedAt: '',
    };

    const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData);
    const result = buildClassicCandidates(games, { cooldown: new Set(), alreadySelected: [] });

    const titles = result.map((g) => g.title);
    expect(titles).toContain('Final Fantasy VII Remake');
    expect(titles).not.toContain('The Last of Us Remastered');
  });

  it('マッチ時ブランチ: Steam 由来の既存エントリに IGDB マッチで totalRating/totalRatingCount/classicRemakeEligible が転記される', async () => {
    const steamData: SteamData = {
      topSellers: [{ appId: 600, name: 'Matched Classic Game' }],
      topPlayed: [],
      fetchedAt: '',
    };
    const igdbData: IGDBData = {
      games: [
        {
          id: 40,
          name: 'Matched Classic Game',
          slug: 'matched-classic-game',
          genres: ['RPG'],
          coverUrl: 'https://images.igdb.com/cover-matched.jpg',
          steamUrl: 'https://store.steampowered.com/app/600',
          totalRating: 92,
          totalRatingCount: 5423,
          classicRemakeEligible: undefined,
        },
      ],
      fetchedAt: '',
    };
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(steamData, EMPTY_YOUTUBE, igdbData);
      const game = games.find((g) => g.title === 'Matched Classic Game');
      expect(game).toBeDefined();
      expect(game!.totalRating).toBe(92);
      expect(game!.totalRatingCount).toBe(5423);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('マッチ時ブランチ: classicRemakeEligible=false が転記される（親が母集団内＝リメイク不要の実データ）', async () => {
    const steamData: SteamData = {
      topSellers: [{ appId: 601, name: 'Matched Rejected Remake' }],
      topPlayed: [],
      fetchedAt: '',
    };
    const igdbData: IGDBData = {
      games: [
        {
          id: 41,
          name: 'Matched Rejected Remake',
          slug: 'matched-rejected-remake',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-rejected.jpg',
          steamUrl: 'https://store.steampowered.com/app/601',
          gameType: 9,
          totalRating: 95,
          totalRatingCount: 1693,
          classicRemakeEligible: false,
        },
      ],
      fetchedAt: '',
    };
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(steamData, EMPTY_YOUTUBE, igdbData);
      const game = games.find((g) => g.title === 'Matched Rejected Remake');
      expect(game).toBeDefined();
      expect(game!.classicRemakeEligible).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateGames — developerGameCount の転記（§3.4 開発本数による規模判定, Issue #231・PR-I その1）
//
// マッチ時ブランチ・新規エントリ生成の両方で igdb.developerGameCount が GameData に
// 転記されることを検証する。Storefront API のネットワーク呼び出しに
// 触れないよう、フィクスチャは needsCompletion が false になるよう組み立てるか、
// global.fetch を ok:false でモックして早期 return させる。
// ─────────────────────────────────────────────────────────────────────────────
describe('aggregateGames — developerGameCount の転記（§3.4, Issue #231）', () => {
  const EMPTY_STEAM: SteamData = { topSellers: [], topPlayed: [], fetchedAt: '' };
  const EMPTY_YOUTUBE: YouTubeData = { trendingVideos: [], fetchedAt: '' };

  it('新規エントリ生成: IGDB 単独ゲームに developerGameCount が転記される', async () => {
    const igdbData: IGDBData = {
      games: [
        {
          id: 10,
          name: 'Solo IGDB Game',
          slug: 'solo-igdb-game',
          developer: 'Some New Studio',
          developerGameCount: 241,
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover.jpg',
        },
      ],
      fetchedAt: '',
    };

    const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData);

    const game = games.find((g) => g.title === 'Solo IGDB Game');
    expect(game).toBeDefined();
    expect(game!.developerGameCount).toBe(241);
  });

  it('マッチ時ブランチ: Steam 由来の既存エントリに IGDB マッチで developerGameCount が転記される', async () => {
    const steamData: SteamData = {
      topSellers: [{ appId: 555, name: 'Matched Game' }],
      topPlayed: [],
      fetchedAt: '',
    };
    const igdbData: IGDBData = {
      games: [
        {
          id: 20,
          name: 'Matched Game',
          slug: 'matched-game',
          developer: 'Arc System Works',
          developerGameCount: 241,
          genres: ['Fighting'],
          coverUrl: 'https://images.igdb.com/cover2.jpg',
          steamUrl: 'https://store.steampowered.com/app/555',
        },
      ],
      fetchedAt: '',
    };
    const originalFetch = global.fetch;
    // Storefront 補完ループ（steamRecommendations 等が未確定で needsCompletion=true になる）が
    // 実ネットワークに飛ばないよう、ok:false を返して早期 return させる
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(steamData, EMPTY_YOUTUBE, igdbData);
      const game = games.find((g) => g.title === 'Matched Game');
      expect(game).toBeDefined();
      expect(game!.developerGameCount).toBe(241);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // developer 名とのペアリングガード（コードレビュー指摘）
  //
  // マッチ時ブランチも enrichGameFromIgdb 同様 `game.developer = igdb.developer || game.developer`
  // を developerGameCount の転記より先に実行するため、igdb.developer が truthy な限り上書き後の
  // game.developer は必ず igdb.developer と一致する。「名前が食い違う」ケースは igdb.developer が
  // falsy（取得できなかった）のに developerGameCount だけが（本来ありえないが防御的に）
  // 付いてくるという形でのみ構築できる。
  it('マッチ時ブランチ: igdb.developer が取得できず developerGameCount だけがある場合、件数は採用されない', async () => {
    const steamData: SteamData = {
      topSellers: [{ appId: 556, name: 'Unverifiable Match Game' }],
      topPlayed: [],
      fetchedAt: '',
    };
    const igdbData: IGDBData = {
      games: [
        {
          id: 21,
          name: 'Unverifiable Match Game',
          slug: 'unverifiable-match-game',
          // developer が undefined のまま developerGameCount だけ来る、という本来ありえない
          // 組み合わせを防御的にテストする。
          developerGameCount: 241,
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover3.jpg',
          steamUrl: 'https://store.steampowered.com/app/556',
        },
      ],
      fetchedAt: '',
    };
    const originalFetch = global.fetch;
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(steamData, EMPTY_YOUTUBE, igdbData);
      const game = games.find((g) => g.title === 'Unverifiable Match Game');
      expect(game).toBeDefined();
      expect(game!.developer).toBeUndefined();
      expect(game!.developerGameCount).toBeUndefined();
      expect(isIndieGame(game!)).toMatchObject({ ok: false, reason: 'no-developer' });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateGames — IGDB 単独ゲームへの steamAppId 継承（§3.6, PR-I その2）
//
// steamUrl を持つ IGDB 単独ゲームが、新規エントリ生成時に steamAppId を持たずに
// 集約結果へ入っていた欠落を検証する。既に計算済みの igdbSteamAppId 変数を
// 新規エントリのオブジェクトリテラルに転記するだけの修正（新規API呼び出しは増えない）。
// ─────────────────────────────────────────────────────────────────────────────
describe('aggregateGames — IGDB 単独ゲームへの steamAppId 継承（§3.6, PR-I その2）', () => {
  const EMPTY_STEAM: SteamData = { topSellers: [], topPlayed: [], fetchedAt: '' };
  const EMPTY_YOUTUBE: YouTubeData = { trendingVideos: [], fetchedAt: '' };

  it('steamUrl を持つ IGDB 単独ゲームは steamAppId を持って集約結果に入る。steamUrl を持たない候補は steamAppId が undefined のまま（ポジティブコントロール）', async () => {
    const igdbData: IGDBData = {
      games: [
        {
          id: 100,
          name: 'Solo With Steam',
          slug: 'solo-with-steam',
          developer: 'Some Studio',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-a.jpg',
          steamUrl: 'https://store.steampowered.com/app/778899',
        },
        {
          id: 101,
          name: 'Solo Without Steam',
          slug: 'solo-without-steam',
          developer: 'Some Other Studio',
          genres: ['Action'],
          coverUrl: 'https://images.igdb.com/cover-b.jpg',
          // steamUrl なし
        },
      ],
      fetchedAt: '',
    };

    const originalFetch = global.fetch;
    // steamAppId が埋まった「Solo With Steam」は Storefront 補完ループ（needsCompletion）に
    // 入るため、実ネットワークに飛ばないよう ok:false で早期 return させる
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData);

      const withSteam = games.find((g) => g.title === 'Solo With Steam');
      expect(withSteam).toBeDefined();
      expect(withSteam!.steamAppId).toBe(778899);

      // ポジティブコントロール: steamUrl が無い候補は steamAppId が undefined のまま
      const withoutSteam = games.find((g) => g.title === 'Solo Without Steam');
      expect(withoutSteam).toBeDefined();
      expect(withoutSteam!.steamAppId).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareIndieCandidates / buildIndieCandidates — インディー枠の並び順（§3.6, PR-I その3）
//
// 旧スコア（youtubePopularity + (1000 - steamRank) + igdbRating*10）は §3.6 で明示的に
// 棄却され、Steam おすすめ数（steamRecommendations）の降順に置き換わる。
// 「持つ」の判定は !== undefined（0 は「持っている」扱い。|| 0 にしない）。
// ─────────────────────────────────────────────────────────────────────────────
describe('compareIndieCandidates — インディー枠の並び順（§3.6, PR-I その3）', () => {
  it('両方が steamRecommendations を持つ → 降順', () => {
    const a = makeGame({ title: 'A', steamRecommendations: 100 });
    const b = makeGame({ title: 'B', steamRecommendations: 500 });
    expect([a, b].sort(compareIndieCandidates).map((g) => g.title)).toEqual(['B', 'A']);
  });

  it('片方だけ steamRecommendations を持つ → 持つ方が先', () => {
    const withRec = makeGame({ title: 'HasRec', steamRecommendations: 10 });
    const noRec = makeGame({ title: 'NoRec' });
    expect([noRec, withRec].sort(compareIndieCandidates).map((g) => g.title)).toEqual([
      'HasRec',
      'NoRec',
    ]);
  });

  it('両方とも steamRecommendations を持たない → igdbRating の降順', () => {
    const low = makeGame({ title: 'Low', igdbRating: 60 });
    const high = makeGame({ title: 'High', igdbRating: 90 });
    expect([low, high].sort(compareIndieCandidates).map((g) => g.title)).toEqual(['High', 'Low']);
  });

  it('両方とも steamRecommendations も igdbRating も持たない候補は末尾に来る（配列順のまま放置しない）', () => {
    const withRating = makeGame({ title: 'WithRating', igdbRating: 70 });
    const noRating = makeGame({ title: 'NoRating' });
    expect([noRating, withRating].sort(compareIndieCandidates).map((g) => g.title)).toEqual([
      'WithRating',
      'NoRating',
    ]);
  });

  it('境界値: steamRecommendations = 0 の候補は「持たない候補」より先に来る（`|| 0` 実装だと落ちる）', () => {
    const zero = makeGame({ title: 'Zero', steamRecommendations: 0 });
    const none = makeGame({ title: 'None', igdbRating: 99 });
    expect([none, zero].sort(compareIndieCandidates).map((g) => g.title)).toEqual(['Zero', 'None']);
  });
});

describe('buildIndieCandidates — 旧スコアなら別順序になるフィクスチャで新しい順序を検証（§3.6, PR-I その3）', () => {
  it('youtubePopularity が極端に大きく steamRank も良いが steamRecommendations が小さい候補は、steamRecommendations が大きい候補より後ろになる', () => {
    const youtubeHeavy = makeGame({
      title: 'YouTube Heavy',
      developer: 'Indie Dev A',
      source: ['steam', 'youtube'],
      youtubePopularity: 10_000_000,
      steamRank: 1,
      steamRecommendations: 50,
      igdbRating: 60,
      releaseDate: daysAgoStr(10), // 90日窓フィルタ（本PR）に引っかからないよう窓内にする
    });
    const steamHeavy = makeGame({
      title: 'Steam Heavy',
      developer: 'Indie Dev B',
      source: ['steam'],
      youtubePopularity: 0,
      steamRank: 50, // isQualifiedGame 用（Steam 同時接続数経路の削除に伴い、Steam Charts 掲載を通過根拠にする）
      steamRecommendations: 900_000,
      igdbRating: 60,
      releaseDate: daysAgoStr(10), // 90日窓フィルタ（本PR）に引っかからないよう窓内にする
    });

    const result = buildIndieCandidates([youtubeHeavy, steamHeavy], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    // 旧スコア（youtubePopularity + (1000 - steamRank) + igdbRating*10）なら
    // youtubeHeavy が圧倒的優位（10,000,999+600）で先頭になっていたはず。
    // 新しい並び順（steamRecommendations 降順）では steamHeavy が先。
    expect(result.map((g) => g.title)).toEqual(['Steam Heavy', 'YouTube Heavy']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isWithinIndieReleaseWindow — インディー枠の発売日90日窓フィルタ（§3.4）
//
// docs/article-category-spec.md §3.4 が定めるインディー枠の母集団条件
// 「発売日: 過去90日以内」を実装。旧スコアが Steam Top Sellers 順に強く依存していたため
// これまでは実害が無かったが、PR-I で並び順が steamRecommendations 降順（§3.6）に
// 変わったことで古い人気作（例: Geometry Dash, 2013-08-12発売, おすすめ数584,079）が
// 上位に来るようになり、実データで窓外の作品が候補上位を占める事態が発生した
// （管理者ライブ実測、候補上位10件中5件が窓外）。
// ─────────────────────────────────────────────────────────────────────────────

// 境界値テストは実時刻に依存しないよう now を固定する。
// 2026-06-15T12:00:00Z（= JST 21:00）を基準日とする。日本時間(UTC+9)でも同一暦日に
// 収まる時刻を選ぶことで、setDate によるローカル日付計算がテスト実行環境の
// タイムゾーンに左右されないようにしている。
const FIXED_NOW = new Date('2026-06-15T12:00:00Z');

describe('isWithinIndieReleaseWindow — 発売日90日窓フィルタ（§3.4）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('境界値: ちょうど90日前の発売日は通す', () => {
    const game = makeGame({ releaseDate: '2026-03-17' }); // FIXED_NOW の90日前
    expect(isWithinIndieReleaseWindow(game, FIXED_NOW)).toBe(true);
  });

  it('境界値: 91日前の発売日は除外する', () => {
    const game = makeGame({ releaseDate: '2026-03-16' }); // FIXED_NOW の91日前
    expect(isWithinIndieReleaseWindow(game, FIXED_NOW)).toBe(false);
  });

  it('境界値: 89日前の発売日は通す', () => {
    const game = makeGame({ releaseDate: '2026-03-18' }); // FIXED_NOW の89日前
    expect(isWithinIndieReleaseWindow(game, FIXED_NOW)).toBe(true);
  });

  it('releaseDate が undefined の候補は除外する（窓内と確認できないため）', () => {
    const game = makeGame({ releaseDate: undefined });
    expect(isWithinIndieReleaseWindow(game, FIXED_NOW)).toBe(false);
  });

  it('未来日（未発売）の候補は除外する（§3.3 インディー枠は未発売タイトルを扱わない）', () => {
    const game = makeGame({ releaseDate: '2026-06-16' }); // FIXED_NOW の1日後
    expect(isWithinIndieReleaseWindow(game, FIXED_NOW)).toBe(false);
  });

  it('INDIE_RELEASE_WINDOW_DAYS=30 のとき、60日前の候補は除外され、20日前の候補は通る', () => {
    vi.stubEnv('INDIE_RELEASE_WINDOW_DAYS', '30');
    const tooOld = makeGame({ releaseDate: '2026-04-16' }); // FIXED_NOW の60日前
    const withinWindow = makeGame({ releaseDate: '2026-05-26' }); // FIXED_NOW の20日前
    expect(isWithinIndieReleaseWindow(tooOld, FIXED_NOW)).toBe(false);
    expect(isWithinIndieReleaseWindow(withinWindow, FIXED_NOW)).toBe(true);
  });

  it('INDIE_RELEASE_WINDOW_DAYS が不正値（"abc"）のとき既定の90日に戻る（`Number(x) || 90` の回帰防止）', () => {
    vi.stubEnv('INDIE_RELEASE_WINDOW_DAYS', 'abc');
    const within90 = makeGame({ releaseDate: '2026-03-18' }); // 89日前 → 既定90日なら通る
    const beyond90 = makeGame({ releaseDate: '2026-03-16' }); // 91日前 → 既定90日なら除外
    expect(isWithinIndieReleaseWindow(within90, FIXED_NOW)).toBe(true);
    expect(isWithinIndieReleaseWindow(beyond90, FIXED_NOW)).toBe(false);
  });
});

describe('buildIndieCandidates — 発売日90日窓フィルタの統合テスト（§3.4, 実データ回帰）', () => {
  it('窓外の古い高人気候補（Geometry Dash想定）は除外され、窓内の低人気候補（ポジティブコントロール）は残る', () => {
    const oldPopular = makeGame({
      title: 'Geometry Dash',
      normalizedTitle: 'geometry dash',
      releaseDate: '2013-08-12',
      steamRecommendations: 584079,
      steamRank: 5,
    });

    const withinWindow = makeGame({
      title: 'Recent Indie Game',
      normalizedTitle: 'recent indie game',
      releaseDate: daysAgoStr(30),
      steamRecommendations: 7182,
      steamRank: 50,
    });

    const result = buildIndieCandidates([oldPopular, withinWindow], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    // ポジティブコントロール: フィルタが働かなくなった場合（全件通す壊れ方）を検知するため、
    // 「除外されること」だけでなく「窓内の候補が残ること」も検証する。
    expect(result.map((g) => g.title)).toEqual(['Recent Indie Game']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isRemakeOrRemaster — リメイク/リマスター判定（修正2, §6.2）
// ─────────────────────────────────────────────────────────────────────────────
describe('isRemakeOrRemaster — リメイク/リマスター判定（修正2, §6.2）', () => {
  it('gameType=8（Remake）は true', () => {
    expect(isRemakeOrRemaster(makeGame({ gameType: 8 }))).toBe(true);
  });

  it('gameType=9（Remaster）は true', () => {
    expect(isRemakeOrRemaster(makeGame({ gameType: 9 }))).toBe(true);
  });

  it('境界値: gameType=0（Main Game）は false', () => {
    expect(isRemakeOrRemaster(makeGame({ gameType: 0 }))).toBe(false);
  });

  it('境界値: gameType 未設定（undefined）は false（判定材料が無いため除外しない）', () => {
    expect(isRemakeOrRemaster(makeGame({}))).toBe(false);
  });

  it('境界値: gameType=11（Port）は false', () => {
    expect(isRemakeOrRemaster(makeGame({ gameType: 11 }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isClassicRemakeAllowed — J-3-e ベースのリメイク許可判定（§5.5決着, Issue classic-slot-population）
// ─────────────────────────────────────────────────────────────────────────────
describe('isClassicRemakeAllowed — J-3-e ベースのリメイク許可判定（§5.5決着）', () => {
  it('gameType が 0（Main Game）なら classicRemakeEligible に関係なく true', () => {
    expect(isClassicRemakeAllowed(makeGame({ gameType: 0, classicRemakeEligible: undefined }))).toBe(true);
    expect(isClassicRemakeAllowed(makeGame({ gameType: 0, classicRemakeEligible: false }))).toBe(true);
  });

  it('gameType が未設定なら true（リメイクではないので無関係）', () => {
    expect(isClassicRemakeAllowed(makeGame({}))).toBe(true);
  });

  it('gameType=8（Remake）で classicRemakeEligible=true なら true、false なら false（同じテストで両方確認）', () => {
    expect(isClassicRemakeAllowed(makeGame({ gameType: 8, classicRemakeEligible: true }))).toBe(true);
    expect(isClassicRemakeAllowed(makeGame({ gameType: 8, classicRemakeEligible: false }))).toBe(false);
  });

  it('gameType=9（Remaster）で classicRemakeEligible=true なら true、false なら false（同じテストで両方確認）', () => {
    expect(isClassicRemakeAllowed(makeGame({ gameType: 9, classicRemakeEligible: true }))).toBe(true);
    expect(isClassicRemakeAllowed(makeGame({ gameType: 9, classicRemakeEligible: false }))).toBe(false);
  });

  it('境界値: gameType=8/9 で classicRemakeEligible が undefined（転記漏れ相当）なら false（安全側に倒す非対称）。ポジティブコントロールとして classicRemakeEligible=true の候補は true', () => {
    expect(isClassicRemakeAllowed(makeGame({ gameType: 8, classicRemakeEligible: undefined }))).toBe(false);
    expect(isClassicRemakeAllowed(makeGame({ gameType: 9, classicRemakeEligible: undefined }))).toBe(false);
    expect(isClassicRemakeAllowed(makeGame({ gameType: 8, classicRemakeEligible: true }))).toBe(true);
  });

  it('境界値: gameType=11（Port）は Remake/Remaster ではないため true', () => {
    expect(isClassicRemakeAllowed(makeGame({ gameType: 11, classicRemakeEligible: undefined }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isClassicPoolGameType — 名作枠 game_type ゲート（§5.4決着、code-review 指摘対応）
//
// buildClassicCandidates は数値条件（totalRating/totalRatingCount）しか §5.4 の母集団条件を
// 再現していなかった。isClassicRemakeAllowed は gameType が 8/9 のときだけ判定するため、
// Expansion(2)/Bundle(3)/Standalone Expansion(4)/Mod(5)/Expanded Game(10)/Port(11) が
// 素通りしてしまう欠陥があった（第2層エンリッチ enrichGameWithIGDB が mainGameOnly 無しで
// searchGameByName を呼ぶため、任意の gameType のエントリが totalRating/totalRatingCount 付きで
// GameData に転記されうる）。
// ─────────────────────────────────────────────────────────────────────────────
describe('isClassicPoolGameType — 名作枠 game_type ゲート（§5.4決着）', () => {
  it('gameType が 0/8/9 なら true（同じテストで3種類とも確認）', () => {
    expect(isClassicPoolGameType(makeGame({ gameType: 0 }))).toBe(true);
    expect(isClassicPoolGameType(makeGame({ gameType: 8 }))).toBe(true);
    expect(isClassicPoolGameType(makeGame({ gameType: 9 }))).toBe(true);
  });

  it('gameType が 0/8/9 以外（Expansion=2, Bundle=3, Standalone Expansion=4, Mod=5, Expanded Game=10, Port=11）なら false', () => {
    for (const gameType of [2, 3, 4, 5, 10, 11]) {
      expect(isClassicPoolGameType(makeGame({ gameType }))).toBe(false);
    }
  });

  it('境界値: gameType が undefined なら false（meetsClassicPoolThresholds と同じ「undefined は母集団に含めない」立場に揃える）', () => {
    expect(isClassicPoolGameType(makeGame({}))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildClassicCandidates — game_type ゲートの統合（§5.4決着、code-review 指摘対応の回帰テスト）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildClassicCandidates — game_type ゲート（DLC・拡張版・拡張ゲームの混入防止）', () => {
  it('The Witcher 3: Wild Hunt（gameType=0）は採用される。同じテストで GOTY Edition（gameType=3）と Blood and Wine（gameType=2）が除外されることを確認する', () => {
    // 実測値（管理者が本日ライブAPIで確認、PR #254 code-review指摘）。
    // ⚠️ GOTY Edition / Blood and Wine はどちらも totalRating/totalRatingCount が
    // 数値条件を余裕で満たす。gameType を見て初めて落とせる点がこのテストの肝。
    const witcher3 = makeGame({
      title: 'The Witcher 3: Wild Hunt',
      normalizedTitle: 'the witcher 3 wild hunt',
      gameType: 0,
      totalRating: 92.8,
      totalRatingCount: 5426,
      coverImage: 'https://example.com/witcher3.jpg',
      summary: 's',
    });
    const gotyEdition = makeGame({
      title: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
      normalizedTitle: 'the witcher 3 wild hunt game of the year edition',
      gameType: 3, // Bundle
      totalRating: 90,
      totalRatingCount: 569,
      coverImage: 'https://example.com/witcher3-goty.jpg',
      summary: 's',
    });
    const bloodAndWine = makeGame({
      title: 'The Witcher 3: Wild Hunt - Blood and Wine',
      normalizedTitle: 'the witcher 3 wild hunt blood and wine',
      gameType: 2, // Expansion
      totalRating: 91,
      totalRatingCount: 482,
      coverImage: 'https://example.com/witcher3-baw.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([witcher3, gotyEdition, bloodAndWine], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    const titles = result.map((g) => g.title);
    expect(titles).toContain('The Witcher 3: Wild Hunt');
    expect(titles).not.toContain('The Witcher 3: Wild Hunt - Game of the Year Edition');
    expect(titles).not.toContain('The Witcher 3: Wild Hunt - Blood and Wine');
  });

  it('gameType=10（Expanded Game。Final Fantasy VII の実測値 totalRating=87.8, totalRatingCount=1630）は除外される', () => {
    const ff7 = makeGame({
      title: 'Final Fantasy VII',
      normalizedTitle: 'final fantasy vii',
      gameType: 10,
      totalRating: 87.8,
      totalRatingCount: 1630,
      coverImage: 'https://example.com/ff7.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([ff7], { cooldown: new Set(), alreadySelected: [] });

    expect(result.map((g) => g.title)).not.toContain('Final Fantasy VII');
  });

  it('境界値: gameType が undefined で数値条件は満たす候補は除外される。ポジティブコントロールとして gameType=0 の候補は残る', () => {
    const undefinedType = makeGame({
      title: 'Undefined Type Game',
      normalizedTitle: 'undefined type game',
      // gameType 未設定
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/undef.jpg',
      summary: 's',
    });
    const mainGame = makeGame({
      title: 'Main Game Control',
      normalizedTitle: 'main game control',
      gameType: 0,
      totalRating: 90,
      totalRatingCount: 400,
      coverImage: 'https://example.com/main.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([undefinedType, mainGame], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    const titles = result.map((g) => g.title);
    expect(titles).not.toContain('Undefined Type Game');
    expect(titles).toContain('Main Game Control');
  });

  it('gameType=8/9 は classicRemakeEligible===true なら引き続き採用される（新ゲートが既存の J-3-e 判定と矛盾しないこと）', () => {
    const allowedRemake = makeGame({
      title: 'Allowed Remake',
      normalizedTitle: 'allowed remake',
      gameType: 8,
      classicRemakeEligible: true,
      totalRating: 90,
      totalRatingCount: 500,
      coverImage: 'https://example.com/remake.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([allowedRemake], { cooldown: new Set(), alreadySelected: [] });

    expect(result.map((g) => g.title)).toContain('Allowed Remake');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildClassicCandidates — J-3-e 統合テスト（§5.5決着の実測データに基づく, Issue classic-slot-population）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildClassicCandidates — J-3-e リメイク許可の統合（§5.5決着）', () => {
  // 母集団条件（totalRating>=85 & totalRatingCount>=200）を満たすフィクスチャ共通ベース
  const BASE = { totalRating: 90, totalRatingCount: 500, coverImage: 'https://example.com/x.jpg', summary: 's' };

  it('許可される実測例（Resident Evil 2 / Black Mesa / FF VII Remake）が残り、除外される実測例（TLOU Remastered / Dark Souls Remastered）は落ちる（同じテストで許可・除外の両方を確認）', () => {
    // classicRemakeEligible は fetch-igdb.ts の computeClassicRemakeEligible が実測データに基づき
    // 計算する値（このテストでは選定側の filter ロジックのみを検証するため、既に計算済みの値を
    // フィクスチャに直接与える）。
    const residentEvil2 = makeGame({
      ...BASE,
      title: 'Resident Evil 2',
      normalizedTitle: 'resident evil 2',
      gameType: 8,
      classicRemakeEligible: true, // 親(1998年版) total=69.4, n=593 で母集団外
    });
    const blackMesa = makeGame({
      ...BASE,
      title: 'Black Mesa',
      normalizedTitle: 'black mesa',
      gameType: 9,
      classicRemakeEligible: true, // 親(Half-Life) total=84.2, n=2896 で母集団外（あと1点）
    });
    const ff7Remake = makeGame({
      ...BASE,
      title: 'Final Fantasy VII Remake',
      normalizedTitle: 'final fantasy vii remake',
      gameType: 8,
      classicRemakeEligible: true, // 親(FF VII) game_type=10 で母集団外
    });
    const tlouRemastered = makeGame({
      ...BASE,
      title: 'The Last of Us Remastered',
      normalizedTitle: 'the last of us remastered',
      gameType: 9,
      classicRemakeEligible: false, // 親 total=92.2, n=3548 で母集団内
    });
    const darkSoulsRemastered = makeGame({
      ...BASE,
      title: 'Dark Souls: Remastered',
      normalizedTitle: 'dark souls remastered',
      gameType: 8,
      classicRemakeEligible: false, // 親 total=88.6, n=1706 で母集団内
    });

    const result = buildClassicCandidates(
      [residentEvil2, blackMesa, ff7Remake, tlouRemastered, darkSoulsRemastered],
      { cooldown: new Set(), alreadySelected: [] }
    );

    const titles = result.map((g) => g.title);
    expect(titles).toContain('Resident Evil 2');
    expect(titles).toContain('Black Mesa');
    expect(titles).toContain('Final Fantasy VII Remake');
    expect(titles).not.toContain('The Last of Us Remastered');
    expect(titles).not.toContain('Dark Souls: Remastered');
  });

  it('gameType=8/9で classicRemakeEligible が undefined（転記漏れ）の候補は除外される。ポジティブコントロールとして classicRemakeEligible=true の候補（gameType=0 も）は残る', () => {
    const missingEligibility = makeGame({
      ...BASE,
      title: 'Missing Eligibility Remake',
      normalizedTitle: 'missing eligibility remake',
      gameType: 8,
      // classicRemakeEligible 未設定（転記漏れ相当）
    });
    const eligibleRemake = makeGame({
      ...BASE,
      title: 'Eligible Remake',
      normalizedTitle: 'eligible remake',
      gameType: 8,
      classicRemakeEligible: true,
    });
    const mainGame = makeGame({
      ...BASE,
      title: 'Ordinary Main Game',
      normalizedTitle: 'ordinary main game',
      gameType: 0,
    });

    const result = buildClassicCandidates([missingEligibility, eligibleRemake, mainGame], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    const titles = result.map((g) => g.title);
    expect(titles).not.toContain('Missing Eligibility Remake');
    expect(titles).toContain('Eligible Remake');
    expect(titles).toContain('Ordinary Main Game');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichGameFromIgdb — keywords 空配列で既存値を潰さない（修正3）
// ─────────────────────────────────────────────────────────────────────────────
describe('enrichGameFromIgdb — keywords 空配列で既存値を潰さない（修正3）', () => {
  it('IGDB側が空配列を返したときに既存のkeywordsが保持される。非空配列なら上書きされる（同一テスト内で両方確認）', () => {
    const gameWithKeywords = makeGame({
      title: 'Elden Ring',
      normalizedTitle: 'elden ring',
      steamAppId: 1245620,
      platforms: ['PC'],
      genres: [],
      keywords: ['open-world', 'souls-like'],
    });
    const igdbEmptyKeywords = makeIgdbGame({
      name: 'Elden Ring',
      steamUrl: 'https://store.steampowered.com/app/1245620',
      keywords: [],
    });

    const applied = enrichGameFromIgdb(gameWithKeywords, igdbEmptyKeywords);

    expect(applied).toBe(true);
    expect(gameWithKeywords.keywords).toEqual(['open-world', 'souls-like']);

    // 非空配列なら上書きされる
    const gameWithKeywords2 = makeGame({
      title: 'Elden Ring',
      normalizedTitle: 'elden ring',
      steamAppId: 1245620,
      platforms: ['PC'],
      genres: [],
      keywords: ['open-world', 'souls-like'],
    });
    const igdbNonEmptyKeywords = makeIgdbGame({
      name: 'Elden Ring',
      steamUrl: 'https://store.steampowered.com/app/1245620',
      keywords: ['dark-fantasy'],
    });

    const applied2 = enrichGameFromIgdb(gameWithKeywords2, igdbNonEmptyKeywords);

    expect(applied2).toBe(true);
    expect(gameWithKeywords2.keywords).toEqual(['dark-fantasy']);
  });
});

describe('toPersistableSelectedGames — newReleasesReserves を直列化対象から除外する（PR #249 レビュー指摘1）', () => {
  it('newReleasesReserves は除外され、indieReserves と他フィールドはすべて保持される', () => {
    const newReleaseGame = makeGame({ title: 'Big Studio New Game', normalizedTitle: 'big studio new game' });
    const newReleaseReserveGame = makeGame({
      title: 'Reserve New Game (Amazon順位を漏らしうる)',
      normalizedTitle: 'reserve new game',
    });
    const indieGame = makeGame({ title: 'Cozy Indie Game', normalizedTitle: 'cozy indie game' });
    const indieReserveGame = makeGame({ title: 'Indie Reserve Game', normalizedTitle: 'indie reserve game' });
    const classicGame = makeGame({ title: 'Classic Masterpiece', normalizedTitle: 'classic masterpiece' });

    const selected = makeSelected({
      newReleases: [newReleaseGame],
      newReleasesReserves: [newReleaseReserveGame],
      indies: [indieGame],
      indieReserves: [indieReserveGame],
      classic: classicGame,
    });

    const persistable = toPersistableSelectedGames(selected);

    // newReleasesReserves は直列化対象から除外される（Amazon順位の逆算経路を断つ）
    expect('newReleasesReserves' in persistable).toBe(false);

    // ポジティブコントロール: indieReserves および他のフィールドはすべて保持される
    expect(persistable.indieReserves).toEqual([indieReserveGame]);
    expect(persistable.newReleases).toEqual([newReleaseGame]);
    expect(persistable.indies).toEqual([indieGame]);
    expect(persistable.classic).toEqual(classicGame);
  });
});
