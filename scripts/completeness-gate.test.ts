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
  checkR0,
  checkR1,
  checkR2,
  checkR2b,
  checkR3,
  checkR4,
  checkR5,
  checkGame,
  runCompletenessGate,
  getGateMode,
  hasConsolePlatform,
  traceHasConfidentResult,
  RULE_REPLACEABLE,
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

/**
 * R5 用の Steam appdetails fetch モック。
 * appId → 実体（name / release_date）のマップを渡すと、その形の appdetails レスポンスを返す。
 * マップに無い appId は success:false を返す（fail-open 経路の検証用）。
 * failNetwork=true のときは fetch 自体を reject させる。
 */
function makeSteamFetch(
  entities: Record<number, { name: string; date?: string; coming_soon?: boolean }>,
  opts: { failNetwork?: boolean; notOk?: boolean } = {}
): typeof fetch {
  return (async (input: string | URL | Request) => {
    if (opts.failNetwork) throw new Error('network down');
    const url = String(input);
    const m = url.match(/appids=(\d+)/);
    const appId = m ? parseInt(m[1], 10) : NaN;
    const entity = entities[appId];
    const body = entity
      ? {
          [String(appId)]: {
            success: true,
            data: {
              name: entity.name,
              release_date: { date: entity.date, coming_soon: entity.coming_soon ?? false },
            },
          },
        }
      : { [String(appId)]: { success: false } };
    return {
      ok: !opts.notOk,
      status: opts.notOk ? 500 : 200,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
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

  it('DEV_MODE 未設定かつ COMPLETENESS_GATE 未設定 → "fail"（PR-6 で本番デフォルト昇格）', () => {
    expect(getGateMode()).toBe('fail');
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
// R0: プラットフォームデータ欠損チェック
// ─────────────────────────────────────────────────────────────────────────────

describe('R0: プラットフォームデータ欠損チェック', () => {
  it('platforms が空配列 → R0 違反', () => {
    const game = makeGame({ platforms: [] });
    const v = checkR0(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R0');
  });

  it('platforms が undefined → R0 違反', () => {
    const game = makeGame({ platforms: undefined as unknown as string[] });
    const v = checkR0(game);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R0');
  });

  it('platforms に値がある → 違反なし', () => {
    const game = makeGame({ platforms: ['PC'] });
    expect(checkR0(game)).toBeNull();
  });

  it('R0 違反は hasMutableViolations に影響しない（warn-only）', async () => {
    mockHeadOk.mockResolvedValue(true);
    const game = makeGame({
      title: 'Platformless Game',
      platforms: [],
      sourceUrls: { stores: [makeStoreLink('steam')] },
    });
    const selected = makeSelectedGames({ newReleases: [game] });
    const report = await runCompletenessGate(selected, undefined, [], 'fail');
    expect(report.violations.some((v) => v.ruleId === 'R0')).toBe(true);
    expect(report.hasMutableViolations).toBe(false);
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

  it('PS 専売ゲームで Nintendo trace が ok=true でも R2b 違反は出ない（プラットフォーム不一致）', () => {
    // PS 専売なのに Resolver が Nintendo URL を誤マッチで ok=true にした場合の偽違反を防ぐ
    const game = makeGame({
      title: 'God of War',
      platforms: ['PlayStation 5'],
      sourceUrls: { stores: [] },
    });
    // Nintendo trace に ok=true があっても PS 専売ゲームには Nintendo チェックを適用しない
    const trace: ResolverTrace = {
      'God of War': {
        nintendo: { attempts: [{ method: 'igdb-website', ok: true }] },
        xbox:      { attempts: [{ method: 'igdb-website', ok: true }] },
      },
    };
    const violations = checkR2b(game, trace);
    expect(violations.filter((v) => v.detail.includes('Nintendo'))).toHaveLength(0);
    expect(violations.filter((v) => v.detail.includes('Xbox'))).toHaveLength(0);
  });

  it('platforms に "PS4" のみ（"playstation" を含まない）でも R2b 対象になる', () => {
    const game = makeGame({
      title: 'Some PS4 Game',
      platforms: ['PS4'],
      sourceUrls: { stores: [] },
    });
    const trace = makeTrace('Some PS4 Game', 'playstation', [{ method: 'igdb-website', ok: true }]);
    const violations = checkR2b(game, trace);
    expect(violations.some((v) => v.detail.includes('PlayStation'))).toBe(true);
  });

  it('PS+Switch マルチ対応ゲームで両方の trace が ok=true → Nintendo と PS 両方の R2b 違反', () => {
    const game = makeGame({
      title: 'Hollow Knight',
      platforms: ['Nintendo Switch', 'PlayStation 4'],
      sourceUrls: { stores: [] },
    });
    const trace: ResolverTrace = {
      'Hollow Knight': {
        nintendo:    { attempts: [{ method: 'igdb-website', ok: true }] },
        playstation: { attempts: [{ method: 'igdb-website', ok: true }] },
      },
    };
    const violations = checkR2b(game, trace);
    expect(violations.some((v) => v.detail.includes('Nintendo'))).toBe(true);
    expect(violations.some((v) => v.detail.includes('PlayStation'))).toBe(true);
    expect(violations.filter((v) => v.detail.includes('Xbox'))).toHaveLength(0);
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

  it('shared.akamai.steamstatic.com → 違反なし', () => {
    const game = makeGame({ coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3652140/header.jpg' });
    expect(checkR4(game)).toBeNull();
  });

  it('その他の steamstatic.com サブドメイン → 違反なし', () => {
    const game = makeGame({ coverImage: 'https://cdn.akamai.steamstatic.com/steam/apps/123/header.jpg' });
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
// R5: 識別子整合（別ゲームのメタ混入検出）
// ─────────────────────────────────────────────────────────────────────────────

describe('R5: 識別子整合（別ゲームのメタ混入検出）', () => {
  it('steamAppId が指す実体と game メタが同一 → 違反なし', async () => {
    const game = makeGame({
      title: 'Elden Ring',
      steamAppId: 1245620,
      releaseDate: '2022-02-25',
    });
    const fetchImpl = makeSteamFetch({ 1245620: { name: 'ELDEN RING', date: '25 Feb, 2022' } });
    expect(await checkR5(game, fetchImpl)).toBeNull();
  });

  it('#166 再現: Doom 1993 のメタに Doom 2016 の appId が混入 → R5 違反', async () => {
    // known-cases #46/#166 パターン: 同名異作品。game メタは 1993 年の Doom だが
    // steamAppId=2280 は Doom(2016)。発売年が 23 年差で別作品。
    const game = makeGame({
      title: 'Doom',
      steamAppId: 2280,
      releaseDate: '1993-12-10',
    });
    const fetchImpl = makeSteamFetch({ 2280: { name: 'DOOM', date: '13 May, 2016' } });
    const v = await checkR5(game, fetchImpl);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R5');
    expect(v?.detail).toContain('2280');
    expect(v?.detail).toContain('year-mismatch');
  });

  it('タイトルが全く別物 → R5 違反', async () => {
    const game = makeGame({
      title: 'Stardew Valley',
      steamAppId: 413150,
      releaseDate: '2016-02-26',
    });
    // appId が指す実体は全然違うタイトル（混入）
    const fetchImpl = makeSteamFetch({ 413150: { name: 'Cyberpunk 2077', date: '10 Dec, 2020' } });
    const v = await checkR5(game, fetchImpl);
    expect(v).not.toBeNull();
    expect(v?.ruleId).toBe('R5');
  });

  it('steamAppId が無い → チェックせず違反なし（fail-open）', async () => {
    const game = makeGame({ title: 'No Steam Game', steamAppId: undefined });
    // fetch は呼ばれないはず。呼ばれたら network down で例外になる構成
    const fetchImpl = makeSteamFetch({}, { failNetwork: true });
    expect(await checkR5(game, fetchImpl)).toBeNull();
  });

  it('Storefront API が実体を返せない（appId 無効）→ fail-open で違反なし', async () => {
    const game = makeGame({ title: 'Some Game', steamAppId: 999999, releaseDate: '2020-01-01' });
    const fetchImpl = makeSteamFetch({}); // 999999 はマップに無い → success:false
    expect(await checkR5(game, fetchImpl)).toBeNull();
  });

  it('Storefront API がネットワークエラー → fail-open で違反なし', async () => {
    const game = makeGame({ title: 'Some Game', steamAppId: 12345, releaseDate: '2020-01-01' });
    const fetchImpl = makeSteamFetch({}, { failNetwork: true });
    expect(await checkR5(game, fetchImpl)).toBeNull();
  });

  it('Steam 実体が coming_soon（未発売）→ 発売年は照合せずタイトル一致で通す', async () => {
    // coming_soon の場合 Steam 側の年を信頼しない。タイトルが一致すれば違反なし。
    const game = makeGame({
      title: 'Hollow Knight Silksong',
      steamAppId: 1030300,
      releaseDate: '2020-01-01', // 仮の game 側の年（Steam は coming_soon で年を出さない）
    });
    const fetchImpl = makeSteamFetch({
      1030300: { name: 'Hollow Knight: Silksong', date: 'Coming soon', coming_soon: true },
    });
    expect(await checkR5(game, fetchImpl)).toBeNull();
  });

  it('R5 は replaceable=true（差し替えで解消可能）', () => {
    expect(RULE_REPLACEABLE.R5).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: usedTitles の stale エントリ修正の回帰テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: 違反ゲームの normalizedTitle が予備候補をブロックしない', () => {
  it('違反した newRelease と同じ normalizedTitle を持つ予備候補が差し替えに使われる', async () => {
    mockHeadOk.mockResolvedValue(true);

    // 違反ゲーム（R1違反）— normalizedTitle='shared-title'
    const violatingRelease = makeGame({
      title: 'Shared Title',
      normalizedTitle: 'shared-title',
      sourceUrls: { stores: [] }, // R1 違反
    });

    // 予備候補：正常だが normalizedTitle が違反ゲームと同じ（リマスター版など）
    const reserveWithSameNorm = makeGame({
      title: 'Shared Title Remaster',
      normalizedTitle: 'shared-title', // 修正前は usedTitles に残った 'shared-title' にブロックされた
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/xyz.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [violatingRelease] });
    const report = await runCompletenessGate(selected, undefined, [reserveWithSameNorm], 'replace');

    // 修正後：違反ゲームの normalizedTitle が usedTitles から除外されるため予備候補が採用される
    expect(report.replacedGames).toContain('Shared Title Remaster');
    expect(selected.newReleases.some((g) => g.title === 'Shared Title Remaster')).toBe(true);
    expect(selected.newReleases.some((g) => g.title === 'Shared Title')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: mode=fail
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: mode=fail', () => {
  it('newReleases 違反があると hasMutableViolations=true を返す', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie game',
      sourceUrls: { stores: [] }, // R1 違反
    });
    const selected = makeSelectedGames({ newReleases: [violatingGame] });

    const report = await runCompletenessGate(selected, undefined, [], 'fail');

    expect(report.hasMutableViolations).toBe(true);
    expect(report.violations.some((v) => v.gameTitle === 'Zombie Game')).toBe(true);
  });

  it('違反がなければ hasMutableViolations=false を返す', async () => {
    mockHeadOk.mockResolvedValue(true);

    const healthyGame = makeGame({
      title: 'Healthy Game',
      normalizedTitle: 'healthy game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    });
    const selected = makeSelectedGames({ newReleases: [healthyGame] });

    const report = await runCompletenessGate(selected, undefined, [], 'fail');

    expect(report.hasMutableViolations).toBe(false);
    expect(report.violations).toHaveLength(0);
  });

  it('featured のみに違反があっても hasMutableViolations=false（fail 対象外）', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingFeatured = makeGame({
      title: 'Featured Zombie',
      normalizedTitle: 'featured zombie',
      sourceUrls: { stores: [] }, // R1 違反
    });
    const selected = makeSelectedGames({ featured: violatingFeatured });

    const report = await runCompletenessGate(selected, undefined, [], 'fail');

    // featured 違反は violations に記録されるが fail 対象にはならない
    expect(report.violations.some((v) => v.gameTitle === 'Featured Zombie')).toBe(true);
    expect(report.hasMutableViolations).toBe(false);
  });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// RULE_REPLACEABLE: ルール属性の定義（差し替え適格性）
// ─────────────────────────────────────────────────────────────────────────────

describe('RULE_REPLACEABLE: ルール属性', () => {
  it('R1 は replaceable=true（ゲーム固有の情報欠落）', () => {
    expect(RULE_REPLACEABLE.R1).toBe(true);
  });

  it('R3 は replaceable=true（公式 URL 到達性はゲーム固有）', () => {
    expect(RULE_REPLACEABLE.R3).toBe(true);
  });

  it('R4 は replaceable=true（画像ホストはゲーム固有）', () => {
    expect(RULE_REPLACEABLE.R4).toBe(true);
  });

  it('R2 は replaceable=false（Resolver とデータの内部不整合＝バグ疑い）', () => {
    expect(RULE_REPLACEABLE.R2).toBe(false);
  });

  it('R2b は replaceable=false（同上）', () => {
    expect(RULE_REPLACEABLE.R2b).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: 2軸挙動（mode × replaceable）
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: mode=fail × replaceable（Issue #158）', () => {
  it('R1 違反（replaceable=true）でも reserves があれば差し替えて unresolved=false', async () => {
    mockHeadOk.mockResolvedValue(true);

    // Dungeon Blitz R 的なゲーム: IGDB のみでヒットし stores も official も無し
    const igdbOnlyGame = makeGame({
      title: 'Dungeon Blitz R',
      normalizedTitle: 'dungeon-blitz-r',
      sourceUrls: { stores: [] }, // R1 違反
    });
    const healthyPartner = makeGame({
      title: 'Healthy Partner',
      normalizedTitle: 'healthy-partner',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
    });
    const reserveGame = makeGame({
      title: 'Reserve Game',
      normalizedTitle: 'reserve-game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [igdbOnlyGame, healthyPartner] });
    const report = await runCompletenessGate(selected, undefined, [reserveGame], 'fail');

    // 差し替えが発生し、未解消違反は残らない → exit 判定で fail しない
    expect(report.hasMutableViolations).toBe(true);
    expect(report.replacedGames).toContain('Reserve Game');
    expect(report.unresolvedMutableViolations).toBe(false);
    expect(selected.newReleases.some((g) => g.title === 'Dungeon Blitz R')).toBe(false);
    expect(selected.newReleases.some((g) => g.title === 'Reserve Game')).toBe(true);
  });

  it('R1 違反があり reserves も枯渇していると unresolved=true（コンテンツ不足）', async () => {
    mockHeadOk.mockResolvedValue(true);

    const violatingGame = makeGame({
      title: 'Zombie Game',
      normalizedTitle: 'zombie-game',
      sourceUrls: { stores: [] },
    });
    const selected = makeSelectedGames({ newReleases: [violatingGame] });
    const report = await runCompletenessGate(selected, undefined, [], 'fail');

    // 差し替え候補がなく 2 枠を埋められない → 呼び出し側で exit(1) される
    expect(report.replacedGames).toHaveLength(0);
    expect(report.unresolvedMutableViolations).toBe(true);
  });

  it('R2 違反（replaceable=false）は mode=fail で差し替えず即 unresolved=true', async () => {
    mockHeadOk.mockResolvedValue(true);

    const r2Game = makeGame({
      title: 'S&box',
      normalizedTitle: 's-and-box',
      sourceUrls: { stores: [] }, // stores に Steam なし
    });
    const healthyPartner = makeGame({
      title: 'Healthy Partner',
      normalizedTitle: 'healthy-partner',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
    });
    // R2 の trace あり: Resolver は Steam を解決している
    const trace: ResolverTrace = {
      'S&box': { steam: { attempts: [{ method: 'storesearch', ok: true }] } },
    };
    // reserves を用意しても R2 は差し替え対象にならないことを確認する
    const reserveGame = makeGame({
      title: 'Reserve Game',
      normalizedTitle: 'reserve-game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [r2Game, healthyPartner] });
    const report = await runCompletenessGate(selected, trace, [reserveGame], 'fail');

    // R2 は差し替えられず、内部バグシグナルとして即 fail 判定に倒れる
    expect(report.violations.some((v) => v.ruleId === 'R2')).toBe(true);
    expect(report.replacedGames).toHaveLength(0);
    expect(report.unresolvedMutableViolations).toBe(true);
    // R2 違反ゲームは差し替えられずに残る（呼び出し側で exit するため）
    expect(selected.newReleases.some((g) => g.title === 'S&box')).toBe(true);
  });

  it('同一ゲームに R1（replaceable=true）と R2（replaceable=false）が同居 → 差し替えず unresolved=true', async () => {
    mockHeadOk.mockResolvedValue(true);

    // stores が空 → R1 違反、かつ Resolver が Steam を解決している → R2 違反も発生
    const mixed = makeGame({
      title: 'Mixed Violation',
      normalizedTitle: 'mixed-violation',
      sourceUrls: { stores: [] },
    });
    const trace: ResolverTrace = {
      'Mixed Violation': { steam: { attempts: [{ method: 'storesearch', ok: true }] } },
    };
    const healthyPartner = makeGame({
      title: 'Healthy Partner',
      normalizedTitle: 'healthy-partner',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
    });
    const reserveGame = makeGame({
      title: 'Reserve Game',
      normalizedTitle: 'reserve-game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
    });

    const selected = makeSelectedGames({ newReleases: [mixed, healthyPartner] });
    const report = await runCompletenessGate(selected, trace, [reserveGame], 'fail');

    // R2 が混じっているので差し替え対象にならず、ゲームは残る
    expect(report.replacedGames).toHaveLength(0);
    expect(report.unresolvedMutableViolations).toBe(true);
    expect(selected.newReleases.some((g) => g.title === 'Mixed Violation')).toBe(true);
  });

  it('違反なしなら unresolved=false（差し替えなし・fail しない）', async () => {
    mockHeadOk.mockResolvedValue(true);

    const healthy1 = makeGame({
      title: 'Healthy 1',
      normalizedTitle: 'healthy-1',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
    });
    const healthy2 = makeGame({
      title: 'Healthy 2',
      normalizedTitle: 'healthy-2',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
    });
    const selected = makeSelectedGames({ newReleases: [healthy1, healthy2] });

    const report = await runCompletenessGate(selected, undefined, [], 'fail');

    expect(report.hasMutableViolations).toBe(false);
    expect(report.unresolvedMutableViolations).toBe(false);
    expect(report.replacedGames).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runCompletenessGate: R5（別ゲームのメタ混入）の差し替え統合
// ─────────────────────────────────────────────────────────────────────────────

describe('runCompletenessGate: R5 メタ混入ゲームの差し替え', () => {
  it('#166 型: 混入ゲーム（R5違反）を予備候補に差し替え、unresolved=false', async () => {
    mockHeadOk.mockResolvedValue(true);

    // game メタは Doom(1993) だが steamAppId=2280 は Doom(2016) の実体（別作品混入）
    const corrupted = makeGame({
      title: 'Doom',
      normalizedTitle: 'doom',
      steamAppId: 2280,
      releaseDate: '1993-12-10',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg',
    });
    const healthyPartner = makeGame({
      title: 'Healthy Partner',
      normalizedTitle: 'healthy-partner',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/b.jpg',
    });
    // 予備候補は steamAppId を持たない → R5 の fetch 対象外（fail-open で通過）
    const reserveGame = makeGame({
      title: 'Reserve Game',
      normalizedTitle: 'reserve-game',
      sourceUrls: { stores: [makeStoreLink('steam')] },
      coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/c.jpg',
    });

    // appId=2280 は Doom(2016) を返す → game メタ(1993)と 23 年差で R5 違反
    const fetchImpl = makeSteamFetch({ 2280: { name: 'DOOM', date: '13 May, 2016' } });

    const selected = makeSelectedGames({ newReleases: [corrupted, healthyPartner] });
    const report = await runCompletenessGate(
      selected,
      undefined,
      [reserveGame],
      'fail',
      undefined,
      fetchImpl
    );

    // R5 違反が検出され、混入ゲームは差し替えられる
    expect(report.violations.some((v) => v.ruleId === 'R5')).toBe(true);
    expect(report.replacedGames).toContain('Reserve Game');
    expect(report.unresolvedMutableViolations).toBe(false);
    expect(selected.newReleases.some((g) => g.title === 'Doom')).toBe(false);
    expect(selected.newReleases.some((g) => g.title === 'Reserve Game')).toBe(true);
  });
});
