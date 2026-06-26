/**
 * プラットフォーム別ストアページを Tavily で検索する共通ヘルパー
 */

/** ストアページタイトルからサフィックスを除去するパターン */
const STORE_TITLE_SUFFIX_PATTERNS = [
  // PlayStation Store
  /\s*[|｜]\s*PlayStation\s*Store\s*$/i,
  /\s*[|｜]\s*PS\s*(?:Store|4|5)\s*$/i,
  // Nintendo eShop
  /\s*[|｜]\s*Nintendo\s*(?:eShop|Switch)?\s*$/i,
  /\s*-\s*Nintendo\s*(?:eShop|Switch)?\s*$/i,
  // Microsoft Store / Xbox
  /\s*[|｜]\s*(?:Xbox|Microsoft\s*Store)\s*$/i,
  /\s*-\s*(?:Xbox|Microsoft\s*Store)\s*$/i,
  // 汎用: 末尾の "| 何か" や "- 何か" を除去（短い場合のみ残す可能性があるため最後に）
];

/**
 * ストアページタイトルからプラットフォームサフィックスを除去する。
 * 例: "God of War | PlayStation Store" → "God of War"
 */
export function stripStoreSuffix(title: string): string {
  let result = title;
  for (const pattern of STORE_TITLE_SUFFIX_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * URL からページのタイトルを取得する（OGP og:title → <title> の順にフォールバック）。
 * タイムアウトや取得失敗の場合は null を返す（false negative を許容）。
 */
export async function extractPageTitle(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; GameWire/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    // HTML 全体ではなく先頭 50KB だけ読む（<head> が含まれれば十分）
    const reader = res.body?.getReader();
    if (!reader) return null;
    let text = '';
    let totalBytes = 0;
    const decoder = new TextDecoder();
    while (totalBytes < 50 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      totalBytes += value.length;
      // </head> が見つかれば以降は不要
      if (text.includes('</head>')) break;
    }
    // 内部バッファに残るマルチバイト境界文字をフラッシュ（日本語タイトル対策）
    text += decoder.decode();
    reader.cancel().catch(() => {});

    return extractTitleFromHtml(text);
  } catch {
    return null;
  }
}

/**
 * HTML テキストから og:title または <title> を抽出する純関数。
 * アポストロフィを含むタイトルに対応するためバックリファレンスを使用。
 */
function extractTitleFromHtml(text: string): string | null {
  // og:title を優先（開始引用符をバックリファレンスで閉じる → アポストロフィ対応）
  const ogMatch =
    text.match(/<meta[^>]+property=["']og:title["'][^>]*content=(['"])(.*?)\1[^>]*>/is)
    ?? text.match(/<meta[^>]*content=(['"])(.*?)\1[^>]*property=["']og:title["'][^>]*>/is);
  if (ogMatch?.[2]) return ogMatch[2].trim();

  // <title> にフォールバック
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  return null;
}

/**
 * URL を GET で取得し、生死確認とタイトル抽出を1リクエストで行う。
 * HEAD + GET の二重リクエスト（Issue #132）を解消する。
 *
 * @returns alive: false → URL が死んでいる（404/403/タイムアウト等）
 *          alive: true, title: null → 取得できたがタイトル未取得
 *          alive: true, title: string → 取得成功
 */
export async function fetchAndExtractTitle(
  url: string,
  timeoutMs = 8000,
): Promise<{ alive: boolean; title: string | null }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; GameWire/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { alive: false, title: null };

    const reader = res.body?.getReader();
    if (!reader) return { alive: true, title: null };

    let text = '';
    let totalBytes = 0;
    const decoder = new TextDecoder();
    while (totalBytes < 50 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      totalBytes += value.length;
      if (text.includes('</head>')) break;
    }
    text += decoder.decode();
    reader.cancel().catch(() => {});

    return { alive: true, title: extractTitleFromHtml(text) };
  } catch {
    return { alive: false, title: null };
  }
}

/**
 * Tavily で "{queryTitle}" {siteScope} を検索し、urlFilter を通過した URL を返す。
 * TAVILY_API_KEY が未設定の場合は空配列を返す。
 *
 * 複数の queryTitles がある場合は最初に英語タイトル、次に日本語タイトルで試みる。
 */
export async function searchStorePage(
  queryTitles: string[],
  siteScope: string,
  urlFilter: (url: string) => boolean
): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  if (!queryTitles.length) return [];

  const { tavily } = await import('@tavily/core');
  const client = tavily({ apiKey });

  for (const queryTitle of queryTitles) {
    const query = `"${queryTitle}" ${siteScope}`;
    try {
      const response = await client.search(query, {
        maxResults: 5,
        searchDepth: 'basic',
        topic: 'general',
      });
      const urls = response.results.map((r) => r.url).filter(urlFilter);
      if (urls.length > 0) return urls;
    } catch {
      // リトライせず次のタイトルへ
    }
  }

  return [];
}
