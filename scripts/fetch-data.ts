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
import { isFanGame, isQualifiedGame } from './game-filter.js';
import { fetchOfficialJpUrl } from './fetch-official-jp-url.js';
import { isIndieGame } from './indie-classifier.js';
import { parseSteamReleaseDate as _parseSteamReleaseDate, isQualifiedCompanyName as _isQualifiedCompanyName } from './steam-utils.js';
import { selectIndieGamesWithFallback } from './select-indie-with-fallback.js';
import { selectNewReleasesWithFallback, hasExistenceEvidence } from './select-newreleases-with-fallback.js';
import { hasAllRequiredFields } from './finalize-game-metadata.js';
import { resolveGameIdentity } from './identity-resolver.js';
import { runCompletenessGate, getGateMode } from './completeness-gate.js';
import type { ResolverTrace } from './completeness-gate.js';
import { normalizeTitle } from './normalize.js';
import type {
  SteamData,
  YouTubeData,
  IGDBData,
  MetacriticData,
  GameData,
  AggregatedData,
  SelectedGames,
} from './types.js';

// 出力ディレクトリ
const DATA_DIR = path.join(process.cwd(), 'data');

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
 * リリース日文字列から年(YYYY)を抽出。失敗時 undefined。
 */
function extractYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const m = releaseDate.match(/^(\d{4})/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : undefined;
}

// 同名異作品を区別するための発売年差の閾値（±N年）
// 早期アクセス→正式版、リマスター、地域別リリース等のズレを許容しつつ、
// 同名異作品（一般的に10年以上離れる）は弾ける範囲。
const SAME_GAME_YEAR_TOLERANCE = 3;

// steam-utils.ts に移動済み。後方互換のため re-export する
export { parseSteamReleaseDate, isQualifiedCompanyName } from './steam-utils.js';
// テスト内での import 競合を避けるため内部使用は エイリアス経由
const parseSteamReleaseDate = _parseSteamReleaseDate;
const isQualifiedCompanyName = _isQualifiedCompanyName;

/**
 * Steam ストア URL から appId を抽出
 */
function extractSteamAppId(url?: string): number | undefined {
  if (!url) return undefined;
  const m = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (!m) return undefined;
  const id = parseInt(m[1], 10);
  return Number.isFinite(id) ? id : undefined;
}

/**
 * タイトルの文字列が同一ゲームを指す可能性があるか
 */
function titleMatches(title1: string, title2: string): boolean {
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
 * 2つのゲームが同一作品を指すか判定
 * - タイトル一致を前提に、発売年が両方判明していれば ±SAME_GAME_YEAR_TOLERANCE 年に限定
 * - 片方が不明な場合はタイトル一致のみで通す（誤分離 false negative の抑制）
 */
function isSameGame(
  g1: { title: string; releaseDate?: string },
  g2: { title: string; releaseDate?: string }
): boolean {
  if (!titleMatches(g1.title, g2.title)) return false;

  const y1 = extractYear(g1.releaseDate);
  const y2 = extractYear(g2.releaseDate);
  if (y1 !== undefined && y2 !== undefined) {
    if (Math.abs(y1 - y2) > SAME_GAME_YEAR_TOLERANCE) return false;
  }
  return true;
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

  for (const video of youtubeData.trendingVideos) {
    if (video.extractedGameTitle) {
      const normalized = normalizeTitle(video.extractedGameTitle);
      const count = youtubeTitleCounts.get(normalized) || 0;
      youtubeTitleCounts.set(normalized, count + video.viewCount);
    }
  }

  for (const [normalized, viewCount] of youtubeTitleCounts.entries()) {
    // 無効なタイトルはスキップ
    if (isInvalidGameTitle(normalized)) {
      console.log(`  Skipping invalid YouTube title: "${normalized}"`);
      continue;
    }

    // 既存のゲームとマッチするか確認
    let matched = false;
    for (const [, game] of gameMap.entries()) {
      // YouTubeから抽出したタイトルには発売年情報がないため、年照合は適用されずタイトル一致で通る
      if (isSameGame({ title: game.title, releaseDate: game.releaseDate }, { title: normalized })) {
        game.youtubePopularity = (game.youtubePopularity || 0) + viewCount;
        if (!game.source.includes('youtube')) {
          game.source.push('youtube');
        }
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
    // 第3層: Steam appId が一致すれば強く同一と確定（タイトル・発売年に関係なく優先マージ）
    const igdbSteamAppId = extractSteamAppId(igdb.steamUrl);
    let matched = false;
    for (const [, game] of gameMap.entries()) {
      const sameByAppId =
        igdbSteamAppId !== undefined && game.steamAppId === igdbSteamAppId;
      const sameByTitleYear = isSameGame(
        { title: game.title, releaseDate: game.releaseDate },
        { title: igdb.name, releaseDate: igdb.releaseDate }
      );
      // appId が両方分かっていて異なる場合は別作品として確定（強分離）
      if (
        igdbSteamAppId !== undefined &&
        game.steamAppId !== undefined &&
        game.steamAppId !== igdbSteamAppId
      ) {
        continue;
      }
      if (sameByAppId || sameByTitleYear) {
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
        if (igdb.websites?.length) {
          game.igdbWebsites = igdb.websites;
        }
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
        igdbWebsites: igdb.websites?.length ? igdb.websites : undefined,
        source: ['igdb'],
        sourceUrls: igdbUrl ? { igdb: igdbUrl } : undefined,
      });
    }
  }

  // Metacritic スコアを追加
  for (const score of metacriticData.scores) {
    const normalized = normalizeTitle(score.title);

    for (const [, game] of gameMap.entries()) {
      // Metacritic 側に発売年情報がないため、年照合は適用されずタイトル一致で通る
      if (isSameGame({ title: game.title, releaseDate: game.releaseDate }, { title: normalized })) {
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
      // 第2層: 既知の発売年を渡し、検索結果の同名異作品（年が大きく異なる）を拒絶する
      const expectedYear = extractYear(game.releaseDate);
      const igdbGame = await enrichGameWithIGDB(game.title, { expectedYear });
      if (igdbGame) {
        // 第4層: enrich後の整合性チェック（Issue #50対策）
        // searchGameByName の単語マッチが甘い経路で別ゲームが返るケースを最後に弾く。
        // appId が一致するなら無条件に同一とみなす（強い同一性）。
        // それ以外で title / 発売年が大きく食い違う場合は上書きを拒否し、enrich失敗扱いにする。
        const igdbAppId = extractSteamAppId(igdbGame.steamUrl);
        const sameByAppId =
          igdbAppId !== undefined &&
          game.steamAppId !== undefined &&
          game.steamAppId === igdbAppId;
        if (!sameByAppId) {
          const sameByTitleYear = isSameGame(
            { title: game.title, releaseDate: game.releaseDate },
            { title: igdbGame.name, releaseDate: igdbGame.releaseDate }
          );
          if (!sameByTitleYear) {
            console.warn(
              `  IGDB enrich rejected (identity mismatch): "${game.title}" vs "${igdbGame.name}"`
            );
            continue;
          }
        }
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
        // IGDB websites(category=13)の Steam URL から appId を引き継ぐ
        // sourceUrls.steam の設定は reconcileSelectedGames（Identity Resolver）に委譲する
        if (igdbGame.steamUrl) {
          const appId = extractSteamAppId(igdbGame.steamUrl);
          if (appId !== undefined && game.steamAppId === undefined) {
            game.steamAppId = appId;
          }
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

  // Steam Storefront API による補完: IGDB enrich が成功しなかったゲームを Steam の公式情報で穴埋め
  // - 対象: coverImage が未設定で、かつ steamAppId が判明しているゲーム
  // - フィールド単位で空欄のみ埋める（IGDB 由来の値は上書きしない）
  // - summary / genres は埋めない（マーケコピー・表記揺れ回避のため）
  console.log('Enriching games with Steam Storefront API...');
  let storefrontEnrichedCount = 0;
  let storefrontFailedCount = 0;
  for (const game of gameMap.values()) {
    // steamAppId がなければ Storefront から取得できないのでスキップ
    // coverImage が埋まっていても developer / steamRecommendations の補完は必要なので続行
    if (!game.steamAppId) continue;
    // developer・steamRecommendations・coverImage・screenshots のどれかが欠けている場合に補完を試みる
    const needsCompletion =
      !game.coverImage ||
      !game.developer || game.steamRecommendations === undefined ||
      !game.screenshots || game.screenshots.length === 0;
    if (!needsCompletion) continue;

    try {
      const response = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${game.steamAppId}&cc=jp&l=japanese`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) {
        storefrontFailedCount++;
        continue;
      }
      const json = (await response.json()) as Record<string, { success?: boolean; data?: any }>;
      const entry = json[String(game.steamAppId)];
      if (!entry?.success || !entry.data) {
        storefrontFailedCount++;
        continue;
      }
      const data = entry.data;

      // releaseDate: 未確定（coming_soon: true）は埋めない
      if (!game.releaseDate && data.release_date && !data.release_date.coming_soon) {
        const parsed = parseSteamReleaseDate(data.release_date.date);
        if (parsed) game.releaseDate = parsed;
      }

      // developer / publisher: 品質ガードを通過したもののみ採用
      // steamRawDeveloper は品質ガード前の生値を保存（PR-C の話題性ルートで使用）
      if (Array.isArray(data.developers) && data.developers.length > 0) {
        const dev = String(data.developers[0]).trim();
        game.steamRawDeveloper = game.steamRawDeveloper ?? dev;
        if (!game.developer && isQualifiedCompanyName(dev)) game.developer = dev;
      }
      if (!game.publisher && Array.isArray(data.publishers) && data.publishers.length > 0) {
        const pub = String(data.publishers[0]).trim();
        if (isQualifiedCompanyName(pub)) game.publisher = pub;
      }

      // steamRecommendations: 話題性閾値判定用
      if (game.steamRecommendations === undefined && data.recommendations?.total != null) {
        game.steamRecommendations = Number(data.recommendations.total);
      }

      // coverImage: aggregate フェーズでは CDN URL を無条件代入しない。
      // HEAD 200 検証は finalizeGameMetadata（PR-B）で行う。
      // ここでは screenshots のみ取得する。

      // screenshots: 1920x1080 の URL を先頭5件
      if ((!game.screenshots || game.screenshots.length === 0) && Array.isArray(data.screenshots)) {
        const urls = data.screenshots
          .map((s: any) => s?.path_full)
          .filter((u: unknown): u is string => typeof u === 'string')
          .slice(0, 5);
        if (urls.length > 0) game.screenshots = urls;
      }

      storefrontEnrichedCount++;
      // レート制限対策（既存 IGDB enrich と同等）
      if (storefrontEnrichedCount % 5 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (error) {
      storefrontFailedCount++;
      console.warn(
        `  Steam Storefront enrich failed for "${game.title}" (appId=${game.steamAppId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }
  console.log(
    `Enriched ${storefrontEnrichedCount} games with Steam Storefront (${storefrontFailedCount} failed)`
  );

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

  return deduplicateGames(Array.from(gameMap.values()));
}

/**
 * steamAppId → igdbSlug の順で同一ゲームの重複エントリをマージする。
 *
 * aggregateGames 内では、IGDB の steamUrl が未セットのタイミングで別エントリとして
 * 挿入されることがある（例: "サブノーティカ２" と "Subnautica 2"）。
 * enrich フェーズで steamAppId が補完された後でも gameMap のキーは分裂したままなので、
 * 全フェーズ完了後にここで識別子ベースの後処理 dedup を行う。
 *
 * マージ先: steamRank が小さい方、なければ source 数が多い方、それも同じなら先着。
 * スコア・人気指標は合算ではなく「より良い値」を採用する（重複加算を防ぐ）。
 */
function deduplicateGames(games: GameData[]): GameData[] {
  // グループ化: steamAppId が同じものをまとめる
  const byAppId = new Map<number, GameData[]>();
  const noAppId: GameData[] = [];

  for (const game of games) {
    if (game.steamAppId !== undefined) {
      const group = byAppId.get(game.steamAppId) ?? [];
      group.push(game);
      byAppId.set(game.steamAppId, group);
    } else {
      noAppId.push(game);
    }
  }

  // steamAppId なし組: igdbSlug が同じものをさらにグループ化
  const bySlug = new Map<string, GameData[]>();
  const remaining: GameData[] = [];

  for (const game of noAppId) {
    if (game.igdbSlug) {
      const group = bySlug.get(game.igdbSlug) ?? [];
      group.push(game);
      bySlug.set(game.igdbSlug, group);
    } else {
      remaining.push(game);
    }
  }

  const merged: GameData[] = [];

  for (const group of [...byAppId.values(), ...bySlug.values()]) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // マージ先を選ぶ: steamRank 小 → source 数大 → 先着
    group.sort((a, b) => {
      const ra = a.steamRank ?? Infinity;
      const rb = b.steamRank ?? Infinity;
      if (ra !== rb) return ra - rb;
      return b.source.length - a.source.length;
    });

    const primary = group[0];
    const duplicates = group.slice(1);

    // IGDB ソースを持つエントリが存在すれば、そのタイトルを正式名称として採用する
    // （Steam 由来の日本語ローカライズ名より IGDB の英語正式名を優先）
    const igdbEntry = group.find((g) => g.source.includes('igdb'));
    if (igdbEntry && igdbEntry !== primary) {
      primary.title = igdbEntry.title;
      primary.normalizedTitle = igdbEntry.normalizedTitle;
    }

    for (const dup of duplicates) {
      console.log(
        `  [Dedup] Merging "${dup.title}" into "${primary.title}" (steamAppId=${primary.steamAppId ?? ''}, igdbSlug=${primary.igdbSlug ?? ''})`
      );
      // titleJa: どちらかにあれば補完
      if (!primary.titleJa && dup.titleJa) primary.titleJa = dup.titleJa;
      // メタデータ: primary に欠けていれば補完
      primary.igdbSlug = primary.igdbSlug ?? dup.igdbSlug;
      primary.genres = primary.genres.length ? primary.genres : dup.genres;
      primary.platforms = primary.platforms.length ? primary.platforms : dup.platforms;
      primary.releaseDate = primary.releaseDate ?? dup.releaseDate;
      primary.developer = primary.developer ?? dup.developer;
      primary.publisher = primary.publisher ?? dup.publisher;
      primary.developerCountry = primary.developerCountry ?? dup.developerCountry;
      primary.coverImage = primary.coverImage ?? dup.coverImage;
      primary.screenshots = primary.screenshots ?? dup.screenshots;
      primary.summary = primary.summary ?? dup.summary;
      // スコア・人気指標は「より良い値」を採用
      primary.steamRank = Math.min(primary.steamRank ?? Infinity, dup.steamRank ?? Infinity);
      if (primary.steamRank === Infinity) primary.steamRank = undefined;
      primary.steamPlayers = Math.max(primary.steamPlayers ?? 0, dup.steamPlayers ?? 0) || undefined;
      primary.youtubePopularity = Math.max(primary.youtubePopularity ?? 0, dup.youtubePopularity ?? 0) || undefined;
      primary.metascore = primary.metascore ?? dup.metascore;
      primary.userScore = primary.userScore ?? dup.userScore;
      primary.igdbRating = primary.igdbRating ?? dup.igdbRating;
      primary.igdbRatingCount = primary.igdbRatingCount ?? dup.igdbRatingCount;
      // source リストをマージ
      for (const s of dup.source) {
        if (!primary.source.includes(s)) primary.source.push(s);
      }
      // sourceUrls をマージ
      if (dup.sourceUrls) {
        primary.sourceUrls = { ...dup.sourceUrls, ...primary.sourceUrls };
      }
    }

    merged.push(primary);
  }

  merged.push(...remaining);

  const dedupCount = games.length - merged.length;
  if (dedupCount > 0) {
    console.log(`  [Dedup] Removed ${dedupCount} duplicate entries`);
  }

  return merged;
}

/**
 * 選定済みゲームのストア URL を Identity Resolver で補完・検証する（設計書 C）
 *
 * 旧 verifySelectedGamesSteamUrl（削るだけ）を改名・全面書き換え。
 * Resolver が stores[] を解決し、既存の steam フィールドを Resolver 結果で置き換える。
 * Resolver でどのプラットフォームも解決できなかった場合のみ「Store 不明」としてそのまま渡す。
 *
 * 解決トレースは data/identity-resolver-trace.json に出力する（観測可能性）。
 */
async function reconcileSelectedGames(
  selectedGames: SelectedGames
): Promise<ResolverTrace> {
  const allGames: GameData[] = [
    ...selectedGames.newReleases,
    ...selectedGames.indies,
    ...(selectedGames.featured ? [selectedGames.featured] : []),
    ...(selectedGames.classic ? [selectedGames.classic] : []),
  ];

  const traceOutput: Record<string, unknown> = {};

  for (const game of allGames) {
    // 既存の steam フィールドから knownSteamAppId を引き継ぐ
    const legacySteamAppId =
      game.steamAppId ??
      (game.sourceUrls?.steam ? extractSteamAppId(game.sourceUrls.steam) : undefined);

    let resolveResult;
    try {
      resolveResult = await resolveGameIdentity({
        title: game.title,
        titleJa: game.titleJa,
        igdbSlug: game.igdbSlug,
        releaseDate: game.releaseDate,
        igdbWebsites: game.igdbWebsites,
        knownSteamAppId: legacySteamAppId,
        platforms: game.platforms,
      });
    } catch (error) {
      console.warn(`  [Reconcile] resolveGameIdentity failed for "${game.title}":`, error);
      continue;
    }

    traceOutput[game.title] = resolveResult.trace;

    if (resolveResult.stores.length > 0) {
      // Resolver 結果で stores[] を上書き
      game.sourceUrls = game.sourceUrls ?? {};
      game.sourceUrls.stores = resolveResult.stores;

      // Steam が Resolver で解決された場合: steamAppId / steam フィールドを更新
      const steamStore = resolveResult.stores.find((s) => s.platform === 'steam');
      if (steamStore) {
        // 旧 steam フィールドは Resolver 結果で置き換える（後方互換シム）
        game.sourceUrls.steam = steamStore.url;
        const resolvedAppId = extractSteamAppId(steamStore.url);
        if (resolvedAppId !== undefined) {
          game.steamAppId = resolvedAppId;
        }
        // Steam で解決できた = PC 版が存在する。IGDB のプラットフォームデータが不完全な場合に補完する
        if (addPcPlatformIfMissing(game.platforms)) {
          console.log(`  [Reconcile] "${game.title}": added "PC (Microsoft Windows)" to platforms (Steam URL resolved)`);
        }
        console.log(`  [Reconcile] "${game.title}": Steam resolved → ${steamStore.url} (confidence=${steamStore.confidence})`);
      } else {
        // Steam が Resolver で解決されなかった場合:
        // knownSteamAppId が既知（Steam Top Sellers 由来など信頼できる appId）なら
        // 一時的な storesearch 失敗の可能性があるため既存 URL を保持する。
        // appId 不明の場合のみ削除して誤リンクを防ぐ。
        if (!legacySteamAppId) {
          const hadSteam = !!game.sourceUrls.steam;
          if (hadSteam) {
            console.warn(`  [Reconcile] "${game.title}": Steam URL removed (Resolver could not confirm, no known appId)`);
            delete game.sourceUrls.steam;
          }
        } else {
          console.log(`  [Reconcile] "${game.title}": Steam storesearch failed but knownAppId=${legacySteamAppId}, keeping existing steam URL`);
        }
      }
    } else {
      // Resolver で1件も解決できなかった場合:
      // knownSteamAppId がある場合は storesearch の一時失敗とみなし既存 URL を保持する。
      // knownSteamAppId もない場合はそもそも steam URL は存在しないはずなので保持しても問題なし。
      console.warn(`  [Reconcile] "${game.title}": no stores resolved, keeping existing sourceUrls`);
    }
  }

  // トレースをファイルに出力し、呼び出し元にも返す（Gate がディスク再読み不要）
  const tracePath = path.join(DATA_DIR, 'identity-resolver-trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(traceOutput, null, 2));
  console.log(`  Identity resolver trace saved to: ${tracePath}`);
  return traceOutput as ResolverTrace;
}

/**
 * verifySelectedGamesSteamUrl / enrichSelectedGamesWithOfficialUrl による
 * フィールドクリア後に必須情報が欠落したゲームを選定配列から取り除く（Issue #103）。
 *
 * cover と sourceUrl の両方が揃っているかのみをチェックする。
 * developer は enrich フェーズで補完できないケースもあるため zombie 判定には含めない。
 *
 * @pre enrichSelectedGamesWithOfficialUrl の呼び出し後に実行すること。
 *   enrich が sourceUrls.official をセットする場合があり、zombie 判定の sourceUrl チェックが
 *   それに依存するため、順序を逆転させると official URL しか持たないゲームが誤除去される。
 */
/**
 * Steam URL が解決されたとき、platforms に PC (Microsoft Windows) が含まれていなければ追加する。
 * IGDB のプラットフォームデータが不完全な場合（Issue #144）に補完するための純関数。
 * @returns true: 追加した / false: 既に含まれていた
 */
export function addPcPlatformIfMissing(platforms: string[]): boolean {
  const PC_PLATFORM = 'PC (Microsoft Windows)';
  if (platforms.some((p) => p.toLowerCase().includes('pc') || p.toLowerCase().includes('windows'))) {
    return false;
  }
  platforms.push(PC_PLATFORM);
  return true;
}

export function removeZombieGames(selectedGames: SelectedGames): void {
  // developer: false — RequiredFields で省略不可のため false で明示的に「チェックしない」を表現する
  const required = { cover: true, developer: false, sourceUrl: true };

  const filterArray = (arr: GameData[], label: string): { filtered: GameData[]; removedCount: number } => {
    const filtered = arr.filter((g) => {
      const ok = hasAllRequiredFields(g, required);
      if (!ok) {
        console.warn(`  [ZombieFilter] Removing "${g.title}" from ${label} (missing cover or sourceUrl)`);
      }
      return ok;
    });
    return { filtered, removedCount: arr.length - filtered.length };
  };

  const { filtered: newReleases, removedCount: removedNewReleases } = filterArray(selectedGames.newReleases, 'newReleases');
  selectedGames.newReleases = newReleases;

  // zombie で抜けた分を reserves から補充（最大 targetCount=2 まで）
  if (removedNewReleases > 0 && selectedGames.newReleasesReserves.length > 0) {
    const shortfall = 2 - selectedGames.newReleases.length;
    const currentTitles = new Set(selectedGames.newReleases.map((g) => g.normalizedTitle));
    const fills = selectedGames.newReleasesReserves
      .filter((g) => hasAllRequiredFields(g, required) && !currentTitles.has(g.normalizedTitle))
      .slice(0, shortfall);
    if (fills.length > 0) {
      console.log(`  [ZombieFilter] Filling ${fills.length} newRelease slot(s) from reserves: ${fills.map((g) => g.title).join(', ')}`);
      selectedGames.newReleases = [...selectedGames.newReleases, ...fills];
    }
  }

  const { filtered: indies, removedCount: removedIndies } = filterArray(selectedGames.indies, 'indies');
  selectedGames.indies = indies;

  let removedSingletons = 0;

  if (selectedGames.featured && !hasAllRequiredFields(selectedGames.featured, required)) {
    console.warn(
      `  [ZombieFilter] Nullifying featured "${selectedGames.featured.title}" (missing cover or sourceUrl)`
    );
    selectedGames.featured = null;
    removedSingletons++;
  }

  if (selectedGames.classic && !hasAllRequiredFields(selectedGames.classic, required)) {
    console.warn(
      `  [ZombieFilter] Nullifying classic "${selectedGames.classic.title}" (missing cover or sourceUrl)`
    );
    selectedGames.classic = null;
    removedSingletons++;
  }

  const totalRemoved = removedNewReleases + removedIndies + removedSingletons;
  if (totalRemoved > 0) {
    console.log(
      `  [ZombieFilter] Removed ${removedNewReleases} newRelease(s), ${removedIndies} indie(s), ${removedSingletons} singleton(s) as zombie`
    );
  }
}

/**
 * 選定済みゲームに公式日本語URLを付与
 * selectGamesForArticles() 後に呼ぶことで、対象6本のみに絞って調査できる
 */
async function enrichSelectedGamesWithOfficialUrl(
  selectedGames: SelectedGames
): Promise<void> {
  const allGames: GameData[] = [
    ...selectedGames.newReleases,
    ...selectedGames.indies,
    ...(selectedGames.featured ? [selectedGames.featured] : []),
    ...(selectedGames.classic ? [selectedGames.classic] : []),
  ];

  for (const game of allGames) {
    try {
      const releaseYear = game.releaseDate
        ? new Date(game.releaseDate).getFullYear().toString()
        : undefined;

      const officialResult = await fetchOfficialJpUrl({
        titleEn: game.title,
        titleJa: game.titleJa,
        releaseYear,
        developer: game.developer,
        publisher: game.publisher,
      });

      if (officialResult) {
        game.sourceUrls = {
          ...game.sourceUrls,
          official: officialResult.url,
          officialUrlSource: 'tavily',
          officialVerifyReason: officialResult.verifyReason,
        };
        continue;
      }

      // フォールバック (Issue #49b対策):
      // 日本語公式ページが見つからなかった場合、IGDBの公式サイトURLを採用する。
      // 海外ゲームで日本語専用サイトを持たないタイトル（例: 007 First Light）でも
      // 何らかの公式リンクを記事に出せるようにする。
      const igdbFallback = await enrichGameWithIGDB(game.title, {
        expectedYear: game.releaseDate
          ? new Date(game.releaseDate).getFullYear()
          : undefined,
      });
      // Issue #117: igdbFallback.officialUrl は category=1 タグ付き URL のみ
      // （pickOfficialUrlFromWebsites の挙動変更による）。内容検証は省略してそのまま採用する。
      if (igdbFallback?.officialUrl) {
        console.log(`    Using IGDB official URL as fallback: ${igdbFallback.officialUrl}`);
        game.sourceUrls = {
          ...game.sourceUrls,
          official: igdbFallback.officialUrl,
          officialUrlSource: igdbFallback.officialUrlSource,
          officialVerifyReason: undefined,
        };
      }
    } catch (error) {
      console.error(`  enrichOfficialUrl failed for "${game.title}":`, error);
    }
  }
}

/**
 * 記事生成用にゲームを選定
 */
async function selectGamesForArticles(games: GameData[]): Promise<SelectedGames> {
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

  // 大手企業の新作: 品質ゲート・実存フィルタ適用後にスコア降順で採用+予備差し替え
  const recentGamesCandidates = games
    .filter((g) => {
      if (!g.releaseDate) return false;
      const releaseDate = new Date(g.releaseDate);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return releaseDate > threeMonthsAgo;
    })
    .filter((g) => !isFanGame(g))
    .filter((g) => isQualifiedGame(g))
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => hasExistenceEvidence(g))
    .filter((g) => !newReleaseCooldown.has(g.normalizedTitle))
    .sort((a, b) => (b.metascore || b.igdbRating || 0) - (a.metascore || a.igdbRating || 0));

  const newReleasesSelection = await selectNewReleasesWithFallback(recentGamesCandidates, 2);
  const newReleases = newReleasesSelection.adopted;
  const newReleasesReserves = newReleasesSelection.reserves;

  if (newReleasesSelection.rejected.length > 0) {
    console.log('[newReleases] rejected candidates:');
    for (const r of newReleasesSelection.rejected) {
      console.log(`  - ${r.title}: ${r.reason}`);
    }
  }

  if (newReleases.length === 0) {
    console.warn('[Warning] newReleases採用0件 — 新作記事は生成されません');
  } else if (newReleases.length < 2) {
    console.warn(`[Warning] newReleases採用${newReleases.length}件 — 2件未満で発行します`);
  }

  // インディーゲーム候補（大手スタジオと確定できるものだけ除外）
  // developer=undefined は 'no-developer' で ok:false になるが、候補プールには含める。
  // 話題性ルートで steamRawDeveloper を使った「個人開発（アカウント名）」補完を後段で行う。
  const indieScore = (g: GameData): number =>
    (g.youtubePopularity || 0) +
    (g.steamRank ? 1000 - g.steamRank : 0) +
    (g.igdbRating || 0) * 10;

  const indieRanked = games
    .filter((g) => { const r = isIndieGame(g); return r.ok || r.reason === 'no-developer'; })
    .filter((g) => !isFanGame(g))
    .filter((g) => isQualifiedGame(g))
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => g.source.includes('steam') || g.source.includes('igdb'))
    .filter((g) => !indieCooldown.has(g.normalizedTitle))
    .filter((g) => !newReleases.some((nr) => nr.title === g.title))
    .sort((a, b) => indieScore(b) - indieScore(a));

  // youtubePopularity 降順リスト（話題性 percentile 計算用）
  const youtubePopularitySorted = [...indieRanked].sort(
    (a, b) => (b.youtubePopularity ?? 0) - (a.youtubePopularity ?? 0)
  );

  const indieSelection = await selectIndieGamesWithFallback(indieRanked, 2, {
    youtubePopularitySorted,
  });

  const indies = indieSelection.adopted;
  // 採用・拒否の処理を経ていない残り候補（デバッグ/ログ用）
  const adoptedTitles = new Set(indieSelection.adopted.map((g) => g.normalizedTitle));
  const rejectedTitles = new Set(indieSelection.rejected.map((r) => r.title));
  const indieReserves = indieRanked.filter(
    (g) => !adoptedTitles.has(g.normalizedTitle) && !rejectedTitles.has(g.title)
  );

  if (indieSelection.rejected.length > 0) {
    console.log('[indie] rejected candidates:');
    for (const r of indieSelection.rejected) {
      console.log(`  - ${r.title}: ${r.reason}`);
    }
  }

  if (indies.length === 0) {
    console.warn('[Warning] indie採用0件 — indie記事は生成されません');
  } else if (indies.length < 2) {
    console.warn(`[Warning] indie採用${indies.length}件 — 2件未満で発行します`);
  }

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
    newReleasesReserves,
    indies,
    indieReserves,
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
  const selectedGames = await selectGamesForArticles(games);
  console.log(`New Releases: ${selectedGames.newReleases.length}`);
  console.log(`Indies: ${selectedGames.indies.length}`);
  console.log(`Featured: ${selectedGames.featured?.title || 'None'}`);
  console.log(`Classic: ${selectedGames.classic?.title || 'None'}`);

  // 選定済みゲームのストア URL を Identity Resolver で補完・検証（Issue #116 対策）
  console.log('');
  console.log('Reconciling store URLs for selected games via Identity Resolver...');
  const resolverTrace = await reconcileSelectedGames(selectedGames);

  // 選定済みゲームに公式日本語URLを付与
  console.log('');
  console.log('Fetching official Japanese URLs for selected games...');
  await enrichSelectedGamesWithOfficialUrl(selectedGames);

  // verifySelectedGamesSteamUrl / enrich によるフィールドクリア後に zombie を除去（Issue #103）
  console.log('');
  console.log('Removing zombie games (missing cover or sourceUrl after verification)...');
  removeZombieGames(selectedGames);

  // Completeness Gate: 客観事実の機械検証（LLM 不使用）
  console.log('');
  console.log('Running Completeness Gate...');
  const gateMode = getGateMode();
  const reservePool: GameData[] = [
    ...selectedGames.newReleasesReserves,
    ...selectedGames.indieReserves,
  ];
  const gateReport = await runCompletenessGate(selectedGames, resolverTrace, reservePool, gateMode);
  console.log(`  [CompletenessGate] mode=${gateMode}, violations=${gateReport.violations.length}, replaced=${gateReport.replacedGames.length}`);
  if (gateReport.violations.length > 0) {
    for (const v of gateReport.violations) {
      console.warn(`  [CompletenessGate] ${v.ruleId} "${v.gameTitle}": ${v.detail}`);
    }
  }

  // Gate レポートを出力
  const isDev = process.env.DEV_MODE === 'true';
  const reportDir = isDev
    ? path.join(process.cwd(), 'data', 'validation-dev')
    : path.join(DATA_DIR);
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'completeness-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(gateReport, null, 2));
  console.log(`  Completeness report saved to: ${reportPath}`);

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

  if (gateMode === 'fail' && gateReport.hasMutableViolations) {
    console.error('  [CompletenessGate] FAIL: mutable violations found, aborting.');
    process.exit(1);
  }

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
