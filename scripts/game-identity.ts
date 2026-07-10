/**
 * ゲーム同一性判定モジュール
 *
 * 「この2つのレコードは同じゲームを指すか」に答える実装を、プロジェクトで唯一ここに置く。
 *
 * 旧実装は fetch-data.ts（titleMatches / isSameGame: 集約用・年差±3）と
 * resolvers/match.ts（isSameGame: ストア突合用・年差±2）に分散しており、
 * 正規化ルール・年許容差が独立に変更されてズレる問題があった（Issue #166 系の再発要因）。
 * 用途ごとの判定基準の違いは廃止せず、MATCH_PROFILES として1箇所に並べて明示する。
 *
 * 【依存方向の制約】
 * このモジュールは resolvers/* と identity-resolver.ts の両方から import される葉モジュール。
 * resolver / identity-resolver / fetch-data を import してはならない（循環参照防止）。
 *
 * 【normalize.ts との関係】
 * normalize.ts の normalizeTitle は履歴・クールダウン・除外リストの「永続キー」用であり、
 * history.json に保存済みのキーとの互換性を壊せないため統合対象外（#87/#88 の決定を踏襲）。
 * 本モジュールの normalizeTitleForMatch は「突合」専用で、句読点を広く除去するより強い正規化。
 */

import { normalizeTitle as normalizeTitleForKey } from './normalize.js';

/**
 * タイトルを突合用に正規化する（旧 resolvers/match.ts の normalizeTitle）
 * - 記号（™®©など）を除去
 * - &amp; → & 変換
 * - 大文字→小文字
 * - 記号・句読点を除去（コロン、ハイフン等）
 * - 連続空白を単一スペースに圧縮
 */
export function normalizeTitleForMatch(title: string): string {
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
 * リリース日文字列から年(YYYY)を抽出する。失敗時 undefined。
 * - ISO 先頭: "YYYY-MM-DD" / "YYYY"
 * - Steam appdetails 形式: "Nov 1, 2023" / "1 Nov, 2023"（年が末尾）
 * - その他: 文字列中の最初の4桁数字（"Coming 2025 (Early Access)" 等の変則表記）
 *
 * 旧 fetch-data.ts 版（ISO先頭のみ）・旧 match.ts 版（ISO+末尾）・
 * 旧 validate-article.ts 版（任意位置）の3実装を統合したもの。
 */
export function extractYearFromDate(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const m =
    dateStr.match(/^(\d{4})/) ?? dateStr.match(/(\d{4})$/) ?? dateStr.match(/(\d{4})/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : undefined;
}

/**
 * 無効なゲームタイトルかどうかをチェック（旧 fetch-data.ts から移設）
 *
 * YouTube タイトル抽出などから流入する「ゲームタイトルではない文字列」を弾く。
 * 正規化は永続キー用の normalizeTitle（normalize.ts）を使う（移設前の挙動を維持）。
 */
export function isInvalidGameTitle(title: string): boolean {
  const normalized = normalizeTitleForKey(title);

  // ハッシュタグで始まる、または含む
  if (title.startsWith('#') || title.startsWith('@') || /#\S+/.test(title)) {
    return true;
  }

  // 短すぎるタイトル
  if (normalized.length < 3) {
    return true;
  }

  // 一般的すぎるワード
  const genericPatterns = [
    /^(game|gaming|ゲーム|実況|プレイ|配信|live|shorts?|vtuber)$/i,
    /^(新作|おすすめ|最新|人気|話題)$/i,
    /^(pc|ps[45]?|xbox|switch|steam)$/i,
    // 言語タグ
    /^(english|japanese|日本語|korean|chinese|spanish|french|german)$/i,
    // イベント・配信名
    /^(state of play|nintendo direct|xbox showcase|\d+人実況|複数視点|面白まとめ|大事件|覇権確定|switch最新作)$/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

/** タイトル照合モード */
export type TitleMatchMode = 'loose' | 'prefix' | 'exact';

/**
 * 用途別の照合プロファイル。
 * 判定基準の差異はここに一覧化する。新しい許容差・モードが必要になったら
 * 呼び出し側に定数を置かず、必ずここへプロファイルとして追加すること。
 */
export const MATCH_PROFILES = {
  /**
   * データソース集約（fetch-data の名寄せ）用。
   * - loose: 完全一致 / 部分一致（含まれる側が5文字以上）/ 先頭3語一致。
   *   YouTube 抽出タイトルなど表記が不完全なソースを拾うため緩い。
   *   無効タイトル（isInvalidGameTitle）はマッチさせない。
   * - 年差±3: 早期アクセス→正式版、リマスター、地域別リリース等のズレを許容しつつ、
   *   同名異作品（一般的に10年以上離れる）は弾ける範囲（旧 SAME_GAME_YEAR_TOLERANCE）。
   */
  aggregation: { titleMode: 'loose', yearTolerance: 3 },
  /**
   * ストア突合（resolver の検索結果照合）用。
   * - prefix: 完全一致またはプレフィックス一致（DLC・エディション違いを許容）
   * - 年差±2（#46: 同名異作品リジェクトの実績値）
   */
  store: { titleMode: 'prefix', yearTolerance: 2 },
  /**
   * ストア突合の厳格モード（#131: シリーズ続編の誤マッチ防止）。
   * - exact: 正規化後の完全一致のみ
   * - 年差±2
   */
  'store-strict': { titleMode: 'exact', yearTolerance: 2 },
} as const satisfies Record<string, { titleMode: TitleMatchMode; yearTolerance: number }>;

export type MatchProfile = keyof typeof MATCH_PROFILES;

// loose モードの部分一致で、含まれる側のタイトルに要求する最小長
const MIN_LENGTH_FOR_PARTIAL_MATCH = 5;

/**
 * 2つのタイトル文字列がモード基準で一致するか（年照合は含まない）
 */
export function titlesMatch(a: string, b: string, mode: TitleMatchMode): boolean {
  const normA = normalizeTitleForMatch(a);
  const normB = normalizeTitleForMatch(b);
  if (!normA || !normB) return false;

  switch (mode) {
    case 'exact':
      return normA === normB;

    case 'prefix':
      return normA === normB || normA.startsWith(normB) || normB.startsWith(normA);

    case 'loose': {
      // いずれかが無効なタイトルの場合はマッチしない（旧 fetch-data.titleMatches の挙動）
      if (isInvalidGameTitle(a) || isInvalidGameTitle(b)) {
        return false;
      }

      // 完全一致
      if (normA === normB) return true;

      // 部分一致（一方が他方を含む）- ただし含まれる側が十分な長さを持つ場合のみ
      if (normA.includes(normB) && normB.length >= MIN_LENGTH_FOR_PARTIAL_MATCH) return true;
      if (normB.includes(normA) && normA.length >= MIN_LENGTH_FOR_PARTIAL_MATCH) return true;

      // 先頭の主要部分が一致
      const wordsA = normA.split(' ').slice(0, 3).join(' ');
      const wordsB = normB.split(' ').slice(0, 3).join(' ');
      return wordsA === wordsB && wordsA.length > 5;
    }
  }
}

/**
 * 同一性判定に使う識別シグナル。
 * 呼び出し側は「その時点で分かっているものすべて」を渡すこと。
 */
export interface GameIdentitySignals {
  title: string;
  titleJa?: string;
  releaseDate?: string;
  steamAppId?: number;
  igdbSlug?: string;
}

/** 判定根拠 */
export type IdentityReason =
  | 'steam-app-id'    // 両側の steamAppId が一致（最強シグナル）
  | 'igdb-slug'       // 両側の igdbSlug が一致（同一 IGDB エンティティ）
  | 'title-year'      // タイトル一致かつ年差が許容範囲
  | 'app-id-mismatch' // 両側の steamAppId が判明していて不一致（別作品と確定）
  | 'title-mismatch'  // タイトル不一致
  | 'year-mismatch';  // タイトルは一致するが年差が許容範囲外（同名異作品）

export interface IdentityVerdict {
  same: boolean;
  reason: IdentityReason;
}

/**
 * 2つのゲーム識別シグナルが同一ゲームを指すかを、根拠付きで判定する。
 *
 * 判定順序:
 * 1. steamAppId が両側で判明 → その一致/不一致で確定（タイトル・年は見ない）
 * 2. igdbSlug が両側で判明し一致 → 同一と確定。
 *    不一致は確定材料にしない（IGDB には同一ゲームの重複エントリが存在しうるため、
 *    タイトル照合へフォールスルーする）
 * 3. タイトル照合（title / titleJa のクロス積のいずれかがモード基準で一致）
 * 4. 年照合（両側で年が判明している場合のみ、プロファイルの許容差で判定）
 *
 * 注意: 「片側だけが steamAppId を持つ」ケースの扱いは用途依存のポリシー
 * （例: Issue #166 の appId 未確証棄却）なので、この関数では判断しない。
 * 呼び出し側で verdict.reason を見て制御すること（isIdentityConfirmedByAppId 参照）。
 */
export function explainGameIdentity(
  a: GameIdentitySignals,
  b: GameIdentitySignals,
  profile: MatchProfile
): IdentityVerdict {
  // 1. steamAppId: 両側判明なら決定的
  if (a.steamAppId !== undefined && b.steamAppId !== undefined) {
    return a.steamAppId === b.steamAppId
      ? { same: true, reason: 'steam-app-id' }
      : { same: false, reason: 'app-id-mismatch' };
  }

  // 2. igdbSlug: 一致のみ決定的（不一致はフォールスルー）
  if (a.igdbSlug && b.igdbSlug && a.igdbSlug === b.igdbSlug) {
    return { same: true, reason: 'igdb-slug' };
  }

  const { titleMode, yearTolerance } = MATCH_PROFILES[profile];

  // 3. タイトル照合（title / titleJa のクロス積）
  const titlesA = [a.title, a.titleJa].filter((t): t is string => Boolean(t));
  const titlesB = [b.title, b.titleJa].filter((t): t is string => Boolean(t));
  const titleOk = titlesA.some((ta) => titlesB.some((tb) => titlesMatch(ta, tb, titleMode)));
  if (!titleOk) {
    return { same: false, reason: 'title-mismatch' };
  }

  // 4. 年照合（両方判明していれば許容差以内に限定、片方不明ならタイトル一致のみで通す）
  const yearA = extractYearFromDate(a.releaseDate);
  const yearB = extractYearFromDate(b.releaseDate);
  if (yearA !== undefined && yearB !== undefined && Math.abs(yearA - yearB) > yearTolerance) {
    return { same: false, reason: 'year-mismatch' };
  }

  return { same: true, reason: 'title-year' };
}

/**
 * 2つのゲーム識別シグナルが同一ゲームを指すか（boolean 版）
 */
export function isSameGameIdentity(
  a: GameIdentitySignals,
  b: GameIdentitySignals,
  profile: MatchProfile
): boolean {
  return explainGameIdentity(a, b, profile).same;
}

/**
 * 判定が「steamAppId の一致」で確証されたか。
 *
 * Issue #166 ポリシー用: 片側（自分側）が steamAppId という強アンカーを持つ場合、
 * タイトル・slug 一致だけの同一判定は信用せず、appId で確証された場合のみ
 * メタデータ上書きを許可する — という制御を呼び出し側で書くための述語。
 */
export function isIdentityConfirmedByAppId(verdict: IdentityVerdict): boolean {
  return verdict.same && verdict.reason === 'steam-app-id';
}

/**
 * 複数の候補タイトルリストに対して、いずれかのクエリタイトルが同一ゲームと判定されるか確認
 * （resolver 用の互換 API。旧 resolvers/match.ts の matchesAnyTitle と同一シグネチャ）
 *
 * @param queryTitles    検索クエリのタイトル群（英名・日本語名など複数を渡せる）
 * @param candidateTitle ストア側のタイトル
 * @param queryDate      クエリ側のリリース日
 * @param candidateDate  ストア側のリリース日
 * @param strict         true のとき完全一致のみ許容（#131 シリーズ続編誤マッチ防止）
 */
export function matchesAnyTitle(
  queryTitles: string[],
  candidateTitle: string,
  queryDate?: string,
  candidateDate?: string,
  strict = false,
): boolean {
  const profile: MatchProfile = strict ? 'store-strict' : 'store';
  return queryTitles.some((qt) =>
    isSameGameIdentity(
      { title: qt, releaseDate: queryDate },
      { title: candidateTitle, releaseDate: candidateDate },
      profile
    )
  );
}
