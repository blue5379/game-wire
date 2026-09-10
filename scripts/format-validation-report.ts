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

/** steamApiHealth が定義されている場合の型（optional を剥いだもの） */
type SteamApiHealthValue = NonNullable<ValidationReport['steamApiHealth']>;

/**
 * Steam API 呼び出しのうち 429（レート制限）**以外**の失敗数（Issue #360 フォローアップ）。
 *
 * 429 と非429を区別する理由:
 *  - 429 は Steam 側からの明示的なバックプレッシャであり、適応型ペーシング
 *    （429 観測時に `STEAM_MIN_REQUEST_INTERVAL_MS` から `STEAM_PACING_MAX_INTERVAL_MS` まで
 *    ペーシング間隔を伸ばす。`steam-api-client.ts`）が自動的に緩和する自己修復型の
 *    失敗。実害も「そのゲームの Storefront 補完が1件失われる」だけ（fail-open）で、
 *    後続フェーズを飢餓させない。毎週 Issue を自動起票する水準の異常ではないため warning 止まりにする。
 *  - 403 全滅 / 5xx / ネットワーク断 / `circuit-open`（サーキット作動中のスキップ）は
 *    「待っても回復しない」または「後続フェーズ（同一性照合・Storefront 補完）が広範囲に
 *    飢餓している」ことを意味するため error（Issue 自動起票）にする。
 *  - 429 はサーキットを一切開かない方針（直前のコミット）に変更されたため、
 *    「サーキットは開いていないが呼び出しが大量に失敗している」状態が正規の状態になった。
 *    circuitOpen だけを見るとこの状態を「✅ 未作動」と誤表示してしまう（本 Issue の回帰）。
 */
function steamApiNonRateLimitFailureCount(health: SteamApiHealthValue): number {
  const rateLimitFailures = health.statusCounts['429'] ?? 0;
  return health.failed - rateLimitFailures;
}

/**
 * 非429失敗率が error 昇格の閾値（10%）以上かどうか。
 *
 * 閾値 10% の根拠: ライブ実測で「失敗0件」が達成可能であることを確認済み（実測3回目:
 * total 280 / failed 0）。一方、実測2回目（total 295 / 非429失敗 28 件 = 9.5%）では
 * 選定済み5ゲームの Identity Resolver が 5/5 全滅していた。つまり非429失敗率が1割前後に
 * 達する状態はすでに実害が出ている水準であり、1割を超えるのは異常と判断する。
 *
 * `total < 10` の下限を置く理由: 呼び出し数が極端に少ないラン（例: 1〜2件の失敗）では、
 * 少数の失敗が見た目上高い失敗率として誤検知されてしまうのを避けるため。
 */
function steamApiHasHighNonRateLimitFailureRate(health: SteamApiHealthValue): boolean {
  if (health.total < 10) return false;
  const nonRateLimitFailures = steamApiNonRateLimitFailureCount(health);
  return nonRateLimitFailures / health.total >= 0.1;
}

/**
 * ラン中に一度でも `circuit-open`（サーキット作動中のスキップ）が発生したかどうか
 * （`statusCounts['circuit-open'] > 0`）。
 *
 * `circuitOpen`（終了時点のフラグ）だけでは検知できない盲点がある:
 *  - `circuitOpen` はラン**終了時点のスナップショット**に過ぎない。半開プローブによる
 *    自動回復（`probeInFlight` によるハーフオープン確認）が効くと、「ラン中にサーキットが
 *    開いて呼び出しをスキップしたが、終了時には回復して閉じている」状態が起こりうる。
 *    この場合 `circuitOpen === false` になるため、終了時フラグだけを見ると
 *    スキップされた呼び出しが完全に不可視になる。
 *  - ライブ実測2回目がまさにこれだった: `circuitOpen: false` だが
 *    `statusCounts['circuit-open'] = 28`。この28件のスキップに、選定済み5ゲームの
 *    Identity Resolver の全 attempt が含まれており、5/5 全滅していた。これを見落とすと
 *    Issue #358（第20号の検証レポートが「問題なし」に見えていた盲点）の再発になる。
 *  - `circuit-open` は「クライアントが意図的に呼び出しを拒否した」ことを意味し、
 *    サーバが実際に応答した結果の 4xx/5xx とは質的に異なる（後続フェーズが広範囲に
 *    飢餓している可能性が高い）ため、非429失敗率の10%閾値とは無関係に、
 *    1件でも観測されたら error とする。
 */
function steamApiHasCircuitOpenSkips(health: SteamApiHealthValue): boolean {
  return (health.statusCounts['circuit-open'] ?? 0) > 0;
}

/**
 * レポートから総合ステータスを算出する（Issue #349 で searchFailures と pageContentFailures を分離）。
 *
 * error 条件（Issue 自動起票の対象）:
 *  - high 警告が 1 件以上
 *  - キーワード検索失敗（searchFailures > 0）: 根拠データがゼロになる
 *  - AI 成人向けスクリーニング失敗（adultScreeningFailures > 0）: 安全確認が fail-open で通過
 *  - 記事本数の不足（articleCountShortfalls > 0）: カテゴリ構成の欠落
 *  - Steam API サーキットブレーカが開いた（steamApiHealth.circuitOpen）: 全滅検知（Issue #360）。
 *    号自体は fail させず発行を継続するが、同一性照合や Storefront 補完が広範囲に
 *    スキップされている可能性が高く、要対応として扱う。
 *  - Steam API の非429失敗率が10%以上（steamApiHasHighNonRateLimitFailureRate）: サーキットは
 *    開いていないが、403全滅/5xx/ネットワーク断等の「待っても回復しない」失敗が1割以上発生している
 *    状態（Issue #360 フォローアップ。429 を一切サーキットに含めない方針変更後の正規状態）。
 *  - Steam API のランのどこかで `circuit-open` スキップが発生した
 *    （steamApiHasCircuitOpenSkips）: `circuitOpen` の終了時スナップショットだけでは
 *    半開プローブによる自動回復後の状態を検知できないため、独立した条件として持つ。
 *
 * warning 条件（観測のみ・Issue 自動起票しない）:
 *  - medium 警告が 1 件以上
 *  - 公式ページの本文取得失敗（pageContentFailures > 0）: 補助ソース 1 件の欠落
 *  - 公式 URL 未取得（missingOfficialUrls > 0）
 *  - LLM judge の矛盾・裏付け不能（judgeProblemCount > 0）
 *  - 早期アクセスの表記問題（earlyAccessStatementIssues > 0）
 *  - Steam API の呼び出しに1件以上の失敗があるが、上記 error 条件（非429失敗率10%以上・
 *    circuit-open スキップ）には達していない: 429 のバックプレッシャのみ、または
 *    非429失敗が少数（10%未満）のケース。429 は自己修復型の失敗であり実害が
 *    「その号のその1ゲームの Storefront 補完欠落」に留まるため、毎週 Issue を自動起票する
 *    水準ではない。
 *
 * pageContentFailures を error ではなく warning にする理由（Issue #349）:
 *  - 補助ソースの欠落であり「記事が作られない」「読者に見える誤り」の水準ではない
 *  - 実在する正しい公式ページが JS 重量サイト等で本文抽出に失敗するケースがあり、
 *    号ごとに Issue 自動起票しても対処できない（同じタイトルが選ばれれば毎週再発する）
 *  - 前例: earlyAccessStatementIssues も同じ理由で warning 止まり（validate-article.ts:148）
 */
export function computeReportStatus(report: ValidationReport): ReportStatus {
  const high = report.warningsBySeverity.high;
  const steamApiHealth = report.steamApiHealth;
  const steamApiCircuitOpen = steamApiHealth?.circuitOpen === true;
  const steamApiHighFailureRate = steamApiHealth
    ? steamApiHasHighNonRateLimitFailureRate(steamApiHealth)
    : false;
  const steamApiCircuitOpenSkips = steamApiHealth
    ? steamApiHasCircuitOpenSkips(steamApiHealth)
    : false;
  if (
    high > 0 ||
    searchFailureCount(report) > 0 ||
    adultScreeningFailureCount(report) > 0 ||
    articleCountShortfallCount(report) > 0 ||
    steamApiCircuitOpen ||
    steamApiHighFailureRate ||
    steamApiCircuitOpenSkips
  ) {
    return 'error';
  }

  const medium = report.warningsBySeverity.medium;
  const missingUrls = report.missingOfficialUrls?.length ?? 0;
  const steamApiHasAnyFailure = (steamApiHealth?.failed ?? 0) > 0;
  if (
    medium > 0 ||
    pageContentFailureCount(report) > 0 ||
    missingUrls > 0 ||
    steamApiHasAnyFailure ||
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
  const steamApiHealth = report.steamApiHealth;
  const steamApiCircuitOpenSkips = steamApiHealth?.statusCounts['circuit-open'] ?? 0;
  const steamApiRateLimitFailures = steamApiHealth?.statusCounts['429'] ?? 0;
  const steamApiRateLimitHits = steamApiHealth?.rateLimitHits ?? 0;

  // circuitOpen（終了時作動） > circuit-open スキップ（終了時は回復済み） > 非429失敗率が高い、
  // の優先順で1つだけ出す（同じ根本原因について複数のアクションが重複表示されるのを避ける）。
  if (steamApiHealth?.circuitOpen) {
    actions.push(
      `🚨 **Steam API 全滅検知（サーキットブレーカ作動）**: 連続失敗が${steamApiHealth.consecutiveFailures}件に達し、` +
        `以降の Steam 呼び出しをスキップしました（呼び出し合計 ${steamApiHealth.total} 件中失敗 ${steamApiHealth.failed} 件）。` +
        `同一性照合・Storefront 補完が広範囲にスキップされている可能性があります。` +
        `号は発行済みですが、data/validation の該当レポート内 steamApiHealth.statusCounts を確認し、Steam 側の障害状況を確認してください。`
    );
  } else if (steamApiHealth && steamApiCircuitOpenSkips > 0) {
    actions.push(
      `🚨 **Steam API サーキットがラン中に作動→回復（終了時は未作動）**: ラン中に一時的にサーキットが開き、` +
        `${steamApiCircuitOpenSkips} 件の Steam 呼び出しがスキップされましたが、終了時には回復していたため ` +
        `circuitOpen フラグは false です（呼び出し合計 ${steamApiHealth.total} 件中失敗 ${steamApiHealth.failed} 件）。` +
        `このスキップに同一性照合や Identity Resolver の attempt が含まれていた可能性があります。` +
        `data/validation の該当レポートの identityCheckSkipped と、該当号の記事の Steam リンクを確認してください。`
    );
  } else if (steamApiHealth && steamApiHasHighNonRateLimitFailureRate(steamApiHealth)) {
    const nonRateLimitFailures = steamApiNonRateLimitFailureCount(steamApiHealth);
    const failureRatePercent = ((nonRateLimitFailures / steamApiHealth.total) * 100).toFixed(1);
    actions.push(
      `⚠️ **Steam API 呼び出しの失敗率が高い（サーキットは未作動）**: 429 以外の失敗が` +
        ` ${nonRateLimitFailures} 件 / ${steamApiHealth.total} 件（${failureRatePercent}%）発生しています。` +
        `data/validation の該当レポート内 steamApiHealth.statusCounts の内訳を確認し、` +
        `同一性照合や Storefront 補完が部分的にスキップされていないか確認してください。`
    );
  }

  if (steamApiRateLimitFailures > 0 || steamApiRateLimitHits > 0) {
    actions.push(
      `ℹ️ **Steam API レート制限（429）発生**: レート制限により該当ゲームの Storefront 補完が` +
        `一部失われています（429 失敗 ${steamApiRateLimitFailures} 件 / rateLimitHits ${steamApiRateLimitHits} 件）。` +
        `適応型ペーシングで自動的に緩和されるため号の発行には影響しませんが、頻発する場合は ` +
        `STEAM_MIN_REQUEST_INTERVAL_MS の見直しが必要かもしれません。`
    );
  }

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
      // judge の照合先は「執筆AIに渡した入力」（提供メタデータ・一次ソース・二次ソース）で、
      // 検索結果だけではない（Issue #361）。文言を検索結果に限ると、レポートを読む人が
      // 「検索で裏付かなかっただけ」と読んで実際の創作を見逃す
      `❌ **LLM 事実性チェックで矛盾 ${contradicted} 件**: 執筆AIに渡した情報（メタデータ・公式/Steamページ・検索結果）と矛盾する記述です。該当箇所を確認・修正してください。`
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
      // 定義上 unverifiable は「渡した入力に根拠が無い＝創作の疑い」だが、
      // severity の見直しは Issue #350 / #364 の担当なので文言だけ実態に合わせる
      `❓ **LLM 事実性チェックで裏付け不能 ${unverifiable} 件**: 執筆AIに渡した情報の中に根拠が見つからなかった記述です（創作の疑い、または grounding 不足）。必要に応じて確認してください。`
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

  // Steam API 呼び出し全体の健全性（Issue #360）。未計測（旧レポート）と計測済みを区別する。
  // circuitOpen（終了時フラグ）だけでは「サーキットが未作動＝呼び出しは正常」と誤読される
  // ため、total / failed / 失敗率と statusCounts の内訳まで出す（本 Issue の回帰対応）。
  if (report.steamApiHealth === undefined) {
    out.push('| ❓ Steam API 呼び出し | 未計測 |');
  } else {
    const h = report.steamApiHealth;
    const circuitOpenSkips = h.statusCounts['circuit-open'] ?? 0;
    const failureRatePercent = h.total > 0 ? ((h.failed / h.total) * 100).toFixed(1) : '0.0';
    if (h.circuitOpen) {
      out.push(
        `| 🚨 Steam API 呼び出し | サーキット作動中（連続失敗 ${h.consecutiveFailures} 件、` +
          `失敗 ${h.failed}/${h.total} 件・${failureRatePercent}%） |`
      );
    } else if (circuitOpenSkips > 0) {
      out.push(
        `| 🚨 Steam API 呼び出し | ラン中にサーキット作動→終了時は回復` +
          `（circuit-open スキップ ${circuitOpenSkips} 件、失敗 ${h.failed}/${h.total} 件・${failureRatePercent}%） |`
      );
    } else if (h.failed > 0) {
      out.push(`| ⚠️ Steam API 呼び出し | 失敗 ${h.failed}/${h.total} 件（${failureRatePercent}%） |`);
    } else {
      out.push(`| ✅ Steam API 呼び出し | 失敗 0/${h.total} 件（0.0%） |`);
    }
    const statusCountsEntries = Object.entries(h.statusCounts);
    if (statusCountsEntries.length > 0) {
      const detail = statusCountsEntries.map(([status, count]) => `${status}: ${count}`).join('、');
      out.push(`| ・Steam API ステータス別内訳 | ${detail} |`);
    }
    if (h.rateLimitHits !== undefined) {
      out.push(`| ・Steam API レート制限（429）ヒット数 | ${h.rateLimitHits} |`);
    }
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
    if (j.filteredByScope !== undefined) {
      out.push(`| 🔍 スコープ外で除外 | ${j.filteredByScope} |`);
    }

    // スキップされた記事は「無検証で通った記事」なので、件数だけでなく
    // どの記事かを出す（Issue #363）。URL 一覧は JSON 側にあるので md では件数に留める
    if (j.skipped && j.skipped.length > 0) {
      out.push('');
      out.push('#### 事実性チェックをスキップした記事');
      for (const s of j.skipped) {
        out.push(`- ${s.articleTitle} — ${s.reason}`);
      }
    }

    if (j.judgedSources && j.judgedSources.length > 0) {
      out.push('');
      out.push('#### 判定に使った出典の件数');
      out.push('');
      out.push('出典の URL 一覧は JSON レポートの `llmJudge.judgedSources` を参照。');
      out.push('');
      for (const s of j.judgedSources) {
        const primaryCount = s.sources.filter((src) => src.kind === 'primary').length;
        const secondaryCount = s.sources.filter((src) => src.kind === 'secondary').length;
        out.push(
          `- ${s.articleTitle} — ${s.sources.length}件（一次: ${primaryCount} / 二次: ${secondaryCount}）`
        );
      }
    }

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
