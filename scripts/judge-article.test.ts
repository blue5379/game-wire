/**
 * judge-article の純関数のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildJudgeUserMessage,
  parseJudgeResponse,
  mapClaimsToWarnings,
  judgeArticles,
  isLlmJudgeEnabled,
  CONTRADICTED_CONFIDENCE_THRESHOLD,
  type JudgeClaim,
} from './judge-article.js';
import type { GeneratedArticle } from './generate-articles.js';

// Bedrock / Tavily への依存をモック
const mockInvoke = vi.fn();
const mockIsTavilyAvailable = vi.fn();
vi.mock('./bedrock-client.js', () => ({
  invokeClaudeModel: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock('./fetch-web-search.js', () => ({
  isTavilyAvailable: () => mockIsTavilyAvailable(),
}));

function makeArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    title: 'デフォルトタイトル',
    category: 'newRelease',
    summary: '',
    content: '',
    ...overrides,
  };
}

describe('buildJudgeUserMessage', () => {
  it('本文と検索結果をマーカーで囲んで含める', () => {
    const article = makeArticle({
      title: 'Test Game の紹介',
      content: '本文テキスト',
      webSearchSources: [
        { url: 'https://example.com/a', title: 'Source A', snippet: 'snippet A' },
      ],
    });

    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('Test Game の紹介');
    expect(msg).toContain('本文テキスト');
    expect(msg).toContain('=== 外部参照データ');
    expect(msg).toContain('Source A');
    expect(msg).toContain('snippet A');
    expect(msg).toContain('https://example.com/a');
  });

  it('webSearchSources が無くても例外を投げない', () => {
    const article = makeArticle({ content: '本文', webSearchSources: undefined });
    expect(() => buildJudgeUserMessage(article)).not.toThrow();
  });
});

describe('parseJudgeResponse', () => {
  it('正常な JSON から claims を抽出する', () => {
    const raw = `判定結果です:
{
  "claims": [
    {"claim": "主張1", "verdict": "supported", "confidence": 0.9, "explanation": "理由1", "excerpt": "本文1"},
    {"claim": "主張2", "verdict": "contradicted", "confidence": 0.8, "explanation": "理由2", "excerpt": "本文2"}
  ]
}`;
    const claims = parseJudgeResponse(raw);
    expect(claims).toHaveLength(2);
    expect(claims[0].verdict).toBe('supported');
    expect(claims[1].verdict).toBe('contradicted');
    expect(claims[1].confidence).toBe(0.8);
  });

  it('JSONブロックが無い応答は空配列を返す', () => {
    expect(parseJudgeResponse('JSONがありません')).toHaveLength(0);
  });

  it('不正なJSONは空配列を返す（throwしない）', () => {
    expect(parseJudgeResponse('{ claims: [壊れたJSON }')).toHaveLength(0);
  });

  it('無効な verdict のエントリは除外する', () => {
    const raw = `{"claims": [
      {"claim": "OK", "verdict": "supported", "confidence": 0.5, "explanation": "", "excerpt": ""},
      {"claim": "NG", "verdict": "maybe", "confidence": 0.5, "explanation": "", "excerpt": ""}
    ]}`;
    const claims = parseJudgeResponse(raw);
    expect(claims).toHaveLength(1);
    expect(claims[0].claim).toBe('OK');
  });

  it('confidence を 0.0〜1.0 にクランプする', () => {
    const raw = `{"claims": [
      {"claim": "A", "verdict": "contradicted", "confidence": 1.5, "explanation": "", "excerpt": ""},
      {"claim": "B", "verdict": "unverifiable", "confidence": -0.3, "explanation": "", "excerpt": ""}
    ]}`;
    const claims = parseJudgeResponse(raw);
    expect(claims[0].confidence).toBe(1);
    expect(claims[1].confidence).toBe(0);
  });

  it('claim が欠けたエントリは除外する', () => {
    const raw = `{"claims": [
      {"verdict": "supported", "confidence": 0.5, "explanation": "", "excerpt": ""}
    ]}`;
    expect(parseJudgeResponse(raw)).toHaveLength(0);
  });
});

describe('mapClaimsToWarnings', () => {
  const article = makeArticle({ title: 'Test', category: 'classic' });

  it('supported は警告化しない', () => {
    const claims: JudgeClaim[] = [
      { claim: 'A', verdict: 'supported', confidence: 0.9, explanation: '', excerpt: '' },
    ];
    expect(mapClaimsToWarnings(article, claims)).toHaveLength(0);
  });

  it('contradicted かつ高確信度は high 警告', () => {
    const claims: JudgeClaim[] = [
      {
        claim: '架空のストーリー',
        verdict: 'contradicted',
        confidence: CONTRADICTED_CONFIDENCE_THRESHOLD,
        explanation: '検索結果と矛盾',
        excerpt: '本文該当箇所',
      },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('high');
    expect(warnings[0].type).toBe('llm-judge-contradicted');
    expect(warnings[0].context).toBe('本文該当箇所');
  });

  it('contradicted でも低確信度は low に格下げする（誤判定対策）', () => {
    const claims: JudgeClaim[] = [
      {
        claim: 'あいまいな主張',
        verdict: 'contradicted',
        confidence: CONTRADICTED_CONFIDENCE_THRESHOLD - 0.1,
        explanation: '',
        excerpt: '',
      },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings[0].severity).toBe('low');
  });

  it('unverifiable は low 警告', () => {
    const claims: JudgeClaim[] = [
      { claim: '裏付け不能', verdict: 'unverifiable', confidence: 0.9, explanation: '', excerpt: '' },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('low');
    expect(warnings[0].type).toBe('llm-judge-unverifiable');
  });

  it('警告に記事タイトル・カテゴリ・確信度を含める', () => {
    const claims: JudgeClaim[] = [
      { claim: 'X', verdict: 'unverifiable', confidence: 0.42, explanation: '理由X', excerpt: '' },
    ];
    const w = mapClaimsToWarnings(article, claims)[0];
    expect(w.articleTitle).toBe('Test');
    expect(w.category).toBe('classic');
    expect(w.message).toContain('42%');
    expect(w.message).toContain('理由X');
  });
});

describe('isLlmJudgeEnabled', () => {
  const original = process.env.VALIDATION_LLM_JUDGE;
  afterEach(() => {
    if (original === undefined) delete process.env.VALIDATION_LLM_JUDGE;
    else process.env.VALIDATION_LLM_JUDGE = original;
  });

  it('デフォルト（未設定）は有効', () => {
    delete process.env.VALIDATION_LLM_JUDGE;
    expect(isLlmJudgeEnabled()).toBe(true);
  });

  it('VALIDATION_LLM_JUDGE=false で無効', () => {
    process.env.VALIDATION_LLM_JUDGE = 'false';
    expect(isLlmJudgeEnabled()).toBe(false);
  });

  it('false 以外の値は有効のまま', () => {
    process.env.VALIDATION_LLM_JUDGE = 'true';
    expect(isLlmJudgeEnabled()).toBe(true);
  });
});

describe('judgeArticles', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockIsTavilyAvailable.mockReset();
    delete process.env.VALIDATION_LLM_JUDGE;
    mockIsTavilyAvailable.mockReturnValue(true);
  });

  const withSources = (overrides: Partial<GeneratedArticle> = {}): GeneratedArticle =>
    makeArticle({
      title: 'Sourced Article',
      content: '本文',
      webSearchSources: [{ url: 'https://e.com', title: 'T', snippet: 's' }],
      ...overrides,
    });

  it('VALIDATION_LLM_JUDGE=false なら何もせず空を返す', async () => {
    process.env.VALIDATION_LLM_JUDGE = 'false';
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('Tavily 未設定なら何もせず空を返す', async () => {
    mockIsTavilyAvailable.mockReturnValue(false);
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('webSearchSources が無い記事はスキップする', async () => {
    const report = await judgeArticles([makeArticle({ content: '本文', webSearchSources: undefined })]);
    expect(report.skippedArticles).toBe(1);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('judge を実行し contradicted を警告化・集計する', async () => {
    mockInvoke.mockResolvedValue(
      JSON.stringify({
        claims: [
          { claim: '架空の機能', verdict: 'contradicted', confidence: 0.9, explanation: '矛盾', excerpt: 'ex' },
          { claim: '正しい説明', verdict: 'supported', confidence: 0.9, explanation: '', excerpt: '' },
        ],
      })
    );
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(1);
    expect(report.claimsByVerdict.contradicted).toBe(1);
    expect(report.claimsByVerdict.supported).toBe(1);
    // supported は警告化されない → 警告は1件（contradicted）のみ
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].type).toBe('llm-judge-contradicted');
    expect(report.warnings[0].severity).toBe('high');
  });

  it('Bedrock 呼び出しが失敗してもビルドを止めず記事はスキップ集計', async () => {
    mockInvoke.mockRejectedValue(new Error('bedrock down'));
    const report = await judgeArticles([withSources()]);
    // 実行自体は試みた（judgedArticles はカウント）が、claims は空
    expect(report.judgedArticles).toBe(1);
    expect(report.warnings).toHaveLength(0);
  });
});
