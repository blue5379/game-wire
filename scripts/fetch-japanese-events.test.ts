/**
 * fetch-japanese-events.ts のユニットテスト（Issue #310 / PR-F、Issue #324）
 *
 * 検証対象は 2 つある。
 *
 * 1. **特集のイベント探索（§4.4）**: 通常は未来方向 7 日、0 件なら過去方向に最大 7 日、
 *    それでも 0 件なら 8 日目以降の未来方向、という段階的フォールバック
 *    （`selectFeatureEventCandidates`）。境界値（過去 7 日ちょうど / 8 日前）と
 *    「通常週の挙動が不変」を固定する。
 * 2. **タイムゾーン非依存（Issue #324）**: `isEventOnDate` はローカル時刻のゲッターで
 *    UTC 0 時の Date を読んでいたため、負オフセットの TZ で 1 日ずれていた
 *    （実測: `TZ=America/Los_Angeles` で 2026 年のイベント 0 件週が 5 週 → 3 週に変わり、
 *    記念日の日付がすべて 1 日ずれる）。JST カレンダー日付で解釈することで、
 *    どの TZ でも同じ結果になることを固定する。
 *
 * 実データ（`data/japanese-events.json` version 1.2 / 127 件）に依存するテストと、
 * 合成データを注入するテストを分けている。境界値は合成データで作る
 * （実データには「ちょうど 7 日前だけに記念日がある」都合のよい日付が無いため）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  getEventsInRange,
  getNthWeekdayOfMonth,
  loadJapaneseEvents,
  selectFeatureEventCandidates,
  DEFAULT_FEATURE_EVENT_FORWARD_WINDOW_DAYS,
  DEFAULT_FEATURE_EVENT_BACKWARD_MAX_DAYS,
  DEFAULT_FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS,
} from './fetch-japanese-events.js';
import type { JapaneseEvent, JapaneseEventsData } from './fetch-japanese-events.js';

/** 合成イベントデータ（固定日） */
function fixedDay(month: number, day: number, name: string): JapaneseEvent {
  return { month, day, name, gameThemeHint: `${name}のヒント` };
}

function makeData(events: JapaneseEvent[]): JapaneseEventsData {
  return { version: 'test', events };
}

/** UTC 0 時の Date（本番の publishDate と同じ形。`new Date('YYYY-MM-DD')` と等価） */
function d(iso: string): Date {
  return new Date(iso);
}

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

describe('既定値（§4.4 / 付録「特集」のパラメータ表）', () => {
  it('未来方向の探索窓は 7 日、過去方向の遡り上限は 7 日', () => {
    expect(DEFAULT_FEATURE_EVENT_FORWARD_WINDOW_DAYS).toBe(7);
    expect(DEFAULT_FEATURE_EVENT_BACKWARD_MAX_DAYS).toBe(7);
  });

  it('拡張未来方向の上限は、2026 年のイベント無し最長連続 12 日を十分に超える', () => {
    // 過去 7 日 + 未来 7 日がすべて空 = 14 日の空白がある週だけ拡張探索に到達する。
    // 実データの最長空白は 12 日（2026-05-19 起点。実測）なので 2026 年では到達しないが、
    // japanese-events.json の改訂に備えて上限を持たせている。
    expect(DEFAULT_FEATURE_EVENT_EXTENDED_FORWARD_MAX_DAYS).toBeGreaterThan(14);
  });
});

describe('getNthWeekdayOfMonth', () => {
  it('2026 年 6 月の第 3 日曜日は 6/21（父の日）', () => {
    const date = getNthWeekdayOfMonth(2026, 6, 3, 0);
    expect(date.toISOString().slice(0, 10)).toBe('2026-06-21');
  });

  it('2026 年 1 月の第 2 月曜日は 1/12（成人の日）', () => {
    const date = getNthWeekdayOfMonth(2026, 1, 2, 1);
    expect(date.toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  it('月初がその曜日の場合は月初を第 1 週として扱う（2026-03-01 は日曜）', () => {
    const date = getNthWeekdayOfMonth(2026, 3, 1, 0);
    expect(date.toISOString().slice(0, 10)).toBe('2026-03-01');
  });
});

describe('getEventsInRange — 探索窓の境界', () => {
  const data = makeData([
    fixedDay(3, 10, '基準日イベント'),
    fixedDay(3, 16, '7 日目イベント'),
    fixedDay(3, 17, '8 日目イベント'),
  ]);

  it('基準日当日（オフセット 0）を含む', () => {
    const names = getEventsInRange(d('2026-03-10'), 7, data).map((e) => e.name);
    expect(names).toContain('基準日イベント');
  });

  it('7 日窓の最終日（オフセット +6）を含む', () => {
    const names = getEventsInRange(d('2026-03-10'), 7, data).map((e) => e.name);
    expect(names).toContain('7 日目イベント');
  });

  it('7 日窓の翌日（オフセット +7）は含まない', () => {
    const names = getEventsInRange(d('2026-03-10'), 7, data).map((e) => e.name);
    expect(names).not.toContain('8 日目イベント');
  });

  it('期間イベント（dayRange）は範囲内の各日に該当する', () => {
    const rangeData = makeData([
      { month: 8, dayRange: [13, 16], name: 'お盆', gameThemeHint: 'ホラー' },
    ]);
    expect(getEventsInRange(d('2026-08-13'), 1, rangeData).map((e) => e.name)).toEqual(['お盆']);
    expect(getEventsInRange(d('2026-08-16'), 1, rangeData).map((e) => e.name)).toEqual(['お盆']);
    expect(getEventsInRange(d('2026-08-17'), 1, rangeData)).toEqual([]);
  });

  it('第 n 週 x 曜日イベントは該当日のみ検出する（父の日 = 2026-06-21）', () => {
    const weekData = makeData([
      { month: 6, week: 3, dayOfWeek: 0, name: '父の日', gameThemeHint: '家族' },
    ]);
    expect(getEventsInRange(d('2026-06-21'), 1, weekData).map((e) => e.name)).toEqual(['父の日']);
    expect(getEventsInRange(d('2026-06-20'), 1, weekData)).toEqual([]);
    expect(getEventsInRange(d('2026-06-22'), 1, weekData)).toEqual([]);
  });
});

describe('タイムゾーン非依存（Issue #324）', () => {
  // 負オフセット（LA / ホノルル）と大きな正オフセット（キリバス）を含める。
  // 修正前は負オフセットで 1 日前のイベントを拾っていた。
  const TIMEZONES = ['Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Kiritimati'];

  it('固定日イベントはどの TZ でも同じ日に該当する（バレンタインデー = 2/14）', () => {
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      const names = getEventsInRange(d('2026-02-14'), 1).map((e) => e.name);
      expect(names, `TZ=${tz}`).toContain('バレンタインデー');
      expect(getEventsInRange(d('2026-02-13'), 1).map((e) => e.name), `TZ=${tz}`).not.toContain(
        'バレンタインデー'
      );
    }
  });

  it('第 n 週 x 曜日イベントもどの TZ でも同じ日に該当する（父の日 = 2026-06-21）', () => {
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      const names = getEventsInRange(d('2026-06-21'), 1).map((e) => e.name);
      expect(names, `TZ=${tz}`).toContain('父の日');
    }
  });

  it('2026 年のイベント 0 件週（土曜基準 5 週）はどの TZ でも同じ顔ぶれになる', () => {
    const saturdays: string[] = [];
    for (
      let cur = new Date(Date.UTC(2026, 0, 3)); // 2026-01-03 は土曜
      cur.getUTCFullYear() === 2026;
      cur = new Date(cur.getTime() + 7 * 86400000)
    ) {
      saturdays.push(cur.toISOString().slice(0, 10));
    }
    expect(saturdays).toHaveLength(52);

    const zeroWeeksByTz = new Map<string, string[]>();
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      zeroWeeksByTz.set(
        tz,
        saturdays.filter((s) => getEventsInRange(d(s), 7).length === 0)
      );
    }

    // 実測値（2026-08-13。JST / UTC で確認）。修正前は TZ=America/Los_Angeles で 3 週になっていた
    const expected = ['2026-04-11', '2026-05-23', '2026-06-13', '2026-08-22', '2026-09-12'];
    for (const tz of TIMEZONES) {
      expect(zeroWeeksByTz.get(tz), `TZ=${tz}`).toEqual(expected);
    }
  });

  it('過去方向フォールバックの採用結果もどの TZ でも同じになる', () => {
    for (const tz of TIMEZONES) {
      process.env.TZ = tz;
      const selection = selectFeatureEventCandidates(d('2026-04-11'));
      expect(selection.source, `TZ=${tz}`).toBe('backward');
      expect(selection.dayOffset, `TZ=${tz}`).toBe(-1);
      expect(selection.events.map((e) => e.name), `TZ=${tz}`).toEqual(['駅弁の日']);
    }
  });
});

describe('selectFeatureEventCandidates — 通常週（未来方向 7 日）', () => {
  it('未来方向にイベントがある週は getEventsInRange(publishDate, 7) と完全に同じ結果を返す', () => {
    // 2026-02-07（土）: 未来方向にイベントがある通常週
    const selection = selectFeatureEventCandidates(d('2026-02-07'));
    expect(selection.source).toBe('forward');
    expect(selection.events).toEqual(getEventsInRange(d('2026-02-07'), 7));
  });

  it('2026 年の全 52 土曜のうち、0 件週 5 週以外はすべて forward で既存の窓と一致する（挙動不変）', () => {
    const zeroWeeks = new Set(['2026-04-11', '2026-05-23', '2026-06-13', '2026-08-22', '2026-09-12']);
    let forwardCount = 0;
    let backwardCount = 0;

    for (
      let cur = new Date(Date.UTC(2026, 0, 3));
      cur.getUTCFullYear() === 2026;
      cur = new Date(cur.getTime() + 7 * 86400000)
    ) {
      const iso = cur.toISOString().slice(0, 10);
      const selection = selectFeatureEventCandidates(cur);
      if (zeroWeeks.has(iso)) {
        expect(selection.source, iso).toBe('backward');
        backwardCount++;
      } else {
        expect(selection.source, iso).toBe('forward');
        expect(selection.events, iso).toEqual(getEventsInRange(cur, 7));
        forwardCount++;
      }
      // どの週もテーマの手がかりを得られる（固定文言に落ちない）
      expect(selection.events.length, iso).toBeGreaterThan(0);
    }

    expect(forwardCount).toBe(47);
    expect(backwardCount).toBe(5);
  });

  it('forward の dayOffset は窓内で最も近いイベント日のオフセット', () => {
    const data = makeData([fixedDay(3, 12, '2 日後'), fixedDay(3, 15, '5 日後')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('forward');
    expect(selection.dayOffset).toBe(2);
    expect(selection.events.map((e) => e.name)).toEqual(['2 日後', '5 日後']);
  });
});

describe('selectFeatureEventCandidates — 0 件週の過去方向フォールバック（§4.3 / §4.4）', () => {
  // Issue #310 / 仕様書 §4.3 の表。土曜基準の 0 件週 5 件すべてで過去方向が採用される
  const cases: Array<{ publishDate: string; eventName: string; dayOffset: number }> = [
    { publishDate: '2026-04-11', eventName: '駅弁の日', dayOffset: -1 },
    { publishDate: '2026-05-23', eventName: '国際博物館の日', dayOffset: -5 },
    { publishDate: '2026-06-13', eventName: '恋人の日', dayOffset: -1 },
    { publishDate: '2026-08-22', eventName: '俳句の日', dayOffset: -3 },
    { publishDate: '2026-09-12', eventName: '救急の日', dayOffset: -3 },
  ];

  for (const c of cases) {
    it(`${c.publishDate} は ${c.dayOffset} 日前の「${c.eventName}」を採用する`, () => {
      const selection = selectFeatureEventCandidates(d(c.publishDate));
      expect(selection.source).toBe('backward');
      expect(selection.dayOffset).toBe(c.dayOffset);
      expect(selection.events.map((e) => e.name)).toEqual([c.eventName]);
      // gameThemeHint がそのまま LLM のゲーム提案に渡るため、空でないことを確認する
      expect(selection.events[0].gameThemeHint.length).toBeGreaterThan(0);
    });
  }

  it('過去方向は「最も近い日」だけを採用し、それより古い記念日は候補に入れない', () => {
    const data = makeData([fixedDay(3, 8, '2 日前'), fixedDay(3, 5, '5 日前')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('backward');
    expect(selection.dayOffset).toBe(-2);
    expect(selection.events.map((e) => e.name)).toEqual(['2 日前']);
  });

  it('同じ日に複数の記念日がある場合は同日分をすべて候補にする', () => {
    const data = makeData([fixedDay(3, 8, '2 日前 A'), fixedDay(3, 8, '2 日前 B')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('backward');
    expect(selection.events.map((e) => e.name)).toEqual(['2 日前 A', '2 日前 B']);
  });

  it('月境界をまたいで遡れる（3/5 発行 → 2/28 の記念日）', () => {
    const data = makeData([fixedDay(2, 28, '前月の記念日')]);
    const selection = selectFeatureEventCandidates(d('2026-03-05'), { eventsData: data });
    expect(selection.source).toBe('backward');
    expect(selection.dayOffset).toBe(-5);
    expect(selection.events.map((e) => e.name)).toEqual(['前月の記念日']);
  });
});

describe('selectFeatureEventCandidates — 過去方向の境界値（ちょうど 7 日前 / 8 日前）', () => {
  it('ちょうど 7 日前の記念日は採用する', () => {
    const data = makeData([fixedDay(3, 3, '7 日前')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('backward');
    expect(selection.dayOffset).toBe(-7);
    expect(selection.events.map((e) => e.name)).toEqual(['7 日前']);
  });

  it('8 日前の記念日は採用しない（過去方向の上限外）', () => {
    const data = makeData([fixedDay(3, 2, '8 日前')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('none');
    expect(selection.events).toEqual([]);
    expect(selection.dayOffset).toBeUndefined();
  });
});

describe('selectFeatureEventCandidates — 拡張未来方向（8 日目以降）', () => {
  it('過去方向が空なら 8 日目（オフセット +7）以降の未来方向を見る', () => {
    const data = makeData([fixedDay(3, 17, '8 日目')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('extended-forward');
    expect(selection.dayOffset).toBe(7);
    expect(selection.events.map((e) => e.name)).toEqual(['8 日目']);
  });

  it('過去方向に候補があれば拡張未来方向より優先する（§4.4 の優先順位）', () => {
    const data = makeData([fixedDay(3, 3, '7 日前'), fixedDay(3, 17, '8 日目')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('backward');
    expect(selection.events.map((e) => e.name)).toEqual(['7 日前']);
  });

  it('拡張未来方向の上限を超える記念日は採用しない', () => {
    const data = makeData([fixedDay(5, 1, '52 日後')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data });
    expect(selection.source).toBe('none');
    expect(selection.events).toEqual([]);
  });

  it('イベントが 1 件も無ければ source=none を返す（固定文言フォールバックは呼び出し側の責務）', () => {
    const selection = selectFeatureEventCandidates(d('2026-03-10'), { eventsData: makeData([]) });
    expect(selection.source).toBe('none');
    expect(selection.events).toEqual([]);
  });
});

describe('selectFeatureEventCandidates — 使用済み記念日の除外（§4.4）', () => {
  it('直近号が使った記念日は過去方向の候補から外し、その次に近い日を採用する', () => {
    const data = makeData([fixedDay(3, 9, '1 日前'), fixedDay(3, 6, '4 日前')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), {
      eventsData: data,
      excludeEventNames: ['1 日前'],
    });
    expect(selection.source).toBe('backward');
    expect(selection.dayOffset).toBe(-4);
    expect(selection.events.map((e) => e.name)).toEqual(['4 日前']);
  });

  it('同日の複数候補のうち、使用済みのものだけを外す', () => {
    const data = makeData([fixedDay(3, 8, '使用済み'), fixedDay(3, 8, '未使用')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), {
      eventsData: data,
      excludeEventNames: ['使用済み'],
    });
    expect(selection.events.map((e) => e.name)).toEqual(['未使用']);
    expect(selection.dayOffset).toBe(-2);
  });

  it('未来方向の窓でも使用済み記念日を外す（発行日がずれて窓が重なった場合の保険）', () => {
    const data = makeData([fixedDay(3, 12, '使用済み'), fixedDay(3, 14, '未使用')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), {
      eventsData: data,
      excludeEventNames: ['使用済み'],
    });
    expect(selection.source).toBe('forward');
    expect(selection.events.map((e) => e.name)).toEqual(['未使用']);
  });

  it('未来方向の候補が除外で全滅したら過去方向にフォールバックする', () => {
    const data = makeData([fixedDay(3, 12, '使用済み'), fixedDay(3, 8, '2 日前')]);
    const selection = selectFeatureEventCandidates(d('2026-03-10'), {
      eventsData: data,
      excludeEventNames: ['使用済み'],
    });
    expect(selection.source).toBe('backward');
    expect(selection.events.map((e) => e.name)).toEqual(['2 日前']);
  });

  it('除外対象が空の Set / 未指定でも通常動作する', () => {
    const data = makeData([fixedDay(3, 12, '2 日後')]);
    expect(
      selectFeatureEventCandidates(d('2026-03-10'), {
        eventsData: data,
        excludeEventNames: new Set<string>(),
      }).events.map((e) => e.name)
    ).toEqual(['2 日後']);
    expect(
      selectFeatureEventCandidates(d('2026-03-10'), { eventsData: data }).events.map((e) => e.name)
    ).toEqual(['2 日後']);
  });
});

describe('loadJapaneseEvents — 実データの前提', () => {
  it('data/japanese-events.json は version 1.2 / 127 件（測定の前提）', () => {
    const data = loadJapaneseEvents();
    expect(data.version).toBe('1.2');
    expect(data.events).toHaveLength(127);
  });
});
