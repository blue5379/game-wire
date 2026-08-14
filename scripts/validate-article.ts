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
import { getReleaseStatus, isUpcomingForBody } from './bedrock-client.js';
import { isMainModule } from './entrypoint.js';
import {
  ARTICLE_CATEGORY_LABELS,
  computeReportStatus,
  formatReportMarkdown,
  type ReportStatus,
} from './format-validation-report.js';

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

/**
 * レポートの生成元モード。
 * 本番（CI）と開発・手動実行のレポートは同じ号番号ファイル名になり得るため、
 * どの実行由来かを JSON 内・ファイル名の双方で明示して混同を防ぐ（Issue #193）。
 */
export type ReportMode = 'production' | 'dev' | 'manual';

/**
 * 記事カテゴリ。値域が二重定義になって drift しないよう GeneratedArticle から導出する。
 */
export type ArticleCategory = GeneratedArticle['category'];

/** 早期アクセス表記の問題の種別（Issue #26、§2.9） */
export type EarlyAccessStatementIssueType =
  /** 早期アクセスであることに本文・要約のどちらも触れていない */
  | 'early-access-unstated'
  /** 正式リリース済みと読める断定がある */
  | 'early-access-release-claim';

/** 1 記事の早期アクセス表記の問題（Issue #26、§2.9） */
export interface EarlyAccessStatementIssue {
  articleTitle: string;
  category: ArticleCategory;
  gameTitle: string;
  type: EarlyAccessStatementIssueType;
  /** マッチした語（`early-access-unstated` では持たない） */
  evidence?: string;
  message: string;
}

/** 1 カテゴリの記事本数不足（Issue #311） */
export interface ArticleCountShortfall {
  category: ArticleCategory;
  /** 期待本数（EXPECTED_ARTICLE_COUNTS もしくは環境変数の上書き値） */
  expected: number;
  /** 実際に読者に届く本数（hidden 記事は除外して数える） */
  actual: number;
}

export interface ValidationReport {
  issueNumber: number;
  generatedAt: string;
  /**
   * 生成元モード。writeAndCheckReport が出力先ディレクトリから解決してセットする。
   * production=CI 本番、dev=DEV_MODE、manual=validate-existing-issue。
   */
  mode?: ReportMode;
  /**
   * 総合ステータス（ok/warning/error）。writeAndCheckReport が算出してセットする。
   * 「対応が必要か」を機械的に判定するための最重要フィールド（Issue #202）。
   */
  status?: ReportStatus;
  totalArticles: number;
  totalWarnings: number;
  warningsBySeverity: Record<Severity, number>;
  warnings: ValidationWarning[];
  webSearchStats?: {
    searchFailures: number;
    pageContentFailures: number;
    /**
     * AI成人向けスクリーニング（Bedrock呼び出し）の失敗回数。fail-openで通過した件数（Issue #222）。
     * 旧キャッシュ（本フィールド追加前に生成された data/generated-articles.json）には存在しないため
     * optional。undefined =「未計測」、0 =「計測した上で失敗ゼロ」であり、意味が異なるので混同しないこと。
     */
    adultScreeningFailures?: number;
    /**
     * AI成人向けスクリーニングの応答が YES/NO どちらでもなかった回数（応答形式不正のfail-open、Issue #222）。
     * adultScreeningFailures とは意味が異なる別カウンタ（例外は投げていない）。
     * undefined =「未計測」、0 =「計測した上でゼロ」。error 昇格の対象には含めない
     * （理由は format-validation-report.ts 冒頭のコメント参照）。
     */
    unrecognizedScreeningResponses?: number;
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
  /**
   * カテゴリごとの記事本数不足（Issue #311）。期待本数を下回ったカテゴリだけが入る。
   * 不足が無い場合は空配列（`undefined` は「未計測」= 本フィールド追加前の旧レポート）。
   *
   * 正規表現バリデータ由来の `warnings` とは分離して持つ。理由: 本数不足は記事本文の
   * 品質ではなく号の構成の問題であり、`warningsBySeverity.high` に混ぜると
   * 「high 警告の重大性の再定義」（仕様 §9.1 保留1）の議論対象がさらに不均一になる。
   * ステータス判定への算入は computeReportStatus が別項として行う（#222 の
   * adultScreeningFailures と同じ構造）。
   */
  articleCountShortfalls?: ArticleCountShortfall[];
  /**
   * 早期アクセス配信中のタイトルの表記漏れ・誤断定（Issue #26、§2.9）。
   * 問題が無い場合は空配列（`undefined` は「未計測」= 本フィールド追加前の旧レポート）。
   *
   * `warnings` から分離して持つ理由は `detectEarlyAccessStatementIssues` の JSDoc を参照。
   * ステータス判定では `warning` 止まりにする（`error` に昇格させない）。理由:
   * 一次対策はプロンプト側であり、この判定項は発火頻度が未観測の観測網であるため。
   * `error` にすると `shouldFileIssue` が真になって号ごとに Issue が自動起票される。
   * #222 の `unrecognizedScreeningResponses` と同じ判断。
   */
  earlyAccessStatementIssues?: EarlyAccessStatementIssue[];
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
 * 数値クレームのマッチ全体（match[0]）から、照合に使う「数値＋単位」キーを抽出する。
 *
 * 例:
 *   matchFull="40万人",         numericPart="40"    → "40万人"
 *   matchFull="100時間超え",    numericPart="100"   → "100時間"
 *   matchFull="40〜60時間に拡張", numericPart="40〜60" → "40〜60時間"
 *   matchFull="18万件以上",     numericPart="18"    → "18万件"
 *   matchFull="96%",            numericPart="96"    → "96%"
 *   matchFull="550台以上の実車", numericPart="550"   → "550台"
 *   matchFull="550台の車",       numericPart="550"   → "550台"
 *
 * 「以上の〈文脈語〉」形式（例: 台以上の実車）は内部装飾として先に除去し、
 * その後「超え/程度/ほど/プレイ/の\S+/を要/もの/に拡張/没入/遊」等の
 * 末尾接尾語を除去する。
 */
export function extractNumericUnitKey(matchFull: string, numericPart: string): string {
  // カンマ・空白を正規化してから単位部分を切り出す
  const normalizedFull = matchFull.replace(/,/g, '').replace(/\s+/g, '');
  const normalizedNum = numericPart.replace(/,/g, '');
  const unitRaw = normalizedFull.startsWith(normalizedNum)
    ? normalizedFull.slice(normalizedNum.length)
    : normalizedFull;
  // 「以上の〈文脈語〉」形式の内部装飾を先に除去する
  // 例: "台以上の実車" → "台", "台以上の車両" → "台"
  const step1 = unitRaw.replace(/以上の.+/, '');
  // 末尾の接尾語（コア単位の後に続く文脈語）を除去する
  // 「の\S*」は play-hours の末尾 "の"（時間の〜）と vehicle-count の「の車/の実車」を
  // 両方除去するため \S* (0 文字以上) とする
  const trailingSuffixes = /(?:以上|超え?|程度|ほど|プレイ|の\S*|を要|もの|に拡張|没入|遊)+$/;
  const unitCore = step1.replace(trailingSuffixes, '');
  return normalizedNum + unitCore;
}

/**
 * 検索結果の中から、指定したキーワードを含む最初のソースを返す
 * 見つかった場合: 根拠あり（ウェブ情報由来の可能性が高い）
 * 見つからない場合: undefined（捏造の可能性が高い）
 *
 * @param keyword  照合キーワード（数値モード時は bare 数値文字列、それ以外は任意文字列）
 * @param sources  検索結果ソース一覧
 * @param numeric  true の場合、数値として前後が数字でない位置でのみ一致させる。
 *   さらに unitKey が指定されている場合は「数値＋単位」を含む文字列として照合し、
 *   別文脈の同一数字（例: "40ダメ"）への誤マッチを防ぐ。
 * @param unitKey  extractNumericUnitKey() で取り出した「数値＋単位」キー（例: "40万人"）。
 *   指定時は numeric モードと組み合わせて単位まで含めた照合を行う。
 */
function findSourceFor(
  keyword: string,
  sources: Array<{ url: string; title: string; snippet: string }> | undefined,
  numeric = false,
  unitKey?: string
): { url: string; title: string; snippet: string } | undefined {
  if (!sources || sources.length === 0) return undefined;
  const kw = keyword.replace(/,/g, '').toLowerCase();
  if (kw.length === 0) return undefined;

  // 単位キーモード: 数値＋単位を含む文字列として照合（例: "40万人" は "40ダメ" にはマッチしない）
  // スペース・カンマを除去して照合することで "40万 人" 等の表記ゆれも吸収する。
  // (?<!\d) で数値先頭の桁境界を保証し、"96%" が "196%" にマッチしないようにする。
  // escapeRegExp で "%" や "〜" などのメタ文字を安全にエスケープする。
  if (numeric && unitKey) {
    const unitKeyNormalized = unitKey.replace(/,/g, '').replace(/\s+/g, '').toLowerCase();
    if (unitKeyNormalized.length > 0) {
      const unitKeyMatcher = new RegExp(`(?<!\\d)${escapeRegExp(unitKeyNormalized)}`);
      return sources.find((s) => {
        const snippet = s.snippet.replace(/,/g, '').replace(/\s+/g, '').toLowerCase();
        const title = s.title.replace(/,/g, '').replace(/\s+/g, '').toLowerCase();
        return unitKeyMatcher.test(snippet) || unitKeyMatcher.test(title);
      });
    }
  }

  // 数値モード（unitKey なし）: 前後が数字でない位置でのみ一致させる
  // （例: "96" は "1996" にはマッチしない）
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
  { pattern: /(?<!\d)((?:\d{1,3}(?:,\d{3})*|\d{4,})(?:[.]\d+)?(?:[〜～\-](?:\d{1,3}(?:,\d{3})*|\d{4,})(?:[.]\d+)?)?)\s*時間(?:以上|超え?|程度|ほど|遊|プレイ|の|を要|もの|に拡張|没入)/g, type: 'play-hours', severity: 'medium' },
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
      // 単位まで含めた照合キーを生成して誤マッチを防ぐ（例: "40万人" ≠ "40ダメ"）
      const unitKey = numericValue ? extractNumericUnitKey(match[0].trim(), numericValue) : undefined;
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
          ? findSourceFor(numericValue, article.webSearchSources, true, unitKey)
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
      // 単位まで含めた照合キーを生成して誤マッチを防ぐ（例: "40万人" ≠ "40ダメ"）
      const unitKey = numericValue ? extractNumericUnitKey(match[0].trim(), numericValue) : undefined;

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
          ? findSourceFor(numericValue, article.webSearchSources, true, unitKey)
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
  if (appId === undefined) {
    // Issue #296: Steam appId が取得できなかったため同一性照合を実行しなかった（観測用）
    warnings.push({
      articleTitle: article.title,
      category: article.category,
      severity: 'low',
      type: 'game-source-unchecked',
      message:
        `Steam appId が取得できなかったため、記事の game メタと Steam 実体の同一性照合を実行しませんでした。` +
        `appId は sourceUrls.steam または sourceUrls.stores[] の platform='steam' から抽出されます。`,
    });
    return warnings;
  }

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
    const appId = extractSteamAppIdFromArticle(article);
    // Steam appId を持たない記事は API を呼ばないのでディレイ不要
    // ただし game-source-unchecked 警告は収集する必要があるため、
    // validateGameSourceConsistency を呼んで警告を取得する
    if (appId === undefined) {
      warnings.push(...(await validateGameSourceConsistency(article, fetchImpl)));
      continue;
    }
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
 *
 * ## § 2.8 本日発売の扱い
 *
 * `getReleaseStatus` が「本日発売」を返す場合も検証を続ける。
 * 理由: 発売日当日の記事に「発売予定」「もうすぐ」等の未発売表現が含まれるのは不適切。
 * セクション5『📅 発売情報』では「本日発売」と書くが（§ 2.5）、
 * 記事タイトルに未発売ニュアンスが混入していないかは検証が必要。
 *
 * 参照: `docs/article-category-spec.md` § 2.8
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

  const status = getReleaseStatus(releaseDate, publishDate);
  // 「本日発売」も発売済み側として扱う（§ 2.8）
  if (status !== '発売済み' && status !== '本日発売') return warnings;

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
 * 文を区切り文字で分割するヘルパー（区切りは `。`, `！`, `？`, 改行）
 *
 * `「先行プレイで高く評価されています。」`
 *  → `['「先行プレイで高く評価されています。」']`（1文）
 *
 * 空の文は除外する。
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 未発売タイトルの記事で検出する評価語彙
// 指示: `評価が高|高く評価|高評価|好評|絶賛|支持を得`
const EVALUATION_PATTERN = /評価が高|高く評価|高評価|好評|絶賛|支持を得/;

// 発売前の先行プレイ等の限定語（同じ文に含まれていれば正当な文脈として除外）
// 指示: `先行プレイ|先行体験|先行レビュー|体験版|デモ版|試遊|プレビュー|発売前|クローズドテスト|オープンベータ|ベータテスト|βテスト`
const PRE_RELEASE_QUALIFIER_PATTERN = /先行プレイ|先行体験|先行レビュー|体験版|デモ版|試遊|プレビュー|発売前|クローズドテスト|オープンベータ|ベータテスト|βテスト/;

/**
 * 未発売タイトルの記事が評価を断定していないかを検証（§ 2.7 / §11.3.4）
 *
 * 発売予定または本日発売のタイトルの記事で、「高く評価されている」「好評」等の
 * 評価・受容に関する記述を検出する。
 *
 * ## 発火条件
 * - article.category が 'newRelease' または 'indie'
 *   （インディー枠には未発売作が来ない設計だが、防御的に indie も対象にする。
 *    理由: §11.3.2 は「インディー枠は未発売タイトルを扱わない」としているが、
 *    §11.3.4 が「防御的に indie も対象にしてよい」と明記している）
 * - publishDate が渡されている（未指定なら検証をスキップ。後方互換）
 * - article.game?.releaseDate がある
 * - isUpcomingForBody(getReleaseStatus(releaseDate, publishDate)) が true
 *   （発売予定 または 本日発売。§ 2.8 の本日発売の扱い）
 *
 * ## 検査対象
 * article.content と article.summary の両方。
 * §11.3.2 の実測で、vol.3 の事故は summary にも「高く評価されている」が入っていた。
 *
 * ## 除外設計: 文単位の除外ウィンドウ
 * §2.7 は「発売前の先行プレイで好評」は正当な文脈であり誤検出しないことを要求。
 * 検査対象テキストを文に分割し、評価語彙にマッチした文が同じ文の中に
 * 限定語（先行プレイ / 体験版 / プレビュー等）を含むなら、その文は正当として除外する。
 *
 * ## 警告の形
 * - severity: 'high'（§11.3.4。low だと VALIDATION_AUTO_REGENERATE の対象外）
 * - type: 'upcoming-evaluation-claim'
 * - フィールドごとに最大1件（1記事で最大2件: content + summary）
 *   理由（**§11.3.6**。§11.3.4 ではない）: writeAndCheckReport は high が5件超（6件以上）で fail する。
 *   §11.3.6 の実測では既存レポート28件の high 分布に**ちょうど5件のものが2件**あり、
 *   1記事から多数の警告を出すとレポートが fail に転落する余地がある。
 *
 * 参照: `docs/article-category-spec.md` § 2.7, `docs/article-category-spec-review.md` § 11.3.4（設計）/ § 11.3.6（fail 閾値）
 */
export function validateUpcomingEvaluationClaims(
  article: GeneratedArticle,
  publishDate?: Date
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // 発火条件のチェック
  if (article.category !== 'newRelease' && article.category !== 'indie') return warnings;
  if (!publishDate) return warnings;

  const releaseDate = article.game?.releaseDate;
  if (!releaseDate) return warnings;

  const status = getReleaseStatus(releaseDate, publishDate);
  if (!isUpcomingForBody(status)) return warnings; // 発売済みなら評価の言及は正当

  // 検査対象のフィールドを定義
  const fieldsToCheck: Array<{ name: string; text: string }> = [
    { name: '本文', text: article.content },
    { name: '要約', text: article.summary },
  ];

  for (const field of fieldsToCheck) {
    if (!field.text) continue;

    const sentences = splitIntoSentences(field.text);
    let foundInThisField = false;
    let matchedEvidence: string | undefined;
    let matchedSentence: string | undefined;

    for (const sentence of sentences) {
      const evalMatch = sentence.match(EVALUATION_PATTERN);
      if (!evalMatch) continue;

      // 同じ文に限定語が含まれているかチェック
      if (PRE_RELEASE_QUALIFIER_PATTERN.test(sentence)) {
        // 正当な文脈として除外
        continue;
      }

      // 限定語が無い場合は検出対象
      foundInThisField = true;
      matchedEvidence = evalMatch[0];
      matchedSentence = sentence;
      break; // フィールドごとに最大1件なので、最初のマッチで終了
    }

    if (foundInThisField) {
      warnings.push({
        articleTitle: article.title,
        category: article.category,
        severity: 'high',
        type: 'upcoming-evaluation-claim',
        message:
          `未発売タイトル（releaseDate=${releaseDate}）の記事${field.name}に評価断定「${matchedEvidence}」が含まれています。` +
          `発売前でレビューも評価も存在しません。` +
          `該当箇所: 「${matchedSentence?.slice(0, 100)}${(matchedSentence?.length ?? 0) > 100 ? '...' : ''}」`,
        evidence: matchedEvidence,
      });
    }
  }

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
    ...validateUpcomingEvaluationClaims(article, publishDate),
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
    } else if (w.type === 'upcoming-evaluation-claim') {
      // §11.3.4: 未発売タイトルの評価断定に対する専用指示
      instructions.add(
        `本作は発売前でレビューも評価も存在しません。「${ev}」のような評価・受容に関する記述を削除してください` +
          `（提供データに発売前の先行プレイ評として明示されている場合を除く）。`
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
 * カテゴリごとの期待記事本数（仕様 §1 の 1 号の構成。新作 2 / インディー 2 / 特集 1 / 名作 1）。
 *
 * 定数ではなく環境変数で上書き可能にした理由（仕様 §9.2-10 の下位判断）: 本数不足は
 * 「不足に気づける状態にする」ための検証項目であり（§6.4）、構成の見直しや一時的な運用
 * （例: 供給が細い時期に新作枠を 1 本に絞る判断）で期待値が動いたときに、コード変更なしで
 * 追随できる必要がある。既定値そのものは仕様が定める構成なのでここに置く。
 */
export const EXPECTED_ARTICLE_COUNTS: Record<ArticleCategory, number> = {
  newRelease: 2,
  indie: 2,
  feature: 1,
  classic: 1,
};

/** カテゴリ別の期待本数を上書きする環境変数名 */
const EXPECTED_ARTICLE_COUNT_ENV: Record<ArticleCategory, string> = {
  newRelease: 'EXPECTED_ARTICLE_COUNT_NEWRELEASE',
  indie: 'EXPECTED_ARTICLE_COUNT_INDIE',
  feature: 'EXPECTED_ARTICLE_COUNT_FEATURE',
  classic: 'EXPECTED_ARTICLE_COUNT_CLASSIC',
};

/**
 * カテゴリ別の期待記事本数を読む（環境変数で上書き可能）。
 * `0` はそのカテゴリの検出を無効化する有効な指定なので、`Number(raw) || default` とは
 * 書かない（0 が既定値に化ける）。負数・非整数は不正な指定として既定値に落とす。
 */
export function readExpectedArticleCounts(): Record<ArticleCategory, number> {
  const result = { ...EXPECTED_ARTICLE_COUNTS };
  for (const category of Object.keys(result) as ArticleCategory[]) {
    const raw = process.env[EXPECTED_ARTICLE_COUNT_ENV[category]];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) continue;
    result[category] = n;
  }
  return result;
}

/**
 * カテゴリごとの記事本数不足を算出する（Issue #311。仕様 §6.5）。
 *
 * hidden 記事（`hiddenArticleTitles`）は読者に届かないため不足として数える。
 * build-issue.ts が criticallyIncomplete / game-source-mismatch でクールダウン対象から
 * 除外しているのと同じ扱いに揃えている。
 *
 * 期待本数を「上回る」ケースは不足ではないので何も返さない。
 */
export function detectArticleCountShortfalls(
  articles: GeneratedArticle[],
  hiddenArticleTitles?: ReadonlySet<string>
): ArticleCountShortfall[] {
  const expectedCounts = readExpectedArticleCounts();
  const visible = hiddenArticleTitles
    ? articles.filter((a) => !hiddenArticleTitles.has(a.title))
    : articles;

  const shortfalls: ArticleCountShortfall[] = [];
  for (const category of Object.keys(expectedCounts) as ArticleCategory[]) {
    const expected = expectedCounts[category];
    const actual = visible.filter((a) => a.category === category).length;
    if (actual < expected) {
      shortfalls.push({ category, expected, actual });
    }
  }
  return shortfalls;
}

// 記事本文が早期アクセスに触れていると認める表記（Issue #26、§2.9）
const EARLY_ACCESS_MENTION_PATTERN = /早期アクセス|アーリーアクセス|early\s*access/i;

// 「正式リリース済みの製品版」と読める語（早期アクセス作品の記事では書かせない、§2.9）
const FULL_RELEASE_WORD_PATTERN = /正式(?:リリース|版|ローンチ)|フルリリース|完成版/;

// 「もう正式リリースされた」と読める完了表現。
// 「開発中」「制作中」を拾わないよう、`中` 単体ではなく販売状態を表す語だけを列挙する。
//
// ⚠️ この語は **正式リリース語より後ろ**にあるものだけを見る（`FULL_RELEASE_WORD_PATTERN` の
// マッチ位置以降を切り出して判定する）。文全体を見ると
// 「早期アクセス配信中で、正式版の開発が続けられている」の `配信中`（早期アクセス側の述語）を
// `正式版` の完了表現として誤って結び付ける（テストで固定済み）。
const FULL_RELEASE_COMPLETED_PATTERN = /済み|された|されている|されました|を果た|発売中|配信中|リリース中/;

// 「まだ正式リリースされていない」と読める文脈語。同じ文にあれば正当な記述として除外する。
// ⚠️ この除外は意図的に広い（`前` `予定` 等の 1 語でも除外する）。バリデータは
// プロンプト（一次対策）が効かなかったときの観測網であり、偽陽性で「正しい記述を直せ」と
// 指示すると、かえって正確な文が壊れるため。偽陰性側に倒している。
const FULL_RELEASE_FUTURE_PATTERN = /前|予定|未定|目指|向け|見込|将来|いずれ|検討|開発中|制作中/;

/**
 * 早期アクセス配信中のタイトルの記事が、その状態を正しく伝えているかを検証する
 * （Issue #26、§2.9）。
 *
 * ## なぜ high 警告（`warnings`）ではなく独立した判定項なのか
 *
 * `warningsBySeverity.high` は ①仕様 §9.1 保留1（high の重大性の再定義）の議論対象
 * ②`writeAndCheckReport` の fail 閾値 ③`VALIDATION_AUTO_REGENERATE` の再生成判断、
 * の 3 つに同時に使われている数値である。早期アクセスの表記漏れを混ぜると、これらの
 * 運用判断がすべて動く。#311 の `articleCountShortfalls` と #222 の
 * `adultScreeningFailures` と同じ理由で、独立したフィールドに分ける。
 *
 * ## 発火条件
 *
 * `article.game?.isEarlyAccess === true` のときだけ。`undefined`（Steam ストア外・
 * appId 未判明で未判定）では 1 件も出さない。判定できていないことを記事の欠陥として
 * 数えると、Steam に無いタイトルの記事が常に警告を出し続ける。
 *
 * ## 2 つの検出型
 *
 * | type | 意味 | 実測例 |
 * |---|---|---|
 * | `early-access-unstated` | 本文・要約のどちらも早期アクセスに触れていない | vol.008『ARK: Survival Ascended』（「発売中」と書きつつ早期アクセスに一切言及なし） |
 * | `early-access-release-claim` | 正式リリース済みと読める断定がある | 「正式版が発売中」等 |
 *
 * `early-access-unstated` は記事単位で最大 1 件、`early-access-release-claim` は
 * フィールド（本文・要約）単位で最大 1 件（既存 `validateUpcomingEvaluationClaims` と同じ方針）。
 *
 * 参照: `docs/article-category-spec.md` §2.9
 */
export function detectEarlyAccessStatementIssues(
  article: GeneratedArticle
): EarlyAccessStatementIssue[] {
  if (article.game?.isEarlyAccess !== true) return [];

  const issues: EarlyAccessStatementIssue[] = [];
  const base = {
    articleTitle: article.title,
    category: article.category,
    gameTitle: article.game?.title ?? '',
  };

  const fields: Array<{ name: string; text: string }> = [
    { name: '本文', text: article.content },
    { name: '要約', text: article.summary },
  ];

  // 型1: どのフィールドでも早期アクセスに触れていない
  const mentionsAnywhere = fields.some((f) => f.text && EARLY_ACCESS_MENTION_PATTERN.test(f.text));
  if (!mentionsAnywhere) {
    issues.push({
      ...base,
      type: 'early-access-unstated',
      message:
        `早期アクセス配信中のタイトルですが、本文・要約のどちらにも早期アクセスである旨の記載がありません。` +
        `読者は正式リリース済みの完成品として読みます。「📅 発売情報」に早期アクセス配信中であることを明記してください。`,
    });
  }

  // 型2: 正式リリース済みと読める断定
  for (const field of fields) {
    if (!field.text) continue;
    for (const sentence of splitIntoSentences(field.text)) {
      const matched = sentence.match(FULL_RELEASE_WORD_PATTERN);
      if (matched?.index === undefined) continue;
      // 完了表現は正式リリース語より後ろだけを見る（前方の別主語の述語を拾わないため）
      const afterWord = sentence.slice(matched.index + matched[0].length);
      if (!FULL_RELEASE_COMPLETED_PATTERN.test(afterWord)) continue;
      // 未来・不確定を示す語は文全体で見る（広く除外して偽陽性を避ける）
      if (FULL_RELEASE_FUTURE_PATTERN.test(sentence)) continue;

      issues.push({
        ...base,
        type: 'early-access-release-claim',
        evidence: matched[0],
        message:
          `早期アクセス配信中のタイトルですが、記事${field.name}に正式リリース済みと読める断定「${matched[0]}」があります。` +
          `該当箇所: 「${sentence.slice(0, 100)}${sentence.length > 100 ? '...' : ''}」`,
      });
      break; // フィールドごとに最大1件
    }
  }

  return issues;
}

/**
 * 号の全記事から早期アクセス表記の問題を集める（Issue #26、§2.9）。
 * 問題が無い号でも空配列を返す（`undefined` は「未計測」= 本フィールド追加前の旧レポート）。
 */
export function detectEarlyAccessStatementIssuesForIssue(
  articles: GeneratedArticle[]
): EarlyAccessStatementIssue[] {
  return articles.flatMap((a) => detectEarlyAccessStatementIssues(a));
}

/**
 * 全記事を検証してレポートを生成
 *
 * @param hiddenArticleTitles hidden: true が付く記事のタイトル集合（Issue #311 の本数計上から除外）
 */
export function validateArticles(
  articles: GeneratedArticle[],
  issueNumber: number,
  webSearchStats?: {
    searchFailures: number;
    pageContentFailures: number;
    adultScreeningFailures?: number;
    unrecognizedScreeningResponses?: number;
  },
  publishDate?: Date,
  hiddenArticleTitles?: ReadonlySet<string>
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
    // 不足0件でも空配列を入れる（undefined =「未計測」= 旧レポートと区別するため。Issue #311）
    articleCountShortfalls: detectArticleCountShortfalls(articles, hiddenArticleTitles),
    // 問題0件でも空配列を入れる（undefined =「未計測」= 旧レポートと区別するため。Issue #26）
    earlyAccessStatementIssues: detectEarlyAccessStatementIssuesForIssue(articles),
    missingOfficialUrls: missingOfficialUrls.length > 0 ? missingOfficialUrls : undefined,
  };
}

/**
 * 出力先ディレクトリ名からレポートの生成元モードを判定する。
 * ディレクトリの末尾が validation-dev / validation-manual なら dev / manual、
 * それ以外（本番 validation を含む）は production とみなす。
 */
export function resolveReportMode(outputDir: string): ReportMode {
  const base = path.basename(outputDir);
  if (base === 'validation-dev') return 'dev';
  if (base === 'validation-manual') return 'manual';
  return 'production';
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

  // 出力先からモードを解決して JSON に埋め込む（本番/dev/manual の混同防止・Issue #193）
  const mode = resolveReportMode(outputDir);
  report.mode = mode;

  // 総合ステータスを算出して埋め込む（Issue #202）。JSON 書き出しより前に行う。
  report.status = computeReportStatus(report);

  // 本番以外はファイル名にモードサフィックスを付け、号番号だけの本番ファイルと区別する
  const modeSuffix = mode === 'production' ? '' : `-${mode}`;
  const baseName = `validation-report-${String(report.issueNumber).padStart(3, '0')}${modeSuffix}`;
  const reportPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 人間向けの Markdown サマリを同じ basename で書き出す（Issue #202）。
  // CI ではこの .md をリポジトリ保存・Issue 本文・Step Summary に流用する。
  const markdownPath = path.join(outputDir, `${baseName}.md`);
  fs.writeFileSync(markdownPath, formatReportMarkdown(report));

  console.log('');
  console.log(`=== Article Validation Report [${mode}] status=${report.status} ===`);
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
    // adultScreeningFailures は旧キャッシュに存在しない場合がある。undefined（未計測）と
    // 0（計測した上で失敗ゼロ）を混同しないよう、undefined は別メッセージで明示する（Issue #222）。
    if (s.adultScreeningFailures === undefined) {
      console.log(`  Adult screening failures: unmeasured (old cache)`);
    } else if (s.adultScreeningFailures > 0) {
      console.warn(`  ⚠️  Adult screening failures (fail-open): ${s.adultScreeningFailures}`);
    } else {
      console.log(`  Adult screening failures: 0`);
    }
    // unrecognizedScreeningResponses も同様に「未計測」と「計測して0件」を区別する（Issue #222）。
    // 例外を投げていない fail-open 経路のため adultScreeningFailures とは別カウンタ。
    if (s.unrecognizedScreeningResponses === undefined) {
      console.log(`  Unrecognized screening responses: unmeasured (old cache)`);
    } else if (s.unrecognizedScreeningResponses > 0) {
      console.warn(
        `  ⚠️  Unrecognized screening responses (fail-open): ${s.unrecognizedScreeningResponses}`
      );
    } else {
      console.log(`  Unrecognized screening responses: 0`);
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

  // 記事本数の不足（Issue #311）。status=error に算入されるため、未計測と 0 件を区別して出す。
  if (report.articleCountShortfalls === undefined) {
    console.log(`  Article count shortfalls: unmeasured (old cache)`);
  } else if (report.articleCountShortfalls.length > 0) {
    console.warn('');
    console.warn('=== ⚠️  Article Count Shortfall ===');
    for (const s of report.articleCountShortfalls) {
      console.warn(
        `  [${ARTICLE_CATEGORY_LABELS[s.category]}] ${s.actual} / ${s.expected} 本（${s.expected - s.actual} 本不足）`
      );
    }
  } else {
    console.log(`  Article count shortfalls: 0`);
  }

  // 早期アクセスの表記（Issue #26）。status=warning に算入されるため、未計測と 0 件を区別して出す。
  if (report.earlyAccessStatementIssues === undefined) {
    console.log(`  Early access statement issues: unmeasured (old cache)`);
  } else if (report.earlyAccessStatementIssues.length > 0) {
    console.warn('');
    console.warn('=== ⚠️  Early Access Statement Issues ===');
    for (const i of report.earlyAccessStatementIssues) {
      console.warn(
        `  [${i.type}] (${ARTICLE_CATEGORY_LABELS[i.category]}) ${i.gameTitle}\n    ${i.message}`
      );
    }
  } else {
    console.log(`  Early access statement issues: 0`);
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
if (isMainModule(import.meta.url)) {
  mainCli().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
