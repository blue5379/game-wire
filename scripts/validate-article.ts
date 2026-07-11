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
import { matchGameToSteamEntity } from './game-identity.js';
import { fetchSteamEntity } from './steam-entity.js';
import { getReleaseStatus } from './bedrock-client.js';

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
  webSearchStats?: {
    searchFailures: number;
    pageContentFailures: number;
  };
  /**
   * LLM-as-a-judge による事実性チェックの結果（P3）。
   * 正規表現バリデータ（warnings）とは分離して保持し、fail 判定には算入しない（記録のみ）。
   * judge-article.ts の LlmJudgeReport と構造互換。循環 import を避けるためインライン定義。
   */
  llmJudge?: {
    claimsByVerdict: { supported: number; contradicted: number; unverifiable: number };
    judgedArticles: number;
    skippedArticles: number;
    warnings: ValidationWarning[];
  };
  /** 公式URL未取得の記事一覧。Issue #117 P3 */
  missingOfficialUrls?: Array<{ articleTitle: string; category: string; gameTitle: string }>;
}

const KNOWN_PLATFORM_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /Nintendo Switch 2/i, canonical: 'Nintendo Switch 2' },
  { pattern: /Nintendo Switch(?!\s*2)/i, canonical: 'Nintendo Switch' },
  { pattern: /PlayStation\s*5|PS\s*5/i, canonical: 'PlayStation 5' },
  { pattern: /PlayStation\s*4|PS\s*4/i, canonical: 'PlayStation 4' },
  { pattern: /Xbox\s*Series\s*X(\|S)?/i, canonical: 'Xbox Series X|S' },
  { pattern: /Xbox\s*One/i, canonical: 'Xbox One' },
  { pattern: /\bSteam\b|\bMicrosoft Windows\b/i, canonical: 'PC (Steam)' },
  { pattern: /\biOS\b/i, canonical: 'iOS' },
  { pattern: /\bAndroid\b/i, canonical: 'Android' },
  { pattern: /\bmacOS\b|\bMac\b(?![a-zA-Z])/i, canonical: 'Mac' },
  { pattern: /\bLinux\b/i, canonical: 'Linux' },
];

/**
 * 正規表現のメタ文字をエスケープする
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 検索結果の中から、指定したキーワードを含む最初のソースを返す
 * 見つかった場合: 根拠あり（ウェブ情報由来の可能性が高い）
 * 見つからない場合: undefined（捏造の可能性が高い）
 *
 * @param numeric true の場合、キーワードを数値として扱い「独立したトークン」
 *   （前後が数字でない）としての一致のみを根拠とする。これにより本文の「96」が
 *   検索結果の「1996」の一部に誤って一致する false positive を防ぐ。
 */
function findSourceFor(
  keyword: string,
  sources: Array<{ url: string; title: string; snippet: string }> | undefined,
  numeric = false
): { url: string; title: string; snippet: string } | undefined {
  if (!sources || sources.length === 0) return undefined;
  const kw = keyword.replace(/,/g, '').toLowerCase();
  if (kw.length === 0) return undefined;

  // 数値モード: 前後が数字でない位置でのみ一致させる（例: "96" は "1996" にはマッチしない）
  const numericMatcher = numeric
    ? new RegExp(`(?<!\\d)${escapeRegExp(kw)}(?!\\d)`)
    : null;

  return sources.find((s) => {
    const snippet = s.snippet.replace(/,/g, '').toLowerCase();
    const title = s.title.replace(/,/g, '').toLowerCase();
    if (numericMatcher) {
      return numericMatcher.test(snippet) || numericMatcher.test(title);
    }
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
 * 記事本文(content)で正式ゲームタイトルが正しく使われているか検証
 *
 * game.title は IGDB の正式名称を無加工で転記したものであり、AI が触れるのは
 * 本文(content)と見出し(title)のみ。見出しは validateTitleConsistency が見るため、
 * ここでは「本文中で AI が勝手にタイトルを短縮・翻訳・改変していないか」を検出する。
 *
 * 例: game.title="Company of Heroes" なのに本文では一貫して「Hero Company」と書く、
 *     のように本文に正式タイトルが一度も登場しないケースを捕捉する。
 *
 * IGDB slug との照合は行わない（slug は IGDB 内部の URL 識別子であり、name と
 * 経年で食い違うことがあるため、記事品質の指標にならない）。
 */
export function validateBodyTitleConsistency(article: GeneratedArticle): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // 特集記事はテーマベースで複数ゲームを扱うため対象外
  if (article.category === 'feature') return warnings;

  const game = article.game;
  if (!game?.title || !article.content) return warnings;

  // 記号・空白の差異を吸収して部分一致を見る（見出しチェックと同じ正規化）
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[\s:：・「」『』\[\]【】]/g, '');

  const normalizedContent = normalize(article.content);
  const containsEn = normalizedContent.includes(normalize(game.title));
  const containsJa = game.titleJa
    ? normalizedContent.includes(normalize(game.titleJa))
    : false;

  // 本文中に英語タイトルも日本語タイトルも一度も登場しない＝AIが別名に書き換えた疑い
  if (!containsEn && !containsJa) {
    warnings.push({
      articleTitle: article.title,
      category: article.category,
      severity: 'high',
      type: 'body-title-mismatch',
      message:
        `記事本文に正式ゲームタイトルが一度も登場しません。` +
        `AI が本文中でタイトルを短縮・翻訳・改変した可能性があります。` +
        `提供データ: en="${game.title}"${game.titleJa ? `, ja="${game.titleJa}"` : ''}`,
      evidence: `${game.title}`,
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
        // 新フローで feature にも webSearchSources が乗るため、根拠の有無を判定できる
        sourcedFrom: findSourceFor(name, article.webSearchSources),
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
      // 概数パターン（approx-count）は capture group を持たないため match[1] が undefined
      const numericValue = match[1] ? match[1].replace(/,/g, '') : undefined;
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
        // 新フローで feature にも webSearchSources が乗るため、根拠の有無を判定できる
        sourcedFrom: numericValue
          ? findSourceFor(numericValue, article.webSearchSources, true)
          : undefined,
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
        sourcedFrom: numericValue
          ? findSourceFor(numericValue, article.webSearchSources, true)
          : undefined,
      });
    }
  }

  return warnings;
}

// Steam Storefront API 呼び出し間のディレイ（ミリ秒）。レート制限対策。
const STOREFRONT_REQUEST_DELAY_MS = 300;

/**
 * 記事から Steam appId を抽出する（sourceUrls.steam / stores[] の steam を対象）
 */
function extractSteamAppIdFromArticle(article: GeneratedArticle): number | undefined {
  const candidates: (string | undefined)[] = [
    article.sourceUrls?.steam,
    article.sourceUrls?.stores?.find((s) => s.platform === 'steam')?.url,
  ];
  for (const url of candidates) {
    if (!url) continue;
    const m = url.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (m) {
      const id = parseInt(m[1], 10);
      if (Number.isFinite(id)) return id;
    }
  }
  return undefined;
}

/**
 * Issue #166 ③ / #179 PR-3: 記事の `game` ブロックと Steam URL が指す実体の同一性を検証する。
 *
 * Steam appId を持つ記事について、共有の fetchSteamEntity で実体を二言語取得し、
 * matchGameToSteamEntity（title / year / company の3軸照合）で判定する。
 *
 * - verdict=different  → severity=high `game-source-mismatch`
 *   （build-issue で hidden / 2件以上なら号停止。現行ポリシー踏襲）
 * - verdict=uncertain  → severity=medium `game-source-uncertain`
 *   （hidden にしない・fail 閾値にも算入されない。レポートで evidence を可視化）
 * - verdict=same       → 警告なし
 *
 * 旧実装は「年単軸」「developer 単軸」の独立チェックで、タイトル完全一致という
 * 最強の反証を見ずに hidden を確定させる FP があった（vol.15 FP-2:
 * "Capcom Development Division 1" vs "CAPCOM Co., Ltd." → RE Requiem が hidden）。
 * Issue #179 の設計原則に基づき、破壊的アクションは独立した複数軸の不一致
 * （verdict=different）が揃った場合のみに限定する。
 *
 * 設計方針:
 * - **非同期・別関数**として実装し、build-issue の発行直前チェックだけに組み込む
 *   （同期 validateArticle の呼び出し元・再生成ループの同期性を壊さないため）。
 * - **fail-open**: Storefront API 不達・実体取得失敗時は警告を出さない
 *   （誤って build を落とさない）。
 */
export async function validateGameSourceConsistency(
  article: GeneratedArticle,
  fetchImpl: typeof fetch = fetch
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // feature 記事は game ブロックを持たないため対象外
  if (article.category === 'feature') return warnings;
  const game = article.game;
  if (!game) return warnings;

  const appId = extractSteamAppIdFromArticle(article);
  if (appId === undefined) return warnings;

  // Steam 実体を二言語取得（失敗時は fail-open）
  const entity = await fetchSteamEntity(appId, fetchImpl);
  if (!entity) return warnings;

  const matchResult = matchGameToSteamEntity(
    {
      title: game.title,
      titleJa: game.titleJa,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
    },
    entity
  );

  const { title: tAxis, year: yAxis, company: cAxis } = matchResult.evidence;

  if (matchResult.verdict === 'different') {
    warnings.push({
      articleTitle: article.title,
      category: article.category,
      severity: 'high',
      type: 'game-source-mismatch',
      message:
        `記事の game メタ「${game.title}」と、Steam(appId=${appId})の実体` +
        `「${entity.nameEn ?? entity.nameJa ?? ''}」が別作品と判定されました` +
        `（title=${tAxis} year=${yAxis} company=${cAxis}）。` +
        `別ゲームのメタデータが混入している可能性があります。`,
      evidence: matchResult.detail,
    });
  } else if (matchResult.verdict === 'uncertain') {
    warnings.push({
      articleTitle: article.title,
      category: article.category,
      severity: 'medium',
      type: 'game-source-uncertain',
      message:
        `記事の game メタ「${game.title}」と、Steam(appId=${appId})の実体の同一性を断定できません` +
        `（title=${tAxis} year=${yAxis} company=${cAxis}）。` +
        `破壊的アクション（hidden・号停止）は行わず記録のみとします（fail-open）。`,
      evidence: matchResult.detail,
    });
  }

  return warnings;
}

/**
 * 複数記事について game メタと Steam 実体の整合性を検証する（③のバッチ実行）。
 * Storefront API のレート制限対策として、記事間に一定のディレイを入れる。
 */
export async function validateGameSourceConsistencyForArticles(
  articles: GeneratedArticle[],
  fetchImpl: typeof fetch = fetch
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];
  let first = true;
  for (const article of articles) {
    // Steam appId を持たない記事は API を呼ばないのでディレイ不要
    if (extractSteamAppIdFromArticle(article) === undefined) continue;
    if (!first) {
      await new Promise((r) => setTimeout(r, STOREFRONT_REQUEST_DELAY_MS));
    }
    first = false;
    warnings.push(...(await validateGameSourceConsistency(article, fetchImpl)));
  }
  return warnings;
}

// 発売済みタイトルの見出しに使うべきでない未発売ニュアンスのパターン。
// - 発表(?!会): 「発表会」(launch-event report) は発売済みゲームの正当な見出し語のため除外
// - 待望の新作: 発売日当日の「待望の新作が遂に発売！」等にも使われる回顧的表現のため除外
// - 発売前: 「発売前情報まとめ」等の未発売表現を追加
const UNRELEASED_TITLE_PATTERNS = /発表(?!会)|次回作|近日|もうすぐ|予告|リリース予定|発売予定|発売前/;

/**
 * 発売済みタイトルの記事見出しに未発売表現が使われていないかを検証
 *
 * releaseDate <= publishDate（発売済み）の newRelease/indie 記事のタイトルに
 * 未発売ニュアンスの表現が含まれる場合に high 警告を出す。
 * high にすることで VALIDATION_AUTO_REGENERATE=true 時の自動修正対象になる。
 * publishDate が渡されていない場合は検証をスキップする（後方互換）。
 */
export function validateReleasedTitleExpression(
  article: GeneratedArticle,
  publishDate?: Date
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (article.category !== 'newRelease' && article.category !== 'indie') return warnings;
  if (!publishDate) return warnings;

  const releaseDate = article.game?.releaseDate;
  if (!releaseDate) return warnings;

  if (getReleaseStatus(releaseDate, publishDate) !== '発売済み') return warnings;

  if (!UNRELEASED_TITLE_PATTERNS.test(article.title)) return warnings;

  const matched = article.title.match(UNRELEASED_TITLE_PATTERNS);
  warnings.push({
    articleTitle: article.title,
    category: article.category,
    severity: 'high',
    type: 'released-title-expression',
    message:
      `発売済みタイトル（releaseDate=${releaseDate}）の記事見出しに未発売ニュアンスの表現「${matched?.[0]}」が含まれています。` +
      `「発売中」「登場」等の発売済み表現に修正してください。`,
    evidence: article.title,
  });

  return warnings;
}

/**
 * 1つの記事に対して全バリデーションを実行
 */
export function validateArticle(article: GeneratedArticle, publishDate?: Date): ValidationWarning[] {
  return [
    ...validateTitleConsistency(article),
    ...validateBodyTitleConsistency(article),
    ...validatePlatformConsistency(article),
    ...validatePersonAttribution(article),
    ...validateNumericClaims(article),
    ...validateFeaturePlatformConsistency(article),
    ...validateFeaturePersonAttribution(article),
    ...validateFeatureNumericClaims(article),
    ...validateReleasedTitleExpression(article, publishDate),
  ];
}

/**
 * 警告から、記事再生成時にプロンプトへ渡す修正指示文を組み立てる（純関数）。
 *
 * 警告の type ごとに「提供データに無いので削除/修正せよ」という具体的な指示文を生成する。
 * evidence（マッチした断片）をそのまま指示に埋め込むことで、AI が何を直すべきか明確にする。
 *
 * @param warnings 修正対象の警告（呼び出し側で high のみに絞って渡す想定）
 * @returns 修正指示ブロック（警告が無ければ空文字列）
 */
export function buildFixInstruction(warnings: ValidationWarning[]): string {
  if (warnings.length === 0) return '';

  // 同一内容の重複指示をまとめる
  const instructions = new Set<string>();

  for (const w of warnings) {
    const ev = w.evidence ?? '';
    if (w.type === 'platform-mismatch') {
      instructions.add(
        `「${ev}」は提供データの対応機種に含まれていません。本文から対応機種としての言及を削除してください。`
      );
    } else if (w.type === 'title-mismatch' || w.type === 'body-title-mismatch') {
      instructions.add(
        `ゲームタイトルは提供データのものを正確に使用してください（短縮・翻訳・改変は禁止）。`
      );
    } else if (w.type.startsWith('numeric-')) {
      instructions.add(
        `数値「${ev}」は提供データにありません。根拠のない具体的な数値は記載しないでください。`
      );
    } else if (w.type.startsWith('person-')) {
      instructions.add(
        `人物「${ev}」への言及・発言引用は提供データにありません。人物の名前・肩書き・発言を記載しないでください。`
      );
    } else {
      // その他の type は汎用指示
      instructions.add(`「${ev}」は提供データで裏付けられません。該当箇所を削除または修正してください。`);
    }
  }

  const lines = ['【前回生成での問題点（必ず修正すること）】'];
  lines.push('前回の記事には以下の問題が検出されました。今回は必ず修正してください:');
  for (const ins of instructions) {
    lines.push(`- ${ins}`);
  }
  return lines.join('\n');
}

/**
 * 全記事を検証してレポートを生成
 */
export function validateArticles(
  articles: GeneratedArticle[],
  issueNumber: number,
  webSearchStats?: { searchFailures: number; pageContentFailures: number },
  publishDate?: Date
): ValidationReport {
  const warnings: ValidationWarning[] = [];
  for (const article of articles) {
    warnings.push(...validateArticle(article, publishDate));
  }

  const warningsBySeverity: Record<Severity, number> = {
    high: warnings.filter((w) => w.severity === 'high').length,
    medium: warnings.filter((w) => w.severity === 'medium').length,
    low: warnings.filter((w) => w.severity === 'low').length,
  };

  // 公式URL未取得の記事を収集（feature 記事は対象外）
  const missingOfficialUrls = articles
    .filter((a) => a.category !== 'feature' && !a.sourceUrls?.official)
    .map((a) => ({
      articleTitle: a.title,
      category: a.category,
      gameTitle: a.game?.title ?? '',
    }));

  return {
    issueNumber,
    generatedAt: new Date().toISOString(),
    totalArticles: articles.length,
    totalWarnings: warnings.length,
    warningsBySeverity,
    warnings,
    webSearchStats,
    missingOfficialUrls: missingOfficialUrls.length > 0 ? missingOfficialUrls : undefined,
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
  if (report.webSearchStats) {
    const s = report.webSearchStats;
    const totalFail = s.searchFailures + s.pageContentFailures;
    if (totalFail > 0) {
      console.warn(
        `  ⚠️  Web search failures: keyword=${s.searchFailures}, page-fetch=${s.pageContentFailures}`
      );
    } else {
      console.log(`  Web search failures: 0`);
    }
  }
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

  // 公式URL未取得の記事（記録のみ。fail 判定には算入しない）
  if (report.missingOfficialUrls) {
    console.log('');
    console.log('=== Missing Official URLs ===');
    for (const m of report.missingOfficialUrls) {
      console.log(`  [${m.category}] ${m.gameTitle} (${m.articleTitle})`);
    }
  }

  // LLM-judge の結果（記録のみ。fail 判定には算入しない）
  if (report.llmJudge) {
    const j = report.llmJudge;
    console.log('');
    console.log('=== LLM Fact-Check (judge) ===');
    console.log(`Judged: ${j.judgedArticles} articles, Skipped: ${j.skippedArticles}`);
    console.log(
      `Claims - supported: ${j.claimsByVerdict.supported}, contradicted: ${j.claimsByVerdict.contradicted}, unverifiable: ${j.claimsByVerdict.unverifiable}`
    );
    if (j.warnings.length > 0) {
      console.log('--- LLM Judge Findings (not counted toward fail threshold) ---');
      for (const w of j.warnings) {
        console.log(
          `  [${w.severity.toUpperCase()}][${w.type}] (${w.category}) ${w.articleTitle}\n    ${w.message}`
        );
      }
    }
  }

  // fail 判定は正規表現バリデータ由来の warnings のみで行う（judge は算入しない）
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
  const generatedIssue = JSON.parse(rawData) as { articles: GeneratedArticle[]; publishDate?: string };

  // issueNumber は引数または環境変数から取得（無ければ 0）
  const issueNumber = parseInt(process.env.ISSUE_NUMBER || '0', 10);
  const publishDate = generatedIssue.publishDate ? new Date(generatedIssue.publishDate) : undefined;

  const report = validateArticles(generatedIssue.articles, issueNumber, undefined, publishDate);
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
