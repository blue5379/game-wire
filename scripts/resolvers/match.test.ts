import { describe, it, expect } from 'vitest';
import { normalizeTitle, isSameGame, matchesAnyTitle } from './match.js';

describe('normalizeTitle', () => {
  it('™ ® © を除去する', () => {
    // ™ の後ろはスペースに置換されるが連続スペース圧縮により 1 スペースに
    expect(normalizeTitle('Counter-Strike™ 2')).toBe('counter strike 2');
    expect(normalizeTitle('Game® Edition')).toBe('game edition');
  });

  it('&amp; を & に変換する', () => {
    expect(normalizeTitle('S&amp;box')).toBe('s&box');
  });

  it('大文字を小文字に変換する（記号→スペースは連続スペース圧縮される）', () => {
    // Half-Life: Alyx → "-" ":" を空白化 → 連続スペース圧縮
    expect(normalizeTitle('Half-Life: Alyx')).toBe('half life alyx');
  });

  it('記号タイトル S&box を正規化できる（& は保持）', () => {
    const norm = normalizeTitle('S&box');
    expect(norm).toBe('s&box');
  });
});

describe('isSameGame', () => {
  it('正規化後に完全一致 → true', () => {
    expect(isSameGame('Cyberpunk 2077', 'Cyberpunk 2077')).toBe(true);
  });

  it('大文字小文字の違いを無視して一致', () => {
    expect(isSameGame('CYBERPUNK 2077', 'cyberpunk 2077')).toBe(true);
  });

  it('™ 有無に関わらず一致', () => {
    expect(isSameGame('Counter-Strike™ 2', 'Counter-Strike 2')).toBe(true);
  });

  it('ハイフンとスペースを同一視して一致', () => {
    expect(isSameGame('Half-Life 2', 'Half Life 2')).toBe(true);
  });

  it('プレフィックス一致・年差なし → true', () => {
    expect(isSameGame('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')).toBe(true);
  });

  it('プレフィックス一致・年差 2年以内 → true', () => {
    // releaseDate が両方あり差が 2 年以内
    expect(isSameGame('Some Game', 'Some Game: DLC', '2022-01-01', '2023-06-01')).toBe(true);
  });

  it('#46 同名異作品: 年差 > 2年 → false', () => {
    // 同名でも年差が 3年を超えると別タイトル扱い
    expect(isSameGame('Doom', 'Doom', '1993-12-10', '2016-05-13')).toBe(false);
  });

  it('プレフィックス一致・年差 3年 → false（#46 対策）', () => {
    expect(isSameGame('SomeGame', 'SomeGame Remastered', '2010-01-01', '2016-01-01')).toBe(false);
  });

  it('全く異なるタイトル → false', () => {
    expect(isSameGame('Dota 2', 'Counter-Strike 2')).toBe(false);
  });

  it('どちらかのタイトルが空文字 → false', () => {
    expect(isSameGame('', 'Any Game')).toBe(false);
    expect(isSameGame('Any Game', '')).toBe(false);
  });

  it('年情報が片方だけ undefined → プレフィックス一致のみで判定', () => {
    expect(isSameGame('My Game', 'My Game Plus', '2020-01-01', undefined)).toBe(true);
    expect(isSameGame('My Game', 'My Game Plus', undefined, '2020-01-01')).toBe(true);
  });

  it('記号タイトル: S&box の正規化後に一致', () => {
    expect(isSameGame('S&box', 'S&box')).toBe(true);
  });

  it('Half-Life: Alyx と Half Life Alyx が一致', () => {
    expect(isSameGame('Half-Life: Alyx', 'Half Life Alyx')).toBe(true);
  });
});

describe('isSameGame — Steam locale 日付フォーマット対応', () => {
  it('appdetails 形式 "Nov 1, 2023" でも年差チェックが機能する', () => {
    // 年末尾フォーマット vs ISO フォーマット → 年差 0 → true
    expect(isSameGame('Doom', 'Doom', '2016-05-13', 'May 13, 2016')).toBe(true);
  });

  it('appdetails 形式で年差 > 2 の場合に reject する', () => {
    // "1 Nov, 2023" 形式のテスト
    expect(isSameGame('Doom', 'Doom', '1993-12-10', 'Dec 10, 1993')).toBe(true);
    expect(isSameGame('Doom', 'Doom', '1993-12-10', 'May 13, 2016')).toBe(false);
  });
});

describe('matchesAnyTitle', () => {
  it('英名・日本語名のどちらかが一致すれば true', () => {
    expect(
      matchesAnyTitle(['Splatoon 3', 'スプラトゥーン3'], 'スプラトゥーン3')
    ).toBe(true);
  });

  it('#108 日本語タイトルでの逆引き', () => {
    expect(
      matchesAnyTitle(['めっちゃカメレオン', 'MECCHA CHAMELEON'], 'めっちゃカメレオン')
    ).toBe(true);
  });

  it('どの候補も一致しなければ false', () => {
    expect(
      matchesAnyTitle(['Game A', 'ゲームA'], 'Totally Different Game')
    ).toBe(false);
  });
});

describe('isSameGame — strict モード (#131 シリーズ続編誤マッチ防止)', () => {
  it('strict=true: 完全一致 → true', () => {
    expect(isSameGame('God of War', 'God of War', undefined, undefined, true)).toBe(true);
  });

  it('strict=true: 続編タイトルはプレフィックス一致でも false', () => {
    // God of War → God of War Ragnarök: サフィックス除去後でも余分な単語がある
    expect(isSameGame('God of War', 'God of War Ragnarök', undefined, undefined, true)).toBe(false);
  });

  it('strict=true: Splatoon 3 が Splatoon を誤採用しない', () => {
    expect(isSameGame('Splatoon', 'Splatoon 3', undefined, undefined, true)).toBe(false);
    expect(isSameGame('Splatoon 3', 'Splatoon', undefined, undefined, true)).toBe(false);
  });

  it('strict=true: ゼルダ BoW と ToK を区別する', () => {
    expect(
      isSameGame(
        'The Legend of Zelda Breath of the Wild',
        'The Legend of Zelda Tears of the Kingdom',
        undefined, undefined, true
      )
    ).toBe(false);
  });

  it('strict=false (デフォルト): 既存のプレフィックス一致は維持される', () => {
    // DLC パターンはプレフィックス許容を維持
    expect(isSameGame('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')).toBe(true);
  });
});

describe('matchesAnyTitle — strict モード (#131)', () => {
  it('strict=true: 続編 URL を正しく弾く', () => {
    expect(
      matchesAnyTitle(['God of War'], 'God of War Ragnarök', undefined, undefined, true)
    ).toBe(false);
  });

  it('strict=true: 正確なタイトルは通す', () => {
    expect(
      matchesAnyTitle(['God of War', 'ゴッド・オブ・ウォー'], 'God of War', undefined, undefined, true)
    ).toBe(true);
  });
});
