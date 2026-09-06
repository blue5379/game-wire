/**
 * url-health 単体テスト
 *
 * Issue #359: 単純な HEAD 一発の死活確認では、Bot 判定で 403 を返すサイトや
 * HEAD を許可しないサイトの実在ページを「到達不能」と誤判定していた。
 * ブラウザ UA の送出・GET フォールバック・リトライ・404 の即確定を検証する。
 *
 * fetch は差し替え（外部サイトには一切依存させない）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  headOk,
  checkUrlHealth,
  BROWSER_USER_AGENT,
  NOT_FOUND_STATUS_CODES,
} from './url-health.js';

/** 待機を無効化するフック（リトライのテストで実時間を消費しないため） */
const noSleep = () => Promise.resolve();

/** ステータスコードだけを持つ最小の Response 相当を返す */
function res(status: number): Response {
  return new Response(status === 204 ? null : 'body', { status });
}

/** 呼び出しごとの (method, status) を順に返す fetch を作る */
function fetchReturning(...sequence: Array<{ status: number } | { error: string }>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers });
    const next = sequence[calls.length - 1];
    if (!next) throw new Error(`unexpected extra fetch call #${calls.length}`);
    if ('error' in next) throw new Error(next.error);
    return res(next.status);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // checkUrlHealth は最終失敗時に console.warn でログを出すため、出力を抑制する
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('checkUrlHealth: ブラウザ UA の送出', () => {
  it('HEAD リクエストにブラウザ UA を付与する（UA 無しを 403 で弾くサイト対策）', async () => {
    const { impl, calls } = fetchReturning({ status: 200 });

    const result = await checkUrlHealth('https://example.com/game', 8000, { fetchImpl: impl });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('HEAD');
    expect(calls[0].headers['User-Agent']).toBe(BROWSER_USER_AGENT);
  });

  it('UA はブラウザを装う文字列で、node/undici のデフォルトではない', () => {
    expect(BROWSER_USER_AGENT).toMatch(/^Mozilla\/5\.0 /);
    expect(BROWSER_USER_AGENT).not.toMatch(/node|undici/i);
  });
});

describe('checkUrlHealth: GET フォールバック', () => {
  it('HEAD が 403 でも GET が 200 なら到達可能と判定する', async () => {
    const { impl, calls } = fetchReturning({ status: 403 }, { status: 200 });

    const result = await checkUrlHealth('https://example.com/game', 8000, { fetchImpl: impl });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('HEAD が 405（Method Not Allowed）でも GET が 200 なら到達可能と判定する', async () => {
    const { impl, calls } = fetchReturning({ status: 405 }, { status: 200 });

    const result = await checkUrlHealth('https://example.com/game', 8000, { fetchImpl: impl });

    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('HEAD が例外（タイムアウト等）でも GET が 200 なら到達可能と判定する', async () => {
    const { impl, calls } = fetchReturning({ error: 'TimeoutError' }, { status: 200 });

    const result = await checkUrlHealth('https://example.com/game', 8000, { fetchImpl: impl });

    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('HEAD と GET の両方が 403 なら到達不能とし、ステータスを理由に含める', async () => {
    const { impl, calls } = fetchReturning({ status: 403 }, { status: 403 });

    const result = await checkUrlHealth('https://example.com/game', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.reason).toContain('403');
    // 403 は待っても回復しないためリトライしない（HEAD + GET の 2 回で確定）
    expect(calls).toHaveLength(2);
  });
});

describe('checkUrlHealth: 404/410 は即確定', () => {
  it.each([...NOT_FOUND_STATUS_CODES])(
    'HEAD が %i を返したら GET フォールバックもリトライもせず到達不能と確定する',
    async (status) => {
      const { impl, calls } = fetchReturning({ status });

      const result = await checkUrlHealth('https://example.com/gone', 8000, {
        fetchImpl: impl,
        sleepImpl: noSleep,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(status);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('HEAD');
    }
  );

  it('403 と 404 を区別する（403 は GET を試すが 404 は試さない）', async () => {
    const blocked = fetchReturning({ status: 403 }, { status: 403 });
    await checkUrlHealth('https://example.com/blocked', 8000, {
      fetchImpl: blocked.impl,
      sleepImpl: noSleep,
    });

    const missing = fetchReturning({ status: 404 });
    await checkUrlHealth('https://example.com/missing', 8000, {
      fetchImpl: missing.impl,
      sleepImpl: noSleep,
    });

    expect(blocked.calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(missing.calls.map((c) => c.method)).toEqual(['HEAD']);
  });
});

describe('checkUrlHealth: リトライ', () => {
  it('一時的な 503 の後に 200 が返れば到達可能と判定する', async () => {
    const { impl, calls } = fetchReturning(
      { status: 503 }, // HEAD
      { status: 503 }, // GET（1 回目）
      { status: 200 } // GET（リトライ）
    );

    const result = await checkUrlHealth('https://example.com/flaky', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET', 'GET']);
  });

  it('ネットワークエラーが続いた場合もリトライし、最終的に到達不能とする', async () => {
    const { impl, calls } = fetchReturning(
      { error: 'ECONNRESET' },
      { error: 'ECONNRESET' },
      { error: 'ECONNRESET' }
    );

    const result = await checkUrlHealth('https://example.com/down', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBeUndefined();
    expect(result.reason).toContain('ECONNRESET');
    expect(calls).toHaveLength(3);
  });

  it('リトライ前に待機する（バックオフ）', async () => {
    const { impl } = fetchReturning({ status: 503 }, { status: 503 }, { status: 200 });
    const sleepImpl = vi.fn((_ms: number) => Promise.resolve());

    await checkUrlHealth('https://example.com/flaky', 8000, { fetchImpl: impl, sleepImpl });

    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('429（レート制限）はリトライ対象に含める', async () => {
    const { impl, calls } = fetchReturning({ status: 429 }, { status: 429 }, { status: 200 });

    const result = await checkUrlHealth('https://example.com/limited', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });
});

describe('checkUrlHealth: リダイレクト', () => {
  it('redirect: follow を指定する（301 の公式URLを到達不能と誤判定しないため）', async () => {
    const init: RequestInit[] = [];
    const impl = vi.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      init.push(opts ?? {});
      return res(200);
    }) as unknown as typeof fetch;

    await checkUrlHealth('https://example.com/redirecting', 8000, { fetchImpl: impl });

    expect(init[0].redirect).toBe('follow');
  });
});

describe('headOk: 既存呼び出し元向けの boolean ラッパ', () => {
  it('到達可能なら true', async () => {
    const { impl } = fetchReturning({ status: 200 });
    expect(await headOk('https://example.com/ok', 8000, { fetchImpl: impl })).toBe(true);
  });

  it('到達不能なら false', async () => {
    const { impl } = fetchReturning({ status: 404 });
    expect(await headOk('https://example.com/ng', 8000, { fetchImpl: impl })).toBe(false);
  });

  it('HEAD が 403 でも GET が 200 なら true（Issue #359 の回帰テスト）', async () => {
    const { impl } = fetchReturning({ status: 403 }, { status: 200 });
    expect(await headOk('https://example.com/bot-blocked', 8000, { fetchImpl: impl })).toBe(true);
  });
});
