/**
 * url-health 単体テスト
 *
 * Issue #359: 単純な HEAD 一発の死活確認では、Bot 判定で 403 を返すサイトや
 * HEAD を許可しないサイトの実在ページを「到達不能」と誤判定していた。
 * ブラウザ UA の送出・GET フォールバック・リトライ・404 の即確定を検証する。
 *
 * fetch は差し替え（外部サイトには一切依存させない）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  headOk,
  checkUrlHealth,
  BROWSER_USER_AGENT,
  NOT_FOUND_STATUS_CODES,
} from './url-health.js';

/** 待機を無効化するフック（リトライのテストで実時間を消費しないため） */
const noSleep = () => Promise.resolve();

/**
 * 用意した応答列より多く fetch が呼ばれた記録。
 *
 * requestOnce は例外を catch して「失敗結果」に変換するため、fetch 実装内で throw しても
 * テスト失敗にならず静かに飲まれる。リクエスト回数の回帰を検出するため、
 * ここに記録して afterEach で必ず検査する。
 */
let extraCalls: string[] = [];

/** ステータスコードだけを持つ最小の Response 相当を返す */
function res(status: number): Response {
  return new Response(null, { status });
}

/** タイムアウトを表す例外（AbortSignal.timeout と同じ name を持たせる） */
function timeoutError(): Error {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  return err;
}

type Step = { status: number } | { error: string } | { timeout: true };

/** 呼び出しごとに指定の応答を順に返す fetch を作る */
function fetchReturning(...sequence: Step[]) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers });
    const next = sequence[calls.length - 1];
    if (!next) {
      extraCalls.push(`${init?.method ?? 'GET'} ${String(url)} (call #${calls.length})`);
      throw new Error('unexpected extra fetch call');
    }
    if ('timeout' in next) throw timeoutError();
    if ('error' in next) throw new Error(next.error);
    return res(next.status);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
  extraCalls = [];
  // checkUrlHealth は最終失敗時に console.warn でログを出すため、出力を抑制する
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  expect(extraCalls).toEqual([]);
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

  it('HEAD がタイムアウトしても GET が 200 なら到達可能と判定する', async () => {
    const { impl, calls } = fetchReturning({ timeout: true }, { status: 200 });

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

describe('checkUrlHealth: 404/410 は GET で確認して確定', () => {
  it.each([...NOT_FOUND_STATUS_CODES])(
    'HEAD と GET がともに %i を返したらリトライせず到達不能と確定する',
    async (status) => {
      const { impl, calls } = fetchReturning({ status }, { status });

      const result = await checkUrlHealth('https://example.com/gone', 8000, {
        fetchImpl: impl,
        sleepImpl: noSleep,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(status);
      // HEAD にだけ 404 を返すサイトがあるため GET で確認する。確定後はリトライしない
      expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    }
  );

  it.each([...NOT_FOUND_STATUS_CODES])(
    'HEAD が %i でも GET が 200 なら到達可能と判定する（HEAD にだけ 404 を返すサイト対策）',
    async (status) => {
      const { impl } = fetchReturning({ status }, { status: 200 });

      const result = await checkUrlHealth('https://example.com/head-lies', 8000, {
        fetchImpl: impl,
        sleepImpl: noSleep,
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    }
  );

  it('404 確定と 503 リトライを区別する（404 は GET 1 回、503 は GET を再試行）', async () => {
    const missing = fetchReturning({ status: 404 }, { status: 404 });
    await checkUrlHealth('https://example.com/missing', 8000, {
      fetchImpl: missing.impl,
      sleepImpl: noSleep,
    });

    const flaky = fetchReturning({ status: 503 }, { status: 503 }, { status: 503 });
    await checkUrlHealth('https://example.com/flaky', 8000, {
      fetchImpl: flaky.impl,
      sleepImpl: noSleep,
    });

    expect(missing.calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(flaky.calls.map((c) => c.method)).toEqual(['HEAD', 'GET', 'GET']);
  });
});

describe('checkUrlHealth: タイムアウト', () => {
  it('GET がタイムアウトした場合はリトライせず打ち切る（全体の実行時間を守るため）', async () => {
    const { impl, calls } = fetchReturning({ timeout: true }, { timeout: true });

    const result = await checkUrlHealth('https://example.com/slow', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('TimeoutError');
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });
});

describe('checkUrlHealth: ログ抑止', () => {
  it('quiet 未指定なら失敗時に warn を出す', async () => {
    const { impl } = fetchReturning({ status: 403 }, { status: 403 });

    await checkUrlHealth('https://example.com/blocked', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('https://example.com/blocked');
  });

  it('quiet: true なら失敗しても warn を出さない（候補を順に試す経路向け）', async () => {
    const { impl } = fetchReturning({ status: 403 }, { status: 403 });

    await checkUrlHealth('https://example.com/blocked', 8000, {
      fetchImpl: impl,
      sleepImpl: noSleep,
      quiet: true,
    });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('成功時は warn を出さない', async () => {
    const { impl } = fetchReturning({ status: 200 });

    await checkUrlHealth('https://example.com/ok', 8000, { fetchImpl: impl });

    expect(console.warn).not.toHaveBeenCalled();
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
    const { impl } = fetchReturning({ status: 404 }, { status: 404 });
    expect(
      await headOk('https://example.com/ng', 8000, { fetchImpl: impl, sleepImpl: noSleep })
    ).toBe(false);
  });

  it('HEAD が 403 でも GET が 200 なら true（Issue #359 の回帰テスト）', async () => {
    const { impl } = fetchReturning({ status: 403 }, { status: 200 });
    expect(await headOk('https://example.com/bot-blocked', 8000, { fetchImpl: impl })).toBe(true);
  });
});
