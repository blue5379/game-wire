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
import { fetchIGDBData, enrichGameWithIGDB } from './fetch-igdb.js';
import { fetchMetacriticData, getGameScore } from './fetch-metacritic.js';
import { getCooldownTitles } from './game-history.js';
import { isBlockedAdultGame } from './adult-blocklist.js';
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
 * 無効なゲームタイトルかどうかをチェック
 */
function isInvalidGameTitle(title: string): boolean {
  const normalized = normalizeTitle(title);

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

/**
 * 2つのタイトルが同じゲームを指すか判定
 */
function isSameGame(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // いずれかが無効なタイトルの場合はマッチしない
  if (isInvalidGameTitle(title1) || isInvalidGameTitle(title2)) {
    return false;
  }

  // 完全一致
  if (norm1 === norm2) return true;

  // 部分一致（一方が他方を含む）- ただし含まれる側が十分な長さを持つ場合のみ
  const minLengthForPartialMatch = 5;
  if (norm1.includes(norm2) && norm2.length >= minLengthForPartialMatch) return true;
  if (norm2.includes(norm1) && norm1.length >= minLengthForPartialMatch) return true;

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
    if (isBlockedAdultGame(steam.name)) {
      console.log(`  [Blocklist] Skipping adult game: "${steam.name}"`);
      continue;
    }
    const normalized = normalizeTitle(steam.name);
    const steamUrl = `https://store.steampowered.com/app/${steam.appId}`;

    if (!gameMap.has(normalized)) {
      gameMap.set(normalized, {
        title: steam.name,
        normalizedTitle: normalized,
        steamAppId: steam.appId,
        genres: [],
        platforms: ['PC'],
        steamRank: i + 1,
        source: ['steam'],
        sourceUrls: { steam: steamUrl },
      });
    } else {
      const existing = gameMap.get(normalized)!;
      existing.steamAppId = steam.appId;
      existing.steamRank = i + 1;
      if (!existing.source.includes('steam')) {
        existing.source.push('steam');
      }
      existing.sourceUrls = existing.sourceUrls || {};
      existing.sourceUrls.steam = steamUrl;
    }
  }

  // Steam Top Played を追加
  for (const steam of steamData.topPlayed) {
    if (isBlockedAdultGame(steam.name)) {
      console.log(`  [Blocklist] Skipping adult game: "${steam.name}"`);
      continue;
    }
    const normalized = normalizeTitle(steam.name);
    const steamUrl = `https://store.steampowered.com/app/${steam.appId}`;

    if (!gameMap.has(normalized)) {
      gameMap.set(normalized, {
        title: steam.name,
        normalizedTitle: normalized,
        steamAppId: steam.appId,
        genres: [],
        platforms: ['PC'],
        steamPlayers: steam.currentPlayers,
        source: ['steam'],
        sourceUrls: { steam: steamUrl },
      });
    } else {
      const existing = gameMap.get(normalized)!;
      existing.steamPlayers = steam.currentPlayers;
      existing.sourceUrls = existing.sourceUrls || {};
      if (!existing.sourceUrls.steam) {
        existing.sourceUrls.steam = steamUrl;
      }
    }
  }

  // YouTube から抽出されたゲームタイトルを追加
  const youtubeTitleCounts = new Map<string, number>();
  // YouTube動画情報をゲームタイトルごとに保持（URL収集用）
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
    // 無効なタイトルはスキップ
    if (isInvalidGameTitle(normalized)) {
      console.log(`  Skipping invalid YouTube title: "${normalized}"`);
      continue;
    }

    // YouTube動画URLを収集
    const videos = youtubeVideosByGame.get(normalized) || [];
    const youtubeUrls = videos.slice(0, 3).map((v) => `https://www.youtube.com/watch?v=${v.videoId}`);

    // 既存のゲームとマッチするか確認
    let matched = false;
    for (const [key, game] of gameMap.entries()) {
      if (isSameGame(key, normalized)) {
        game.youtubePopularity = (game.youtubePopularity || 0) + viewCount;
        if (!game.source.includes('youtube')) {
          game.source.push('youtube');
        }
        // YouTube URLsを追加
        game.sourceUrls = game.sourceUrls || {};
        game.sourceUrls.youtube = youtubeUrls;
        matched = true;
        break;
      }
    }

    // パターンBを廃止: 未確認タイトルは追加しない
  }

  // IGDB データでエンリッチ
  for (const igdb of igdbData.games) {
    if (isBlockedAdultGame(igdb.name)) {
      console.log(`  [Blocklist] Skipping adult game: "${igdb.name}"`);
      continue;
    }
    const normalized = normalizeTitle(igdb.name);
    const igdbUrl = igdb.slug ? `https://www.igdb.com/games/${igdb.slug}` : undefined;

    // 既存のゲームとマッチするか確認
    let matched = false;
    for (const [key, game] of gameMap.entries()) {
      if (isSameGame(key, normalized)) {
        // IGDB データで補完
        game.title = igdb.name; // 正式名称に更新
        game.normalizedTitle = normalizeTitle(igdb.name); // normalizedTitle も正式名称から再計算
        game.titleJa = igdb.titleJa || game.titleJa;
        game.igdbSlug = igdb.slug || game.igdbSlug;
        game.genres = igdb.genres || game.genres;
        game.platforms = igdb.platforms || game.platforms;
        game.releaseDate = igdb.releaseDate || game.releaseDate;
        game.developer = igdb.developer || game.developer;
        game.publisher = igdb.publisher || game.publisher;
        game.developerCountry = igdb.developerCountry || game.developerCountry;
        game.coverImage = igdb.coverUrl || game.coverImage;
        game.screenshots = igdb.screenshotUrls || game.screenshots;
        game.summary = igdb.summary || game.summary;
        game.igdbRating = igdb.rating ?? game.igdbRating;
        game.igdbRatingCount = igdb.ratingCount ?? game.igdbRatingCount;
        if (!game.source.includes('igdb')) {
          game.source.push('igdb');
        }
        // IGDB URLを追加
        if (igdbUrl) {
          game.sourceUrls = game.sourceUrls || {};
          game.sourceUrls.igdb = igdbUrl;
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      gameMap.set(normalized, {
        title: igdb.name,
        titleJa: igdb.titleJa,
        normalizedTitle: normalized,
        igdbSlug: igdb.slug,
        genres: igdb.genres || [],
        platforms: igdb.platforms || [],
        releaseDate: igdb.releaseDate,
        developer: igdb.developer,
        publisher: igdb.publisher,
        developerCountry: igdb.developerCountry,
        coverImage: igdb.coverUrl,
        screenshots: igdb.screenshotUrls,
        summary: igdb.summary,
        igdbRating: igdb.rating,
        igdbRatingCount: igdb.ratingCount,
        source: ['igdb'],
        sourceUrls: igdbUrl ? { igdb: igdbUrl } : undefined,
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
        // Metacritic URLを追加
        if (score.url) {
          game.sourceUrls = game.sourceUrls || {};
          game.sourceUrls.metacritic = score.url;
        }
        break;
      }
    }
  }

  // 不足しているメタデータを IGDB から補完
  console.log('Enriching games with IGDB data...');
  let enrichedCount = 0;
  for (const game of gameMap.values()) {
    // 無効なタイトルはIGDB検索をスキップ
    if (isInvalidGameTitle(game.title)) {
      console.log(`  Skipping IGDB enrichment for invalid title: "${game.title}"`);
      continue;
    }

    if (!game.coverImage || game.genres.length === 0) {
      const igdbGame = await enrichGameWithIGDB(game.title);
      if (igdbGame) {
        game.titleJa = igdbGame.titleJa || game.titleJa;
        game.igdbSlug = igdbGame.slug || game.igdbSlug;
        game.genres = igdbGame.genres || game.genres;
        game.platforms = igdbGame.platforms || game.platforms;
        game.releaseDate = igdbGame.releaseDate || game.releaseDate;
        game.developer = igdbGame.developer || game.developer;
        game.publisher = igdbGame.publisher || game.publisher;
        game.developerCountry = igdbGame.developerCountry || game.developerCountry;
        game.coverImage = igdbGame.coverUrl || game.coverImage;
        game.screenshots = igdbGame.screenshotUrls || game.screenshots;
        game.summary = igdbGame.summary || game.summary;
        game.igdbRating = igdbGame.rating ?? game.igdbRating;
        game.igdbRatingCount = igdbGame.ratingCount ?? game.igdbRatingCount;
        if (!game.source.includes('igdb')) {
          game.source.push('igdb');
        }
        // IGDB URLを追加
        if (igdbGame.slug) {
          game.sourceUrls = game.sourceUrls || {};
          game.sourceUrls.igdb = `https://www.igdb.com/games/${igdbGame.slug}`;
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


  return Array.from(gameMap.values());
}

/**
 * 記事生成用にゲームを選定
 */
function selectGamesForArticles(games: GameData[]): SelectedGames {
  const now = new Date();

  // カテゴリ別クールダウン中タイトルを取得
  const newReleaseCooldown = getCooldownTitles('newRelease', now);
  const indieCooldown = getCooldownTitles('indie', now);
  const classicCooldown = getCooldownTitles('classic', now);

  if (newReleaseCooldown.size > 0) {
    console.log(`  newRelease cooldown: ${[...newReleaseCooldown].join(', ')}`);
  }
  if (indieCooldown.size > 0) {
    console.log(`  indie cooldown: ${[...indieCooldown].join(', ')}`);
  }
  if (classicCooldown.size > 0) {
    console.log(`  classic cooldown: ${[...classicCooldown].join(', ')}`);
  }

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
    .filter((g) => !newReleaseCooldown.has(g.normalizedTitle))
    .sort((a, b) => (b.metascore || b.igdbRating || 0) - (a.metascore || a.igdbRating || 0));

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
    'game freak',
    'ゲームフリーク',
    'rockstar',
    'valve',
    'riot',
    'epic games',
    'mihoyo',
    'hoyoverse',
    'netease',
    'tencent',
    'mojang',
  ];

  const isIndie = (game: GameData): boolean => {
    const hasIndieTag = game.genres?.some((g) => g.toLowerCase() === 'indie') ?? false;
    const publisher = (game.publisher || '').toLowerCase();
    const developer = (game.developer || '').toLowerCase();
    const isNotLargePublisher = !largePublishers.some(
      (p) => publisher.includes(p) || developer.includes(p)
    );
    return hasIndieTag || isNotLargePublisher;
  };

  const indieScore = (g: GameData): number =>
    (g.youtubePopularity || 0) +
    (g.steamRank ? 1000 - g.steamRank : 0) +
    (g.igdbRating || 0) * 10;

  const indieGames = games
    .filter(isIndie)
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => g.source.includes('steam') || g.source.includes('igdb')) // 実在確認済みのみ
    .filter((g) => g.coverImage || g.summary)
    .filter((g) => !indieCooldown.has(g.normalizedTitle))
    .sort((a, b) => indieScore(b) - indieScore(a));

  const indies = indieGames
    .filter((g) => !newReleases.some((nr) => nr.title === g.title))
    .slice(0, 2);

  // 特集記事用（シーズンイベント関連 or 人気タイトル）
  const featured =
    games.find(
      (g) =>
        g.genres?.some((genre) =>
          ['sports', 'racing', 'simulation'].includes(genre.toLowerCase())
        ) && ((g.metascore && g.metascore > 75) || (g.igdbRating && g.igdbRating >= 75))
    ) || games.find((g) => g.steamPlayers && g.steamPlayers > 50000) || null;

  // 名作深掘り（高スコア + 人気、またはメタスコアが非常に高い）
  const classicCandidates = games
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => !classicCooldown.has(g.normalizedTitle))
    .filter((g) => (g.metascore && g.metascore > 80) || (g.igdbRating && g.igdbRating >= 80))
    .filter((g) => {
      // スコアが非常に高い（85以上）場合は Steam/YouTube データなしでも選定
      if ((g.metascore && g.metascore >= 85) || (g.igdbRating && g.igdbRating >= 85)) return true;
      // それ以外は Steam/YouTube での人気が必要
      return g.steamPlayers || g.steamRank || (g.youtubePopularity && g.youtubePopularity > 100000);
    })
    .filter((g) => g.coverImage && g.summary) // 記事に必要な情報があるもの
    .filter(
      (g) =>
        !newReleases.some((nr) => nr.title === g.title) &&
        !indies.some((i) => i.title === g.title) &&
        g.title !== featured?.title
    )
    .sort((a, b) => (b.metascore || b.igdbRating || 0) - (a.metascore || a.igdbRating || 0));

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
