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
});
