/**
 * 既存号からの初期履歴生成スクリプト（1回限り実行）
 * src/content/issues/issue-*.md のフロントマターからゲーム情報を抽出し
 * src/content/history.json を生成する
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { saveHistory, createHistoryEntry } from './game-history.js';
import type { HistoryEntry } from './game-history.js';

const ISSUES_DIR = path.join(process.cwd(), 'src', 'content', 'issues');

/**
 * frontmatter ブロックを文字列から取得
 */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * frontmatter から issueNumber を取得
 */
function parseIssueNumber(fm: string): number | null {
  const match = fm.match(/^issueNumber:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * frontmatter から publishDate を取得
 */
function parsePublishDate(fm: string): string | null {
  const match = fm.match(/^publishDate:\s*(\S+)/m);
  return match ? match[1] : null;
}

/**
 * frontmatter から articles のゲームタイトルとカテゴリを抽出
 * （YAMLパーサーを使わず行単位の簡易パース）
 */
function parseArticles(fm: string): Array<{ title: string; category: string }> {
  const results: Array<{ title: string; category: string }> = [];

  // articles セクションを探す
  const lines = fm.split('\n');
  let inArticles = false;
  let currentCategory: string | null = null;
  let currentGameTitle: string | null = null;
  let inGame = false;

  for (const line of lines) {
    if (line.trim() === 'articles:') {
      inArticles = true;
      continue;
    }

    if (!inArticles) continue;

    // インデントレベル2のカテゴリ行
    const categoryMatch = line.match(/^    category:\s*(\S+)/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1];
      continue;
    }

    // game: セクション開始
    if (line.match(/^    game:/)) {
      inGame = true;
      continue;
    }

    // game.title の取得
    if (inGame && line.match(/^      title:/)) {
      const titleMatch = line.match(/^      title:\s*"?(.*?)"?\s*$/);
      if (titleMatch) {
        currentGameTitle = titleMatch[1].replace(/\\"/g, '"');
      }
      continue;
    }

    // game セクション終了（インデントが戻った場合）
    if (inGame && line.match(/^    [a-z]/) && !line.match(/^      /)) {
      // game セクションを抜けた
      if (currentGameTitle && currentCategory) {
        results.push({ title: currentGameTitle, category: currentCategory });
      }
      inGame = false;
      currentGameTitle = null;
      currentCategory = null;

      // 次の記事の category 行かもしれない
      const nextCategoryMatch = line.match(/^    category:\s*(\S+)/);
      if (nextCategoryMatch) {
        currentCategory = nextCategoryMatch[1];
      }
      continue;
    }

    // 新しい記事エントリ（- title: で始まる）
    if (line.match(/^  - title:/)) {
      // 前の記事のゲームが未保存なら保存
      if (inGame && currentGameTitle && currentCategory) {
        results.push({ title: currentGameTitle, category: currentCategory });
      }
      inGame = false;
      currentGameTitle = null;
      currentCategory = null;
      continue;
    }
  }

  // 最後のゲームを保存
  if (inGame && currentGameTitle && currentCategory) {
    results.push({ title: currentGameTitle, category: currentCategory });
  }

  return results;
}

async function main(): Promise<void> {
  console.log('=== Game Wire History Migration ===');
  console.log(`Issues directory: ${ISSUES_DIR}`);
  console.log('');

  if (!fs.existsSync(ISSUES_DIR)) {
    console.error('Issues directory not found:', ISSUES_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(ISSUES_DIR)
    .filter((f) => f.match(/^issue-\d+\.md$/))
    .sort();

  console.log(`Found ${files.length} issue files`);
  console.log('');

  const allEntries: HistoryEntry[] = [];

  for (const file of files) {
    const filePath = path.join(ISSUES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = extractFrontmatter(content);

    if (!fm) {
      console.warn(`  [SKIP] No frontmatter found in: ${file}`);
      continue;
    }

    const issueNumber = parseIssueNumber(fm);
    const publishDate = parsePublishDate(fm);

    if (!issueNumber || !publishDate) {
      console.warn(`  [SKIP] Missing issueNumber or publishDate in: ${file}`);
      continue;
    }

    const articles = parseArticles(fm);
    const validCategories = new Set(['newRelease', 'indie', 'classic']);

    for (const article of articles) {
      if (!validCategories.has(article.category)) continue; // feature はスキップ
      const entry = createHistoryEntry(
        article.title,
        article.category as 'newRelease' | 'indie' | 'classic',
        issueNumber,
        publishDate
      );
      allEntries.push(entry);
    }

    console.log(
      `  ${file}: issue #${issueNumber} (${publishDate}) - ${articles.filter((a) => validCategories.has(a.category)).length} entries`
    );
  }

  console.log('');
  console.log(`Total entries to migrate: ${allEntries.length}`);

  if (allEntries.length === 0) {
    console.warn('No entries found. Check if issue files have the expected format.');
    process.exit(1);
  }

  // 既存の history.json を上書きしないよう確認
  const historyPath = path.join(process.cwd(), 'src', 'content', 'history.json');
  if (fs.existsSync(historyPath)) {
    console.warn('');
    console.warn(`WARNING: ${historyPath} already exists.`);
    console.warn('To re-run migration, delete the file first and run again.');
    process.exit(1);
  }

  // saveHistory は追記なので、空ファイルを先に作成して追記
  // ただし loadHistory() は存在しない場合に空を返すので直接 saveHistory を呼ぶ
  // NOTE: game-history.ts の saveHistory は loadHistory() → push → save のため
  // 空ファイルが存在しない状態で呼び出せばOK
  saveHistory(allEntries);

  console.log('');
  console.log('Migration complete!');
  console.log(`History saved to: ${historyPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
