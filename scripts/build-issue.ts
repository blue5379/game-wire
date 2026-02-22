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

// ディレクトリパス
const DATA_DIR = path.join(process.cwd(), 'data');
const ISSUES_DIR = path.join(process.cwd(), 'src', 'content', 'issues');

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
 * 記事データをYAML frontmatter用にフォーマット
 */
function formatArticleForFrontmatter(article: GeneratedArticle): string {
  const lines: string[] = [];

  lines.push(`  - title: "${escapeYamlString(article.title)}"`);
  lines.push(`    category: ${article.category}`);
  lines.push(`    summary: "${escapeYamlString(article.summary)}"`);

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

  if (article.game) {
    lines.push(`    game:`);
    lines.push(`      title: "${escapeYamlString(article.game.title)}"`);

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
function generateMarkdownContent(
  issueNumber: number,
  publishDate: Date,
  articles: GeneratedArticle[]
): string {
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
    'articles:',
  ];

  for (const article of articles) {
    frontmatter.push(formatArticleForFrontmatter(article));
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
  body.push('毎週日曜日に新しい号が発行されますので、お楽しみに！');

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

  // メインの号ファイルを生成
  const issueFileName = `issue-${String(issueNumber).padStart(3, '0')}.md`;
  const issuePath = path.join(ISSUES_DIR, issueFileName);

  const markdownContent = generateMarkdownContent(
    issueNumber,
    publishDate,
    generatedIssue.articles
  );

  fs.writeFileSync(issuePath, markdownContent);
  console.log(`Issue file created: ${issuePath}`);

  // サマリー出力
  console.log('');
  console.log('=== Summary ===');
  console.log(`Issue number: ${issueNumber}`);
  console.log(`Publish date: ${format(publishDate, 'yyyy年M月d日', { locale: ja })}`);
  console.log(`Total articles: ${generatedIssue.articles.length}`);
  console.log('');
  console.log('Articles:');
  for (const article of generatedIssue.articles) {
    console.log(`  - [${categoryToJapanese(article.category)}] ${article.title}`);
  }
  console.log('');
  console.log(`Output: ${issuePath}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

// スクリプト実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
