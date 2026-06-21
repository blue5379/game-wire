/**
 * プラットフォーム別ストアページを Tavily で検索する共通ヘルパー
 */

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
