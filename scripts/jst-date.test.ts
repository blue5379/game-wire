import { describe, it, expect } from 'vitest';
import { getJstDateString, getJstDayStartUnixSec, resolvePublishDateString } from './jst-date.js';

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

describe('resolvePublishDateString', () => {
  describe('PUBLISH_DATE 未指定（schedule 実行の経路。Issue #308）', () => {
    // 本命の回帰テスト: cron `0 21 * * 5` は金曜 UTC 21:00 に発火する。
    // 修正前の `new Date().toISOString().split('T')[0]` は UTC 基準なので金曜を返していた。
    it('cron の発火時刻（金曜 UTC 21:00 = 土曜 JST 6:00）で土曜の JST 日付を返す', () => {
      const now = new Date('2026-08-14T21:00:00Z'); // 金曜 UTC 21:00 = 土曜 JST 6:00
      const result = resolvePublishDateString(undefined, now);

      expect(result).toBe('2026-08-15');
      // UTC 基準だと 2026-08-14（金）になる。土曜であることまで検証する
      expect(new Date('2026-08-14T21:00:00Z').getUTCDay()).toBe(5); // 修正前の値は金曜
      expect(new Date(result).getUTCDay()).toBe(6); // 修正後の値は土曜
    });

    it('JST 日境界の直前（金曜 JST 23:59:59 = 金曜 UTC 14:59:59）では金曜を返す', () => {
      const now = new Date('2026-08-14T14:59:59Z'); // 金曜 JST 23:59:59
      expect(resolvePublishDateString(undefined, now)).toBe('2026-08-14');
    });

    it('JST 日境界ちょうど（土曜 JST 0:00 = 金曜 UTC 15:00）で土曜に切り替わる', () => {
      const now = new Date('2026-08-14T15:00:00Z'); // 土曜 JST 0:00:00
      expect(resolvePublishDateString(undefined, now)).toBe('2026-08-15');
    });

    it('UTC 側がまだ前日の時刻帯（土曜 JST 8:59 = 金曜 UTC 23:59）でも土曜を返す', () => {
      const now = new Date('2026-08-14T23:59:00Z'); // 土曜 JST 8:59
      expect(resolvePublishDateString(undefined, now)).toBe('2026-08-15');
    });

    it('月をまたぐ JST 日境界でも JST 側の日付を返す', () => {
      const now = new Date('2026-08-31T15:00:00Z'); // JST 9/1 0:00
      expect(resolvePublishDateString(undefined, now)).toBe('2026-09-01');
    });

    it('年をまたぐ JST 日境界でも JST 側の日付を返す', () => {
      const now = new Date('2026-12-31T15:00:00Z'); // JST 2027/1/1 0:00
      expect(resolvePublishDateString(undefined, now)).toBe('2027-01-01');
    });

    it('空文字列（schedule 実行で inputs.publish_date が空になる場合）は JST 当日を返す', () => {
      const now = new Date('2026-08-14T21:00:00Z');
      expect(resolvePublishDateString('', now)).toBe('2026-08-15');
    });

    it('空白のみの値も未指定として扱う', () => {
      const now = new Date('2026-08-14T21:00:00Z');
      expect(resolvePublishDateString('   ', now)).toBe('2026-08-15');
    });

    // getJstDateString は Invalid Date に空文字列を返すため、そのまま返すと契約が破れる
    it('基準時刻が Invalid Date の場合は空文字列を返さず例外を投げる', () => {
      expect(() => resolvePublishDateString(undefined, new Date('not-a-date'))).toThrow(/Invalid Date/);
    });
  });

  describe('PUBLISH_DATE 明示指定（workflow_dispatch の経路。従来どおり効くこと）', () => {
    it('指定された日付をそのまま返す（現在時刻に依存しない）', () => {
      const now = new Date('2026-08-14T21:00:00Z');
      expect(resolvePublishDateString('2026-06-19', now)).toBe('2026-06-19');
    });

    it('前後の空白は取り除いて返す', () => {
      expect(resolvePublishDateString(' 2026-06-19 ', new Date('2026-08-14T21:00:00Z'))).toBe('2026-06-19');
    });

    it('うるう日を受け付ける', () => {
      expect(resolvePublishDateString('2028-02-29', new Date('2026-08-14T21:00:00Z'))).toBe('2028-02-29');
    });
  });

  describe('不正な PUBLISH_DATE は生成前に落とす', () => {
    // 不正値のまま通すと build-issue.ts の format() が Invalid Date で落ちる。
    // Bedrock の生成コストを払った後に失敗するため、入口で弾く。
    //
    // 形式チェックと実在チェックはどちらも「例外を投げる」ので、投げたことだけを
    // 検証すると片方を外しても気づけない（実際にミュータント検証で形式チェックを
    // 外しても実在チェックが同じ入力を捕まえて通ってしまった）。
    // どちらの理由で落ちたかまで検証して、2つの分岐を別々に固定する。
    it.each([
      ['2026-8-5', 'ゼロ埋めされていない'],
      ['2026/08/15', 'スラッシュ区切り'],
      ['20260815', '区切りなし'],
      ['2026-08-15T00:00:00Z', '時刻付き'],
      ['today', '日付ではない文字列'],
      ['2026-08-15-01', '余分な要素'],
      ['26-08-15', '2桁の年'],
    ])('形式が不正な "%s" は形式エラーとして落ちる（%s）', (value) => {
      expect(() => resolvePublishDateString(value, new Date('2026-08-14T21:00:00Z'))).toThrow(
        /PUBLISH_DATE は YYYY-MM-DD 形式/
      );
    });

    it.each([
      ['2026-02-30', '2月30日は存在しない'],
      ['2027-02-29', 'うるう年ではない年の2月29日'],
      ['2026-13-01', '13月'],
      ['2026-00-10', '0月'],
      ['2026-08-32', '32日'],
      ['2026-08-00', '0日'],
    ])('存在しない日付 "%s" は実在エラーとして落ちる（%s）', (value) => {
      expect(() => resolvePublishDateString(value, new Date('2026-08-14T21:00:00Z'))).toThrow(
        /存在しない日付/
      );
    });
  });

  describe('戻り値の形式（PR-C が依存する不変条件）', () => {
    // PR-C（#309）の getReleaseStatus は publishDate を JST カレンダー日付に落として
    // 比較する。その前提として publishDate が UTC 0 時であること（= 戻り値が
    // 時刻を含まない YYYY-MM-DD であること）を固定する。
    it('戻り値は new Date() で UTC 0 時にパースされる', () => {
      const result = resolvePublishDateString(undefined, new Date('2026-08-14T21:00:00Z'));
      expect(new Date(result).toISOString()).toBe('2026-08-15T00:00:00.000Z');
    });

    it('戻り値を getJstDateString に通しても同じ日付になる', () => {
      const result = resolvePublishDateString(undefined, new Date('2026-08-14T21:00:00Z'));
      expect(getJstDateString(new Date(result))).toBe(result);
    });
  });
});
