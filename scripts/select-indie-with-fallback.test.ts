import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData } from './types';

vi.mock('./finalize-game-metadata.js', async (importActual) => {
  const actual = await importActual<typeof import('./finalize-game-metadata.js')>();
  return {
    ...actual,
    finalizeGameMetadata: vi.fn(),
  };
});

import {
  selectIndieGamesWithFallback,
  meetsPopularityThreshold,
  formatIndividualDeveloper,
  vetIndieCandidate,
} from './select-indie-with-fallback';
import { finalizeGameMetadata } from './finalize-game-metadata.js';

const mockFinalize = vi.mocked(finalizeGameMetadata);

function makeGame(overrides: Partial<GameData>): GameData {
  return {
    title: 'Game',
    normalizedTitle: 'game',
    genres: [],
    platforms: [],
    source: ['steam'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────
// meetsPopularityThreshold（純粋関数のユニットテスト）
// ────────────────────────────────────────────────
describe('meetsPopularityThreshold', () => {
  it('steamRecommendations >= 5000 → true', () => {
    const g = makeGame({ steamRecommendations: 5000 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRecommendations < 5000 alone → false', () => {
    const g = makeGame({ steamRecommendations: 4999 });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  it('steamRank <= 200 → true', () => {
    const g = makeGame({ steamRank: 1 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRank = 200（境界値ちょうど） → true', () => {
    const g = makeGame({ steamRank: 200 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRank > 200 alone → false', () => {
    const g = makeGame({ steamRank: 201 });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  it('no data at all → false', () => {
    const g = makeGame({});
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  // Issue #235 回帰テスト: 話題性判定から YouTube 経路を削除したことの固定化。
  // ポジティブコントロール（steamRecommendations=5000 → true, steamRank=200 → true）は
  // 上記の既存テストで確認済みなので、ここでは YouTube 単独では通らないことのみを確認する。
  it('youtubePopularity が巨大でも steamRecommendations / steamRank が閾値未満なら false（YouTube 経路は削除済み）', () => {
    const g = makeGame({
      youtubePopularity: 10_000_000,
      steamRecommendations: 4999,
      steamRank: 201,
    });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });
});

// ────────────────────────────────────────────────
// formatIndividualDeveloper
// ────────────────────────────────────────────────
describe('formatIndividualDeveloper', () => {
  it('アカウント名を「個人開発（）」形式に変換する', () => {
    expect(formatIndividualDeveloper('lemorion_1224')).toBe('個人開発（lemorion_1224）');
  });

  it('スペース入り名前でも変換できる', () => {
    expect(formatIndividualDeveloper('Tour De Pizza')).toBe('個人開発（Tour De Pizza）');
  });
});

// ────────────────────────────────────────────────
// selectIndieGamesWithFallback
// ────────────────────────────────────────────────
describe('selectIndieGamesWithFallback - 通常ルート', () => {
  it('ranked=[A,B] どちらも ok → adopted=[A,B]', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const finishedA = { ...A, developer: 'Dev A', coverImage: 'https://x.com/a.jpg', sourceUrls: { steam: 'https://s.com/a' } };
    const finishedB = { ...B, developer: 'Dev B', coverImage: 'https://x.com/b.jpg', sourceUrls: { steam: 'https://s.com/b' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectIndieGamesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('Game A');
    expect(result.adopted[1].title).toBe('Game B');
    expect(result.rejected).toHaveLength(0);
  });

  it('ranked=[A,B,C] A が rejected → B,C から2件採用', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const C = makeGame({ title: 'Game C', normalizedTitle: 'game c' });
    const finishedB = { ...B, developer: 'Dev B', coverImage: 'https://x.com/b.jpg', sourceUrls: { steam: 'https://s.com/b' } };
    const finishedC = { ...C, developer: 'Dev C', coverImage: 'https://x.com/c.jpg', sourceUrls: { steam: 'https://s.com/c' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'date-mismatch' as const, game: A })
      .mockResolvedValueOnce({ ok: true, game: finishedB })
      .mockResolvedValueOnce({ ok: true, game: finishedC });

    const result = await selectIndieGamesWithFallback([A, B, C], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('Game B');
    expect(result.adopted[1].title).toBe('Game C');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Game A');
  });

  it('全件 reject → adopted=[], rejected に全件', async () => {
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: A })
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: B });

    const result = await selectIndieGamesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('ranked=[] → adopted=[], rejected=[]', async () => {
    const result = await selectIndieGamesWithFallback([], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(mockFinalize).not.toHaveBeenCalled();
  });
});

describe('selectIndieGamesWithFallback - 話題性ルート', () => {
  it('developer のみ欠落 + 話題性閾値 OK → 個人開発ラベル付きで採用', async () => {
    const candidate = makeGame({
      title: 'Popular Indie',
      normalizedTitle: 'popular indie',
      steamRawDeveloper: 'dev_account',
      steamRecommendations: 6000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/99999' },
    });
    const gameAfterFinalize = {
      ...candidate,
      // developer is still missing after finalize (isQualifiedCompanyName rejected account name)
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].developer).toBe('個人開発（dev_account）');
    expect(result.rejected).toHaveLength(0);
  });

  it('developer のみ欠落 + 話題性閾値 NG → rejected', async () => {
    const candidate = makeGame({
      title: 'Niche Indie',
      normalizedTitle: 'niche indie',
      steamRawDeveloper: 'tiny_dev',
      steamRecommendations: 100, // 5000 未満
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/11111' },
    });
    const gameAfterFinalize = { ...candidate };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Niche Indie');
  });

  it('cover が欠落 → 話題性ルートは起動しない（cover 欠落は代替不可）', async () => {
    const candidate = makeGame({
      title: 'No Cover Game',
      normalizedTitle: 'no cover game',
      steamRawDeveloper: 'dev_account',
      steamRecommendations: 10000, // 話題性は十分
      // coverImage = undefined
      sourceUrls: { steam: 'https://store.steampowered.com/app/22222' },
    });
    const gameAfterFinalize = {
      ...candidate,
      // coverImage still undefined, developer still undefined
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    // developer ではなく cover が原因の場合は 個人開発ラベル付与しない
    expect(result.rejected[0].title).toBe('No Cover Game');
  });

  it('steamRawDeveloper が undefined のとき → developer="個人開発（unknown）"', async () => {
    const candidate = makeGame({
      title: 'Mystery Dev Game',
      normalizedTitle: 'mystery dev game',
      // steamRawDeveloper: undefined,
      steamRecommendations: 7000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/33333' },
    });
    const gameAfterFinalize = { ...candidate };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].developer).toBe('個人開発（unknown）');
  });

  // Vol.12 再発防止テスト: めっちゃカメレオン相当の fixture
  it('めっちゃカメレオン相当: lemorion_1224（reviews=11179, CDN=landscape）→ 話題性ルートで採用', async () => {
    const mechaChamRaw: GameData = {
      title: 'めっちゃカメレオン',
      normalizedTitle: 'めっちゃかめれおん',
      genres: ['アクション'],
      platforms: ['PC'],
      source: ['steam'],
      steamAppId: 4704690,
      steamRawDeveloper: 'lemorion_1224',
      steamRecommendations: 11179,
      coverImage: 'https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg',
      coverImageOrientation: 'landscape',
      sourceUrls: { steam: 'https://store.steampowered.com/app/4704690' },
      // developer: undefined  ← isQualifiedCompanyName が 'lemorion_1224' を弾いた
    };

    // finalizeGameMetadata は coverImage と sourceUrl は確認できるが developer は埋められない
    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: mechaChamRaw,
    });

    const result = await selectIndieGamesWithFallback([mechaChamRaw], 1);

    expect(result.adopted).toHaveLength(1);
    const adopted = result.adopted[0];
    expect(adopted.developer).toBe('個人開発（lemorion_1224）');
    expect(adopted.coverImage).toBe('https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg');
    expect(adopted.coverImageOrientation).toBe('landscape');
    expect(adopted.steamRecommendations).toBe(11179);
    expect(result.rejected).toHaveLength(0);
  });

  // Issue #167: finalize 後に IGDB が大手スタジオ名を補完した場合の混入防止
  it('finalize 後に developer が Kojima Productions になったゲームは rejected になる', async () => {
    const candidate = makeGame({ title: 'Death Stranding', normalizedTitle: 'death stranding' });
    const finishedGame = {
      ...candidate,
      developer: 'Kojima Productions',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1190460' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  it('finalize 後に developer が PlatinumGames になったゲームは rejected になる', async () => {
    const candidate = makeGame({ title: 'Bayonetta 3', normalizedTitle: 'bayonetta 3' });
    const finishedGame = {
      ...candidate,
      developer: 'PlatinumGames',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1133390' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  // Issue #180: publisher が大手の場合は indie 枠から除外（話題性ルート）
  it('話題性ルートで developer 欠落 + publisher が Nintendo → rejected になる', async () => {
    const candidate = makeGame({
      title: 'Nintendo Contracted Game',
      normalizedTitle: 'nintendo contracted game',
      steamRawDeveloper: 'some_account',
      steamRecommendations: 9000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/888888' },
    });
    const gameAfterFinalize = {
      ...candidate,
      publisher: 'Nintendo',
      // developer still undefined after finalize
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  // Issue #180: publisher が大手の場合は indie 枠から除外（通常ルート）
  it('finalize 後に publisher が Bandai Namco（Echoes of Aincrad 相当）→ rejected になる', async () => {
    const candidate = makeGame({ title: 'Echoes of Aincrad', normalizedTitle: 'echoes of aincrad' });
    const finishedGame = {
      ...candidate,
      developer: 'Game Studio Inc.',  // 受託開発スタジオ（大手リストに載っていない）
      publisher: 'Bandai Namco Entertainment Inc.',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/999999' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  it('finalize 後に developer が小規模スタジオならそのまま採用される', async () => {
    const candidate = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    const finishedGame = {
      ...candidate,
      developer: 'Team Cherry',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/367520' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].developer).toBe('Team Cherry');
  });

  // finalizeGameMetadata の呼び出し回数が採用した候補数と一致すること
  it('finalizeGameMetadata は各候補に対して 1 回だけ呼ばれる', async () => {
    const games = [
      makeGame({ title: 'A', normalizedTitle: 'a', coverImage: 'x', sourceUrls: { steam: 'y' } }),
      makeGame({ title: 'B', normalizedTitle: 'b', coverImage: 'x', sourceUrls: { steam: 'y' } }),
    ];
    const finishedA = { ...games[0], developer: 'Dev A' };
    const finishedB = { ...games[1], developer: 'Dev B' };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    await selectIndieGamesWithFallback(games, 2);

    expect(mockFinalize).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────
// selectIndieGamesWithFallback — developerGameCount による大手ゲート（§3.4, Issue #231・PR-I その1）
// 新作枠と逆方向: count が高い候補は除外され、低い候補はインディーとして残ること
// ────────────────────────────────────────────────
describe('selectIndieGamesWithFallback — developerGameCount による大手ゲート (§3.4, Issue #231)', () => {
  it('developerGameCount=241 の候補は大手ゲートで除外され、count=7 の候補はインディーとして残る', async () => {
    const large = makeGame({ title: 'Large By Count', normalizedTitle: 'large by count' });
    const small = makeGame({ title: 'Small By Count', normalizedTitle: 'small by count' });

    const finishedLarge = {
      ...large,
      developer: 'Arc System Works', // 静的リストに無い名前。本数判定のみで除外されることを検証
      developerGameCount: 241,
      coverImage: 'https://x/large.jpg',
      sourceUrls: { steam: 'https://s/large' },
    };
    const finishedSmall = {
      ...small,
      developer: 'Some Tiny Studio',
      developerGameCount: 7,
      coverImage: 'https://x/small.jpg',
      sourceUrls: { steam: 'https://s/small' },
    };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedLarge })
      .mockResolvedValueOnce({ ok: true, game: finishedSmall });

    const result = await selectIndieGamesWithFallback([large, small], 2);

    expect(result.adopted.map((g) => g.title)).toContain('Small By Count');
    expect(result.adopted.map((g) => g.title)).not.toContain('Large By Count');
    expect(result.rejected.map((r) => r.title)).toContain('Large By Count');
  });
});

// ────────────────────────────────────────────────
// vetIndieCandidate — Issue #236: 親会社パブリッシャ名が静的リストに無かった穴の回帰テスト
// 実データ（2026-08-10 スナップショット）でインディー枠の大手ゲートを素通りした2件を再現する。
// 修正前（LARGE_DEVELOPERS に Xbox Game Studios / Sony Interactive Entertainment /
// Nippon Ichi Software が無い状態）ではこの2件は publisher 側ゲートに掛からず採用されてしまっていた。
// ────────────────────────────────────────────────
describe('vetIndieCandidate — Issue #236 親会社パブリッシャの大手ゲート回帰テスト', () => {
  it('developer=Halo Studios（16本）/ publisher=Xbox Game Studios の候補は publisher 側ゲートで除外される', async () => {
    const candidate = makeGame({ title: 'Halo: Campaign Evolved', normalizedTitle: 'halo: campaign evolved' });
    const finishedGame = {
      ...candidate,
      developer: 'Halo Studios',
      developerGameCount: 16,
      publisher: 'Xbox Game Studios',
      coverImage: 'https://example.com/halo.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1234567' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).toBeNull();
  });

  // Issue #236 code-review 指摘: publisher="NIS America, Inc." 側のエイリアスは削除済みのため、
  // この候補は developer="Nippon Ichi Software, Inc." 側の静的リスト一致（大手ゲート）で除外される。
  // publisher 側は無関係（'nis america' エイリアスは実データ上の修正効果がゼロだったため削除）。
  it('developer側の静的リスト一致（Nippon Ichi Software, Inc.）で除外される（publisherのNIS America側ではない）', async () => {
    const candidate = makeGame({ title: 'ほの暮しの庭', normalizedTitle: 'ほのぐらしのにわ' });
    const finishedGame = {
      ...candidate,
      developer: 'Nippon Ichi Software, Inc.',
      developerGameCount: 3,
      publisher: 'NIS America, Inc.',
      coverImage: 'https://example.com/honogurashi.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/7654321' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).toBeNull();
  });

  // ポジティブコントロール: 本来インディーの候補が巻き込まれて除外されていないことの確認
  // （「除外されること」だけを検証するテストは、常に null を返す実装でも通ってしまうため必須）
  it('developer=PocketPair（7本）の候補は引き続き採用される', async () => {
    const candidate = makeGame({ title: 'Palworld', normalizedTitle: 'palworld' });
    const finishedGame = {
      ...candidate,
      developer: 'PocketPair',
      developerGameCount: 7,
      coverImage: 'https://example.com/palworld.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1623730' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).not.toBeNull();
    expect(result?.developer).toBe('PocketPair');
  });
});
