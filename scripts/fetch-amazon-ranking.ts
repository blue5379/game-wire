/**
 * ファミ通経由 Amazon 国内ゲームランキングの取得モジュール（§2.3 国内販売軸・PR-B2）
 *
 * 🚨 ライセンス制約（§2.3「国内販売軸の重要な制約」）:
 * Amazon 順位は Amazon のライセンス（24時間超の保存禁止）とファミ通の著作権条項
 * （蓄積禁止）に触れる。このモジュールは「取得して索引を返す」だけであり、
 * - 順位を GameData に持たせない
 * - ファイルに書き出さない（キャッシュ・中間データファイル含む）
 * - 記事に出さない
 * - console に順位・順位から逆算できる値（軸の素点など）を出さない。掲載の有無（yes/no）まで
 * を徹底する。呼び出し側もこの制約を引き継ぐこと。
 */

const AMAZON_RANKING_URL = 'https://www.famitsu.com/ranking/amazon';

/** ランキングの掲載枠数。順位→点数の分母に使う固定値（§2.3。実測依存にしないこと） */
export const AMAZON_RANKING_SLOT_COUNT = 50;

/** 誤照合ガードの閾値（日）。§2.3: 世代違いの同名作を弾く。実測では正しいペアの差は0〜1日 */
const RELEASE_DATE_GUARD_DAYS = 365;

/** ファミ通経由 Amazon ランキングの生エントリ（永続化しないこと） */
export interface AmazonRankingEntry {
  ranking: number;
  title: string;
  /** ISO8601。誤照合ガードに使う */
  releaseDate?: string;
}

/** タイトルから Amazon 順位を引く索引。GameData には載せず、選定処理に引数で渡す（§2.3） */
export interface AmazonRankIndex {
  /** 掲載されていれば順位、未掲載なら undefined */
  lookup(game: { title: string; titleJa?: string; releaseDate?: string }): number | undefined;
  /** 索引が保持する一意タイトル数（ログ・テスト用。順位は含まない） */
  readonly size: number;
}

/**
 * 非ゲーム商品を検出する。タイトルのみで判定する（categoryName は使わない）。
 *
 * categoryName は非ゲーム判定に使えない: 実測で categoryName=ゲームソフトの1位が
 * プリペイド番号（非ゲーム）、逆に本命の「スプラトゥーン レイダース」4位が
 * categoryName=ダウンロード版ソフト/コンテンツ（ゲーム）だった。
 *
 * 「アップグレードパス」「エキスパンションパス」を含める理由: 単体のゲームではなく
 * 追加コンテンツであり、これを通すと親ゲームに本来の順位でない点が付いてしまう。
 * 実データに『ぽこ あ ポケモン エキスパンションパス』5位・
 * 『ゼノブレイド2 Nintendo Switch 2 Edition アップグレードパス』33位が存在する。
 */
const NON_GAME_KEYWORDS = [
  'プリペイド番号',
  'ストアチケット',
  'ギフトカード',
  '利用券',
  'コントローラ',
  'スティックカバー',
  'ゲームパッド',
  'robux',
  'アップグレードパス',
  'エキスパンションパス',
];

export function isNonGameProduct(title: string): boolean {
  // commonNormalize と同じ NFKC 正規化を toLowerCase() の前に通す（PR #249 レビュー指摘）。
  // これが無いと半角カタカナ（例「ﾆﾝﾃﾝﾄﾞｰﾌﾟﾘﾍﾟｲﾄﾞ番号」）や全角ラテン文字（例「ＲＯＢＵＸ」）
  // の商品名がキーワード走査をすり抜ける。実測（2026-08-09時点のライブデータ）では該当0件で
  // 実害は出ていないが、同一ファイル内の commonNormalize との正規化経路の不整合を解消する予防的修正。
  const lower = title.normalize('NFKC').toLowerCase();
  return NON_GAME_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * 共通正規化（normalizeAmazonProductTitle と lookup の両方から使う内部ヘルパー）。
 * NFKC 正規化 → ™®© 除去 → 小文字化 → 記号を空白に → 連続空白を1つに → trim。
 */
function commonNormalize(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/[:：\-‐−–—・,，、。．.!！?？'’"”[\]【】（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// プラットフォーム接尾辞（末尾の「- Switch2」「-PS5」等）を除去するための正規表現。
// 全角ハイフン・ダッシュ類（‐ − – —）も対象。
const PLATFORM_SUFFIX_RE =
  /[-‐−–—]\s*(nintendo\s*)?(switch\s*2|switch|ps5|ps4|pc)\b.*$/i;

/**
 * Amazon 商品名を照合キーに正規化する（§2.3 の索引構築専用。lookup 側は commonNormalize のみ使う）。
 */
export function normalizeAmazonProductTitle(title: string): string {
  // `|`（ASCII）と `｜`（全角）のどちらか早い方以降を捨てる（`|オンラインコード版`
  // `Windows版 | Minecraft…` 対策）。全角｜は実測（2026-08-09時点のライブデータ）では0件だが、
  // 日本語商品名で使われうるため予防的に対応する（PR #249 レビュー指摘）。
  // PLATFORM_SUFFIX_RE は変更しない: `- PlayStation 5` 等の表記はライブデータに存在せず
  // （唯一の `Xbox Series X|S` は非ゲームのサブスク商品）、投機的な拡張はしない。
  const asciiIdx = title.indexOf('|');
  const fullWidthIdx = title.indexOf('｜');
  const pipeIndexes = [asciiIdx, fullWidthIdx].filter((i) => i >= 0);
  const pipeIdx = pipeIndexes.length > 0 ? Math.min(...pipeIndexes) : -1;
  let t = pipeIdx >= 0 ? title.slice(0, pipeIdx) : title;

  // 【…】（…）(…) を除去
  t = t.replace(/【[^】]*】/g, ' ').replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ');

  // 末尾のプラットフォーム接尾辞とそれ以降を除去
  t = t.replace(PLATFORM_SUFFIX_RE, '');

  return commonNormalize(t);
}

/**
 * `__NEXT_DATA__` script タグの JSON から props.pageProps.amazonRankingData を取り出す。
 * パース失敗・該当パスが無い・配列でない場合は空配列を返す（throw しない）。
 */
export function parseAmazonRankingHtml(html: string): AmazonRankingEntry[] {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return [];

  let json: unknown;
  try {
    json = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const data = (json as { props?: { pageProps?: { amazonRankingData?: unknown } } })?.props
    ?.pageProps?.amazonRankingData;
  if (!Array.isArray(data)) return [];

  const entries: AmazonRankingEntry[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const ranking = (item as { ranking?: unknown }).ranking;
    const title = (item as { title?: unknown }).title;
    if (typeof ranking !== 'number' || typeof title !== 'string') continue;
    const releaseDate = (item as { releaseDate?: unknown }).releaseDate;
    entries.push({
      ranking,
      title,
      releaseDate: typeof releaseDate === 'string' ? releaseDate : undefined,
    });
  }
  return entries;
}

interface IndexedEntry {
  ranking: number;
  releaseDate?: string;
}

/**
 * entries から索引を構築する。
 * - 非ゲーム商品を除去
 * - normalizeAmazonProductTitle でキー化。空キーは捨てる
 * - 同一キーが複数あれば最も上位（数値が小さい）順位を採る
 * - 順位は詰め直さない（元の ranking をそのまま保持。§2.3）
 */
export function buildAmazonRankIndex(entries: AmazonRankingEntry[]): AmazonRankIndex {
  const byKey = new Map<string, IndexedEntry>();

  for (const entry of entries) {
    if (isNonGameProduct(entry.title)) continue;
    const key = normalizeAmazonProductTitle(entry.title);
    if (key === '') continue;

    const existing = byKey.get(key);
    if (!existing || entry.ranking < existing.ranking) {
      byKey.set(key, { ranking: entry.ranking, releaseDate: entry.releaseDate });
    }
  }

  // 誤照合ガード（§2.3）: 世代違いの同名作（例『スプラトゥーン3』2022年版）を弾く。
  // どちらかの発売日が欠けている場合はガードを適用せず一致とみなす。
  function passesReleaseDateGuard(
    entry: { releaseDate?: string },
    game: { releaseDate?: string }
  ): boolean {
    if (!entry.releaseDate || !game.releaseDate) return true;
    const a = new Date(entry.releaseDate).getTime();
    const b = new Date(game.releaseDate).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return true;
    const diffDays = Math.abs(a - b) / (1000 * 60 * 60 * 24);
    return diffDays <= RELEASE_DATE_GUARD_DAYS;
  }

  function lookup(game: {
    title: string;
    titleJa?: string;
    releaseDate?: string;
  }): number | undefined {
    // titleJa → title の順に候補を引き、ガードは候補ごとに独立して適用する（PR #249 レビュー指摘）。
    // 「hit確定後にガードでまとめて打ち切る」実装だと、titleJa が世代違いの別エントリに
    // 衝突してガードで弾かれた場合、英語 title でキーされている正しいエントリに
    // フォールバックできず「未掲載」になってしまう。
    if (game.titleJa) {
      const hitByTitleJa = byKey.get(commonNormalize(game.titleJa));
      if (hitByTitleJa && passesReleaseDateGuard(hitByTitleJa, game)) {
        return hitByTitleJa.ranking;
      }
    }

    const hitByTitle = byKey.get(commonNormalize(game.title));
    if (hitByTitle && passesReleaseDateGuard(hitByTitle, game)) {
      return hitByTitle.ranking;
    }

    return undefined;
  }

  return { lookup, size: byKey.size };
}

const emptyIndex: AmazonRankIndex = { lookup: () => undefined, size: 0 };

/**
 * ファミ通経由 Amazon 国内ゲームランキングを取得し索引を返す。
 * 失敗時（ネットワークエラー / 非200 / パース0件）は空の索引を返す（throw しない）。
 * 他のデータ源が落ちても号の生成は止めない既存方針に合わせる。
 *
 * ログは取得成功時は件数のみ。失敗時は理由のみ。順位・タイトル別の順位は出さない。
 */
export async function fetchAmazonRanking(): Promise<AmazonRankIndex> {
  try {
    const response = await fetch(AMAZON_RANKING_URL, {
      headers: { 'User-Agent': 'GameWire/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[Amazon] Failed to fetch ranking: HTTP ${response.status}`);
      return emptyIndex;
    }

    const html = await response.text();
    const entries = parseAmazonRankingHtml(html);
    if (entries.length === 0) {
      console.warn('[Amazon] Failed to fetch ranking: parsed 0 entries');
      return emptyIndex;
    }

    const index = buildAmazonRankIndex(entries);
    console.log(`[Amazon] Ranking index built: ${index.size} titles`);
    return index;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Amazon] Failed to fetch ranking: ${message}`);
    return emptyIndex;
  }
}
