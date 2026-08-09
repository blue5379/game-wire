/**
 * 名作枠（classic）母集団のしきい値判定を一元化するモジュール（§5.4 決着）。
 *
 * `fetch-igdb.ts`（母集団クエリ側）と `fetch-data.ts`（選定側）の両方から使うため、
 * どちらにも依存しない純粋なモジュールにする（数値を受け取る純関数と定数のみ。
 * `GameData` や IGDB 生型には依存しない）。
 */

/** 総合評価（total_rating）の下限（§5.4）。85 未満は母集団に含めない */
export const DEFAULT_CLASSIC_TOTAL_RATING_MIN = 85;

/** 評価母数（total_rating_count）の下限（§5.4）。200 未満は母集団に含めない */
export const DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN = 200;

/**
 * 環境変数を数値として読む共通ヘルパ。未設定・空文字・数値でない場合のみ既定値にフォールバックする。
 *
 * 注意: `Number(raw) || defaultValue` という書き方はしないこと。
 * `0` が既定値に化けてしまう（`0 || default` は default になる）。
 * `Number.isFinite` で明示的に判定する
 * （fetch-data.ts の readIndieReleaseWindowDays と同じ方針）。
 */
function readEnvNumber(envVarName: string, defaultValue: number): number {
  const raw = process.env[envVarName];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

/**
 * 名作枠の総合評価下限を読む（環境変数 `CLASSIC_TOTAL_RATING_MIN` で上書き可能）。
 * 呼び出し時（モジュール読み込み時ではない）に process.env を読むため、
 * `vi.stubEnv` でテストから差し替えて検証できる。
 */
export function readClassicTotalRatingMin(): number {
  return readEnvNumber('CLASSIC_TOTAL_RATING_MIN', DEFAULT_CLASSIC_TOTAL_RATING_MIN);
}

/**
 * 名作枠の評価母数下限を読む（環境変数 `CLASSIC_TOTAL_RATING_COUNT_MIN` で上書き可能）。
 * 呼び出し時（モジュール読み込み時ではない）に process.env を読むため、
 * `vi.stubEnv` でテストから差し替えて検証できる。
 */
export function readClassicTotalRatingCountMin(): number {
  return readEnvNumber('CLASSIC_TOTAL_RATING_COUNT_MIN', DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN);
}

/**
 * 名作枠の母集団条件（§5.4）を判定する: `total_rating >= 閾値 & total_rating_count >= 閾値`。
 *
 * 両方が定義済みかつ閾値以上のときのみ true。どちらか一方でも `undefined` なら false
 * （評価が定着しているかを確認できないタイトルは母集団に含めない）。
 */
export function meetsClassicPoolThresholds(
  totalRating: number | undefined,
  totalRatingCount: number | undefined
): boolean {
  if (totalRating === undefined || totalRatingCount === undefined) return false;
  return totalRating >= readClassicTotalRatingMin() && totalRatingCount >= readClassicTotalRatingCountMin();
}
