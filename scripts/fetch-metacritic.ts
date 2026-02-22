/**
 * Metacritic / OpenCritic データ取得スクリプト
 * ゲームのメタスコアとユーザースコアを取得
 *
 * 注: Metacriticは公式APIを提供していないため、
 * OpenCritic API（無料）を代替として使用
 */

import type { MetacriticScore, MetacriticData, FetchResult } from './types.js';

const OPENCRITIC_API_URL = 'https://api.opencritic.com/api';

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
          Accept: 'application/json',
          ...options.headers,
        },
      });
      if (response.ok) return response;
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
 * OpenCritic APIでゲームを検索
 */
async function searchGameOnOpenCritic(
  gameName: string
): Promise<MetacriticScore | null> {
  try {
    // ゲーム検索
    const searchUrl = new URL(`${OPENCRITIC_API_URL}/game/search`);
    searchUrl.searchParams.set('criteria', gameName);

    const searchResponse = await fetchWithRetry(searchUrl.toString());
    const searchResults = await searchResponse.json();

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return null;
    }

    // 最も関連性の高い結果を使用
    const gameId = searchResults[0].id;
    const exactName = searchResults[0].name;

    // ゲーム詳細を取得
    const detailResponse = await fetchWithRetry(
      `${OPENCRITIC_API_URL}/game/${gameId}`
    );
    const gameDetail = await detailResponse.json();

    return {
      title: exactName,
      platform: 'Multi',
      metascore: gameDetail.topCriticScore
        ? Math.round(gameDetail.topCriticScore)
        : null,
      userScore: gameDetail.percentRecommended
        ? Math.round(gameDetail.percentRecommended / 10) // 100点満点を10点満点に変換
        : null,
      url: `https://opencritic.com/game/${gameId}/${gameDetail.slug || ''}`,
    };
  } catch (error) {
    console.error(`Failed to search "${gameName}" on OpenCritic:`, error);
    return null;
  }
}

/**
 * OpenCriticの最近のレビューを取得
 */
async function fetchRecentReviews(): Promise<MetacriticScore[]> {
  const scores: MetacriticScore[] = [];

  try {
    // Hall of Fame（高評価ゲーム）を取得
    const hofResponse = await fetchWithRetry(
      `${OPENCRITIC_API_URL}/game/hall-of-fame`
    );
    const hofGames = await hofResponse.json();

    if (Array.isArray(hofGames)) {
      for (const game of hofGames.slice(0, 15)) {
        scores.push({
          title: game.name,
          platform: 'Multi',
          metascore: game.topCriticScore
            ? Math.round(game.topCriticScore)
            : null,
          userScore: game.percentRecommended
            ? Math.round(game.percentRecommended / 10)
            : null,
          url: `https://opencritic.com/game/${game.id}/${game.slug || ''}`,
        });
      }
    }

    // レート制限対策
    await new Promise((r) => setTimeout(r, 300));

    // Recently Released を取得
    // この API がない場合があるので try-catch で囲む
    try {
      const recentResponse = await fetchWithRetry(
        `${OPENCRITIC_API_URL}/game`
      );
      const recentGames = await recentResponse.json();

      if (Array.isArray(recentGames)) {
        for (const game of recentGames.slice(0, 15)) {
          // 重複チェック
          if (!scores.some((s) => s.title === game.name)) {
            scores.push({
              title: game.name,
              platform: 'Multi',
              metascore: game.topCriticScore
                ? Math.round(game.topCriticScore)
                : null,
              userScore: game.percentRecommended
                ? Math.round(game.percentRecommended / 10)
                : null,
              url: `https://opencritic.com/game/${game.id}/${game.slug || ''}`,
            });
          }
        }
      }
    } catch {
      // Recent API が失敗しても続行
      console.log('Recent games API not available, using Hall of Fame only');
    }
  } catch (error) {
    console.error('Failed to fetch OpenCritic data:', error);
  }

  return scores;
}

/**
 * 複数のゲーム名でスコアを検索
 */
export async function searchMultipleGamesScore(
  gameNames: string[]
): Promise<MetacriticScore[]> {
  const scores: MetacriticScore[] = [];

  for (const name of gameNames) {
    const score = await searchGameOnOpenCritic(name);
    if (score) {
      scores.push(score);
    }
    // レート制限対策
    await new Promise((r) => setTimeout(r, 300));
  }

  return scores;
}

/**
 * Metacritic/OpenCritic データ取得のメインエントリーポイント
 */
export async function fetchMetacriticData(): Promise<
  FetchResult<MetacriticData>
> {
  console.log('Fetching Metacritic/OpenCritic data...');

  try {
    const scores = await fetchRecentReviews();

    const metacriticData: MetacriticData = {
      scores,
      fetchedAt: new Date().toISOString(),
    };

    console.log(`Metacritic data fetched: ${scores.length} scores`);

    return { success: true, data: metacriticData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Metacritic data:', message);
    return { success: false, error: message };
  }
}

// 単一ゲームのスコア取得（外部から呼び出し用）
export async function getGameScore(
  gameName: string
): Promise<MetacriticScore | null> {
  return searchGameOnOpenCritic(gameName);
}

// スクリプト直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchMetacriticData().then((result) => {
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
      process.exit(1);
    }
  });
}
