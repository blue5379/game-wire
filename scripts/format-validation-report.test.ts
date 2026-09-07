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

  it('Steam API サーキットブレーカが開いていれば（high 0 でも）error（Issue #360: 全滅検知）。非429失敗率が低くても circuitOpen 単独で error になることも検証する', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      steamApiHealth: {
        total: 20,
        succeeded: 19,
        failed: 1,
        consecutiveFailures: 5,
        circuitOpen: true,
        statusCounts: { '403': 1 },
      },
    });
    // 非429失敗率は 1/20 = 5%（10%未満）だが、circuitOpen=true 単独で error になる
    expect(computeReportStatus(report)).toBe('error');
  });

  it('steamApiHealth が計測されていて失敗0件・circuitOpen=false なら error にも warning にも昇格しない（ok）', () => {
    const report = makeReport({
      warningsBySeverity: { high: 0, medium: 0, low: 0 },
      steamApiHealth: {
        total: 10,
        succeeded: 10,
        failed: 0,
        consecutiveFailures: 0,
        circuitOpen: false,
        statusCounts: {},
      },
    });
    expect(computeReportStatus(report)).toBe('ok');
  });

  it('steamApiHealth が未計測（旧レポート）なら未計測として ok 側の判定に影響しない', () => {
    const report = makeReport({ warningsBySeverity: { high: 0, medium: 0, low: 0 } });
    expect(computeReportStatus(report)).toBe('ok');
  });

  describe('Steam API 非429失敗率・circuit-open スキップによる error/warning 昇格（Issue #360 フォローアップ）', () => {
    it('ライブ実測3回目相当（total 280 / failed 0 / statusCounts {} / rateLimitHits 0）は Steam 由来で error にも warning にも昇格しない', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 280,
          succeeded: 280,
          failed: 0,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: {},
          rateLimitHits: 0,
        },
      });
      expect(computeReportStatus(report)).toBe('ok');
    });

    it('ライブ実測2回目相当（total 295 / failed 38 / statusCounts {429:10, circuit-open:28} / rateLimitHits 30, circuitOpen false）は circuit-open スキップが1件以上あるため error（非429失敗率 28/295=9.5% は10%未満だが、circuit-open スキップの独立条件で error になる）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 295,
          succeeded: 257,
          failed: 38,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '429': 10, 'circuit-open': 28 },
          rateLimitHits: 30,
        },
      });
      expect(computeReportStatus(report)).toBe('error');
      expect(shouldFileIssue(report)).toBe(true);
    });

    it('境界値: 非429失敗率がちょうど10.0%（total 100 / 非429失敗 10、circuit-open なし）なら error', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 100,
          succeeded: 90,
          failed: 10,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '403': 10 },
        },
      });
      expect(computeReportStatus(report)).toBe('error');
    });

    it('境界値: 非429失敗率が9.9%（total 1000 / 非429失敗 99、circuit-open なし）なら warning（10%未満なので error にならない）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 1000,
          succeeded: 901,
          failed: 99,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '500': 99 },
        },
      });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('429 のみで失敗している場合（total 100 / failed 20 / statusCounts {429:20}）は失敗率20%でも warning（429 と非429の区別が効いていることのポジティブコントロール）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 100,
          succeeded: 80,
          failed: 20,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '429': 20 },
        },
      });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('total < 10 で非429失敗率が高い場合（total 5 / 非429失敗 3 = 60%）は error にならず warning（呼び出し数が少なすぎる誤検知を避ける下限）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 5,
          succeeded: 2,
          failed: 3,
          consecutiveFailures: 3,
          circuitOpen: false,
          statusCounts: { '403': 3 },
        },
      });
      expect(computeReportStatus(report)).toBe('warning');
      expect(shouldFileIssue(report)).toBe(false);
    });

    it('circuit-open スキップが1件だけでも error（statusCounts.circuit-open の件数閾値は無い）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 280,
          succeeded: 279,
          failed: 1,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { 'circuit-open': 1 },
        },
      });
      // 非429失敗率は 1/280 ≈ 0.36%（10%未満）だが、circuit-open スキップの独立条件で error になる
      expect(computeReportStatus(report)).toBe('error');
    });

    it('非429失敗率が10%未満かつ circuit-open が0件なら warning に留まる（2つのルールが独立に効いていることの確認）', () => {
      const report = makeReport({
        warningsBySeverity: { high: 0, medium: 0, low: 0 },
        steamApiHealth: {
          total: 1000,
          succeeded: 901,
          failed: 99,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '500': 99 },
        },
      });
      expect(computeReportStatus(report)).toBe('warning');
    });
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

  it('Steam API サーキットブレーカが開いていれば全滅検知のアクションを含む（Issue #360）', () => {
    const report = makeReport({
      steamApiHealth: {
        total: 20,
        succeeded: 0,
        failed: 20,
        consecutiveFailures: 5,
        circuitOpen: true,
        statusCounts: { '403': 20 },
      },
    });
    const actions = buildRecommendedActions(report);
    const action = actions.find((a) => a.includes('Steam API 全滅検知'));
    expect(action).toBeDefined();
    expect(action).toContain('5');
  });

  it('Steam API サーキットブレーカが未作動なら全滅検知のアクションは出さない', () => {
    const report = makeReport({
      steamApiHealth: {
        total: 20,
        succeeded: 20,
        failed: 0,
        consecutiveFailures: 0,
        circuitOpen: false,
        statusCounts: {},
      },
    });
    const actions = buildRecommendedActions(report);
    expect(actions.some((a) => a.includes('Steam API 全滅検知'))).toBe(false);
  });

  describe('Steam API 非429失敗率・circuit-open スキップ・429 発生時のアクション（Issue #360 フォローアップ）', () => {
    it('circuitOpen=false かつ非429失敗率が10%以上ならアクションを出す（統計内訳の確認を促す内容を含む）', () => {
      const report = makeReport({
        steamApiHealth: {
          total: 100,
          succeeded: 90,
          failed: 10,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '403': 10 },
        },
      });
      const actions = buildRecommendedActions(report);
      const action = actions.find((a) => a.includes('失敗率が高い'));
      expect(action).toBeDefined();
      expect(action).toContain('10 件 / 100 件');
      expect(action).toContain('statusCounts');
    });

    it('失敗0件なら Steam API 関連のアクションは何も出さない', () => {
      const report = makeReport({
        steamApiHealth: {
          total: 100,
          succeeded: 100,
          failed: 0,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: {},
          rateLimitHits: 0,
        },
      });
      const actions = buildRecommendedActions(report);
      expect(actions).toEqual(['✅ 対応は不要です。']);
    });

    it('429 由来の失敗（statusCounts.429 > 0）があればレート制限のアクションを出す（error にはしない情報提供）', () => {
      const report = makeReport({
        steamApiHealth: {
          total: 100,
          succeeded: 80,
          failed: 20,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '429': 20 },
          rateLimitHits: 25,
        },
      });
      const actions = buildRecommendedActions(report);
      const action = actions.find((a) => a.includes('レート制限'));
      expect(action).toBeDefined();
      expect(action).toContain('STEAM_MIN_REQUEST_INTERVAL_MS');
      // 429 のみの失敗は error 要因ではないので「全滅検知」「失敗率が高い」アクションは出ない
      expect(actions.some((a) => a.includes('全滅検知'))).toBe(false);
      expect(actions.some((a) => a.includes('失敗率が高い'))).toBe(false);
    });

    it('circuitOpen=false かつ statusCounts.circuit-open > 0 なら「作動→回復」アクションを出し、全滅検知アクションとは重複させない', () => {
      const report = makeReport({
        steamApiHealth: {
          total: 295,
          succeeded: 257,
          failed: 38,
          consecutiveFailures: 0,
          circuitOpen: false,
          statusCounts: { '429': 10, 'circuit-open': 28 },
          rateLimitHits: 30,
        },
      });
      const actions = buildRecommendedActions(report);
      const recoveryAction = actions.find((a) => a.includes('作動→回復'));
      expect(recoveryAction).toBeDefined();
      expect(recoveryAction).toContain('28');
      expect(recoveryAction).toContain('identityCheckSkipped');
      expect(actions.some((a) => a.includes('Steam API 全滅検知（サーキットブレーカ作動）'))).toBe(false);
      // 429 発生のアクションは独立して出る
      expect(actions.some((a) => a.includes('レート制限'))).toBe(true);
    });
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

  it('スキップした記事のタイトルと理由を出す（Issue #363）', () => {
    const report = makeReport({
      status: 'warning',
      llmJudge: {
        claimsByVerdict: { supported: 0, contradicted: 0, unverifiable: 0 },
        judgedArticles: 0,
        skippedArticles: 1,
        skipped: [{ articleTitle: '出典なし記事', reason: 'no webSearchSources' }],
        judgedSources: [],
        warnings: [],
      },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('事実性チェックをスキップした記事');
    expect(md).toContain('出典なし記事 — no webSearchSources');
  });

  it('記事ごとの出典件数を出し、URL 一覧は JSON を見るよう案内する（Issue #363）', () => {
    const report = makeReport({
      status: 'warning',
      llmJudge: {
        claimsByVerdict: { supported: 3, contradicted: 0, unverifiable: 0 },
        judgedArticles: 1,
        skippedArticles: 0,
        skipped: [],
        judgedSources: [
          {
            articleTitle: 'Onimusha の紹介',
            sources: [
              { index: 1, title: 'A', url: 'https://a.example/1' },
              { index: 2, title: 'B', url: 'https://b.example/2' },
            ],
          },
        ],
        warnings: [],
      },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('判定に使った出典の件数');
    expect(md).toContain('Onimusha の紹介 — 2件');
    expect(md).toContain('llmJudge.judgedSources');
    // md は Job Summary と自動起票 Issue に貼られるため URL 一覧までは載せない
    expect(md).not.toContain('https://a.example/1');
  });

  it('skipped / judgedSources が undefined の旧レポートでも落ちない', () => {
    const report = makeReport({
      status: 'warning',
      llmJudge: {
        claimsByVerdict: { supported: 1, contradicted: 0, unverifiable: 0 },
        judgedArticles: 1,
        skippedArticles: 0,
        warnings: [],
      },
    });
    const md = formatReportMarkdown(report);
    expect(md).toContain('LLM 事実性チェック');
    expect(md).not.toContain('判定に使った出典の件数');
    expect(md).not.toContain('事実性チェックをスキップした記事');
  });

  describe('Steam API 呼び出しの健全性（Issue #360 フォローアップ: circuitOpen だけでは失敗件数が読めない回帰の修正）', () => {
    it('steamApiHealth が未計測（旧レポート）なら「未計測」と表示する', () => {
      const md = formatReportMarkdown(makeReport());
      expect(md).toContain('| ❓ Steam API 呼び出し | 未計測 |');
    });

    it('失敗0件のときは ✅ で正常表示し、失敗件数の行に「0」が含まれる', () => {
      const md = formatReportMarkdown(
        makeReport({
          steamApiHealth: {
            total: 280,
            succeeded: 280,
            failed: 0,
            consecutiveFailures: 0,
            circuitOpen: false,
            statusCounts: {},
            rateLimitHits: 0,
          },
        })
      );
      expect(md).toContain('| ✅ Steam API 呼び出し | 失敗 0/280 件（0.0%） |');
      // statusCounts が空オブジェクトのときは内訳行を出さない
      expect(md).not.toContain('ステータス別内訳');
      // rateLimitHits は 0（計測済み）なので表示する
      expect(md).toContain('| ・Steam API レート制限（429）ヒット数 | 0 |');
    });

    it('失敗ありのときは件数・失敗率・statusCounts の内訳が出力に含まれる（ライブ実測2回目相当）', () => {
      const md = formatReportMarkdown(
        makeReport({
          status: 'error',
          steamApiHealth: {
            total: 295,
            succeeded: 257,
            failed: 38,
            consecutiveFailures: 0,
            circuitOpen: false,
            statusCounts: { '429': 10, 'circuit-open': 28 },
            rateLimitHits: 30,
          },
        })
      );
      expect(md).toContain('38/295');
      expect(md).toContain('circuit-open: 28');
      expect(md).toContain('429: 10');
      expect(md).toContain('| ・Steam API レート制限（429）ヒット数 | 30 |');
      // ラン中作動→終了時回復のケースなので 🚨 表示になる
      expect(md).toContain('🚨 Steam API 呼び出し');
      expect(md).toContain('作動→終了時は回復');
    });

    it('circuitOpen=true なら 🚨 で明示し、連続失敗件数を含む', () => {
      const md = formatReportMarkdown(
        makeReport({
          status: 'error',
          steamApiHealth: {
            total: 20,
            succeeded: 0,
            failed: 20,
            consecutiveFailures: 5,
            circuitOpen: true,
            statusCounts: { '403': 20 },
          },
        })
      );
      expect(md).toContain('🚨 Steam API 呼び出し');
      expect(md).toContain('サーキット作動中');
      expect(md).toContain('連続失敗 5 件');
      expect(md).toContain('20/20');
    });

    it('rateLimitHits が undefined（旧スナップショット）のときはレート制限ヒット数の行を出さない', () => {
      const md = formatReportMarkdown(
        makeReport({
          steamApiHealth: {
            total: 100,
            succeeded: 90,
            failed: 10,
            consecutiveFailures: 0,
            circuitOpen: false,
            statusCounts: { '403': 10 },
            // rateLimitHits は意図的に省略（旧スナップショットの再現）
          },
        })
      );
      expect(md).not.toContain('レート制限（429）ヒット数');
    });
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
