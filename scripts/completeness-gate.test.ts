/**
 * Completeness Gate 単体テスト
 *
 * 設計書「検証方針」に基づく各ルールの検証。
 * headOk（R3）は vi.mock でモック。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData, SelectedGames, StoreLink } from './types.js';
import type { ResolverTrace } from './completeness-gate.js';

// url-health をモック（R3 の HTTP チェック）
vi.mock('./url-health.js', () => ({
  headOk: vi.fn(),
  getImageOrientation: vi.fn(),
}));

import { headOk } from './url-health.js';

import {
  checkR1,
  checkR2,
  checkR2b,
  checkR3,
  checkR4,
  checkGame,
  runCompletenessGate,
  getGateMode,
  hasConsolePlatform,
  traceHasConfidentResult,
} from './completeness-gate.js';

const mockHeadOk = vi.mocked(headOk);

// ─────────────────────────────────────────────────────────────────────────────
// テストヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    title: 'Test Game',
    normalizedTitle: 'test game',
    genres: [],
    platforms: ['PC'],
    source: ['steam'],
    ...overrides,
  };
}

function makeStoreLink(platform: StoreLink['platform'], confidence: StoreLink['confidence'] = 'high'): StoreLink {
  return {
    platform,
    url: `https://example.com/${platform}`,
    resolvedBy: 'storesearch',
    confidence,
  };
}

function makeSelectedGames(overrides: Partial<SelectedGames> = {}): SelectedGames {
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

function makeTrace(
  gameTitle: string,
  platform: string,
  attempts: { method: string; ok: boolean; reason?: string }[]
): ResolverTrace {
  return {
    [gameTitle]: {
      [platform]: { attempts },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHeadOk.mockResolvedValue(true);
  delete process.env.COMPLETENESS_GATE;
  delete process.env.DEV_MODE;
});

// ─────────────────────────────────────────────────────────────────────────────
// getGateMode
// ─────────────────────────────────────────────────────────────────────────────

describe('getGateMode', () => {
  it('COMPLETENESS_GATE=warn → "warn"', () => {
    process.env.COMPLETENESS_GATE = 'warn';
    expect(getGateMode()).toBe('warn');
  });

  it('COMPLETENESS_GATE=replace → "replace"', () => {
    process.env.COMPLETENESS_GATE = 'replace';
    expect(getGateMode()).toBe('replace');
  });

  it('COMPLETENESS_GATE=fail → "fail"', () => {
    process.env.COMPLETENESS_GATE = 'fail';
    expect(getGateMode()).toBe('fail');
  });

  it('DEV_MODE=true かつ COMPLETENESS_GATE 未設定 → "warn"', () => {
    process.env.DEV_MODE = 'true';
    expect(getGateMode()).toBe('warn');
  });

  it('DEV_MODE 未設定かつ COMPLETENESS_GATE 未設定 → "replace"', () => {
    expect(getGateMode()).toBe('replace');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasConsolePlatform
// ─────────────────────────────────────────────────────────────────────────────

describe('hasConsolePlatform', () => {
  it('Nintendo Switch → true', () => {
    expect(hasConsolePlatform(['Nintendo Switch'])).toBe(true);
  });

  it('PlayStation 5 → true', () => {
    expect(hasConsolePlatform(['PlayStation 5'])).toBe(true);
  });

  it('Xbox Series X → true', () => {
    expect(hasConsolePlatform(['Xbox Series X'])).toBe(true);
  });

  it('PC のみ → false', () => {
    expect(hasConsolePlatform(['PC'])).toBe(false);
  });

  it('platforms が未定義 → false', () => {
    expect(hasConsolePlatform(undefined)).toBe(false);
  });

  it('platforms が空配列 → false', () => {
    expect(hasConsolePlatform([])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// traceHasConfidentResult
// ─────────────────────────────────────────────────────────────────────────────

describe('traceHasConfidentResult', () => {
  it('ok=true の attempt がある → true（medium）', () => {
    const trace = makeTrace('Game A', 'steam', [
      { method: 'storesearch', ok: true },
    ]);
    expect(traceHasConfidentResult(trace, 'Game A', 'steam', 'medium')).toBe(true);
  });

  it('ok=true の attempt が known-appid → high でも true', () => {
    const trace = makeTrace('Game A', 'steam', [
      { method: 'known-appid', ok: true },
    ]);
    expect(traceHasConfidentResult(trace, 'Game A', 'steam', 'high')).toBe(true);
  });

  it('ok=false のみ → false', () => {
    const trace = makeTrace('Game A', 'steam', [
      { method: 'storesearch', ok: false, reason: 'no match' },
    ]);
    expect(traceHasConfidentResult(trace, 'Game A', 'steam', 'medium')).toBe(false);
  });

  it('trace が undefined → false', () => {
    expect(traceHasConfidentResult(undefined, 'Game A', 'steam', 'medium')).toBe(false);
  });

  it('該当ゲームが trace にない → false', () => {
    const trace = makeTrace('Other Game', 'steam', [{ method: 'storesearch', ok: true }]);
    expect(traceHasConfidentResult(trace, 'Game A', 'steam', 'medium')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R1: ストアリンク最低1件
// ─────────────────────────────────────────────────────────────────────────────

describe('R1: ストアリンク最低1件', () => {
  it('stores に1件あれば違反なし', () => {
    const game = makeGame({ sourceUrls: { stores: [makeStoreLink('steam')] } });
    expect(checkR1(game)).toBeNull();
  });

  it('stores は空でも official があれば違反なし', () => {
    const game = makeGame({ sourceUrls: { official: 'https://example.com', stores: [] } });
    expect(checkR1(game)).toBeNull();
  });

  it('stores は空でも steam（旧フィールド）があれば違反なし', () => {
    const game = makeGame({ sourceUrls: { steam: 'https://store.steampowered.com/app/12345/' } });
    expect(checkR1(game)).toBeNull();
  });

  it('stores が空かつ official も steam も無い → R1 違反', () => {
    const game = makeGame({ sourceUrls: { stores: [] } });
    const v = checkR1(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R1');
  });

  it('sourceUrls 未定義 → R1 違反', () => {
    const game = makeGame({ sourceUrls: undefined });
    const v = checkR1(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R2: Steam 実在取りこぼし検知
// ─────────────────────────────────────────────────────────────────────────────

describe('R2: Steam 実在取りこぼし検知', () => {
  it('stores に Steam がある → 違反なし', () => {
    const game = makeGame({ sourceUrls: { stores: [makeStoreLink('steam')] } });
    const trace = makeTrace('Test Game', 'steam', [{ method: 'storesearch', ok: true }]);
    expect(checkR2(game, trace)).toBeNull();
  });

  it('stores に Steam なし かつ trace が ok=true → R2 違反', () => {
    const game = makeGame({
      title: 'S&box',
      sourceUrls: { stores: [] },
    });
    const trace = makeTrace('S&box', 'steam', [{ method: 'storesearch', ok: true }]);
    const v = checkR2(game, trace);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R2');
    expect(v?.gameTitle).toBe('S&box');
  });

  it('stores に Steam なし かつ trace も全失敗 → 違反なし（Resolver が取れていない）', () => {
    const game = makeGame({ sourceUrls: { stores: [] } });
    const trace = makeTrace('Test Game', 'steam', [
      { method: 'storesearch', ok: false, reason: 'no match' },
    ]);
    expect(checkR2(game, trace)).toBeNull();
  });

  it('trace が undefined → 違反なし', () => {
    const game = makeGame({ sourceUrls: { stores: [] } });
    expect(checkR2(game, undefined)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R2b: 他プラットフォーム取りこぼし検知
// ─────────────────────────────────────────────────────────────────────────────

describe('R2b: 他プラットフォーム取りこぼし検知', () => {
  it('PS5 ゲームで PS URL が Resolver で解決されたのに stores なし → R2b 違反', () => {
    const game = makeGame({
      platforms: ['PlayStation 5'],
      sourceUrls: { stores: [] },
    });
    const trace = makeTrace('Test Game', 'playstation', [{ method: 'igdb-website', ok: true }]);
    const violations = checkR2b(game, trace);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('R2b');
  });

  it('stores に PS が既にある → 違反なし', () => {
    const game = makeGame({
      platforms: ['PlayStation 5'],
      sourceUrls: { stores: [makeStoreLink('playstation')] },
    });
    const trace = makeTrace('Test Game', 'playstation', [{ method: 'igdb-website', ok: true }]);
    expect(checkR2b(game, trace)).toHaveLength(0);
  });

  it('PC のみのゲームはコンソールチェック対象外 → 違反なし', () => {
    const game = makeGame({
      platforms: ['PC'],
      sourceUrls: { stores: [] },
    });
    const trace = makeTrace('Test Game', 'playstation', [{ method: 'igdb-website', ok: true }]);
    expect(checkR2b(game, trace)).toHaveLength(0);
  });

  it('Nintendo Switch ゲームで Nintendo URL が高確信度解決済み → R2b 違反', () => {
    const game = makeGame({
      title: 'Splatoon 3',
      platforms: ['Nintendo Switch'],
      sourceUrls: { stores: [] },
    });
    const trace = makeTrace('Splatoon 3', 'nintendo', [{ method: 'igdb-website', ok: true }]);
    const violations = checkR2b(game, trace);
    expect(violations.some((v) => v.ruleId === 'R2b')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R3: 公式 URL 到達性
// ─────────────────────────────────────────────────────────────────────────────

describe('R3: 公式 URL 到達性', () => {
  it('official が HTTP 200 → 違反なし', async () => {
    mockHeadOk.mockResolvedValue(true);
    const game = makeGame({ sourceUrls: { official: 'https://example.com' } });
    expect(await checkR3(game)).toBeNull();
  });

  it('official が HTTP 404 → R3 違反', async () => {
    mockHeadOk.mockResolvedValue(false);
    const game = makeGame({ sourceUrls: { official: 'https://dead-link.example.com' } });
    const v = await checkR3(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R3');
    expect(v?.detail).toContain('dead-link.example.com');
  });

  it('official が未定義 → チェックなし（違反なし）', async () => {
    const game = makeGame({ sourceUrls: {} });
    expect(await checkR3(game)).toBeNull();
    expect(mockHeadOk).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4: カバー画像ホスト許可リスト
// ─────────────────────────────────────────────────────────────────────────────

describe('R4: カバー画像ホスト許可リスト', () => {
  it('images.igdb.com → 違反なし', () => {
    const game = makeGame({ coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg' });
    expect(checkR4(game)).toBeNull();
  });

  it('cdn.cloudflare.steamstatic.com → 違反なし', () => {
    const game = makeGame({ coverImage: 'https://cdn.cloudflare.steamstatic.com/steam/apps/12345/header.jpg' });
    expect(checkR4(game)).toBeNull();
  });

  it('許可リスト外のホスト → R4 違反', () => {
    const game = makeGame({ coverImage: 'https://malicious-cdn.example.com/image.jpg' });
    const v = checkR4(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R4');
    expect(v?.detail).toContain('malicious-cdn.example.com');
  });

  it('coverImage が未定義 → チェックなし（違反なし）', () => {
    const game = makeGame({ coverImage: undefined });
    expect(checkR4(game)).toBeNull();
  });

  it('不正な URL 文字列 → R4 違反', () => {
    const game = makeGame({ coverImage: 'not-a-url' });
    const v = checkR4(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkGame: 複数ルールの複合
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGame: 複数ルールの複合', () => {
  it('R1 + R4 の両方が違反するとき2件の violations を返す', async () => {
    mockHeadOk.mockResolvedValue(true);
    const game = makeGame({
      // R1: stores も official も無し
      sourceUrls: { stores: [] },
      // R4: 許可リスト外
      coverImage: 'https://bad-host.example.com/img.jpg',
    });
    const violations = await checkGame(game, undefined);
    expect(violations.some((v) => v.ruleId === 'R1')).toBe(true);
    expect(violations.some((v) => v.ruleId === 'R4')).toBe(true);
  });

  it('全ルール通過で violations が空', async () => {
    mockHeadOk.mockResolvedValue(true);
    const game = makeGame({
      sourceUrls: {
        official: 'https://example.com',
        stores: [makeStoreLink('steam')],
      },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    });
    const violations = await checkGame(game, undefined);
    expect(violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: mode=warn
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: mode=warn', () => {
  it('違反があっても selectedGames を変更しない', async () => {
    mockHeadOk.mockResolvedValue(true);
    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie game',
      sourceUrls: { stores: [] },
    });
    const selected = makeSelectedGames({ newReleases: [violatingGame] });
    const report = await runCompletenessGate(selected, undefined, [], 'warn');

    expect(report.mode).toBe('warn');
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.replacedGames).toHaveLength(0);
    // warn モードでは selectedGames は変更されない
    expect(selected.newReleases).toHaveLength(1);
    expect(selected.newReleases[0].title).toBe('Zombie Game');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: mode=replace
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: mode=replace', () => {
  it('R1 違反の newReleases ゲームが reserves の健全なゲームに差し替えられる', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie game',
      sourceUrls: { stores: [] }, // R1 違反
    });
    const reserveGame = makeGame({
      title: 'Healthy Reserve',
      normalizedTitle: 'healthy reserve',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/xyz.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [violatingGame] });
    const report = await runCompletenessGate(selected, undefined, [reserveGame], 'replace');

    expect(report.violations.some((v) => v.gameTitle === 'Zombie Game')).toBe(true);
    expect(report.replacedGames).toContain('Healthy Reserve');
    expect(selected.newReleases.some((g) => g.title === 'Healthy Reserve')).toBe(true);
    expect(selected.newReleases.some((g) => g.title === 'Zombie Game')).toBe(false);
  });

  it('補充候補が1件もない場合でも replacedGames は空で警告のみ', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie game',
      sourceUrls: { stores: [] },
    });
    const selected = makeSelectedGames({ newReleases: [violatingGame] });
    const report = await runCompletenessGate(selected, undefined, [], 'replace');

    expect(report.replacedGames).toHaveLength(0);
    // 差し替えできなかった場合、配列は空になる
    expect(selected.newReleases).toHaveLength(0);
  });

  it('補充候補も R1 違反なら差し替えに使われない', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie game',
      sourceUrls: { stores: [] },
    });
    const alsoViolatingReserve = makeGame({
      title: 'Also Zombie',
      normalizedTitle: 'also zombie',
      sourceUrls: { stores: [] },
    });

    const selected = makeSelectedGames({ newReleases: [violatingGame] });
    const report = await runCompletenessGate(selected, undefined, [alsoViolatingReserve], 'replace');

    expect(report.replacedGames).toHaveLength(0);
    expect(selected.newReleases).toHaveLength(0);
  });

  it('健全なゲームは差し替え対象にならない', async () => {
    mockHeadOk.mockResolvedValue(true);

    const healthyGame = makeGame({
      title: 'Healthy Game',
      normalizedTitle: 'healthy game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [healthyGame] });
    const report = await runCompletenessGate(selected, undefined, [], 'replace');

    expect(report.violations).toHaveLength(0);
    expect(report.replacedGames).toHaveLength(0);
    expect(selected.newReleases[0].title).toBe('Healthy Game');
  });

  it('featured の違反は violations に記録されるが差し替えはしない', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingFeatured = makeGame({
      title: 'Featured Zombie',
      normalizedTitle: 'featured zombie',
      sourceUrls: { stores: [] },
    });

    const selected = makeSelectedGames({ featured: violatingFeatured });
    const report = await runCompletenessGate(selected, undefined, [], 'replace');

    expect(report.violations.some((v) => v.gameTitle === 'Featured Zombie')).toBe(true);
    // featured は差し替えされない
    expect(selected.featured?.title).toBe('Featured Zombie');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolver trace と R2 の結合テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('R2: Resolver trace との結合', () => {
  it('S&box: Steam が解決済みだが stores に乗っていない → R2 違反が検知される', async () => {
    mockHeadOk.mockResolvedValue(true);

    const sbox = makeGame({
      title: 'S&box',
      normalizedTitle: 's-and-box',
      sourceUrls: { stores: [] }, // stores に Steam が入っていない
    });

    const trace: ResolverTrace = {
      'S&box': {
        steam: {
          attempts: [
            { method: 'storesearch', ok: true },
          ],
        },
      },
    };

    const violations = await checkGame(sbox, trace);
    expect(violations.some((v) => v.ruleId === 'R2')).toBe(true);
    expect(violations.find((v) => v.ruleId === 'R2')?.gameTitle).toBe('S&box');
  });
});
