/**
 * steam-utils のユニットテスト
 *
 * detectEarlyAccessFromSteamGenres（Issue #26）: Steam Storefront appdetails の `genres` から
 * 早期アクセス配信中かを判定する。実測（2026-08-14、cc=jp&l=japanese）で得た形の
 * レスポンスを再現して検証する。
 *   - appId=2868840 `Slay the Spire 2` → genres: ["23:インディー","2:ストラテジー","70:早期アクセス"]
 *   - appId=2597080 `Realm of Ink`     → genres: ["1:アクション","25:アドベンチャー","23:インディー","3:RPG"]（EAなし）
 */

import { describe, it, expect } from 'vitest';
import {
  detectEarlyAccessFromSteamGenres,
  STEAM_GENRE_ID_EARLY_ACCESS,
} from './steam-utils.js';

describe('detectEarlyAccessFromSteamGenres（Issue #26。仕様 §2.9）', () => {
  it('`Slay the Spire 2` 相当（id "70" を含む）で true', () => {
    const genres = [
      { id: '23', description: 'インディー' },
      { id: '2', description: 'ストラテジー' },
      { id: '70', description: '早期アクセス' },
    ];
    expect(detectEarlyAccessFromSteamGenres(genres)).toBe(true);
  });

  it('`Realm of Ink` 相当（id "70" を含まない）で false', () => {
    const genres = [
      { id: '1', description: 'アクション' },
      { id: '25', description: 'アドベンチャー' },
      { id: '23', description: 'インディー' },
      { id: '3', description: 'RPG' },
    ];
    expect(detectEarlyAccessFromSteamGenres(genres)).toBe(false);
  });

  it('genres が undefined なら undefined（「早期アクセスではない」と断定しない）', () => {
    // appdetails 取得失敗・genres 欠落時に false を返すと、未判定と判定済みが区別できなくなる
    expect(detectEarlyAccessFromSteamGenres(undefined)).toBeUndefined();
  });

  it('genres が空配列なら false（取得できた上で早期アクセスジャンルが無い）', () => {
    expect(detectEarlyAccessFromSteamGenres([])).toBe(false);
  });

  it('id が数値 70 で返ってきても true（appdetails は文字列だが型の揺れに耐える）', () => {
    expect(detectEarlyAccessFromSteamGenres([{ id: 70, description: 'Early Access' }])).toBe(true);
  });

  it('description が「早期アクセス」でも id が 70 でなければ false（id を正とする）', () => {
    expect(detectEarlyAccessFromSteamGenres([{ id: '23', description: '早期アクセス' }])).toBe(false);
  });

  it('id が "700" や "7" では true にならない（部分一致で誤判定しない）', () => {
    expect(detectEarlyAccessFromSteamGenres([{ id: '700', description: 'x' }])).toBe(false);
    expect(detectEarlyAccessFromSteamGenres([{ id: '7', description: 'x' }])).toBe(false);
  });

  it('要素が null / id 欠落でも例外を投げず false', () => {
    expect(
      detectEarlyAccessFromSteamGenres([null as unknown as { id?: unknown }, { description: 'x' }])
    ).toBe(false);
  });

  it('早期アクセスのジャンル ID は文字列 "70"（appdetails のレスポンス型に合わせている）', () => {
    expect(STEAM_GENRE_ID_EARLY_ACCESS).toBe('70');
  });
});
