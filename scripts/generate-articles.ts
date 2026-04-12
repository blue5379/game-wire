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
import {
  invokeClaudeModel,
  PromptTemplates,
  buildUserMessage,
  buildFeatureUserMessage,
  selectFeatureThemeWithAI,
  parseArticleResponse,
  parseTitleResponse,
} from './bedrock-client.js';
import { getEventsInRange } from './fetch-japanese-events.js';
import { generateFeatureImage } from './generate-feature-image.js';
import {
  searchGameInfo,
  formatSearchResultsForPrompt,
  isTavilyAvailable,
} from './fetch-web-search.js';
import { fetchGameImageAndUrl } from './fetch-igdb.js';

// 開発モード判定
const DEV_MODE = process.env.DEV_MODE === 'true';

// データディレクトリ
const DATA_DIR = path.join(process.cwd(), 'data');
const ISSUES_DIR = DEV_MODE
  ? path.join(process.cwd(), 'src', 'content', 'issues-dev')
  : path.join(process.cwd(), 'src', 'content', 'issues');

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

// 生成された記事の型定義
export interface GeneratedArticle {
  title: string;
  category: 'newRelease' | 'indie' | 'feature' | 'classic';
  summary: string;
  content: string;
  featureImage?: string; // 特集記事用のAI生成画像パス
  recommendedGames?: RecommendedGame[]; // 特集記事のおすすめゲーム
  sourceUrls?: SourceUrls; // 参照元URL
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
}

/**
 * 記事タイトルを生成
 */
async function generateTitle(
  category: string,
  gameTitle: string,
  summary?: string
): Promise<string> {
  const userMessage = `カテゴリ: ${category}\nゲームタイトル: ${gameTitle}${summary ? `\n概要: ${summary}` : ''}\n\n上記の情報を元に、記事タイトルを1つ生成してください。`;

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
    return `注目タイトル『${gameTitle}』をご紹介`;
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
  game: GameData
): Promise<GeneratedArticle> {
  console.log(`  Generating new release article: ${game.title}`);

  // Web検索で追加情報を取得
  let webSearchContext = '';
  if (isTavilyAvailable()) {
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'newRelease', game.developer);
      webSearchContext = formatSearchResultsForPrompt(searchResults);
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
    }
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
    webSearchContext || undefined
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.newReleaseSystem, userMessage, {
      maxTokens: 3000,
      temperature: 0.5,
    })
  );

  const title = await generateTitle('大手企業の新作', game.title, game.summary);
  const summary = await generateSummary(content);

  return {
    title,
    category: 'newRelease',
    summary,
    content,
    sourceUrls: game.sourceUrls,
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
 * インディーゲーム記事を生成
 */
async function generateIndieArticle(game: GameData): Promise<GeneratedArticle> {
  console.log(`  Generating indie article: ${game.title}`);

  // 基本の追加コンテキスト
  const contextParts: string[] = [];
  if (game.youtubePopularity) {
    contextParts.push(`YouTubeでの累計視聴回数: ${game.youtubePopularity.toLocaleString()}回`);
  }

  // Web検索で追加情報を取得
  if (isTavilyAvailable()) {
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'indie', game.developer);
      const webSearchContext = formatSearchResultsForPrompt(searchResults);
      if (webSearchContext) {
        contextParts.push(webSearchContext);
      }
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
    }
  }

  const additionalContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

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
    additionalContext
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.indieSystem, userMessage, {
      maxTokens: 3000,
      temperature: 0.5,
    })
  );

  const title = await generateTitle(
    '話題のインディーゲーム',
    game.title,
    game.summary
  );
  const summary = await generateSummary(content);

  return {
    title,
    category: 'indie',
    summary,
    content,
    sourceUrls: game.sourceUrls,
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
      isAiInferred: game.isAiInferred,
      aiInferredFields: game.aiInferredFields,
    },
  };
}

/**
 * おすすめゲームの抽出結果（英語名でIGDB検索、日本語名でh3マッチング）
 */
interface ExtractedGame {
  en: string;
  ja: string;
}

/**
 * 特集記事の本文からおすすめゲーム名JSONを抽出し、本文から除去する
 */
function extractRecommendedGameNames(content: string): { cleanContent: string; games: ExtractedGame[] } {
  // 閉じの```がある場合とない場合（parseArticleResponseで除去される）の両方に対応
  const jsonBlockRegex = /```json:recommended_games\s*\n([\s\S]*?)(?:```|$)/;
  const match = content.match(jsonBlockRegex);

  if (!match) {
    return { cleanContent: content, games: [] };
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    const cleanContent = content.replace(jsonBlockRegex, '').trim();

    if (!Array.isArray(parsed)) {
      return { cleanContent, games: [] };
    }

    // 新形式: [{en: "...", ja: "..."}] と旧形式: ["..."] の両方に対応
    const games: ExtractedGame[] = parsed.map((item: string | { en?: string; ja?: string }) => {
      if (typeof item === 'string') {
        return { en: item, ja: item };
      }
      return { en: item.en || item.ja || '', ja: item.ja || item.en || '' };
    }).filter((g: ExtractedGame) => g.en || g.ja);

    return { cleanContent, games };
  } catch {
    console.warn('  Failed to parse recommended games JSON');
    return { cleanContent: content, games: [] };
  }
}

/**
 * ゲーム名リストからIGDBで画像・公式URLを取得してRecommendedGame[]を構築
 * 英語名でIGDB検索し、日本語名をタイトルとして使用
 */
async function enrichRecommendedGames(games: ExtractedGame[]): Promise<RecommendedGame[]> {
  const results: RecommendedGame[] = [];

  for (const game of games) {
    console.log(`    Enriching recommended game: ${game.ja} (IGDB: ${game.en})`);
    const igdbResult = await fetchGameImageAndUrl(game.en);
    results.push({
      title: game.ja,
      coverImage: igdbResult?.coverImage,
      officialUrl: igdbResult?.officialUrl,
    });
    // レート制限対策
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

/**
 * 特集記事を生成
 */
async function generateFeatureArticle(
  publishDate: Date,
  issueNumber: number,
  relatedGames?: GameData[],
  excludeTitles?: string[]
): Promise<GeneratedArticle> {
  // 直近1週間のイベントを取得
  const events = getEventsInRange(publishDate, 7);
  console.log(`  Found ${events.length} events in the next 7 days`);

  // AIでテーマを選定
  const theme = await selectFeatureThemeWithAI(
    events.map((e) => ({ name: e.name, gameThemeHint: e.gameThemeHint }))
  );
  console.log(`  Generating feature article: ${theme}`);

  const relatedGamesList = relatedGames?.slice(0, 5).map((g) => ({
    title: g.title,
    summary: g.summary,
  }));

  const userMessage = buildFeatureUserMessage(theme, publishDate, relatedGamesList, excludeTitles);

  const rawContent = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.featureSystem, userMessage, {
      maxTokens: 4000,
      temperature: 0.5,
    })
  );

  // おすすめゲーム名を抽出し、本文からJSONブロックを除去
  const { cleanContent: content, games: extractedGames } = extractRecommendedGameNames(rawContent);
  console.log(`  Extracted ${extractedGames.length} recommended game names`);

  // IGDBでおすすめゲームの画像・公式URLを取得（英語名で検索）
  let recommendedGames: RecommendedGame[] | undefined;
  if (extractedGames.length > 0) {
    try {
      console.log('  Enriching recommended games with IGDB data...');
      recommendedGames = await enrichRecommendedGames(extractedGames);
      console.log(`  Enriched ${recommendedGames.length} recommended games`);
    } catch (error) {
      console.warn('  Failed to enrich recommended games:', error);
    }
  }

  const summary = await generateSummary(content);
  const title = await generateTitle('特集', theme, summary);

  // 特集記事用の画像を生成
  let featureImagePath: string | undefined;
  try {
    console.log('  Generating feature image...');
    featureImagePath = await generateFeatureImage(theme, issueNumber);
    console.log(`  Feature image generated: ${featureImagePath}`);
  } catch (error) {
    console.warn('  Failed to generate feature image:', error);
    // 画像生成に失敗しても記事は生成する
  }

  return {
    title,
    category: 'feature',
    summary,
    content,
    featureImage: featureImagePath,
    recommendedGames,
  };
}

/**
 * 名作深掘り記事を生成
 */
async function generateClassicArticle(
  game: GameData
): Promise<GeneratedArticle> {
  console.log(`  Generating classic article: ${game.title}`);

  // 基本の追加コンテキスト
  const contextParts: string[] = [];
  if (game.steamPlayers) {
    contextParts.push(`現在のSteam同時接続数: ${game.steamPlayers.toLocaleString()}人`);
  }
  if (game.youtubePopularity) {
    contextParts.push(`YouTubeでの人気度: ${game.youtubePopularity.toLocaleString()}`);
  }

  // Web検索で追加情報を取得
  if (isTavilyAvailable()) {
    try {
      console.log(`    Searching web for additional info...`);
      const searchResults = await searchGameInfo(game.title, 'classic', game.developer);
      const webSearchContext = formatSearchResultsForPrompt(searchResults);
      if (webSearchContext) {
        contextParts.push(webSearchContext);
      }
    } catch (error) {
      console.warn(`    Web search failed, continuing without: ${error}`);
    }
  }

  const additionalContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

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
    additionalContext
  );

  const content = parseArticleResponse(
    await invokeClaudeModel(PromptTemplates.classicSystem, userMessage, {
      maxTokens: 3500,
      temperature: 0.5,
    })
  );

  const title = await generateTitle('名作深掘り', game.title, game.summary);
  const summary = await generateSummary(content);

  return {
    title,
    category: 'classic',
    summary,
    content,
    sourceUrls: game.sourceUrls,
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

  // 選定済みゲームデータを読み込み
  const selectedPath = path.join(DATA_DIR, 'selected-games.json');
  let selectedGames: SelectedGames;

  if (fs.existsSync(selectedPath)) {
    const rawData = fs.readFileSync(selectedPath, 'utf-8');
    selectedGames = JSON.parse(rawData) as SelectedGames;
    console.log('Loaded selected games from:', selectedPath);
  } else {
    console.warn('Selected games file not found, using fallback data');
    selectedGames = {
      newReleases: [createFallbackGame('newRelease')],
      indies: [createFallbackGame('indie')],
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

  const articles: GeneratedArticle[] = [];

  // 1. 大手企業新作記事（2本）
  console.log('Generating new release articles...');
  for (const game of selectedGames.newReleases.slice(0, 2)) {
    try {
      if (await isAdultContentByAI(game)) {
        console.warn(`  Skipping adult content game: "${game.title}"`);
        continue;
      }
      const article = await generateNewReleaseArticle(game);
      articles.push(article);
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
      const article = await generateIndieArticle(game);
      articles.push(article);
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

    // 除外対象を relatedGames からも取り除き、AIへの矛盾した指示を防ぐ
    const filteredAllGames = allGames.filter(
      (g) => !alreadySelectedTitles.includes(g.title)
    );

    const featureArticle = await generateFeatureArticle(
      publishDate,
      nextIssueNumber,
      filteredAllGames,
      alreadySelectedTitles
    );
    articles.push(featureArticle);
    await new Promise((r) => setTimeout(r, 1000));
  } catch (error) {
    console.error('Failed to generate feature article:', error);
  }

  // 4. 名作深掘り記事（1本）
  console.log('');
  console.log('Generating classic article...');
  if (selectedGames.classic) {
    try {
      if (await isAdultContentByAI(selectedGames.classic)) {
        console.warn(`  Skipping adult content classic game: "${selectedGames.classic.title}"`);
      } else {
        const article = await generateClassicArticle(selectedGames.classic);
        articles.push(article);
      }
    } catch (error) {
      console.error(
        `Failed to generate classic article for ${selectedGames.classic.title}:`,
        error
      );
    }
  } else {
    console.warn('No classic game selected, skipping');
  }

  // 生成結果を保存
  const generatedIssue: GeneratedIssue = {
    articles,
    generatedAt: new Date().toISOString(),
    publishDate: publishDateStr,
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
  console.log(`Finished at: ${new Date().toISOString()}`);
}

// スクリプト実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
