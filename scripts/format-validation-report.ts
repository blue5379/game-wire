/**
 * Validation レポートの整形（Issue #202）
 *
 * 2つの観点でレポートを扱う:
 *  1. 人間（運用者）向け: 「対応が必要か」「何をすべきか」がひと目で分かる Markdown サマリ
 *  2. 自動起票判定: 総合ステータス（ok/warning/error）を機械的に算出
 *
 * 総合ステータスの定義（Issue #349 で searchFailures と pageContentFailures を分離）:
 *  - error   (🔴 要対応):   high 警告が1件以上、またはキーワード検索失敗（searchFailures）がある、
 *                           または AI成人向けスクリーニング失敗（fail-open）がある、
 *                           または記事本数が期待を下回ったカテゴリがある
 *  - warning (🟡 要確認):   error ではないが、medium 警告・公式ページ本文取得失敗（pageContentFailures）・
 *                           公式URL未取得・LLM judge の矛盾/裏付け不能・早期アクセス表記問題のいずれかがある
 *  - ok      (🟢 対応不要): 上記いずれも無い
 *
 * error の定義は「Issue 自動起票の条件」と一致させている（起票される号は必ず 🔴）。
 *
 * 記事本数の不足（Issue #311）は high 警告としては数えず、独立した判定項として error に
 * 昇格させる。理由: high 警告は記事本文の品質（ハルシネーション・整合性）の指標であり、
 * 号の構成の問題である本数不足を同じバケットに混ぜると「high 警告の重大性の再定義」
 * （仕様 §9.1 保留1）の議論対象がさらに不均一になる。また `warningsBySeverity.high` は
 * writeAndCheckReport の fail 閾値（既定 5 件）と自動再生成の判断にも使われる数値なので、
 * 本文品質以外の要因で動かさない。
 *
 * AI成人向けスクリーニング失敗（Issue #222）は、キーワード検索失敗（searchFailures）と同様
 * 「本来行うべき安全確認ができないまま fail-open で通過した」という性質が共通するため、
 * キーワード検索失敗と同じ扱い（error に昇格）とする。
 * ※ Issue #349 以降、ここでいう「検索失敗」は searchFailures のみを指す。公式ページの
 * 本文取得失敗（pageContentFailures）は warning 止まりで、この比較の対象ではない。
 *
 * 早期アクセスの表記漏れ・誤断定（Issue #26）も high 警告には混ぜず独立した判定項として扱うが、
 * error ではなく warning 止まりにする。一次対策はプロンプト側（早期アクセス配信中である事実を
 * 提示し、正式リリース済みという断定を禁じる）であり、この判定項はそれが効かなかったときの
 * 観測網である。発火頻度が未観測の段階で error に昇格させると、号ごとに Issue が自動起票される。
 * unrecognizedScreeningResponses と同じ判断（まず実態を観測してから昇格の要否を検討する）。
 *
 * 一方、AI成人向けスクリーニングの応答形式不正（unrecognizedScreeningResponses、YES/NO 以外の
 * 応答を安全側で通過させたケース）は、カウント・表示はするが error には昇格させない。
 * これは例外を投げない fail-open 経路であり、実際の Bedrock 応答形式（切り詰め・句読点付与等の
 * 頻度）がまだ観測できていないため、閾値の妥当性が未検証の状態で自動起票を強制すると、
 * 実際には無害な揺らぎで毎週 Issue が誤起票されるリスクがある。まずこのフィールドで実態を
 * 観測してから、昇格の要否・閾値を検討する（Issue #222 code review 対応）。
 */

import type { ArticleCategory, ValidationReport, ValidationWarning } from './validate-article.js';

export type ReportStatus = 'ok' | 'warning' | 'error';

/**
 * 記事カテゴリの日本語表示名。
 * レポート（stdout / Markdown）と公開 Markdown の見出しで共用する。
 */
export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  newRelease: '新作紹介',
  indie: 'インディーゲーム',
  feature: '特集',
  classic: '名作深掘り',
};

/**
 * キーワード検索自体の失敗回数（Issue #349）。
 * Tavily 検索が失敗すると**その記事は根拠データがゼロのまま生成される**ため、status を error に
 * 昇格させる（= Issue 自動起票の対象にする）。pageContentFailureCount とは扱いが逆であることに注意。
 * ⚠️ この判断は「発火したときの影響が大きい」という想定に基づく。実測では 12 号中 0 件で
 * 一度も発火していないため、実際の頻度と対処可能性は未観測である。Tavily のクォータ切れ等で
 * 常態的に発火するようになった場合は、pageContentFailures と同じ理由（対処不能な原因で
 * 号ごとに起票される）で重大度の見直しが必要になる。
 * 旧キャッシュ（webSearchStats 追加前）では 0 として扱う。
 */
export function searchFailureCount(report: ValidationReport): number {
  return report.webSearchStats?.searchFailures ?? 0;
}

/**
 * 公式ページの本文取得失敗回数（Issue #349）。
 * ページが実在しても JS 重量サイト等で本文が抽出できない場合がある。補助ソース 1 件の欠落なので
 * status は warning 止まりにする（error に昇格させない）。searchFailureCount とは性質が異なる。
 * 旧キャッシュ（webSearchStats 追加前）では 0 として扱う。
 */
export function pageContentFailureCount(report: ValidationReport): number {
  return report.webSearchStats?.pageContentFailures ?? 0;
}

/** Web 検索の失敗総数（キーワード検索失敗 + ページ取得失敗）。表示・集計用。 */
export function webSearchFailureCount(report: ValidationReport): number {
  const s = report.webSearchStats;
  if (!s) return 0;
  // 片方のフィールドだけ欠けた旧キャッシュで NaN にならないよう `?? 0` で潰す
  // （searchFailureCount / pageContentFailureCount と挙動を揃える）。
  return (s.searchFailures ?? 0) + (s.pageContentFailures ?? 0);
}

/**
 * AI成人向けスクリーニング（Bedrock呼び出し）の失敗回数。fail-openで通過した件数（Issue #222）。
 * webSearchFailureCount とは意味が異なる（Web検索の失敗ではない）ため、別ヘルパーとして分離する。
 * 旧キャッシュ（本フィールド追加前）で値が無い場合は 0 として扱う。
 */
export function adultScreeningFailureCount(report: ValidationReport): number {
  return report.webSearchStats?.adultScreeningFailures ?? 0;
}

/**
 * 記事本数が期待を下回ったカテゴリ数（Issue #311）。
 * 旧レポート（本フィールド追加前）では undefined = 未計測なので 0 として扱う。
 * 「不足した本数の合計」ではなく「不足したカテゴリ数」を返す（判定は 1 カテゴリでも
 * 下回れば error。仕様 §6.5）。
 */
export function articleCountShortfallCount(report: ValidationReport): number {
  return report.articleCountShortfalls?.length ?? 0;
}

/**
 * 早期アクセス表記の問題の件数（Issue #26）。
 * 旧レポート（本フィールド追加前）では undefined = 未計測なので 0 として扱う。
 */
export function earlyAccessStatementIssueCount(report: ValidationReport): number {
  return report.earlyAccessStatementIssues?.length ?? 0;
}

/** LLM judge が矛盾・裏付け不能と判定した claim の総数 */
function judgeProblemCount(report: ValidationReport): number {
  const j = report.llmJudge;
  if (!j) return 0;
  return j.claimsByVerdict.contradicted + j.claimsByVerdict.unverifiable;
}

/**
 * レポートから総合ステータスを算出する（Issue #349 で searchFailures と pageContentFailures を分離）。
 *
 * error 条件（Issue 自動起票の対象）:
 *  - high 警告が 1 件以上
 *  - キーワード検索失敗（searchFailures > 0）: 根拠データがゼロになる
 *  - AI 成人向けスクリーニング失敗（adultScreeningFailures > 0）: 安全確認が fail-open で通過
 *  - 記事本数の不足（articleCountShortfalls > 0）: カテゴリ構成の欠落
 *
 * warning 条件（観測のみ・Issue 自動起票しない）:
 *  - medium 警告が 1 件以上
 *  - 公式ページの本文取得失敗（pageContentFailures > 0）: 補助ソース 1 件の欠落
 *  - 公式 URL 未取得（missingOfficialUrls > 0）
 *  - LLM judge の矛盾・裏付け不能（judgeProblemCount > 0）
 *  - 早期アクセスの表記問題（earlyAccessStatementIssues > 0）
 *
 * pageContentFailures を error ではなく warning にする理由（Issue #349）:
 *  - 補助ソースの欠落であり「記事が作られない」「読者に見える誤り」の水準ではない
 *  - 実在する正しい公式ページが JS 重量サイト等で本文抽出に失敗するケースがあり、
 *    号ごとに Issue 自動起票しても対処できない（同じタイトルが選ばれれば毎週再発する）
 *  - 前例: earlyAccessStatementIssues も同じ理由で warning 止まり（validate-article.ts:148）
 */
export function computeReportStatus(report: ValidationReport): ReportStatus {
  const high = report.warningsBySeverity.high;
  if (
    high > 0 ||
    searchFailureCount(report) > 0 ||
    adultScreeningFailureCount(report) > 0 ||
    articleCountShortfallCount(report) > 0
  ) {
    return 'error';
  }

  const medium = report.warningsBySeverity.medium;
  const missingUrls = report.missingOfficialUrls?.length ?? 0;
  if (
    medium > 0 ||
    pageContentFailureCount(report) > 0 ||
    missingUrls > 0 ||
    judgeProblemCount(report) > 0 ||
    earlyAccessStatementIssueCount(report) > 0
  ) {
    return 'warning';
  }

  return 'ok';
}

/**
 * この号について Issue を自動起票すべきか。
 * 条件: high 警告が1件以上、または**キーワード検索失敗**（searchFailures）がある、
 * または AI成人向けスクリーニング失敗（fail-open）がある、
 * または記事本数が期待を下回ったカテゴリがある（= 総合ステータスが error）。
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
  const searchFail = searchFailureCount(report);
  const pageContentFail = pageContentFailureCount(report);
  const adultScreeningFail = adultScreeningFailureCount(report);
  const unrecognizedScreeningResponses = report.webSearchStats?.unrecognizedScreeningResponses ?? 0;
  const missingUrls = report.missingOfficialUrls?.length ?? 0;
  const contradicted = report.llmJudge?.claimsByVerdict.contradicted ?? 0;
  const unverifiable = report.llmJudge?.claimsByVerdict.unverifiable ?? 0;
  const shortfalls = report.articleCountShortfalls ?? [];
  const earlyAccessIssues = earlyAccessStatementIssueCount(report);

  if (shortfalls.length > 0) {
    const detail = shortfalls
      .map((s) => `${ARTICLE_CATEGORY_LABELS[s.category]} ${s.actual}/${s.expected}本`)
      .join('、');
    actions.push(
      `📉 **記事本数の不足 ${shortfalls.length} カテゴリ**（${detail}）: ` +
        `枠を埋めるために不適格なゲームを載せる対応はしません（号は少ない本数のまま発行済み）。` +
        `選定ログを確認し、どの段階で候補が落ちたかを調べてください。`
    );
  }
  if (high > 0) {
    actions.push(
      `🔴 **HIGH 警告 ${high} 件**: 該当記事の本文を確認し、事実誤り・ハルシネーションを修正してください。`
    );
  }
  // Issue #349: 2 種の失敗は必要なアクションが違うので分けて出す。
  // 合算して「Web 検索失敗」と書くと、status を分離した意味（error / warning）が
  // 人間向けサマリと自動起票タイトルの表記から失われる。
  if (searchFail > 0) {
    actions.push(
      `🔴 **キーワード検索の失敗 ${searchFail} 件**: 該当記事は根拠データ無しで生成されています。全体を手動でファクトチェックしてください。`
    );
  }
  if (pageContentFail > 0) {
    actions.push(
      `⚠️ **公式ページ本文の取得失敗 ${pageContentFail} 件**: 公式サイトの記述と照合できていません（実在するページでも JS 重量サイトでは失敗する）。該当記事の対応機種・発売日を手動で確認してください。`
    );
  }
  if (adultScreeningFail > 0) {
    actions.push(
      `🔞 **AI成人向けスクリーニング失敗 ${adultScreeningFail} 件**: 判定不能のまま fail-open で通過したゲームがあります。成人向けコンテンツでないか手動で確認してください。`
    );
  }
  if (unrecognizedScreeningResponses > 0) {
    actions.push(
      `❓ **AI成人向けスクリーニング応答形式不正 ${unrecognizedScreeningResponses} 件**: 応答形式が想定外（YES/NO以外）だったため判定できず、fail-open で通過したゲームがあります。成人向けコンテンツでないか手動で確認してください。`
    );
  }
  if (contradicted > 0) {
    actions.push(
      `❌ **LLM 事実性チェックで矛盾 ${contradicted} 件**: 検索結果と矛盾する記述です。該当箇所を確認・修正してください。`
    );
  }
  if (earlyAccessIssues > 0) {
    const unstated = (report.earlyAccessStatementIssues ?? []).filter(
      (i) => i.type === 'early-access-unstated'
    ).length;
    const claims = earlyAccessIssues - unstated;
    actions.push(
      `🧪 **早期アクセスの表記 ${earlyAccessIssues} 件**（記載漏れ ${unstated} 件 / 正式リリース済みと読める断定 ${claims} 件）: ` +
        `Steam ストアが早期アクセスと表示しているタイトルです。該当記事の「📅 発売情報」に早期アクセス配信中である旨が` +
        `書かれているか確認し、正式リリース済みと読める記述があれば修正してください。`
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
  // 記事本数の不足（Issue #311）。undefined（未計測＝旧レポート）と 0（計測して不足なし）を区別する。
  const shortfalls = report.articleCountShortfalls;
  if (shortfalls === undefined) {
    out.push('| ❓ 記事本数の不足 | 未計測 |');
  } else if (shortfalls.length > 0) {
    out.push(`| 📉 記事本数の不足（カテゴリ数） | ${shortfalls.length} |`);
  } else {
    out.push('| ✅ 記事本数の不足 | 0 |');
  }
  // 早期アクセス表記の問題（Issue #26）。未計測（旧レポート）と 0 件を区別する。
  const earlyAccessIssues = report.earlyAccessStatementIssues;
  if (earlyAccessIssues === undefined) {
    out.push('| ❓ 早期アクセスの表記 | 未計測 |');
  } else if (earlyAccessIssues.length > 0) {
    out.push(`| 🧪 早期アクセスの表記 | ${earlyAccessIssues.length} |`);
  } else {
    out.push('| ✅ 早期アクセスの表記 | 0 |');
  }
  out.push(`| 警告合計 | ${report.totalWarnings} |`);
  out.push(`| 🔴 HIGH | ${report.warningsBySeverity.high} |`);
  out.push(`| 🟡 MEDIUM | ${report.warningsBySeverity.medium} |`);
  out.push(`| 🟢 LOW | ${report.warningsBySeverity.low} |`);
  // Issue #349: キーワード検索失敗（error 要因）とページ本文取得失敗（warning 要因）は
  // 重大度が違うので、0 件のときも行を分けて出す（1 行に潰すと分離が表から読み取れない）。
  // ただし webSearchStats 自体が無い旧キャッシュは「未計測」であり「計測して 0 件」ではない。
  // 両者を潰すと #222 code review が adultScreeningFailures で指摘したのと同じ誤りになるため 3 分岐する。
  if (!report.webSearchStats) {
    out.push('| ❓ Web検索失敗（キーワード） | 未計測 |');
    out.push('| ❓ Web検索失敗（ページ取得） | 未計測 |');
  } else if (webFail > 0) {
    out.push(`| ⚠️ Web検索失敗（キーワード） | ${report.webSearchStats.searchFailures ?? 0} |`);
    out.push(`| ⚠️ Web検索失敗（ページ取得） | ${report.webSearchStats.pageContentFailures ?? 0} |`);
  } else {
    out.push('| ✅ Web検索失敗（キーワード） | 0 |');
    out.push('| ✅ Web検索失敗（ページ取得） | 0 |');
  }
  // adultScreeningFailures は undefined（未計測）と 0（計測して失敗ゼロ）を区別して表示する。
  // adultScreeningFailureCount() は computeReportStatus 用に `?? 0` で潰した値を返すため、
  // ここでは使わず report.webSearchStats?.adultScreeningFailures を直接見て3分岐する（Issue #222 code review 対応）。
  const rawAdultScreeningFailures = report.webSearchStats?.adultScreeningFailures;
  if (rawAdultScreeningFailures === undefined) {
    out.push('| ❓ AI成人向けスクリーニング失敗 | 未計測 |');
  } else if (rawAdultScreeningFailures > 0) {
    out.push(`| ⚠️ AI成人向けスクリーニング失敗（fail-open） | ${rawAdultScreeningFailures} |`);
  } else {
    out.push('| ✅ AI成人向けスクリーニング失敗 | 0 |');
  }
  // unrecognizedScreeningResponses も同様に3分岐（未計測 / >0 / 0）で表示する。
  const rawUnrecognizedScreeningResponses = report.webSearchStats?.unrecognizedScreeningResponses;
  if (rawUnrecognizedScreeningResponses === undefined) {
    out.push('| ❓ AI成人向けスクリーニング応答形式不正 | 未計測 |');
  } else if (rawUnrecognizedScreeningResponses > 0) {
    out.push(`| ⚠️ AI成人向けスクリーニング応答形式不正 | ${rawUnrecognizedScreeningResponses} |`);
  } else {
    out.push('| ✅ AI成人向けスクリーニング応答形式不正 | 0 |');
  }

  // 警告詳細
  if (report.warnings.length > 0) {
    out.push('');
    out.push('### 警告一覧');
    for (const w of report.warnings) {
      out.push(formatWarningBlock(w));
    }
  }

  // 記事本数の不足（Issue #311）
  if (shortfalls && shortfalls.length > 0) {
    out.push('');
    out.push(`### 📉 記事本数が不足したカテゴリ（${shortfalls.length}件）`);
    out.push('');
    out.push('| カテゴリ | 掲載本数 | 期待本数 |');
    out.push('|------|------|------|');
    for (const s of shortfalls) {
      out.push(`| ${ARTICLE_CATEGORY_LABELS[s.category]} | ${s.actual} | ${s.expected} |`);
    }
    out.push('');
    out.push(
      '※ 掲載本数は hidden（メタデータ欠落・別ゲーム混入で読者に表示されない記事）を除いた数です。'
    );
  }

  // 早期アクセスの表記（Issue #26）
  if (earlyAccessIssues && earlyAccessIssues.length > 0) {
    out.push('');
    out.push(`### 🧪 早期アクセスの表記に問題がある記事（${earlyAccessIssues.length}件）`);
    out.push('');
    out.push(
      'Steam ストアが「早期アクセス」と表示しているタイトルの記事です。' +
        '正式リリース済みの完成品として読まれないよう、発売情報の記述を確認してください。'
    );
    for (const i of earlyAccessIssues) {
      out.push('');
      out.push('---');
      out.push(`**${i.type}**  `);
      out.push(`記事: ${i.articleTitle}  `);
      out.push(`ゲーム: ${i.gameTitle}（${ARTICLE_CATEGORY_LABELS[i.category]}）  `);
      out.push(`内容: ${i.message}  `);
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
