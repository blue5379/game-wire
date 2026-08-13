/**
 * 日本のイベント・記念日データ取得
 * japanese-events.json を読み込み、指定期間のイベントを取得する
 *
 * ## カレンダー日付は JST で解釈する（Issue #324）
 *
 * 本モジュールに渡る `baseDate` は本番では `new Date('YYYY-MM-DD')`（= UTC 0 時）で、
 * その日付は JST のカレンダー日付である（`jst-date.ts` の `resolvePublishDateString` 参照）。
 * 以前は `getFullYear()` / `getDate()` 等の**ローカル時刻のゲッター**で日付を読んでいたため、
 * 負オフセットの TZ では 1 日前として解釈されていた
 * （実測: `TZ=America/Los_Angeles` で `new Date('2026-08-15').getDate()` = 14。
 * 2026 年のイベント 0 件週が土曜基準 5 週 → 3 週に変わり、記念日の日付が全体に 1 日ずれる）。
 * CI は UTC・開発機は JST なので現に壊れてはいなかったが、TZ 依存を残さないため
 * 日付の解釈をすべて JST 固定に統一した。
 *
 * 同じ理由で日付の加減算も date-fns（ローカル時刻ベース）を使わず、UTC のミリ秒演算で行う。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getJstDateString } from './jst-date.js';

// イベントデータの型定義
export interface JapaneseEvent {
  month: number;
  day?: number;
  dayRange?: [number, number];
  week?: number;
  dayOfWeek?: number;
  name: string;
  gameThemeHint: string;
}

export interface JapaneseEventsData {
  version: string;
  events: JapaneseEvent[];
}

export interface ResolvedEvent {
  date: Date;
  name: string;
  gameThemeHint: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 特集のイベント探索窓（未来方向）の既定日数（§4.4 / 付録「特集」）。
 * 基準日当日を含む 7 日間（オフセット 0〜+6）。
 */
export const DEFAULT_FEATURE_EVENT_FORWARD_WINDOW_DAYS = 7;

/**
 * イベント 0 件時に過去方向へ遡る上限日数（§4.4 / 付録「特集」）。
 * 実測では最大 5 日前で足りたが、`japanese-events.json` の改訂に備えて 7 日にしている。
 */
export const DEFAULT_FEATURE_EVENT_BACKWARD_MAX_DAYS = 7;

/**
 * 過去方向でも見つからなかったときに未来方向を延長して探す上限日数（§4.4 の第 3 優先）。
 *
 * ここに到達するのは「過去 7 日 + 未来 7 日がすべて空」= 14 日連続でイベントが無い週だけ。
 * 実データ（version 1.2 / 127 件）の 2026 年でのイベント無し最長連続は **12 日**
 * （2026-05-19 起点。実測）なので現行データでは到達しないが、データ改訂に備えて上限を持たせる。
 */
export const DEFAULT_FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS = 30;

/**
 * 環境変数を正の整数として読む。未設定・空文字・数値でない・1 未満の場合は既定値にフォールバックする。
 *
 * `Number(raw) || defaultValue` と書かないのは `0` が既定値に化けるため
 * （`classic-pool.ts` の `readEnvNumber` と同じ方針。ここでは探索日数なので 1 以上に限定する）。
 */
function readEnvPositiveInt(envVarName: string, defaultValue: number): number {
  const raw = process.env[envVarName];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return defaultValue;
  return n;
}

/** 未来方向の探索窓（日数）。環境変数 `FEATURE_EVENT_FORWARD_WINDOW_DAYS` で上書き可能 */
export function readFeatureEventForwardWindowDays(): number {
  return readEnvPositiveInt(
    'FEATURE_EVENT_FORWARD_WINDOW_DAYS',
    DEFAULT_FEATURE_EVENT_FORWARD_WINDOW_DAYS
  );
}

/** 過去方向の遡り上限（日数）。環境変数 `FEATURE_EVENT_BACKWARD_MAX_DAYS` で上書き可能 */
export function readFeatureEventBackwardMaxDays(): number {
  return readEnvPositiveInt(
    'FEATURE_EVENT_BACKWARD_MAX_DAYS',
    DEFAULT_FEATURE_EVENT_BACKWARD_MAX_DAYS
  );
}

/** 拡張未来方向の上限（日数）。環境変数 `FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS` で上書き可能 */
export function readFeatureEventExtendedForwardMaxDays(): number {
  return readEnvPositiveInt(
    'FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS',
    DEFAULT_FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS
  );
}

/**
 * japanese-events.json を読み込む
 */
export function loadJapaneseEvents(): JapaneseEventsData {
  const filePath = path.join(DATA_DIR, 'japanese-events.json');

  if (!fs.existsSync(filePath)) {
    console.warn('japanese-events.json not found, returning empty events');
    return { version: '1.0', events: [] };
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(rawData) as JapaneseEventsData;
}

/**
 * Date を JST カレンダー日付の年月日に分解する（Issue #324）。
 * ローカル時刻のゲッターを使わないため TZ に依存しない。
 */
function getJstDateParts(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = getJstDateString(date).split('-').map(Number);
  return { year, month, day };
}

/** 基準日から n 日後（負なら n 日前）の Date を返す。UTC のミリ秒演算なので TZ・DST に依存しない */
function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * 第n週のx曜日の日付を計算
 *
 * 戻り値は **UTC 0 時**の Date（JST カレンダー日付としてそのまま読める）。
 * ローカル時刻の Date を返していた頃は TZ によって日付が変わっていた（Issue #324）。
 *
 * @param year 年
 * @param month 月（1-12）
 * @param week 第n週（1-5）
 * @param dayOfWeek 曜日（0=日, 1=月, ..., 6=土）
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  week: number,
  dayOfWeek: number
): Date {
  // 月の最初の日（UTC 0 時）とその曜日
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstDayOfWeek = firstDay.getUTCDay();

  // 月内で最初に dayOfWeek が現れる日（1 日が該当曜日なら 1 日そのもの）
  const offsetToFirstTarget = (dayOfWeek - firstDayOfWeek + 7) % 7;

  // 第n週なので (n-1) 週分を加算。月をまたいだ場合の除外は呼び出し側（isEventOnDate）が月一致で行う
  return new Date(Date.UTC(year, month - 1, 1 + offsetToFirstTarget + (week - 1) * 7));
}

/**
 * イベントが指定日に該当するかチェック（日付の解釈は JST 固定。Issue #324）
 */
function isEventOnDate(event: JapaneseEvent, targetDate: Date): boolean {
  const { year: targetYear, month: targetMonth, day: targetDay } = getJstDateParts(targetDate);

  // 月が異なる場合はスキップ
  if (event.month !== targetMonth) {
    return false;
  }

  // 固定日の場合
  if (event.day !== undefined) {
    return event.day === targetDay;
  }

  // 期間の場合
  if (event.dayRange !== undefined) {
    const [start, end] = event.dayRange;
    return targetDay >= start && targetDay <= end;
  }

  // 第n週x曜日の場合
  if (event.week !== undefined && event.dayOfWeek !== undefined) {
    const eventDate = getNthWeekdayOfMonth(
      targetYear,
      event.month,
      event.week,
      event.dayOfWeek
    );
    const parts = getJstDateParts(eventDate);
    return (
      parts.year === targetYear &&
      parts.month === targetMonth &&
      parts.day === targetDay
    );
  }

  return false;
}

/**
 * 指定日から直近n日間のイベントを取得
 * @param baseDate 基準日
 * @param days 取得する日数（デフォルト7日）
 * @param eventsData イベントデータ（省略時は data/japanese-events.json を読み込む。テストからの注入用）
 */
export function getEventsInRange(
  baseDate: Date,
  days: number = DEFAULT_FEATURE_EVENT_FORWARD_WINDOW_DAYS,
  eventsData: JapaneseEventsData = loadJapaneseEvents()
): ResolvedEvent[] {
  const results: ResolvedEvent[] = [];

  // 基準日からn日間をチェック
  for (let i = 0; i < days; i++) {
    const checkDate = addUtcDays(baseDate, i);

    for (const event of eventsData.events) {
      if (isEventOnDate(event, checkDate)) {
        results.push({
          date: checkDate,
          name: event.name,
          gameThemeHint: event.gameThemeHint,
        });
      }
    }
  }

  return results;
}

/**
 * 特集テーマの手がかりとして採用したイベント候補の出所（§4.4 の探索優先順位）。
 *
 * - `forward`: 通常。発行日から未来方向 7 日の窓
 * - `backward`: 窓が 0 件だったので過去方向に遡って採用（Issue #310 のフォールバック）
 * - `extended-forward`: 過去方向でも 0 件だったので 8 日目以降の未来方向を採用
 * - `none`: どこにも候補が無い（呼び出し側が固定文言にフォールバックする）
 */
export type FeatureEventSource = 'forward' | 'backward' | 'extended-forward' | 'none';

export interface FeatureEventSelection {
  /** テーマ選定に渡す候補イベント。`source === 'none'` のときだけ空になる */
  events: ResolvedEvent[];
  /** どの探索段階で見つかったか */
  source: FeatureEventSource;
  /**
   * 候補のうち発行日に最も近いイベント日のオフセット（日数。過去方向は負）。
   * `forward` では窓内の最小オフセット、`backward` / `extended-forward` では採用した 1 日分。
   * `none` のときは undefined
   */
  dayOffset?: number;
}

export interface SelectFeatureEventOptions {
  /**
   * 直近 N 号が**実際にテーマとして使った**記念日名（§4.4）。ここに含まれる名前は候補から外す。
   *
   * 「窓に入った記念日」ではなく「使った記念日」だけを渡すこと。窓ベースで除外すると
   * 8〜12 日前まで遡ることになり「直近に限定する」という趣旨から外れる（決着ブロック 判断根拠 6）。
   */
  excludeEventNames?: Iterable<string>;
  /** イベントデータ（省略時は data/japanese-events.json を読み込む。テストからの注入用） */
  eventsData?: JapaneseEventsData;
}

/**
 * 特集テーマの候補イベントを段階的フォールバックで選ぶ（§4.3 / §4.4。Issue #310 / PR-F）。
 *
 * 探索の優先順位:
 * 1. 未来方向 7 日（通常。**この段階の結果は従来の `getEventsInRange(publishDate, 7)` と同一**）
 * 2. 0 件なら過去方向に最大 7 日遡り、**最も近い 1 日分**を採用する
 * 3. それでも 0 件なら 8 日目以降（オフセット +7 以降）の未来方向で最も近い 1 日分を採用する
 *
 * ## なぜ「常時窓を広げる」ではないのか
 *
 * 窓を 10 日にすれば 0 件週は消えるが、隣接する号が同じ記念日を使う危険が 51 週中 1 週 → 38 週に
 * 激増する（決着ブロック 判断根拠 5）。0 件のときだけ遡る段階的フォールバックである必要がある。
 *
 * ## 過去方向だけ「最も近い 1 日分」に絞る理由
 *
 * §4.4 が過去方向を「最も近いものを採用」と定めているため。未来方向は従来どおり窓内の全件を
 * 候補として LLM に渡す（知名度・ゲーム関連性で選ばせる既存の挙動を変えないため）。
 *
 * ## 除外はどの段階にも効かせる
 *
 * 週次発行が守られている限り、隣接号の未来方向の窓は重ならないため段階 1 での除外は実質的に
 * 何もしない（発行日が数日ずれたときだけ効く保険）。過去方向の窓は前号の未来方向の窓と
 * 完全に重なるため、除外は段階 2 で本質的に必要になる。
 */
export function selectFeatureEventCandidates(
  baseDate: Date,
  options: SelectFeatureEventOptions = {}
): FeatureEventSelection {
  const eventsData = options.eventsData ?? loadJapaneseEvents();
  const excluded = new Set(options.excludeEventNames ?? []);
  const forwardWindowDays = readFeatureEventForwardWindowDays();

  const keep = (events: ResolvedEvent[]): ResolvedEvent[] =>
    excluded.size === 0 ? events : events.filter((e) => !excluded.has(e.name));

  /** 単日のイベントを取得（除外適用後） */
  const eventsOnOffset = (offset: number): ResolvedEvent[] =>
    keep(getEventsInRange(addUtcDays(baseDate, offset), 1, eventsData));

  // 1. 通常: 未来方向の窓（当日を含む forwardWindowDays 日間）
  const forward = keep(getEventsInRange(baseDate, forwardWindowDays, eventsData));
  if (forward.length > 0) {
    // 窓内で最も近いイベント日のオフセットを求める（events は日付昇順に積まれている）
    const nearest = Math.min(
      ...forward.map((e) => Math.round((e.date.getTime() - baseDate.getTime()) / DAY_MS))
    );
    return { events: forward, source: 'forward', dayOffset: nearest };
  }

  // 2. フォールバック: 過去方向に遡り、最も近い 1 日分を採用する
  const backwardMaxDays = readFeatureEventBackwardMaxDays();
  for (let i = 1; i <= backwardMaxDays; i++) {
    const events = eventsOnOffset(-i);
    if (events.length > 0) {
      return { events, source: 'backward', dayOffset: -i };
    }
  }

  // 3. 最後の手段: 窓の翌日以降（8 日目 = オフセット +7 以降）の未来方向
  const extendedForwardMaxDays = readFeatureEventExtendedForwardMaxDays();
  for (let i = forwardWindowDays; i <= extendedForwardMaxDays; i++) {
    const events = eventsOnOffset(i);
    if (events.length > 0) {
      return { events, source: 'extended-forward', dayOffset: i };
    }
  }

  return { events: [], source: 'none' };
}

/**
 * デバッグ用: 指定月のイベントを全て表示
 */
export function debugShowMonthEvents(year: number, month: number): void {
  const eventsData = loadJapaneseEvents();

  console.log(`=== ${year}年${month}月のイベント ===`);

  for (const event of eventsData.events) {
    if (event.month !== month) continue;

    if (event.day !== undefined) {
      console.log(`  ${month}/${event.day}: ${event.name}`);
    } else if (event.dayRange !== undefined) {
      console.log(`  ${month}/${event.dayRange[0]}-${event.dayRange[1]}: ${event.name}`);
    } else if (event.week !== undefined && event.dayOfWeek !== undefined) {
      const date = getNthWeekdayOfMonth(year, month, event.week, event.dayOfWeek);
      console.log(`  ${month}/${getJstDateParts(date).day} (第${event.week}週): ${event.name}`);
    }
  }
}

// CLI実行用
if (import.meta.url === `file://${process.argv[1]}`) {
  const today = new Date();
  console.log(`基準日: ${getJstDateString(today)} (JST)`);
  console.log('');

  const selection = selectFeatureEventCandidates(today);

  if (selection.source === 'none') {
    console.log('前後の探索範囲にイベントはありません');
  } else {
    console.log(`イベント（${selection.source}${selection.dayOffset !== undefined ? ` / ${selection.dayOffset >= 0 ? '+' : ''}${selection.dayOffset}日` : ''}）:`);
    for (const event of selection.events) {
      console.log(`  ${getJstDateString(event.date)}: ${event.name} (${event.gameThemeHint})`);
    }
  }
}
