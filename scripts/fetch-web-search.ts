/**
 * Web検索スクリプト（Tavily API）
 * 記事生成時に必要な追加情報をWeb検索で取得
 */

import { tavily } from '@tavily/core';

// Tavily クライアント（シングルトン）
let tavilyClient: ReturnType<typeof tavily> | null = null;

/**
 * Tavily クライアントを初期化
 */
function initializeTavilyClient(): ReturnType<typeof tavily> {
  if (tavilyClient) {
    return tavilyClient;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set');
  }

  tavilyClient = tavily({ apiKey });
  return tavilyClient;
}

/**
 * 検索結果の型定義
 */
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface GameWebSearchResults {
  gameTitle: string;
  reviews?: WebSearchResult[];
  developerInfo?: WebSearchResult[];
  steamReviews?: WebSearchResult[];
  history?: WebSearchResult[];
  searchedAt: string;
}

/**
 * 検索オプション
 */
interface SearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  timeRange?: 'year' | 'month' | 'week' | 'day';
}

/**
 * 汎用検索関数
 */
async function search(
  query: string,
  options: SearchOptions = {}
): Promise<WebSearchResult[]> {
  const client = initializeTavilyClient();
  const { maxResults = 3, searchDepth = 'basic', timeRange } = options;

  try {
    const response = await client.search(query, {
      maxResults,
      searchDepth,
      timeRange,
      topic: 'general',
    });

    return response.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      score: result.score,
      publishedDate: result.publishedDate,
    }));
  } catch (error) {
    console.error(`Search failed for query "${query}":`, error);
    return [];
  }
}

/**
 * レビュー記事を検索
 * 用途: 大手新作「ゲームの特徴」、インディー「ゲームの魅力」、名作「名作たる理由」
 */
export async function searchReviews(
  gameTitle: string
): Promise<WebSearchResult[]> {
  const query = `"${gameTitle}" レビュー 評価 感想`;
  console.log(`  Searching reviews: ${gameTitle}`);
  return search(query, { maxResults: 3, searchDepth: 'basic' });
}

/**
 * 開発者情報を検索
 * 用途: 大手新作・インディー「開発ストーリー」
 */
export async function searchDeveloperInfo(
  gameTitle: string,
  developerName?: string
): Promise<WebSearchResult[]> {
  const developerPart = developerName ? ` "${developerName}"` : '';
  const query = `"${gameTitle}"${developerPart} 開発者 インタビュー OR 開発秘話 OR 開発ブログ`;
  console.log(`  Searching developer info: ${gameTitle}`);
  return search(query, { maxResults: 3, searchDepth: 'advanced' });
}

/**
 * Steamレビューを検索
 * 用途: インディー「プレイヤーの声」
 */
export async function searchSteamReviews(
  gameTitle: string
): Promise<WebSearchResult[]> {
  const query = `"${gameTitle}" Steam レビュー 評価 プレイヤー 感想`;
  console.log(`  Searching Steam reviews: ${gameTitle}`);
  return search(query, { maxResults: 3, searchDepth: 'basic' });
}

/**
 * ゲームの歴史・影響を検索
 * 用途: 名作深掘り「ゲームの歴史」
 */
export async function searchGameHistory(
  gameTitle: string
): Promise<WebSearchResult[]> {
  const query = `"${gameTitle}" 歴史 影響 名作 ゲーム業界`;
  console.log(`  Searching game history: ${gameTitle}`);
  return search(query, { maxResults: 3, searchDepth: 'advanced' });
}

/**
 * ゲームに関する全ての必要な情報を検索
 */
export async function searchGameInfo(
  gameTitle: string,
  category: 'newRelease' | 'indie' | 'classic',
  developerName?: string
): Promise<GameWebSearchResults> {
  console.log(`Searching web for: ${gameTitle} (${category})`);

  const results: GameWebSearchResults = {
    gameTitle,
    searchedAt: new Date().toISOString(),
  };

  // カテゴリに応じた検索を実行
  switch (category) {
    case 'newRelease':
      // 大手新作: レビュー + 開発者情報
      results.reviews = await searchReviews(gameTitle);
      await delay(500); // レート制限対策
      results.developerInfo = await searchDeveloperInfo(gameTitle, developerName);
      break;

    case 'indie':
      // インディー: レビュー + 開発者情報 + Steamレビュー
      results.reviews = await searchReviews(gameTitle);
      await delay(500);
      results.developerInfo = await searchDeveloperInfo(gameTitle, developerName);
      await delay(500);
      results.steamReviews = await searchSteamReviews(gameTitle);
      break;

    case 'classic':
      // 名作: レビュー + 歴史
      results.reviews = await searchReviews(gameTitle);
      await delay(500);
      results.history = await searchGameHistory(gameTitle);
      break;
  }

  return results;
}

/**
 * 検索結果をプロンプト用のテキストに変換
 */
export function formatSearchResultsForPrompt(
  results: GameWebSearchResults
): string {
  const sections: string[] = [];

  if (results.reviews && results.reviews.length > 0) {
    sections.push('【レビュー情報】');
    for (const r of results.reviews) {
      sections.push(`- ${r.title}`);
      sections.push(`  ${r.content.slice(0, 300)}`);
      sections.push(`  出典: ${r.url}`);
    }
  }

  if (results.developerInfo && results.developerInfo.length > 0) {
    sections.push('');
    sections.push('【開発者情報】');
    for (const r of results.developerInfo) {
      sections.push(`- ${r.title}`);
      sections.push(`  ${r.content.slice(0, 300)}`);
      sections.push(`  出典: ${r.url}`);
    }
  }

  if (results.steamReviews && results.steamReviews.length > 0) {
    sections.push('');
    sections.push('【Steamレビュー情報】');
    for (const r of results.steamReviews) {
      sections.push(`- ${r.title}`);
      sections.push(`  ${r.content.slice(0, 300)}`);
      sections.push(`  出典: ${r.url}`);
    }
  }

  if (results.history && results.history.length > 0) {
    sections.push('');
    sections.push('【ゲームの歴史・影響】');
    for (const r of results.history) {
      sections.push(`- ${r.title}`);
      sections.push(`  ${r.content.slice(0, 300)}`);
      sections.push(`  出典: ${r.url}`);
    }
  }

  return sections.join('\n');
}

/**
 * 遅延関数（レート制限対策）
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tavily APIが利用可能かチェック
 */
export function isTavilyAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}
