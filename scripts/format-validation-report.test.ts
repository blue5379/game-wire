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
  searchFailureCount,
  pageContentFailureCount,
  adultScreeningFailureCount,
  articleCountShortfallCount,
  earlyAccessStatementIssueCount,
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

  it('キーワード検索失敗があれば（high 0 でも）error（Issue #349: pageContentFailures は除く）', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      webSearchStats: { searchFailures: 1, pageContentFailures: 0 },
    });
    expect(computeReportStatus(report)).toBe('error');
  });

  it('AI成人向けスクリーニング失敗があれば（high 0・Web検索失敗 0 でも）error（Issue #222、Web検索失敗と同じ扱い）', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      webSearchStats: { searchFailures: 0, pageContentFailures: 0, adultScreeningFailures: 1 },
    });
    expect(computeReportStatus(report)).toBe('error');
  });

  it('webSearchStats に adultScreeningFailures が無い（旧キャッシュ）場合は未計測として ok 側の判定に影響しない', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      webSearchStats: { searchFailures: 0, pageContentFailures: 0 },
    });
    expect(computeReportStatus(report)).toBe('ok');
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

  it('adultScreeningFailures は合算しない（意味が異なるため・Issue #222）', () => {
    const report = makeReport({
      webSearchStats: { searchFailures: 1, pageContentFailures: 1, adultScreeningFailures: 10 },
    });
    expect(webSearchFailureCount(report)).toBe(2);
  });
});

describe('searchFailureCount / pageContentFailureCount の分離（Issue #349）', () => {
  describe('searchFailureCount', () => {
    it('webSearchStats が無ければ 0', () => {
      expect(searchFailureCount(makeReport())).toBe(0);
    });

    it('searchFailures をそのまま返す（pageContentFailures とは独立）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 3, pageContentFailures: 5 },
      });
      expect(searchFailureCount(report)).toBe(3);
    });

    it('searchFailures が 0 なら 0（境界値）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 0, pageContentFailures: 2 },
      });
      expect(searchFailureCount(report)).toBe(0);
    });

    it('searchFailures が 1 なら 1（境界値）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 1, pageContentFailures: 0 },
      });
      expect(searchFailureCount(report)).toBe(1);
    });
  });

  describe('pageContentFailureCount', () => {
    it('webSearchStats が無ければ 0', () => {
      expect(pageContentFailureCount(makeReport())).toBe(0);
    });

    it('pageContentFailures をそのまま返す（searchFailures とは独立）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 5, pageContentFailures: 3 },
      });
      expect(pageContentFailureCount(report)).toBe(3);
    });

    it('pageContentFailures が 0 なら 0（境界値）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 2, pageContentFailures: 0 },
      });
      expect(pageContentFailureCount(report)).toBe(0);
    });

    it('pageContentFailures が 1 なら 1（境界値）', () => {
      const report = makeReport({
        webSearchStats: { searchFailures: 0, pageContentFailures: 1 },
      });
      expect(pageContentFailureCount(report)).toBe(1);
    });
  });

  describe('computeReportStatus — searchFailures は error / pageContentFailures は warning（Issue #349）', () => {
    it('searchFailures: 1、他は clean → error', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 1, pageContentFailures: 0 },
      });
      expect(computeReportStatus(report)).toBe('error');
      expect(shouldFileIssue(report)).toBe(true);
    });

    it('pageContentFailures: 1、他は clean → warning（これが本 Issue で修正する回帰）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 0, pageContentFailures: 1 },
      });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('pageContentFailures: 0 かつ searchFailures: 0 かつ他の trigger なし → ok', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 0, pageContentFailures: 0 },
      });
      expect(computeReportStatus(report)).toBe('ok');
    });

    it('pageContentFailures: 3 と high: 1 併存 → error（high が支配。変更が high を弱めていないことの証明）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 1, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 0, pageContentFailures: 3 },
      });
      expect(computeReportStatus(report)).toBe('error');
    });

    it('webSearchStats 完全に不在（旧キャッシュ） → ok（これらのカウンタで昇格しない）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
      });
      delete report.webSearchStats;
      expect(computeReportStatus(report)).toBe('ok');
    });

    it('searchFailures と pageContentFailures が両方あっても error（searchFailures が理由）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 1, pageContentFailures: 2 },
      });
      expect(computeReportStatus(report)).toBe('error');
    });

    it('本日の本番実測（run 31792016284）相当: pageContentFailures のみ 2 件 → warning', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 0, pageContentFailures: 2 },
      });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('dev-024 相当: pageContentFailures 3 件のみ → warning', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        webSearchStats: { searchFailures: 0, pageContentFailures: 3 },
      });
      expect(computeReportStatus(report)).toBe('warning');
    });
  });
});

describe('adultScreeningFailureCount (Issue #222)', () => {
  it('webSearchStats が無ければ 0', () => {
    expect(adultScreeningFailureCount(makeReport())).toBe(0);
  });

  it('webSearchStats はあるが adultScreeningFailures が無い（旧キャッシュ）場合も 0', () => {
    const report = makeReport({ webSearchStats: { searchFailures: 0, pageContentFailures: 0 } });
    expect(adultScreeningFailureCount(report)).toBe(0);
  });

  it('adultScreeningFailures をそのまま返す（Web検索失敗の値とは独立）', () => {
    const report = makeReport({
      webSearchStats: { searchFailures: 5, pageContentFailures: 5, adultScreeningFailures: 3 },
    });
    expect(adultScreeningFailureCount(report)).toBe(3);
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

  it('キーワード検索失敗と公式ページ本文取得失敗を別のアクションとして出す（Issue #349）', () => {
    const report = makeReport({ webSearchStats: { searchFailures: 1, pageContentFailures: 1 } });
    const actions = buildRecommendedActions(report);
    // 合算した「Web 検索失敗 2 件」ではなく、必要な対処が違う 2 件として出る
    expect(actions.some((a) => a.includes('キーワード検索の失敗 1 件'))).toBe(true);
    expect(actions.some((a) => a.includes('公式ページ本文の取得失敗 1 件'))).toBe(true);
    expect(actions.some((a) => a.includes('Web 検索失敗 2 件'))).toBe(false);
  });

  it('公式ページ本文取得失敗だけの号でも、検索失敗のアクションは出さない（Issue #349）', () => {
    const report = makeReport({ webSearchStats: { searchFailures: 0, pageContentFailures: 2 } });
    const actions = buildRecommendedActions(report);
    expect(actions.some((a) => a.includes('公式ページ本文の取得失敗 2 件'))).toBe(true);
    expect(actions.some((a) => a.includes('キーワード検索の失敗'))).toBe(false);
  });

  it('AI成人向けスクリーニング失敗があれば手動確認のアクションを含む（Issue #222）', () => {
    const report = makeReport({
      webSearchStats: { searchFailures: 0, pageContentFailures: 0, adultScreeningFailures: 2 },
    });
    const actions = buildRecommendedActions(report);
    const action = actions.find((a) => a.includes('AI成人向けスクリーニング失敗 2 件'));
    expect(action).toBeDefined();
    expect(action).toContain('成人向け');
  });

  it('adultScreeningFailures が 0 ならAI成人向けスクリーニングのアクションを含まない', () => {
    const report = makeReport({
      webSearchStats: { searchFailures: 0, pageContentFailures: 0, adultScreeningFailures: 0 },
    });
    const actions = buildRecommendedActions(report);
    expect(actions.some((a) => a.includes('AI成人向けスクリーニング'))).toBe(false);
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

  it('AI成人向けスクリーニング失敗があればサマリ表に件数を表示する（Issue #222）', () => {
    const report = makeReport({
      status: 'error',
      webSearchStats: { searchFailures: 0, pageContentFailures: 0, adultScreeningFailures: 3 },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('| ⚠️ AI成人向けスクリーニング失敗（fail-open） | 3 |');
  });

  it('adultScreeningFailures が 0 ならサマリ表は正常系（✅ 0件）表示になる', () => {
    const report = makeReport({
      status: 'ok',
      webSearchStats: { searchFailures: 0, pageContentFailures: 0, adultScreeningFailures: 0 },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('| ✅ AI成人向けスクリーニング失敗 | 0 |');
    expect(md).not.toContain('⚠️ AI成人向けスクリーニング失敗');
  });

  it('webSearchStats が undefined（旧キャッシュ）でも例外を投げない。Web検索失敗もAI成人向けスクリーニング失敗も未計測として表示する（Issue #222 code review / #349）', () => {
    const report = makeReport({ status: 'ok' });
    delete report.webSearchStats;
    expect(() => formatReportMarkdown(report)).not.toThrow();
    const md = formatReportMarkdown(report);
    // Issue #349: 検索失敗も「未計測」と「計測して0件」を区別する（旧実装は 0 件と断定していた）
    expect(md).toContain('| ❓ Web検索失敗（キーワード） | 未計測 |');
    expect(md).toContain('| ❓ Web検索失敗（ページ取得） | 未計測 |');
    expect(md).not.toContain('| ✅ Web検索失敗（キーワード） | 0 |');
    // AI成人向けスクリーニング失敗は「未計測」であり「0件」と断定してはならない
    expect(md).toContain('| ❓ AI成人向けスクリーニング失敗 | 未計測 |');
    expect(md).not.toContain('| ✅ AI成人向けスクリーニング失敗 | 0 |');
    expect(md).not.toContain('⚠️ AI成人向けスクリーニング失敗');
  });

  // 修正1（Issue #222 code review）: markdown は「未計測」と「計測して0件」を区別する。
  // 実在する未計測経路: validate-existing-issue.ts が webSearchStats=undefined を渡すケース、
  // および旧 generated-articles.json（本フィールド追加前）を build-issue が読むケース。
  describe('AI成人向けスクリーニング失敗 — 未計測/0件/N件の3分岐（Issue #222 code review 修正1）', () => {
    it('webSearchStats はあるが adultScreeningFailures フィールドが無い（旧キャッシュ）場合は「未計測」と表示し、「0」とは表示しない', () => {
      const report = makeReport({
        status: 'ok',
        webSearchStats: { searchFailures: 0, pageContentFailures: 0 },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ❓ AI成人向けスクリーニング失敗 | 未計測 |');
      expect(md).not.toContain('| ✅ AI成人向けスクリーニング失敗 | 0 |');
      expect(md).not.toContain('⚠️ AI成人向けスクリーニング失敗');
    });

    it('adultScreeningFailures が 0（計測済み）の場合は「AI成人向けスクリーニング失敗」行に「0」と表示し、「未計測」とは表示しない', () => {
      const report = makeReport({
        status: 'ok',
        // unrecognizedScreeningResponses も明示的に 0 を渡し、AI成人向けスクリーニング失敗の行だけを
        // 検証できるようにする（この項目自体が別途「未計測」を出しうるため）
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          adultScreeningFailures: 0,
          unrecognizedScreeningResponses: 0,
        },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ✅ AI成人向けスクリーニング失敗 | 0 |');
      expect(md).not.toContain('| ❓ AI成人向けスクリーニング失敗 | 未計測 |');
    });

    it('adultScreeningFailures が 3件（計測済み）の場合は件数を表示し、「未計測」とは表示しない', () => {
      const report = makeReport({
        status: 'error',
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          adultScreeningFailures: 3,
          unrecognizedScreeningResponses: 0,
        },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ⚠️ AI成人向けスクリーニング失敗（fail-open） | 3 |');
      expect(md).not.toContain('| ❓ AI成人向けスクリーニング失敗 | 未計測 |');
      expect(md).not.toContain('| ✅ AI成人向けスクリーニング失敗 | 0 |');
    });
  });

  // 修正3（Issue #222 code review）: 応答形式不正（YES/NO以外）カウンタのサマリ表・推奨アクション表示。
  describe('AI成人向けスクリーニング応答形式不正 — サマリ表・推奨アクション（Issue #222 code review 修正3）', () => {
    it('unrecognizedScreeningResponses が無い（未計測）場合は「未計測」と表示する', () => {
      const report = makeReport({
        status: 'ok',
        webSearchStats: { searchFailures: 0, pageContentFailures: 0 },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ❓ AI成人向けスクリーニング応答形式不正 | 未計測 |');
    });

    it('unrecognizedScreeningResponses が 0（計測済み）の場合は「0」と表示する', () => {
      const report = makeReport({
        status: 'ok',
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          unrecognizedScreeningResponses: 0,
        },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ✅ AI成人向けスクリーニング応答形式不正 | 0 |');
    });

    it('unrecognizedScreeningResponses が2件ある場合はサマリ表に件数を表示し、推奨アクションにも含める', () => {
      const report = makeReport({
        status: 'ok', // 昇格させない仕様のピン留め（ok のままでも表示自体はされること）
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          unrecognizedScreeningResponses: 2,
        },
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| ⚠️ AI成人向けスクリーニング応答形式不正 | 2 |');

      const actions = buildRecommendedActions(report);
      const action = actions.find((a) => a.includes('応答形式不正 2 件'));
      expect(action).toBeDefined();
    });

    it('unrecognizedScreeningResponses が 0 なら推奨アクションに応答形式不正の項目を含めない', () => {
      const report = makeReport({
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          unrecognizedScreeningResponses: 0,
        },
      });
      const actions = buildRecommendedActions(report);
      expect(actions.some((a) => a.includes('応答形式不正'))).toBe(false);
    });
  });

  // 重要な仕様固定（Issue #222 code review 修正3）: unrecognizedScreeningResponses は
  // 観測目的のカウンタであり、実際のBedrock応答形式の頻度が未検証のため、
  // 誤起票リスクを避けて computeReportStatus には含めない（error に昇格させない）。
  describe('unrecognizedScreeningResponses は computeReportStatus を error に昇格させない（Issue #222 code review 修正3・重要仕様）', () => {
    it('unrecognizedScreeningResponses > 0 でも他に問題が無ければ status は ok のまま', () => {
      const report = makeReport({
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          adultScreeningFailures: 0,
          unrecognizedScreeningResponses: 5,
        },
      });
      expect(computeReportStatus(report)).toBe('ok');
    });

    it('unrecognizedScreeningResponses がどれだけ多くても（1000件）status は ok のまま', () => {
      const report = makeReport({
        webSearchStats: {
          searchFailures: 0,
          pageContentFailures: 0,
          adultScreeningFailures: 0,
          unrecognizedScreeningResponses: 1000,
        },
      });
      expect(computeReportStatus(report)).toBe('ok');
    });
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

describe('記事本数の不足（Issue #311。仕様 §6.4 / §6.5）', () => {
  const shortfall = (
    category: 'newRelease' | 'indie' | 'feature' | 'classic',
    expected: number,
    actual: number
  ) => ({ category, expected, actual });

  describe('articleCountShortfallCount', () => {
    it('不足したカテゴリ数を返す（不足本数の合計ではない）', () => {
      const report = makeReport({
        articleCountShortfalls: [shortfall('newRelease', 2, 0), shortfall('classic', 1, 0)],
      });
      // 不足本数の合計は 3 本だが、返すのはカテゴリ数の 2
      expect(articleCountShortfallCount(report)).toBe(2);
    });

    it('空配列なら 0', () => {
      expect(articleCountShortfallCount(makeReport({ articleCountShortfalls: [] }))).toBe(0);
    });

    it('undefined（本フィールド追加前の旧レポート）は未計測として 0 扱い', () => {
      expect(articleCountShortfallCount(makeReport())).toBe(0);
    });
  });

  describe('computeReportStatus', () => {
    it('本数不足があれば（high 0・Web検索失敗 0・成人向け失敗 0 でも）error', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        articleCountShortfalls: [shortfall('newRelease', 2, 0)],
      });
      expect(computeReportStatus(report)).toBe('error');
      expect(shouldFileIssue(report)).toBe(true);
    });

    it('vol.019 の実データ相当（high 0 / medium 1 / 新作0本）は warning ではなく error になる', () => {
      // 修正前は high=0 のため warning に落ち、Issue が自動起票されなかった
      const report = makeReport({
        totalArticles: 4,
        warningsBySeverity: { high: 0, medium: 1, low: 0 },
        articleCountShortfalls: [shortfall('newRelease', 2, 0)],
      });
      expect(computeReportStatus(report)).toBe('error');
    });

    it('本数不足が空配列（計測して不足なし）なら判定に影響しない', () => {
      const report = makeReport({ articleCountShortfalls: [] });
      expect(computeReportStatus(report)).toBe('ok');
    });

    it('articleCountShortfalls が無い旧レポートは未計測として ok 側の判定に影響しない', () => {
      expect(computeReportStatus(makeReport())).toBe('ok');
    });
  });

  describe('buildRecommendedActions', () => {
    it('不足したカテゴリ名と掲載/期待本数を内訳付きで示す', () => {
      const actions = buildRecommendedActions(
        makeReport({ articleCountShortfalls: [shortfall('newRelease', 2, 0), shortfall('classic', 1, 0)] })
      );
      const line = actions.find((a) => a.includes('記事本数の不足'));
      expect(line).toBeDefined();
      expect(line).toContain('2 カテゴリ');
      expect(line).toContain('新作紹介 0/2本');
      expect(line).toContain('名作深掘り 0/1本');
    });

    it('不足が無ければ本数の行を出さない（0件でも「対応は不要です」に落ちる）', () => {
      const actions = buildRecommendedActions(makeReport({ articleCountShortfalls: [] }));
      expect(actions.some((a) => a.includes('記事本数の不足'))).toBe(false);
      expect(actions).toEqual(['✅ 対応は不要です。']);
    });
  });

  describe('formatReportMarkdown', () => {
    it('不足カテゴリ数のサマリ行と内訳テーブルを出す', () => {
      const md = formatReportMarkdown(
        makeReport({
          status: 'error',
          totalArticles: 4,
          articleCountShortfalls: [shortfall('newRelease', 2, 0)],
        })
      );
      expect(md).toContain('| 📉 記事本数の不足（カテゴリ数） | 1 |');
      expect(md).toContain('### 📉 記事本数が不足したカテゴリ（1件）');
      expect(md).toContain('| 新作紹介 | 0 | 2 |');
      expect(md).toContain('hidden');
    });

    it('計測して不足0件のときは 0 と表示し、内訳テーブルは出さない', () => {
      const md = formatReportMarkdown(makeReport({ articleCountShortfalls: [] }));
      expect(md).toContain('| ✅ 記事本数の不足 | 0 |');
      expect(md).not.toContain('記事本数が不足したカテゴリ');
    });

    it('旧レポート（undefined）は「未計測」と表示して 0 件と区別する', () => {
      const md = formatReportMarkdown(makeReport());
      expect(md).toContain('| ❓ 記事本数の不足 | 未計測 |');
      expect(md).not.toContain('| ✅ 記事本数の不足 | 0 |');
    });
  });
});

describe('早期アクセスの表記（Issue #26。仕様 §2.9）', () => {
  const eaIssue = (overrides: Partial<{ type: string; articleTitle: string }> = {}) => ({
    articleTitle: overrides.articleTitle ?? '『ARK: Survival Ascended』発売中',
    category: 'indie' as const,
    gameTitle: 'ARK: Survival Ascended',
    type: (overrides.type ?? 'early-access-unstated') as
      | 'early-access-unstated'
      | 'early-access-release-claim',
    message: '早期アクセス配信中のタイトルですが、記載がありません。',
  });

  describe('earlyAccessStatementIssueCount', () => {
    it('件数を返す', () => {
      const report = makeReport({
        earlyAccessStatementIssues: [eaIssue(), eaIssue({ type: 'early-access-release-claim' })],
      });
      expect(earlyAccessStatementIssueCount(report)).toBe(2);
    });

    it('空配列なら 0', () => {
      expect(earlyAccessStatementIssueCount(makeReport({ earlyAccessStatementIssues: [] }))).toBe(0);
    });

    it('undefined（本フィールド追加前の旧レポート）は未計測として 0 扱い', () => {
      expect(earlyAccessStatementIssueCount(makeReport())).toBe(0);
    });
  });

  describe('computeReportStatus — warning 止まりで error に昇格させない（重要仕様）', () => {
    it('早期アクセスの表記問題だけがある場合は warning（Issue 自動起票の条件を満たさない）', () => {
      const report = makeReport({ earlyAccessStatementIssues: [eaIssue()] });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('0 件なら status を押し上げない（ok のまま）', () => {
      expect(computeReportStatus(makeReport({ earlyAccessStatementIssues: [] }))).toBe('ok');
    });

    it('他に error 要因があれば error のまま（判定を弱めない）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 1, medium: 0, low: 0 },
        earlyAccessStatementIssues: [eaIssue()],
      });
      expect(computeReportStatus(report)).toBe('error');
    });
  });

  describe('formatReportMarkdown / buildRecommendedActions', () => {
    it('サマリ表に件数が出て、対応すべきことに内訳（記載漏れ / 断定）が出る', () => {
      const report = makeReport({
        earlyAccessStatementIssues: [
          eaIssue(),
          eaIssue({ type: 'early-access-release-claim' }),
          eaIssue({ type: 'early-access-release-claim' }),
        ],
      });
      const md = formatReportMarkdown(report);
      expect(md).toContain('| 🧪 早期アクセスの表記 | 3 |');
      expect(md).toContain('記載漏れ 1 件 / 正式リリース済みと読める断定 2 件');
      expect(md).toContain('### 🧪 早期アクセスの表記に問題がある記事（3件）');
      expect(md).toContain('ARK: Survival Ascended');
    });

    it('0 件のときは「✅ 早期アクセスの表記 | 0」を出し、詳細節は出さない', () => {
      const md = formatReportMarkdown(makeReport({ earlyAccessStatementIssues: [] }));
      expect(md).toContain('| ✅ 早期アクセスの表記 | 0 |');
      expect(md).not.toContain('### 🧪 早期アクセスの表記に問題がある記事');
    });

    it('undefined（旧レポート）のときは「未計測」と表示する（0 件と区別する）', () => {
      const md = formatReportMarkdown(makeReport());
      expect(md).toContain('| ❓ 早期アクセスの表記 | 未計測 |');
    });
  });
});
