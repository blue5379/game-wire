/**
 * ゲームタイトル正規化ユーティリティ
 *
 * 比較・履歴・クールダウン・除外リストなど、文字列キーとしてタイトルを使う
 * すべての箇所で同一の正規化結果を保証するための共有実装。
 *
 * resolvers/match.ts の normalizeTitle はストア突合用途で別仕様（句読点全般を削除する等）。
 * 用途が異なるためそちらは統合対象外。
 */

/**
 * タイトルを正規化（比較用）
 *
 * - 小文字化
 * - 全角/半角コロン、各種ハイフン（-, –, —）を半角スペースに変換
 * - 商標記号（™®©）を除去
 * - 連続空白を1つに圧縮し前後をトリム
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[：:]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
