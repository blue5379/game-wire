/**
 * newrelease-score.ts のユニットテスト（N-6 決着・§2.3・PR-B2 対象外の3軸版）
 *
 * 軸: 批評(critic) / ユーザー票数(votes) / Steam(steam)
 * 集約: 保有軸の重み付き素点の max（Σ ではない。11.4.9 参照）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadNewReleaseScoreParams,
  computeNewReleaseScore,
  sortByNewReleaseScore,
  type NewReleaseScoreParams,
} from './newrelease-score.js';
import type { GameData } from './types.js';
import type { AmazonRankIndex } from './fetch-amazon-ranking.js';

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadNewReleaseScoreParams - 環境変数からのパラメータ読み込み', () => {
  it('環境変数が未設定なら既定値を返す', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_CRITIC', '');
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_VOTES', '');
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_STEAM', '');
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_DOMESTIC', '');
    vi.stubEnv('NEWRELEASE_SCORE_CRITIC_COUNT_MIN', '');
    vi.stubEnv('NEWRELEASE_SCORE_CRITIC_COUNT_FULL', '');
    vi.stubEnv('NEWRELEASE_SCORE_VOTES_MIN', '');
    vi.stubEnv('NEWRELEASE_SCORE_VOTES_FULL', '');

    const params = loadNewReleaseScoreParams();

    expect(params.weightCritic).toBe(1.0);
    expect(params.weightVotes).toBe(1.0);
    expect(params.weightSteam).toBe(1.0);
    expect(params.weightDomestic).toBe(1.0);
    expect(params.criticCountMin).toBe(2);
    expect(params.criticCountFull).toBe(4);
    expect(params.votesMin).toBe(15);
    expect(params.votesFull).toBe(500);
  });

  it('境界値: NEWRELEASE_SCORE_WEIGHT_STEAM=0 は 0 として読まれる（Number(x)||default だと 1.0 に化けるバグの回帰防止）', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_STEAM', '0');
    const params = loadNewReleaseScoreParams();
    expect(params.weightSteam).toBe(0);
  });

  it('不正値（数値でない文字列）は既定値にフォールバックする', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_VOTES', 'abc');
    const params = loadNewReleaseScoreParams();
    expect(params.weightVotes).toBe(1.0);
  });

  it('空文字は既定値にフォールバックする', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_CRITIC', '');
    const params = loadNewReleaseScoreParams();
    expect(params.weightCritic).toBe(1.0);
  });

  it('正常な数値は反映される', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_VOTES', '0.5');
    const params = loadNewReleaseScoreParams();
    expect(params.weightVotes).toBe(0.5);
  });
});

describe('computeNewReleaseScore - 批評軸(critic)', () => {
  it('境界値: aggregatedRatingCount=2 は保有する（agg=84, n=2 → 84*min(1,2/4)=84*0.5=42.0）', () => {
    const game = makeGame({ aggregatedRating: 84, aggregatedRatingCount: 2 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const critic = result.axes.find((a) => a.axis === 'critic');
    expect(critic).toBeDefined();
    expect(critic!.raw).toBeCloseTo(42.0, 5);
  });

  it('境界値: aggregatedRatingCount=1 は棄権する（軸が axes に含まれない）', () => {
    const game = makeGame({ aggregatedRating: 84, aggregatedRatingCount: 1 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.axes.find((a) => a.axis === 'critic')).toBeUndefined();
  });

  it('agg=84, n=4 → coverage=min(1,4/4)=1 → raw=84.0', () => {
    const game = makeGame({ aggregatedRating: 84, aggregatedRatingCount: 4 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const critic = result.axes.find((a) => a.axis === 'critic');
    expect(critic!.raw).toBeCloseTo(84.0, 5);
  });

  it('n=8（4媒体超）でも min(1, 8/4)=1 にクリップされ raw=84.0 のまま', () => {
    const game = makeGame({ aggregatedRating: 84, aggregatedRatingCount: 8 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const critic = result.axes.find((a) => a.axis === 'critic');
    expect(critic!.raw).toBeCloseTo(84.0, 5);
  });

  it('aggregatedRatingCount が条件を満たしても aggregatedRating が undefined なら棄権する', () => {
    const game = makeGame({ aggregatedRatingCount: 4 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.axes.find((a) => a.axis === 'critic')).toBeUndefined();
  });
});

describe('computeNewReleaseScore - ユーザー票数軸(votes)', () => {
  it('境界値: igdbRatingCount=15 は保有する', () => {
    const game = makeGame({ igdbRatingCount: 15 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.axes.find((a) => a.axis === 'votes')).toBeDefined();
  });

  it('境界値: igdbRatingCount=14 は棄権する', () => {
    const game = makeGame({ igdbRatingCount: 14 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.axes.find((a) => a.axis === 'votes')).toBeUndefined();
  });

  it('rc=500 → ちょうど100（log10(500)/log10(500)=1）', () => {
    const game = makeGame({ igdbRatingCount: 500 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const votes = result.axes.find((a) => a.axis === 'votes');
    expect(votes!.raw).toBeCloseTo(100, 5);
  });

  it('rc=1000 は100にクリップされる（クリップが無ければ 111.15 になる。この検証は必須）', () => {
    const game = makeGame({ igdbRatingCount: 1000 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const votes = result.axes.find((a) => a.axis === 'votes');
    expect(votes!.raw).toBe(100);
    expect(votes!.raw).not.toBeCloseTo(111.15, 1);
  });

  it('rc=5000 は100にクリップされる（クリップが無ければ 137.05 になる。この検証は必須）', () => {
    const game = makeGame({ igdbRatingCount: 5000 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const votes = result.axes.find((a) => a.axis === 'votes');
    expect(votes!.raw).toBe(100);
  });

  it('実測値 rc=257（Palworld近似値）→ 100*log10(257)/log10(500) ≈ 89.29', () => {
    // node -e で実測: 100*Math.log10(257)/Math.log10(500) = 89.29084500604404
    const game = makeGame({ igdbRatingCount: 257 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const votes = result.axes.find((a) => a.axis === 'votes');
    expect(votes!.raw).toBeCloseTo(89.29, 1);
  });
});

describe('computeNewReleaseScore - Steam軸(steam)', () => {
  it('取得件数20で1位 → 100点（100*(1-(1-1)/20)=100）', () => {
    const game = makeGame({ steamRank: 1 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const steam = result.axes.find((a) => a.axis === 'steam');
    expect(steam!.raw).toBeCloseTo(100, 5);
  });

  it('取得件数20で20位（最下位） → 5点（100*(1-19/20)=5）', () => {
    const game = makeGame({ steamRank: 20 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const steam = result.axes.find((a) => a.axis === 'steam');
    expect(steam!.raw).toBeCloseTo(5, 5);
  });

  it('分母がハードコードでないこと: 取得件数9件・1位のスコア(100)は取得件数20件・1位のスコア(100)と同じだが、同じ4位でも分母が変われば点数が変わる', () => {
    const game = makeGame({ steamRank: 4 });
    const score20 = computeNewReleaseScore(game, { steamSlotCount: 20 }).axes.find(
      (a) => a.axis === 'steam'
    )!.raw;
    const score9 = computeNewReleaseScore(game, { steamSlotCount: 9 }).axes.find(
      (a) => a.axis === 'steam'
    )!.raw;
    // 20件中4位: 100*(1-3/20)=85 / 9件中4位: 100*(1-3/9)≈66.67
    expect(score20).toBeCloseTo(85, 5);
    expect(score9).toBeCloseTo(66.6667, 3);
    expect(score20).not.toBeCloseTo(score9, 1);
  });

  it('取得件数0は棄権する（ゼロ除算回避）', () => {
    const game = makeGame({ steamRank: 1 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 0 });
    expect(result.axes.find((a) => a.axis === 'steam')).toBeUndefined();
  });

  it('steamRank が存在しなければ棄権する', () => {
    const game = makeGame({});
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.axes.find((a) => a.axis === 'steam')).toBeUndefined();
  });

  it('異常値（順位が取得件数を超える）でも 0〜100 にクランプされ負のスコアを出さない', () => {
    const game = makeGame({ steamRank: 999 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const steam = result.axes.find((a) => a.axis === 'steam');
    expect(steam!.raw).toBeGreaterThanOrEqual(0);
    expect(steam!.raw).toBeLessThanOrEqual(100);
    expect(steam!.raw).toBe(0);
  });
});

describe('computeNewReleaseScore - 国内販売軸(domestic)（§2.3 PR-B2）', () => {
  it('1位→100点、50位→2点、25位→52点（分母はAMAZON_RANKING_SLOT_COUNT=50固定。フィクスチャはリテラルで検証し定数は参照しない）', () => {
    const rank1 = makeGame({ title: 'Rank1' });
    const rank50 = makeGame({ title: 'Rank50' });
    const rank25 = makeGame({ title: 'Rank25' });

    const r1 = computeNewReleaseScore(rank1, { steamSlotCount: 20, amazonRank: 1 });
    const r50 = computeNewReleaseScore(rank50, { steamSlotCount: 20, amazonRank: 50 });
    const r25 = computeNewReleaseScore(rank25, { steamSlotCount: 20, amazonRank: 25 });

    expect(r1.axes.find((a) => a.axis === 'domestic')!.raw).toBeCloseTo(100, 5);
    expect(r50.axes.find((a) => a.axis === 'domestic')!.raw).toBeCloseTo(2, 5);
    expect(r25.axes.find((a) => a.axis === 'domestic')!.raw).toBeCloseTo(52, 5);
  });

  it('amazonRank 未指定なら domestic 軸は axes に含まれない（棄権であって0点ではない）。同じテスト内で、指定すれば含まれることも確認する', () => {
    const game = makeGame({ title: 'NoRank' });

    const withoutRank = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(withoutRank.axes.find((a) => a.axis === 'domestic')).toBeUndefined();

    const withRank = computeNewReleaseScore(game, { steamSlotCount: 20, amazonRank: 10 });
    expect(withRank.axes.find((a) => a.axis === 'domestic')).toBeDefined();
  });

  it('domestic だけが突出しているゲームで topAxis === "domestic" になる（4軸の最大値集約）', () => {
    // votes: rc=15（保有条件ちょうど）→ raw = 100*log10(15)/log10(500) ≈ 43.58
    // domestic: amazonRank=1 → raw = 100
    // 100 > 43.58 なので domestic が勝つ
    const game = makeGame({ title: 'DomesticDominant', igdbRatingCount: 15 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, amazonRank: 1 });
    expect(result.topAxis).toBe('domestic');
    expect(result.score).toBeCloseTo(100, 5);
  });

  it('NEWRELEASE_SCORE_WEIGHT_DOMESTIC=0 で domestic の weighted が 0 になる（Number(x)||default だと0が既定値に化けるバグの回帰防止）', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_DOMESTIC', '0');
    const game = makeGame({ title: 'ZeroWeight' });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, amazonRank: 1 });
    const domestic = result.axes.find((a) => a.axis === 'domestic');
    expect(domestic).toBeDefined();
    expect(domestic!.raw).toBeCloseTo(100, 5); // 素点自体は0のまま変わらない
    expect(domestic!.weighted).toBe(0); // 重みだけが0になる
  });
});

describe('sortByNewReleaseScore - amazonRanks', () => {
  it('amazonRanks を渡すと Amazon 上位のゲームが上に来る', () => {
    const top = makeGame({ title: 'AmazonTop' });
    const low = makeGame({ title: 'AmazonLow' });
    const none = makeGame({ title: 'NoAmazon' });

    const amazonRanks: AmazonRankIndex = {
      lookup: (g) => {
        if (g.title === 'AmazonTop') return 1;
        if (g.title === 'AmazonLow') return 50;
        return undefined;
      },
      size: 2,
    };

    const sorted = sortByNewReleaseScore([low, none, top], { steamSlotCount: 20, amazonRanks });
    expect(sorted.map((g) => g.title)).toEqual(['AmazonTop', 'AmazonLow', 'NoAmazon']);
  });
});

describe('computeNewReleaseScore - 集約は max（Σ ではない）', () => {
  it('2軸保有時に最大値が採られる（合計だと異なる値になるフィクスチャで検証）', () => {
    // critic: agg=84, n=4 → raw=84
    // votes: rc=500 → raw=100
    // max=100, sum=184, mean=92 いずれとも異なることを確認する
    const game = makeGame({
      aggregatedRating: 84,
      aggregatedRatingCount: 4,
      igdbRatingCount: 500,
    });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.score).toBeCloseTo(100, 5); // max
    expect(result.score).not.toBeCloseTo(184, 1); // sum ではない
    expect(result.score).not.toBeCloseTo(92, 1); // mean ではない
    expect(result.topAxis).toBe('votes');
  });
});

describe('computeNewReleaseScore - 棄権の扱い', () => {
  it('どの軸も保有しない候補は score=0 かつ axes が空配列・topAxis が undefined', () => {
    const game = makeGame({}); // 批評・票数・Steam いずれの保有条件も満たさない
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    expect(result.score).toBe(0);
    expect(result.axes).toEqual([]);
    expect(result.topAxis).toBeUndefined();
  });

  it('軸を1つ持っていてスコア0（重み0）の候補は「どの軸も保有しない」候補と区別できる', () => {
    const params: NewReleaseScoreParams = {
      weightCritic: 1.0,
      weightVotes: 1.0,
      weightSteam: 0, // Steam軸を無効化
      weightDomestic: 1.0,
      criticCountMin: 2,
      criticCountFull: 4,
      votesMin: 15,
      votesFull: 500,
    };
    const game = makeGame({ steamRank: 1 }); // Steam軸のみ保有
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, params });

    expect(result.score).toBe(0); // 重み0なのでスコアは0
    expect(result.axes).toHaveLength(1); // だが軸は保有している
    expect(result.axes[0].axis).toBe('steam');
    expect(result.axes[0].raw).toBeCloseTo(100, 5); // 素点は0ではない
    expect(result.axes[0].weighted).toBe(0);
    expect(result.topAxis).toBe('steam');

    // 比較対象: 本当にどの軸も保有しない候補
    const noAxisGame = makeGame({});
    const noAxisResult = computeNewReleaseScore(noAxisGame, { steamSlotCount: 20, params });
    expect(noAxisResult.axes).toEqual([]);
    expect(noAxisResult.topAxis).toBeUndefined();
  });
});

describe('computeNewReleaseScore - 重みパラメータ', () => {
  it('NEWRELEASE_SCORE_WEIGHT_VOTES=0.5 で票数軸の点が半分になる', () => {
    vi.stubEnv('NEWRELEASE_SCORE_WEIGHT_VOTES', '0.5');
    const game = makeGame({ igdbRatingCount: 500 }); // raw=100
    const result = computeNewReleaseScore(game, { steamSlotCount: 20 });
    const votes = result.axes.find((a) => a.axis === 'votes');
    expect(votes!.raw).toBeCloseTo(100, 5);
    expect(votes!.weighted).toBeCloseTo(50, 5);
  });
});

describe('sortByNewReleaseScore', () => {
  it('score 降順に並ぶこと', () => {
    const low = makeGame({ title: 'Low', igdbRatingCount: 15 }); // raw≈29.36
    const high = makeGame({ title: 'High', igdbRatingCount: 500 }); // raw=100
    const mid = makeGame({ title: 'Mid', steamRank: 10 }); // raw=100*(1-9/20)=55

    const sorted = sortByNewReleaseScore([low, high, mid], { steamSlotCount: 20 });

    expect(sorted.map((g) => g.title)).toEqual(['High', 'Mid', 'Low']);
  });

  it('同点のとき入力順が保たれる（安定ソート）', () => {
    const a = makeGame({ title: 'A', steamRank: 1 });
    const b = makeGame({ title: 'B', steamRank: 1 });
    const c = makeGame({ title: 'C', steamRank: 1 });

    const sorted = sortByNewReleaseScore([a, b, c], { steamSlotCount: 20 });

    expect(sorted.map((g) => g.title)).toEqual(['A', 'B', 'C']);
  });

  it('元の配列を変更しない（新しい配列を返す）', () => {
    const a = makeGame({ title: 'A', steamRank: 5 });
    const b = makeGame({ title: 'B', steamRank: 1 });
    const original = [a, b];

    const sorted = sortByNewReleaseScore(original, { steamSlotCount: 20 });

    expect(original.map((g) => g.title)).toEqual(['A', 'B']); // 元の順序は変わらない
    expect(sorted.map((g) => g.title)).toEqual(['B', 'A']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// votesFull / criticCountFull の安全ガード（修正4）
// NEWRELEASE_SCORE_VOTES_FULL / NEWRELEASE_SCORE_CRITIC_COUNT_FULL は Issue #210 で
// 運用中に調整されるノブのため、危険な値（<=1 / <=0）が入っても壊れないことを保証する。
// ─────────────────────────────────────────────────────────────────────────────
describe('computeNewReleaseScore - votesFull の安全ガード（修正4）', () => {
  const baseParams: NewReleaseScoreParams = {
    weightCritic: 1.0,
    weightVotes: 1.0,
    weightSteam: 1.0,
    weightDomestic: 1.0,
    criticCountMin: 2,
    criticCountFull: 4,
    votesMin: 15,
    votesFull: 500,
  };

  it('境界値: votesFull=1 のとき票数軸は棄権する（log10(1)=0 の0除算でInfinity→100に化ける回帰防止）', () => {
    const params: NewReleaseScoreParams = { ...baseParams, votesFull: 1 };
    const game = makeGame({ igdbRatingCount: 1000 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, params });
    expect(result.axes.find((a) => a.axis === 'votes')).toBeUndefined();
  });

  it('境界値: votesFull=2（1の直後）では棄権しない', () => {
    const params: NewReleaseScoreParams = { ...baseParams, votesFull: 2 };
    const game = makeGame({ igdbRatingCount: 1000 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, params });
    expect(result.axes.find((a) => a.axis === 'votes')).toBeDefined();
  });

  it('votesFull=0.5（1未満）でも棄権する（log10が負になり符号反転する回帰防止）', () => {
    const params: NewReleaseScoreParams = { ...baseParams, votesFull: 0.5 };
    const game = makeGame({ igdbRatingCount: 1000 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, params });
    expect(result.axes.find((a) => a.axis === 'votes')).toBeUndefined();
  });
});

describe('computeNewReleaseScore - criticCountFull の安全ガード（修正4）', () => {
  it('criticCountFull=0 のときスコアが Infinity/NaN/負にならない', () => {
    // criticCountMin も 0 にして保有条件ゲートを通過させ、0/0 の NaN 経路を露出させる
    const params: NewReleaseScoreParams = {
      weightCritic: 1.0,
      weightVotes: 1.0,
      weightSteam: 1.0,
      weightDomestic: 1.0,
      criticCountMin: 0,
      criticCountFull: 0,
      votesMin: 15,
      votesFull: 500,
    };
    const game = makeGame({ aggregatedRating: 50, aggregatedRatingCount: 0 });
    const result = computeNewReleaseScore(game, { steamSlotCount: 20, params });
    const critic = result.axes.find((a) => a.axis === 'critic');
    expect(critic).toBeDefined();
    expect(Number.isFinite(critic!.raw)).toBe(true);
    expect(critic!.raw).toBeGreaterThanOrEqual(0);
  });
});

describe('実データによる統合的なケース（2026-08-08 ライブ実測）', () => {
  it('4件の実測データが期待される並び順（ほの暮しの庭 > Palworld > ACBF Resynced > 007 First Light）になる', () => {
    // Steam Top Sellers 取得件数: 20件（実測）
    const steamSlotCount = 20;

    const palworld = makeGame({
      title: 'Palworld',
      igdbRatingCount: 260,
      igdbRating: 73.8,
      steamRank: 4,
      aggregatedRatingCount: 1, // 批評軸は棄権（<2）
    });
    // votes raw = 100*log10(260)/log10(500) ≈ 89.4776
    // steam raw = 100*(1-3/20) = 85
    // → score ≈ 89.4776 (votes)

    const acbfResynced = makeGame({
      title: "Assassin's Creed Black Flag Resynced",
      aggregatedRating: 84,
      aggregatedRatingCount: 4,
      igdbRatingCount: 25,
      gameType: 8,
    });
    // critic raw = 84 * min(1, 4/4) = 84
    // votes raw = 100*log10(25)/log10(500) ≈ 51.795
    // → score = 84 (critic)

    const firstLight = makeGame({
      title: '007 First Light',
      aggregatedRating: 81.67,
      aggregatedRatingCount: 6,
      igdbRatingCount: 151,
    });
    // critic raw = 81.67 * min(1, 6/4=1.5→1) = 81.67
    // votes raw = 100*log10(151)/log10(500) ≈ 80.734
    // → score = 81.67 (critic)

    const honogurashi = makeGame({
      title: 'ほの暮しの庭',
      steamRank: 1,
      // IGDB 指標なし → critic/votes は棄権
    });
    // steam raw = 100*(1-0/20) = 100
    // → score = 100 (steam)

    const sorted = sortByNewReleaseScore(
      [palworld, acbfResynced, firstLight, honogurashi],
      { steamSlotCount }
    );

    expect(sorted.map((g) => g.title)).toEqual([
      'ほの暮しの庭',
      'Palworld',
      "Assassin's Creed Black Flag Resynced",
      '007 First Light',
    ]);
  });
});
