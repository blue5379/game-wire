/**
 * Steam 関連のユーティリティ関数（fetch-data.ts から切り出し）
 * テスト時に fetch-data.ts の main() 実行を避けるために独立させている
 */

/**
 * Steam Storefront `release_date.date`（"2026年6月9日" など）を YYYY-MM-DD に正規化。
 * 想定外フォーマットは undefined を返す。
 */
export function parseSteamReleaseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!m) return undefined;
  const yyyy = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 会社名・ゲーム名を比較用に正規化する（記号・空白・大小文字を吸収）。
 * isSameSteamApp（fetch-steam.ts）と validate-article.ts の開発元照合で共用する。
 */
export function normalizeCompanyName(s: string): string {
  return s.toLowerCase().replace(/[\s　™®©:;'",.\-_!?()[\]【】「」『』]/g, '');
}

/**
 * Steam Storefront の developers/publishers の文字列が、
 * 開発者/発行者として表示すべき正式名称か判定する品質ガード。
 *
 * `lemorion_1224` のような Steam アカウント名そのままを除外するため、
 * 「英数字とアンダースコアのみで20文字未満」を不採用とする。
 */
export function isQualifiedCompanyName(name: string): boolean {
  if (!name) return false;
  const looksLikeAccountName = /^[a-z0-9_]+$/i.test(name) && name.length < 20;
  return !looksLikeAccountName;
}
