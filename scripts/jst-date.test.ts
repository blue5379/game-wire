import { describe, it, expect } from 'vitest';
import { getJstDateString, getJstDayStartUnixSec } from './jst-date.js';

describe('getJstDateString', () => {
  it('UTC と JST で日付が変わる境界（JST 8/15 0時 = UTC 8/14 15:00）で JST 日付を返す', () => {
    const d = new Date('2026-08-14T15:00:00Z'); // JST 8/15 0:00:00
    expect(getJstDateString(d)).toBe('2026-08-15');
  });

  it('UTC と JST で日付が変わる境界の直前（JST 8/14 23:59:59）で JST 日付を返す', () => {
    const d = new Date('2026-08-14T14:59:59Z'); // JST 8/14 23:59:59
    expect(getJstDateString(d)).toBe('2026-08-14');
  });

  it('UTC 日付が JST より1日早い場合でも JST 日付を返す', () => {
    const d = new Date('2026-08-15T00:00:00Z'); // JST 8/15 9:00:00
    expect(getJstDateString(d)).toBe('2026-08-15');
  });

  it('Invalid Date の場合は空文字列を返す', () => {
    const d = new Date('not-a-date');
    expect(getJstDateString(d)).toBe('');
  });

  it('通常の日付で正しく JST 日付を返す', () => {
    const d = new Date('2026-08-15T12:00:00Z'); // JST 8/15 21:00:00
    expect(getJstDateString(d)).toBe('2026-08-15');
  });

  // 分・秒が結果に影響しないことを明示的に検証
  it('JST 日境界直前（ミリ秒単位）で日付が変わらない', () => {
    const d = new Date('2026-08-14T14:59:59.999Z'); // JST 8/14 23:59:59.999
    expect(getJstDateString(d)).toBe('2026-08-14');
  });

  it('JST 日境界ちょうど（ミリ秒単位）で日付が変わる', () => {
    const d = new Date('2026-08-14T15:00:00.000Z'); // JST 8/15 0:00:00.000
    expect(getJstDateString(d)).toBe('2026-08-15');
  });
});

describe('getJstDayStartUnixSec', () => {
  it('JST 当日0時の Unix 秒を返す（UTC 0時入力）', () => {
    const now = new Date('2026-08-15T00:00:00Z'); // JST 8/15 9:00
    const result = getJstDayStartUnixSec(now);
    // JST 8/15 0:00 = UTC 8/14 15:00 = Unix 1786719600
    expect(result).toBe(1786719600);
  });

  it('JST 当日0時の Unix 秒を返す（JST 0時入力）', () => {
    const now = new Date('2026-08-15T00:00:00+09:00'); // JST 8/15 0:00
    const result = getJstDayStartUnixSec(now);
    expect(result).toBe(1786719600);
  });

  it('JST 23:59:59 でも当日0時を返す', () => {
    const now = new Date('2026-08-15T14:59:59Z'); // JST 8/15 23:59:59
    const result = getJstDayStartUnixSec(now);
    expect(result).toBe(1786719600);
  });
});
