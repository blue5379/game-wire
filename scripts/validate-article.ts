/**
 * 記事バリデータ
 *
 * 生成された記事に対して、以下の事後検証を行う:
 * - タイトル整合性: 記事タイトルにゲームの正式タイトル（en または ja）が含まれているか
 * - プラットフォーム整合性: 本文中のプラットフォーム言及が、提供データと矛盾しないか
 * - 数値捏造リスク: ソース不明の具体的な数値（N件、N時間、N万人 等）の混入を検出
 * - 人物発言捏造リスク: 「〜氏」「〜CTO」「〜ディレクター」等の肩書き付き人名や、
 *   「〜と語った」「〜によると」等の発言引用パターンを検出
 *
 * これらは「検出」が目的であり、誤検知も含まれる。重大度（high/medium/low）を付与し、
 * 一定数以上の high 警告がある場合に build-issue を fail させる運用を想定する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GeneratedArticle } from './generate-articles.js';

export type Severity = 'high' | 'medium' | 'low';

export interface ValidationWarning {
  articleTitle: string;
  category: string;
  severity: Severity;
  type: string;
  message: string;
  evidence?: string;
  context?: string;    // 本文中の該当箇所（前後の文を含む）
  sourcedFrom?: {      // 検索結果に根拠が見つかった場合のみセット
    url: string;
    title: string;
    snippet: string;
  };
}

export interface ValidationReport {
  issueNumber: number;
  generatedAt: string;
  totalArticles: number;
  totalWarnings: number;
  warningsBySeverity: Record<Severity, number>;
  warnings: ValidationWarning[];
}

const KNOWN_PLATFORM_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /Nintendo Switch 2/i, canonical: 'Nintendo Switch 2' },
  { pattern: /Nintendo Switch(?!\s*2)/i, canonical: 'Nintendo Switch' },
  { pattern: /PlayStation\s*5|PS\s*5/i, canonical: 'PlayStation 5' },
  { pattern: /PlayStation\s*4|PS\s*4/i, canonical: 'PlayStation 4' },
  { pattern: /Xbox\s*Series\s*X(\|S)?/i, canonical: 'Xbox Series X|S' },
  { pattern: /Xbox\s*One/i, canonical: 'Xbox One' },
  { pattern: /\bSteam\b/i, canonical: 'PC (Steam)' },
  { pattern: /\biOS\b/i, canonical: 'iOS' },
  { pattern: /\bAndroid\b/i, canonical: 'Android' },
  { pattern: /\bmacOS\b|\bMac\b(?![a-zA-Z])/i, canonical: 'Mac' },
  { pattern: /\bLinux\b/i, canonical: 'Linux' },
];

/**
 * 検索結果の中から、指定したキーワードを含む最初のソースを返す
 * 見つかった場合: 根拠あり（ウェブ情報由来の可能性が高い）
 * 見つからない場合: undefined（捏造の可能性が高い）
 */
function findSourceFor(
  keyword: string,
  sources: Array<{ url: string; title: string; snippet: string }> | undefined
): { url: string; title: string; snippet: string } | undefined {
  if (!sources || sources.length === 0) return undefined;
  const kw = keyword.replace(/,/g, '').toLowerCase();
  return sources.find((s) => {
    const snippet = s.snippet.replace(/,/g, '').toLowerCase();
    const title = s.title.replace(/,/g, '').toLowerCase();
    return snippet.includes(kw) || title.includes(kw);
  });
}

/**
 * 本文中の該当箇所の前後文を抽出する（人間が判断するための文脈）
 */
function extractContext(content: string, matchedText: string, windowChars: number = 80): string {
  const idx = content.indexOf(matchedText);
  if (idx === -1) return matchedText;
  const start = Math.max(0, idx - windowChars);
  const end = Math.min(content.length, idx + matchedText.length + windowChars);
  const excerpt = content.slice(start, end).replace(/\n+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${excerpt}${suffix}`;
}

/**
 * 提供データのプラットフォーム配列を canonical な形に正規化
 */
function normalizePlatforms(platforms: string[]): Set<string> {
  const result = new Set<string>();
  for (const p of platforms) {
    let matched = false;
    for (const { pattern, canonical } of KNOWN_PLATFORM_PATTERNS) {
      if (pattern.test(p)) {
        result.add(canonical);
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.add(p);
    }
  }
  return result;
}

/**
 * IGDB slug を簡易的にタイトル風に変換（"company-of-heroes" → "company of heroes"）
 */
function slugToTitle(slug: string): string {
  return slug.replace(/-+/g, ' ').replace(/\s+\d+$/, '').trim();
}

/**
 * IGDB slug 由来のタイトルと game.title が大幅に乖離していないか検証
 * 例: slug="company-of-heroes" だが title="Hero Company" のケースを検出
 */
export function validateTitleVsIgdbSlug(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category === 'feature') return warnings;

  const igdbUrl = article.sourceUrls?.igdb;
  if (!igdbUrl || !article.game?.title) return warnings;

  const slugMatch = igdbUrl.match(/\/games\/([a-z0-9-]+)/i);
  if (!slugMatch) return warnings;

  const slug = slugMatch[1].replace(/--\d+$/, ''); // "--1" 等のサフィックスを除去
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // アクセント記号を除去
      .toLowerCase()
      .replace(/[:：]/g, '');
  const slugTitle = normalize(slugToTitle(slug));
  const gameTitle = normalize(article.game.title);

  // slug の単語と game.title の単語のオーバーラップ率を測る
  const slugWords = new Set(slugTitle.split(/\s+/).filter((w) => w.length > 2));
  const titleWords = new Set(gameTitle.split(/\s+/).filter((w) => w.length > 2));

  if (slugWords.size === 0 || titleWords.size === 0) return warnings;

  let overlap = 0;
  for (const w of titleWords) {
    if (slugWords.has(w)) overlap++;
  }

  const overlapRatio = overlap / Math.max(slugWords.size, titleWords.size);

  // 単語のオーバーラップが 60% 未満なら警告（"Hero Company" vs "company-of-heroes" のような事例を捕捉）
  if (overlapRatio < 0.6) {
    warnings.push({
      articleTitle: article.title,
      category: article.category,
      severity: 'high',
      type: 'title-vs-igdb-slug',
      message:
        `game.title「${article.game.title}」が IGDB slug「${slug}」と大幅に乖離しています。` +
        `AI による誤短縮・改変の可能性があります。`,
      evidence: `slug=${slug} title=${article.game.title}`,
    });
  }

  return warnings;
}

/**
 * 記事タイトルにゲームの正式タイトルが含まれているかを検証
 */
export function validateTitleConsistency(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category === 'feature') {
    // 特集記事はテーマベースなので対象外
    return warnings;
  }

  const game = article.game;
  if (!game?.title) return warnings;

  const titleEn = game.title;
  const titleJa = game.titleJa;
  const articleTitle = article.title;

  // 厳密一致チェック: 英語タイトル全体 OR 日本語タイトル全体が記事タイトルに含まれているか
  // 記号・空白の差異は許容するため、簡易正規化
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[\s:：・「」『』\[\]【】]/g, '');

  const normalizedArticleTitle = normalize(articleTitle);
  const normalizedTitleEn = normalize(titleEn);
  const normalizedTitleJa = titleJa ? normalize(titleJa) : '';

  const containsEn = normalizedArticleTitle.includes(normalizedTitleEn);
  const containsJa = normalizedTitleJa
    ? normalizedArticleTitle.includes(normalizedTitleJa)
    : false;

  if (!containsEn && !containsJa) {
    warnings.push({
      articleTitle,
      category: article.category,
      severity: 'high',
      type: 'title-mismatch',
      message:
        `記事タイトルに正式ゲームタイトルが含まれていません。` +
        `提供データ: en="${titleEn}"${titleJa ? `, ja="${titleJa}"` : ''}`,
      evidence: articleTitle,
    });
  }

  return warnings;
}

/**
 * 特集記事のプラットフォーム整合性を検証
 * recommendedGames のプラットフォームを合算し、本文中に無関係なプラットフォームが言及されていれば警告
 */
export function validateFeaturePlatformConsistency(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category !== 'feature') return warnings;
  if (!article.recommendedGames || article.recommendedGames.length === 0) return warnings;

  // 全推薦ゲームのプラットフォームを合算
  const allPlatforms: string[] = [];
  for (const rg of article.recommendedGames) {
    if (rg.platforms) allPlatforms.push(...rg.platforms);
  }
  if (allPlatforms.length === 0) return warnings;

  const officialPlatforms = normalizePlatforms(allPlatforms);

  const mentionedPlatforms = new Set<string>();
  for (const { pattern, canonical } of KNOWN_PLATFORM_PATTERNS) {
    if (pattern.test(article.content)) {
      mentionedPlatforms.add(canonical);
    }
  }

  for (const mentioned of mentionedPlatforms) {
    if (!officialPlatforms.has(mentioned)) {
      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity: 'high',
        type: 'platform-mismatch',
        message:
          `本文で「${mentioned}」が言及されていますが、紹介ゲームのいずれにも含まれていません。` +
          `紹介ゲームのプラットフォーム: [${[...officialPlatforms].join(', ')}]`,
        evidence: mentioned,
        context: extractContext(article.content, mentioned),
      });
    }
  }

  return warnings;
}

/**
 * 特集記事の人物言及を検証
 * recommendedGames の developer/publisher を許容リストとして使用
 */
export function validateFeaturePersonAttribution(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category !== 'feature') return warnings;

  const content = article.content;

  const personPatterns: Array<{ pattern: RegExp; type: string; severity: Severity }> = [
    { pattern: /([一-龥ぁ-んァ-ンー・A-Za-z]+)氏(?:によると|は語|は述べ|のコメント|は明か|は説明|は強調)/g, type: 'person-quote', severity: 'high' },
    { pattern: /CEO[のは]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /CTO[のは]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /ディレクター[のは・]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /プロデューサー[のは・]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /([一-龥ぁ-んァ-ンー・A-Za-z]+)氏を中心/g, type: 'person-mention', severity: 'medium' },
  ];

  // 全推薦ゲームの developer/publisher を許容リストに追加
  const allowedNames = new Set<string>();
  for (const rg of article.recommendedGames ?? []) {
    if (rg.developer) allowedNames.add(rg.developer);
    if (rg.publisher) allowedNames.add(rg.publisher);
  }

  for (const { pattern, type, severity } of personPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (!name) continue;
      if (allowedNames.has(name)) continue;
      if (name.length < 2) continue;

      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity,
        type,
        message: `本文で人物「${name}」が言及されています。提供データに発言ソースがあるか確認してください。`,
        evidence: match[0],
        context: extractContext(content, match[0]),
      });
    }
  }

  return warnings;
}

/**
 * ソース不明な可能性が高い数値パターン（捏造リスクの高い具体数値）。
 *
 * validateNumericClaims（newRelease/indie/classic）と
 * validateFeatureNumericClaims（feature）で共用し、両者の検出基準がズレないようにする。
 *
 * 設計上の注意:
 * - 範囲表記（例: `40〜60時間`）は 1 マッチに束ねる。両端を別々に拾うと二重カウントになるため
 * - capture group `match[1]` は数値部分。概数パターン（`数百〜` / `何十〜`）は数値を持たないので
 *   呼び出し側では `match[1]` が undefined になりうる前提で扱うこと（knownNumbers 照合をスキップ）
 */
const NUMERIC_PATTERNS: Array<{ pattern: RegExp; type: string; severity: Severity }> = [
  // レビュー件数・ユーザー数・販売数（高リスク）
  { pattern: /(\d{1,3}(?:,\d{3})+|\d{4,})\s*件/g, type: 'review-count', severity: 'high' },
  { pattern: /(\d+(?:[.,]\d+)?)\s*万\s*件/g, type: 'review-count', severity: 'high' }, // 「18万件」等、万を挟む表記
  { pattern: /(\d{1,3}(?:,\d{3})+|\d{4,})\s*人/g, type: 'user-count', severity: 'high' },
  { pattern: /(\d+(?:[.,]\d+)?)\s*(?:万|億)\s*(?:人|本|ダウンロード|DL|ユーザー|プレイヤー)/g, type: 'large-count', severity: 'high' },
  { pattern: /(\d+)\s*台(?:以上)?(?:の(?:車|実車|車両))/g, type: 'vehicle-count', severity: 'high' },
  // プレイ時間（中リスク）: 「プレイ/遊」直後限定を撤廃し、範囲表記・「以上/超え」等に対応
  { pattern: /(\d{1,3}(?:[.,]\d+)?(?:[〜～\-]\d{1,3}(?:[.,]\d+)?)?)\s*時間(?:以上|超え?|程度|ほど|遊|プレイ|の|を要|もの|に拡張|没入)/g, type: 'play-hours', severity: 'medium' },
  // 価格（中リスク）
  { pattern: /(\d+(?:[.,]\d+)?)\s*(?:円|ドル|USD|\$)/g, type: 'price', severity: 'medium' },
  // 評価率（中リスク）: 範囲表記を 1 マッチに束ねる
  { pattern: /(\d{1,3}(?:[〜～\-]\d{1,3})?)\s*[%％]/g, type: 'percentage', severity: 'medium' },
  // 収録種類数（低リスク）: 2 桁以上に限定してノイズを抑制
  { pattern: /(\d{2,}(?:[.,]\d+)?)\s*種(?:類)?(?:以上)?/g, type: 'kind-count', severity: 'low' },
  // 周年（低リスク）
  { pattern: /(\d+)\s*(?:周年)/g, type: 'anniversary', severity: 'low' },
  // 概数表現（低リスク）: 数値捏造というより誇張寄り。capture group を持たない
  { pattern: /(?:数|何)[十百千万億]+(?:以上)?\s*(?:件|人|本|台|種類?|時間|万本|ユーザー|プレイヤー|ダウンロード|DL|円)/g, type: 'approx-count', severity: 'low' },
];

/**
 * 特集記事の数値クレームを検証
 */
export function validateFeatureNumericClaims(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category !== 'feature') return warnings;

  const content = article.content;

  for (const { pattern, type, severity } of NUMERIC_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity,
        type: `numeric-${type}`,
        message:
          `本文に具体的な数値「${match[0].trim()}」が記載されています。` +
          `提供データに無い数値の場合は捏造の可能性があります。`,
        evidence: match[0].trim(),
        context: extractContext(content, match[0].trim()),
      });
    }
  }

  return warnings;
}

/**
 * 本文中のプラットフォーム言及を検証
 */
export function validatePlatformConsistency(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category === 'feature') return warnings;

  const game = article.game;
  if (!game?.platforms || game.platforms.length === 0) return warnings;

  const officialPlatforms = normalizePlatforms(game.platforms);

  // 本文中で言及されているプラットフォームを抽出
  const mentionedPlatforms = new Set<string>();
  for (const { pattern, canonical } of KNOWN_PLATFORM_PATTERNS) {
    if (pattern.test(article.content)) {
      mentionedPlatforms.add(canonical);
    }
  }

  // 公式に対応していないプラットフォームが本文中で言及されていれば警告
  for (const mentioned of mentionedPlatforms) {
    if (!officialPlatforms.has(mentioned)) {
      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity: 'high',
        type: 'platform-mismatch',
        message:
          `本文で「${mentioned}」が言及されていますが、提供データには含まれていません。` +
          `提供データのプラットフォーム: [${[...officialPlatforms].join(', ')}]`,
        evidence: mentioned,
        context: extractContext(article.content, mentioned),
      });
    }
  }

  return warnings;
}

/**
 * 本文中の人物発言・人名引用パターンを検出
 *
 * 提供データに無い人物コメント・引用は捏造のリスクが高い。
 * 開発者・発売元名は提供データと一致するもののみ許容する。
 */
export function validatePersonAttribution(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const content = article.content;

  // 「〜氏によると」「〜氏は語った」「〜氏は述べた」「〜氏のコメント」等
  const personPatterns: Array<{ pattern: RegExp; type: string; severity: Severity }> = [
    { pattern: /([一-龥ぁ-んァ-ンー・A-Za-z]+)氏(?:によると|は語|は述べ|のコメント|は明か|は説明|は強調)/g, type: 'person-quote', severity: 'high' },
    { pattern: /CEO[のは]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /CTO[のは]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /ディレクター[のは・]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /プロデューサー[のは・]([一-龥ぁ-んァ-ンー・A-Za-z]+)/g, type: 'person-title', severity: 'high' },
    { pattern: /([一-龥ぁ-んァ-ンー・A-Za-z]+)氏を中心/g, type: 'person-mention', severity: 'medium' },
  ];

  // 提供されている開発元・発売元名（許容リスト）
  const allowedNames = new Set<string>();
  if (article.game?.developer) allowedNames.add(article.game.developer);
  if (article.game?.publisher) allowedNames.add(article.game.publisher);

  for (const { pattern, type, severity } of personPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (!name) continue;
      // 開発元・発売元の company 名と一致するならスキップ
      if (allowedNames.has(name)) continue;
      // 短すぎる単語は誤検知の可能性が高いのでスキップ
      if (name.length < 2) continue;

      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity,
        type,
        message: `本文で人物「${name}」が言及されています。提供データに発言ソースがあるか確認してください。`,
        evidence: match[0],
        context: extractContext(content, match[0]),
        sourcedFrom: findSourceFor(name, article.webSearchSources),
      });
    }
  }

  return warnings;
}

/**
 * 本文中のソース不明な具体数値を検出
 *
 * 売上、ユーザー数、Steamレビュー数、プレイ時間などの具体数値はハルシネーションが起きやすい。
 * 提供データ（gameInfo の各フィールド）に含まれない数値は警告する。
 */
export function validateNumericClaims(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const content = article.content;

  // 提供データから既知の数値を集める（これらは警告対象外）
  const knownNumbers = new Set<string>();
  if (article.game?.metascore != null) knownNumbers.add(String(article.game.metascore));
  if (article.game?.userScore != null) knownNumbers.add(String(article.game.userScore));
  if (article.game?.releaseDate) {
    // 発売日に含まれる年・月・日を許容
    const parts = article.game.releaseDate.split(/[-/]/);
    for (const p of parts) knownNumbers.add(p);
    knownNumbers.add(String(parseInt(parts[0], 10)));
  }

  for (const { pattern, type, severity } of NUMERIC_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      // 概数パターン（approx-count）は capture group を持たないため match[1] が undefined。
      // その場合は数値照合・sourcedFrom 照合をスキップする
      const numericValue = match[1] ? match[1].replace(/,/g, '') : undefined;
      // 提供データに含まれていればスキップ（releaseDate の年号など）
      if (numericValue && knownNumbers.has(numericValue)) continue;

      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity,
        type: `numeric-${type}`,
        message:
          `本文に具体的な数値「${match[0].trim()}」が記載されています。` +
          `提供データに無い数値の場合は捏造の可能性があります。`,
        evidence: match[0].trim(),
        context: extractContext(content, match[0].trim()),
        sourcedFrom: numericValue ? findSourceFor(numericValue, article.webSearchSources) : undefined,
      });
    }
  }

  return warnings;
}

/**
 * 1つの記事に対して全バリデーションを実行
 */
export function validateArticle(article: GeneratedArticle): ValidationWarning[] {
  return [
    ...validateTitleConsistency(article),
    ...validateTitleVsIgdbSlug(article),
    ...validatePlatformConsistency(article),
    ...validatePersonAttribution(article),
    ...validateNumericClaims(article),
    ...validateFeaturePlatformConsistency(article),
    ...validateFeaturePersonAttribution(article),
    ...validateFeatureNumericClaims(article),
  ];
}

/**
 * 全記事を検証してレポートを生成
 */
export function validateArticles(
  articles: GeneratedArticle[],
  issueNumber: number
): ValidationReport {
  const warnings: ValidationWarning[] = [];
  for (const article of articles) {
    warnings.push(...validateArticle(article));
  }

  const warningsBySeverity: Record<Severity, number> = {
    high: warnings.filter((w) => w.severity === 'high').length,
    medium: warnings.filter((w) => w.severity === 'medium').length,
    low: warnings.filter((w) => w.severity === 'low').length,
  };

  return {
    issueNumber,
    generatedAt: new Date().toISOString(),
    totalArticles: articles.length,
    totalWarnings: warnings.length,
    warningsBySeverity,
    warnings,
  };
}

/**
 * レポートをファイルに保存し、stdout にもサマリを出力
 *
 * @returns true = 通過、false = しきい値超過で fail
 */
export function writeAndCheckReport(
  report: ValidationReport,
  outputDir: string,
  highWarningThreshold: number = 5
): boolean {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const reportPath = path.join(
    outputDir,
    `validation-report-${String(report.issueNumber).padStart(3, '0')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('');
  console.log('=== Article Validation Report ===');
  console.log(`Total articles: ${report.totalArticles}`);
  console.log(`Total warnings: ${report.totalWarnings}`);
  console.log(
    `  - high: ${report.warningsBySeverity.high}, medium: ${report.warningsBySeverity.medium}, low: ${report.warningsBySeverity.low}`
  );
  console.log(`Report saved: ${reportPath}`);

  if (report.warnings.length > 0) {
    console.log('');
    console.log('--- Warnings ---');
    for (const w of report.warnings) {
      console.log(
        `  [${w.severity.toUpperCase()}][${w.type}] (${w.category}) ${w.articleTitle}\n    ${w.message}`
      );
    }
  }

  if (report.warningsBySeverity.high > highWarningThreshold) {
    console.error('');
    console.error(
      `❌ Too many high-severity warnings (${report.warningsBySeverity.high} > ${highWarningThreshold}). Validation failed.`
    );
    return false;
  }

  return true;
}

/**
 * CLI エントリーポイント
 */
async function mainCli(): Promise<void> {
  const DEV_MODE = process.env.DEV_MODE === 'true';
  const DATA_DIR = path.join(process.cwd(), 'data');
  const articlesPath = path.join(DATA_DIR, 'generated-articles.json');

  if (!fs.existsSync(articlesPath)) {
    console.error('Generated articles file not found:', articlesPath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(articlesPath, 'utf-8');
  const generatedIssue = JSON.parse(rawData) as { articles: GeneratedArticle[] };

  // issueNumber は引数または環境変数から取得（無ければ 0）
  const issueNumber = parseInt(process.env.ISSUE_NUMBER || '0', 10);

  const report = validateArticles(generatedIssue.articles, issueNumber);
  const outputDir = path.join(DATA_DIR, DEV_MODE ? 'validation-dev' : 'validation');
  const passed = writeAndCheckReport(report, outputDir);

  if (!passed) {
    process.exit(1);
  }
}

// このスクリプトが直接実行された場合のみ CLI を起動
if (import.meta.url === `file://${process.argv[1]}`) {
  mainCli().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
