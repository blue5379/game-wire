/**
 * 既存の issue-XXX.md を入力にしてバリデータを実行する手動ツール
 *
 * 使い方: npx tsx scripts/validate-existing-issue.ts <issue-XXX.md>
 *
 * 既存号のハルシネーション傾向を可視化するためのもの。CIには組み込まない。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
// @ts-expect-error - js-yaml は astro 経由で入っているが型定義は無い
import yaml from 'js-yaml';
import { validateArticles, writeAndCheckReport } from './validate-article.js';
import type { GeneratedArticle } from './generate-articles.js';

interface FrontmatterArticle {
  title: string;
  category: 'newRelease' | 'indie' | 'feature' | 'classic';
  summary: string;
  articleBody: string;
  game?: {
    title: string;
    titleJa?: string;
    genre?: string[];
    platforms?: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    metascore?: number | null;
    userScore?: number | null;
  };
  sourceUrls?: {
    steam?: string;
    igdb?: string;
    metacritic?: string;
    official?: string;
  };
}

interface IssueFrontmatter {
  issueNumber: number;
  publishDate: string;
  title: string;
  description: string;
  articles: FrontmatterArticle[];
}

function parseFrontmatter(markdown: string): IssueFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('Frontmatter not found');
  }
  return yaml.load(match[1]) as IssueFrontmatter;
}

function toGeneratedArticle(fa: FrontmatterArticle): GeneratedArticle {
  return {
    title: fa.title,
    category: fa.category,
    summary: fa.summary,
    content: fa.articleBody,
    sourceUrls: fa.sourceUrls,
    game: fa.game
      ? {
          title: fa.game.title,
          titleJa: fa.game.titleJa,
          genre: fa.game.genre || [],
          platforms: fa.game.platforms || [],
          releaseDate: fa.game.releaseDate,
          developer: fa.game.developer,
          publisher: fa.game.publisher,
          metascore: fa.game.metascore,
          userScore: fa.game.userScore,
        }
      : undefined,
  };
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx scripts/validate-existing-issue.ts <path-to-issue.md>');
    process.exit(1);
  }

  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(markdown);

  console.log(`Validating issue ${frontmatter.issueNumber}: ${frontmatter.title}`);
  console.log(`  Articles: ${frontmatter.articles.length}`);
  console.log('');

  const articles = frontmatter.articles.map(toGeneratedArticle);
  const report = validateArticles(articles, frontmatter.issueNumber);

  // レポートを一時ディレクトリに出力（CIには影響させない）
  const tmpDir = path.join(process.cwd(), 'data', 'validation-manual');
  // しきい値を非常に大きくして必ず通すモードで出力（観察目的のため）
  writeAndCheckReport(report, tmpDir, 9999);
}

main();
