/**
 * steam-api-client.ts の単体テスト（Issue #360）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  fetchSteamJson,
  getSteamApiHealth,
  resetSteamApiClient,
  writeSteamApiHealth,
  readSteamApiHealth,
  mergeSteamApiHealth,
  STEAM_MAX_ATTEMPTS,
  STEAM_RETRY_AFTER_MAX_MS,
  STEAM_CIRCUIT_FAILURE_THRESHOLD,
  type SteamApiHealth,
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

/** HTTP 200 だが本文が JSON でないため res.json() が reject するレスポンス（バグ2用） */
function makeBrokenJsonResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
    headers: { get: () => null },
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

  // バグ2: res.json() が reject する 200 応答でカウンタが二重計上されないこと
  describe('res.json() が失敗する 200 応答（バグ2）', () => {
    it('(a) リトライされる', async () => {
      const fetchImpl = vi.fn(async () => makeBrokenJsonResponse());

      const promise = fetchSteamJson('https://example.test/broken-json', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        quiet: true,
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(fetchImpl).toHaveBeenCalledTimes(STEAM_MAX_ATTEMPTS);
    });

    it('(b) 最終的に失敗したとき succeeded が加算されていない', async () => {
      const fetchImpl = vi.fn(async () => makeBrokenJsonResponse());

      const promise = fetchSteamJson('https://example.test/broken-json-2', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        quiet: true,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      const health = getSteamApiHealth();
      // res.ok=true の応答を3回受けたが、すべて json() で失敗している。
      // succeeded は 1 度も加算されてはならない（succeeded + failed <= total を保つ）。
      expect(health.succeeded).toBe(0);
      expect(health.failed).toBe(1);
      expect(health.total).toBe(1);
    });

    it('(c) 直前に成功していない状態から始めても、consecutiveFailures が途中で誤ってリセットされず最終的に加算される', async () => {
      // 事前に1回失敗させて consecutiveFailures=1 の状態を作る
      const priorFail = vi.fn(async () => makeResponse({ ok: false, status: 404 }));
      await fetchSteamJson('https://example.test/prior-fail', {
        fetchImpl: priorFail as unknown as typeof fetch,
        quiet: true,
      });
      expect(getSteamApiHealth().consecutiveFailures).toBe(1);

      // json() が壊れている 200 応答（バグがあると succeeded++ / consecutiveFailures=0 が
      // 実行されてしまうが、最終的にはこの呼び出しも失敗する）
      const fetchImpl = vi.fn(async () => makeBrokenJsonResponse());
      const promise = fetchSteamJson('https://example.test/broken-json-3', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        quiet: true,
      });
      await vi.runAllTimersAsync();
      await promise;

      // 修正後は succeeded が一度も加算されないので、この呼び出しの失敗で
      // consecutiveFailures は 1 → 2 になる（誤ってリセットされていれば 1 のままになる）
      expect(getSteamApiHealth().consecutiveFailures).toBe(2);
    });
  });

  // バグ3: サーキットで打ち切った呼び出しが statusCounts に載らない
  it('サーキット開放時にスキップされた呼び出しは statusCounts["circuit-open"] に計上される', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 404 }));
    for (let i = 0; i < STEAM_CIRCUIT_FAILURE_THRESHOLD; i++) {
      await fetchSteamJson(`https://example.test/circuit-${i}`, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        quiet: true,
      });
    }
    // ここでサーキットは開いている。以降の呼び出しは fetchImpl を呼ばずに即失敗する
    await fetchSteamJson('https://example.test/circuit-skip-1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });
    await fetchSteamJson('https://example.test/circuit-skip-2', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });

    const health = getSteamApiHealth();
    expect(health.statusCounts['circuit-open']).toBe(2);
    // sum(statusCounts) が failed と一致する（内訳の欠落が無い）ことを確認
    const sumStatusCounts = Object.values(health.statusCounts).reduce((a, b) => a + b, 0);
    expect(sumStatusCounts).toBe(health.failed);
  });
});

describe('writeSteamApiHealth / readSteamApiHealth / mergeSteamApiHealth（Issue #360 プロセス跨ぎ集計）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-api-health-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('write したスナップショットを read で読み戻せる（stage 付き）', async () => {
    const filePath = path.join(tmpDir, 'steam-api-health.json');
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 404 }));
    await fetchSteamJson('https://example.test/write-read', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });

    writeSteamApiHealth(filePath, 'fetch-data');
    const snapshot = readSteamApiHealth(filePath);

    expect(snapshot).toBeDefined();
    expect(snapshot?.stage).toBe('fetch-data');
    expect(snapshot?.total).toBe(1);
    expect(snapshot?.failed).toBe(1);
    expect(snapshot?.statusCounts['404']).toBe(1);
  });

  it('ファイルが存在しない場合は undefined を返す（fetch-data を経ない単独実行を壊さない）', () => {
    const filePath = path.join(tmpDir, 'does-not-exist.json');
    expect(readSteamApiHealth(filePath)).toBeUndefined();
  });

  it('壊れた JSON の場合は undefined を返す（例外を投げない）', () => {
    const filePath = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(filePath, '{ not valid json');
    expect(readSteamApiHealth(filePath)).toBeUndefined();
  });

  it('形が不正な JSON（必須フィールド欠落）の場合は undefined を返す', () => {
    const filePath = path.join(tmpDir, 'wrong-shape.json');
    fs.writeFileSync(filePath, JSON.stringify({ stage: 'fetch-data', total: 1 }));
    expect(readSteamApiHealth(filePath)).toBeUndefined();
  });

  it('write は親ディレクトリが無くても作成する', () => {
    const filePath = path.join(tmpDir, 'nested', 'dir', 'steam-api-health.json');
    writeSteamApiHealth(filePath, 'fetch-data');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  describe('mergeSteamApiHealth', () => {
    function makeHealth(overrides: Partial<SteamApiHealth> = {}): SteamApiHealth {
      return {
        total: 0,
        succeeded: 0,
        failed: 0,
        consecutiveFailures: 0,
        circuitOpen: false,
        statusCounts: {},
        ...overrides,
      };
    }

    it('total / succeeded / failed を加算する', () => {
      const merged = mergeSteamApiHealth([
        makeHealth({ total: 10, succeeded: 7, failed: 3 }),
        makeHealth({ total: 5, succeeded: 5, failed: 0 }),
      ]);
      expect(merged.total).toBe(15);
      expect(merged.succeeded).toBe(12);
      expect(merged.failed).toBe(3);
    });

    it('statusCounts をキーごとに加算する', () => {
      const merged = mergeSteamApiHealth([
        makeHealth({ statusCounts: { '403': 2, '500': 1 } }),
        makeHealth({ statusCounts: { '403': 3, network: 1 } }),
      ]);
      expect(merged.statusCounts).toEqual({ '403': 5, '500': 1, network: 1 });
    });

    it('circuitOpen はいずれかが true なら true（OR）', () => {
      const merged = mergeSteamApiHealth([
        makeHealth({ circuitOpen: false }),
        makeHealth({ circuitOpen: true }),
      ]);
      expect(merged.circuitOpen).toBe(true);
    });

    it('circuitOpen は全て false なら false', () => {
      const merged = mergeSteamApiHealth([
        makeHealth({ circuitOpen: false }),
        makeHealth({ circuitOpen: false }),
      ]);
      expect(merged.circuitOpen).toBe(false);
    });

    it('consecutiveFailures は最大値（加算しない）', () => {
      const merged = mergeSteamApiHealth([
        makeHealth({ consecutiveFailures: 5 }),
        makeHealth({ consecutiveFailures: 3 }),
      ]);
      expect(merged.consecutiveFailures).toBe(5);
    });

    it('空配列を渡すとゼロ値を返す', () => {
      const merged = mergeSteamApiHealth([]);
      expect(merged).toEqual({
        total: 0,
        succeeded: 0,
        failed: 0,
        consecutiveFailures: 0,
        circuitOpen: false,
        statusCounts: {},
      });
    });
  });
});
