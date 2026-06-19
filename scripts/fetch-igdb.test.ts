/**
 * fetch-igdb の純関数ユニットテスト
 *
 * Issue #50 の根本因である `isRelevantSearchResult` の単語マッチが甘い問題、
 * および Issue #49b 対策の websites→公式URL推定ロジックの動作を保証する。
 */

import { describe, it, expect } from 'vitest';
import { __test } from './fetch-igdb.js';

const { isRelevantSearchResult, pickOfficialUrlFromWebsites } = __test;

describe('isRelevantSearchResult', () => {
  it('完全一致するタイトルは true', () => {
    expect(isRelevantSearchResult('Elden Ring', 'Elden Ring')).toBe(true);
  });

  it('部分文字列で結果がクエリを含む場合は true', () => {
    expect(
      isRelevantSearchResult('Hollow Knight', 'Hollow Knight: Silksong')
    ).toBe(true);
  });

  it('単語クエリ（"Balatro"）で完全一致は true', () => {
    expect(isRelevantSearchResult('Balatro', 'Balatro')).toBe(true);
  });

  it('Issue #50: stopword + 汎用語のみの一致は false にする', () => {
    // "The Legend of You" を検索して "The Legend of Heroes: Trails in the Sky" が
    // 返ってきた場合、共通単語は the/legend/of のみ → 別作品として拒絶すべき
    expect(
      isRelevantSearchResult(
        'The Legend of You',
        'The Legend of Heroes: Trails in the Sky'
      )
    ).toBe(false);
  });

  it('意味語が2語以上共通する場合は true', () => {
    // "Trails in the Sky FC" → "The Legend of Heroes: Trails in the Sky"
    // 共通: trails, sky（stopword除外後で2語）
    expect(
      isRelevantSearchResult(
        'Trails in the Sky FC',
        'The Legend of Heroes: Trails in the Sky'
      )
    ).toBe(true);
  });

  it('クエリ全体が stopword のみの場合は false', () => {
    expect(isRelevantSearchResult('the of and', 'The Legend of Zelda')).toBe(
      false
    );
  });

  it('1単語クエリ（"Hades"）が結果のいずれかと一致する場合は true', () => {
    expect(isRelevantSearchResult('Hades', 'Hades II')).toBe(true);
  });

  it('複数語クエリで stopword 以外が1語しか共通しない場合は false', () => {
    // "Final Fantasy XVI" vs "Final Battle" — 共通は "final" のみ
    expect(isRelevantSearchResult('Final Fantasy XVI', 'Final Battle')).toBe(
      false
    );
  });
});

describe('pickOfficialUrlFromWebsites', () => {
  it('category=1 のサイトを優先', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://en.wikipedia.org/wiki/Foo', category: 3 },
        { url: 'https://example.com/official', category: 1 },
      ])
    ).toBe('https://example.com/official');
  });

  it('category 不在時は非SNS・非ストアの最初のURLを採用', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://x.com/foo' },
        { url: 'https://store.steampowered.com/app/123' },
        { url: 'https://ioi.dk/007firstlightgame' },
      ])
    ).toBe('https://ioi.dk/007firstlightgame');
  });

  it('Wikipedia/Wiki/Fandom は採用しない', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://en.wikipedia.org/wiki/Foo' },
        { url: 'https://foo.fandom.com/wiki/Bar' },
      ])
    ).toBeUndefined();
  });

  it('全て非公式パターンなら undefined', () => {
    expect(
      pickOfficialUrlFromWebsites([
        { url: 'https://x.com/foo' },
        { url: 'https://reddit.com/r/foo' },
      ])
    ).toBeUndefined();
  });

  it('空配列・undefined は undefined', () => {
    expect(pickOfficialUrlFromWebsites([])).toBeUndefined();
    expect(pickOfficialUrlFromWebsites(undefined)).toBeUndefined();
  });

  it('Issue #30: category 不在フォールバックは無関係サイトを拾う可能性がある（内容一致検証が必要）', () => {
    // "Realm of Ink" に対して IGDB が category 未設定で inkrealm.jp を返した場合、
    // pickOfficialUrlFromWebsites はパターン除外に引っかからず採用候補とする。
    // → この戻り値に verifyOfficialUrlContent() を通すことで mismatch を弾く（Issue #30 対応）。
    const url = pickOfficialUrlFromWebsites([
      { url: 'https://inkrealm.jp' }, // 水墨画ギャラリー（無関係）
    ]);
    // pickOfficialUrlFromWebsites 単体では除外できない（内容は見ない）
    expect(url).toBe('https://inkrealm.jp');
  });
});
