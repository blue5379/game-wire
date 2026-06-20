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
import { fetchSteamAppName } from './fetch-steam.js';
import { fetchMetacriticData, getGameScore } from './fetch-metacritic.js';
import { getCooldownTitles } from './game-history.js';
import { isBlockedAdultGame } from './adult-blocklist.js';
import { isFanGame, isQualifiedGame } from './game-filter.js';
import { fetchOfficialJpUrl } from './fetch-official-jp-url.js';
import { verifyOfficialUrlContent } from './verify-official-url.js';
import { isIndieGame } from './indie-classifier.js';
import { parseSteamReleaseDate as _parseSteamReleaseDate, isQualifiedCompanyName as _isQualifiedCompanyName } from './steam-utils.js';
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

    if (!game.coverImage || game.genres.length === 0 || !game.sourceUrls?.steam) {
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
        // IGDBのwebsites(category=13)からSteam URLを補完
        if (igdbGame.steamUrl && !game.sourceUrls?.steam) {
          game.sourceUrls = game.sourceUrls || {};
          game.sourceUrls.steam = igdbGame.steamUrl;
          // 第3層: Steam appId を保持しておくことで、後段のマージ処理でも強い同一性判定が効く
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
    // developer・steamRecommendations・screenshots のどれかが欠けている場合に補完を試みる
    const needsCompletion =
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
 * 選定済み6本の Steam URL を Steam Storefront API で検証する
 *
 * Issue #49 対策: IGDB の websites などから採用された Steam URL の appId が
 * 実在するか、また Steam 上の name が IGDB の game.title と十分一致するかを
 * クロスチェックする。失敗した場合は Steam URL を削除し、誤リンクの掲載を防ぐ。
 *
 * Steam Top Sellers / Top Played 由来の URL（既に Steam で実在確認済み）は
 * appId と Steam name の整合性が源流で取れているため、ここでは name 一致のみ
 * を緩く確認する。
 */
async function verifySelectedGamesSteamUrl(
  selectedGames: SelectedGames
): Promise<void> {
  const allGames: GameData[] = [
    ...selectedGames.newReleases,
    ...selectedGames.indies,
    ...(selectedGames.featured ? [selectedGames.featured] : []),
    ...(selectedGames.classic ? [selectedGames.classic] : []),
  ];

  for (const game of allGames) {
    const steamUrl = game.sourceUrls?.steam;
    if (!steamUrl) continue;
    const appId = extractSteamAppId(steamUrl);
    if (appId === undefined) continue;

    try {
      const steamName = await fetchSteamAppName(appId);
      if (!steamName) {
        console.warn(
          `  [SteamVerify] appId ${appId} not found on Steam, removing URL: "${game.title}"`
        );
        delete game.sourceUrls!.steam;
        if (game.steamAppId === appId) {
          game.steamAppId = undefined;
          // Steam CDN フォールバック URL も無効になるためクリア
          if (game.coverImage?.includes(`/steam/apps/${appId}/`)) game.coverImage = undefined;
        }
        continue;
      }
      const sameName = isSameGame(
        { title: game.title, releaseDate: game.releaseDate },
        { title: steamName }
      );
      if (!sameName) {
        console.warn(
          `  [SteamVerify] name mismatch for "${game.title}" (appId ${appId} -> "${steamName}"), removing URL`
        );
        delete game.sourceUrls!.steam;
        if (game.steamAppId === appId) {
          game.steamAppId = undefined;
          // Steam CDN フォールバック URL も無効になるためクリア
          if (game.coverImage?.includes(`/steam/apps/${appId}/`)) game.coverImage = undefined;
        }
      }
    } catch (error) {
      console.warn(`  [SteamVerify] failed for "${game.title}":`, error);
    }
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

      const officialUrl = await fetchOfficialJpUrl({
        titleEn: game.title,
        titleJa: game.titleJa,
        releaseYear,
        developer: game.developer,
        publisher: game.publisher,
      });

      if (officialUrl) {
        game.sourceUrls = { ...game.sourceUrls, official: officialUrl, officialUrlSource: 'tavily' };
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
      if (igdbFallback?.officialUrl) {
        let adoptUrl = true;
        // category=1 は IGDB が明示した公式サイトタグ。内容検証は不要。
        if (igdbFallback.officialUrlSource !== 'igdb-official') {
          const verification = await verifyOfficialUrlContent(
            { titleEn: game.title, titleJa: game.titleJa, developer: game.developer, publisher: game.publisher },
            igdbFallback.officialUrl
          );
          if (verification.verdict === 'mismatch') {
            console.log(`    IGDB official URL content mismatch, rejected: ${igdbFallback.officialUrl} (${verification.reason})`);
            adoptUrl = false;
          } else if (verification.verdict === 'uncertain') {
            console.log(`    IGDB official URL content unverified (adopting anyway): ${igdbFallback.officialUrl} (${verification.reason})`);
          }
        }
        if (adoptUrl) {
          console.log(`    Using IGDB official URL as fallback: ${igdbFallback.officialUrl}`);
          game.sourceUrls = {
            ...game.sourceUrls,
            official: igdbFallback.officialUrl,
            officialUrlSource: igdbFallback.officialUrlSource,
          };
        }
      }
    } catch (error) {
      console.error(`  enrichOfficialUrl failed for "${game.title}":`, error);
    }
  }
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

  // インディーゲーム（developer が大手スタジオ・子会社でないもの）
  // isIndieGame は developer が undefined の場合 ok:false を返すため、
  // developer 不明のゲームは後段フィルタで除外される（PR-C で差し替えフローに移行予定）
  const isIndie = (game: GameData): boolean => isIndieGame(game).ok;

  const indieScore = (g: GameData): number =>
    (g.youtubePopularity || 0) +
    (g.steamRank ? 1000 - g.steamRank : 0) +
    (g.igdbRating || 0) * 10;

  const indieGames = games
    .filter(isIndie)
    .filter((g) => !isFanGame(g))
    .filter((g) => isQualifiedGame(g))
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => g.source.includes('steam') || g.source.includes('igdb')) // 実在確認済みのみ
    // 記事化に最低限必要なメタデータ。カバー画像（Steam CDN 由来は404でも文字列として埋まる）に加え、
    // 開発元・発売元・発売日のいずれかが揃っていることを要求する。
    // Issue #94: IGDB 未登録 + Steam Storefront 補完も失敗したゲームを除外する。
    .filter((g) => g.coverImage && (g.developer || g.publisher || g.releaseDate))
    .filter((g) => !indieCooldown.has(g.normalizedTitle))
    .sort((a, b) => indieScore(b) - indieScore(a));

  if (indieGames.length === 0) {
    console.warn('[Warning] indieGames is empty after quality filters — indie articles will be missing');
  } else if (indieGames.length < 2) {
    console.warn(`[Warning] indieGames has only ${indieGames.length} candidate(s) — fewer than 2 indie articles may be generated`);
  }

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
    indieReserves: [], // PR-C で差し替えフロー実装時に使用
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

  // 選定済みゲームの Steam URL を実在検証（Issue #49 対策）
  console.log('');
  console.log('Verifying Steam URLs for selected games...');
  await verifySelectedGamesSteamUrl(selectedGames);

  // 選定済みゲームに公式日本語URLを付与
  console.log('');
  console.log('Fetching official Japanese URLs for selected games...');
  await enrichSelectedGamesWithOfficialUrl(selectedGames);

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
