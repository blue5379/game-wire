/**
 * Steam データ取得スクリプト
 * Top Sellers と Top Played のデータを取得
 */

import type { SteamGame, SteamData, FetchResult } from './types.js';

const STEAM_STORE_API = 'https://store.steampowered.com/api';
const STEAM_CHARTS_API = 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1';

// リトライ付きfetch
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'GameWire/1.0',
          'Accept': 'application/json',
          ...options.headers,
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        // Rate limited, wait longer
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
 * Steam Store Featured Categories から Top Sellers を取得
 */
async function fetchTopSellers(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(
      `${STEAM_STORE_API}/featuredcategories/?cc=jp&l=japanese`
    );
    const data = await response.json();

    const topSellers: SteamGame[] = [];

    // Featured categories から top_sellers を探す
    if (data.top_sellers?.items) {
      for (const item of data.top_sellers.items.slice(0, 20)) {
        topSellers.push({
          appId: item.id,
          name: item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '無料',
          discount: item.discount_percent || 0,
        });
      }
    }

    return topSellers;
  } catch (error) {
    console.error('Failed to fetch top sellers from Steam Store:', error);
    return [];
  }
}

/**
 * Steam公式APIからゲーム名を取得
 */
async function getAppName(appId: number): Promise<string | null> {
  try {
    const response = await fetch(
      `${STEAM_STORE_API}/appdetails?appids=${appId}&cc=jp&l=japanese`
    );
    const data = await response.json();
    return data[appId]?.data?.name || null;
  } catch {
    return null;
  }
}

/**
 * Steam公式 Charts API から Top Played を取得
 */
async function fetchTopPlayed(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(STEAM_CHARTS_API);
    const data = await response.json();

    const topPlayed: SteamGame[] = [];
    const ranks = data.response?.ranks || [];

    // 上位20件を取得
    for (const item of ranks.slice(0, 20)) {
      // ゲーム名を取得（レート制限対策で少し待機）
      const name = await getAppName(item.appid);
      if (name) {
        topPlayed.push({
          appId: item.appid,
          name,
          rank: item.rank,
          peakPlayers: item.peak_in_game,
        });
      }
      // Steam Store API のレート制限対策
      await new Promise((r) => setTimeout(r, 200));
    }

    return topPlayed;
  } catch (error) {
    console.error('Failed to fetch from Steam Charts API:', error);
    return [];
  }
}

/**
 * Steam Store から新作・近日発売を取得
 */
async function fetchNewReleases(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(
      `${STEAM_STORE_API}/featuredcategories/?cc=jp&l=japanese`
    );
    const data = await response.json();

    const newReleases: SteamGame[] = [];

    // new_releases カテゴリから取得
    if (data.new_releases?.items) {
      for (const item of data.new_releases.items.slice(0, 10)) {
        newReleases.push({
          appId: item.id,
          name: item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '無料',
          discount: item.discount_percent || 0,
        });
      }
    }

    // coming_soon カテゴリも取得
    if (data.coming_soon?.items) {
      for (const item of data.coming_soon.items.slice(0, 5)) {
        newReleases.push({
          appId: item.id,
          name: item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '価格未定',
          discount: 0,
        });
      }
    }

    return newReleases;
  } catch (error) {
    console.error('Failed to fetch new releases:', error);
    return [];
  }
}

/**
 * Steam データ取得のメインエントリーポイント
 */
export async function fetchSteamData(): Promise<FetchResult<SteamData>> {
  console.log('Fetching Steam data...');

  try {
    // 並列でデータ取得
    const [topSellers, topPlayed] = await Promise.all([
      fetchTopSellers(),
      fetchTopPlayed(),
    ]);

    // 新作リリースも取得（Top Sellers に追加情報として）
    const newReleases = await fetchNewReleases();

    // Top Sellers に新作を統合（重複除去）
    const seenAppIds = new Set(topSellers.map((g) => g.appId));
    for (const game of newReleases) {
      if (!seenAppIds.has(game.appId)) {
        topSellers.push(game);
        seenAppIds.add(game.appId);
      }
    }

    const steamData: SteamData = {
      topSellers,
      topPlayed,
      fetchedAt: new Date().toISOString(),
    };

    console.log(
      `Steam data fetched: ${topSellers.length} top sellers, ${topPlayed.length} top played`
    );

    return { success: true, data: steamData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Steam data:', message);
    return { success: false, error: message };
  }
}

// スクリプト直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSteamData().then((result) => {
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
      process.exit(1);
    }
  });
}
