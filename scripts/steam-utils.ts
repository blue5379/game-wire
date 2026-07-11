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

/** 法人接尾辞として除去するトークン（小文字） */
const LEGAL_SUFFIX_TOKENS = new Set([
  'co', 'ltd', 'inc', 'llc', 'corp', 'corporation', 'company',
  'kk', 'gk', 'gmbh', 'ag', 'sa', 'srl', 'plc',
  '株式会社', '有限会社', '合同会社',
]);

/** 汎用語として除去するトークン（小文字） */
const GENERIC_TOKENS = new Set([
  'game', 'games', 'studio', 'studios', 'entertainment', 'interactive',
  'digital', 'software', 'development', 'division', 'team', 'works',
  'publishing', 'publisher', 'media',
]);

/**
 * 会社名をトークンベースで正規化し、意味のあるトークン集合を返す内部関数。
 * undefined は「有効トークンゼロ」を示す。
 */
function tokenizeCompanyName(s: string): string[] | undefined {
  // NFKC 正規化 → 小文字化 → 記号（& 含む）を空白化
  const normalized = s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[&:;'",.\-_!?()[\]【】「」『』™®©]/g, ' ');

  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length > 0)
    // 法人接尾辞・汎用語・純数字を除去
    .filter((t) => !LEGAL_SUFFIX_TOKENS.has(t) && !GENERIC_TOKENS.has(t) && !/^\d+$/.test(t));

  return tokens.length > 0 ? tokens : undefined;
}

/**
 * 2つの会社名がトークンレベルで重なるかを判定する（Issue #179 PR-1）。
 *
 * 正規化後の相互包含（連結文字列）または、長さ3文字以上（CJK は2文字以上）の
 * 共通トークンが1つ以上あれば true。
 *
 * 返り値:
 * - true: 重なりあり（同一会社の可能性が高い）
 * - false: 重なりなし（別会社と判断）
 * - undefined: どちらかの正規化後トークンがゼロ（判定不能）
 *
 * 設計上、過剰一致（FP）は安全側に倒す:
 * company 軸は「破壊的アクションを止める」方向にしか使われないため、
 * 過剰一致は「破壊しない」方向に働き、安全。
 */
export function companyNamesOverlap(a: string, b: string): boolean | undefined {
  const tokA = tokenizeCompanyName(a);
  const tokB = tokenizeCompanyName(b);

  if (!tokA || !tokB) return undefined;

  const joinA = tokA.join('');
  const joinB = tokB.join('');

  // 連結文字列の相互包含
  if (joinA.includes(joinB) || joinB.includes(joinA)) return true;

  // 共通トークン（長さ3以上 or CJK2以上）が1つ以上
  const setB = new Set(tokB);
  for (const t of tokA) {
    if (!setB.has(t)) continue;
    // CJK 文字を含むトークンは2文字以上、その他は3文字以上
    const isCjk = /[　-鿿豈-﫿]/.test(t);
    if ((isCjk && t.length >= 2) || (!isCjk && t.length >= 3)) return true;
  }

  return false;
}
