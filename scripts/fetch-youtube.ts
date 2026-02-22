/**
 * YouTube Data API v3 データ取得スクリプト
 * ゲーム系トレンド動画から話題のタイトルを抽出
 */

import type { YouTubeVideo, YouTubeData, FetchResult } from './types.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ゲーム系検索キーワード
const GAMING_KEYWORDS = [
  'ゲーム 新作',
  '新作ゲーム レビュー',
  'ゲーム実況',
  'gaming news',
  'new game release',
  'インディーゲーム',
  'Steam おすすめ',
];

// ゲームタイトル抽出用の正規表現パターン
const GAME_TITLE_PATTERNS = [
  /【(.+?)】/,
  /『(.+?)』/,
  /「(.+?)」/,
  /\[(.+?)\]/,
  /^(.+?)\s*[-|｜:：]/,
  /(?:実況|プレイ|レビュー|攻略)\s*[「『【]?(.+?)[」』】]?\s*(?:実況|プレイ|レビュー|攻略|$)/,
];

// リトライ付きfetch
async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status === 403) {
        throw new Error('API quota exceeded or invalid API key');
      }
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, delay * (i + 2)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * 動画タイトルからゲームタイトルを抽出
 */
function extractGameTitle(videoTitle: string): string | undefined {
  for (const pattern of GAME_TITLE_PATTERNS) {
    const match = videoTitle.match(pattern);
    if (match && match[1]) {
      const title = match[1].trim();
      // 除外ワードをフィルタリング
      if (
        title.length > 2 &&
        !title.match(/^(part|パート|#|\d+|実況|プレイ|レビュー)$/i)
      ) {
        return title;
      }
    }
  }
  return undefined;
}

/**
 * YouTube Gaming カテゴリからトレンド動画を取得
 */
async function fetchGamingTrends(apiKey: string): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];

  try {
    // Gaming カテゴリ (ID: 20) の人気動画を取得
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set('part', 'snippet,statistics');
    videosUrl.searchParams.set('chart', 'mostPopular');
    videosUrl.searchParams.set('videoCategoryId', '20'); // Gaming
    videosUrl.searchParams.set('regionCode', 'JP');
    videosUrl.searchParams.set('maxResults', '25');
    videosUrl.searchParams.set('key', apiKey);

    const response = await fetchWithRetry(videosUrl.toString());
    const data = await response.json();

    if (data.items) {
      for (const item of data.items) {
        const video: YouTubeVideo = {
          videoId: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          viewCount: parseInt(item.statistics.viewCount || '0', 10),
          likeCount: item.statistics.likeCount
            ? parseInt(item.statistics.likeCount, 10)
            : undefined,
          description: item.snippet.description || '',
          thumbnailUrl:
            item.snippet.thumbnails?.high?.url ||
            item.snippet.thumbnails?.default?.url ||
            '',
          extractedGameTitle: extractGameTitle(item.snippet.title),
        };
        videos.push(video);
      }
    }
  } catch (error) {
    console.error('Failed to fetch gaming trends:', error);
  }

  return videos;
}

/**
 * ゲーム系キーワードで動画検索
 */
async function searchGamingVideos(apiKey: string): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];
  const seenVideoIds = new Set<string>();

  for (const keyword of GAMING_KEYWORDS.slice(0, 3)) {
    // API quota 節約のため3キーワードまで
    try {
      // 検索実行
      const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('q', keyword);
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('videoCategoryId', '20');
      searchUrl.searchParams.set('regionCode', 'JP');
      searchUrl.searchParams.set('order', 'viewCount');
      searchUrl.searchParams.set('publishedAfter', getOneWeekAgo());
      searchUrl.searchParams.set('maxResults', '10');
      searchUrl.searchParams.set('key', apiKey);

      const searchResponse = await fetchWithRetry(searchUrl.toString());
      const searchData = await searchResponse.json();

      if (!searchData.items?.length) continue;

      // 動画IDを収集
      const videoIds = searchData.items
        .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
        .filter(
          (id: string | undefined): id is string =>
            id !== undefined && !seenVideoIds.has(id)
        );

      if (videoIds.length === 0) continue;

      // 動画の詳細情報を取得
      const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
      videosUrl.searchParams.set('part', 'snippet,statistics');
      videosUrl.searchParams.set('id', videoIds.join(','));
      videosUrl.searchParams.set('key', apiKey);

      const videosResponse = await fetchWithRetry(videosUrl.toString());
      const videosData = await videosResponse.json();

      if (videosData.items) {
        for (const item of videosData.items) {
          if (seenVideoIds.has(item.id)) continue;
          seenVideoIds.add(item.id);

          const video: YouTubeVideo = {
            videoId: item.id,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            viewCount: parseInt(item.statistics.viewCount || '0', 10),
            likeCount: item.statistics.likeCount
              ? parseInt(item.statistics.likeCount, 10)
              : undefined,
            description: item.snippet.description || '',
            thumbnailUrl:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url ||
              '',
            extractedGameTitle: extractGameTitle(item.snippet.title),
          };
          videos.push(video);
        }
      }

      // レート制限対策
      await new Promise((r) => setTimeout(r, 200));
    } catch (error) {
      console.error(`Failed to search for "${keyword}":`, error);
    }
  }

  return videos;
}

/**
 * 1週間前のISO日付文字列を取得
 */
function getOneWeekAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

/**
 * YouTube データ取得のメインエントリーポイント
 */
export async function fetchYouTubeData(): Promise<FetchResult<YouTubeData>> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn(
      'YOUTUBE_API_KEY not set, returning empty data. Set the environment variable to enable YouTube data fetching.'
    );
    return {
      success: true,
      data: {
        trendingVideos: [],
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  console.log('Fetching YouTube data...');

  try {
    // トレンド動画と検索結果を並列取得
    const [trendingVideos, searchVideos] = await Promise.all([
      fetchGamingTrends(apiKey),
      searchGamingVideos(apiKey),
    ]);

    // 重複除去してマージ
    const seenIds = new Set(trendingVideos.map((v) => v.videoId));
    const allVideos = [...trendingVideos];
    for (const video of searchVideos) {
      if (!seenIds.has(video.videoId)) {
        allVideos.push(video);
        seenIds.add(video.videoId);
      }
    }

    // 視聴回数でソート
    allVideos.sort((a, b) => b.viewCount - a.viewCount);

    const youtubeData: YouTubeData = {
      trendingVideos: allVideos.slice(0, 30),
      fetchedAt: new Date().toISOString(),
    };

    console.log(`YouTube data fetched: ${youtubeData.trendingVideos.length} videos`);

    return { success: true, data: youtubeData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch YouTube data:', message);
    return { success: false, error: message };
  }
}

// スクリプト直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchYouTubeData().then((result) => {
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
      process.exit(1);
    }
  });
}
