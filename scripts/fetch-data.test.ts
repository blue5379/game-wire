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
  isWithinIndieReleaseWindow,
  aggregateGames,
} from './fetch-data.js';
import { isFanGame } from './game-filter.js';
import { isIndieGame } from './indie-classifier.js';
import type { SelectedGames, GameData, IGDBGame, SteamData, YouTubeData, IGDBData, MetacriticData } from './types.js';

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
    const igdbGame = makeIgdbGame({
      name: 'Zero Count Game',
      steamUrl: 'https://store.steampowered.com/app/2',
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

  it('3軸スコア降順に並ぶ（旧ソート＝metascore/igdbRating降順とは異なる順序になることを検証）', () => {
    // 旧ソートキー: metascore || igdbRating || 0
    //   SteamHitNoName: metascore/igdbRating とも無し → 0
    //   CriticHigh: metascore=84 → 84
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
      metascore: 84,
      aggregatedRating: 84,
      aggregatedRatingCount: 4,
      steamPlayers: 100, // hasExistenceEvidence 用（steamRank なしでも存在根拠を持たせる）
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
// buildClassicCandidates — 名作枠の候補構築（§5 / §6.1 / §6.3）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildClassicCandidates', () => {
  it('ファンゲームが落ち、同じフィクスチャ内の通常の名作候補は残る（ポジティブコントロール・実測値ベース）', () => {
    // 実測値: Pokémon Infinite Fusion は他の全条件（スコア・人気・cover/summary）を通過して
    // 実際に選ばれていた（管理者が本日ライブ実測）。isFanGame 追加が無いと落ちないことの回帰防止。
    const infiniteFusion = makeGame({
      title: 'Pokémon Infinite Fusion',
      normalizedTitle: 'pokemon infinite fusion',
      igdbRating: 98.4,
      igdbRatingCount: 23,
      keywords: ['unofficial', 'turn-based-combat', 'fangame', 'turn-based-rpg', 'fanmade'],
      coverImage: 'https://example.com/cover.jpg',
      summary: 'A Pokémon fan game.',
    });
    const normalClassic = makeGame({
      title: 'The Witcher 3',
      normalizedTitle: 'the witcher 3',
      igdbRating: 92,
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

  it('クールダウン中のタイトルは除外される', () => {
    const game = makeGame({
      title: 'Cooldown Classic',
      normalizedTitle: 'cooldown classic',
      igdbRating: 90,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([game], {
      cooldown: new Set(['cooldown classic']),
      alreadySelected: [],
    });

    expect(result).toHaveLength(0);
  });

  it('スコア条件を満たさない（igdbRating<80 かつ metascore無し）候補は除外される', () => {
    const game = makeGame({
      title: 'Low Score Game',
      normalizedTitle: 'low score game',
      igdbRating: 70,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([game], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result).toHaveLength(0);
  });

  it('coverImage または summary が欠落した候補は除外される', () => {
    const noCover = makeGame({
      title: 'No Cover',
      normalizedTitle: 'no cover',
      igdbRating: 90,
      summary: 'summary',
      // coverImage なし
    });
    const noSummary = makeGame({
      title: 'No Summary',
      normalizedTitle: 'no summary',
      igdbRating: 90,
      coverImage: 'https://example.com/cover.jpg',
      // summary なし
    });

    const result = buildClassicCandidates([noCover, noSummary], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result).toHaveLength(0);
  });

  it('号内重複除外が newReleases / indies / featured の3方向すべてに効く', () => {
    const inNewReleases = makeGame({
      title: 'Already New Release',
      normalizedTitle: 'already new release',
      igdbRating: 90,
      coverImage: 'https://example.com/1.jpg',
      summary: 's',
    });
    const inIndies = makeGame({
      title: 'Already Indie',
      normalizedTitle: 'already indie',
      igdbRating: 90,
      coverImage: 'https://example.com/2.jpg',
      summary: 's',
    });
    const isFeatured = makeGame({
      title: 'Already Featured',
      normalizedTitle: 'already featured',
      igdbRating: 90,
      coverImage: 'https://example.com/3.jpg',
      summary: 's',
    });
    const untouchedCandidate = makeGame({
      title: 'Untouched Classic',
      normalizedTitle: 'untouched classic',
      igdbRating: 90,
      coverImage: 'https://example.com/4.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates(
      [inNewReleases, inIndies, isFeatured, untouchedCandidate],
      {
        cooldown: new Set(),
        alreadySelected: [
          makeGame({ title: 'Already New Release', normalizedTitle: 'already new release' }),
          makeGame({ title: 'Already Indie', normalizedTitle: 'already indie' }),
          makeGame({ title: 'Already Featured', normalizedTitle: 'already featured' }),
        ],
      }
    );

    expect(result.map((g) => g.title)).toEqual(['Untouched Classic']);
  });

  it('featured が null のときに候補が誤って落ちない', () => {
    const game = makeGame({
      title: 'Should Survive',
      normalizedTitle: 'should survive',
      igdbRating: 90,
      coverImage: 'https://example.com/cover.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([game], {
      cooldown: new Set(),
      alreadySelected: [null, undefined],
    });

    expect(result.map((g) => g.title)).toContain('Should Survive');
  });

  it('スコア降順に並ぶ', () => {
    const lower = makeGame({
      title: 'Lower Score',
      normalizedTitle: 'lower score',
      igdbRating: 86,
      coverImage: 'https://example.com/1.jpg',
      summary: 's',
    });
    const higher = makeGame({
      title: 'Higher Score',
      normalizedTitle: 'higher score',
      igdbRating: 95,
      coverImage: 'https://example.com/2.jpg',
      summary: 's',
    });

    const result = buildClassicCandidates([lower, higher], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).toEqual(['Higher Score', 'Lower Score']);
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
// deduplicateGames — developerGameCount のマージ（§3.4 開発本数による規模判定, Issue #231・PR-I その1）
// PR-B で deduplicateGames が新フィールドをマージし忘れて差し戻された教訓を踏まえ、
// マージ後の値が isIndieGame の判定に実際に効くことまで検証する。
// ─────────────────────────────────────────────────────────────────────────────
describe('deduplicateGames — developerGameCount のマージ（§3.4, Issue #231）', () => {
  it('primary に developerGameCount が無く dup にある場合、マージ後 primary が isIndieGame で large-studio になる（値が生き残っている証拠）', () => {
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
      developerGameCount: 241,
    });

    const result = deduplicateGames([primary, dup]);

    expect(result).toHaveLength(1);
    expect(result[0].developerGameCount).toBe(241);
    expect(isIndieGame(result[0])).toMatchObject({ ok: false, reason: 'large-studio' });
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
// aggregateGames — developerGameCount の転記（§3.4 開発本数による規模判定, Issue #231・PR-I その1）
//
// マッチ時ブランチ・新規エントリ生成の両方で igdb.developerGameCount が GameData に
// 転記されることを検証する。Storefront API / Metacritic 補完のネットワーク呼び出しに
// 触れないよう、フィクスチャは needsCompletion が false になるよう組み立てるか、
// global.fetch を ok:false でモックして早期 return させる。
// ─────────────────────────────────────────────────────────────────────────────
describe('aggregateGames — developerGameCount の転記（§3.4, Issue #231）', () => {
  const EMPTY_STEAM: SteamData = { topSellers: [], topPlayed: [], fetchedAt: '' };
  const EMPTY_YOUTUBE: YouTubeData = { trendingVideos: [], fetchedAt: '' };
  const EMPTY_METACRITIC: MetacriticData = { scores: [], fetchedAt: '' };

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

    const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData, EMPTY_METACRITIC);

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
    // metascore を確定させて Metacritic 補完ループのネットワーク呼び出しを避ける
    const metacriticData: MetacriticData = {
      scores: [{ title: 'Matched Game', platform: 'PC', metascore: null, userScore: null }],
      fetchedAt: '',
    };

    const originalFetch = global.fetch;
    // Storefront 補完ループ（steamRecommendations 等が未確定で needsCompletion=true になる）が
    // 実ネットワークに飛ばないよう、ok:false を返して早期 return させる
    global.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const games = await aggregateGames(steamData, EMPTY_YOUTUBE, igdbData, metacriticData);
      const game = games.find((g) => g.title === 'Matched Game');
      expect(game).toBeDefined();
      expect(game!.developerGameCount).toBe(241);
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
  const EMPTY_METACRITIC: MetacriticData = { scores: [], fetchedAt: '' };

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
      const games = await aggregateGames(EMPTY_STEAM, EMPTY_YOUTUBE, igdbData, EMPTY_METACRITIC);

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
      steamPlayers: 5000,
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
// buildClassicCandidates — リメイク/リマスター除外（修正2）
// ─────────────────────────────────────────────────────────────────────────────
describe('buildClassicCandidates — リメイク/リマスター除外（修正2）', () => {
  it('gameType=8のリメイクは落ち、gameType=0の通常候補とgameType未設定の候補は残る（ポジティブコントロール・実測値ベース）', () => {
    // 実測値: Assassin's Creed Black Flag Resynced は gameType=8 だが
    // buildClassicCandidates の他の全条件（スコア・cover/summary）を通過する（管理者が本日実測）。
    const acbfResynced = makeGame({
      title: "Assassin's Creed Black Flag Resynced",
      normalizedTitle: "assassin's creed black flag resynced",
      gameType: 8,
      igdbRating: 85.24,
      igdbRatingCount: 25,
      coverImage: 'https://example.com/acbf.jpg',
      summary: 'A resynced version of Assassin\'s Creed Black Flag.',
    });
    const normalClassic = makeGame({
      title: 'Normal Classic',
      normalizedTitle: 'normal classic',
      gameType: 0,
      igdbRating: 90,
      coverImage: 'https://example.com/normal.jpg',
      summary: 'A normal classic game.',
    });
    const unknownTypeClassic = makeGame({
      title: 'Unknown Type Classic',
      normalizedTitle: 'unknown type classic',
      // gameType 未設定（Steam 由来など）
      igdbRating: 88,
      coverImage: 'https://example.com/unknown.jpg',
      summary: 'summary',
    });

    const result = buildClassicCandidates([acbfResynced, normalClassic, unknownTypeClassic], {
      cooldown: new Set(),
      alreadySelected: [],
    });

    expect(result.map((g) => g.title)).not.toContain("Assassin's Creed Black Flag Resynced");
    expect(result.map((g) => g.title)).toContain('Normal Classic');
    expect(result.map((g) => g.title)).toContain('Unknown Type Classic');
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
