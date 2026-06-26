/**
 * 共通名前突合ユーティリティ
 *
 * 設計書 B. Game Identity Resolver > scripts/resolvers/match.ts
 * 正規化後完全一致 OR 年差±2年以内のプレフィックス一致でゲームの同一性を判定する
 */

/**
 * タイトルを突合用に正規化する
 * - 記号（™®©など）を除去
 * - &amp; → & 変換
 * - 大文字→小文字
 * - 記号・句読点を除去（コロン、ハイフン等）
 * - 連続空白を単一スペースに圧縮
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/[:\-–—_]/g, ' ')
    // \p{L}=文字 \p{N}=数字 \s=空白 &=記号タイトル保持（S&box など）
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * リリース年を文字列から抽出する。
 * - ISO 先頭: "YYYY-MM-DD" / "YYYY"
 * - Steam appdetails 形式: "Nov 1, 2023" / "1 Nov, 2023"（年が末尾）
 */
function extractYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  // ISO / 先頭4桁
  let m = dateStr.match(/^(\d{4})/);
  if (m) return parseInt(m[1], 10);
  // Steam appdetails locale 形式（年が末尾）
  m = dateStr.match(/(\d{4})$/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

/**
 * 2つのタイトルが「同じゲーム」と見なせるか判定する
 *
 * 一致条件:
 * 1. 正規化後に完全一致
 * 2. 一方が他方のプレフィックスであり、年差が±2以内（またはどちらかが undefined）
 *
 * @param queryTitle    検索クエリのタイトル（複数可: 英名・日本語名）
 * @param candidateTitle ストア側のタイトル
 * @param queryDate     クエリ側のリリース日（YYYY or YYYY-MM-DD）
 * @param candidateDate  ストア側のリリース日
 * @param strict        true のとき完全一致のみ許容（プレフィックス一致を禁止）
 */
export function isSameGame(
  queryTitle: string,
  candidateTitle: string,
  queryDate?: string,
  candidateDate?: string,
  strict = false,
): boolean {
  const qNorm = normalizeTitle(queryTitle);
  const cNorm = normalizeTitle(candidateTitle);

  if (!qNorm || !cNorm) return false;

  if (strict) {
    return qNorm === cNorm;
  }

  // プレフィックス一致（完全一致を含む）
  const isPrefixMatch = qNorm === cNorm || cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm);
  if (!isPrefixMatch) return false;

  // 年差チェック（どちらかが不明な場合はタイトル一致だけで OK）
  const qYear = extractYear(queryDate);
  const cYear = extractYear(candidateDate);
  if (qYear === undefined || cYear === undefined) return true;

  return Math.abs(qYear - cYear) <= 2;
}

/**
 * 複数の候補タイトルリストに対して、いずれかのクエリタイトルが isSameGame を通るか確認
 *
 * @param queryTitles    検索クエリのタイトル群（英名・日本語名など複数を渡せる）
 * @param candidateTitle ストア側のタイトル
 * @param queryDate      クエリ側のリリース日
 * @param candidateDate  ストア側のリリース日
 * @param strict         true のとき完全一致のみ許容
 */
export function matchesAnyTitle(
  queryTitles: string[],
  candidateTitle: string,
  queryDate?: string,
  candidateDate?: string,
  strict = false,
): boolean {
  return queryTitles.some((qt) => isSameGame(qt, candidateTitle, queryDate, candidateDate, strict));
}
