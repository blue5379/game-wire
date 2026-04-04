/**
 * 成人向けゲームのブロックリスト
 * 自動フィルタ（IGDB themes / Steam content_descriptors / AI スクリーニング）を
 * すり抜けた既知の成人向けゲームを手動で除外するための補助リスト。
 *
 * 追加方法: 正規化済みタイトル（小文字・トリム）を BLOCKED_TITLES に追記する。
 */

const BLOCKED_TITLES: string[] = [
  'my ghost roommate',
];

/**
 * ゲームタイトルがブロックリストに含まれるか判定する。
 * 正規化（小文字化・前後トリム）した上で部分一致を検索する。
 */
export function isBlockedAdultGame(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return BLOCKED_TITLES.some((blocked) => normalized.includes(blocked));
}
