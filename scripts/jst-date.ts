/**
 * JST（日本時間、UTC+9）のカレンダー日付計算を一元化するモジュール。
 *
 * ## 背景
 *
 * 発売済み/未発売の境界判定を JST 基準で行うため、以下を提供する:
 * - `getJstDateString`: Date を JST のカレンダー日付（YYYY-MM-DD）に変換
 * - `getJstDayStartUnixSec`: JST 当日 0 時の Unix 秒を算出（fetch-igdb.ts から移設）
 * - `resolvePublishDateString`: 号の発行日（YYYY-MM-DD）を JST 基準で決定（§9.3-2 / Issue #308）
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

/** 発行日として受け付ける形式（ゼロ埋めされた YYYY-MM-DD のみ） */
const PUBLISH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 号の発行日（`YYYY-MM-DD`）を JST 基準で決定する（§9.3-2 / Issue #308）。
 *
 * ## なぜ JST で決める必要があるのか
 *
 * cron は `0 21 * * 5`（金曜 UTC 21:00 = 土曜 JST 6:00）で正しいが、`PUBLISH_DATE` は
 * `workflow_dispatch` の `inputs.publish_date` にしか渡っていないため schedule 実行では空になる。
 * 従来の `new Date().toISOString().split('T')[0]` は **UTC 基準**なのでこのとき金曜を返しており、
 * 実測で公開 19 号のうち 13 号の発行日が土曜ではなく金曜になっていた。
 *
 * 発行日は表示だけの値ではなく、特集のイベント探索窓（`getEventsInRange(publishDate, 7)`）の
 * 基準日でもあるため、1 日ずれると拾う記念日が変わる。
 *
 * ## 戻り値が時刻を含まない理由（PR-C が依存する不変条件）
 *
 * 呼び出し側は戻り値を `new Date(str)` に通す。`YYYY-MM-DD` は **UTC 0 時**としてパースされ、
 * PR-C（#309）の `getReleaseStatus` はその Date を `getJstDateString` で JST カレンダー日付に
 * 落として発売日と比較する。時刻付きの値を返すとこの前提が崩れるため、日付のみを返す。
 *
 * @param envValue - `process.env.PUBLISH_DATE` の値。空文字列・空白のみ・undefined は未指定として扱う
 * @param now - 未指定時の基準となる現在時刻（既定値: 現在時刻）。テストで日境界を検証するために注入する
 * @returns 発行日（`YYYY-MM-DD`）。`envValue` があればそれを、無ければ `now` の JST カレンダー日付
 * @throws `envValue` が `YYYY-MM-DD` 形式でない、または存在しない日付の場合
 *
 * @example
 * ```ts
 * // schedule 実行（cron 発火時刻）
 * resolvePublishDateString(undefined, new Date('2026-08-14T21:00:00Z')); // => '2026-08-15'（土）
 * // workflow_dispatch で明示指定
 * resolvePublishDateString('2026-06-19'); // => '2026-06-19'
 * ```
 */
export function resolvePublishDateString(
  envValue: string | undefined,
  now: Date = new Date()
): string {
  const explicit = envValue?.trim();
  if (!explicit) {
    // getJstDateString は Invalid Date に空文字列を返すため、そのまま返すと
    // 「YYYY-MM-DD を返す」という契約が破れる（呼び出し側の new Date('') が Invalid Date になる）
    const jstToday = getJstDateString(now);
    if (!jstToday) throw new Error('発行日の基準時刻が不正です（Invalid Date）');
    return jstToday;
  }

  if (!PUBLISH_DATE_PATTERN.test(explicit)) {
    throw new Error(
      `PUBLISH_DATE は YYYY-MM-DD 形式で指定してください（受け取った値: "${envValue}"）`
    );
  }

  // 形式が合っていても存在しない日付（2026-02-30 等）は弾く。ISO 8601 の date-time は
  // 範囲外の日を Invalid Date にするため、UTC 0 時としてパースして往復比較すれば検出できる。
  // ここで落とさないと build-issue.ts の format() が Invalid Date で落ち、
  // Bedrock の生成コストを払い切った後に失敗する。
  const parsed = new Date(`${explicit}T00:00:00Z`);
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== explicit) {
    throw new Error(`PUBLISH_DATE に存在しない日付が指定されています（受け取った値: "${envValue}"）`);
  }

  return explicit;
}
