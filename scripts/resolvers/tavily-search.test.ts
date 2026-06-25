/**
 * tavily-search.ts の extractPageTitle ユニットテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPageTitle } from './tavily-search.js';

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
});
