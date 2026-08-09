/**
 * classic-pool.ts のユニットテスト（Red → Green）
 *
 * 名作枠の母集団しきい値判定（§5.4）を検証する。fetch-igdb.ts / fetch-data.ts の
 * どちらにも依存しない純関数のみを対象とする。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DEFAULT_CLASSIC_TOTAL_RATING_MIN,
  DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN,
  meetsClassicPoolThresholds,
} from './classic-pool.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('既定値の定数', () => {
  it('DEFAULT_CLASSIC_TOTAL_RATING_MIN は 85', () => {
    expect(DEFAULT_CLASSIC_TOTAL_RATING_MIN).toBe(85);
  });

  it('DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN は 200', () => {
    expect(DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN).toBe(200);
  });
});

describe('meetsClassicPoolThresholds（§5.4 母集団条件、既定値 85/200）', () => {
  it('両方が既定閾値以上なら true。片方でも undefined なら false（同じテストで両方確認）', () => {
    expect(meetsClassicPoolThresholds(92, 3548)).toBe(true);
    expect(meetsClassicPoolThresholds(undefined, 3548)).toBe(false);
    expect(meetsClassicPoolThresholds(92, undefined)).toBe(false);
    expect(meetsClassicPoolThresholds(undefined, undefined)).toBe(false);
  });

  it('境界値: total_rating_count がちょうど 200 なら true、199 なら false（同じテストで両方確認、rating は固定で85丁度）', () => {
    expect(meetsClassicPoolThresholds(85, 200)).toBe(true);
    expect(meetsClassicPoolThresholds(85, 199)).toBe(false);
  });

  it('境界値: total_rating がちょうど 85 なら true、84 なら false（同じテストで両方確認、count は固定で200丁度）', () => {
    expect(meetsClassicPoolThresholds(85, 200)).toBe(true);
    expect(meetsClassicPoolThresholds(84, 200)).toBe(false);
  });

  it('Splatoon Raiders の実測値（total=91, n=7）は新条件で確実に落ちる。同じテストでポジティブコントロール（total=92, n=3548）が通ることも確認する', () => {
    // 実測値そのもの（管理者が本日ライブAPIで確認済み）: 現行 igdbRating>=85 経路で誤選定されていた
    expect(meetsClassicPoolThresholds(91, 7)).toBe(false);
    // ポジティブコントロール: Main Game で評価母数十分な候補は通る
    expect(meetsClassicPoolThresholds(92, 3548)).toBe(true);
  });
});

describe('環境変数による閾値の上書き（呼び出し時に process.env を読む）', () => {
  it('CLASSIC_TOTAL_RATING_MIN / CLASSIC_TOTAL_RATING_COUNT_MIN を上書きできる', () => {
    vi.stubEnv('CLASSIC_TOTAL_RATING_MIN', '90');
    vi.stubEnv('CLASSIC_TOTAL_RATING_COUNT_MIN', '300');

    // 既定値なら通るはずの 85/250 は、上書き後の 90/300 では落ちる
    expect(meetsClassicPoolThresholds(85, 250)).toBe(false);
    // 上書き後の閾値ちょうどなら通る
    expect(meetsClassicPoolThresholds(90, 300)).toBe(true);
  });

  it('CLASSIC_TOTAL_RATING_COUNT_MIN=0 を指定した場合、既定値(200)に化けず 0 のまま使われる（`Number(x) || default` 禁止の検証）', () => {
    vi.stubEnv('CLASSIC_TOTAL_RATING_COUNT_MIN', '0');

    // 閾値が 0 になっていれば total_rating_count=0 でも通る（rating は既定 85 以上を満たす前提）
    expect(meetsClassicPoolThresholds(85, 0)).toBe(true);
  });

  it('CLASSIC_TOTAL_RATING_MIN=0 を指定した場合、既定値(85)に化けず 0 のまま使われる', () => {
    vi.stubEnv('CLASSIC_TOTAL_RATING_MIN', '0');

    expect(meetsClassicPoolThresholds(0, 200)).toBe(true);
  });

  it('数値でない環境変数は既定値にフォールバックする', () => {
    vi.stubEnv('CLASSIC_TOTAL_RATING_MIN', 'not-a-number');
    vi.stubEnv('CLASSIC_TOTAL_RATING_COUNT_MIN', 'also-not-a-number');

    expect(meetsClassicPoolThresholds(85, 200)).toBe(true);
    expect(meetsClassicPoolThresholds(84, 200)).toBe(false);
  });

  it('空文字の環境変数は既定値にフォールバックする', () => {
    vi.stubEnv('CLASSIC_TOTAL_RATING_MIN', '');
    vi.stubEnv('CLASSIC_TOTAL_RATING_COUNT_MIN', '');

    expect(meetsClassicPoolThresholds(85, 200)).toBe(true);
  });
});
