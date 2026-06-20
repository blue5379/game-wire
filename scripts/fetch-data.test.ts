/**
 * fetch-data ヘルパーのユニットテスト
 *
 * Issue #94: Steam Storefront 補完で導入した正規化・品質ガード関数。
 */

import { describe, it, expect } from 'vitest';
import { parseSteamReleaseDate, isQualifiedCompanyName } from './fetch-data.js';

describe('parseSteamReleaseDate', () => {
  it('Steam Storefront の "YYYY年M月D日" 形式を YYYY-MM-DD に正規化する', () => {
    expect(parseSteamReleaseDate('2026年6月9日')).toBe('2026-06-09');
  });

  it('1桁の月日もゼロ埋めする', () => {
    expect(parseSteamReleaseDate('2024年1月3日')).toBe('2024-01-03');
  });

  it('2桁の月日はそのまま', () => {
    expect(parseSteamReleaseDate('2025年12月31日')).toBe('2025-12-31');
  });

  it('undefined / 空文字は undefined を返す', () => {
    expect(parseSteamReleaseDate(undefined)).toBeUndefined();
    expect(parseSteamReleaseDate('')).toBeUndefined();
  });

  it('未確定文字列（"Coming Soon" 等）は undefined を返す', () => {
    expect(parseSteamReleaseDate('Coming Soon')).toBeUndefined();
    expect(parseSteamReleaseDate('近日公開')).toBeUndefined();
    expect(parseSteamReleaseDate('Q4 2026')).toBeUndefined();
  });

  it('英語フォーマットは未対応として undefined を返す', () => {
    expect(parseSteamReleaseDate('Jun 9, 2026')).toBeUndefined();
  });
});

describe('isQualifiedCompanyName', () => {
  it('通常の会社名は採用する', () => {
    expect(isQualifiedCompanyName('Square Enix')).toBe(true);
    expect(isQualifiedCompanyName('THQ Nordic')).toBe(true);
    expect(isQualifiedCompanyName('Mega Crit Games')).toBe(true);
    expect(isQualifiedCompanyName('Alkimia Interactive')).toBe(true);
  });

  it('日本語混在の会社名は採用する', () => {
    expect(isQualifiedCompanyName('株式会社カプコン')).toBe(true);
    expect(isQualifiedCompanyName('スクウェア・エニックス')).toBe(true);
  });

  it('Steam アカウント名そのままの形式（小文字英数字+_、20文字未満）は除外する', () => {
    expect(isQualifiedCompanyName('lemorion_1224')).toBe(false);
    expect(isQualifiedCompanyName('user123')).toBe(false);
    expect(isQualifiedCompanyName('a_b_c')).toBe(false);
  });

  it('長い英数字+_ の文字列は会社名として採用する（20文字以上）', () => {
    expect(isQualifiedCompanyName('long_company_name_here')).toBe(true);
  });

  it('スペース等を含む短い会社名は採用する（記号で account-name 判定を抜ける）', () => {
    expect(isQualifiedCompanyName('id Software')).toBe(true);
    expect(isQualifiedCompanyName('505 Games')).toBe(true);
  });

  it('短い純英数字（"EA" "2K" 等）は account-name 判定で除外される（仕様: 過剰削除を許容）', () => {
    // Steam Storefront は通常フルネーム（"Electronic Arts" 等）を返すため、
    // この false-negative は実運用上ほぼ問題にならない。
    expect(isQualifiedCompanyName('EA')).toBe(false);
    expect(isQualifiedCompanyName('2K')).toBe(false);
  });

  it('空文字は除外する', () => {
    expect(isQualifiedCompanyName('')).toBe(false);
  });
});
