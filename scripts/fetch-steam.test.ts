import { describe, it, expect } from 'vitest';
import { isSameSteamApp } from './fetch-steam';

describe('isSameSteamApp - Issue #102 appId 取り違え検出', () => {
  // Vol.12 動作確認で実際に観測された取り違えケース
  it('「サイバーパンク2077 アルティメットエディション」 vs 「STAR WARS™ Empire at War - Gold Pack」→ 別ゲーム', () => {
    expect(
      isSameSteamApp(
        'サイバーパンク2077 アルティメットエディション',
        'STAR WARS™ Empire at War - Gold Pack'
      )
    ).toBe(false);
  });

  it('完全一致 → 同じゲーム', () => {
    expect(isSameSteamApp('Cyberpunk 2077', 'Cyberpunk 2077')).toBe(true);
  });

  it('前方一致（エディション拡張）→ 同じゲーム', () => {
    // Steam の Featured Categories が短縮名、Storefront が正式名というパターン
    expect(
      isSameSteamApp('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')
    ).toBe(true);
    expect(
      isSameSteamApp(
        'Cyberpunk 2077 アルティメットエディション',
        'Cyberpunk 2077'
      )
    ).toBe(true);
  });

  it('™ ® © の有無に関わらず一致', () => {
    expect(isSameSteamApp('Counter-Strike™ 2', 'Counter-Strike 2')).toBe(true);
  });

  it('大文字小文字の違いを無視', () => {
    expect(isSameSteamApp('CYBERPUNK 2077', 'cyberpunk 2077')).toBe(true);
  });

  it('空白の有無を無視', () => {
    expect(isSameSteamApp('Half Life 2', 'Half-Life 2')).toBe(true);
  });

  it('全く違うゲーム → 別ゲーム', () => {
    expect(isSameSteamApp('Dota 2', 'Counter-Strike 2')).toBe(false);
  });

  it('空文字は検証保留（true 扱い）', () => {
    expect(isSameSteamApp('', 'Anything')).toBe(true);
    expect(isSameSteamApp('Anything', '')).toBe(true);
  });

  it('短いタイトルでもプレフィックス一致しなければ別ゲーム', () => {
    // 'Doom' vs 'Doomsday' は 4/4=100% 共通だが、'Doom' がプレフィックスなので true
    expect(isSameSteamApp('Doom', 'Doomsday')).toBe(true);
    // 'Star Wars' vs 'Star Trek' は 'star' まで共通=4/8=50% → false
    expect(isSameSteamApp('Star Wars', 'Star Trek')).toBe(false);
  });

  it('日本語タイトルでも完全一致なら true', () => {
    expect(
      isSameSteamApp(
        'モンスターハンターワイルズ',
        'モンスターハンターワイルズ'
      )
    ).toBe(true);
  });

  it('日本語タイトル vs 英語タイトル（同ゲーム）→ false（言語差は別途吸収する設計）', () => {
    // この関数は Featured Categories と Storefront API を「同じ言語パラメータで」取得した
    // 結果同士の比較を想定している。多言語クロスチェックは行わない。
    expect(
      isSameSteamApp('エーペックスレジェンズ', 'Apex Legends')
    ).toBe(false);
  });
});
