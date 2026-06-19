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

/**
 * ゲームが品質基準を満たすかを判定する。
 * 複数の経路でいずれか1つを満たせば qualified とする（OR判定）。
 * 評価数が少なく信頼性の低いタイトル（ファンゲーム等）を除外するために使用。
 */
export function isQualifiedGame(g: GameData): boolean {
  if (g.igdbRatingCount != null && g.igdbRatingCount >= QUALITY_IGDB_RC_MIN) return true;
  // Steam Charts 掲載ゲームはチャート存在自体を品質シグナルとして扱う
  if (g.steamRank != null) return true;
  if (g.steamPlayers != null && g.steamPlayers > 0) return true;
  if (g.metascore != null) return true;
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

/**
 * ファンゲーム・非公式作品かどうかを判定する。
 * タイトルの word-boundary マッチと IGDB ジャンルタグで検出する。
 * summary は誤検知リスクが高いため対象外。
 */
export function isFanGame(g: GameData): boolean {
  if (FAN_GAME_TITLE_PATTERN.test(g.title)) return true;
  if (g.genres?.some((genre) => FAN_GAME_GENRES.includes(genre.toLowerCase()))) return true;
  return false;
}
