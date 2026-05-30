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
import { verifyOfficialUrlContent } from './verify-official-url.js';

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

/**
 * 既存号の公式URLを内容検証する（後追い監査）。
 *
 * 各記事の sourceUrls.official を verify-official-url.ts でページ本文と照合し、
 * 無関係サイトの誤採用（mismatch）を可視化する。公開済みの号を後から棚卸しする用途。
 * Bedrock を呼ぶため `--verify-urls` フラグ指定時のみ実行する。
 */
async function auditOfficialUrls(frontmatter: IssueFrontmatter): Promise<void> {
  console.log('Auditing official URLs (content verification)...');
  let checked = 0;
  let mismatched = 0;

  for (const fa of frontmatter.articles) {
    const candidates: Array<{ source: string; url: string }> = [];
    if (fa.sourceUrls?.official) {
      candidates.push({ source: 'sourceUrls.official', url: fa.sourceUrls.official });
    }

    if (candidates.length === 0) continue;

    const game = fa.game;
    if (!game) {
      console.log(`  [skip] "${fa.title}": game メタ無しのため検証不能`);
      continue;
    }

    for (const { source, url } of candidates) {
      checked++;
      const result = await verifyOfficialUrlContent(
        {
          titleEn: game.title,
          titleJa: game.titleJa,
          developer: game.developer,
          publisher: game.publisher,
        },
        url
      );
      const label =
        result.verdict === 'match' ? '✓ match' : result.verdict === 'mismatch' ? '✗ MISMATCH' : '? uncertain';
      console.log(`  [${label}] ${game.title} (${source}): ${url}`);
      console.log(`           ${result.reason}`);
      if (result.verdict === 'mismatch') mismatched++;
    }
  }

  console.log('');
  console.log(`Official URL audit: ${checked} checked, ${mismatched} mismatched.`);
  if (mismatched > 0) {
    console.log('⚠️  内容不一致の公式URLが見つかりました。手動で修正してください。');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verifyUrls = args.includes('--verify-urls');
  const arg = args.find((a) => !a.startsWith('--'));
  if (!arg) {
    console.error(
      'Usage: npx tsx scripts/validate-existing-issue.ts [--verify-urls] <path-to-issue.md>'
    );
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

  if (verifyUrls) {
    console.log('');
    await auditOfficialUrls(frontmatter);
  }
}

main();
