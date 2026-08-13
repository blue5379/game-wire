/**
 * JST（日本時間、UTC+9）のカレンダー日付計算を一元化するモジュール。
 *
 * ## 背景
 *
 * 発売済み/未発売の境界判定を JST 基準で行うため、以下を提供する:
 * - `getJstDateString`: Date を JST のカレンダー日付（YYYY-MM-DD）に変換
 * - `getJstDayStartUnixSec`: JST 当日 0 時の Unix 秒を算出（fetch-igdb.ts から移設）
 *
 * ## なぜ JST カレンダー日付での文字列比較なのか
 *
 * `publishDate` に時刻が含まれていても JST カレンダー日付に落とすことで、
 * 「JST では未発売だが UTC では発売済み」という9時間の穴が構造的に生じなくなる。
 *
 * 例: `releaseDate = '2026-08-15'`, `publishDate = new Date('2026-08-15T00:00:00+09:00')`
 *     （JST 8/15 0:00 = UTC 8/14 15:00）
 *
 * UTC 0時としてパースして数値比較すると:
 * - `new Date('2026-08-15').getTime()` は UTC 8/15 0:00 のミリ秒
 * - `publishDate.getTime()` は UTC 8/14 15:00 のミリ秒
 * - releaseTime > publishDate となり「発売予定」と誤判定される
 *
 * JST カレンダー日付で比較すると:
 * - `releaseDate` = '2026-08-15'
 * - `getJstDateString(publishDate)` = '2026-08-15'
 * - 一致するため「本日発売」と正しく判定される
 *
 * 参照: `docs/article-category-spec.md` § 2.8
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Date を JST のカレンダー日付（YYYY-MM-DD）に変換する。
 *
 * @param d - 変換する Date オブジェクト
 * @returns JST のカレンダー日付（YYYY-MM-DD）。Invalid Date の場合は空文字列
 *
 * @example
 * ```ts
 * const d = new Date('2026-08-14T15:00:00Z'); // JST 8/15 0:00:00
 * getJstDateString(d); // => '2026-08-15'
 * ```
 */
export function getJstDateString(d: Date): string {
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * JST（日本時間）当日 0 時の Unix 秒を算出する（§11.1 確定事項 #6）。
 *
 * 発売済み／未発売の境界として使う純関数。`now` を引数で注入できるようにし、
 * テストで日境界をまたぐ挙動を検証できるようにする（既定値は `new Date()`）。
 *
 * 算出式は `docs/article-category-spec-review.md` §11.1 確定事項 #6 で確定済み:
 * `Math.floor((nowSec + 9*3600) / 86400) * 86400 - 9*3600`
 *
 * @param now - 基準とする日時（既定値: 現在時刻）
 * @returns JST 当日 0 時の Unix 秒
 *
 * @example
 * ```ts
 * const now = new Date('2026-08-15T00:00:00+09:00'); // JST 8/15 0:00
 * getJstDayStartUnixSec(now); // => 1786881600（JST 8/15 0:00 = UTC 8/14 15:00）
 * ```
 */
export function getJstDayStartUnixSec(now: Date = new Date()): number {
  const nowSec = Math.floor(now.getTime() / 1000);
  const JST_OFFSET_SEC = 9 * 3600;
  return Math.floor((nowSec + JST_OFFSET_SEC) / 86400) * 86400 - JST_OFFSET_SEC;
}
