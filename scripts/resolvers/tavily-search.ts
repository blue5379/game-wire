/**
 * プラットフォーム別ストアページを Tavily で検索する共通ヘルパー
 */

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
      text += decoder.decode(value, { stream: !done });
      totalBytes += value.length;
      // </head> が見つかれば以降は不要
      if (text.includes('</head>')) break;
    }
    reader.cancel().catch(() => {});

    // og:title を優先
    const ogMatch = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      ?? text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (ogMatch?.[1]) return ogMatch[1].trim();

    // <title> にフォールバック
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) return titleMatch[1].trim();

    return null;
  } catch {
    return null;
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
