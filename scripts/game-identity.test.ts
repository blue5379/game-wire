import { describe, it, expect } from 'vitest';
import {
  normalizeTitleForMatch,
  extractYearFromDate,
  isInvalidGameTitle,
  explainGameIdentity,
  isSameGameIdentity,
  isIdentityConfirmedByAppId,
  matchesAnyTitle,
  type GameIdentitySignals,
} from './game-identity.js';

// store / store-strict プロファイルのヘルパー
// （旧 resolvers/match.ts の isSameGame(q, c, qd, cd, strict) と同じ意図のテストを移植するため）
const storeSame = (q: string, c: string, qd?: string, cd?: string) =>
  isSameGameIdentity({ title: q, releaseDate: qd }, { title: c, releaseDate: cd }, 'store');
const strictSame = (q: string, c: string, qd?: string, cd?: string) =>
  isSameGameIdentity({ title: q, releaseDate: qd }, { title: c, releaseDate: cd }, 'store-strict');
const aggSame = (q: string, c: string, qd?: string, cd?: string) =>
  isSameGameIdentity({ title: q, releaseDate: qd }, { title: c, releaseDate: cd }, 'aggregation');

describe('normalizeTitleForMatch', () => {
  it('™ ® © を除去する', () => {
    // ™ の後ろはスペースに置換されるが連続スペース圧縮により 1 スペースに
    expect(normalizeTitleForMatch('Counter-Strike™ 2')).toBe('counter strike 2');
    expect(normalizeTitleForMatch('Game® Edition')).toBe('game edition');
  });

  it('&amp; を & に変換する', () => {
    expect(normalizeTitleForMatch('S&amp;box')).toBe('s&box');
  });

  it('大文字を小文字に変換する（記号→スペースは連続スペース圧縮される）', () => {
    // Half-Life: Alyx → "-" ":" を空白化 → 連続スペース圧縮
    expect(normalizeTitleForMatch('Half-Life: Alyx')).toBe('half life alyx');
  });

  it('記号タイトル S&box を正規化できる（& は保持）', () => {
    const norm = normalizeTitleForMatch('S&box');
    expect(norm).toBe('s&box');
  });
});

describe('extractYearFromDate', () => {
  it('ISO 形式（先頭年）から年を抽出する', () => {
    expect(extractYearFromDate('2023-10-25')).toBe(2023);
    expect(extractYearFromDate('1993')).toBe(1993);
  });

  it('Steam appdetails 形式（末尾年）から年を抽出する', () => {
    expect(extractYearFromDate('Nov 1, 2023')).toBe(2023);
    expect(extractYearFromDate('1 Nov, 2023')).toBe(2023);
  });

  it('年を含まない文字列・undefined は undefined を返す', () => {
    expect(extractYearFromDate('Coming soon')).toBeUndefined();
    expect(extractYearFromDate(undefined)).toBeUndefined();
    expect(extractYearFromDate('')).toBeUndefined();
  });
});

describe('isInvalidGameTitle', () => {
  it('ハッシュタグ・メンションで始まるタイトルは無効', () => {
    expect(isInvalidGameTitle('#shorts')).toBe(true);
    expect(isInvalidGameTitle('@channel')).toBe(true);
  });

  it('短すぎるタイトルは無効', () => {
    expect(isInvalidGameTitle('Ib')).toBe(true);
  });

  it('一般的すぎるワードは無効', () => {
    expect(isInvalidGameTitle('実況')).toBe(true);
    expect(isInvalidGameTitle('PC')).toBe(true);
    expect(isInvalidGameTitle('Nintendo Direct')).toBe(true);
  });

  it('通常のゲームタイトルは有効', () => {
    expect(isInvalidGameTitle('Elden Ring')).toBe(false);
    expect(isInvalidGameTitle('スプラトゥーン3')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// store プロファイル（旧 resolvers/match.ts isSameGame の移植）
// ─────────────────────────────────────────────────────────────────────────────

describe('store プロファイル（プレフィックス一致・年差±2）', () => {
  it('正規化後に完全一致 → true', () => {
    expect(storeSame('Cyberpunk 2077', 'Cyberpunk 2077')).toBe(true);
  });

  it('大文字小文字の違いを無視して一致', () => {
    expect(storeSame('CYBERPUNK 2077', 'cyberpunk 2077')).toBe(true);
  });

  it('™ 有無に関わらず一致', () => {
    expect(storeSame('Counter-Strike™ 2', 'Counter-Strike 2')).toBe(true);
  });

  it('ハイフンとスペースを同一視して一致', () => {
    expect(storeSame('Half-Life 2', 'Half Life 2')).toBe(true);
  });

  it('プレフィックス一致・年差なし → true', () => {
    expect(storeSame('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')).toBe(true);
  });

  it('プレフィックス一致・年差 2年以内 → true', () => {
    expect(storeSame('Some Game', 'Some Game: DLC', '2022-01-01', '2023-06-01')).toBe(true);
  });

  it('#46 同名異作品: 年差 > 2年 → false', () => {
    expect(storeSame('Doom', 'Doom', '1993-12-10', '2016-05-13')).toBe(false);
  });

  it('プレフィックス一致・年差 > 2年 → false（#46 対策）', () => {
    expect(storeSame('SomeGame', 'SomeGame Remastered', '2010-01-01', '2016-01-01')).toBe(false);
  });

  it('全く異なるタイトル → false', () => {
    expect(storeSame('Dota 2', 'Counter-Strike 2')).toBe(false);
  });

  it('どちらかのタイトルが空文字 → false', () => {
    expect(storeSame('', 'Any Game')).toBe(false);
    expect(storeSame('Any Game', '')).toBe(false);
  });

  it('年情報が片方だけ undefined → プレフィックス一致のみで判定', () => {
    expect(storeSame('My Game', 'My Game Plus', '2020-01-01', undefined)).toBe(true);
    expect(storeSame('My Game', 'My Game Plus', undefined, '2020-01-01')).toBe(true);
  });

  it('記号タイトル: S&box の正規化後に一致', () => {
    expect(storeSame('S&box', 'S&box')).toBe(true);
  });

  it('Half-Life: Alyx と Half Life Alyx が一致', () => {
    expect(storeSame('Half-Life: Alyx', 'Half Life Alyx')).toBe(true);
  });
});

describe('store プロファイル — Steam locale 日付フォーマット対応', () => {
  it('appdetails 形式 "Nov 1, 2023" でも年差チェックが機能する', () => {
    expect(storeSame('Doom', 'Doom', '2016-05-13', 'May 13, 2016')).toBe(true);
  });

  it('appdetails 形式で年差 > 2 の場合に reject する', () => {
    expect(storeSame('Doom', 'Doom', '1993-12-10', 'Dec 10, 1993')).toBe(true);
    expect(storeSame('Doom', 'Doom', '1993-12-10', 'May 13, 2016')).toBe(false);
  });
});

describe('store-strict プロファイル（#131 シリーズ続編誤マッチ防止）', () => {
  it('完全一致 → true', () => {
    expect(strictSame('God of War', 'God of War')).toBe(true);
  });

  it('続編タイトルはプレフィックス一致でも false', () => {
    expect(strictSame('God of War', 'God of War Ragnarök')).toBe(false);
  });

  it('Splatoon 3 が Splatoon を誤採用しない', () => {
    expect(strictSame('Splatoon', 'Splatoon 3')).toBe(false);
    expect(strictSame('Splatoon 3', 'Splatoon')).toBe(false);
  });

  it('ゼルダ BoW と ToK を区別する', () => {
    expect(
      strictSame(
        'The Legend of Zelda Breath of the Wild',
        'The Legend of Zelda Tears of the Kingdom'
      )
    ).toBe(false);
  });

  it('同タイトル・年差 > 2年 → false（Doom 1993 vs Doom 2016）', () => {
    expect(strictSame('Doom', 'Doom', '1993-12-10', '2016-05-13')).toBe(false);
  });

  it('同タイトル・年差 2年以内 → true', () => {
    expect(strictSame('My Game', 'My Game', '2022-01-01', '2023-06-01')).toBe(true);
  });

  it('年情報が片方だけ undefined → true（タイトル一致のみで判定）', () => {
    expect(strictSame('My Game', 'My Game', '2022-01-01', undefined)).toBe(true);
  });

  it('store (デフォルト): 既存のプレフィックス一致は維持される', () => {
    expect(storeSame('Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregation プロファイル（旧 fetch-data.ts titleMatches / isSameGame の移植）
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregation プロファイル（loose一致・年差±3）', () => {
  it('完全一致 → true', () => {
    expect(aggSame('Elden Ring', 'Elden Ring')).toBe(true);
  });

  it('部分一致: 含まれる側が5文字以上なら true', () => {
    expect(aggSame('Hades', 'Hades II')).toBe(true);
  });

  it('部分一致: 含まれる側が5文字未満なら false', () => {
    expect(aggSame('Dota', 'Dota 2 Reborn')).toBe(false);
  });

  it('先頭3語一致（6文字超）で true', () => {
    expect(aggSame('The Legend of Zelda', 'The Legend of Adventure')).toBe(true);
  });

  it('無効タイトル（配信用語等）はマッチしない', () => {
    expect(aggSame('実況', '実況')).toBe(false);
    expect(aggSame('PC', 'PC')).toBe(false);
  });

  it('年差 3年以内 → true（store より緩い許容差）', () => {
    // store プロファイルなら年差3で reject されるが aggregation は許容する
    expect(aggSame('Same Game', 'Same Game', '2020-01-01', '2023-01-01')).toBe(true);
    expect(storeSame('Same Game', 'Same Game', '2020-01-01', '2023-01-01')).toBe(false);
  });

  it('年差 4年以上 → false', () => {
    expect(aggSame('Same Game', 'Same Game', '2020-01-01', '2024-01-01')).toBe(false);
  });

  it('年情報が片方 undefined → タイトル一致のみで判定', () => {
    expect(aggSame('My Game', 'My Game', '2020-01-01', undefined)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 強シグナル（steamAppId / igdbSlug）
// ─────────────────────────────────────────────────────────────────────────────

describe('explainGameIdentity — 強シグナル判定', () => {
  it('steamAppId 一致 → タイトルが違っても同一（最強シグナル）', () => {
    const verdict = explainGameIdentity(
      { title: 'サブノーティカ２', steamAppId: 1962700 },
      { title: 'Subnautica 2', steamAppId: 1962700 },
      'aggregation'
    );
    expect(verdict).toEqual({ same: true, reason: 'steam-app-id' });
  });

  it('steamAppId 両方判明で不一致 → タイトル・年が同じでも別作品と確定', () => {
    const verdict = explainGameIdentity(
      { title: 'Brick Game', releaseDate: '2026-01-01', steamAppId: 1087090 },
      { title: 'Brick Game', releaseDate: '2026-01-01', steamAppId: 9999999 },
      'aggregation'
    );
    expect(verdict).toEqual({ same: false, reason: 'app-id-mismatch' });
  });

  it('steamAppId が片側のみ → タイトル照合にフォールバックする', () => {
    // Issue #166 の Brick Game パターン: appId アンカー持ちに旧作（appId 無し）が来ると
    // 関数レベルでは title-year 一致になる。棄却するかは呼び出し側のポリシー
    // （isIdentityConfirmedByAppId を参照して制御。enrichGameFromIgdb のテストで担保）。
    const verdict = explainGameIdentity(
      { title: 'Brick Game', steamAppId: 1087090 },
      { title: 'Brick Game', releaseDate: '1989-12-31' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: true, reason: 'title-year' });
    expect(isIdentityConfirmedByAppId(verdict)).toBe(false);
  });

  it('igdbSlug 一致 → 同一（同一 IGDB エンティティ）', () => {
    const verdict = explainGameIdentity(
      { title: 'Old Name', igdbSlug: 'elden-ring' },
      { title: 'ELDEN RING', igdbSlug: 'elden-ring' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: true, reason: 'igdb-slug' });
  });

  it('igdbSlug 不一致は確定材料にしない（タイトル照合へフォールスルー）', () => {
    // IGDB には同一ゲームの重複エントリが存在しうるため slug 不一致では分離しない
    const verdict = explainGameIdentity(
      { title: 'Same Game', releaseDate: '2020-01-01', igdbSlug: 'same-game' },
      { title: 'Same Game', releaseDate: '2020-01-01', igdbSlug: 'same-game--1' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: true, reason: 'title-year' });
  });

  it('steamAppId は igdbSlug より優先される', () => {
    const verdict = explainGameIdentity(
      { title: 'A', steamAppId: 100, igdbSlug: 'slug-a' },
      { title: 'B', steamAppId: 100, igdbSlug: 'slug-b' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: true, reason: 'steam-app-id' });
  });

  it('titleJa クロス照合: 日本語名が一致すれば同一', () => {
    const a: GameIdentitySignals = { title: 'MECCHA CHAMELEON', titleJa: 'めっちゃカメレオン' };
    const b: GameIdentitySignals = { title: 'めっちゃカメレオン' };
    expect(isSameGameIdentity(a, b, 'aggregation')).toBe(true);
  });

  it('タイトル不一致 → title-mismatch', () => {
    const verdict = explainGameIdentity(
      { title: 'Foo', releaseDate: '2024-01-01' },
      { title: 'Completely Different Bar', releaseDate: '1999-01-01' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: false, reason: 'title-mismatch' });
  });

  it('タイトル一致・年差超過 → year-mismatch（同名異作品）', () => {
    const verdict = explainGameIdentity(
      { title: 'Doom', releaseDate: '1993-12-10' },
      { title: 'Doom', releaseDate: '2016-05-13' },
      'aggregation'
    );
    expect(verdict).toEqual({ same: false, reason: 'year-mismatch' });
  });
});

describe('isIdentityConfirmedByAppId', () => {
  it('steam-app-id 判定のみ true', () => {
    expect(isIdentityConfirmedByAppId({ same: true, reason: 'steam-app-id' })).toBe(true);
    expect(isIdentityConfirmedByAppId({ same: true, reason: 'igdb-slug' })).toBe(false);
    expect(isIdentityConfirmedByAppId({ same: true, reason: 'title-year' })).toBe(false);
    expect(isIdentityConfirmedByAppId({ same: false, reason: 'app-id-mismatch' })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesAnyTitle（resolver 互換 API・旧 match.ts から移植）
// ─────────────────────────────────────────────────────────────────────────────

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
