/**
 * tavily-search.ts の extractPageTitle / fetchAndExtractTitle / stripStoreSuffix ユニットテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPageTitle, fetchAndExtractTitle, stripStoreSuffix } from './tavily-search.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function makeHtmlResponse(html: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  } as unknown as Response;
}

/**
 * バイト列を `splitAt` で2チャンクに分割して enqueue する Response を作る。
 * マルチバイト文字の途中で境界が来るケースを再現するため。
 */
function makeChunkedHtmlResponse(html: string, splitAt: number) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  const part1 = bytes.slice(0, splitAt);
  const part2 = bytes.slice(splitAt);
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(part1);
        controller.enqueue(part2);
        controller.close();
      },
    }),
  } as unknown as Response;
}

describe('extractPageTitle', () => {
  it('og:title があれば返す', async () => {
    const html = `<html><head><meta property="og:title" content="Elden Ring"/><title>Other Title</title></head></html>`;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const result = await extractPageTitle('https://example.com/game');
    expect(result).toBe('Elden Ring');
  });

  it('og:title が content-property 逆順でも取得できる', async () => {
    const html = `<html><head><meta content="Splatoon 3" property="og:title"/></head></html>`;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const result = await extractPageTitle('https://nintendo.co.jp/switch/splatoon3/');
    expect(result).toBe('Splatoon 3');
  });

  it('og:title がなければ <title> タグにフォールバックする', async () => {
    const html = `<html><head><title>God of War | PS Store</title></head></html>`;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const result = await extractPageTitle('https://store.playstation.com/ja-jp/product/PPSA01370_00');
    expect(result).toBe('God of War | PS Store');
  });

  it('HTTP 失敗なら null を返す', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null } as unknown as Response);
    const result = await extractPageTitle('https://example.com/not-found');
    expect(result).toBeNull();
  });

  it('fetch が例外を投げたら null を返す', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await extractPageTitle('https://example.com/error');
    expect(result).toBeNull();
  });

  it('body が null なら null を返す', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);
    const result = await extractPageTitle('https://example.com/no-body');
    expect(result).toBeNull();
  });

  // 日本語タイトルがチャンク境界をまたいでも正しく抽出できる
  // （ループ内 stream:true で不完全マルチバイトは内部バッファに保持され、
  //   次のチャンクで完全な文字として組み立てられる）
  it('UTF-8 マルチバイト文字がチャンク境界で分割されてもタイトルが破損しない', async () => {
    const html = `<html><head><meta property="og:title" content="スプラトゥーン3"/></head></html>`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(html);
    // "ン" (E3 83 B3) の最終バイト直前で分割
    const targetByte = bytes.indexOf(0xb3);
    mockFetch.mockResolvedValue(makeChunkedHtmlResponse(html, targetByte));
    const result = await extractPageTitle('https://nintendo.co.jp/switch/splatoon3/');
    expect(result).toBe('スプラトゥーン3');
  });

  // 1チャンクのみで最後が不完全マルチバイトのまま done=true で終わるケース。
  // ループ内では stream:true なので不完全バイトは内部バッファに保持される。
  // フラッシュが無いと残バイトが text に追加されず、後段の </title> 検出が失敗する。
  // フラッシュがあれば U+FFFD（replacement char）として text に追加され、
  // </title> マッチは成功し title 部分は無事抽出される。
  it('単一チャンクの末尾が不完全マルチバイトでもフラッシュで title 抽出が成立する', async () => {
    // タイトル後に「ン」のうち最初の2バイトだけを末尾に置く（完成しない3バイト目）
    const validHtml = `<html><head><title>Hello</title></head>`;
    const encoder = new TextEncoder();
    const validBytes = encoder.encode(validHtml);
    // E3 83 (= "ン" の不完全) を末尾に追加
    const truncated = new Uint8Array(validBytes.length + 2);
    truncated.set(validBytes);
    truncated[validBytes.length] = 0xe3;
    truncated[validBytes.length + 1] = 0x83;

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(truncated);
          controller.close();
        },
      }),
    } as unknown as Response);

    const result = await extractPageTitle('https://example.com/truncated');
    // title 部分は完全に含まれているので抽出できる
    expect(result).toBe('Hello');
  });

  it("og:title にアポストロフィを含むタイトルが途切れずに取得できる", async () => {
    // 旧実装: content=["']([^"']+)["'] → "It" で切れていた
    const html = `<html><head><meta property="og:title" content="It's the Game"/></head></html>`;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const result = await extractPageTitle('https://example.com/game');
    expect(result).toBe("It's the Game");
  });
});

describe('fetchAndExtractTitle', () => {
  it('HTTP 200 かつ og:title があれば alive=true, title=タイトル', async () => {
    const html = `<html><head><meta property="og:title" content="Elden Ring"/></head></html>`;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const result = await fetchAndExtractTitle('https://store.playstation.com/ja-jp/product/xxx');
    expect(result.alive).toBe(true);
    expect(result.title).toBe('Elden Ring');
  });

  it('HTTP 404 なら alive=false', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null } as unknown as Response);
    const result = await fetchAndExtractTitle('https://example.com/not-found');
    expect(result.alive).toBe(false);
    expect(result.title).toBeNull();
  });

  it('HTTP 429 なら alive=false（レート制限をデッドとして扱う）', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, body: null } as unknown as Response);
    const result = await fetchAndExtractTitle('https://store.nintendo.co.jp/xxx');
    expect(result.alive).toBe(false);
  });

  it('fetch が例外を投げたら alive=false', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await fetchAndExtractTitle('https://example.com/error');
    expect(result.alive).toBe(false);
  });

  it('body が null なら alive=true, title=null', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);
    const result = await fetchAndExtractTitle('https://example.com/no-body');
    expect(result.alive).toBe(true);
    expect(result.title).toBeNull();
  });
});

describe('stripStoreSuffix', () => {
  it('PlayStation Store サフィックスを除去する', () => {
    expect(stripStoreSuffix('God of War | PlayStation Store')).toBe('God of War');
    expect(stripStoreSuffix('Elden Ring | PS Store')).toBe('Elden Ring');
  });

  it('Nintendo サフィックスを除去する', () => {
    expect(stripStoreSuffix('Splatoon 3 | Nintendo Switch')).toBe('Splatoon 3');
    expect(stripStoreSuffix('ゼルダの伝説 | Nintendo eShop')).toBe('ゼルダの伝説');
  });

  it('Xbox サフィックスを除去する', () => {
    expect(stripStoreSuffix('Halo Infinite | Xbox')).toBe('Halo Infinite');
    expect(stripStoreSuffix('Forza Horizon 5 - Microsoft Store')).toBe('Forza Horizon 5');
  });

  it('サフィックスがない場合はそのまま返す', () => {
    expect(stripStoreSuffix('God of War')).toBe('God of War');
  });

  it('サフィックス除去後に正規化を組み合わせると続編を弾ける（#131）', () => {
    // "God of War Ragnarök | PlayStation Store" → "God of War Ragnarök"
    // → normalizeTitle → "god of war ragnarok"
    // → isSameGame("God of War", ..., strict=true) → false
    const stripped = stripStoreSuffix('God of War Ragnarök | PlayStation Store');
    expect(stripped).toBe('God of War Ragnarök');
  });
});
