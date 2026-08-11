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

  // §2.3 PR-B2: Amazon 国内ランキング掲載自体を実存の強い裏付けとして扱う経路を追加。
  it('amazonRanked: true だけで true になる。同じテスト内で、シグナルなし＋optionsなしなら false であることも確認する', () => {
    const g = makeGame({});
    expect(hasExistenceEvidence(g)).toBe(false);
    expect(hasExistenceEvidence(g, { amazonRanked: true })).toBe(true);
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 通常ルート
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 通常ルート', () => {
  it('ranked=[A,B] どちらも ok → adopted=[A,B], reserves=[]', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const finishedA = { ...A, developer: 'Nintendo', coverImage: 'https://x/a.jpg', sourceUrls: { steam: 'https://s/a' } };
    const finishedB = { ...B, developer: 'Capcom', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };

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
    const finishedB = { ...B, developer: 'Capcom', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };
    const finishedC = { ...C, developer: 'Sega', coverImage: 'https://x/c.jpg', sourceUrls: { steam: 'https://s/c' } };

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
    expect(result.rejected[0].reason).toBe('not-adopted');
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
    const finished = { ...A, developer: 'Capcom', coverImage: 'https://x/a.jpg', sourceUrls: { steam: 'https://s/a' } };
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
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  // Issue #180: 企業規模ゲートは撤廃済み（論点A）なので developer が小規模でも通過するが、
  // developer は受託スタジオ名（事実）のまま保持され、publisher 名で上書きされないことを検証する。
  it('developer が小規模スタジオでも publisher が Bandai Namco（Echoes of Aincrad）でも通過し developer は受託スタジオ名のまま保持する', async () => {
    const A = makeGame({ title: 'Echoes of Aincrad', normalizedTitle: 'echoes of aincrad' });
    const finished = {
      ...A,
      developer: 'Game Studio Inc.',
      publisher: 'Bandai Namco Entertainment Inc.',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/999999' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

    const result = await selectNewReleasesWithFallback([A], 1);
    expect(result.adopted).toHaveLength(1);
    // Steam の developers[] には受託スタジオが載る（実測: Echoes of Aincrad は
    // developers=["Game Studio Inc."]）ため、publisher 名で上書きせず事実どおりの開発元を保持する
    expect(result.adopted[0].developer).toBe('Game Studio Inc.');
    expect(result.adopted[0].publisher).toBe('Bandai Namco Entertainment Inc.');
  });

  // Issue #180 / #277: developer の上書きを撤去（回帰防止）。
  // Issue #277 で canonical / displayName による上書きが同一性照合と衝突することが判明
  // （和名 `任天堂` vs Steam 英語表記 `Nintendo` の不一致、`Nintendo EPD` vs 生値 `Nintendo` の不一致）。
  // developer は事実（生値）を保持する方針であり、上書きしない。Issue #180（受託開発タイトルの
  // ラベルを大手側に寄せる）の意図は `pickNewReleaseLabelCompany` で達成済み。
  it('developer が大手でも上書きされず、生値が保持される（同一性照合との衝突回避、Issue #277）', async () => {
    const A = makeGame({ title: 'Mario Game', normalizedTitle: 'mario game' });
    const finished = {
      ...A,
      developer: 'Nintendo',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/12345' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

    const result = await selectNewReleasesWithFallback([A], 1);
    expect(result.adopted).toHaveLength(1);
    // 'Nintendo EPD' でも '任天堂' でもなく、生値 'Nintendo' のまま
    expect(result.adopted[0].developer).toBe('Nintendo');
  });

  // 論点A（企業規模条件の撤廃）: developer・publisher がどちらも大手でなくても、
  // finalize さえ通れば採用される。大手候補（ポジティブコントロール）と同居させ、
  // 「企業規模は採用可否に影響しない」ことを示す。
  it('企業規模に関わらず finalize が通れば採用される（小規模スタジオ・大手が両方採用される）', async () => {
    const small = makeGame({ title: 'Indie Game', normalizedTitle: 'indie game' });
    const large = makeGame({ title: 'AAA Game', normalizedTitle: 'aaa game' });
    const finishedSmall = {
      ...small,
      developer: 'Small Studio',
      publisher: 'Small Publisher',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/99' },
    };
    const finishedLarge = {
      ...large,
      developer: 'Capcom',
      coverImage: 'https://example.com/cover2.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/100' },
    };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedSmall })
      .mockResolvedValueOnce({ ok: true, game: finishedLarge });

    const result = await selectNewReleasesWithFallback([small, large], 2);
    expect(result.adopted.map((g) => g.title)).toEqual(['Indie Game', 'AAA Game']);
    expect(result.rejected).toHaveLength(0);
  });

  // 落ちる理由として残るのは finalizeGameMetadata の失敗のみ（企業規模では落ちない）。
  it('企業規模に関わらず finalize が失敗すれば不採用になる（不採用理由は finalize 失敗のみ）', async () => {
    const A = makeGame({ title: 'Large But Bad Data', normalizedTitle: 'large but bad data' });
    // developer は大手（Nintendo）でも finalize が失敗すれば不採用
    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: { ...A, developer: 'Nintendo' },
    });

    const result = await selectNewReleasesWithFallback([A], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — 例外処理
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 例外処理', () => {
  it('finalizeGameMetadata が例外を throw → finalize-error として rejected に追加し次候補へ', async () => {
    const A = makeGame({ title: 'Error Game', normalizedTitle: 'error game' });
    const B = makeGame({ title: 'OK Game', normalizedTitle: 'ok game' });
    const finishedB = { ...B, developer: 'Nintendo', coverImage: 'https://x/b.jpg', sourceUrls: { steam: 'https://s/b' } };

    mockFinalize
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectNewReleasesWithFallback([A, B], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].title).toBe('OK Game');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Error Game');
    expect(result.rejected[0].reason).toBe('not-adopted');
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
    const finishedX = { ...games[0], developer: 'Capcom', coverImage: 'c', sourceUrls: { steam: 's' } };
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
    // targetCount=2。A,B が ok → 2件採用で停止 → C は未試行 → reserves=[C]
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });
    const C = makeGame({ title: 'C', normalizedTitle: 'c' });
    const finishedA = { ...A, developer: 'Nintendo', coverImage: 'c', sourceUrls: { steam: 's' } };
    const finishedB = { ...B, developer: 'Capcom', coverImage: 'c', sourceUrls: { steam: 's' } };

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
    const finishedB = { ...B, developer: 'Nintendo', coverImage: 'c', sourceUrls: { steam: 's' } };

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
// selectNewReleasesWithFallback — 候補が尽きるまで評価（Issue #189）
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — 候補が尽きるまで評価 (Issue #189)', () => {
  it('上位に非大手が並び大手が後方にあっても、候補が尽きるまで評価して到達する', async () => {
    // Vol.15 の再現: 上位6件が全て reject、7件目に採用可能な大手候補。
    // 旧仕様（maxAttempts = targetCount*3 = 6）では7件目に到達できず枠が埋まらなかった。
    // targetCount=2 だが採用可能は1件のみなので、ループは全7件を評価する。
    const games = Array.from({ length: 7 }, (_, i) =>
      makeGame({ title: `G${i}`, normalizedTitle: `g${i}` })
    );

    // 0〜5番目（6件）は non-large-studio 等で reject
    for (let i = 0; i < 6; i++) {
      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: games[i],
      });
    }
    // 6番目（7件目）に採用可能な大手候補
    mockFinalize.mockResolvedValueOnce({
      ok: true,
      game: { ...games[6], developer: 'Nintendo', coverImage: 'c', sourceUrls: { steam: 's' } },
    });

    const result = await selectNewReleasesWithFallback(games, 2);
    // 7件目まで到達して採用される（旧仕様では6回で打ち切られ到達不能だった）
    expect(mockFinalize).toHaveBeenCalledTimes(7);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].title).toBe('G6');
    expect(result.rejected).toHaveLength(6);
    expect(result.reserves).toHaveLength(0);
  });

  it('全件 reject でも候補を最後まで評価し、reserves は空になる', async () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      makeGame({ title: `G${i}`, normalizedTitle: `g${i}` })
    );
    for (let i = 0; i < 10; i++) {
      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: games[i],
      });
    }

    const result = await selectNewReleasesWithFallback(games, 2);
    expect(result.adopted).toHaveLength(0);
    // 打ち切りなく全10件を評価
    expect(mockFinalize).toHaveBeenCalledTimes(10);
    expect(result.rejected).toHaveLength(10);
    // 未評価候補は残らない
    expect(result.reserves).toHaveLength(0);
  });

  it('targetCount 件採用したら残りは評価せず reserves に残す', async () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      makeGame({ title: `G${i}`, normalizedTitle: `g${i}` })
    );
    // 先頭2件が採用可能
    mockFinalize
      .mockResolvedValueOnce({
        ok: true,
        game: { ...games[0], developer: 'Nintendo', coverImage: 'c', sourceUrls: { steam: 's' } },
      })
      .mockResolvedValueOnce({
        ok: true,
        game: { ...games[1], developer: 'Capcom', coverImage: 'c', sourceUrls: { steam: 's' } },
      });

    const result = await selectNewReleasesWithFallback(games, 2);
    expect(result.adopted).toHaveLength(2);
    // 2件採用した時点で停止、残り3件は未評価
    expect(mockFinalize).toHaveBeenCalledTimes(2);
    expect(result.reserves).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────
// selectNewReleasesWithFallback — developerGameCount は新作枠の採否に影響しない
// (論点A: 企業規模条件の撤廃。旧仕様の developerGameCount ゲートを検証していたテストを更新)
// ────────────────────────────────────────────────
describe('selectNewReleasesWithFallback — developerGameCount は新作枠の採否に影響しない (論点A, Issue #231)', () => {
  it('静的リスト未登録の developer は developerGameCount の大小に関わらず両方採用される', async () => {
    // PR-I 時点では developerGameCount=241 は通過・7 は不採用という期待だったが、
    // 論点A（§11.1 確定事項 #1）で新作枠の企業規模ゲートは撤廃されたため、
    // 開発本数の大小に関わらずどちらも finalize が通れば採用される。
    const large = makeGame({ title: 'Large By Count', normalizedTitle: 'large by count' });
    const small = makeGame({ title: 'Small By Count', normalizedTitle: 'small by count' });

    const finishedLarge = {
      ...large,
      developer: 'Arc System Works', // 静的リストに無い名前
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

    const result = await selectNewReleasesWithFallback([large, small], 2);

    expect(result.adopted.map((g) => g.title)).toContain('Large By Count');
    expect(result.adopted.map((g) => g.title)).toContain('Small By Count');
    expect(result.rejected).toHaveLength(0);
  });

  // 実データ由来の回帰防止テスト（Issue #231 / 論点A）。
  // 2026-08-08 のライブデータで、Steam Top Sellers 1位・新作枠スコア100.0 の
  // 『ほの暮しの庭』が developer=Nippon Ichi Software, Inc.（静的リスト外・
  // developerGameCount=3）/ publisher=NIS America, Inc.（静的リスト外）という
  // 組み合わせで企業規模ゲートにのみ引っかかり、新作枠・インディー枠どちらにも
  // 載らない状態になっていた。このテストは、企業規模ゲートが新作枠に復活すると
  // 失敗する（= ゲート復活の回帰を検知する）。
  it('[Issue #231, 論点A] developer=Nippon Ichi Software, developerGameCount=3, publisher=NIS America（共に静的リスト外の小規模扱い）の候補が採用される', async () => {
    const A = makeGame({ title: 'ほの暮しの庭', normalizedTitle: 'honogurashi no niwa' });
    const finished = {
      ...A,
      developer: 'Nippon Ichi Software, Inc.',
      developerGameCount: 3,
      publisher: 'NIS America, Inc.',
      coverImage: 'https://x/honogurashi.jpg',
      sourceUrls: { steam: 'https://s/honogurashi' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

    const result = await selectNewReleasesWithFallback([A], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].title).toBe('ほの暮しの庭');
    expect(result.rejected).toHaveLength(0);
  });

  // Issue #277: developer の上書き撤去の回帰防止
  describe('[Issue #277] developer は上書きせず生値を保持する（同一性照合との衝突回避）', () => {
    it('developer=Nintendo（displayName=任天堂 を持つ）でも上書きされず生値が保持される', async () => {
      const A = makeGame({ title: 'Test Game', normalizedTitle: 'test game' });
      const finished = {
        ...A,
        developer: 'Nintendo',
        coverImage: 'https://x/test.jpg',
        sourceUrls: { steam: 'https://s/test' },
      };

      mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

      const result = await selectNewReleasesWithFallback([A], 1);
      expect(result.adopted).toHaveLength(1);
      // '任天堂' に上書きされず 'Nintendo' のまま（Steam 生値との照合を保つ）
      expect(result.adopted[0].developer).toBe('Nintendo');
    });

    it('developer=Xbox Game Studios（displayName=Microsoft）でも上書きされず生値が保持される', async () => {
      const A = makeGame({ title: 'Test Game', normalizedTitle: 'test game' });
      const finished = {
        ...A,
        developer: 'Xbox Game Studios',
        coverImage: 'https://x/test.jpg',
        sourceUrls: { steam: 'https://s/test' },
      };

      mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

      const result = await selectNewReleasesWithFallback([A], 1);
      expect(result.adopted).toHaveLength(1);
      // 'Microsoft' に上書きされず 'Xbox Game Studios' のまま
      expect(result.adopted[0].developer).toBe('Xbox Game Studios');
    });

    it('developer=Bethesda Game Studios（displayName=Bethesda）でも上書きされず生値が保持される', async () => {
      const A = makeGame({ title: 'Test Game', normalizedTitle: 'test game' });
      const finished = {
        ...A,
        developer: 'Bethesda Game Studios',
        coverImage: 'https://x/test.jpg',
        sourceUrls: { steam: 'https://s/test' },
      };

      mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

      const result = await selectNewReleasesWithFallback([A], 1);
      expect(result.adopted).toHaveLength(1);
      // 'Bethesda' に上書きされず 'Bethesda Game Studios' のまま
      expect(result.adopted[0].developer).toBe('Bethesda Game Studios');
    });

    // ポジティブコントロール: displayName の無い大手でも生値保持
    it('developer=Capcom（displayName 無し）でも上書きされず生値が保持される', async () => {
      const A = makeGame({ title: 'Test Game', normalizedTitle: 'test game' });
      const finished = {
        ...A,
        developer: 'capcom',
        coverImage: 'https://x/test.jpg',
        sourceUrls: { steam: 'https://s/test' },
      };

      mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

      const result = await selectNewReleasesWithFallback([A], 1);
      expect(result.adopted).toHaveLength(1);
      // 'Capcom'（canonical）に上書きされず 'capcom' のまま
      expect(result.adopted[0].developer).toBe('capcom');
    });

    it('developer が小規模スタジオでも生値が保持される', async () => {
      const A = makeGame({ title: 'Test Game', normalizedTitle: 'test game' });
      const finished = {
        ...A,
        developer: 'Small Studio Inc.',
        coverImage: 'https://x/test.jpg',
        sourceUrls: { steam: 'https://s/test' },
      };

      mockFinalize.mockResolvedValueOnce({ ok: true, game: finished });

      const result = await selectNewReleasesWithFallback([A], 1);
      expect(result.adopted).toHaveLength(1);
      expect(result.adopted[0].developer).toBe('Small Studio Inc.');
    });
  });
});
