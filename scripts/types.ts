/**
 * Game Wire - 共通型定義
 */

// Steam から取得するゲームデータ
export interface SteamGame {
  appId: number;
  name: string;
  rank?: number;
  currentPlayers?: number;
  peakPlayers?: number;
  priceFormatted?: string;
  discount?: number;
}

export interface SteamData {
  topSellers: SteamGame[];
  topPlayed: SteamGame[];
  fetchedAt: string;
}

// YouTube から取得するトレンドデータ
export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount?: number;
  description: string;
  thumbnailUrl: string;
  extractedGameTitle?: string;
}

export interface YouTubeData {
  trendingVideos: YouTubeVideo[];
  fetchedAt: string;
}

// IGDB から取得するゲームメタデータ
export interface IGDBGame {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  genres?: string[];
  platforms?: string[];
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  developerCountry?: string; // 開発国名（日本語）
  coverUrl?: string;
  screenshotUrls?: string[];
  rating?: number;
  ratingCount?: number;
}

export interface IGDBData {
  games: IGDBGame[];
  fetchedAt: string;
}

// Metacritic から取得するスコアデータ
export interface MetacriticScore {
  title: string;
  platform: string;
  metascore: number | null;
  userScore: number | null;
  url?: string;
}

export interface MetacriticData {
  scores: MetacriticScore[];
  fetchedAt: string;
}

// 統合されたゲームデータ
export interface GameData {
  title: string;
  normalizedTitle: string;
  steamAppId?: number;
  genres: string[];
  platforms: string[];
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  developerCountry?: string; // 開発国名
  coverImage?: string;
  screenshots?: string[];
  summary?: string;
  metascore?: number | null;
  userScore?: number | null;
  steamRank?: number;
  steamPlayers?: number;
  youtubePopularity?: number;
  source: ('steam' | 'youtube' | 'igdb' | 'metacritic')[];
  // AI推測情報
  isAiInferred?: boolean; // AIによる推測情報かどうか
  aiInferredFields?: string[]; // AIが推測したフィールド名のリスト
}

// 統合データ出力
export interface AggregatedData {
  games: GameData[];
  steamData: SteamData;
  youtubeData: YouTubeData;
  igdbData: IGDBData;
  metacriticData: MetacriticData;
  fetchedAt: string;
}

// ユーティリティ型
export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ゲームカテゴリ（記事生成用）
export type GameCategory = 'newRelease' | 'indie' | 'feature' | 'classic';

// 記事生成用のゲーム選定結果
export interface SelectedGames {
  newReleases: GameData[]; // 大手企業の新作 2本
  indies: GameData[]; // インディーゲーム 2本
  featured: GameData | null; // 特集記事用
  classic: GameData | null; // 名作深掘り用
}
