import { describe, it, expect, vi } from 'vitest';
import { onRequest, withTrailingSlash } from './_middleware.js';

describe('withTrailingSlash', () => {
  it('拡張子のないパスにtrailing slashを付与する', () => {
    expect(withTrailingSlash('/launch')).toBe('/launch/');
    expect(withTrailingSlash('/issue/1/article/1')).toBe('/issue/1/article/1/');
  });

  it('既にtrailing slashがあるパスはそのまま返す', () => {
    expect(withTrailingSlash('/launch/')).toBe('/launch/');
    expect(withTrailingSlash('/')).toBe('/');
  });

  it('拡張子を持つ静的アセットのパスは変更しない', () => {
    expect(withTrailingSlash('/article1-preview.png')).toBe('/article1-preview.png');
    expect(withTrailingSlash('/favicon.ico')).toBe('/favicon.ico');
  });
});

describe('onRequest', () => {
  const next = vi.fn(async () => new Response('ok'));

  it('game-wire.pages.devへのリクエストをgamequestra.comへ301リダイレクトする', async () => {
    const request = new Request('https://game-wire.pages.dev/launch');
    const response = await onRequest({ request, next });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://gamequestra.com/launch/');
  });

  it('クエリパラメータを保持したままリダイレクトする', async () => {
    const request = new Request('https://game-wire.pages.dev/issue/1/article/1?foo=bar');
    const response = await onRequest({ request, next });

    expect(response.headers.get('location')).toBe('https://gamequestra.com/issue/1/article/1/?foo=bar');
  });

  it('game-wire.pages.dev以外のホストはリダイレクトせず次の処理に渡す', async () => {
    const request = new Request('https://gamequestra.com/launch');
    const response = await onRequest({ request, next });

    expect(next).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
