/**
 * 記事生成スクリプト
 * Amazon Bedrock (Claude) を使ってゲーム記事を自動生成
 */

import { config } from 'dotenv';

// .env.local を優先的に読み込み
config({ path: '.env.local' });
config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SelectedGames, GameData, RecommendedGame } from './types.js';
import { getCooldownTitles } from './game-history.js';
import { isQualifiedGame } from './game-filter.js';
import {
  invokeClaudeModel,
  PromptTemplates,
  buildUserMessage,
  buildFeatureUserMessage,
  selectFeatureThemeWithAI,
  selectFeatureGames,
  prefilterFeatureCandidatesByTheme,
  proposeThemeGamesFromKnowledge,
  parseArticleResponse,
  parseTitleResponse,
} from './bedrock-client.js';
import type { FeatureSelectedGame, FeatureCandidateBase, FeatureCandidateWithSearch } from './bedrock-client.js';
import { getEventsInRange } from './fetch-japanese-events.js';
import { generateFeatureImage } from './generate-feature-image.js';
import {
  searchGameInfo,
  formatSearchResultsForPrompt,
  flattenSearchResults,
  isTavilyAvailable,
  fetchOfficialPageContents,
} from './fetch-web-search.js';
import { fetchOfficialJpUrl } from './fetch-official-jp-url.js';
import { enrichGameWithIGDB } from './fetch-igdb.js';
import { validateArticle, buildFixInstruction } from './validate-article.js';
import { isBlockedAdultGame } from './adult-blocklist.js';
import { normalizeTitle } from './normalize.js';

// 開発モード判定
const DEV_MODE = process.env.DEV_MODE === 'true';

// Web検索失敗カウンター型（main()でローカルに生成し参照渡し）
interface WebSearchStats {
  searchFailures: number;
  pageContentFailures: number;
}

// データディレクトリ
const DATA_DIR = path.join(process.cwd(), 'data');
const ISSUES_DIR = DEV_MODE
  ? path.join(process.cwd(), 'src', 'content', 'issues-dev')
  : path.join(process.cwd(), 'src', 'content', 'issues');

// 特集記事のゲーム選定に関する定数
// 一次選抜（テーマ事前フィルタ）で残す候補数の上限。最終選定 selectFeatureGames に渡る母集団。
const FEATURE_CANDIDATE_LIMIT = 20;
// 特集記事に最低限欲しいゲーム本数。これを下回ると警告を出す（selectFeatureGames の下限と揃える）。
const FEATURE_MIN_GAMES = 3;

/**
 * 次の号番号を取得
 */
function getNextIssueNumber(): number {
  if (!fs.existsSync(ISSUES_DIR)) {
    return 1;
  }

  const files = fs.readdirSync(ISSUES_DIR);
  const issueNumbers = files
    .filter((f) => f.match(/^issue-\d+\.md$/))
    .map((f) => {
      const match = f.match(/^issue-(\d+)\.md$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);

  if (issueNumbers.length === 0) {
    return 1;
  }

  return Math.max(...issueNumbers) + 1;
}

// SourceUrls型をインポート
import type { SourceUrls } from './types.js';

// 記事生成時に使用した Tavily 検索結果の保存用型
export interface WebSearchSource {
  url: string;
  title: string;
  snippet: string; // content の先頭部分（sourcedFrom 判定用。最大長は fetch-web-search の SNIPPET_MAX_LENGTH）
}

/**
 * 記事再生成（P4）のオプション。
 * - fixInstruction: バリデーション警告から組み立てた修正指示（プロンプトに付与）
 * - cachedSearch: 前回生成時の Tavily 検索結果。再生成時の再検索を避けてコスト・レートを抑える
 */
export interface RegenerateOptions {
  fixInstruction?: string;
  cachedSearch?: {
    context: string;
    sources: WebSearchSource[];
  };
}

// 生成された記事の型定義
export interface GeneratedArticle {
  title: string;
  category: 'newRelease' | 'indie' | 'feature' | 'classic';
  summary: string;
  content: string;
  featureImage?: string; // 特集記事用のAI生成画像パス
  recommendedGames?: RecommendedGame[]; // 特集記事のおすすめゲーム
  sourceUrls?: SourceUrls; // 参照元URL
  webSearchSources?: WebSearchSource[]; // 生成時に参照した Tavily 検索結果
  game?: {
    title: string;
    titleJa?: string;
    genre: string[];
    platforms: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    developerCountry?: string;
    coverImage?: string;
    coverImageOrientation?: 'portrait' | 'landscape';
    screenshots?: string[];
    metascore?: number | null;
    userScore?: number | null;
    isAiInferred?: boolean;
    aiInferredFields?: string[];
  };
}

export interface GeneratedIssue {
  articles: GeneratedArticle[];
  generatedAt: string;
  publishDate: string;
  webSearchStats?: {
    searchFailures: number;       // Tavilyキーワード検索の失敗回数
    pageContentFailures: number;  // 公式ページ取得の失敗回数
  };
}

/**
 * 記事タイトルを生成
 */
async function generateTitle(
  category: string,
  gameTitle: string,
  summary?: string,
  itemCount?: number,
  titleJa?: string,
  releaseDate?: string,
  publishDate?: Date
): Promise<string> {
  const countNote = itemCount !== undefined ? `\n紹介するゲームの本数: ${itemCount}本（タイトルに「N選」を含める場合はこの数を使うこと）` : '';

  // タイトル指定: 日本語タイトルがあれば日本語を優先、無ければ英語をそのまま使用
  const titleSection = titleJa
    ? `タイトル（日本語、記事内で優先使用）: ${titleJa}\nタイトル（英語/国際名、変更禁止）: ${gameTitle}`
    : `タイトル（英語/国際名、変更禁止）: ${gameTitle}`;

  // 発売状態を判定してプロンプトに付与する
  let releaseStatusNote = '';
  if (releaseDate && publishDate) {
    const releaseTime = new Date(releaseDate).getTime();
    if (!isNaN(releaseTime)) {
      const status = releaseTime <= publishDate.getTime() ? '発売済み' : '発売予定';
      releaseStatusNote = `\n発売状態: ${status}`;
    }
  }

  const userMessage = `カテゴリ: ${category}
${titleSection}${summary ? `\n概要: ${summary}` : ''}${releaseStatusNote}${countNote}

上記の情報を元に、記事タイトルを1つ生成してください。
ゲームタイトルは提供された通りに正確に使用し、短縮・翻訳・並べ替え・改変は禁止です。
記事タイトルには必ず上記のゲームタイトル（日本語名があれば日本語名）をそのまま含めてください。`;

  try {
    const response = await invokeClaudeModel(
      PromptTemplates.titleSystem,
      userMessage,
      { maxTokens: 100, temperature: 0.8 }
    );
    return parseTitleResponse(response);
  } catch (error) {
    console.warn(`Title generation failed, using fallback: ${error}`);
    // フォールバック: ゲームタイトルをそのまま使用
    return `注目タイトル『${titleJa || gameTitle}』をご紹介`;
  }
}

/**
 * 記事の要約を生成
 */
async function generateSummary(
  content: string,
  maxLength: number = 120
): Promise<string> {
  const userMessage = `以下の記事を${maxLength}文字以内で要約してください。

【重要なルール】
- 必ず完全な文で終わること（「。」で終わる）
- 文の途中で切れないこと
- 要約文のみを出力すること

${content}`;

  try {
    const response = await invokeClaudeModel(
      'あなたは日本語の編集者です。与えられた文章を簡潔に要約してください。必ず完全な文（「。」で終わる）で出力してください。',
      userMessage,
      { maxTokens: 250, temperature: 0.3 }
    );

    let summary = response.trim();

    // 文字数制限を超えている場合、最後の句点で切る
    if (summary.length > maxLength) {
      const lastPeriod = summary.lastIndexOf('。', maxLength);
      if (lastPeriod > 0) {
        summary = summary.slice(0, lastPeriod + 1);
      } else {
        // 句点がない場合は強制的に切って「。」を付ける
        summary = summary.slice(0, maxLength - 1) + '。';
      }
    }

    // 句点で終わっていない場合は追加
    if (!summary.endsWith('。')) {
      summary = summary + '。';
    }

    return summary;
  } catch (error) {
    console.warn(`Summary generation failed, using fallback: ${error}`);
    // フォールバック: コンテンツの冒頭を使用し、句点で切る
    const cleanContent = content.replace(/[#*_]/g, '');
    const lastPeriod = cleanContent.lastIndexOf('。', maxLength);
    if (lastPeriod > 0) {
      return cleanContent.slice(0, lastPeriod + 1);
    }
    return cleanContent.slice(0, maxLength - 1) + '。';
  }
}

/**
 * AI によるコンテンツスクリーニング
 * ゲームタイトルと概要を元に成人向けコンテンツか判定する。
 * 判定が難しい場合は安全側（false）に倒す。
 */
async function isAdultContentByAI(game: GameData): Promise<boolean> {
  const title = game.title;
  const summary = game.summary || '';

  if (!title) return false;

  const systemPrompt = `あなたはゲーム情報サイトのコンテンツモデレーターです。
与えられたゲーム情報が成人向け（性的コンテンツ・アダルトゲーム）かどうかを判定してください。

【判定基準】
- 性的・官能的なコンテンツを主体とするゲームは「YES」
- 暴力描写のみ（ホラー・アクション等）は「NO」
- 恋愛・ロマンス要素があっても一般向けなら「NO」
- 判断が難しい場合は「NO」

【出力形式】
YES または NO のみを1行で出力してください。理由は不要です。`;

  const userMessage = `ゲームタイトル: ${title}
概要: ${summary || '（概要なし）'}`;

  try {
    const response = await invokeClaudeModel(systemPrompt, userMessage, {
      maxTokens: 10,
      temperature: 0,
    });
    const result = response.trim().toUpperCase();
    if (result === 'YES') {
      console.log(`  [AI Screening] Adult content detected: "${title}"`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`  [AI Screening] Failed for "${title}", defaulting to safe: ${error}`);
    return false;
  }
}

/**
 * 大手企業新作記事を生成
 */
async function generateNewReleaseArticle(
  game: GameData,
  publishDate: Date,
  regenOpts?: RegenerateOptions,
  stats?: WebSearchStats
): Promise<GeneratedArticle> {
  console.log(`  Generating new release article: ${game.title}`);

  // Web検索で追加情報を取得（再生成時は前回の検索結果を流用し再検索しない）
  let webSearchContext = regenOpts?.cachedSearch?.context ?? '';
  let webSearchSources: WebSearchSource[] = regenOpts?.cachedSearch?.sources ?? [];
  if (!regenOpts?.cachedSearch && isTavilyAvailable()) {
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'newRelease', game.developer);
      webSearchContext = formatSearchResultsForPrompt(searchResults);
      webSearchSources = flattenSearchResults(searchResults);
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
      if (stats) stats.searchFailures++;
    }
  }

  // Steam/公式ページのコンテンツを取得（再生成時はスキップ）
  let officialPageContext: string | undefined;
  if (!regenOpts?.cachedSearch && isTavilyAvailable()) {
    const pageContents = await fetchOfficialPageContents({
      steamUrl: game.sourceUrls?.steam,
      officialUrl: game.sourceUrls?.official,
      officialUrlSource: game.sourceUrls?.officialUrlSource,
    });
    if (stats) stats.pageContentFailures += pageContents.failures;
    const parts: string[] = [];
    if (pageContents.steamContent) parts.push(`[Steamストアページ]\n${pageContents.steamContent}`);
    if (pageContents.officialContent) parts.push(`[公式サイト]\n${pageContents.officialContent}`);
    if (parts.length > 0) officialPageContext = parts.join('\n\n');
  }

  const userMessage = buildUserMessage(
    'newRelease',
    {
      title: game.title,
      titleJa: game.titleJa,
      genres: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      summary: game.summary,
      metascore: game.metascore,
      userScore: game.userScore,
    },
    webSearchContext || undefined,
    publishDate,
    regenOpts?.fixInstruction,
    officialPageContext
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.newReleaseSystem, userMessage, {
      maxTokens: 3000,
      temperature: 0.2,
    })
  );

  const newReleaseCategoryLabel = game.developer ? `${game.developer}の新作` : '注目新作';
  const title = await generateTitle(newReleaseCategoryLabel, game.title, game.summary, undefined, game.titleJa, game.releaseDate, publishDate);
  const summary = await generateSummary(content);

  return {
    title,
    category: 'newRelease',
    summary,
    content,
    sourceUrls: game.sourceUrls,
    webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
    game: {
      title: game.title,
      titleJa: game.titleJa,
      genre: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      developerCountry: game.developerCountry,
      coverImage: game.coverImage,
      coverImageOrientation: game.coverImageOrientation,
      screenshots: game.screenshots,
      metascore: game.metascore,
      userScore: game.userScore,
    },
  };
}

/**
 * インディーゲーム記事を生成
 */
async function generateIndieArticle(
  game: GameData,
  publishDate: Date,
  regenOpts?: RegenerateOptions,
  stats?: WebSearchStats
): Promise<GeneratedArticle> {
  console.log(`  Generating indie article: ${game.title}`);

  // 基本の追加コンテキスト
  const contextParts: string[] = [];
  let webSearchSources: WebSearchSource[] = regenOpts?.cachedSearch?.sources ?? [];
  if (game.youtubePopularity) {
    contextParts.push(`YouTubeでの累計視聴回数: ${game.youtubePopularity.toLocaleString()}回`);
  }

  if (regenOpts?.cachedSearch) {
    // 再生成時は前回の検索結果を流用し再検索しない
    if (regenOpts.cachedSearch.context) {
      contextParts.push(regenOpts.cachedSearch.context);
    }
  } else if (isTavilyAvailable()) {
    // Web検索で追加情報を取得
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'indie', game.developer);
      const webSearchContext = formatSearchResultsForPrompt(searchResults);
      if (webSearchContext) {
        contextParts.push(webSearchContext);
      }
      webSearchSources = flattenSearchResults(searchResults);
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
      if (stats) stats.searchFailures++;
    }
  }

  const additionalContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

  // Steam/公式ページのコンテンツを取得
  let officialPageContext: string | undefined;
  if (!regenOpts?.cachedSearch && isTavilyAvailable()) {
    const pageContents = await fetchOfficialPageContents({
      steamUrl: game.sourceUrls?.steam,
      officialUrl: game.sourceUrls?.official,
      officialUrlSource: game.sourceUrls?.officialUrlSource,
    });
    if (stats) stats.pageContentFailures += pageContents.failures;
    const parts: string[] = [];
    if (pageContents.steamContent) parts.push(`[Steamストアページ]\n${pageContents.steamContent}`);
    if (pageContents.officialContent) parts.push(`[公式サイト]\n${pageContents.officialContent}`);
    if (parts.length > 0) officialPageContext = parts.join('\n\n');
  }

  const userMessage = buildUserMessage(
    'indie',
    {
      title: game.title,
      titleJa: game.titleJa,
      genres: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      summary: game.summary,
      metascore: game.metascore,
      userScore: game.userScore,
    },
    additionalContext,
    publishDate,
    regenOpts?.fixInstruction,
    officialPageContext
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.indieSystem, userMessage, {
      maxTokens: 3000,
      temperature: 0.2,
    })
  );

  const title = await generateTitle(
    '話題のインディーゲーム',
    game.title,
    game.summary,
    undefined,
    game.titleJa,
    game.releaseDate,
    publishDate
  );
  const summary = await generateSummary(content);

  return {
    title,
    category: 'indie',
    summary,
    content,
    sourceUrls: game.sourceUrls,
    webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
    game: {
      title: game.title,
      titleJa: game.titleJa,
      genre: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      developerCountry: game.developerCountry,
      coverImage: game.coverImage,
      coverImageOrientation: game.coverImageOrientation,
      screenshots: game.screenshots,
      metascore: game.metascore,
      userScore: game.userScore,
      isAiInferred: game.isAiInferred,
      aiInferredFields: game.aiInferredFields,
    },
  };
}


/**
 * GameData を prefilter / select 用の候補型に変換する。
 * qualified / fringe / フォールバックの3箇所で同一マッピングを使うためここに集約。
 */
function toFeatureCandidate(g: GameData): FeatureCandidateBase {
  return {
    title: g.title,
    titleJa: g.titleJa,
    genres: g.genres,
    summary: g.summary,
    igdbRating: g.igdbRating,
    igdbRatingCount: g.igdbRatingCount,
    metascore: g.metascore,
    steamRank: g.steamRank,
    steamPlayers: g.steamPlayers,
    youtubePopularity: g.youtubePopularity,
  };
}


/**
 * LLM が提案したゲームタイトルを IGDB で実在検証し、GameData として返す（フェーズ2）。
 *
 * - enrichGameWithIGDB() で検索し、null（不在/非関連/年不一致）は破棄する
 * - アダルトコンテンツ（ブロックリスト）に該当するものは除外する
 * - 通過分は IGDBGame フィールドを GameData にマッピングして返す
 * - aggregated.json には書き戻さない（読み取り元を汚さない）
 */
async function verifyProposedGames(
  proposals: { title: string; reason: string; expectedYear?: number }[]
): Promise<GameData[]> {
  const verified: GameData[] = [];

  for (const proposal of proposals) {
    if (isBlockedAdultGame(proposal.title)) {
      console.log(`  [verify] Skipped (blocked): "${proposal.title}"`);
      continue;
    }

    const igdb = await enrichGameWithIGDB(proposal.title, {
      expectedYear: proposal.expectedYear,
    });

    if (!igdb) {
      console.log(`  [verify] Not found in IGDB: "${proposal.title}"`);
      continue;
    }

    if (isBlockedAdultGame(igdb.name)) {
      console.log(`  [verify] Skipped (blocked by IGDB name): "${igdb.name}"`);
      continue;
    }

    // Issue #117: IGDB の category=1 タグ付き URL のみを採用する仕様（pickOfficialUrlFromWebsites）に
    // 変更したため、igdb.officialUrl は IGDB が公式サイトとして明示した URL のみとなる。
    // 機械フォールバック由来の不一致URLは構造的に発生しないので内容検証は省略する。
    const verifiedOfficialUrl = igdb.officialUrl;

    const gameData: GameData = {
      title: igdb.name,
      titleJa: igdb.titleJa,
      normalizedTitle: igdb.name.toLowerCase().trim(),
      igdbSlug: igdb.slug,
      genres: igdb.genres ?? [],
      platforms: igdb.platforms ?? [],
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
      sourceUrls: {
        igdb: igdb.slug ? `https://www.igdb.com/games/${igdb.slug}` : undefined,
        steam: igdb.steamUrl,
        official: verifiedOfficialUrl,
        officialUrlSource: verifiedOfficialUrl ? igdb.officialUrlSource : undefined,
      },
    };

    console.log(
      `  [verify] Verified: "${proposal.title}" -> "${igdb.name}" (IGDB rc=${igdb.ratingCount ?? 'n/a'})`
    );
    verified.push(gameData);

    await new Promise((r) => setTimeout(r, 250));
  }

  return verified;
}

/**
 * 候補ゲームリストの重複を除去して返す（フェーズ2: 合流時の重複除去）。
 *
 * normalizeTitle による正規化タイトル一致で重複を判定し、先頭（aggregated.json 側）を優先する。
 */
function deduplicateGames(games: GameData[]): GameData[] {
  const seen = new Set<string>();
  const result: GameData[] = [];
  for (const g of games) {
    const key = normalizeTitle(g.title);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(g);
    }
  }
  return result;
}

/**
 * 特集記事の本文生成に必要な確定済みコンテキスト。
 * 再生成時に、テーマ選定・ゲーム選定・検索・画像生成をやり直さず本文だけ作り直すために使う。
 */
interface FeatureArticleContext {
  theme: string;
  featureGames: FeatureSelectedGame[];
  recommendedGames: RecommendedGame[];
  webSearchSources: WebSearchSource[];
  featureImagePath?: string;
  publishDate: Date;
}

/**
 * 確定済みコンテキストから特集記事の本文・要約・タイトルを生成して GeneratedArticle を組み立てる。
 *
 * 初回生成と再生成の両方から呼ばれる。再生成時は fixInstruction に修正指示を渡す。
 * テーマ・選定ゲーム・検索結果・画像は引数で受け取った確定値を流用し、再取得しない。
 */
async function buildFeatureArticleFromContext(
  ctx: FeatureArticleContext,
  fixInstruction?: string
): Promise<GeneratedArticle> {
  const userMessage = buildFeatureUserMessage(
    ctx.theme,
    ctx.publishDate,
    ctx.featureGames,
    fixInstruction
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.featureSystem, userMessage, {
      maxTokens: 4000,
      temperature: 0.2,
    })
  );

  const summary = await generateSummary(content);
  const title = await generateTitle('特集', ctx.theme, summary, ctx.featureGames.length);

  return {
    title,
    category: 'feature',
    summary,
    content,
    featureImage: ctx.featureImagePath,
    recommendedGames: ctx.recommendedGames.length > 0 ? ctx.recommendedGames : undefined,
    webSearchSources: ctx.webSearchSources.length > 0 ? ctx.webSearchSources : undefined,
  };
}

/**
 * 特集記事を生成
 *
 * フロー: テーマ選定 → ゲーム選定（候補から確定）→ メタデータ取得（候補GameData流用
 * ＋公式URL取得＋Tavily検索）→ 本文生成。
 * ゲームを確定してから正確なメタデータと検索結果を揃えて本文を書くことで、
 * 本文へのグラウンディングを成立させハルシネーションを抑制する。
 */
export async function generateFeatureArticle(
  publishDate: Date,
  issueNumber: number,
  relatedGames?: GameData[],
  excludeTitles?: string[],
  stats?: WebSearchStats
): Promise<{ article: GeneratedArticle; context: FeatureArticleContext }> {
  // --- フェーズ1: テーマ選定 ---
  const events = getEventsInRange(publishDate, 7);
  console.log(`  Found ${events.length} events in the next 7 days`);

  const theme = await selectFeatureThemeWithAI(
    events.map((e) => ({ name: e.name, gameThemeHint: e.gameThemeHint }))
  );
  console.log(`  Feature theme: ${theme}`);

  // --- フェーズ2: ゲーム選定（候補リストから確定タイトルを得る）---
  // 候補プールはテーマ非依存の人気順で並んでいるため、先頭を機械的に切ると
  // テーマに合うゲームが枠外に落ちて選定本数が減る（vol.9で特集が1本になった原因）。
  // そこで、まずテーマ事前フィルタ（LLM一次選抜）でテーマ関連の上位を抽出してから
  // 最終選定に渡す。フィルタが空（候補が上限以下 or LLM失敗）の場合は従来通り先頭を使う。

  // フェーズ2 候補プール拡張: LLM の知識ベースからテーマ関連ゲームを提案し
  // enrichGameWithIGDB() で実在検証してから aggregated.json 候補と合流させる。
  // 検証通過分のみを合流させることで selectFeatureGames の「候補 title からのみ選べ」制約を維持する。
  const existingTitles = (relatedGames ?? []).map((g) => g.title);
  const gameThemeHint =
    events.length > 0 ? events.map((e) => e.gameThemeHint).join(', ') : theme;

  let proposedAndVerified: GameData[] = [];
  try {
    const { proposals } = await proposeThemeGamesFromKnowledge(
      theme,
      gameThemeHint,
      existingTitles
    );
    console.log(`  LLM proposed ${proposals.length} games for theme`);

    if (proposals.length > 0) {
      proposedAndVerified = await verifyProposedGames(proposals);
      console.log(
        `  Verified ${proposedAndVerified.length}/${proposals.length} proposed games via IGDB`
      );
    }
  } catch (error) {
    console.warn('  Failed to propose/verify theme games, continuing with existing candidates:', error);
  }

  // aggregated.json 候補 + 検証通過提案ゲームを合流（重複除去）
  // aggregated.json には書き戻さない（読み取り元を汚さない）
  const allCandidates = deduplicateGames([...(relatedGames ?? []), ...proposedAndVerified]);

  // 品質フィルタ: qualified / fringe に分割
  const qualified = allCandidates.filter(isQualifiedGame);
  const fringe = allCandidates.filter((g) => !isQualifiedGame(g));
  console.log(`  Feature candidates: ${qualified.length} qualified, ${fringe.length} fringe`);

  const prefilteredTitles = await prefilterFeatureCandidatesByTheme(
    theme,
    qualified.map(toFeatureCandidate),
    FEATURE_CANDIDATE_LIMIT
  );

  let prefiltered: GameData[];
  if (prefilteredTitles.length > 0) {
    const prefilterSet = new Set(prefilteredTitles.map((t) => normalizeTitle(t)));
    prefiltered = qualified
      .filter((g) => prefilterSet.has(normalizeTitle(g.title)))
      .slice(0, FEATURE_CANDIDATE_LIMIT);
    console.log(`  Theme prefilter narrowed candidates to ${prefiltered.length} games`);
  } else {
    prefiltered = qualified.slice(0, FEATURE_CANDIDATE_LIMIT);
    console.log(`  Theme prefilter returned nothing, falling back to top ${prefiltered.length} qualified games`);
  }

  // Web検索による実態確認（prefilter通過分のみ）
  const searchSnippets = new Map<string, string>();
  const searchSourcesCache = new Map<string, WebSearchSource[]>();
  if (isTavilyAvailable()) {
    for (const game of prefiltered) {
      try {
        const snippets = await searchGameInfo(game.title, 'feature', game.developer);
        if (snippets) {
          searchSnippets.set(game.title, formatSearchResultsForPrompt(snippets));
          searchSourcesCache.set(game.title, flattenSearchResults(snippets));
        }
      } catch (error) {
        console.warn(`    Web search failed for "${game.title}" (prefilter stage):`, error);
        if (stats) stats.searchFailures++;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`  Web search completed for ${searchSnippets.size}/${prefiltered.length} candidates`);
  }

  const candidatesWithSearch: FeatureCandidateWithSearch[] = prefiltered.map((g) => ({
    ...toFeatureCandidate(g),
    webSearchSnippet: searchSnippets.get(g.title),
  }));

  const selectedTitles = await selectFeatureGames(
    theme,
    candidatesWithSearch,
    excludeTitles
  );
  console.log(`  Selected ${selectedTitles.length} games for feature: ${selectedTitles.join(', ')}`);

  // 選定タイトルを候補 GameData に突き合わせる（完全一致 → 正規化一致のフォールバック）
  // 検索対象は prefiltered（qualified のうちテーマ事前フィルタ通過分）
  const selectedGameData: GameData[] = [];
  for (const title of selectedTitles) {
    const exact = prefiltered.find((g) => g.title === title);
    const matched =
      exact ?? prefiltered.find((g) => normalizeTitle(g.title) === normalizeTitle(title));
    if (matched) {
      selectedGameData.push(matched);
    } else {
      console.warn(`  Selected title not found in candidates, skipping: "${title}"`);
    }
  }

  // 不足時: fringe から段階的に補充（qualified のみでは FEATURE_MIN_GAMES を下回る場合）
  if (selectedGameData.length < FEATURE_MIN_GAMES && fringe.length > 0) {
    console.warn(
      `  [WARN] qualified only gave ${selectedGameData.length} games, supplementing from fringe`
    );
    const fringePrefilterTitles = await prefilterFeatureCandidatesByTheme(
      theme,
      fringe.map(toFeatureCandidate),
      FEATURE_CANDIDATE_LIMIT
    );

    const fringePrefilterSet = new Set(fringePrefilterTitles.map((t) => normalizeTitle(t)));
    const fringePrefiltered = fringePrefilterTitles.length > 0
      ? fringe.filter((g) => fringePrefilterSet.has(normalizeTitle(g.title)))
      : fringe.slice(0, FEATURE_CANDIDATE_LIMIT);

    // fringe 候補にも Tavily 検索を実施（qualified と同様に Web スニペットを付与）
    if (isTavilyAvailable()) {
      for (const game of fringePrefiltered) {
        if (searchSnippets.has(game.title)) continue; // qualified 段階で検索済みならスキップ
        try {
          const snippets = await searchGameInfo(game.title, 'feature', game.developer);
          if (snippets) {
            searchSnippets.set(game.title, formatSearchResultsForPrompt(snippets));
            searchSourcesCache.set(game.title, flattenSearchResults(snippets));
          }
        } catch (error) {
          console.warn(`    Web search failed for "${game.title}" (fringe stage):`, error);
          if (stats) stats.searchFailures++;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const fringeCandidates: FeatureCandidateWithSearch[] = fringePrefiltered.map((g) => ({
      ...toFeatureCandidate(g),
      webSearchSnippet: searchSnippets.get(g.title),
    }));

    const allCandidatesForFallback: FeatureCandidateWithSearch[] = [
      ...candidatesWithSearch,
      ...fringeCandidates,
    ];

    const fallbackTitles = await selectFeatureGames(
      theme,
      allCandidatesForFallback,
      excludeTitles
    );
    console.log(`  Fallback selection: ${fallbackTitles.join(', ')}`);

    for (const title of fallbackTitles) {
      const alreadySelected = selectedGameData.some((g) => g.title === title);
      if (alreadySelected) continue;
      const allPool = [...prefiltered, ...fringePrefiltered];
      const exact = allPool.find((g) => g.title === title);
      const matched =
        exact ?? allPool.find((g) => normalizeTitle(g.title) === normalizeTitle(title));
      if (matched) {
        selectedGameData.push(matched);
      }
    }
  }

  // 特集ゲームが規定本数を下回ったら警告（黙って薄い特集が出るのを検知するため）。
  // テーマが限定的で候補が枯渇した場合に起こり得る。
  if (selectedGameData.length < FEATURE_MIN_GAMES) {
    console.warn(
      `  ⚠ Feature article has only ${selectedGameData.length} game(s) (expected >= ${FEATURE_MIN_GAMES}). ` +
        `Theme "${theme}" may be too narrow or candidate pool too small.`
    );
  }

  // --- フェーズ3: メタデータ取得（公式URL + Tavily検索）---
  const recommendedGames: RecommendedGame[] = [];
  const webSearchSources: WebSearchSource[] = [];
  const featureGames: FeatureSelectedGame[] = [];

  for (const game of selectedGameData) {
    // 公式日本語URL（選定確定後にゲーム単位で取得）
    // verifyProposedGames() で検証済みの URL が既にある場合はそれを初期値とし、
    // Tavily が上書きできれば（日本語URL優先）上書き、できなければそのまま使う。
    let officialUrl: string | undefined = game.sourceUrls?.official;
    let officialVerifyReason: string | undefined = game.sourceUrls?.officialVerifyReason;
    try {
      const releaseYear = game.releaseDate ? game.releaseDate.slice(0, 4) : undefined;
      const officialResult = await fetchOfficialJpUrl({
        titleEn: game.title,
        titleJa: game.titleJa,
        releaseYear,
        developer: game.developer,
        publisher: game.publisher,
      });
      if (officialResult) {
        officialUrl = officialResult.url;
        officialVerifyReason = officialResult.verifyReason;
        game.sourceUrls = {
          ...game.sourceUrls,
          official: officialUrl,
          officialUrlSource: 'tavily',
          officialVerifyReason,
        };
      }

      if (!officialUrl) {
        const igdbFallback = await enrichGameWithIGDB(game.title, {
          expectedYear: releaseYear ? parseInt(releaseYear, 10) : undefined,
          steamAppId: game.steamAppId,
        });
        // Issue #117: igdbFallback.officialUrl は IGDB の category=1 タグ付き URL のみ
        // （pickOfficialUrlFromWebsites の挙動変更による）。内容検証は省略してそのまま採用する。
        if (igdbFallback?.officialUrl) {
          console.log(`    Using IGDB official URL as fallback: ${igdbFallback.officialUrl}`);
          officialUrl = igdbFallback.officialUrl;
        }
      }
    } catch (error) {
      console.warn(`    Failed to fetch official URL for "${game.title}":`, error);
    }

    // Tavily 検索（本文グラウンディング用）
    // prefilter 通過時に検索済みの場合はキャッシュを流用し再検索しない
    let webSearchContext: string | undefined;
    const cachedSnippet = searchSnippets.get(game.title);
    if (cachedSnippet) {
      webSearchContext = cachedSnippet || undefined;
      const cachedSrcs = searchSourcesCache.get(game.title);
      if (cachedSrcs) webSearchSources.push(...cachedSrcs);
    } else if (isTavilyAvailable()) {
      try {
        const searchResults = await searchGameInfo(game.title, 'feature', game.developer);
        webSearchContext = formatSearchResultsForPrompt(searchResults) || undefined;
        webSearchSources.push(...flattenSearchResults(searchResults));
        await new Promise((r) => setTimeout(r, 500)); // レート制限対策
      } catch (error) {
        console.warn(`    Web search failed for "${game.title}", continuing:`, error);
        if (stats) stats.searchFailures++;
      }
    }

    // 表示用 recommendedGames（候補 GameData のメタデータを流用、IGDB再取得は不要）
    recommendedGames.push({
      title: game.titleJa ?? game.title,
      coverImage: game.coverImage,
      officialUrl,
      platforms: game.platforms,
      developer: game.developer,
      publisher: game.publisher,
    });

    // 本文生成プロンプト用の正確なメタデータ＋検索結果
    featureGames.push({
      title: game.title,
      titleJa: game.titleJa,
      genres: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      summary: game.summary,
      webSearchContext,
    });
  }

  // 特集記事用の画像を生成（再生成時は流用するため先に1回だけ生成）
  let featureImagePath: string | undefined;
  try {
    console.log('  Generating feature image...');
    featureImagePath = await generateFeatureImage(theme, issueNumber);
    console.log(`  Feature image generated: ${featureImagePath}`);
  } catch (error) {
    console.warn('  Failed to generate feature image:', error);
    // 画像生成に失敗しても記事は生成する
  }

  // --- フェーズ4: 本文生成 ---
  const context: FeatureArticleContext = {
    theme,
    featureGames,
    recommendedGames,
    webSearchSources,
    featureImagePath,
    publishDate,
  };
  const article = await buildFeatureArticleFromContext(context);

  return { article, context };
}

/**
 * 名作深掘り記事を生成
 */
async function generateClassicArticle(
  game: GameData,
  publishDate: Date,
  regenOpts?: RegenerateOptions,
  stats?: WebSearchStats
): Promise<GeneratedArticle> {
  console.log(`  Generating classic article: ${game.title}`);

  // 基本の追加コンテキスト
  const contextParts: string[] = [];
  let webSearchSources: WebSearchSource[] = regenOpts?.cachedSearch?.sources ?? [];
  if (game.steamPlayers) {
    contextParts.push(`現在のSteam同時接続数: ${game.steamPlayers.toLocaleString()}人`);
  }
  if (game.youtubePopularity) {
    contextParts.push(`YouTubeでの人気度: ${game.youtubePopularity.toLocaleString()}`);
  }

  if (regenOpts?.cachedSearch) {
    // 再生成時は前回の検索結果を流用し再検索しない
    if (regenOpts.cachedSearch.context) {
      contextParts.push(regenOpts.cachedSearch.context);
    }
  } else if (isTavilyAvailable()) {
    // Web検索で追加情報を取得
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'classic', game.developer);
      const webSearchContext = formatSearchResultsForPrompt(searchResults);
      if (webSearchContext) {
        contextParts.push(webSearchContext);
      }
      webSearchSources = flattenSearchResults(searchResults);
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
      if (stats) stats.searchFailures++;
    }
  }

  const additionalContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

  // Steam/公式ページのコンテンツを取得
  let officialPageContext: string | undefined;
  if (!regenOpts?.cachedSearch && isTavilyAvailable()) {
    const pageContents = await fetchOfficialPageContents({
      steamUrl: game.sourceUrls?.steam,
      officialUrl: game.sourceUrls?.official,
      officialUrlSource: game.sourceUrls?.officialUrlSource,
    });
    if (stats) stats.pageContentFailures += pageContents.failures;
    const parts: string[] = [];
    if (pageContents.steamContent) parts.push(`[Steamストアページ]\n${pageContents.steamContent}`);
    if (pageContents.officialContent) parts.push(`[公式サイト]\n${pageContents.officialContent}`);
    if (parts.length > 0) officialPageContext = parts.join('\n\n');
  }

  const userMessage = buildUserMessage(
    'classic',
    {
      title: game.title,
      titleJa: game.titleJa,
      genres: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      summary: game.summary,
      metascore: game.metascore,
      userScore: game.userScore,
    },
    additionalContext,
    publishDate,
    regenOpts?.fixInstruction,
    officialPageContext
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.classicSystem, userMessage, {
      maxTokens: 3500,
      temperature: 0.2,
    })
  );

  const title = await generateTitle('名作深掘り', game.title, game.summary, undefined, game.titleJa, game.releaseDate, publishDate);
  const summary = await generateSummary(content);

  return {
    title,
    category: 'classic',
    summary,
    content,
    sourceUrls: game.sourceUrls,
    webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
    game: {
      title: game.title,
      titleJa: game.titleJa,
      genre: game.genres,
      platforms: game.platforms,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      developerCountry: game.developerCountry,
      coverImage: game.coverImage,
      screenshots: game.screenshots,
      metascore: game.metascore,
      userScore: game.userScore,
    },
  };
}

/**
 * フォールバック用のダミーゲームデータ
 */
function createFallbackGame(
  category: 'newRelease' | 'indie' | 'classic'
): GameData {
  const fallbacks: Record<string, GameData> = {
    newRelease: {
      title: '今週の注目新作',
      normalizedTitle: '今週の注目新作',
      genres: ['アクション'],
      platforms: ['PC', 'PS5', 'Xbox Series X|S'],
      source: ['steam'],
    },
    indie: {
      title: '話題のインディータイトル',
      normalizedTitle: '話題のインディータイトル',
      genres: ['アドベンチャー'],
      platforms: ['PC'],
      source: ['steam'],
    },
    classic: {
      title: '名作ゲーム',
      normalizedTitle: '名作ゲーム',
      genres: ['RPG'],
      platforms: ['PC', 'PS4', 'Nintendo Switch'],
      metascore: 90,
      source: ['steam', 'metacritic'],
    },
  };

  return fallbacks[category];
}

/**
 * メインエントリーポイント
 */
async function main(): Promise<void> {
  console.log('=== Game Wire Article Generation ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // ハルシネーション対策: TAVILY_API_KEY 未設定時は fail fast
  // Web検索なしでの生成は事実根拠が極端に薄くなるため、本番では必須
  // 開発時に意図的にスキップしたい場合は ALLOW_WITHOUT_WEB_SEARCH=true を設定
  if (!isTavilyAvailable()) {
    if (process.env.ALLOW_WITHOUT_WEB_SEARCH === 'true') {
      console.warn(
        '⚠️  TAVILY_API_KEY is not set. Article generation will proceed WITHOUT web grounding.\n' +
          '   This is allowed only because ALLOW_WITHOUT_WEB_SEARCH=true is set.\n' +
          '   The resulting articles will have higher hallucination risk.'
      );
    } else {
      console.error(
        '❌ TAVILY_API_KEY is not set.\n' +
          '   Article generation requires web search grounding to reduce hallucinations.\n' +
          '   Set TAVILY_API_KEY in your environment, or set ALLOW_WITHOUT_WEB_SEARCH=true to bypass (development only).'
      );
      process.exit(1);
    }
  }

  // 選定済みゲームデータを読み込み
  const selectedPath = path.join(DATA_DIR, 'selected-games.json');
  let selectedGames: SelectedGames;

  if (fs.existsSync(selectedPath)) {
    const rawData = fs.readFileSync(selectedPath, 'utf-8');
    selectedGames = JSON.parse(rawData) as SelectedGames;
    // backward compat: old JSON files predating PR-B may not have indieReserves
    selectedGames.indieReserves ??= [];
    selectedGames.newReleasesReserves ??= [];
    console.log('Loaded selected games from:', selectedPath);
  } else {
    console.warn('Selected games file not found, using fallback data');
    selectedGames = {
      newReleases: [createFallbackGame('newRelease')],
      newReleasesReserves: [],
      indies: [], // 選定データなし: 0件で発行
      indieReserves: [],
      featured: null,
      classic: createFallbackGame('classic'),
    };
  }

  // 発行日を設定（環境変数で上書き可能）
  const publishDateStr = process.env.PUBLISH_DATE || new Date().toISOString().split('T')[0];
  const publishDate = new Date(publishDateStr);

  // 次の号番号を取得
  const nextIssueNumber = getNextIssueNumber();

  console.log(`Publish date: ${publishDateStr}`);
  console.log(`Next issue number: ${nextIssueNumber}`);
  console.log('');

  // Web検索失敗カウンター（main()スコープで管理し各generate関数に参照渡し）
  const webSearchStats: WebSearchStats = { searchFailures: 0, pageContentFailures: 0 };

  // 記事と、その記事を修正指示付きで作り直す再生成クロージャをまとめて保持する。
  // 各 generate 関数のシグネチャ差は regenerate クロージャで吸収する。
  const regenerables: Array<{
    article: GeneratedArticle;
    regenerate: (fix: string) => Promise<GeneratedArticle>;
  }> = [];

  // zombie 除去後の件数チェック（不足でも続行してサイレント短縮を可視化する）
  if (selectedGames.newReleases.length < 2) {
    console.warn(`  [ArticleGen] newReleases has only ${selectedGames.newReleases.length} game(s) — issue will have fewer new-release articles`);
  }
  if (selectedGames.indies.length < 2) {
    console.warn(`  [ArticleGen] indies has only ${selectedGames.indies.length} game(s) — issue will have fewer indie articles`);
  }

  // 1. 大手企業新作記事（2本）
  console.log('Generating new release articles...');
  for (const game of selectedGames.newReleases.slice(0, 2)) {
    try {
      if (await isAdultContentByAI(game)) {
        console.warn(`  Skipping adult content game: "${game.title}"`);
        continue;
      }
      const article = await generateNewReleaseArticle(game, publishDate, undefined, webSearchStats);
      regenerables.push({
        article,
        regenerate: (fix) => generateNewReleaseArticle(game, publishDate, { fixInstruction: fix }),
      });
      // レート制限対策
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Failed to generate article for ${game.title}:`, error);
    }
  }

  // 2. インディーゲーム記事（2本）
  console.log('');
  console.log('Generating indie articles...');
  for (const game of selectedGames.indies.slice(0, 2)) {
    try {
      if (await isAdultContentByAI(game)) {
        console.warn(`  Skipping adult content game: "${game.title}"`);
        continue;
      }
      const article = await generateIndieArticle(game, publishDate, undefined, webSearchStats);
      regenerables.push({
        article,
        regenerate: (fix) => generateIndieArticle(game, publishDate, { fixInstruction: fix }),
      });
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Failed to generate article for ${game.title}:`, error);
    }
  }

  // 3. 特集記事（1本）
  console.log('');
  console.log('Generating feature article...');
  try {
    // 全ゲームデータを読み込んで関連ゲームを取得
    const aggregatedPath = path.join(DATA_DIR, 'aggregated.json');
    let allGames: GameData[] = [];
    if (fs.existsSync(aggregatedPath)) {
      const rawData = fs.readFileSync(aggregatedPath, 'utf-8');
      const aggregated = JSON.parse(rawData);
      allGames = aggregated.games || [];
    }

    // 同号の他記事で選定済みのタイトルを除外リストとして構築
    // （selectedGames.featured は特集記事自身の素材のため除外しない）
    const alreadySelectedTitles = [
      ...selectedGames.newReleases.map((g) => g.title),
      ...selectedGames.indies.map((g) => g.title),
      ...(selectedGames.classic ? [selectedGames.classic.title] : []),
    ];

    // feature クールダウン中のタイトルも除外（フェーズ2の能動探索で同じ名作が毎号反復するのを防ぐ）
    const featureCooldownTitles = getCooldownTitles('feature', publishDate);
    if (featureCooldownTitles.size > 0) {
      console.log(`  Feature cooldown: ${featureCooldownTitles.size} titles on cooldown`);
    }

    // 除外対象を relatedGames からも取り除き、AIへの矛盾した指示を防ぐ
    // feature クールダウン中のタイトルも aggregated.json 候補から除外する
    const filteredAllGames = allGames.filter(
      (g) =>
        !alreadySelectedTitles.includes(g.title) &&
        !featureCooldownTitles.has(g.normalizedTitle)
    );

    // LLM への提案除外リストにはクールダウン中タイトルも含める
    // alreadySelectedTitles は生タイトルのため normalizeTitle で正規化してから混ぜる
    const featureExcludeTitles = [
      ...alreadySelectedTitles.map(normalizeTitle),
      ...[...featureCooldownTitles],
    ];

    const { article: featureArticle, context: featureContext } = await generateFeatureArticle(
      publishDate,
      nextIssueNumber,
      filteredAllGames,
      featureExcludeTitles,
      webSearchStats
    );
    regenerables.push({
      article: featureArticle,
      // feature はテーマ選定・ゲーム選定・検索・画像生成をやり直さず本文だけ作り直す
      regenerate: (fix) => buildFeatureArticleFromContext(featureContext, fix),
    });
    await new Promise((r) => setTimeout(r, 1000));
  } catch (error) {
    console.error('Failed to generate feature article:', error);
  }

  // 4. 名作深掘り記事（1本）
  console.log('');
  console.log('Generating classic article...');
  if (selectedGames.classic) {
    const classicGame = selectedGames.classic;
    try {
      if (await isAdultContentByAI(classicGame)) {
        console.warn(`  Skipping adult content classic game: "${classicGame.title}"`);
      } else {
        const article = await generateClassicArticle(classicGame, publishDate, undefined, webSearchStats);
        regenerables.push({
          article,
          regenerate: (fix) => generateClassicArticle(classicGame, publishDate, { fixInstruction: fix }),
        });
      }
    } catch (error) {
      console.error(
        `Failed to generate classic article for ${classicGame.title}:`,
        error
      );
    }
  } else {
    console.warn('No classic game selected, skipping');
  }

  // 5. 自動再生成（P4）: high 警告（正規表現由来）を持つ記事を1回だけ作り直す。
  // デフォルト OFF。VALIDATION_AUTO_REGENERATE=true で有効化（再生成は生成コストが増えるため）。
  if (process.env.VALIDATION_AUTO_REGENERATE === 'true') {
    console.log('');
    console.log('Auto-regeneration enabled. Checking for high-severity warnings...');
    for (const item of regenerables) {
      const highBefore = validateArticle(item.article, publishDate).filter((w) => w.severity === 'high');
      if (highBefore.length === 0) continue;

      const fix = buildFixInstruction(highBefore);
      console.log(`  [regenerate] "${item.article.title}" high=${highBefore.length} → 再生成`);
      try {
        const regenerated = await item.regenerate(fix);
        const highAfter = validateArticle(regenerated, publishDate).filter((w) => w.severity === 'high');
        console.log(`  [regenerate] high: ${highBefore.length} → ${highAfter.length}`);
        item.article = regenerated; // 1回だけ。残存警告は許容（次の validate/judge で記録される）
      } catch (error) {
        console.error(`  [regenerate] failed for "${item.article.title}", keeping original:`, error);
      }
    }
  }

  const articles: GeneratedArticle[] = regenerables.map((r) => r.article);

  // 生成結果を保存
  const generatedIssue: GeneratedIssue = {
    articles,
    generatedAt: new Date().toISOString(),
    publishDate: publishDateStr,
    webSearchStats: {
      searchFailures: webSearchStats.searchFailures,
      pageContentFailures: webSearchStats.pageContentFailures,
    },
  };

  const outputPath = path.join(DATA_DIR, 'generated-articles.json');
  fs.writeFileSync(outputPath, JSON.stringify(generatedIssue, null, 2));

  console.log('');
  console.log('=== Summary ===');
  console.log(`Total articles generated: ${articles.length}`);
  console.log(`  - New releases: ${articles.filter((a) => a.category === 'newRelease').length}`);
  console.log(`  - Indies: ${articles.filter((a) => a.category === 'indie').length}`);
  console.log(`  - Features: ${articles.filter((a) => a.category === 'feature').length}`);
  console.log(`  - Classics: ${articles.filter((a) => a.category === 'classic').length}`);
  console.log('');
  console.log(`Output saved to: ${outputPath}`);

  const totalFailures = webSearchStats.searchFailures + webSearchStats.pageContentFailures;
  if (totalFailures > 0) {
    console.warn('');
    console.warn(`⚠️  Web search failures detected:`);
    console.warn(`   - Keyword search failures: ${webSearchStats.searchFailures}`);
    console.warn(`   - Official page fetch failures: ${webSearchStats.pageContentFailures}`);
    console.warn(`   These failures may have reduced article quality.`);
  }

  console.log(`Finished at: ${new Date().toISOString()}`);
}

// スクリプト実行（直接実行時のみ。他モジュールからの import 時は実行しない）
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
