/**
 * 新作枠の3軸スコア（N-6 決着・§2.3）
 *
 * score(g) = max over axes a of ( w_a × f_a(g) )
 *
 * 軸:
 *   - 批評 (critic): aggregatedRatingCount >= criticCountMin を保有条件とし、
 *     aggregatedRating × min(1, aggregatedRatingCount / criticCountFull) を素点とする
 *   - ユーザー票数 (votes): igdbRatingCount >= votesMin を保有条件とし、
 *     min(100, 100 × log10(rc) / log10(votesFull)) を素点とする
 *   - Steam (steam): steamRank が存在することを保有条件とし、
 *     100 × (1 - (順位 - 1) / steamSlotCount) を 0〜100 にクランプした値を素点とする
 *
 * 保有しない軸は「棄権」であって 0 点ではない。集約対象から除外する（0 点として
 * max に混ぜない）。集約は Σ ではなく max を採る（Σ は「どの軸も凡庸だが軸を
 * 多く持っているだけのタイトル」を押し上げるため。11.4.9 の実測）。
 *
 * 第4軸（国内販売・ファミ通経由 Amazon ランキング）は PR-B2 の担当。本モジュールでは
 * 実装しない（3軸版）。
 *
 * 票数軸の 100 点クリップは必須: 対数式は 500 票超で 100 を超え
 * （1,000票で約111、5,000票で約137）、最大値集約のもとでこの軸だけが
 * 突き抜けて常に勝つ構造になるため（§2.3 に明記された理由）。
 */

import type { GameData } from './types.js';

export interface NewReleaseScoreParams {
  /** 批評軸の重み */
  weightCritic: number;
  /** ユーザー票数軸の重み */
  weightVotes: number;
  /** Steam 軸の重み */
  weightSteam: number;
  /** 批評軸の保有条件（媒体数） */
  criticCountMin: number;
  /** 批評軸が満点になる媒体数 */
  criticCountFull: number;
  /** 票数軸の保有条件 */
  votesMin: number;
  /** 票数軸が満点になる票数 */
  votesFull: number;
}

const DEFAULT_PARAMS: NewReleaseScoreParams = {
  weightCritic: 1.0,
  weightVotes: 1.0,
  weightSteam: 1.0,
  criticCountMin: 2,
  criticCountFull: 4,
  votesMin: 15,
  votesFull: 500,
};

/**
 * 環境変数を数値として読む。未設定・空文字・数値でない場合のみ既定値にフォールバックする。
 *
 * 注意: `Number(process.env.X) || defaultValue` という書き方はしないこと。
 * 重み 0（＝軸を無効化する）が既定値に化けてしまう（`0 || default` は default になる）。
 * `Number.isFinite` で明示的に判定する。
 */
function readNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

/**
 * 環境変数からスコアパラメータを読み込む。
 *
 * モジュール読み込み時ではなく、呼び出し時に process.env を読む。
 * 理由: 本モジュールのパラメータは運用実績での再調整対象（Issue #210）であり、
 * テストから `vi.stubEnv` で差し替えて検証できる必要があるため。
 * （対照: `select-indie-with-fallback.ts` は読み込み時に読んでいるが、
 * 　そちらは再調整対象ではないため許容している）
 */
export function loadNewReleaseScoreParams(): NewReleaseScoreParams {
  return {
    weightCritic: readNumberEnv('NEWRELEASE_SCORE_WEIGHT_CRITIC', DEFAULT_PARAMS.weightCritic),
    weightVotes: readNumberEnv('NEWRELEASE_SCORE_WEIGHT_VOTES', DEFAULT_PARAMS.weightVotes),
    weightSteam: readNumberEnv('NEWRELEASE_SCORE_WEIGHT_STEAM', DEFAULT_PARAMS.weightSteam),
    criticCountMin: readNumberEnv('NEWRELEASE_SCORE_CRITIC_COUNT_MIN', DEFAULT_PARAMS.criticCountMin),
    criticCountFull: readNumberEnv('NEWRELEASE_SCORE_CRITIC_COUNT_FULL', DEFAULT_PARAMS.criticCountFull),
    votesMin: readNumberEnv('NEWRELEASE_SCORE_VOTES_MIN', DEFAULT_PARAMS.votesMin),
    votesFull: readNumberEnv('NEWRELEASE_SCORE_VOTES_FULL', DEFAULT_PARAMS.votesFull),
  };
}

export interface NewReleaseScoreAxis {
  axis: 'critic' | 'votes' | 'steam';
  /** 重み適用前の 0〜100 の素点 */
  raw: number;
  /** 重み適用後の点数 */
  weighted: number;
}

export interface NewReleaseScore {
  /** 保有軸の weighted の最大値。保有軸が無ければ 0 */
  score: number;
  /** 保有している軸だけが入る（棄権した軸は含まない） */
  axes: NewReleaseScoreAxis[];
  /** score を決めた軸。保有軸が無ければ undefined */
  topAxis?: 'critic' | 'votes' | 'steam';
}

/**
 * 批評軸の素点を計算する。保有条件を満たさなければ undefined（棄権）。
 */
function computeCriticAxis(game: GameData, params: NewReleaseScoreParams): number | undefined {
  if (game.aggregatedRating === undefined) return undefined;
  if (game.aggregatedRatingCount === undefined) return undefined;
  if (game.aggregatedRatingCount < params.criticCountMin) return undefined;

  const coverage = Math.min(1, game.aggregatedRatingCount / params.criticCountFull);
  return game.aggregatedRating * coverage;
}

/**
 * ユーザー票数軸の素点を計算する。保有条件を満たさなければ undefined（棄権）。
 */
function computeVotesAxis(game: GameData, params: NewReleaseScoreParams): number | undefined {
  if (game.igdbRatingCount === undefined) return undefined;
  if (game.igdbRatingCount < params.votesMin) return undefined;

  const raw = (100 * Math.log10(game.igdbRatingCount)) / Math.log10(params.votesFull);
  return Math.min(100, raw);
}

/**
 * Steam 軸の素点を計算する。保有条件を満たさなければ undefined（棄権）。
 * ゼロ除算回避のため steamSlotCount <= 0 は棄権。異常値でも 0〜100 にクランプする。
 */
function computeSteamAxis(
  game: GameData,
  steamSlotCount: number
): number | undefined {
  if (game.steamRank === undefined) return undefined;
  if (steamSlotCount <= 0) return undefined;

  const raw = 100 * (1 - (game.steamRank - 1) / steamSlotCount);
  return Math.min(100, Math.max(0, raw));
}

/**
 * ゲーム1件の3軸スコアを計算する。
 */
export function computeNewReleaseScore(
  game: GameData,
  options: { steamSlotCount: number; params?: NewReleaseScoreParams }
): NewReleaseScore {
  const params = options.params ?? loadNewReleaseScoreParams();
  const axes: NewReleaseScoreAxis[] = [];

  const criticRaw = computeCriticAxis(game, params);
  if (criticRaw !== undefined) {
    axes.push({ axis: 'critic', raw: criticRaw, weighted: criticRaw * params.weightCritic });
  }

  const votesRaw = computeVotesAxis(game, params);
  if (votesRaw !== undefined) {
    axes.push({ axis: 'votes', raw: votesRaw, weighted: votesRaw * params.weightVotes });
  }

  const steamRaw = computeSteamAxis(game, options.steamSlotCount);
  if (steamRaw !== undefined) {
    axes.push({ axis: 'steam', raw: steamRaw, weighted: steamRaw * params.weightSteam });
  }

  if (axes.length === 0) {
    return { score: 0, axes: [], topAxis: undefined };
  }

  const top = axes.reduce((best, cur) => (cur.weighted > best.weighted ? cur : best));
  return { score: top.weighted, axes, topAxis: top.axis };
}

/**
 * score 降順に並べ替えた新しい配列を返す。同点は入力順を保つ（安定ソート）。
 */
export function sortByNewReleaseScore(
  games: GameData[],
  options: { steamSlotCount: number; params?: NewReleaseScoreParams }
): GameData[] {
  const params = options.params ?? loadNewReleaseScoreParams();
  const scored = games.map((game) => ({
    game,
    score: computeNewReleaseScore(game, { steamSlotCount: options.steamSlotCount, params }).score,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.game);
}
