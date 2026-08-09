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
import { fetchAmazonRanking, type AmazonRankIndex } from './fetch-amazon-ranking.js';
import { getCooldownTitles } from './game-history.js';
import { isBlockedAdultGame } from './adult-blocklist.js';
import { isFanGame, isQualifiedGame } from './game-filter.js';
import { fetchOfficialJpUrl } from './fetch-official-jp-url.js';
import { isIndieGame, pickDeveloperGameCount } from './indie-classifier.js';
import { parseSteamReleaseDate as _parseSteamReleaseDate, isQualifiedCompanyName as _isQualifiedCompanyName } from './steam-utils.js';
import { selectIndieGamesWithFallback, vetIndieCandidate } from './select-indie-with-fallback.js';
import { selectNewReleasesWithFallback, vetNewReleaseCandidate, hasExistenceEvidence } from './select-newreleases-with-fallback.js';
import { hasAllRequiredFields } from './finalize-game-metadata.js';
import { resolveGameIdentity } from './identity-resolver.js';
import { runCompletenessGate, getGateMode } from './completeness-gate.js';
import type { ResolverTrace } from './completeness-gate.js';
import { normalizeTitle } from './normalize.js';
import { sortByNewReleaseScore, computeNewReleaseScore } from './newrelease-score.js';
import { meetsClassicPoolThresholds } from './classic-pool.js';
import {
  isInvalidGameTitle,
  extractYearFromDate,
  explainGameIdentity,
  isSameGameIdentity,
  isIdentityConfirmedByAppId,
} from './game-identity.js';
import type {
  SteamData,
  YouTubeData,
  IGDBData,
  MetacriticData,
  GameData,
  IGDBGame,
  AggregatedData,
  SelectedGames,
} from './types.js';

// 出力ディレクトリ
const DATA_DIR = path.join(process.cwd(), 'data');

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
 * IGDB 結果を GameData に反映する（同一性ガード付き）。Issue #50 / Issue #166。
 *
 * 上書きの「可否」だけをここでガードし、上書き演算子（`||` = falsy を IGDB 値で補完）の
 * セマンティクスは従来どおり保つ。同一性判定そのものは game-identity.ts に一元化されている。
 *
 * 同一性判定の多層防御:
 * 1. appId 一致（IGDB steamUrl の appId と game.steamAppId が一致）→ 無条件で同一（最強シグナル）。
 * 2. Issue #166 再発対応: game.steamAppId という強アンカーを持つのに、この IGDB 結果を
 *    その appId で確証できない場合（appId 不一致 or Steam URL 未登録で照合不能）は上書きを保留。
 *    旧実装は「IGDB appId が存在して不一致」しか弾かなかった。同名旧作が Steam URL を持たない
 *    ケース（Brick Game 1989）は igdbAppId=undefined のままガードをすり抜けていた（Vol.14 再発）。
 *    searchGameBySteamAppId で確定した結果は steamUrl に appId が補完されるため appId 確証済みと
 *    なりここには掛からない。名前検索フォールバック由来の結果だけが掛かる。
 * 3. game.steamAppId が無い候補（IGDB 由来・特集の LLM 提案等）は igdbSlug 一致または
 *    title + 発売年（aggregation プロファイル）で判定。mismatch なら上書き拒否。
 *
 * @returns true = 上書き適用、false = 同一性ガードで拒否（呼び出し元は enrich 失敗扱い）
 */
export function enrichGameFromIgdb(game: GameData, igdbGame: IGDBGame): boolean {
  const igdbAppId = extractSteamAppId(igdbGame.steamUrl);
  const verdict = explainGameIdentity(
    {
      title: game.title,
      titleJa: game.titleJa,
      releaseDate: game.releaseDate,
      steamAppId: game.steamAppId,
      igdbSlug: game.igdbSlug,
    },
    {
      title: igdbGame.name,
      titleJa: igdbGame.titleJa,
      releaseDate: igdbGame.releaseDate,
      steamAppId: igdbAppId,
      igdbSlug: igdbGame.slug,
    },
    'aggregation'
  );

  if (!isIdentityConfirmedByAppId(verdict)) {
    // Issue #166 再発対応: Steam appId というアンカーがあるのに、IGDB 結果をその appId で
    // 確証できない場合は上書きを保留する（appId 不一致 / Steam URL 未登録どちらも）。
    if (game.steamAppId !== undefined) {
      console.warn(
        `  IGDB enrich rejected (appId not confirmed): "${game.title}" steam=${game.steamAppId} igdb-steam=${igdbAppId ?? 'none'}`
      );
      return false;
    }

    // 第4層（Issue #50）: title / 発売年（または igdbSlug）で同一と確認できない場合は拒否。
    if (!verdict.same) {
      console.warn(
        `  IGDB enrich rejected (identity mismatch: ${verdict.reason}): "${game.title}" vs "${igdbGame.name}"`
      );
      return false;
    }
  }

  game.titleJa = igdbGame.titleJa || game.titleJa;
  game.igdbSlug = igdbGame.slug || game.igdbSlug;
  game.genres = igdbGame.genres || game.genres;
  game.platforms = igdbGame.platforms || game.platforms;
  game.releaseDate = igdbGame.releaseDate || game.releaseDate;
  game.developer = igdbGame.developer || game.developer;
  // developerGameCount は「採用された developer 名」と別ソースの件数が組み合わさらないよう
  // pickDeveloperGameCount でゲートする（コードレビュー指摘）。詳細は同関数の JSDoc を参照。
  game.developerGameCount = pickDeveloperGameCount(
    game.developer,
    game.developerGameCount,
    igdbGame.developer,
    igdbGame.developerGameCount
  );
  game.publisher = igdbGame.publisher || game.publisher;
  game.developerCountry = igdbGame.developerCountry || game.developerCountry;
  game.coverImage = igdbGame.coverUrl || game.coverImage;
  game.screenshots = igdbGame.screenshotUrls || game.screenshots;
  game.summary = igdbGame.summary || game.summary;
  game.igdbRating = igdbGame.rating ?? game.igdbRating;
  game.igdbRatingCount = igdbGame.ratingCount ?? game.igdbRatingCount;
  game.gameType = igdbGame.gameType ?? game.gameType;
  game.aggregatedRating = igdbGame.aggregatedRating ?? game.aggregatedRating;
  game.aggregatedRatingCount = igdbGame.aggregatedRatingCount ?? game.aggregatedRatingCount;
  // keywords は除外シグナル（isFanGame）なので、空配列で既存値を潰さない
  game.keywords = igdbGame.keywords?.length ? igdbGame.keywords : game.keywords;
  game.totalRating = igdbGame.totalRating ?? game.totalRating;
  game.totalRatingCount = igdbGame.totalRatingCount ?? game.totalRatingCount;
  game.classicRemakeEligible = igdbGame.classicRemakeEligible ?? game.classicRemakeEligible;
  if (!game.source.includes('igdb')) {
    game.source.push('igdb');
  }
  // IGDB URLを追加
  if (igdbGame.slug) {
    game.sourceUrls = game.sourceUrls || {};
    game.sourceUrls.igdb = `https://www.igdb.com/games/${igdbGame.slug}`;
  }
  // IGDB websites(type=13。旧 category=13)の Steam URL から appId を引き継ぐ
  // sourceUrls.steam の設定は reconcileSelectedGames（Identity Resolver）に委譲する
  if (igdbGame.steamUrl) {
    const appId = extractSteamAppId(igdbGame.steamUrl);
    if (appId !== undefined && game.steamAppId === undefined) {
      game.steamAppId = appId;
    }
  }
  return true;
}

/**
 * データソースを統合してゲームリストを作成
 */
export async function aggregateGames(
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
      if (isSameGameIdentity({ title: game.title, releaseDate: game.releaseDate }, { title: normalized }, 'aggregation')) {
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

    // 既存のゲームとマッチするか確認（同一性判定は game-identity.ts に一元化）
    // appId 一致は最強シグナルとしてタイトル・発売年に関係なく優先マージされる
    const igdbSteamAppId = extractSteamAppId(igdb.steamUrl);
    let matched = false;
    for (const [, game] of gameMap.entries()) {
      const verdict = explainGameIdentity(
        {
          title: game.title,
          titleJa: game.titleJa,
          releaseDate: game.releaseDate,
          steamAppId: game.steamAppId,
          igdbSlug: game.igdbSlug,
        },
        {
          title: igdb.name,
          titleJa: igdb.titleJa,
          releaseDate: igdb.releaseDate,
          steamAppId: igdbSteamAppId,
          igdbSlug: igdb.slug,
        },
        'aggregation'
      );
      // appId が両方分かっていて異なる場合は別作品として確定（強分離）
      if (verdict.reason === 'app-id-mismatch') {
        continue;
      }
      // Issue #166 再発対応: appId 確証なしの同一判定（title/slug 一致のみ）のときに
      // game 側が steamAppId を持っているなら IGDB 結果を appId 未確証として棄却する。
      // appId 一致（steamUrl 一致）の場合は正当なので通過させる。
      if (verdict.same && !isIdentityConfirmedByAppId(verdict) && game.steamAppId !== undefined) {
        console.warn(
          `  [WARN] aggregateGames: IGDB enrich rejected (appId not confirmed via steamUrl): "${igdb.name}" → "${game.title}" steam=${game.steamAppId} igdb-steam=${igdbSteamAppId ?? 'none'}`
        );
        continue;
      }
      if (verdict.same) {
        // IGDB データで補完
        game.title = igdb.name; // 正式名称に更新
        game.normalizedTitle = normalizeTitle(igdb.name); // normalizedTitle も正式名称から再計算
        game.titleJa = igdb.titleJa || game.titleJa;
        game.igdbSlug = igdb.slug || game.igdbSlug;
        game.genres = igdb.genres || game.genres;
        game.platforms = igdb.platforms || game.platforms;
        game.releaseDate = igdb.releaseDate || game.releaseDate;
        game.developer = igdb.developer || game.developer;
        // developerGameCount は「採用された developer 名」と別ソースの件数が組み合わさらないよう
        // pickDeveloperGameCount でゲートする（コードレビュー指摘）。詳細は同関数の JSDoc を参照。
        game.developerGameCount = pickDeveloperGameCount(
          game.developer,
          game.developerGameCount,
          igdb.developer,
          igdb.developerGameCount
        );
        game.publisher = igdb.publisher || game.publisher;
        game.developerCountry = igdb.developerCountry || game.developerCountry;
        game.coverImage = igdb.coverUrl || game.coverImage;
        game.screenshots = igdb.screenshotUrls || game.screenshots;
        game.summary = igdb.summary || game.summary;
        game.igdbRating = igdb.rating ?? game.igdbRating;
        game.igdbRatingCount = igdb.ratingCount ?? game.igdbRatingCount;
        game.gameType = igdb.gameType ?? game.gameType;
        game.aggregatedRating = igdb.aggregatedRating ?? game.aggregatedRating;
        game.aggregatedRatingCount = igdb.aggregatedRatingCount ?? game.aggregatedRatingCount;
        // keywords は除外シグナル（isFanGame）なので、空配列で既存値を潰さない
        game.keywords = igdb.keywords?.length ? igdb.keywords : game.keywords;
        game.totalRating = igdb.totalRating ?? game.totalRating;
        game.totalRatingCount = igdb.totalRatingCount ?? game.totalRatingCount;
        game.classicRemakeEligible = igdb.classicRemakeEligible ?? game.classicRemakeEligible;
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
        steamAppId: igdbSteamAppId,
        igdbSlug: igdb.slug,
        genres: igdb.genres || [],
        platforms: igdb.platforms || [],
        releaseDate: igdb.releaseDate,
        developer: igdb.developer,
        developerGameCount: igdb.developerGameCount,
        publisher: igdb.publisher,
        developerCountry: igdb.developerCountry,
        coverImage: igdb.coverUrl,
        screenshots: igdb.screenshotUrls,
        summary: igdb.summary,
        igdbRating: igdb.rating,
        igdbRatingCount: igdb.ratingCount,
        gameType: igdb.gameType,
        aggregatedRating: igdb.aggregatedRating,
        aggregatedRatingCount: igdb.aggregatedRatingCount,
        keywords: igdb.keywords,
        totalRating: igdb.totalRating,
        totalRatingCount: igdb.totalRatingCount,
        classicRemakeEligible: igdb.classicRemakeEligible,
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
      if (isSameGameIdentity({ title: game.title, releaseDate: game.releaseDate }, { title: normalized }, 'aggregation')) {
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
      const expectedYear = extractYearFromDate(game.releaseDate);
      // Issue #166: steamAppId があれば appId 逆引きを優先して同名異作品の混入を防ぐ
      const igdbGame = await enrichGameWithIGDB(game.title, {
        expectedYear,
        steamAppId: game.steamAppId,
      });
      if (igdbGame) {
        const applied = enrichGameFromIgdb(game, igdbGame);
        if (!applied) continue;
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
export function deduplicateGames(games: GameData[]): GameData[] {
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
      // developerGameCount は「マージ後の primary.developer」と dup 側の名前が一致する場合のみ
      // dup の件数を採る（コードレビュー指摘）。primary が既に件数を持つならそのまま
      // （pickDeveloperGameCount は currentCount が undefined のときだけ呼ばれる）。
      primary.developerGameCount =
        primary.developerGameCount ??
        pickDeveloperGameCount(
          primary.developer,
          primary.developerGameCount,
          dup.developer,
          dup.developerGameCount
        );
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
      primary.gameType = primary.gameType ?? dup.gameType;
      primary.aggregatedRating = primary.aggregatedRating ?? dup.aggregatedRating;
      primary.aggregatedRatingCount = primary.aggregatedRatingCount ?? dup.aggregatedRatingCount;
      // keywords は除外シグナル（isFanGame）なので、空配列で既存値を潰さない
      primary.keywords = primary.keywords?.length ? primary.keywords : dup.keywords;
      primary.totalRating = primary.totalRating ?? dup.totalRating;
      primary.totalRatingCount = primary.totalRatingCount ?? dup.totalRatingCount;
      primary.classicRemakeEligible = primary.classicRemakeEligible ?? dup.classicRemakeEligible;
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
 * IGDB のプラットフォームデータが不完全な場合（Issue #144）に補完する。
 * platforms 配列を in-place で変更する（破壊的操作）。
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
        steamAppId: game.steamAppId,
      });
      // Issue #117: igdbFallback.officialUrl は公式タグ付き URL のみ
      // （pickOfficialUrlFromWebsites の挙動変更による）。内容検証は省略してそのまま採用する。
      // Issue #234: 公式タグは type=1（旧 category=1 は後方互換）。
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
 * 号内カテゴリ間の重複判定。正規化タイトルで比較する（§6.3）。null/undefined は無視する。
 *
 * 4箇所（newReleases 除外×2、indies 除外、featured 除外）で同じ比較ロジックを
 * コピーすると、PR #209 が対処した「同じ誤りが3箇所に同時に存在する」事故の
 * 再発条件になるため、共通関数に集約する。
 *
 * 保持済みの normalizedTitle ではなく title から再計算するのは、選定段階の
 * GameData には aggregateGames を経ていない経路で作られたものが混ざりうるため
 * （両者は現状同期しているが、比較の正しさをフィールドの同期に依存させない）。
 *
 * 注意: normalizeTitle が吸収するのは大文字小文字・コロン・ハイフン・空白・™®© の
 * 差異だけで、ローマ数字とアラビア数字の差（II と 2）は吸収しない（実測）。
 */
export function isAlreadySelected(
  game: GameData,
  selected: (GameData | null | undefined)[]
): boolean {
  const target = normalizeTitle(game.title);
  return selected.some((s) => s != null && normalizeTitle(s.title) === target);
}

/**
 * 新作枠の候補を絞り込み、4軸スコア降順に並べる（§2.3。第4軸=国内販売は PR-B2）。
 * 副作用を持たない純関数（ログ出力は呼び出し側で行う）。
 *
 * amazonRanks 省略時は Amazon 経路が無効になるだけで、従来（3軸・Amazon非考慮）どおり動く。
 */
export function buildNewReleaseCandidates(
  games: GameData[],
  options: {
    releasedAfter: Date;
    cooldown: Set<string>;
    steamTopSellersCount: number;
    amazonRanks?: AmazonRankIndex;
  }
): GameData[] {
  const filtered = games
    .filter((g) => {
      if (!g.releaseDate) return false;
      return new Date(g.releaseDate) > options.releasedAfter;
    })
    .filter((g) => !isFanGame(g))
    .filter((g) => {
      // Amazon 掲載の有無は品質ゲート（isQualifiedGame）と実存フィルタ（hasExistenceEvidence）
      // の両方で使うため、lookup は1回だけ呼んで結果（真偽値）を使い回す。順位そのものは
      // 変数に保持しない（ライセンス制約 §2.3。掲載の有無 boolean のみ扱う）。
      const amazonRanked = options.amazonRanks?.lookup(g) !== undefined;
      return isQualifiedGame(g, { amazonRanked }) && hasExistenceEvidence(g, { amazonRanked });
    })
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => !options.cooldown.has(g.normalizedTitle));

  return sortByNewReleaseScore(filtered, {
    steamSlotCount: options.steamTopSellersCount,
    amazonRanks: options.amazonRanks,
  });
}

// 新作枠以外の枠から除外するゲーム種別（IGDB game_type、§6.2）
const GAME_TYPE_REMAKE = 8;
const GAME_TYPE_REMASTER = 9;

/**
 * 新作枠以外の枠から除外するゲーム種別（リメイク=8 / リマスター=9）かを判定する（§6.2）。
 * gameType が未取得（undefined）の候補は除外しない（判定材料が無いため従来どおり通す）。
 *
 * インディー枠（buildIndieCandidates）はこの関数で一律除外する（保守的な対応。
 * 小規模開発のリメイクは稀であり、この枠の主目的は DLC 混入防止のため）。
 * 名作枠（buildClassicCandidates）は §5.5 決着（J-3-e）により、この関数の一律除外ではなく
 * `isClassicRemakeAllowed` で「原作が母集団にいないリメイクだけ条件付き許可」する。
 */
export function isRemakeOrRemaster(game: GameData): boolean {
  if (game.gameType === undefined) return false;
  return game.gameType === GAME_TYPE_REMAKE || game.gameType === GAME_TYPE_REMASTER;
}

/**
 * 名作枠専用のリメイク許可判定（J-3-e, §5.5決着）。
 *
 * `isRemakeOrRemaster` と異なり、リメイク・リマスターを一律には除外しない。
 * `gameType` が Remake(8)/Remaster(9) でない場合は無条件で true（リメイクではないので無関係）。
 * 8/9 の場合は `game.classicRemakeEligible === true`（親=原作が §5.4 の母集団条件を
 * 満たさない＝原作が母集団に居ない）のときだけ true。
 *
 * ⚠️ `classicRemakeEligible` が `undefined`（フィールドの転記漏れ等）の場合は false（除外）。
 * `classicRemakeEligible` 自体の意味（IGDB 側の判定）は「わからなければ許可」だが、
 * ここでは選定側の安全策として非対称に「わからなければ除外」に倒す
 * （転記漏れが起きても誤ってリメイクを名作枠に載せないようにするため）。
 */
export function isClassicRemakeAllowed(game: GameData): boolean {
  if (game.gameType !== GAME_TYPE_REMAKE && game.gameType !== GAME_TYPE_REMASTER) return true;
  return game.classicRemakeEligible === true;
}

const DEFAULT_INDIE_RELEASE_WINDOW_DAYS = 90;

/**
 * 環境変数を数値として読む。未設定・空文字・数値でない場合のみ既定値にフォールバックする。
 *
 * 注意: `Number(process.env.X) || defaultValue` という書き方はしないこと。
 * `0` が既定値（90日）に化けてしまう（`0 || default` は default になる）。
 * `Number.isFinite` で明示的に判定する。
 * （indie-classifier.ts の readLargeStudioDevelopedThreshold と同じ方針）
 *
 * `INDIE_RELEASE_WINDOW_DAYS` は「窓を無効化するスイッチ」ではない点に注意。
 * `0`（または負値）を指定すると windowStart が「今日」（またはそれより未来）になり、
 * 発売日が今日ちょうどの候補しか通らない最も厳しい設定になる。窓を広げたい場合は
 * 大きな値を指定すること。
 *
 * 呼び出し時（モジュール読み込み時ではない）に process.env を読む。
 * テストから `vi.stubEnv` で差し替えて検証できる必要があるため。
 */
function readIndieReleaseWindowDays(): number {
  const raw = process.env.INDIE_RELEASE_WINDOW_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_INDIE_RELEASE_WINDOW_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_INDIE_RELEASE_WINDOW_DAYS;
}

/**
 * インディー枠の母集団条件「発売日: 過去 INDIE_RELEASE_WINDOW_DAYS 日以内」を判定する（§3.4）。
 *
 * - releaseDate を持たない候補は窓内と確認できないため除外する
 * - 未来日（未発売）の候補も除外する（§3.3「インディー枠は未発売タイトルを扱わない」）
 * - 日付比較は既存コード（.toISOString().split('T')[0] で YYYY-MM-DD 文字列化する流儀）に
 *   合わせ、YYYY-MM-DD 文字列の比較で行う。「日本時間当日0時以前」のようなタイムゾーンの
 *   厳密化（JST統一）はこのPRの対象外（§2.8 の JST 統一は PR-C の担当）。
 *
 * `now` を注入できるようにし、テストが実時刻に依存しないようにする。
 */
export function isWithinIndieReleaseWindow(game: GameData, now: Date = new Date()): boolean {
  if (!game.releaseDate) return false;

  const todayStr = now.toISOString().split('T')[0];
  if (game.releaseDate > todayStr) return false;

  const windowDays = readIndieReleaseWindowDays();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartStr = windowStart.toISOString().split('T')[0];

  return game.releaseDate >= windowStartStr;
}

/**
 * インディー枠の並び順（§3.6）。
 *
 * 1. steamRecommendations を持つ候補が先、持たない候補は末尾
 * 2. 持つ者同士は steamRecommendations の降順
 * 3. 持たない者同士は igdbRating の降順。igdbRating も無い候補はその中で末尾
 *
 * 「持つ」の判定は `!== undefined`（0 は「持っている」として扱う。`|| 0` にしない）。
 *
 * 旧スコア（computeIndieScore = youtubePopularity + (1000 − steamRank) + igdbRating × 10）は
 * §3.6 で明示的に棄却された（YouTube 話題性軸を §3.5 で廃止したため）。
 */
export function compareIndieCandidates(a: GameData, b: GameData): number {
  const aHasRec = a.steamRecommendations !== undefined;
  const bHasRec = b.steamRecommendations !== undefined;

  if (aHasRec && bHasRec) {
    return b.steamRecommendations! - a.steamRecommendations!;
  }
  if (aHasRec !== bHasRec) {
    return aHasRec ? -1 : 1;
  }

  // どちらも steamRecommendations を持たない: igdbRating の降順（無い候補は末尾）
  const aRating = a.igdbRating;
  const bRating = b.igdbRating;
  if (aRating !== undefined && bRating !== undefined) {
    return bRating - aRating;
  }
  if (aRating !== undefined) return -1;
  if (bRating !== undefined) return 1;
  return 0;
}

/**
 * インディー枠の候補を絞り込み、indieScore 降順に並べる（§6.1 / §6.2 / §6.3）。
 * 副作用を持たない純関数（ログ出力は呼び出し側で行う）。
 *
 * developer=undefined は isIndieGame が 'no-developer' で ok:false を返すが、
 * 候補プールには含める（話題性ルートで steamRawDeveloper による補完を後段で行うため）。
 */
export function buildIndieCandidates(
  games: GameData[],
  options: { cooldown: Set<string>; alreadySelected: (GameData | null | undefined)[] }
): GameData[] {
  return games
    .filter((g) => {
      const r = isIndieGame(g);
      return r.ok || r.reason === 'no-developer';
    })
    .filter((g) => !isFanGame(g))
    .filter((g) => !isRemakeOrRemaster(g))
    .filter((g) => isQualifiedGame(g))
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => g.source.includes('steam') || g.source.includes('igdb'))
    .filter((g) => !options.cooldown.has(g.normalizedTitle))
    .filter((g) => !isAlreadySelected(g, options.alreadySelected))
    .filter((g) => isWithinIndieReleaseWindow(g))
    .sort(compareIndieCandidates);
}

/**
 * 名作枠の候補を絞り込む（§5.4/§5.5/§5.8決着 / §6.1 / §6.3）。副作用を持たない純関数。
 *
 * 母集団条件は §5.4（`total_rating >= 閾値 & total_rating_count >= 閾値`。
 * `meetsClassicPoolThresholds` で判定）に一本化されている。旧仕様の
 * `metascore`/`igdbRating` によるスコア条件、Steam/YouTube 人気条件は廃止した
 * （PR-D で `metascore` 経路自体を削除する前に、本PRで先に置き換える方針をユーザーが承認済み）。
 *
 * リメイク・リマスターの扱いは §5.5（J-3-e）。`isRemakeOrRemaster` による一律除外ではなく、
 * `isClassicRemakeAllowed` で「原作が母集団にいないリメイクだけ許可」する。
 *
 * 並び順は評価母数（totalRatingCount）の降順（§5.8決着）。`Array.prototype.sort` は
 * 安定ソートのため、同値時は元の配列順を保つ。
 */
export function buildClassicCandidates(
  games: GameData[],
  options: { cooldown: Set<string>; alreadySelected: (GameData | null | undefined)[] }
): GameData[] {
  return games
    .filter((g) => !isInvalidGameTitle(g.title))
    .filter((g) => !isFanGame(g))
    .filter((g) => isClassicRemakeAllowed(g))
    .filter((g) => !options.cooldown.has(g.normalizedTitle))
    .filter((g) => meetsClassicPoolThresholds(g.totalRating, g.totalRatingCount))
    .filter((g) => g.coverImage && g.summary) // 記事に必要な情報があるもの
    .filter((g) => !isAlreadySelected(g, options.alreadySelected))
    .sort((a, b) => (b.totalRatingCount ?? 0) - (a.totalRatingCount ?? 0));
}

/**
 * 記事生成用にゲームを選定
 */
async function selectGamesForArticles(
  games: GameData[],
  options: { steamTopSellersCount: number; amazonRanks: AmazonRankIndex }
): Promise<SelectedGames> {
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

  // 大手企業の新作: 品質ゲート・実存フィルタ適用後に3軸スコア降順で採用+予備差し替え（§2.3）
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const noReleaseDate = games.filter((g) => !g.releaseDate);
  if (noReleaseDate.length > 0) {
    console.log(`  [newReleases] releaseDate なし (${noReleaseDate.length}件): ${noReleaseDate.map((g) => g.title).join(', ')}`);
  }

  const recentGamesCandidates = buildNewReleaseCandidates(games, {
    releasedAfter: threeMonthsAgo,
    cooldown: newReleaseCooldown,
    steamTopSellersCount: options.steamTopSellersCount,
    amazonRanks: options.amazonRanks,
  });

  console.log(`  [newReleases] candidates after filter: ${recentGamesCandidates.length}件`);
  // ログ出力用にタイトル昇順へ並べ替えたコピーを使う（PR #249 レビュー指摘）。
  // recentGamesCandidates 自体（4軸スコア降順）は選定処理に使うため一切変更しない —
  // ここで並べ替えるのはログの出力順序のみ。
  // スコア降順のまま出力すると、domestic=***/score=*** でマスクした行が前後の
  // 実数値行に挟まれ、行位置とdomestic軸の2点刻み素点（100 − 2×(順位−1)）から
  // Amazon 順位が逆算できてしまう（§2.3 ライセンス制約）。位置がスコアの情報を
  // 持たなくなれば、この挟み撃ちによる逆算は成立しなくなる。
  const candidatesForLog = [...recentGamesCandidates].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  for (const g of candidatesForLog) {
    const score = computeNewReleaseScore(g, {
      steamSlotCount: options.steamTopSellersCount,
      amazonRank: options.amazonRanks.lookup(g),
    });
    // domestic 軸の raw は Amazon 順位から逆算できる値のため、他の軸と違って伏せる
    // （§2.3 ライセンス制約: 順位・順位から逆算できる値は console に出さない。掲載の有無まで）
    const axesSummary = score.axes
      .map((a) => (a.axis === 'domestic' ? 'domestic=***' : `${a.axis}=${a.raw.toFixed(1)}`))
      .join(', ');
    const amazonRanked = score.axes.some((a) => a.axis === 'domestic');
    // topAxis が domestic のとき、集約スコア（score.score）は domestic の weighted 値と
    // 一致し、そのまま Amazon 順位を逆算できてしまうため、この場合だけ score も伏せる
    const scoreDisplay = score.topAxis === 'domestic' ? '***' : score.score.toFixed(1);
    console.log(`    - ${g.title} (releaseDate=${g.releaseDate}, steamRank=${g.steamRank ?? '-'}, igdbRating=${g.igdbRating ?? '-'}, igdbRatingCount=${g.igdbRatingCount ?? '-'}, metascore=${g.metascore ?? '-'}, amazon=${amazonRanked ? 'yes' : 'no'}, score=${scoreDisplay}, topAxis=${score.topAxis ?? '-'}, axes=[${axesSummary}])`);
  }

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
  const indieRanked = buildIndieCandidates(games, {
    cooldown: indieCooldown,
    alreadySelected: newReleases,
  });

  console.log(`  [indie] candidates after filter: ${indieRanked.length}件`);
  for (const g of indieRanked.slice(0, 10)) {
    console.log(`    - ${g.title} (releaseDate=${g.releaseDate ?? '-'}, steamRecommendations=${g.steamRecommendations ?? '-'}, igdbRating=${g.igdbRating ?? '-'})`);
  }

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

  // 名作深掘り（高スコア + 人気、またはメタスコアが非常に高い。§5 / §6.1 / §6.3）
  const classicCandidates = buildClassicCandidates(games, {
    cooldown: classicCooldown,
    alreadySelected: [...newReleases, ...indies, featured],
  });

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
 * selected-games.json への書き出し直前に、Amazon 順位を漏らすフィールドを除外する（PR #249 レビュー指摘）。
 *
 * newReleasesReserves は sortByNewReleaseScore による4軸スコア降順の配列。他の3軸
 * （Steam順位・IGDB票数・批評スコアと媒体数）は GameData に永続化されており再計算できるため、
 * domestic 軸が topAxis のゲームについては配列内の位置から domestic 軸の寄与分だけが残り、
 * それが Amazon 順位を数ランクの幅に絞り込む経路になる。selected-games.json は Git 追跡下で
 * 恒久保存されるため、§2.3「24時間超の保存禁止」に正面から抵触する。
 * generate-articles.ts は newReleasesReserves / indieReserves を読み込み時に
 * `??= []` で正規化し、ファイル不在時のフォールバックを組むだけで、それ以降は一度も
 * 参照しないため、除外しても記事生成に機能的な影響はない。
 * newReleasesReserves は同一プロセス内では removeZombieGames / runCompletenessGate の
 * 差し替えプールとして使われており、その利用はこの書き出しより前に完了している。
 *
 * indieReserves はあえて除外しない: インディー枠の選定には amazonRanks を渡しておらず
 * Amazon 順位の信号を一切含まないため、デバッグ用途としての価値が残る。
 *
 * SelectedGames 型自体は変えない（fetch-data.ts の同一プロセス内では
 * newReleasesReserves を引き続き使うため）。この関数は書き出し直前の直列化対象のみを絞る。
 */
export function toPersistableSelectedGames(
  selectedGames: SelectedGames
): Omit<SelectedGames, 'newReleasesReserves'> {
  const { newReleasesReserves: _newReleasesReserves, ...persistable } = selectedGames;
  return persistable;
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
  const [steamResult, youtubeResult, igdbResult, metacriticResult, amazonRanks] =
    await Promise.all([
      fetchSteamData(),
      fetchYouTubeData(),
      fetchIGDBData(),
      fetchMetacriticData(),
      fetchAmazonRanking(),
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
  const selectedGames = await selectGamesForArticles(games, {
    steamTopSellersCount: steamData.topSellers.length,
    amazonRanks,
  });
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
  const gateReport = await runCompletenessGate(
    selectedGames,
    resolverTrace,
    reservePool,
    gateMode,
    {
      newReleases: selectedGames.newReleasesReserves,
      indies: selectedGames.indieReserves,
    },
    {
      newReleases: vetNewReleaseCandidate,
      // インディーの vetting は youtubePopularitySorted を必要とするためクロージャで渡す。
      // indieReserves は indieRanked 順（スコア降順）であり youtubePopularity 降順ではないため、
      // percentile 計算用にここでソートして渡す。
      indies: (g) => vetIndieCandidate(g, {
        youtubePopularitySorted: [...selectedGames.indieReserves].sort(
          (a, b) => (b.youtubePopularity ?? 0) - (a.youtubePopularity ?? 0)
        ),
      }),
    }
  );
  console.log(
    `  [CompletenessGate] mode=${gateMode}, violations=${gateReport.violations.length}, ` +
    `replaced=${gateReport.replacedGames.length}, unresolved=${gateReport.unresolvedMutableViolations}, ` +
    `shortfall=${gateReport.replacementShortfall.length > 0 ? gateReport.replacementShortfall.join('/') : 'none'}`
  );
  if (gateReport.violations.length > 0) {
    for (const v of gateReport.violations) {
      console.warn(`  [CompletenessGate] ${v.ruleId} "${v.gameTitle}": ${v.detail}`);
    }
  }
  if (gateReport.replacedGames.length > 0) {
    console.log(`  [CompletenessGate] Replaced games: ${gateReport.replacedGames.join(', ')}`);
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

  // 選定結果も別ファイルに出力（newReleasesReserves は Amazon 順位を漏らすため除外。PR #249）
  const selectedPath = path.join(DATA_DIR, 'selected-games.json');
  fs.writeFileSync(
    selectedPath,
    JSON.stringify(toPersistableSelectedGames(selectedGames), null, 2)
  );
  console.log(`Selected games saved to: ${selectedPath}`);

  if (gateMode === 'fail' && gateReport.unresolvedMutableViolations) {
    console.error('  [CompletenessGate] FAIL: unresolved mutable violations remain after replacement, aborting.');
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
