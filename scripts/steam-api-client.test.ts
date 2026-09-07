/**
 * steam-api-client.ts の単体テスト（Issue #360）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSteamJson,
  getSteamApiHealth,
  resetSteamApiClient,
  STEAM_MAX_ATTEMPTS,
  STEAM_RETRY_AFTER_MAX_MS,
  STEAM_CIRCUIT_FAILURE_THRESHOLD,
} from './steam-api-client.js';

function makeResponse(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.json,
    headers: {
      get: (name: string) => opts.headers?.[name] ?? null,
    },
  } as unknown as Response;
}

beforeEach(() => {
  resetSteamApiClient();
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchSteamJson', () => {
  it('403 → リトライし、2回目で成功して { ok: true, attempts: 2 } を返す', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return makeResponse({ ok: false, status: 403 });
      return makeResponse({ ok: true, json: { success: true } });
    });

    const promise = fetchSteamJson('https://example.test/a', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true, json: { success: true }, attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('500 が続く → STEAM_MAX_ATTEMPTS 回試行して失敗し、status:500, attempts:3 を返す', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 500 }));

    const promise = fetchSteamJson('https://example.test/b', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.attempts).toBe(STEAM_MAX_ATTEMPTS);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(STEAM_MAX_ATTEMPTS);
  });

  it('404 → リトライせず attempts:1 で失敗する', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 404 }));

    const result = await fetchSteamJson('https://example.test/c', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.attempts).toBe(1);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('Retry-After: 2 を尊重して2000ms待ってからリトライする', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return makeResponse({ ok: false, status: 429, headers: { 'Retry-After': '2' } });
      }
      return makeResponse({ ok: true, json: {} });
    });

    const promise = fetchSteamJson('https://example.test/d', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // 1999ms時点ではまだ2回目が呼ばれていない
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 2000ms経過で2回目が呼ばれる
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result.ok).toBe(true);
  });

  it('Retry-After が極端に大きい場合 STEAM_RETRY_AFTER_MAX_MS にクランプされる', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return makeResponse({ ok: false, status: 429, headers: { 'Retry-After': '999999' } });
      }
      return makeResponse({ ok: true, json: {} });
    });

    const promise = fetchSteamJson('https://example.test/e', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // クランプ値の直前ではまだ2回目が呼ばれていない
    await vi.advanceTimersByTimeAsync(STEAM_RETRY_AFTER_MAX_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // クランプ値に達すると2回目が呼ばれる（999999秒待つことはない）
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await promise;
  });

  it('HTTP 200 で本文が success:false でも ok:true を返す（判定は呼び出し側の責務）', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ ok: true, json: { '1': { success: false } } })
    );

    const result = await fetchSteamJson('https://example.test/f', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json).toEqual({ '1': { success: false } });
    }
  });

  it('連続失敗が閾値に達するとサーキットが開き、以降の呼び出しで fetchImpl が呼ばれない', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 404 }));

    for (let i = 0; i < STEAM_CIRCUIT_FAILURE_THRESHOLD; i++) {
      await fetchSteamJson(`https://example.test/g${i}`, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        quiet: true,
      });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(STEAM_CIRCUIT_FAILURE_THRESHOLD);

    const result = await fetchSteamJson('https://example.test/g-after', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });

    // サーキットが開いたので fetchImpl は呼ばれていない（呼び出し回数が増えない）
    expect(fetchImpl).toHaveBeenCalledTimes(STEAM_CIRCUIT_FAILURE_THRESHOLD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.circuitOpen).toBe(true);
    }
  });

  it('成功すると consecutiveFailures が 0 に戻る', async () => {
    const fetchImplFail = vi.fn(async () => makeResponse({ ok: false, status: 404 }));
    await fetchSteamJson('https://example.test/h-fail', {
      fetchImpl: fetchImplFail as unknown as typeof fetch,
      quiet: true,
    });
    expect(getSteamApiHealth().consecutiveFailures).toBe(1);

    const fetchImplOk = vi.fn(async () => makeResponse({ ok: true, json: {} }));
    await fetchSteamJson('https://example.test/h-ok', {
      fetchImpl: fetchImplOk as unknown as typeof fetch,
      quiet: true,
    });
    expect(getSteamApiHealth().consecutiveFailures).toBe(0);
  });

  it('getSteamApiHealth().statusCounts に HTTP ステータス別の失敗件数が入る', async () => {
    const fetchImpl404 = vi.fn(async () => makeResponse({ ok: false, status: 404 }));
    await fetchSteamJson('https://example.test/i-404', {
      fetchImpl: fetchImpl404 as unknown as typeof fetch,
      quiet: true,
    });

    const fetchImpl500 = vi.fn(async () => makeResponse({ ok: false, status: 500 }));
    const promise = fetchSteamJson('https://example.test/i-500', {
      fetchImpl: fetchImpl500 as unknown as typeof fetch,
      quiet: true,
    });
    await vi.runAllTimersAsync();
    await promise;

    const health = getSteamApiHealth();
    expect(health.statusCounts['404']).toBe(1);
    expect(health.statusCounts['500']).toBe(1);
    expect(health.total).toBe(2);
    expect(health.failed).toBe(2);
    expect(health.succeeded).toBe(0);
  });

  it('ネットワーク例外はリトライ対象で、最終的に reason に例外内容と attempts を含む', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ETIMEDOUT');
    });

    const promise = fetchSteamJson('https://example.test/j', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('ETIMEDOUT');
      expect(result.attempts).toBe(STEAM_MAX_ATTEMPTS);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(STEAM_MAX_ATTEMPTS);
    expect(getSteamApiHealth().statusCounts['network']).toBe(1);
  });
});
