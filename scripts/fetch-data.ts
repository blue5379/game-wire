/**
 * データ統合スクリプト
 * 全データソースから取得したデータをマージ・正規化してJSONファイルに出力
 */

import { config } from 'dotenv';

// .env.local を優先的に読み込み
config({ path: '.env.local' });
config({ path: '.env' });
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchSteamData } from './fetch-steam.js';
import { fetchYouTubeData } from './fetch-youtube.js';
import { fetchIGDBData, enrichGameWithIGDB, getCountryNameFromCode } from './fetch-igdb.js';
import { fetchMetacriticData, getGameScore } from './fetch-metacritic.js';
import { inferGameInfoFromYouTube } from './bedrock-client.js';
import type {
  SteamData,
  YouTubeData,
  YouTubeVideo,
  IGDBData,
  MetacriticData,
  GameData,
  AggregatedData,
  SelectedGames,
} from './types.js';

// 出力ディレクトリ
const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * ゲームタイトルを正規化（比較用）
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[：:]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 2つのタイトルが同じゲームを指すか判定
 */
function isSameGame(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // 完全一致
  if (norm1 === norm2) return true;

  // 部分一致（一方が他方を含む）
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // 先頭の主要部分が一致
  const words1 = norm1.split(' ').slice(0, 3).join(' ');
  const words2 = norm2.split(' ').slice(0, 3).join(' ');
  if (words1 === words2 && words1.length > 5) return true;

  return false;
}

/**
 * データソースを統合してゲームリストを作成
 */
async function aggregateGames(
  steamData: SteamData,
  youtubeData: YouTubeData,
  igdbData: IGDBData,
  metacriticData: MetacriticData
): Promise<GameData[]> {
  const gameMap = new Map<string, GameData>();

  // Steam Top Sellers を追加
  for (let i = 0; i < steamData.topSellers.length; i++) {
    const steam = steamData.topSellers[i];
    const normalized = normalizeTitle(steam.name);

    if (!gameMap.has(normalized)) {
      gameMap.set(normalized, {
        title: steam.name,
        normalizedTitle: normalized,
        steamAppId: steam.appId,
        genres: [],
        platforms: ['PC'],
        steamRank: i + 1,
        source: ['steam'],
      });
    } else {
      const existing = gameMap.get(normalized)!;
      existing.steamAppId = steam.appId;
      existing.steamRank = i + 1;
      if (!existing.source.includes('steam')) {
        existing.source.push('steam');
      }
    }
  }

  // Steam Top Played を追加
  for (const steam of steamData.topPlayed) {
    const normalized = normalizeTitle(steam.name);

    if (!gameMap.has(normalized)) {
      gameMap.set(normalized, {
        title: steam.name,
        normalizedTitle: normalized,
        steamAppId: steam.appId,
        genres: [],
        platforms: ['PC'],
        steamPlayers: steam.currentPlayers,
        source: ['steam'],
      });
    } else {
      const existing = gameMap.get(normalized)!;
      existing.steamPlayers = steam.currentPlayers;
    }
  }

  // YouTube から抽出されたゲームタイトルを追加
  const youtubeTitleCounts = new Map<string, number>();
  // YouTube動画情報をゲームタイトルごとに保持（AI推測用）
  const youtubeVideosByGame = new Map<string, YouTubeVideo[]>();

  for (const video of youtubeData.trendingVideos) {
    if (video.extractedGameTitle) {
      const normalized = normalizeTitle(video.extractedGameTitle);
      const count = youtubeTitleCounts.get(normalized) || 0;
      youtubeTitleCounts.set(normalized, count + video.viewCount);

      // 動画情報を保持
      const videos = youtubeVideosByGame.get(normalized) || [];
      videos.push(video);
      youtubeVideosByGame.set(normalized, videos);
    }
  }

  for (const [normalized, viewCount] of youtubeTitleCounts.entries()) {
    // 既存のゲームとマッチするか確認
    let matched = false;
    for (const [key, game] of gameMap.entries()) {
      if (isSameGame(key, normalized)) {
        game.youtubePopularity = (game.youtubePopularity || 0) + viewCount;
        if (!game.source.includes('youtube')) {
          game.source.push('youtube');
        }
        matched = true;
        break;
      }
    }

    if (!matched && viewCount > 100000) {
      // 視聴回数が多いものだけ追加
      gameMap.set(normalized, {
        title: normalized, // 後で正式名称に置き換え
        normalizedTitle: normalized,
        genres: [],
        platforms: [],
        youtubePopularity: viewCount,
        source: ['youtube'],
      });
    }
  }

  // IGDB データでエンリッチ
  for (const igdb of igdbData.games) {
    const normalized = normalizeTitle(igdb.name);

    // 既存のゲームとマッチするか確認
    let matched = false;
    for (const [key, game] of gameMap.entries()) {
      if (isSameGame(key, normalized)) {
        // IGDB データで補完
        game.title = igdb.name; // 正式名称に更新
        game.genres = igdb.genres || game.genres;
        game.platforms = igdb.platforms || game.platforms;
        game.releaseDate = igdb.releaseDate || game.releaseDate;
        game.developer = igdb.developer || game.developer;
        game.publisher = igdb.publisher || game.publisher;
        game.developerCountry = getCountryNameFromCode(igdb.developerCountry) || game.developerCountry;
        game.coverImage = igdb.coverUrl || game.coverImage;
        game.screenshots = igdb.screenshotUrls || game.screenshots;
        game.summary = igdb.summary || game.summary;
        if (!game.source.includes('igdb')) {
          game.source.push('igdb');
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      gameMap.set(normalized, {
        title: igdb.name,
        normalizedTitle: normalized,
        genres: igdb.genres || [],
        platforms: igdb.platforms || [],
        releaseDate: igdb.releaseDate,
        developer: igdb.developer,
        publisher: igdb.publisher,
        developerCountry: getCountryNameFromCode(igdb.developerCountry),
        coverImage: igdb.coverUrl,
        screenshots: igdb.screenshotUrls,
        summary: igdb.summary,
        source: ['igdb'],
      });
    }
  }

  // Metacritic スコアを追加
  for (const score of metacriticData.scores) {
    const normalized = normalizeTitle(score.title);

    for (const [key, game] of gameMap.entries()) {
      if (isSameGame(key, normalized)) {
        game.metascore = score.metascore;
        game.userScore = score.userScore;
        if (!game.source.includes('metacritic')) {
          game.source.push('metacritic');
        }
        break;
      }
    }
  }

  // 不足しているメタデータを IGDB から補完
  console.log('Enriching games with IGDB data...');
  let enrichedCount = 0;
  for (const game of gameMap.values()) {
    if (!game.coverImage || game.genres.length === 0) {
      const igdbGame = await enrichGameWithIGDB(game.title);
      if (igdbGame) {
        game.genres = igdbGame.genres || game.genres;
        game.platforms = igdbGame.platforms || game.platforms;
        game.releaseDate = igdbGame.releaseDate || game.releaseDate;
        game.developer = igdbGame.developer || game.developer;
        game.publisher = igdbGame.publisher || game.publisher;
        game.developerCountry = getCountryNameFromCode(igdbGame.developerCountry) || game.developerCountry;
        game.coverImage = igdbGame.coverUrl || game.coverImage;
        game.screenshots = igdbGame.screenshotUrls || game.screenshots;
        game.summary = igdbGame.summary || game.summary;
        if (!game.source.includes('igdb')) {
          game.source.push('igdb');
        }
        enrichedCount++;
        // レート制限対策
        if (enrichedCount % 5 === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
  console.log(`Enriched ${enrichedCount} games with IGDB data`);

  // Metacritic スコアが不足しているゲームを補完
  console.log('Enriching games with Metacritic scores...');
  enrichedCount = 0;
  for (const game of gameMap.values()) {
    if (game.metascore === undefined && game.source.length > 1) {
      const score = await getGameScore(game.title);
      if (score) {
        game.metascore = score.metascore;
        game.userScore = score.userScore;
        enrichedCount++;
        // レート制限対策
        if (enrichedCount % 3 === 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }
  console.log(`Enriched ${enrichedCount} games with Metacritic scores`);

  // YouTubeからのゲームでIGDBで情報が取得できなかったものに対してAI推測を適用
  console.log('Inferring game info from YouTube data using AI...');
  let inferredCount = 0;
  for (const game of gameMap.values()) {
    // YouTubeがソースで、ジャンルが空のゲームが対象
    if (
      game.source.includes('youtube') &&
      !game.source.includes('igdb') &&
      game.genres.length === 0
    ) {
      // このゲームに関連するYouTube動画を取得
      const videos = youtubeVideosByGame.get(game.normalizedTitle);
      if (videos && videos.length > 0) {
        console.log(`  Inferring info for: ${game.title}`);
        const videoTitles = videos.map((v) => v.title);
        const videoDescriptions = videos.map((v) => v.description);

        try {
          const inferred = await inferGameInfoFromYouTube(
            videoTitles,
            videoDescriptions
          );

          if (inferred) {
            const inferredFields: string[] = [];

            if (inferred.genres && inferred.genres.length > 0) {
              game.genres = inferred.genres;
              inferredFields.push('genres');
            }
            if (inferred.platforms && inferred.platforms.length > 0) {
              game.platforms = inferred.platforms;
              inferredFields.push('platforms');
            }
            if (inferred.developer) {
              game.developer = inferred.developer;
              inferredFields.push('developer');
            }
            if (inferred.summary && !game.summary) {
              game.summary = inferred.summary;
              inferredFields.push('summary');
            }

            if (inferredFields.length > 0) {
              game.isAiInferred = true;
              game.aiInferredFields = inferredFields;
              inferredCount++;
              console.log(`    Inferred: ${inferredFields.join(', ')}`);
            }
          }
        } catch (error) {
          console.warn(`    Failed to infer info for ${game.title}:`, error);
        }

        // レート制限対策
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  console.log(`Inferred ${inferredCount} games with AI from YouTube data`);

  return Array.from(gameMap.values());
}

/**
 * 記事生成用にゲームを選定
 */
function selectGamesForArticles(games: GameData[]): SelectedGames {
  // 大手企業の新作（最近リリースされた、開発会社がある、スコアが高い）
  const recentGames = games
    .filter((g) => {
      if (!g.releaseDate) return false;
      const releaseDate = new Date(g.releaseDate);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return releaseDate > threeMonthsAgo;
    })
    .filter((g) => g.publisher || g.developer)
    .sort((a, b) => (b.metascore || 0) - (a.metascore || 0));

  const newReleases = recentGames.slice(0, 2);

  // インディーゲーム（YouTubeで話題 or Steamで人気、大手ではない）
  const largePublishers = [
    'nintendo',
    'sony',
    'microsoft',
    'ea',
    'ubisoft',
    'activision',
    'blizzard',
    'square enix',
    'capcom',
    'bandai namco',
    'sega',
    'konami',
    'take-two',
    'bethesda',
  ];

  const isIndie = (game: GameData): boolean => {
    const publisher = (game.publisher || '').toLowerCase();
    const developer = (game.developer || '').toLowerCase();
    return !largePublishers.some(
      (p) => publisher.includes(p) || developer.includes(p)
    );
  };

  const indieGames = games
    .filter(isIndie)
    .filter((g) => g.steamRank || g.youtubePopularity)
    .sort(
      (a, b) =>
        (b.youtubePopularity || 0) +
        (b.steamRank ? 1000 - b.steamRank : 0) -
        ((a.youtubePopularity || 0) + (a.steamRank ? 1000 - a.steamRank : 0))
    );

  const indies = indieGames
    .filter((g) => !newReleases.some((nr) => nr.title === g.title))
    .slice(0, 2);

  // 特集記事用（シーズンイベント関連 or 人気タイトル）
  const featured =
    games.find(
      (g) =>
        g.genres?.some((genre) =>
          ['sports', 'racing', 'simulation'].includes(genre.toLowerCase())
        ) && g.metascore && g.metascore > 75
    ) || games.find((g) => g.steamPlayers && g.steamPlayers > 50000) || null;

  // 名作深掘り（高スコア + 高人気）
  const classicCandidates = games
    .filter((g) => g.metascore && g.metascore > 85)
    .filter((g) => g.steamPlayers || (g.youtubePopularity && g.youtubePopularity > 500000))
    .filter(
      (g) =>
        !newReleases.some((nr) => nr.title === g.title) &&
        !indies.some((i) => i.title === g.title) &&
        g.title !== featured?.title
    )
    .sort((a, b) => (b.metascore || 0) - (a.metascore || 0));

  const classic = classicCandidates[0] || null;

  return {
    newReleases,
    indies,
    featured,
    classic,
  };
}

/**
 * メインエントリーポイント
 */
async function main(): Promise<void> {
  console.log('=== Game Wire Data Fetch ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // 出力ディレクトリ作成
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 各データソースから並列でデータ取得
  console.log('Fetching data from all sources...');
  const [steamResult, youtubeResult, igdbResult, metacriticResult] =
    await Promise.all([
      fetchSteamData(),
      fetchYouTubeData(),
      fetchIGDBData(),
      fetchMetacriticData(),
    ]);

  // エラーチェック
  const errors: string[] = [];
  if (!steamResult.success) errors.push(`Steam: ${steamResult.error}`);
  if (!youtubeResult.success) errors.push(`YouTube: ${youtubeResult.error}`);
  if (!igdbResult.success) errors.push(`IGDB: ${igdbResult.error}`);
  if (!metacriticResult.success)
    errors.push(`Metacritic: ${metacriticResult.error}`);

  if (errors.length > 0) {
    console.warn('Some data sources failed:');
    errors.forEach((e) => console.warn(`  - ${e}`));
  }

  // デフォルト値を設定（取得失敗時のフォールバック）
  const steamData: SteamData = steamResult.data || {
    topSellers: [],
    topPlayed: [],
    fetchedAt: new Date().toISOString(),
  };
  const youtubeData: YouTubeData = youtubeResult.data || {
    trendingVideos: [],
    fetchedAt: new Date().toISOString(),
  };
  const igdbData: IGDBData = igdbResult.data || {
    games: [],
    fetchedAt: new Date().toISOString(),
  };
  const metacriticData: MetacriticData = metacriticResult.data || {
    scores: [],
    fetchedAt: new Date().toISOString(),
  };

  // データ統合
  console.log('');
  console.log('Aggregating data...');
  const games = await aggregateGames(
    steamData,
    youtubeData,
    igdbData,
    metacriticData
  );
  console.log(`Total games aggregated: ${games.length}`);

  // 記事用ゲーム選定
  console.log('');
  console.log('Selecting games for articles...');
  const selectedGames = selectGamesForArticles(games);
  console.log(`New Releases: ${selectedGames.newReleases.length}`);
  console.log(`Indies: ${selectedGames.indies.length}`);
  console.log(`Featured: ${selectedGames.featured?.title || 'None'}`);
  console.log(`Classic: ${selectedGames.classic?.title || 'None'}`);

  // 統合データの構築
  const aggregatedData: AggregatedData = {
    games,
    steamData,
    youtubeData,
    igdbData,
    metacriticData,
    fetchedAt: new Date().toISOString(),
  };

  // JSON ファイルに出力
  const outputPath = path.join(DATA_DIR, 'aggregated.json');
  fs.writeFileSync(outputPath, JSON.stringify(aggregatedData, null, 2));
  console.log('');
  console.log(`Data saved to: ${outputPath}`);

  // 選定結果も別ファイルに出力
  const selectedPath = path.join(DATA_DIR, 'selected-games.json');
  fs.writeFileSync(selectedPath, JSON.stringify(selectedGames, null, 2));
  console.log(`Selected games saved to: ${selectedPath}`);

  // サマリー出力
  console.log('');
  console.log('=== Summary ===');
  console.log(`Steam Top Sellers: ${steamData.topSellers.length}`);
  console.log(`Steam Top Played: ${steamData.topPlayed.length}`);
  console.log(`YouTube Videos: ${youtubeData.trendingVideos.length}`);
  console.log(`IGDB Games: ${igdbData.games.length}`);
  console.log(`Metacritic Scores: ${metacriticData.scores.length}`);
  console.log(`Total Aggregated: ${games.length}`);
  console.log('');
  console.log(`Finished at: ${new Date().toISOString()}`);
}

// スクリプト実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
