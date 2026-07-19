/**
 * format-validation-report のユニットテスト（Issue #202）
 *
 * 総合ステータス算出・起票判定・Markdown 整形の振る舞いを検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  computeReportStatus,
  shouldFileIssue,
  buildRecommendedActions,
  formatReportMarkdown,
  webSearchFailureCount,
} from './format-validation-report.js';
import type { ValidationReport, ValidationWarning } from './validate-article.js';

function makeReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    issueNumber: 16,
    generatedAt: '2026-07-19T00:00:00.000Z',
    totalArticles: 6,
    totalWarnings: 0,
    warningsBySeverity: { high: 0, medium: 0, low: 0 },
    warnings: [],
    ...overrides,
  };
}

function makeWarning(overrides: Partial<ValidationWarning> = {}): ValidationWarning {
  return {
    articleTitle: 'テスト記事',
    category: 'newRelease',
    severity: 'high',
    type: 'numeric-user-count',
    message: 'ソース不明の数値です',
    ...overrides,
  };
}

describe('computeReportStatus', () => {
  it('high 警告が1件以上なら error', () => {
    const report = makeReport({ warningsBySeverity: { high: 1, medium: 0, low: 0 } });
    expect(computeReportStatus(report)).toBe('error');
  });

  it('Web 検索失敗があれば（high 0 でも）error', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      webSearchStats: { searchFailures: 0, pageContentFailures: 2 },
    });
    expect(computeReportStatus(report)).toBe('error');
  });

  it('medium 警告のみなら warning', () => {
    const report = makeReport({ warningsBySeverity: { high: 0, medium: 3, low: 0 } });
    expect(computeReportStatus(report)).toBe('warning');
  });

  it('公式URL未取得のみなら warning', () => {
    const report = makeReport({
      missingOfficialUrls: [{ articleTitle: 'A', category: 'newRelease', gameTitle: 'Game A' }],
    });
    expect(computeReportStatus(report)).toBe('warning');
  });

  it('LLM judge の矛盾があれば warning', () => {
    const report = makeReport({
      llmJudge: {
        claimsByVerdict: { supported: 5, contradicted: 1, unverifiable: 0 },
        judgedArticles: 3,
        skippedArticles: 0,
        warnings: [],
      },
    });
    expect(computeReportStatus(report)).toBe('warning');
  });

  it('警告も失敗も無ければ ok', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      webSearchStats: { searchFailures: 0, pageContentFailures: 0 },
    });
    expect(computeReportStatus(report)).toBe('ok');
  });

  it('low 警告のみでは ok（対応不要）', () => {
    const report = makeReport({ warningsBySeverity: { high: 0, medium: 0, low: 5 } });
    expect(computeReportStatus(report)).toBe('ok');
  });

  it('error の条件が warning の条件より優先される（high と medium 併存）', () => {
    const report = makeReport({ warningsBySeverity: { high: 2, medium: 3, low: 1 } });
    expect(computeReportStatus(report)).toBe('error');
  });
});

describe('shouldFileIssue', () => {
  it('error の号は起票対象', () => {
    expect(shouldFileIssue(makeReport({ warningsBySeverity: { high: 1, medium: 0, low: 0 } }))).toBe(
      true
    );
  });

  it('warning の号は起票しない', () => {
    expect(shouldFileIssue(makeReport({ warningsBySeverity: { high: 0, medium: 2, low: 0 } }))).toBe(
      false
    );
  });

  it('ok の号は起票しない', () => {
    expect(shouldFileIssue(makeReport())).toBe(false);
  });
});

describe('webSearchFailureCount', () => {
  it('webSearchStats が無ければ 0', () => {
    expect(webSearchFailureCount(makeReport())).toBe(0);
  });

  it('キーワード失敗とページ取得失敗を合算する', () => {
    const report = makeReport({ webSearchStats: { searchFailures: 3, pageContentFailures: 2 } });
    expect(webSearchFailureCount(report)).toBe(5);
  });
});

describe('buildRecommendedActions', () => {
  it('問題が無ければ「対応は不要」', () => {
    const actions = buildRecommendedActions(makeReport());
    expect(actions).toHaveLength(1);
    expect(actions[0]).toContain('対応は不要');
  });

  it('high 警告があれば修正アクションと件数を含む', () => {
    const report = makeReport({ warningsBySeverity: { high: 2, medium: 0, low: 0 } });
    const actions = buildRecommendedActions(report);
    const highAction = actions.find((a) => a.includes('HIGH 警告 2 件'));
    expect(highAction).toBeDefined();
    expect(highAction).toContain('修正');
  });

  it('Web 検索失敗があればファクトチェックのアクションを含む', () => {
    const report = makeReport({ webSearchStats: { searchFailures: 1, pageContentFailures: 1 } });
    const actions = buildRecommendedActions(report);
    expect(actions.some((a) => a.includes('Web 検索失敗 2 件'))).toBe(true);
  });

  it('複数種類の問題があれば複数のアクションを列挙する', () => {
    const report = makeReport({
      warningsBySeverity: { high: 1, medium: 2, low: 0 },
      missingOfficialUrls: [{ articleTitle: 'A', category: 'newRelease', gameTitle: 'Game A' }],
    });
    const actions = buildRecommendedActions(report);
    // high / medium / 公式URL の 3 アクション
    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(actions.some((a) => a.includes('HIGH'))).toBe(true);
    expect(actions.some((a) => a.includes('MEDIUM'))).toBe(true);
    expect(actions.some((a) => a.includes('公式URL'))).toBe(true);
  });
});

describe('formatReportMarkdown', () => {
  it('error レポートは 🔴 見出しと対応事項を含む', () => {
    const report = makeReport({
      status: 'error',
      totalWarnings: 1,
      warningsBySeverity: { high: 1, medium: 0, low: 0 },
      warnings: [makeWarning()],
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('🔴');
    expect(md).toContain('第16号');
    expect(md).toContain('要対応');
    expect(md).toContain('### 対応すべきこと');
    expect(md).toContain('HIGH 警告 1 件');
    // 警告詳細
    expect(md).toContain('テスト記事');
    expect(md).toContain('ソース不明の数値です');
    // 根拠なしの明示
    expect(md).toContain('捏造の可能性あり');
  });

  it('ok レポートは 🟢 見出しと「対応は不要」を含む', () => {
    const report = makeReport({ status: 'ok' });
    const md = formatReportMarkdown(report);
    expect(md).toContain('🟢');
    expect(md).toContain('対応不要');
    expect(md).toContain('対応は不要');
  });

  it('status 未設定でも算出して整形する', () => {
    const report = makeReport({ warningsBySeverity: { high: 0, medium: 1, low: 0 } });
    delete report.status;
    const md = formatReportMarkdown(report);
    expect(md).toContain('🟡');
    expect(md).toContain('要確認');
  });

  it('sourcedFrom がある警告は根拠リンクを表示する', () => {
    const report = makeReport({
      status: 'error',
      totalWarnings: 1,
      warningsBySeverity: { high: 1, medium: 0, low: 0 },
      warnings: [
        makeWarning({
          sourcedFrom: {
            url: 'https://example.com/src',
            title: 'ソース記事',
            snippet: '該当する記述',
          },
        }),
      ],
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('検索結果に根拠あり');
    expect(md).toContain('https://example.com/src');
    expect(md).not.toContain('捏造の可能性あり');
  });

  it('LLM judge の集計を表に含める', () => {
    const report = makeReport({
      status: 'warning',
      llmJudge: {
        claimsByVerdict: { supported: 10, contradicted: 1, unverifiable: 2 },
        judgedArticles: 4,
        skippedArticles: 1,
        warnings: [],
      },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('LLM 事実性チェック');
    expect(md).toContain('| ❌ 矛盾 | 1 |');
    expect(md).toContain('| ❓ 裏付け不能 | 2 |');
  });
});
