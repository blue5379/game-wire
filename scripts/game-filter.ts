/**
 * ゲーム品質フィルタ共通モジュール
 * fetch-data.ts（インディー選出）と generate-articles.ts（特集記事選出）双方で使用する。
 */

import type { GameData } from './types.js';

// IGDB評価数の最低ライン（品質フィルタ）
export const QUALITY_IGDB_RC_MIN = 15;
// 高評価少数票の救済しきい値（評価が非常に高い場合の評価数下限緩和）
export const QUALITY_IGDB_RATING_STRONG = 85;
// 救済経路での最低評価数
export const QUALITY_IGDB_RC_FLOOR = 8;
/** 批評軸の保有条件（§2.3「批評媒体数が2以上」）。newrelease-score の criticCountMin と同値だが、
 *  こちらは品質ゲート、あちらはスコア軸の保有条件で用途が異なるため独立に定義する */
export const QUALITY_CRITIC_COUNT_MIN = 2;

/**
 * ゲームが品質基準を満たすかを判定する。
 * 複数の経路でいずれか1つを満たせば qualified とする（OR判定）。
 * 評価数が少なく信頼性の低いタイトル（ファンゲーム等）を除外するために使用。
 *
 * §2.3 の品質条件（4つ）との対応:
 *   1. 批評媒体数が2以上       → aggregatedRatingCount >= QUALITY_CRITIC_COUNT_MIN
 *   2. IGDBユーザー投票数が15以上 → igdbRatingCount >= QUALITY_IGDB_RC_MIN
 *   3. Steam Top Sellers 掲載   → steamRank != null
 *   4. Amazon国内ランキング掲載 → options.amazonRanked（AmazonRankIndex の lookup 結果、§2.3 PR-B2）
 *
 * 以下の経路は §2.3 に直接の規定は無いが、投票数条件（上記2.）の閾値緩和版という
 * 位置づけで維持する（管理者判断・ユーザー確認済み。実データで高評価少数票タイトルを
 * 正しく救済していることを確認済み）:
 *   - igdbRating >= QUALITY_IGDB_RATING_STRONG && igdbRatingCount >= QUALITY_IGDB_RC_FLOOR の救済経路
 *
 * options 省略時は Amazon 経路が無効になるだけで、既存呼び出し元の挙動は変わらない。
 */
export function isQualifiedGame(
  g: GameData,
  options?: { amazonRanked?: boolean }
): boolean {
  if (options?.amazonRanked) return true;
  if (g.aggregatedRatingCount != null && g.aggregatedRatingCount >= QUALITY_CRITIC_COUNT_MIN) return true;
  if (g.igdbRatingCount != null && g.igdbRatingCount >= QUALITY_IGDB_RC_MIN) return true;
  // Steam Charts 掲載ゲームはチャート存在自体を品質シグナルとして扱う
  if (g.steamRank != null) return true;
  if (
    g.igdbRating != null && g.igdbRating >= QUALITY_IGDB_RATING_STRONG &&
    g.igdbRatingCount != null && g.igdbRatingCount >= QUALITY_IGDB_RC_FLOOR
  ) return true;
  return false;
}

// ファンゲーム・非公式作品を示すタイトルキーワード（word-boundary マッチ）
// \b を使うことで "fantasy"/"unofficially" などの部分一致を防ぐ
const FAN_GAME_TITLE_PATTERN = /\b(fan\s*game|fangame|fan-game|unofficial|non-official)\b/i;

// ファンゲーム・非公式作品を示すジャンルタグ（IGDB）
const FAN_GAME_GENRES = ['fan game', 'fangame'];

// ファンゲーム・非公式作品を示す IGDB キーワード slug（完全一致で判定）
// 部分一致（includes等）にすると "fan-translation"（有志翻訳がある公式ゲーム）・
// "fanservice" / "fan-service" / "fanfiction" などの実在タグを誤ってファンゲーム扱いする
// （実測: IGDB キーワード語彙に多数存在）ため、完全一致（Set.has）のみで判定する。
const FAN_GAME_KEYWORD_SLUGS = new Set(['unofficial', 'fangame', 'fanmade']);

/**
 * ファンゲーム・非公式作品かどうかを判定する。
 * タイトルの word-boundary マッチ、IGDB ジャンルタグ、IGDB キーワード slug（完全一致）で検出する。
 * summary は誤検知リスクが高いため対象外。
 */
export function isFanGame(g: GameData): boolean {
  if (FAN_GAME_TITLE_PATTERN.test(g.title)) return true;
  if (g.genres?.some((genre) => FAN_GAME_GENRES.includes(genre.toLowerCase()))) return true;
  if (g.keywords?.some((slug) => FAN_GAME_KEYWORD_SLUGS.has(slug.toLowerCase()))) return true;
  return false;
}
