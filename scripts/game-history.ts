/**
 * ゲーム紹介履歴管理モジュール
 * カテゴリ別クールダウン期間で同じゲームの重複紹介を防ぐ
 *
 * 履歴ファイルは 2 種類の記録を持つ:
 * - `entries`: 紹介したゲームタイトル（カテゴリ別クールダウン用）
 * - `featureEvents`: 特集で**実際にテーマとして使った**記念日名（§4.4 / Issue #310）。
 *   0 件週の過去方向フォールバックは前号の探索窓と完全に重なるため、直近 N 号が使った
 *   記念日を候補から外す必要がある。「窓に入った記念日」ではなく「使った記念日」を記録する
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeTitle } from './normalize.js';
import type { FeatureEventSource } from './fetch-japanese-events.js';

// 開発モード判定
const DEV_MODE = process.env.DEV_MODE === 'true';

// 履歴ファイルパス
const HISTORY_PATH = DEV_MODE
  ? path.join(process.cwd(), 'src', 'content', 'history-dev.json')
  : path.join(process.cwd(), 'src', 'content', 'history.json');

// カテゴリ別クールダウン期間（週）
const COOLDOWN_WEEKS: Record<string, number> = {
  newRelease: 17, // 約4ヶ月
  indie: 35,      // 約8ヶ月
  classic: 52,    // 約12ヶ月
  // フェーズ2でテーマ起点の能動探索が加わり「毎号同じ名作が反復」するリスクが生じるため、
  // feature にもクールダウンを設定する（Issue #81 / Issue #38 と整合）
  feature: 17,    // 約4ヶ月
};

export interface HistoryEntry {
  normalizedTitle: string;
  title: string;
  category: 'newRelease' | 'indie' | 'feature' | 'classic';
  issueNumber: number;
  publishDate: string; // YYYY-MM-DD
}

/**
 * 特集がテーマとして使った記念日の記録（§4.4 / Issue #310）。
 *
 * 記録するのは記念日名・号・発行日・どの探索段階で見つけたか。
 * `source` を持たせているのは、フォールバックが発火した号を後から判別できるようにするため
 * （§9.2-9。従来は固定文言に落ちたことが出力から追えず、実際に発火した vol.2 / vol.8 は
 * 特集タイトルの傾向から推測するしかなかった）。
 */
export interface FeatureEventHistoryEntry {
  eventName: string;
  issueNumber: number;
  publishDate: string; // YYYY-MM-DD
  source: FeatureEventSource;
}

interface HistoryFile {
  version: number;
  entries: HistoryEntry[];
  /**
   * optional の理由: 本フィールド追加前に書かれた履歴ファイルを読み込むため
   * （`adultScreeningFailures` と同じ方針で、型を実態に合わせる）
   */
  featureEvents?: FeatureEventHistoryEntry[];
}

/**
 * 特集の記念日を除外する号数 N の既定値（§4.4 / §9.2-8）。
 *
 * 1 号だけで構造的な重なりは防げる（過去方向 7 日の窓は、週次発行なら前号の未来方向 7 日の窓と
 * 完全に一致する）。2 号にしているのは発行日が数日ずれた場合の保険で、コストは無い
 * （2 号前の窓は過去方向の探索範囲と重ならないため、通常は候補を 1 つも減らさない）。
 */
export const DEFAULT_FEATURE_EVENT_EXCLUDE_ISSUE_COUNT = 2;

/**
 * 特集の記念日を除外する号数を読む（環境変数 `FEATURE_EVENT_EXCLUDE_ISSUE_COUNT` で上書き可能）。
 * `0` で除外を無効化できるため、`Number(raw) || default` とは書かない（0 が既定値に化ける）。
 */
export function readFeatureEventExcludeIssueCount(): number {
  const raw = process.env.FEATURE_EVENT_EXCLUDE_ISSUE_COUNT;
  if (raw === undefined || raw === '') return DEFAULT_FEATURE_EVENT_EXCLUDE_ISSUE_COUNT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_FEATURE_EVENT_EXCLUDE_ISSUE_COUNT;
  return n;
}

/**
 * 履歴ファイルを読み込む（存在しない場合は空の履歴を返す）
 */
export function loadHistory(): HistoryFile {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { version: 1, entries: [] };
  }

  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw) as HistoryFile;
  } catch (error) {
    throw new Error(`Failed to load history file (${HISTORY_PATH}): ${error}\nFix the JSON before running again.`);
  }
}

/**
 * 履歴に新しいエントリを追記して保存（重複エントリはスキップ）
 *
 * @param newEntries 追記するゲーム紹介履歴
 * @param newFeatureEvents 追記する特集の記念日使用履歴（Issue #310）。
 *   ゲーム履歴が 0 件でも記念日だけで保存する（両方 0 件のときだけ書き込みを省く）
 */
export function saveHistory(
  newEntries: HistoryEntry[],
  newFeatureEvents: FeatureEventHistoryEntry[] = []
): void {
  const history = loadHistory();

  const existingKeys = new Set(
    history.entries.map((e) => `${e.issueNumber}:${e.normalizedTitle}`)
  );

  const uniqueEntries = newEntries.filter((entry) => {
    const key = `${entry.issueNumber}:${entry.normalizedTitle}`;
    if (existingKeys.has(key)) {
      console.log(`  Skipping duplicate: ${entry.title} (issue #${entry.issueNumber})`);
      return false;
    }
    return true;
  });

  const existingEventKeys = new Set(
    (history.featureEvents ?? []).map((e) => `${e.issueNumber}:${e.eventName}`)
  );

  const uniqueFeatureEvents = newFeatureEvents.filter((entry) => {
    const key = `${entry.issueNumber}:${entry.eventName}`;
    if (existingEventKeys.has(key)) {
      console.log(`  Skipping duplicate feature event: ${entry.eventName} (issue #${entry.issueNumber})`);
      return false;
    }
    existingEventKeys.add(key); // 同一呼び出し内の重複も落とす
    return true;
  });

  if (uniqueEntries.length === 0 && uniqueFeatureEvents.length === 0) {
    console.log('No new entries to add (all duplicates).');
    return;
  }

  history.entries.push(...uniqueEntries);
  if (uniqueFeatureEvents.length > 0) {
    // 追記が無いときはフィールドを生やさない（既存ファイルの形を無用に変えない）
    history.featureEvents = [...(history.featureEvents ?? []), ...uniqueFeatureEvents];
  }

  // 出力ディレクトリが存在しない場合は作成
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  const featureEventNote =
    uniqueFeatureEvents.length > 0
      ? `, ${uniqueFeatureEvents.length} new feature event(s)`
      : '';
  console.log(`History saved to: ${HISTORY_PATH} (${uniqueEntries.length} new, ${history.entries.length} total entries${featureEventNote})`);
}

/**
 * カテゴリ別クールダウン中のタイトルセットを取得
 * @param category 対象カテゴリ
 * @param currentDate 現在日付（省略時は今日）
 * @returns クールダウン中の正規化タイトルセット
 */
export function getCooldownTitles(
  category: 'newRelease' | 'indie' | 'feature' | 'classic',
  currentDate: Date = new Date()
): Set<string> {
  const cooldownWeeks = COOLDOWN_WEEKS[category] ?? 0;
  if (cooldownWeeks === 0) {
    return new Set();
  }

  const history = loadHistory();
  const cooldownMs = cooldownWeeks * 7 * 24 * 60 * 60 * 1000;
  const cooldownSet = new Set<string>();

  for (const entry of history.entries) {
    if (entry.category !== category) continue;
    const publishDate = new Date(entry.publishDate);
    const elapsed = currentDate.getTime() - publishDate.getTime();

    if (elapsed < cooldownMs) {
      cooldownSet.add(entry.normalizedTitle);
    }
  }

  return cooldownSet;
}

/**
 * 直近 N 号の特集が**実際にテーマとして使った**記念日名を取得する（§4.4 / Issue #310）。
 *
 * 「窓に入った記念日」ではなく「使った記念日」だけを返す。窓ベースで除外すると 8〜12 日前まで
 * 遡ることになり「直近に限定する」という趣旨から外れる（決着ブロック 判断根拠 6）。
 *
 * @param currentIssueNumber 生成中の号。**この号以降の記録は含めない**
 *   （同じ号を作り直したときに自分が前回使った記念日を弾かないため）
 * @param excludeIssueCount 遡る号数（既定は環境変数 or 2 号）
 * @returns 記念日名の集合。記録が無い場合は空集合
 */
export function getRecentFeatureEventNames(
  currentIssueNumber: number,
  excludeIssueCount: number = readFeatureEventExcludeIssueCount()
): Set<string> {
  if (excludeIssueCount <= 0) {
    return new Set();
  }

  const history = loadHistory();
  const past = (history.featureEvents ?? []).filter((e) => e.issueNumber < currentIssueNumber);

  // 「直近 N 号」は号番号の大きい順に N 種類の号（同一号に複数記録があっても 1 号として数える）
  const recentIssueNumbers = [...new Set(past.map((e) => e.issueNumber))]
    .sort((a, b) => b - a)
    .slice(0, excludeIssueCount);
  const targetIssues = new Set(recentIssueNumbers);

  return new Set(past.filter((e) => targetIssues.has(e.issueNumber)).map((e) => e.eventName));
}

/**
 * 現在の履歴ファイルパスを返す（デバッグ・テスト用）
 */
export function getHistoryPath(): string {
  return HISTORY_PATH;
}

/**
 * HistoryEntry を生成するヘルパー
 */
export function createHistoryEntry(
  title: string,
  category: 'newRelease' | 'indie' | 'feature' | 'classic',
  issueNumber: number,
  publishDate: string
): HistoryEntry {
  return {
    normalizedTitle: normalizeTitle(title),
    title,
    category,
    issueNumber,
    publishDate,
  };
}

/**
 * FeatureEventHistoryEntry を生成するヘルパー（Issue #310）
 *
 * 記念日名は `japanese-events.json` の `name` をそのまま使う（正規化しない）。
 * 除外判定の相手も同じデータの `name` なので、タイトルのような表記ゆれ問題が起きない。
 */
export function createFeatureEventHistoryEntry(
  eventName: string,
  source: FeatureEventSource,
  issueNumber: number,
  publishDate: string
): FeatureEventHistoryEntry {
  return { eventName, issueNumber, publishDate, source };
}
