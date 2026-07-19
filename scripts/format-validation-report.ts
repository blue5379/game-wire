/**
 * Validation レポートの整形（Issue #202）
 *
 * 2つの観点でレポートを扱う:
 *  1. 人間（運用者）向け: 「対応が必要か」「何をすべきか」がひと目で分かる Markdown サマリ
 *  2. 自動起票判定: 総合ステータス（ok/warning/error）を機械的に算出
 *
 * 総合ステータスの定義:
 *  - error   (🔴 要対応):   high 警告が1件以上、または Web 検索失敗がある
 *  - warning (🟡 要確認):   error ではないが、medium 警告・公式URL未取得・
 *                           LLM judge の矛盾/裏付け不能のいずれかがある
 *  - ok      (🟢 対応不要): 上記いずれも無い
 *
 * error の定義は「Issue 自動起票の条件」と一致させている（起票される号は必ず 🔴）。
 */

import type { ValidationReport, ValidationWarning } from './validate-article.js';

export type ReportStatus = 'ok' | 'warning' | 'error';

/** Web 検索の失敗総数（キーワード検索失敗 + ページ取得失敗） */
export function webSearchFailureCount(report: ValidationReport): number {
  const s = report.webSearchStats;
  if (!s) return 0;
  return s.searchFailures + s.pageContentFailures;
}

/** LLM judge が矛盾・裏付け不能と判定した claim の総数 */
function judgeProblemCount(report: ValidationReport): number {
  const j = report.llmJudge;
  if (!j) return 0;
  return j.claimsByVerdict.contradicted + j.claimsByVerdict.unverifiable;
}

/**
 * レポートから総合ステータスを算出する。
 */
export function computeReportStatus(report: ValidationReport): ReportStatus {
  const high = report.warningsBySeverity.high;
  if (high > 0 || webSearchFailureCount(report) > 0) {
    return 'error';
  }

  const medium = report.warningsBySeverity.medium;
  const missingUrls = report.missingOfficialUrls?.length ?? 0;
  if (medium > 0 || missingUrls > 0 || judgeProblemCount(report) > 0) {
    return 'warning';
  }

  return 'ok';
}

/**
 * この号について Issue を自動起票すべきか。
 * 条件: high 警告が1件以上、または Web 検索失敗がある（= 総合ステータスが error）。
 */
export function shouldFileIssue(report: ValidationReport): boolean {
  return computeReportStatus(report) === 'error';
}

const STATUS_META: Record<ReportStatus, { icon: string; label: string }> = {
  ok: { icon: '🟢', label: '対応不要' },
  warning: { icon: '🟡', label: '要確認' },
  error: { icon: '🔴', label: '要対応' },
};

/**
 * 運用者が「次に何をすべきか」の箇条書きを組み立てる。
 * 検出内容に応じて具体的なアクションだけを列挙する。
 */
export function buildRecommendedActions(report: ValidationReport): string[] {
  const actions: string[] = [];
  const high = report.warningsBySeverity.high;
  const medium = report.warningsBySeverity.medium;
  const webFail = webSearchFailureCount(report);
  const missingUrls = report.missingOfficialUrls?.length ?? 0;
  const contradicted = report.llmJudge?.claimsByVerdict.contradicted ?? 0;
  const unverifiable = report.llmJudge?.claimsByVerdict.unverifiable ?? 0;

  if (high > 0) {
    actions.push(
      `🔴 **HIGH 警告 ${high} 件**: 該当記事の本文を確認し、事実誤り・ハルシネーションを修正してください。`
    );
  }
  if (webFail > 0) {
    actions.push(
      `⚠️ **Web 検索失敗 ${webFail} 件**: 一部の主張が根拠未確認のまま生成されています。手動でファクトチェックしてください。`
    );
  }
  if (contradicted > 0) {
    actions.push(
      `❌ **LLM 事実性チェックで矛盾 ${contradicted} 件**: 検索結果と矛盾する記述です。該当箇所を確認・修正してください。`
    );
  }
  if (missingUrls > 0) {
    actions.push(
      `🔗 **公式URL未取得 ${missingUrls} 件**: 該当記事に公式URLを手動で補完してください。`
    );
  }
  if (medium > 0) {
    actions.push(
      `🟡 **MEDIUM 警告 ${medium} 件**: 軽微な指摘です。余裕があれば内容を確認してください。`
    );
  }
  if (unverifiable > 0) {
    actions.push(
      `❓ **LLM 事実性チェックで裏付け不能 ${unverifiable} 件**: 参考情報です。必要に応じて確認してください。`
    );
  }

  if (actions.length === 0) {
    actions.push('✅ 対応は不要です。');
  }
  return actions;
}

/** 1件の警告を Markdown ブロックに整形する（根拠の有無も明示） */
function formatWarningBlock(w: ValidationWarning): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push(`**[${w.severity.toUpperCase()}] ${w.type}**  `);
  lines.push(`記事: ${w.articleTitle}  `);
  lines.push(`内容: ${w.message}  `);
  if (w.context) {
    lines.push(`> ${w.context}`);
  }
  if (w.sourcedFrom) {
    lines.push(
      `🔗 **検索結果に根拠あり（捏造ではない可能性）**: [${w.sourcedFrom.title}](${w.sourcedFrom.url})  `
    );
    lines.push(`> ${w.sourcedFrom.snippet}`);
  } else {
    lines.push('⚠️ **検索結果に根拠なし（捏造の可能性あり）**');
  }
  return lines.join('\n');
}

/**
 * レポートを人間向けの Markdown サマリに整形する。
 * GitHub Step Summary・リポジトリ保存用 .md・Issue 本文で共通利用する。
 */
export function formatReportMarkdown(report: ValidationReport): string {
  const status = report.status ?? computeReportStatus(report);
  const meta = STATUS_META[status];
  const out: string[] = [];

  // 見出し（総合ステータス）
  out.push(`## ${meta.icon} Article Validation Report（第${report.issueNumber}号） — ${meta.label}`);
  out.push('');

  // 何をすべきか（最重要。冒頭に置く）
  out.push('### 対応すべきこと');
  out.push('');
  for (const a of buildRecommendedActions(report)) {
    out.push(`- ${a}`);
  }
  out.push('');

  // 件数サマリ
  const webFail = webSearchFailureCount(report);
  out.push('### サマリ');
  out.push('');
  out.push('| 項目 | 件数 |');
  out.push('|------|------|');
  out.push(`| 記事数 | ${report.totalArticles} |`);
  out.push(`| 警告合計 | ${report.totalWarnings} |`);
  out.push(`| 🔴 HIGH | ${report.warningsBySeverity.high} |`);
  out.push(`| 🟡 MEDIUM | ${report.warningsBySeverity.medium} |`);
  out.push(`| 🟢 LOW | ${report.warningsBySeverity.low} |`);
  if (webFail > 0) {
    out.push(`| ⚠️ Web検索失敗（キーワード） | ${report.webSearchStats?.searchFailures ?? 0} |`);
    out.push(`| ⚠️ Web検索失敗（ページ取得） | ${report.webSearchStats?.pageContentFailures ?? 0} |`);
  } else {
    out.push('| ✅ Web検索失敗 | 0 |');
  }

  // 警告詳細
  if (report.warnings.length > 0) {
    out.push('');
    out.push('### 警告一覧');
    for (const w of report.warnings) {
      out.push(formatWarningBlock(w));
    }
  }

  // 公式URL未取得
  const missing = report.missingOfficialUrls ?? [];
  if (missing.length > 0) {
    out.push('');
    out.push(`### ⚠️ 公式URL未取得の記事（${missing.length}件）`);
    out.push('');
    out.push('以下の記事は公式URLが取得できませんでした。必要に応じて手動で補完してください。');
    out.push('');
    for (const m of missing) {
      out.push(`- **[${m.category}]** ${m.gameTitle}`);
    }
  }

  // LLM 事実性チェック（記録のみ・fail 判定には非算入）
  if (report.llmJudge) {
    const j = report.llmJudge;
    out.push('');
    out.push('### 🔎 LLM 事実性チェック（参考・fail 判定には非算入）');
    out.push('');
    out.push('| 項目 | 件数 |');
    out.push('|------|------|');
    out.push(`| 判定した記事 | ${j.judgedArticles} |`);
    out.push(`| スキップ記事 | ${j.skippedArticles} |`);
    out.push(`| ✅ 支持 | ${j.claimsByVerdict.supported} |`);
    out.push(`| ❌ 矛盾 | ${j.claimsByVerdict.contradicted} |`);
    out.push(`| ❓ 裏付け不能 | ${j.claimsByVerdict.unverifiable} |`);

    if (j.warnings.length > 0) {
      out.push('');
      out.push('#### 事実性チェックの指摘');
      for (const w of j.warnings) {
        out.push('');
        out.push('---');
        out.push(`**[${w.severity.toUpperCase()}] ${w.type}**  `);
        out.push(`記事: ${w.articleTitle}  `);
        out.push(`内容: ${w.message}  `);
        if (w.context) {
          out.push(`> ${w.context}`);
        }
      }
    }
  }

  out.push('');
  return out.join('\n');
}
