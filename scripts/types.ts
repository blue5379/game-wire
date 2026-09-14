/**
 * Game Wire - 共通型定義
 */

// Steam から取得するゲームデータ
export interface SteamGame {
  appId: number;
  name: string;
  rank?: number;
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

/**
 * IGDB `release_dates` の1エントリ（機種別の発売日、Issue #339）。
 *
 * `IGDBGame.releaseDate`（= `first_release_date`）は**最も早い機種の発売日1つだけ**なので、
 * 「PC は発売済みだが Switch 2 版は3ヶ月後」というマルチプラットフォームタイトルで
 * 執筆AIに「発売日: 2026-05-22（発売済み）」＋「対応機種: PC, Switch 2, ...」という
 * 誤解を招く入力を渡すことになる（実測: 発行済み21号で7記事が未発売機種を
 * 「発売中」と書いていた）。機種別の発売日を保持して執筆プロンプトに渡すために持つ。
 *
 * ⚠️ **1機種に複数エントリがあるのが普通。** 実測（LEGO Batman: Legacy of the Dark Knight）
 * では PC/PS5/Xbox それぞれに Advanced Access（2026-05-19）と Full Release（2026-05-22）の
 * 2エントリがある。機種ごとに1件を選ぶのではなく、全エントリを持ったまま
 * `classifyPlatformRelease`（bedrock-client.ts）で「その機種で買えるか」を判定する。
 */
export interface PlatformReleaseDate {
  /** IGDB `release_dates.platform.name`（例: "PC (Microsoft Windows)"、"Nintendo Switch 2"） */
  platform: string;
  /**
   * IGDB `release_dates.date` を UTC 日付に落とした値（YYYY-MM-DD）。`date_format=7`（TBD）では
   * IGDB 自体が値を返さないため `undefined`。
   *
   * ⚠️ **この値を期間の境界として使ってはならない。** `date_format` が粗いとき IGDB が
   * `date` に入れる位置は一貫していない（2026-09-14 実測: `date_format=1`（YYYYMM）は
   * 月初 = "Dec 1989" → 1989-12-01、`date_format=2`（YYYY）と四半期は末日 =
   * "2006" → 2006-12-31、"Q1 2020" → 2020-03-31）。期間の上下界は `date_format` から導出する。
   */
  date?: string;
  /**
   * IGDB `release_dates.date_format`。`/date_formats` エンドポイントの実測値（2026-09-14）:
   * 0=YYYYMMDD（確定日）/ 1=YYYYMM（月まで）/ 2=YYYY（年のみ）/ 3=YYYYQ1 / 4=YYYYQ2 /
   * 5=YYYYQ3 / 6=YYYYQ4 / 7=TBD。
   */
  dateFormat?: number;
  /** IGDB `release_dates.human`（"May 22, 2026" / "Q3 2026" / "2026" / "TBD"）。プロンプトにそのまま出す表記 */
  human?: string;
  /**
   * IGDB `release_dates.status`。`release_date_statuses` エンドポイントの実測値（2026-09-13）:
   * 1=Alpha / 2=Beta / 3=Early Access / 4=Offline / 5=Cancelled / 6=Full Release /
   * 34=Advanced Access / 35=Digital Compatibility Release / 36=Next-Gen Optimization Patch Release。
   *
   * ⚠️ **多くのエントリで IGDB は status を返さない**（省略 = 通常の発売）。`=== 6` で
   * 絞り込むと省略エントリが全部落ちる。判定は `classifyPlatformRelease` に委ねる。
   */
  status?: number;
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
  /** 機種別の発売日（Issue #339）。`PlatformReleaseDate` の JSDoc を参照 */
  platformReleaseDates?: PlatformReleaseDate[];
  developer?: string;
  publisher?: string;
  developerCountry?: string; // 開発国名（日本語）
  coverUrl?: string;
  screenshotUrls?: string[];
  rating?: number;
  ratingCount?: number;
  steamUrl?: string;
  officialUrl?: string; // IGDB websites から推定した公式サイトURL
  officialUrlSource?: 'igdb-official'; // officialUrl の由来。公式タグ付きのみ採用（Issue #117 の allow-list 方針。タグは type=1、category=1 は後方互換: Issue #234）
  websites?: { url: string; category?: number; type?: number }[]; // IGDB raw websites（Identity Resolver に引き渡すため）。Issue #234: type が正、category は後方互換
  /** IGDB のゲーム種別（0=Main Game, 8=Remake, 9=Remaster）。新作枠のリメイク明記に使う（§6.2） */
  gameType?: number;
  /** 批評スコア集計（Metacritic 相当）。新作枠スコアの批評軸（§2.3） */
  aggregatedRating?: number;
  /** 批評スコアの集計媒体数。批評軸の信頼度補正と保有条件に使う（§2.3） */
  aggregatedRatingCount?: number;
  /** IGDB キーワードの slug 一覧。ファンゲーム判定に使う（§6.1） */
  keywords?: string[];
  /** 開発元（developer）の IGDB `developed` 件数。規模判定に使う（§3.4）。生件数で Main Game への数え直しはしない */
  developerGameCount?: number;
  /** 総合評価（批評+ユーザーの合成値）。名作枠の母集団条件に使う（§5.4） */
  totalRating?: number;
  /** 総合評価の評価母数。名作枠の母集団条件・並び順に使う（§5.4/§5.8） */
  totalRatingCount?: number;
  /**
   * IGDB の `game_status` 生値（0=Released, 2=Alpha, 3=Beta, **4=Early Access**,
   * 5=Offline, 6=Cancelled, 7=Rumored, 8=Delisted）。名作枠の早期アクセス除外ゲートに使う（§2.9/§5.4）。
   *
   * ⚠️ **記事本文の早期アクセス表記には使わない。** 実測でこの値は両方向に外れる:
   * `Realm of Ink` は `game_status=4` だが Steam ストアでは既に早期アクセスを終えている（偽陽性）、
   * `ARK: Survival Ascended` は `null` だが Steam では早期アクセス中（偽陰性）。
   * 本文で「早期アクセス」と書くかどうかは `isEarlyAccess`（Steam 一次ソース）だけで決める。
   * 生値のまま持つ理由: 除外ゲートの判定を呼び出し側に委ね、将来 Offline/Delisted 等の
   * 別状態を扱うときにフィールドを増やさずに済むから。
   */
  gameStatus?: number;
  /**
   * J-3-e（§5.5決着）: game_type が 8（Remake）/9（Remaster）のリメイク・リマスターについて、
   * 名作枠の母集団に含めてよいかを表す。`gameType` が 0（Main Game）や未指定など 8/9 以外の
   * 場合は無関係なので `undefined`。8/9 の場合は「原作（parent_game）が §5.4 の母集団条件
   * （`total_rating >= 閾値 & total_rating_count >= 閾値 & game_type = 0`。親の `game_type`
   * も含む）を満たさない」なら `true`、満たすなら `false`。親の情報が取れない場合は `true`
   * （原作が特定できない＝母集団に原作が居ることを示せないため許可する）。
   * 実測例: `Final Fantasy VII Remake` の親 `Final Fantasy VII` は total_rating/total_rating_count
   * が閾値を超えるが `game_type=10`（拡張版扱い）のため母集団外 → `true`（許可）。
   * ⚠️ 選定側では `undefined` を「除外」として扱う（この値そのものの意味とは非対称。
   * フィールドの転記漏れが起きたときに安全側＝リメイクを載せない方向に倒すため）。
   */
  classicRemakeEligible?: boolean;
}

export interface IGDBData {
  games: IGDBGame[];
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
  /** 機種別の発売日（Issue #339）。`PlatformReleaseDate` の JSDoc を参照 */
  platformReleaseDates?: PlatformReleaseDate[];
  developer?: string;
  publisher?: string;
  developerCountry?: string; // 開発国名
  coverImage?: string;
  screenshots?: string[];
  summary?: string;
  igdbRating?: number;
  igdbRatingCount?: number;
  steamRank?: number;
  youtubePopularity?: number;
  source: ('steam' | 'youtube' | 'igdb')[];
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
  /** IGDB websites（Identity Resolver に渡すための中間保持用）。Issue #234: type が正、category は後方互換 */
  igdbWebsites?: { url: string; category?: number; type?: number }[];
  /** IGDB のゲーム種別（0=Main Game, 8=Remake, 9=Remaster）。新作枠のリメイク明記に使う（§6.2） */
  gameType?: number;
  /** 批評スコア集計（Metacritic 相当）。新作枠スコアの批評軸（§2.3） */
  aggregatedRating?: number;
  /** 批評スコアの集計媒体数。批評軸の信頼度補正と保有条件に使う（§2.3） */
  aggregatedRatingCount?: number;
  /** IGDB キーワードの slug 一覧。ファンゲーム判定に使う（§6.1） */
  keywords?: string[];
  /** 開発元（developer）の IGDB `developed` 件数。規模判定に使う（§3.4）。生件数で Main Game への数え直しはしない */
  developerGameCount?: number;
  /** 総合評価（批評+ユーザーの合成値）。名作枠の母集団条件に使う（§5.4） */
  totalRating?: number;
  /** 総合評価の評価母数。名作枠の母集団条件・並び順に使う（§5.4/§5.8） */
  totalRatingCount?: number;
  /**
   * J-3-e（§5.5決着）: game_type が 8（Remake）/9（Remaster）のリメイク・リマスターについて、
   * 名作枠の母集団に含めてよいかを表す。IGDBGame.classicRemakeEligible の説明を参照。
   * ⚠️ 選定側（isClassicRemakeAllowed）では `undefined` を「除外」として扱う。
   */
  classicRemakeEligible?: boolean;
  /**
   * 早期アクセス（Early Access）配信中かどうか（Issue #26、§2.9）。
   *
   * **一次ソースは Steam Storefront の `genres` に id 70（日本語ラベル「早期アクセス」）が
   * 含まれるかどうかだけ**。IGDB の `game_status` は使わない（`gameStatus` の JSDoc に理由）。
   *
   * `undefined` は「未判定」であって「早期アクセスではない」ではない。
   * Steam ストアに無いタイトル（例: Hytale）や `steamAppId` が判明していないタイトルは
   * 常に `undefined` になる。**本文表記・バリデータはどちらも `=== true` でしか発火させない**
   * （偽陽性で「早期アクセス」と書くと、正式リリース済みの作品に新たな誤情報を足すことになる）。
   */
  isEarlyAccess?: boolean;
  /**
   * IGDB の `game_status` 生値。名作枠の早期アクセス除外ゲートに使う（§5.4）。
   * 値の意味と、本文表記に使ってはならない理由は IGDBGame.gameStatus の JSDoc を参照。
   */
  igdbGameStatus?: number;
}

// 統合データ出力
export interface AggregatedData {
  games: GameData[];
  steamData: SteamData;
  youtubeData: YouTubeData;
  igdbData: IGDBData;
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
  /**
   * officialUrl の由来。Issue #247: build-issue.ts の出力ゲートで
   * 'tavily' | 'igdb-official' 以外は officialUrl を出力しない多層防御に使う。
   * SourceUrls['officialUrlSource'] と同じ型。
   */
  officialUrlSource?: 'tavily' | 'igdb-official';
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
  /**
   * officialUrl の由来。
   * Issue #117 で 'igdb-fallback'（category=1 タグ無しで機械採用）は廃止。
   * 既存の generated-articles.json などキャッシュとの互換のため文字列としては読み込み可能だが、
   * build-issue.ts の最終ゲートで 'tavily' | 'igdb-official' 以外は採用しない。
   */
  officialUrlSource?: 'tavily' | 'igdb-official';
  /** 公式URL採用時の内容検証結果（reason）。事後追跡用。Issue #117 P3 */
  officialVerifyReason?: string;
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
  newReleases: GameData[]; // 新作紹介 2本（企業規模は問わない。論点A / Issue #336）
  newReleasesReserves: GameData[]; // 新作差し替え予備プール（removeZombieGames 後の補充用）
  indies: GameData[]; // インディーゲーム 2本
  indieReserves: GameData[]; // インディー差し替え予備プール（デバッグ/ログ用）
  classic: GameData | null; // 名作深掘り用
}
