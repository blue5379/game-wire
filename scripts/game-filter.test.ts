/**
 * game-filter のユニットテスト
 *
 * isFanGame: タイトル正規表現・IGDB ジャンルタグに加え、IGDB キーワード slug による判定を検証する。
 * キーワード判定は完全一致（Set.has）のみとし、部分一致による誤検出（fan-translation 等）を
 * 防ぐことが本タスクの肝（実測: fan-translation は「有志翻訳がある公式ゲーム」を示すタグであり
 * ファンゲームを意味しない）。
 *
 * isQualifiedGame: QUALITY_IGDB_RC_MIN の境界値を含め、OR 条件の各経路を検証する。
 */

import { describe, it, expect } from 'vitest';
import {
  isFanGame,
  isQualifiedGame,
  QUALITY_IGDB_RC_MIN,
  QUALITY_IGDB_RATING_STRONG,
  QUALITY_IGDB_RC_FLOOR,
} from './game-filter.js';
import type { GameData } from './types.js';

// テスト用 GameData ファクトリ（必須フィールドのみ設定）
function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    title: 'Test Game',
    normalizedTitle: 'test game',
    genres: [],
    platforms: [],
    source: ['igdb'],
    ...overrides,
  };
}

describe('isFanGame — IGDB キーワード判定（実測値ベース）', () => {
  it('Pokémon Infinite Fusion 相当: unofficial/fangame/fanmade を含むキーワードなら true', () => {
    // 実測値: keywords: ['unofficial','turn-based-combat','fangame','turn-based-rpg','fanmade']
    // genres: ['Role-playing (RPG)','Adventure','Indie']、title にファンゲーム語なし
    const game = makeGame({
      title: 'Pokemon Infinite Fusion',
      keywords: ['unofficial', 'turn-based-combat', 'fangame', 'turn-based-rpg', 'fanmade'],
      genres: ['Role-playing (RPG)', 'Adventure', 'Indie'],
      igdbRatingCount: 23,
    });
    expect(isFanGame(game)).toBe(true);
  });

  it('誤検出防止（このタスクの肝）: fan-translation/fanservice/fan-service/fanfiction のみでは false。同一テスト内のポジティブコントロールで判定ロジック自体が生きていることも確認する', () => {
    // 誤検出防止本体: 部分一致になりうる紛らわしい slug だけを持つ通常ゲーム（誤って除外されてはならない）
    const normalGame = makeGame({
      title: 'Some Normal Game',
      keywords: ['fan-translation', 'fanservice', 'fan-service', 'fanfiction'],
    });
    expect(isFanGame(normalGame)).toBe(false);

    // ポジティブコントロール: 同じ判定ロジックが完全一致では正しく true を返すことを同一テスト内で確認する。
    // これが無いと isFanGame が壊れて常に false を返しているだけでもこのテストは通ってしまう。
    const trueFanGame = makeGame({
      title: 'Some Normal Game',
      keywords: ['fan-translation', 'fanservice', 'unofficial'],
    });
    expect(isFanGame(trueFanGame)).toBe(true);
  });

  it.each(['unofficial', 'fangame', 'fanmade'])(
    'キーワード slug "%s" 単独で true になる',
    (slug) => {
      expect(isFanGame(makeGame({ keywords: [slug] }))).toBe(true);
    }
  );

  it('大文字小文字の境界: "FanGame" のような表記でも検出される（正規化して比較）', () => {
    expect(isFanGame(makeGame({ keywords: ['FanGame'] }))).toBe(true);
    expect(isFanGame(makeGame({ keywords: ['UNOFFICIAL'] }))).toBe(true);
  });

  it('部分一致では検出しない: "fantasy" のような無関係な語は false', () => {
    expect(isFanGame(makeGame({ keywords: ['fantasy'] }))).toBe(false);
  });

  it('keywords が undefined のとき、既存のタイトル・ジャンル判定の挙動が変わらない（回帰）', () => {
    expect(isFanGame(makeGame({ title: 'Normal Game', genres: ['Action'] }))).toBe(false);
    expect(isFanGame(makeGame({ title: 'Zelda Fan Game Edition' }))).toBe(true);
  });

  it('keywords が空配列のとき、既存のタイトル・ジャンル判定の挙動が変わらない（回帰）', () => {
    expect(
      isFanGame(makeGame({ title: 'Normal Game', genres: ['Action'], keywords: [] }))
    ).toBe(false);
    expect(isFanGame(makeGame({ title: 'Zelda Fan Game Edition', keywords: [] }))).toBe(true);
  });
});

describe('isFanGame — 既存のタイトル正規表現・ジャンル判定（回帰）', () => {
  it('タイトルに "fan game" が単語境界付きで含まれる場合 true', () => {
    expect(isFanGame(makeGame({ title: 'Sonic Fan Game' }))).toBe(true);
  });

  it('タイトルに "unofficial" が含まれる場合 true', () => {
    expect(isFanGame(makeGame({ title: 'Unofficial Patch Game' }))).toBe(true);
  });

  it('タイトルの部分一致では誤検出しない（"Fantasy" は "fan" の word-boundary に一致しない）', () => {
    expect(isFanGame(makeGame({ title: 'Final Fantasy XVI' }))).toBe(false);
  });

  it('ジャンルに "Fan Game"（大文字小文字混在）が含まれる場合 true', () => {
    expect(isFanGame(makeGame({ genres: ['Fan Game'] }))).toBe(true);
  });

  it('タイトル・ジャンル・キーワードいずれも該当しない通常ゲームは false', () => {
    expect(
      isFanGame(makeGame({ title: 'Elden Ring', genres: ['RPG'], keywords: ['open-world'] }))
    ).toBe(false);
  });
});

describe('isQualifiedGame — 境界値とOR条件の各経路', () => {
  it(`境界値: igdbRatingCount が QUALITY_IGDB_RC_MIN（${QUALITY_IGDB_RC_MIN}）ちょうどのとき true`, () => {
    expect(isQualifiedGame(makeGame({ igdbRatingCount: QUALITY_IGDB_RC_MIN }))).toBe(true);
  });

  it(`境界値: igdbRatingCount が QUALITY_IGDB_RC_MIN 未満（${QUALITY_IGDB_RC_MIN - 1}）かつ他の条件が無ければ false`, () => {
    expect(isQualifiedGame(makeGame({ igdbRatingCount: QUALITY_IGDB_RC_MIN - 1 }))).toBe(false);
  });

  it('steamRank が設定されていれば true（チャート掲載自体を品質シグナルとする）', () => {
    expect(isQualifiedGame(makeGame({ steamRank: 50 }))).toBe(true);
  });

  it('steamPlayers > 0 なら true', () => {
    expect(isQualifiedGame(makeGame({ steamPlayers: 1 }))).toBe(true);
  });

  it('steamPlayers が 0 のときは false（他の条件が無い場合）', () => {
    expect(isQualifiedGame(makeGame({ steamPlayers: 0 }))).toBe(false);
  });

  it('metascore が設定されていれば true', () => {
    expect(isQualifiedGame(makeGame({ metascore: 60 }))).toBe(true);
  });

  it(`高評価少数票の救済: igdbRating >= ${QUALITY_IGDB_RATING_STRONG} かつ igdbRatingCount >= ${QUALITY_IGDB_RC_FLOOR}（境界値ちょうど）なら true`, () => {
    expect(
      isQualifiedGame(
        makeGame({ igdbRating: QUALITY_IGDB_RATING_STRONG, igdbRatingCount: QUALITY_IGDB_RC_FLOOR })
      )
    ).toBe(true);
  });

  it(`境界値: igdbRating は十分高いが igdbRatingCount が救済しきい値未満（${QUALITY_IGDB_RC_FLOOR - 1}）なら false`, () => {
    expect(
      isQualifiedGame(
        makeGame({ igdbRating: QUALITY_IGDB_RATING_STRONG, igdbRatingCount: QUALITY_IGDB_RC_FLOOR - 1 })
      )
    ).toBe(false);
  });

  it(`境界値: igdbRatingCount は十分だが igdbRating が救済しきい値未満（${QUALITY_IGDB_RATING_STRONG - 1}）なら false`, () => {
    expect(
      isQualifiedGame(
        makeGame({ igdbRating: QUALITY_IGDB_RATING_STRONG - 1, igdbRatingCount: QUALITY_IGDB_RC_FLOOR })
      )
    ).toBe(false);
  });

  it('どの条件も満たさない場合 false', () => {
    expect(isQualifiedGame(makeGame())).toBe(false);
  });
});
