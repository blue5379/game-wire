/**
 * 号の組み立てスクリプト
 * 生成された記事をまとめてMarkdownファイルとして出力
 */

import { config } from 'dotenv';

// .env.local を優先的に読み込み
config({ path: '.env.local' });
config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { GeneratedIssue, GeneratedArticle } from './generate-articles.js';
import { saveHistory, createHistoryEntry } from './game-history.js';
import { validateArticles, writeAndCheckReport, validateGameSourceConsistencyForArticles } from './validate-article.js';
import { judgeArticles } from './judge-article.js';

// 開発モード判定
const DEV_MODE = process.env.DEV_MODE === 'true';

// ディレクトリパス
const DATA_DIR = path.join(process.cwd(), 'data');
const ISSUES_DIR = DEV_MODE
  ? path.join(process.cwd(), 'src', 'content', 'issues-dev')
  : path.join(process.cwd(), 'src', 'content', 'issues');

async function isUrlAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

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

/**
 * 号のタイトルを生成
 */
function generateIssueTitle(issueNumber: number, publishDate: Date): string {
  const season = getSeason(publishDate);
  const year = publishDate.getFullYear();

  if (issueNumber === 1) {
    return `創刊号 - ${year}年${season}のゲーム最前線`;
  }

  return `第${issueNumber}号 - ${year}年${season}のゲーム情報`;
}

/**
 * 季節を取得
 */
function getSeason(date: Date): string {
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

/**
 * 号の説明文を生成
 */
function generateIssueDescription(
  issueNumber: number,
  articles: GeneratedArticle[]
): string {
  if (issueNumber === 1) {
    return 'Game Wire創刊！今週の注目タイトルから名作まで、AIがキュレーションしたゲーム情報をお届けします。';
  }

  const newReleaseCount = articles.filter((a) => a.category === 'newRelease').length;
  const indieCount = articles.filter((a) => a.category === 'indie').length;

  return `今週も${newReleaseCount}本の新作情報、${indieCount}本のインディーゲーム情報をお届け。AIがキュレーションした最新ゲーム情報をチェック！`;
}

/**
 * カテゴリ名を日本語に変換
 */
function categoryToJapanese(
  category: 'newRelease' | 'indie' | 'feature' | 'classic'
): string {
  const map = {
    newRelease: '新作紹介',
    indie: 'インディーゲーム',
    feature: '特集',
    classic: '名作深掘り',
  };
  return map[category];
}

/**
 * Issue #94 最終防衛線: 記事のメタデータが極端に欠落しているかを判定する。
 * coverImage が空、かつ developer/publisher/releaseDate がすべて空の場合、
 * 記事として体裁が成立しないため hidden 扱いにする。
 * feature 記事は game フィールドを持たないため対象外。
 */
export function isCriticallyIncompleteArticle(article: GeneratedArticle): boolean {
  if (article.category === 'feature') return false;
  const game = article.game;
  if (!game) return true;
  const hasCover = Boolean(game.coverImage);
  const hasAnyMeta = Boolean(game.developer || game.publisher || game.releaseDate);
  return !hasCover && !hasAnyMeta;
}

/**
 * 記事データをYAML frontmatter用にフォーマット
 * @param sourceMismatchTitles game-source-mismatch で検出された記事タイトルの集合（hidden 扱いにする）
 */
async function formatArticleForFrontmatter(
  article: GeneratedArticle,
  sourceMismatchTitles: Set<string> = new Set()
): Promise<string> {
  const lines: string[] = [];

  lines.push(`  - title: "${escapeYamlString(article.title)}"`);
  lines.push(`    category: ${article.category}`);
  lines.push(`    summary: "${escapeYamlString(article.summary)}"`);
  if (isCriticallyIncompleteArticle(article)) {
    console.warn(
      `  [WARN] Article "${article.title}" is critically incomplete (no cover/developer/publisher/releaseDate); marking as hidden.`
    );
    lines.push(`    hidden: true`);
  } else if (sourceMismatchTitles.has(article.title)) {
    console.warn(
      `  [WARN] Article "${article.title}" has game-source-mismatch (別ゲームのメタ混入); marking as hidden.`
    );
    lines.push(`    hidden: true`);
  }

  // AI生成コンテンツを保存（複数行対応）
  // Note: 'content' is reserved in Astro, so we use 'articleBody'
  if (article.content) {
    lines.push(`    articleBody: |`);
    const contentLines = article.content.split('\n');
    for (const line of contentLines) {
      lines.push(`      ${line}`);
    }
  }

  // 特集記事用のAI生成画像
  if (article.featureImage) {
    lines.push(`    featureImage: "${article.featureImage}"`);
  }

  // 特集記事のおすすめゲーム
  if (article.recommendedGames && article.recommendedGames.length > 0) {
    lines.push(`    recommendedGames:`);
    for (const game of article.recommendedGames) {
      lines.push(`      - title: "${escapeYamlString(game.title)}"`);
      if (game.coverImage) {
        lines.push(`        coverImage: "${game.coverImage}"`);
      }
      if (game.officialUrl) {
        lines.push(`        officialUrl: "${game.officialUrl}"`);
      }
    }
  }

  if (article.game) {
    lines.push(`    game:`);
    lines.push(`      title: "${escapeYamlString(article.game.title)}"`);
    if (article.game.titleJa) {
      lines.push(`      titleJa: "${escapeYamlString(article.game.titleJa)}"`);
    }

    if (article.game.genre && article.game.genre.length > 0) {
      lines.push(`      genre:`);
      for (const g of article.game.genre) {
        lines.push(`        - ${g}`);
      }
    }

    if (article.game.platforms && article.game.platforms.length > 0) {
      lines.push(`      platforms:`);
      for (const p of article.game.platforms) {
        lines.push(`        - ${p}`);
      }
    }

    if (article.game.releaseDate) {
      lines.push(`      releaseDate: "${article.game.releaseDate}"`);
    }

    if (article.game.developer) {
      lines.push(`      developer: "${escapeYamlString(article.game.developer)}"`);
    }

    if (article.game.publisher) {
      lines.push(`      publisher: "${escapeYamlString(article.game.publisher)}"`);
    }

    if (article.game.developerCountry) {
      lines.push(`      developerCountry: "${escapeYamlString(article.game.developerCountry)}"`);
    }

    if (article.game.coverImage) {
      lines.push(`      coverImage: "${article.game.coverImage}"`);
    }

    if (article.game.coverImageOrientation) {
      lines.push(`      coverImageOrientation: "${article.game.coverImageOrientation}"`);
    }

    if (article.game.screenshots && article.game.screenshots.length > 0) {
      lines.push(`      screenshots:`);
      for (const screenshot of article.game.screenshots) {
        lines.push(`        - "${screenshot}"`);
      }
    }

    if (article.game.metascore !== undefined) {
      lines.push(`      metascore: ${article.game.metascore ?? 'null'}`);
    }

    if (article.game.userScore !== undefined) {
      lines.push(`      userScore: ${article.game.userScore ?? 'null'}`);
    }

    // AI推測フラグ
    if (article.game.isAiInferred) {
      lines.push(`      isAiInferred: true`);
    }

    if (article.game.aiInferredFields && article.game.aiInferredFields.length > 0) {
      lines.push(`      aiInferredFields:`);
      for (const field of article.game.aiInferredFields) {
        lines.push(`        - ${field}`);
      }
    }
  }

  // 参照元URLを出力（gameの有無に関わらず）
  if (article.sourceUrls) {
    const urlLines: string[] = [];
    if (article.sourceUrls.official) {
      // Issue #117: 'igdb-fallback'（旧: category=1 タグ無しで機械採用された URL）は
      // 内容検証をすり抜けて誤採用される構造的リスクを持つため、最終出力でも弾く二重防御。
      // 値そのものはキャッシュ互換のため受け入れるが、出力には載せない。
      const source = article.sourceUrls.officialUrlSource as string | undefined;
      if (source && source !== 'tavily' && source !== 'igdb-official') {
        console.log(
          `    [WARN] Official URL source "${source}" is not trusted, skipping: ${article.sourceUrls.official}`
        );
      } else {
        const alive = await isUrlAlive(article.sourceUrls.official);
        if (alive) {
          urlLines.push(`      official: "${article.sourceUrls.official}"`);
        } else {
          console.log(`    [WARN] Official URL unreachable, skipping: ${article.sourceUrls.official}`);
        }
      }
    }
    // stores[]: Identity Resolver 解決済みのプラットフォーム別リンク
    if (article.sourceUrls.stores && article.sourceUrls.stores.length > 0) {
      urlLines.push(`      stores:`);
      for (const store of article.sourceUrls.stores) {
        urlLines.push(`        - platform: "${store.platform}"`);
        urlLines.push(`          url: "${store.url}"`);
        if (store.resolvedBy) {
          urlLines.push(`          resolvedBy: "${store.resolvedBy}"`);
        }
        if (store.confidence) {
          urlLines.push(`          confidence: "${store.confidence}"`);
        }
      }
    }
    // steam: 後方互換フィールド（stores[] にも同じ URL が入っている場合はスキップ）
    if (article.sourceUrls.steam) {
      const alreadyInStores = article.sourceUrls.stores?.some((s) => s.platform === 'steam');
      if (!alreadyInStores) {
        urlLines.push(`      steam: "${article.sourceUrls.steam}"`);
      }
    }
    if (article.sourceUrls.igdb) {
      urlLines.push(`      igdb: "${article.sourceUrls.igdb}"`);
    }
    if (article.sourceUrls.metacritic) {
      urlLines.push(`      metacritic: "${article.sourceUrls.metacritic}"`);
    }
    // 有効なURLが1件以上ある場合のみキーを書き込む（空の sourceUrls: null はスキーマ違反になるため）
    if (urlLines.length > 0) {
      lines.push(`    sourceUrls:`);
      lines.push(...urlLines);
    }
  }

  return lines.join('\n');
}

/**
 * YAML文字列をエスケープ
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Markdownファイルを生成
 */
async function generateMarkdownContent(
  issueNumber: number,
  publishDate: Date,
  articles: GeneratedArticle[],
  sourceMismatchTitles: Set<string> = new Set()
): Promise<string> {
  const title = generateIssueTitle(issueNumber, publishDate);
  const description = generateIssueDescription(issueNumber, articles);
  const dateStr = format(publishDate, 'yyyy-MM-dd');

  // Frontmatter
  const frontmatter: string[] = [
    '---',
    `issueNumber: ${issueNumber}`,
    `publishDate: ${dateStr}`,
    `title: "${escapeYamlString(title)}"`,
    `description: "${escapeYamlString(description)}"`,
  ];

  if (articles.length === 0) {
    frontmatter.push('articles: []');
  } else {
    frontmatter.push('articles:');
    for (const article of articles) {
      frontmatter.push(await formatArticleForFrontmatter(article, sourceMismatchTitles));
    }
  }

  frontmatter.push('---');

  // 本文
  const body: string[] = [];

  if (issueNumber === 1) {
    body.push('Game Wire創刊号へようこそ！');
    body.push('');
    body.push(
      'このマガジンは、AIが毎週キュレーションしたゲーム情報をお届けする週刊Webマガジンです。大手メーカーの新作から注目のインディーゲーム、そして時代を超えて愛される名作まで、幅広いゲーム情報をお届けします。'
    );
  } else {
    const formattedDate = format(publishDate, 'yyyy年M月d日', { locale: ja });
    body.push(`Game Wire 第${issueNumber}号（${formattedDate}発行）をお届けします。`);
    body.push('');
    body.push('今週も厳選したゲーム情報をAIがキュレーション。新作情報からインディーゲーム、特集記事まで、ゲームファン必見の内容をお届けします。');
  }

  body.push('');
  body.push('毎週土曜日に新しい号が発行されますので、お楽しみに！');

  return [...frontmatter, '', ...body, ''].join('\n');
}

/**
 * 個別記事ファイルを生成（オプション）
 */
function generateArticleContent(article: GeneratedArticle): string {
  const lines: string[] = [];

  // タイトル
  lines.push(`# ${article.title}`);
  lines.push('');

  // カテゴリバッジ
  lines.push(`*${categoryToJapanese(article.category)}*`);
  lines.push('');

  // ゲーム情報（存在する場合）
  if (article.game) {
    lines.push('## ゲーム情報');
    lines.push('');
    lines.push(`- **タイトル**: ${article.game.title}`);

    if (article.game.genre && article.game.genre.length > 0) {
      lines.push(`- **ジャンル**: ${article.game.genre.join(', ')}`);
    }

    if (article.game.platforms && article.game.platforms.length > 0) {
      lines.push(`- **対応機種**: ${article.game.platforms.join(', ')}`);
    }

    if (article.game.releaseDate) {
      lines.push(`- **発売日**: ${article.game.releaseDate}`);
    }

    if (article.game.developer) {
      lines.push(`- **開発**: ${article.game.developer}`);
    }

    if (article.game.publisher) {
      lines.push(`- **発売元**: ${article.game.publisher}`);
    }

    if (article.game.metascore) {
      lines.push(`- **Metacritic**: ${article.game.metascore}`);
    }

    lines.push('');
  }

  // 本文
  lines.push('## 記事');
  lines.push('');
  lines.push(article.content);
  lines.push('');

  return lines.join('\n');
}

/**
 * メインエントリーポイント
 */
async function main(): Promise<void> {
  console.log('=== Game Wire Issue Builder ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Mode: ${DEV_MODE ? 'DEVELOPMENT' : 'PRODUCTION'}`);
  console.log(`Output directory: ${ISSUES_DIR}`);
  console.log('');

  // 生成された記事を読み込み
  const articlesPath = path.join(DATA_DIR, 'generated-articles.json');

  if (!fs.existsSync(articlesPath)) {
    console.error('Generated articles file not found:', articlesPath);
    console.error('Please run "npm run generate" first.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(articlesPath, 'utf-8');
  const generatedIssue = JSON.parse(rawData) as GeneratedIssue;

  console.log('Loaded generated articles:', articlesPath);
  console.log(`  - Total articles: ${generatedIssue.articles.length}`);
  console.log(`  - Publish date: ${generatedIssue.publishDate}`);
  console.log('');

  // 号番号を取得
  const issueNumber = getNextIssueNumber();
  console.log(`Next issue number: ${issueNumber}`);

  // 発行日を設定
  const publishDate = new Date(generatedIssue.publishDate);

  // 出力ディレクトリを作成
  if (!fs.existsSync(ISSUES_DIR)) {
    fs.mkdirSync(ISSUES_DIR, { recursive: true });
    console.log('Created issues directory:', ISSUES_DIR);
  }

  // Issue #166 再発対応: game-source-mismatch チェックを .md 書き込みの前に実行する。
  // 同名異作品のメタ混入（記事本文は新作・game ブロックは旧作）を検出して下記の方針で制御:
  //   - 検出記事が 1 件: その記事だけ hidden: true で発行（号は出る）
  //   - 検出記事が 2 件以上: 号ごと発行停止（exit 1）
  //   - 落とした候補は必ずログ＋レポートに記録
  // fail-open: Storefront API 失敗時は誤 exit を防ぐため警告のみにとどめる。
  console.log('');
  console.log('Checking game-source consistency (pre-write)...');
  // タイトル → 元の ValidationWarning を保持することで、後段レポートでカテゴリ・evidence を正確に記録する
  const sourceMismatchWarnings = new Map<string, import('./validate-article.js').ValidationWarning>();
  const sourceMismatchTitles = new Set<string>();
  try {
    const sourceCheckWarnings = await validateGameSourceConsistencyForArticles(generatedIssue.articles);
    const mismatchWarnings = sourceCheckWarnings.filter((w) => w.type === 'game-source-mismatch');
    if (mismatchWarnings.length > 0) {
      // 影響記事タイトルを収集（重複を除く）— 元の warning オブジェクトも保持
      for (const w of mismatchWarnings) {
        sourceMismatchTitles.add(w.articleTitle);
        if (!sourceMismatchWarnings.has(w.articleTitle)) {
          sourceMismatchWarnings.set(w.articleTitle, w);
        }
      }
      console.error('');
      console.error('❌ game-source-mismatch detected (別ゲームのメタ混入):');
      for (const title of sourceMismatchTitles) {
        console.error(`  - "${title}"`);
      }

      if (sourceMismatchTitles.size >= 2) {
        // 2 記事以上 → 号ごと発行停止
        console.error('');
        console.error(
          `🛑 ${sourceMismatchTitles.size} articles have game-source-mismatch. Aborting issue publication to prevent corrupted content from being published.`
        );
        process.exit(1);
      } else {
        // 1 記事のみ → hidden 扱いで続行
        console.warn('');
        console.warn(
          `⚠️  1 article has game-source-mismatch and will be marked hidden. Issue will be published without it.`
        );
      }
    }
  } catch (err) {
    // fail-open: Storefront API 不達など検証自体の失敗は号を止めない
    console.warn(
      JSON.stringify({
        scope: 'build-issue',
        step: 'pre-write-source-check',
        reason: String(err),
      })
    );
  }

  // メインの号ファイルを生成（game-source-mismatch 記事は hidden: true が付く）
  const issueFileName = `issue-${String(issueNumber).padStart(3, '0')}.md`;
  const issuePath = path.join(ISSUES_DIR, issueFileName);

  const markdownContent = await generateMarkdownContent(
    issueNumber,
    publishDate,
    generatedIssue.articles,
    sourceMismatchTitles
  );

  fs.writeFileSync(issuePath, markdownContent);
  console.log(`Issue file created: ${issuePath}`);

  // サマリー出力
  console.log('');
  console.log('=== Summary ===');
  console.log(`Issue number: ${issueNumber}`);
  console.log(`Publish date: ${format(publishDate, 'yyyy年M月d日', { locale: ja })}`);
  console.log(`Total articles: ${generatedIssue.articles.length}`);
  if (sourceMismatchTitles.size > 0) {
    console.log(`  ⚠️  Hidden (game-source-mismatch): ${sourceMismatchTitles.size}`);
  }
  console.log('');
  console.log('Articles:');
  for (const article of generatedIssue.articles) {
    const hidden = sourceMismatchTitles.has(article.title) ? ' [HIDDEN: source-mismatch]' : '';
    console.log(`  - [${categoryToJapanese(article.category)}] ${article.title}${hidden}`);
  }
  console.log('');
  console.log(`Output: ${issuePath}`);

  // 紹介履歴を更新
  console.log('');
  console.log('Updating game history...');
  const publishDateStr = format(publishDate, 'yyyy-MM-dd');
  // hidden 記事（criticallyIncomplete / game-source-mismatch）は読者の目に触れないため、
  // クールダウン対象から除外して翌週以降に再選定されるようにする（Issue #94）
  const historyEntries = generatedIssue.articles
    .filter((a) => a.category !== 'feature' && a.game?.title)
    .filter((a) => !isCriticallyIncompleteArticle(a))
    .filter((a) => !sourceMismatchTitles.has(a.title))
    .map((a) =>
      createHistoryEntry(
        a.game!.title,
        a.category as 'newRelease' | 'indie' | 'classic',
        issueNumber,
        publishDateStr
      )
    );

  // 特集記事のゲームを履歴に保存（フェーズ2でテーマ起点探索が加わり反復リスクが増加したため）
  // recommendedGames の title は日本語名なので、game フィールドと突き合わせるのが理想だが、
  // feature 記事は game フィールドを持たないため recommendedGames の title をそのまま使う
  for (const article of generatedIssue.articles) {
    if (article.category === 'feature' && article.recommendedGames) {
      for (const game of article.recommendedGames) {
        historyEntries.push(
          createHistoryEntry(game.title, 'feature', issueNumber, publishDateStr)
        );
      }
    }
  }

  if (historyEntries.length > 0) {
    saveHistory(historyEntries);
    console.log(`Added ${historyEntries.length} entries to history`);
  } else {
    console.log('No entries to add to history');
  }

  // 記事の事後検証（ハルシネーション・タイトル整合性等）
  const report = validateArticles(generatedIssue.articles, issueNumber, generatedIssue.webSearchStats, publishDate);

  // game-source-mismatch を事後レポートにも記録する（pre-write で検出した内容の再確認・記録）
  if (sourceMismatchWarnings.size > 0) {
    for (const [, w] of sourceMismatchWarnings) {
      report.warnings.push({
        ...w,
        message: `[hidden: true に設定済み] ${w.message}`,
      });
    }
    report.totalWarnings = report.warnings.length;
    report.warningsBySeverity.high += sourceMismatchWarnings.size;
  }

  // LLM-as-a-judge による事実性チェック（デフォルトON、VALIDATION_LLM_JUDGE=false で無効化可）。
  // 結果は report.llmJudge に記録するが、非決定的なため fail 判定には算入しない。
  report.llmJudge = await judgeArticles(generatedIssue.articles);

  const validationDir = path.join(DATA_DIR, DEV_MODE ? 'validation-dev' : 'validation');
  // 環境変数 VALIDATION_HIGH_THRESHOLD で fail 閾値を上書き可能（デフォルト: 5）
  const threshold = parseInt(process.env.VALIDATION_HIGH_THRESHOLD || '5', 10);
  const passed = writeAndCheckReport(report, validationDir, threshold);

  if (!passed) {
    console.error(
      'Validation failed. The issue file was created, but it should be reviewed before publishing.'
    );
    if (process.env.VALIDATION_STRICT === 'true') {
      process.exit(1);
    }
  }

  console.log(`Finished at: ${new Date().toISOString()}`);
}

// スクリプト実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
