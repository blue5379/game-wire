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
  selectNewReleasesWithFallback,
  hasExistenceEvidence,
} from './select-newreleases-with-fallback';
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
// hasExistenceEvidence（純粋関数のユニットテスト）
// ────────────────────────────────────────────────
describe('hasExistenceEvidence', () => {
  it('steamRank あり → true', () => {
    expect(hasExistenceEvidence(makeGame({ steamRank: 1 }))).toBe(true);
  });

  it('steamRank=0 は undefined 扱い（null でないので true）', () => {
    // steamRank: 0 は実際には起き得ないが、null チェックの挙動を確認
    const g = makeGame({ steamRank: 0 });
    // 0 は falsy だが != null なので true
    expect(hasExistenceEvidence(g)).toBe(true);
  });

  it('steamPlayers > 0 → true', () => {
    expect(hasExistenceEvidence(makeGame({ steamPlayers: 1000 }))).toBe(true);
  });

  it('steamPlayers = 0 → false（0は証拠にならない）', () => {
    expect(hasExistenceEvidence(makeGame({ steamPlayers: 0 }))).toBe(false);
  });

  it('igdbRatingCount >= 5 → true', () => {
    expect(hasExistenceEvidence(makeGame({ igdbRatingCount: 5 }))).toBe(true);
  });

  it('igdbRatingCount = 4 → false', () => {
    expect(hasExistenceEvidence(makeGame({ igdbRatingCount: 4 }))).toBe(false);
  });

  it('youtubePopularity > 0 → true', () => {
    expect(hasExistenceEvidence(makeGame({ youtubePopularity: 1 }))).toBe(true);
  });

  it('youtubePopularity = 0 → false', () => {
    expect(hasExistenceEvidence(makeGame({ youtubePopularity: 0 }))).toBe(false);
  });

  it('何もデータなし → false', () => {
    expect(hasExistenceEvidence(makeGame({}))).toBe(false);
  });

  it('複数の証拠が重なっても true（OR判定）', () => {
    const g = makeGame({ steamRank: 5, igdbRatingCount: 10, youtubePopularity: 5000 });
    expect(hasExistenceEvidence(g)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 通常ルート
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 通常ルート', () => {
  it('ranked=[A,B] どちらも ok → adopted=[A,B], reserves=[]', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const finishedA = { ...A, developer: 'Pub A', coverImage: 'https://x/a.jpg', sourceUrls: { steam: 'https://s/a' } };
    const finishedB = { ...B, developer: 'Pub B', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectNewReleasesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('Game A');
    expect(result.adopted[1].title).toBe('Game B');
    expect(result.rejected).toHaveLength(0);
    expect(result.reserves).toHaveLength(0);
  });

  it('A が date-mismatch で reject → B,C から2件採用', async () => {
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });
    const C = makeGame({ title: 'C', normalizedTitle: 'c' });
    const finishedB = { ...B, developer: 'Pub B', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };
    const finishedC = { ...C, developer: 'Pub C', coverImage: 'https://x/c.jpg', sourceUrls: { steam: 'https://s/c' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'date-mismatch' as const, game: A })
      .mockResolvedValueOnce({ ok: true, game: finishedB })
      .mockResolvedValueOnce({ ok: true, game: finishedC });

    const result = await selectNewReleasesWithFallback([A, B, C], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('B');
    expect(result.adopted[1].title).toBe('C');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('A');
    expect(result.rejected[0].reason).toBe('date-mismatch');
  });

  it('全件 reject → adopted=[], rejected に全件', async () => {
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: A })
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: B });

    const result = await selectNewReleasesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('ranked=[] → adopted=[], rejected=[], finalize 呼ばれない', async () => {
    const result = await selectNewReleasesWithFallback([], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('candidate1件でtarget=2 → 1件採用', async () => {
    const A = makeGame({ title: 'Solo', normalizedTitle: 'solo' });
    const finished = { ...A, developer: 'Dev', coverImage: 'https://x/a.jpg', sourceUrls: { steam: 'https://s/a' } };
    mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

    const result = await selectNewReleasesWithFallback([A], 2);
    expect(result.adopted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('identity-mismatch は rejected に記録される', async () => {
    const A = makeGame({ title: 'Mismatch Game', normalizedTitle: 'mismatch game' });

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'identity-mismatch' as const,
      game: A,
    });

    const result = await selectNewReleasesWithFallback([A], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('identity-mismatch');
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 例外処理
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 例外処理', () => {
  it('finalizeGameMetadata が例外を throw → finalize-error として rejected に追加し次候補へ', async () => {
    const A = makeGame({ title: 'Error Game', normalizedTitle: 'error game' });
    const B = makeGame({ title: 'OK Game', normalizedTitle: 'ok game' });
    const finishedB = { ...B, developer: 'Dev', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };

    mockFinalize
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectNewReleasesWithFallback([A, B], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].title).toBe('OK Game');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Error Game');
    expect(result.rejected[0].reason).toBe('finalize-error');
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 採用数の正確性
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — targetCount の境界値', () => {
  it('targetCount=1 の場合、1件採用で停止する', async () => {
    const games = [
      makeGame({ title: 'X', normalizedTitle: 'x' }),
      makeGame({ title: 'Y', normalizedTitle: 'y' }),
    ];
    const finishedX = { ...games[0], developer: 'Dev', coverImage: 'c', sourceUrls: { steam: 's' } };
    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedX });

    const result = await selectNewReleasesWithFallback(games, 1);
    expect(result.adopted).toHaveLength(1);
    // 2番目は評価されない
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it('targetCount=0 → finalize 呼ばれず空返却', async () => {
    const games = [makeGame({ title: 'X', normalizedTitle: 'x' })];
    const result = await selectNewReleasesWithFallback(games, 0);
    expect(result.adopted).toHaveLength(0);
    expect(mockFinalize).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — reserves
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — reserves', () => {
  it('採用されなかった未試行候補が reserves に入る', async () => {
    // targetCount=2, maxAttempts=6。A,B が ok → C は未試行 → reserves=[C]
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });
    const C = makeGame({ title: 'C', normalizedTitle: 'c' });
    const finishedA = { ...A, coverImage: 'c', sourceUrls: { steam: 's' } };
    const finishedB = { ...B, coverImage: 'c', sourceUrls: { steam: 's' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectNewReleasesWithFallback([A, B, C], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.reserves).toHaveLength(1);
    expect(result.reserves[0].title).toBe('C');
  });

  it('adopted も rejected もされていないものだけ reserves に入る', async () => {
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });
    const C = makeGame({ title: 'C', normalizedTitle: 'c' });
    const finishedB = { ...B, coverImage: 'c', sourceUrls: { steam: 's' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: A }) // rejected
      .mockResolvedValueOnce({ ok: true, game: finishedB }); // adopted

    // targetCount=1: B が採用されたら停止。C は未試行 → reserves=[C]
    const result = await selectNewReleasesWithFallback([A, B, C], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.reserves).toHaveLength(1);
    expect(result.reserves[0].title).toBe('C');
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 試行回数上限
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 試行回数上限 (maxAttempts = targetCount * 3)', () => {
  it('targetCount=2 のとき最大6回試行して停止する', async () => {
    // 10件候補、全件 reject → 6回で停止し残り4件は reserves に入る
    const games = Array.from({ length: 10 }, (_, i) =>
      makeGame({ title: `G${i}`, normalizedTitle: `g${i}` })
    );

    // 全件 still-missing-required
    for (let i = 0; i < 10; i++) {
      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: games[i],
      });
    }

    const result = await selectNewReleasesWithFallback(games, 2);
    expect(result.adopted).toHaveLength(0);
    // 最大 2*3=6 回試行
    expect(mockFinalize).toHaveBeenCalledTimes(6);
    expect(result.rejected).toHaveLength(6);
    // 残り4件は reserves に入る
    expect(result.reserves).toHaveLength(4);
  });

  it('targetCount=1 のとき最大3回試行して停止する', async () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      makeGame({ title: `G${i}`, normalizedTitle: `g${i}` })
    );
    for (let i = 0; i < 5; i++) {
      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'date-mismatch' as const,
        game: games[i],
      });
    }

    const result = await selectNewReleasesWithFallback(games, 1);
    expect(mockFinalize).toHaveBeenCalledTimes(3);
    expect(result.reserves).toHaveLength(2);
  });
});
