/**
 * fetch-amazon-ranking.ts のユニットテスト（§2.3 国内販売軸・PR-B2）
 *
 * このモジュールは Amazon 順位を永続化しない前提で設計されている。
 * テストでもネットワークには一切アクセスせず、global.fetch をモックする。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AMAZON_RANKING_SLOT_COUNT,
  parseAmazonRankingHtml,
  isNonGameProduct,
  normalizeAmazonProductTitle,
  buildAmazonRankIndex,
  fetchAmazonRanking,
  type AmazonRankingEntry,
} from './fetch-amazon-ranking.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// __NEXT_DATA__ script タグを含む HTML フィクスチャを組み立てるヘルパー
function buildNextDataHtml(amazonRankingData: unknown): string {
  const json = JSON.stringify({ props: { pageProps: { amazonRankingData } } });
  return `<!DOCTYPE html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

describe('AMAZON_RANKING_SLOT_COUNT', () => {
  it('掲載枠数は50固定である', () => {
    expect(AMAZON_RANKING_SLOT_COUNT).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAmazonRankingHtml
// ─────────────────────────────────────────────────────────────────────────────
describe('parseAmazonRankingHtml', () => {
  it('正常な __NEXT_DATA__ から件数とフィールドが取れる', () => {
    const html = buildNextDataHtml([
      {
        ranking: 1,
        genre: 'アクション',
        title: 'Test Game A',
        categoryName: 'ゲームソフト',
        thumbnailUrlMedium: 'https://example.com/a-m.jpg',
        thumbnailUrlLarge: 'https://example.com/a-l.jpg',
        countingStartDate: '2026-08-01',
        countingEndDate: '2026-08-07',
        releaseDate: '2026-01-15T00:00:00+09:00',
        price: 5000,
        lowestPrice: 4500,
        amazonUrl: 'https://amazon.co.jp/dp/AAA',
      },
      {
        ranking: 2,
        genre: 'RPG',
        title: 'Test Game B',
        categoryName: 'ダウンロード版ソフト/コンテンツ',
        releaseDate: '2026-03-20T00:00:00+09:00',
        amazonUrl: 'https://amazon.co.jp/dp/BBB',
      },
    ]);

    const entries = parseAmazonRankingHtml(html);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      ranking: 1,
      title: 'Test Game A',
      releaseDate: '2026-01-15T00:00:00+09:00',
    });
    expect(entries[1]).toEqual({
      ranking: 2,
      title: 'Test Game B',
      releaseDate: '2026-03-20T00:00:00+09:00',
    });
  });

  it('releaseDate が無い要素は releaseDate が undefined になる', () => {
    const html = buildNextDataHtml([{ ranking: 3, title: 'Test Game C' }]);
    const entries = parseAmazonRankingHtml(html);
    expect(entries).toEqual([{ ranking: 3, title: 'Test Game C', releaseDate: undefined }]);
  });

  it('script タグが無ければ空配列を返す', () => {
    const html = '<html><body>ranking page without next data</body></html>';
    expect(parseAmazonRankingHtml(html)).toEqual([]);
  });

  it('JSON が壊れていれば空配列を返す（throwしない）', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">{ this is not valid json </script>';
    expect(() => parseAmazonRankingHtml(html)).not.toThrow();
    expect(parseAmazonRankingHtml(html)).toEqual([]);
  });

  it('amazonRankingData が無ければ空配列を返す', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>';
    expect(parseAmazonRankingHtml(html)).toEqual([]);
  });

  it('amazonRankingData が配列でなければ空配列を返す', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"amazonRankingData":"not-an-array"}}}</script>';
    expect(parseAmazonRankingHtml(html)).toEqual([]);
  });

  it('ranking が数値でない要素・title が文字列でない要素は捨てる', () => {
    const html = buildNextDataHtml([
      { ranking: '1', title: 'Bad Ranking Type' }, // ranking が文字列
      { ranking: 2, title: 42 }, // title が数値
      { ranking: 3, title: 'Good Entry' }, // 正常
    ]);
    const entries = parseAmazonRankingHtml(html);
    expect(entries).toEqual([{ ranking: 3, title: 'Good Entry', releaseDate: undefined }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isNonGameProduct
// ─────────────────────────────────────────────────────────────────────────────
describe('isNonGameProduct', () => {
  it('実測された非ゲーム商品9件はすべて true、実ゲームは false（ポジティブコントロール込み）', () => {
    const nonGameTitles = [
      'ニンテンドープリペイド番号500円',
      'Robloxギフトカード1000 Robux',
      'Robloxギフトカード800 Robux',
      'プレイステーション ストアチケット1,100円',
      'ps4コントローラー',
      'Leadjoy スティックカバー',
      'Leadjoy スティックカバー', // ×2 の2件目
      'プレイステーション ストアチケット3,000円',
      'プレイステーション ストアチケット10,000円',
    ];
    for (const title of nonGameTitles) {
      expect(isNonGameProduct(title)).toBe(true);
    }

    // アップグレードパス/エキスパンションパスの実例（親ゲームに誤って点が付くのを防ぐ対象）
    expect(isNonGameProduct('ぽこ あ ポケモン エキスパンションパス')).toBe(true);
    expect(isNonGameProduct('ゼノブレイド2 Nintendo Switch 2 Edition アップグレードパス')).toBe(
      true
    );

    // ポジティブコントロール: 実ゲームは false（このアサーションが無いとループが死んでいても気づけない）
    expect(isNonGameProduct('スプラトゥーン レイダース -Switch2')).toBe(false);
    expect(isNonGameProduct('【PS5】鬼武者 Way of the Sword')).toBe(false);
  });

  it('大文字小文字を無視する（Robux の判定）', () => {
    expect(isNonGameProduct('Roblox Gift Card 1000 robux')).toBe(true);
    expect(isNonGameProduct('ROBLOX GIFT CARD 1000 ROBUX')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAmazonProductTitle
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeAmazonProductTitle', () => {
  it('「|」以降を捨て、共通正規化する（スプラトゥーン レイダース|オンラインコード版）', () => {
    expect(normalizeAmazonProductTitle('スプラトゥーン レイダース|オンラインコード版')).toBe(
      'スプラトゥーン レイダース'
    );
  });

  it('末尾のプラットフォーム接尾辞を除去する（スプラトゥーン レイダース -Switch2）', () => {
    expect(normalizeAmazonProductTitle('スプラトゥーン レイダース -Switch2')).toBe(
      'スプラトゥーン レイダース'
    );
  });

  it('上と同じキーになる: 4位表記と6位表記が同一タイトルとして正規化される', () => {
    const a = normalizeAmazonProductTitle('スプラトゥーン レイダース|オンラインコード版');
    const b = normalizeAmazonProductTitle('スプラトゥーン レイダース -Switch2');
    expect(a).toBe(b);
  });

  it('【…】を除去する（【PS5】鬼武者 Way of the Sword）', () => {
    expect(normalizeAmazonProductTitle('【PS5】鬼武者 Way of the Sword')).toBe(
      '鬼武者 way of the sword'
    );
  });

  it('（…）を除去し、コロン・「-Switch2」を処理する（STEINS;GATE の複合ケース）', () => {
    const input =
      'STEINS;GATE RE:BOOT（シュタインズゲート リブート） 【予約特典】DLC「STEINS;GATE 変移空間のオクテット」 同梱 - Switch2';
    // ; と「」は共通正規化の除去対象記号一覧に含まれないため残る。
    // （…）【…】は除去、コロンは空白化、末尾の「- Switch2」は除去される。
    expect(normalizeAmazonProductTitle(input)).toBe(
      'steins;gate re boot dlc「steins;gate 変移空間のオクテット」 同梱'
    );
  });

  it('最初の「|」以降を切り捨てる（Windows版 | Minecraft…）', () => {
    const input =
      'Windows版 | Minecraft (マインクラフト): Java & Bedrock Edition | オンラインコード版';
    expect(normalizeAmazonProductTitle(input)).toBe('windows版');
  });

  it('末尾のプラットフォーム接尾辞を除去する（ファイアーエムブレム 万紫千紅 -Switch2）', () => {
    expect(normalizeAmazonProductTitle('ファイアーエムブレム 万紫千紅 -Switch2')).toBe(
      'ファイアーエムブレム 万紫千紅'
    );
  });

  it('空文字になった場合は空文字を返す', () => {
    expect(normalizeAmazonProductTitle('（予約特典）')).toBe('');
    expect(normalizeAmazonProductTitle('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAmazonRankIndex
// ─────────────────────────────────────────────────────────────────────────────
describe('buildAmazonRankIndex', () => {
  it('同一タイトルが4位と6位にある場合、lookupが上位側の4を返す', () => {
    const entries: AmazonRankingEntry[] = [
      { ranking: 4, title: 'スプラトゥーン レイダース|オンラインコード版' },
      { ranking: 6, title: 'スプラトゥーン レイダース -Switch2' },
    ];
    const index = buildAmazonRankIndex(entries);
    expect(index.lookup({ title: 'スプラトゥーン レイダース' })).toBe(4);
  });

  it('入力順が逆（6位が先）でも上位側の4を返す', () => {
    const entries: AmazonRankingEntry[] = [
      { ranking: 6, title: 'スプラトゥーン レイダース -Switch2' },
      { ranking: 4, title: 'スプラトゥーン レイダース|オンラインコード版' },
    ];
    const index = buildAmazonRankIndex(entries);
    expect(index.lookup({ title: 'スプラトゥーン レイダース' })).toBe(4);
  });

  it('非ゲーム商品が除去され、残ったゲームの順位は詰め直されない（1位が非ゲームでも2位は2のまま）', () => {
    const entries: AmazonRankingEntry[] = [
      { ranking: 1, title: 'ニンテンドープリペイド番号500円' }, // 非ゲーム、除去される
      { ranking: 2, title: 'ファイアーエムブレム 万紫千紅 -Switch2' }, // 残るゲーム（ポジティブコントロール）
    ];
    const index = buildAmazonRankIndex(entries);

    expect(index.size).toBe(1); // 非ゲームが除去され1件だけ残る
    expect(index.lookup({ title: 'ファイアーエムブレム 万紫千紅' })).toBe(2); // 1に詰め直されない
  });

  it('空キーになるエントリは捨てられる（ポジティブコントロールとして通常エントリも同居させる）', () => {
    const entries: AmazonRankingEntry[] = [
      { ranking: 5, title: '（予約特典）' }, // 括弧を除去すると空文字になる
      { ranking: 6, title: 'ファイアーエムブレム 万紫千紅 -Switch2' }, // 正常に残る
    ];
    const index = buildAmazonRankIndex(entries);

    expect(index.size).toBe(1);
    expect(index.lookup({ title: 'ファイアーエムブレム 万紫千紅' })).toBe(6);
  });

  it('size は保持する一意タイトル数であり順位を含まない', () => {
    const entries: AmazonRankingEntry[] = [
      { ranking: 1, title: 'Game One' },
      { ranking: 2, title: 'Game Two' },
      { ranking: 3, title: 'Game Three' },
    ];
    const index = buildAmazonRankIndex(entries);
    expect(index.size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lookup
// ─────────────────────────────────────────────────────────────────────────────
describe('lookup', () => {
  it('titleJa 経由でヒットする', () => {
    const index = buildAmazonRankIndex([
      { ranking: 4, title: 'スプラトゥーン レイダース|オンラインコード版' },
    ]);
    expect(
      index.lookup({ title: 'Splatoon Raiders', titleJa: 'スプラトゥーン レイダース' })
    ).toBe(4);
  });

  it('titleJa が無くても英語 title でヒットする', () => {
    const index = buildAmazonRankIndex([{ ranking: 7, title: 'Splatoon Raiders' }]);
    expect(index.lookup({ title: 'Splatoon Raiders' })).toBe(7);
  });

  it('未掲載のタイトルは undefined を返す', () => {
    const index = buildAmazonRankIndex([
      { ranking: 4, title: 'スプラトゥーン レイダース|オンラインコード版' },
    ]);
    expect(index.lookup({ title: 'Completely Unknown Game' })).toBeUndefined();
  });

  it('誤照合ガード: 発売日が366日以上離れていたらundefined、1日差なら一致する', () => {
    // 2020年は閏年で 2020-01-01 → 2021-01-01 は366日差（境界値超え）
    const guardedIndex = buildAmazonRankIndex([
      { ranking: 10, title: 'Test Game A', releaseDate: '2020-01-01' },
    ]);
    expect(
      guardedIndex.lookup({ title: 'Test Game A', releaseDate: '2021-01-01' })
    ).toBeUndefined();

    // ポジティブコントロール: 1日差なら一致する
    const matchIndex = buildAmazonRankIndex([
      { ranking: 10, title: 'Test Game B', releaseDate: '2020-01-01' },
    ]);
    expect(matchIndex.lookup({ title: 'Test Game B', releaseDate: '2020-01-02' })).toBe(10);
  });

  it('どちらかの発売日が欠けていればガードを適用せず一致する', () => {
    // ゲーム側に発売日なし
    const indexA = buildAmazonRankIndex([
      { ranking: 12, title: 'Test Game C', releaseDate: '2020-01-01' },
    ]);
    expect(indexA.lookup({ title: 'Test Game C' })).toBe(12);

    // 索引側エントリに発売日なし
    const indexB = buildAmazonRankIndex([{ ranking: 13, title: 'Test Game D' }]);
    expect(indexB.lookup({ title: 'Test Game D', releaseDate: '1999-05-05' })).toBe(13);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchAmazonRanking
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchAmazonRanking', () => {
  it('非200レスポンスなら空索引を返す（throwしない）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve(''),
      })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const index = await fetchAmazonRanking();

    expect(index.size).toBe(0);
    expect(index.lookup({ title: 'Anything' })).toBeUndefined();
  });

  it('ネットワーク例外が発生しても空索引を返す（throwしない）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(fetchAmazonRanking()).resolves.toBeDefined();
    const index = await fetchAmazonRanking();
    expect(index.size).toBe(0);
  });

  it('空レスポンス（0件パース）なら空索引を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html><body>no next data here</body></html>'),
      })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const index = await fetchAmazonRanking();
    expect(index.size).toBe(0);
  });

  it('成功時は索引が構築され、lookup が機能する', async () => {
    const html = buildNextDataHtml([
      { ranking: 1, title: 'ニンテンドープリペイド番号500円' }, // 非ゲームなので除去される
      { ranking: 2, title: 'ファイアーエムブレム 万紫千紅 -Switch2' },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(html),
      })
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const index = await fetchAmazonRanking();

    expect(index.size).toBe(1);
    expect(index.lookup({ title: 'ファイアーエムブレム 万紫千紅' })).toBe(2);

    // ライセンス制約: 成功ログには件数のみを出し、タイトル別の順位は出さない
    // （"Ranking" という語自体はモジュール名として許容するが、掲載タイトル名は禁止）
    for (const call of logSpy.mock.calls) {
      const joined = call.join(' ');
      expect(joined).not.toContain('ファイアーエムブレム');
    }
  });

  it('User-Agent ヘッダーとタイムアウト付き signal を指定して固定URLを取得する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(buildNextDataHtml([{ ranking: 1, title: 'Game X' }])),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await fetchAmazonRanking();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://www.famitsu.com/ranking/amazon');
    expect((init as RequestInit).headers).toMatchObject({ 'User-Agent': 'GameWire/1.0' });
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
