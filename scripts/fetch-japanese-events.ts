/**
 * 日本のイベント・記念日データ取得
 * japanese-events.json を読み込み、指定期間のイベントを取得する
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { startOfMonth, addDays, getDay, setDay, addWeeks } from 'date-fns';

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
 * 第n週のx曜日の日付を計算
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
  // 月の最初の日を取得
  const firstDay = startOfMonth(new Date(year, month - 1, 1));

  // 月の最初のx曜日を取得
  const firstDayOfWeek = getDay(firstDay);
  let firstTargetDay: Date;

  if (firstDayOfWeek <= dayOfWeek) {
    // 最初の週にx曜日がある
    firstTargetDay = setDay(firstDay, dayOfWeek, { weekStartsOn: 0 });
  } else {
    // 最初の週にx曜日がない場合、翌週のx曜日
    firstTargetDay = addDays(setDay(firstDay, dayOfWeek, { weekStartsOn: 0 }), 7);
  }

  // 第n週なので (n-1) 週分を加算
  return addWeeks(firstTargetDay, week - 1);
}

/**
 * イベントが指定日に該当するかチェック
 */
function isEventOnDate(event: JapaneseEvent, targetDate: Date): boolean {
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();

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
    return (
      eventDate.getFullYear() === targetYear &&
      eventDate.getMonth() + 1 === targetMonth &&
      eventDate.getDate() === targetDay
    );
  }

  return false;
}

/**
 * 指定日から直近n日間のイベントを取得
 * @param baseDate 基準日
 * @param days 取得する日数（デフォルト7日）
 */
export function getEventsInRange(
  baseDate: Date,
  days: number = 7
): ResolvedEvent[] {
  const eventsData = loadJapaneseEvents();
  const results: ResolvedEvent[] = [];

  // 基準日からn日間をチェック
  for (let i = 0; i < days; i++) {
    const checkDate = addDays(baseDate, i);

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
      console.log(`  ${month}/${date.getDate()} (第${event.week}週): ${event.name}`);
    }
  }
}

// CLI実行用
if (import.meta.url === `file://${process.argv[1]}`) {
  const today = new Date();
  console.log(`基準日: ${today.toISOString().split('T')[0]}`);
  console.log('');

  const events = getEventsInRange(today, 7);

  if (events.length === 0) {
    console.log('直近7日間にイベントはありません');
  } else {
    console.log('直近7日間のイベント:');
    for (const event of events) {
      const dateStr = event.date.toISOString().split('T')[0];
      console.log(`  ${dateStr}: ${event.name} (${event.gameThemeHint})`);
    }
  }
}
