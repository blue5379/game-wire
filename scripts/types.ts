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
  isAdultContent?: boolean;
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
  titleJa?: string; // 日本語タイトル（game_localizations region=5から取得）
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
  steamUrl?: string;
  officialUrl?: string; // IGDB websites から推定した公式サイトURL
  officialUrlSource?: 'igdb-official' | 'igdb-fallback'; // officialUrl の由来
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
  titleJa?: string; // 日本語タイトル（game_localizations region=3から取得）
  normalizedTitle: string;
  steamAppId?: number;
  igdbSlug?: string; // IGDB用スラッグ
  genres: string[];
  platforms: string[];
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  developerCountry?: string; // 開発国名
  coverImage?: string;
  screenshots?: string[];
  summary?: string;
  igdbRating?: number;
  igdbRatingCount?: number;
  metascore?: number | null;
  userScore?: number | null;
  steamRank?: number;
  steamPlayers?: number;
  youtubePopularity?: number;
  source: ('steam' | 'youtube' | 'igdb' | 'metacritic')[];
  sourceUrls?: SourceUrls; // 参照元URL
  /** Steam Storefront から取得した生の developer 文字列（isQualifiedCompanyName で弾かれる前の値） */
  steamRawDeveloper?: string;
  /** Steam recommendations 件数（話題性閾値判定用） */
  steamRecommendations?: number;
  /** カバー画像の向き。HEAD 200 検証済み URL のみ coverImage に入る。横長画像は blur 背景で表示 */
  coverImageOrientation?: 'portrait' | 'landscape';
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

// 特集記事のおすすめゲーム
export interface RecommendedGame {
  title: string;
  coverImage?: string;
  officialUrl?: string;
  platforms?: string[];
  developer?: string;
  publisher?: string;
}

// ゲームカテゴリ（記事生成用）
export type GameCategory = 'newRelease' | 'indie' | 'feature' | 'classic';

export type StorePlatform =
  | 'steam'
  | 'nintendo'
  | 'playstation'
  | 'xbox'
  | 'appstore'
  | 'googleplay'
  | 'epicgames'
  | 'gog';

export interface StoreLink {
  platform: StorePlatform;
  url: string;
  resolvedBy: 'cache' | 'igdb-website' | 'storesearch' | 'web-search' | 'manual';
  confidence: 'high' | 'medium' | 'low';
}

// 参照元URL
export interface SourceUrls {
  /** 公式日本語ページ（既存） */
  official?: string;
  officialUrlSource?: 'tavily' | 'igdb-official' | 'igdb-fallback';
  /** プラットフォーム別ストアリンク（複数） */
  stores?: StoreLink[];
  /** 補助リンク（既存、後方互換） */
  igdb?: string;
  metacritic?: string;
  /** @deprecated stores[] に移行。互換シムで変換する */
  steam?: string;
}

// 記事生成用のゲーム選定結果
export interface SelectedGames {
  newReleases: GameData[]; // 大手企業の新作 2本
  indies: GameData[]; // インディーゲーム 2本
  indieReserves: GameData[]; // インディー差し替え予備プール（デバッグ/ログ用）
  featured: GameData | null; // 特集記事用
  classic: GameData | null; // 名作深掘り用
}
