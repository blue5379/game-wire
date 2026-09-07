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
  configureSteamApiClient,
  writeSteamApiHealth,
  readSteamApiHealth,
  mergeSteamApiHealth,
  STEAM_MAX_ATTEMPTS,
  STEAM_RETRY_AFTER_MAX_MS,
  STEAM_CIRCUIT_FAILURE_THRESHOLD,
  STEAM_MIN_REQUEST_INTERVAL_MS,
  STEAM_RATE_LIMITED_INTERVAL_MS,
  STEAM_PACING_MAX_INTERVAL_MS,
  STEAM_CIRCUIT_COOLDOWN_MS,
  STEAM_API_TIMEOUT_MS,
  STEAM_LIST_API_TIMEOUT_MS,
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

/** 常に HTTP 200 で成功する fetchImpl */
function makeOk(): typeof fetch {
  return vi.fn(async () => makeResponse({ ok: true, json: { success: true } })) as unknown as typeof fetch;
}

/** 常に指定ステータスで失敗する fetchImpl */
function makeAlwaysFail(status: number): typeof fetch {
  return vi.fn(async () => makeResponse({ ok: false, status })) as unknown as typeof fetch;
}

beforeEach(() => {
  resetSteamApiClient();
  // 既存テスト（ペーシング導入前に書かれたもの）が、複数回の逐次呼び出しの2回目以降で
  // ペーシング待機（デフォルト STEAM_MIN_REQUEST_INTERVAL_MS）にブロックされないよう、
  // デフォルトでは間隔0にしておく。ペーシング自体を検証するテストは各テスト内で
  // configureSteamApiClient({ minRequestIntervalMs: ... }) で明示的に上書きする。
  configureSteamApiClient({ minRequestIntervalMs: 0 });
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

  // 429 は B対応でリトライしなくなったため、Retry-After によるリトライ待機の検証には
  // 429 以外の retryable ステータス（503）を使う。429 の Retry-After はリトライ待機では
  // なくペーシング間隔に使われる（C対応。「適応型ペーシング」describe 内のテスト参照）。
  it('503 で Retry-After: 2 を尊重して2000ms待ってからリトライする', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return makeResponse({ ok: false, status: 503, headers: { 'Retry-After': '2' } });
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

  it('503 で Retry-After が極端に大きい場合 STEAM_RETRY_AFTER_MAX_MS にクランプされる', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return makeResponse({ ok: false, status: 503, headers: { 'Retry-After': '999999' } });
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

    it('rateLimitHits を加算する。両方 undefined なら undefined のまま、片方でも数値があれば数値になる', () => {
      // 片方に rateLimitHits があり、もう片方（旧スナップショット相当）に無いケース
      const mergedOneUndefined = mergeSteamApiHealth([
        makeHealth({ rateLimitHits: 3 }),
        makeHealth(), // rateLimitHits フィールド無し（旧スナップショット）
      ]);
      expect(mergedOneUndefined.rateLimitHits).toBe(3);

      // 両方に値があるケース: 加算される
      const mergedBoth = mergeSteamApiHealth([
        makeHealth({ rateLimitHits: 2 }),
        makeHealth({ rateLimitHits: 5 }),
      ]);
      expect(mergedBoth.rateLimitHits).toBe(7);

      // 両方 undefined（旧スナップショットのみ）のケース: undefined のまま
      const mergedNone = mergeSteamApiHealth([makeHealth(), makeHealth()]);
      expect(mergedNone.rateLimitHits).toBeUndefined();
    });
  });

  it('readSteamApiHealth は rateLimitHits を必須フィールド検査に含めない（旧スナップショットも読める）', () => {
    const filePath = path.join(tmpDir, 'legacy-no-rate-limit-hits.json');
    // rateLimitHits フィールード自体が無い旧形式のスナップショット
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        stage: 'fetch-data',
        total: 10,
        succeeded: 8,
        failed: 2,
        consecutiveFailures: 1,
        circuitOpen: false,
        statusCounts: { '500': 2 },
      })
    );
    const snapshot = readSteamApiHealth(filePath);
    expect(snapshot).toBeDefined();
    expect(snapshot?.rateLimitHits).toBeUndefined();
    expect(snapshot?.total).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A. 適応型ペーシング
// ─────────────────────────────────────────────────────────────────────────────
describe('適応型ペーシング（A対応。実測3・実測4の再発防止）', () => {
  it('連続2回の呼び出しで、2回目が最小間隔だけ待つ（間隔0を注入したケースと待つケースの両方）', async () => {
    // 間隔0を注入したケース: 2回目も待たない
    const sleepSpyZero = vi.fn(async () => {});
    configureSteamApiClient({ sleepImpl: sleepSpyZero, minRequestIntervalMs: 0 });
    await fetchSteamJson('https://example.test/pace-zero-1', { fetchImpl: makeOk(), quiet: true });
    await fetchSteamJson('https://example.test/pace-zero-2', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpyZero).not.toHaveBeenCalled();

    // 間隔を注入したケース: 1回目は待たない（直前の呼び出しが無い）が、2回目は待つ
    resetSteamApiClient();
    const sleepSpy = vi.fn(async () => {});
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 500 });
    await fetchSteamJson('https://example.test/pace-1', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpy).not.toHaveBeenCalled();
    await fetchSteamJson('https://example.test/pace-2', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpy).toHaveBeenCalledWith(500);
  });

  it('Promise.all で同時に2本投げても直列化されて2本目が待つ（ゲートが効いていないと落ちる）', async () => {
    let releaseSleep: () => void = () => {};
    const sleepSpy = vi.fn((ms: number) => {
      if (ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        releaseSleep = resolve;
      });
    });
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 1000 });

    const fetchImpl = makeOk();
    const both = Promise.all([
      fetchSteamJson('https://example.test/concurrent-1', { fetchImpl, quiet: true }),
      fetchSteamJson('https://example.test/concurrent-2', { fetchImpl, quiet: true }),
    ]);

    // マイクロタスクを十分に流す。ゲートが正しく直列化されていれば、2本目は
    // sleepSpy(1000) の未解決 Promise で止まり、fetchImpl には到達できない。
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    expect(sleepSpy).toHaveBeenCalledWith(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    releaseSleep();
    await both;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('429 を観測すると次の呼び出し以降の間隔が STEAM_RATE_LIMITED_INTERVAL_MS 以上に上がり、STEAM_PACING_MAX_INTERVAL_MS でクランプされ、成功しても下がらない', async () => {
    // B対応で429はリトライしなくなったため、「1回の呼び出し内でリトライ→成功する間に
    // 間隔が上がる」ことは検証できない。代わりに「429で即失敗した論理呼び出しの後、
    // 次の論理呼び出しの gatePacing 待機に上がった間隔が使われる」ことを検証する。
    const sleepSpy = vi.fn(async (_ms: number) => {});
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 0 });

    // 1本目: 429 → 即失敗（リトライしない）。ペーシング間隔が
    // max(0*2, STEAM_RATE_LIMITED_INTERVAL_MS) = STEAM_RATE_LIMITED_INTERVAL_MS に上がる。
    await fetchSteamJson('https://example.test/bump-1', {
      fetchImpl: makeAlwaysFail(429),
      quiet: true,
    });

    // 2本目: 通常成功。gatePacing の待機に「上がった後」の間隔が使われる。
    await fetchSteamJson('https://example.test/bump-2-ok', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpy.mock.calls.at(-1)?.[0]).toBe(STEAM_RATE_LIMITED_INTERVAL_MS);

    // 3本目: 429 → 即失敗。1500 * 2 = 3000 = STEAM_PACING_MAX_INTERVAL_MS（ちょうど上限）
    await fetchSteamJson('https://example.test/bump-3', {
      fetchImpl: makeAlwaysFail(429),
      quiet: true,
    });
    await fetchSteamJson('https://example.test/bump-4-ok', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpy.mock.calls.at(-1)?.[0]).toBe(STEAM_PACING_MAX_INTERVAL_MS);

    // 5本目: 429 → 即失敗。3000 * 2 = 6000 のはずだが上限 3000 でクランプされたままのはず
    await fetchSteamJson('https://example.test/bump-5', {
      fetchImpl: makeAlwaysFail(429),
      quiet: true,
    });

    // 6本目: 429 無しの通常成功のみ。間隔は下がらず 3000 のまま使われる
    sleepSpy.mockClear();
    await fetchSteamJson('https://example.test/bump-6-ok', { fetchImpl: makeOk(), quiet: true });
    expect(sleepSpy).toHaveBeenCalledWith(STEAM_PACING_MAX_INTERVAL_MS);
  });

  it('429 の Retry-After（秒数）が次の呼び出しのペーシング間隔に反映される（C対応。上限未満の値はそのまま採用される）', async () => {
    const sleepSpy = vi.fn(async (_ms: number) => {});
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 0 });

    // Retry-After: 2 → 2000ms。currentPacingIntervalMs*2 (0) や
    // STEAM_RATE_LIMITED_INTERVAL_MS (1500) より大きく、STEAM_PACING_MAX_INTERVAL_MS
    // (3000) 未満なので、そのまま 2000ms が採用される。
    const fetchImpl429 = vi.fn(async () =>
      makeResponse({ ok: false, status: 429, headers: { 'Retry-After': '2' } })
    );
    const result = await fetchSteamJson('https://example.test/retry-after-pacing', {
      fetchImpl: fetchImpl429 as unknown as typeof fetch,
      quiet: true,
    });
    // Retry-After があってもリトライはしない
    expect(fetchImpl429).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);

    await fetchSteamJson('https://example.test/retry-after-pacing-next', {
      fetchImpl: makeOk(),
      quiet: true,
    });
    expect(sleepSpy.mock.calls.at(-1)?.[0]).toBe(2000);
  });

  it('429 の Retry-After が STEAM_PACING_MAX_INTERVAL_MS を超える場合、ペーシング間隔はそこでクランプされる（C対応。例: Retry-After:5 → 5000msだが3000msにクランプ）', async () => {
    const sleepSpy = vi.fn(async (_ms: number) => {});
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 0 });

    // Retry-After: 5 → 5000ms だが、STEAM_PACING_MAX_INTERVAL_MS (3000) を超えるため
    // クランプされて 3000ms になる。
    const fetchImpl429 = vi.fn(async () =>
      makeResponse({ ok: false, status: 429, headers: { 'Retry-After': '5' } })
    );
    await fetchSteamJson('https://example.test/retry-after-pacing-clamp', {
      fetchImpl: fetchImpl429 as unknown as typeof fetch,
      quiet: true,
    });
    expect(fetchImpl429).toHaveBeenCalledTimes(1);

    await fetchSteamJson('https://example.test/retry-after-pacing-clamp-next', {
      fetchImpl: makeOk(),
      quiet: true,
    });
    expect(sleepSpy.mock.calls.at(-1)?.[0]).toBe(STEAM_PACING_MAX_INTERVAL_MS);
  });

  it('429 の Retry-After が極端に大きい場合（parseRetryAfterMs 側で STEAM_RETRY_AFTER_MAX_MS にクランプ後）でも、ペーシング間隔は STEAM_PACING_MAX_INTERVAL_MS でクランプされる（C対応）', async () => {
    const sleepSpy = vi.fn(async (_ms: number) => {});
    configureSteamApiClient({ sleepImpl: sleepSpy, minRequestIntervalMs: 0 });

    const fetchImpl429 = vi.fn(async () =>
      makeResponse({ ok: false, status: 429, headers: { 'Retry-After': '999999' } })
    );
    await fetchSteamJson('https://example.test/retry-after-pacing-extreme-clamp', {
      fetchImpl: fetchImpl429 as unknown as typeof fetch,
      quiet: true,
    });
    expect(fetchImpl429).toHaveBeenCalledTimes(1);

    await fetchSteamJson('https://example.test/retry-after-pacing-extreme-clamp-next', {
      fetchImpl: makeOk(),
      quiet: true,
    });
    expect(sleepSpy.mock.calls.at(-1)?.[0]).toBe(STEAM_PACING_MAX_INTERVAL_MS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. gatePacing の try/finally（sleepImpl が例外を投げてもデッドロックしない）
// ─────────────────────────────────────────────────────────────────────────────
describe('gatePacing: sleepImpl が例外を投げても pacingChain が解放される（E対応）', () => {
  it('2本目の gatePacing で sleepImpl が reject しても、その呼び出しは失敗として伝播し、3本目はハングせず完了する', async () => {
    let callCount = 0;
    const flakySleep = vi.fn(async (_ms: number) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('sleep failed');
      }
    });
    configureSteamApiClient({ sleepImpl: flakySleep, minRequestIntervalMs: 1000 });

    // 1本目: 直前の呼び出しが無いので gatePacing は待機せず、sleepImpl は呼ばれない。
    const first = await fetchSteamJson('https://example.test/gate-pacing-1', {
      fetchImpl: makeOk(),
      quiet: true,
    });
    expect(first.ok).toBe(true);
    expect(flakySleep).not.toHaveBeenCalled();

    // 2本目: gatePacing が sleepImpl(1000) を呼び、reject する。release() が
    // try/finally で必ず呼ばれなければ、pacingChain が解放されず3本目が
    // `await previous` で永久に止まる（デッドロック）。
    await expect(
      fetchSteamJson('https://example.test/gate-pacing-2', { fetchImpl: makeOk(), quiet: true })
    ).rejects.toThrow('sleep failed');
    expect(flakySleep).toHaveBeenCalledTimes(1);

    // 3本目: pacingChain が正しく解放されていればハングせず完了する。
    // （このテストのタイムアウト内に resolve すること自体が「ハングしていない」証明になる）
    const third = await fetchSteamJson('https://example.test/gate-pacing-3', {
      fetchImpl: makeOk(),
      quiet: true,
    });
    expect(third.ok).toBe(true);
    expect(flakySleep).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 429 を全滅検知から分離
// ─────────────────────────────────────────────────────────────────────────────
describe('429 をサーキットの全滅検知から分離する（B対応。実測1の再発防止）', () => {
  beforeEach(() => {
    configureSteamApiClient({ sleepImpl: async () => {}, minRequestIntervalMs: 0 });
  });

  it('403 が5連続でサーキットが開く（既存の閾値挙動が保たれている）', async () => {
    const fetchImpl = makeAlwaysFail(403);
    for (let i = 0; i < STEAM_CIRCUIT_FAILURE_THRESHOLD; i++) {
      const result = await fetchSteamJson(`https://example.test/403-${i}`, {
        fetchImpl,
        quiet: true,
      });
      if (i < STEAM_CIRCUIT_FAILURE_THRESHOLD - 1) {
        expect(getSteamApiHealth().circuitOpen).toBe(false);
      } else {
        expect(result.ok).toBe(false);
        expect(getSteamApiHealth().circuitOpen).toBe(true);
      }
    }
  });

  it('429 が20連続でもサーキットは開かず、consecutiveFailures も 0 のまま（429専用しきい値の撤廃。中核の回帰テスト）', async () => {
    // 429 専用の閾値（旧 STEAM_RATE_LIMIT_CIRCUIT_THRESHOLD=10）は撤廃済み。
    // 429 は何回続いてもサーキットを開いてはならないことを、旧しきい値を大きく超える
    // 20連続で検証する。
    const fetchImpl = makeAlwaysFail(429);
    for (let i = 0; i < 20; i++) {
      const result = await fetchSteamJson(`https://example.test/429-twenty-${i}`, {
        fetchImpl,
        quiet: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(429);
      // 429 は都度即座に失敗するので fetchImpl はこの論理呼び出しにつき1回しか呼ばれない
      expect(fetchImpl).toHaveBeenCalledTimes(i + 1);
      expect(getSteamApiHealth().circuitOpen).toBe(false);
      expect(getSteamApiHealth().consecutiveFailures).toBe(0);
    }
    const health = getSteamApiHealth();
    expect(health.circuitOpen).toBe(false);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.failed).toBe(20);
    expect(health.statusCounts['429']).toBe(20);
  });

  it('429 を1回受けたら attempts:1 で即座に失敗し、fetchImpl は1回しか呼ばれない（リトライしない。B対応）', async () => {
    const fetchImpl = makeAlwaysFail(429);
    const result = await fetchSteamJson('https://example.test/429-no-retry', {
      fetchImpl,
      quiet: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.attempts).toBe(1);
    }
  });

  it('403 でリトライ中の2回目の試行で429を受けた場合、attempts は実際の試行回数（2）を返す', async () => {
    // 1回目: 403（リトライ対象） → 2回目: 429（リトライしない） という混在ケース。
    // 429 に到達するまでに1回別の理由でリトライしているので、attempts は 2 になるべき。
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return makeResponse({ ok: false, status: 403 });
      return makeResponse({ ok: false, status: 429 });
    });

    const promise = fetchSteamJson('https://example.test/429-after-403-retry', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.attempts).toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. 半開（クールダウン後の1回プローブ）
// ─────────────────────────────────────────────────────────────────────────────
describe('半開（クールダウン後の1回プローブ）（C対応）', () => {
  beforeEach(() => {
    configureSteamApiClient({ sleepImpl: async () => {}, minRequestIntervalMs: 0 });
  });

  async function openCircuitVia403(): Promise<void> {
    const fetchImpl = makeAlwaysFail(403);
    for (let i = 0; i < STEAM_CIRCUIT_FAILURE_THRESHOLD; i++) {
      await fetchSteamJson(`https://example.test/open-403-${i}`, { fetchImpl, quiet: true });
    }
    expect(getSteamApiHealth().circuitOpen).toBe(true);
  }

  it('サーキット開放直後（クールダウン未経過）は fetch を呼ばない', async () => {
    await openCircuitVia403();

    const probeSpy = makeOk();
    const result = await fetchSteamJson('https://example.test/half-open-not-yet', {
      fetchImpl: probeSpy,
      quiet: true,
    });

    expect(probeSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(0);
      expect(result.circuitOpen).toBe(true);
    }
  });

  it('クールダウン経過後に1回だけ fetch を呼び、成功したらサーキットが閉じて以降通常動作に戻る', async () => {
    await openCircuitVia403();

    await vi.advanceTimersByTimeAsync(STEAM_CIRCUIT_COOLDOWN_MS);

    const probeSpy = makeOk();
    const probeResult = await fetchSteamJson('https://example.test/half-open-probe-ok', {
      fetchImpl: probeSpy,
      quiet: true,
    });
    expect(probeSpy).toHaveBeenCalledTimes(1);
    expect(probeResult.ok).toBe(true);
    expect(getSteamApiHealth().circuitOpen).toBe(false);

    // 以降は通常動作（サーキットに遮られず fetch が呼ばれる）
    const nextSpy = makeOk();
    const nextResult = await fetchSteamJson('https://example.test/half-open-after-recovery', {
      fetchImpl: nextSpy,
      quiet: true,
    });
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(nextResult.ok).toBe(true);
  });

  it('プローブが失敗したらサーキットは開いたままで、さらに STEAM_CIRCUIT_COOLDOWN_MS 経過するまで次のプローブが走らない', async () => {
    await openCircuitVia403();

    await vi.advanceTimersByTimeAsync(STEAM_CIRCUIT_COOLDOWN_MS);

    // プローブが失敗する（3回リトライしてすべて403）
    const failingProbe = makeAlwaysFail(403);
    const probeResult = await fetchSteamJson('https://example.test/half-open-probe-fail', {
      fetchImpl: failingProbe,
      quiet: true,
    });
    expect(probeResult.ok).toBe(false);
    expect(getSteamApiHealth().circuitOpen).toBe(true);

    // クールダウンにまだ達していない（更新された開放時刻からの再計測）→ 次の呼び出しは即失敗
    await vi.advanceTimersByTimeAsync(STEAM_CIRCUIT_COOLDOWN_MS - 1);
    const tooSoonSpy = makeOk();
    await fetchSteamJson('https://example.test/half-open-too-soon', {
      fetchImpl: tooSoonSpy,
      quiet: true,
    });
    expect(tooSoonSpy).not.toHaveBeenCalled();

    // 残り1msでクールダウンに達し、次のプローブが走る
    await vi.advanceTimersByTimeAsync(1);
    const secondProbeSpy = makeOk();
    const secondProbeResult = await fetchSteamJson('https://example.test/half-open-second-probe', {
      fetchImpl: secondProbeSpy,
      quiet: true,
    });
    expect(secondProbeSpy).toHaveBeenCalledTimes(1);
    expect(secondProbeResult.ok).toBe(true);
    expect(getSteamApiHealth().circuitOpen).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rateLimitHits（observability）
// ─────────────────────────────────────────────────────────────────────────────
describe('rateLimitHits（429 の観測総数。observability 用）', () => {
  beforeEach(() => {
    configureSteamApiClient({ sleepImpl: async () => {}, minRequestIntervalMs: 0 });
  });

  it('429 を観測した論理呼び出しごとに1件ずつ rateLimitHits に数える（B対応でリトライしなくなったため1呼び出し=1件になる）', async () => {
    await fetchSteamJson('https://example.test/rate-limit-hits-1', {
      fetchImpl: makeAlwaysFail(429),
      quiet: true,
    });
    // 429 はリトライしないので、この論理呼び出しでの観測は1回だけ
    expect(getSteamApiHealth().rateLimitHits).toBe(1);

    await fetchSteamJson('https://example.test/rate-limit-hits-2', {
      fetchImpl: makeAlwaysFail(429),
      quiet: true,
    });
    expect(getSteamApiHealth().rateLimitHits).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. sleep と間隔の注入
// ─────────────────────────────────────────────────────────────────────────────
describe('configureSteamApiClient / resetSteamApiClient（D対応）', () => {
  it('configureSteamApiClient の設定が resetSteamApiClient() で戻る', async () => {
    const oldSleepSpy = vi.fn(async () => {});
    configureSteamApiClient({ sleepImpl: oldSleepSpy, minRequestIntervalMs: 9999 });

    resetSteamApiClient();

    const newSleepSpy = vi.fn(async () => {});
    // minRequestIntervalMs は指定しない: reset 後のデフォルト値が使われるはず
    configureSteamApiClient({ sleepImpl: newSleepSpy });

    await fetchSteamJson('https://example.test/reset-config-1', { fetchImpl: makeOk(), quiet: true });
    await fetchSteamJson('https://example.test/reset-config-2', { fetchImpl: makeOk(), quiet: true });

    expect(oldSleepSpy).not.toHaveBeenCalled();
    expect(newSleepSpy).toHaveBeenCalledWith(STEAM_MIN_REQUEST_INTERVAL_MS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. リスト系エンドポイントのタイムアウト分離
// ─────────────────────────────────────────────────────────────────────────────
describe('STEAM_LIST_API_TIMEOUT_MS（F対応）', () => {
  it('単一 appdetails 用の STEAM_API_TIMEOUT_MS より長い（バルクのリスト系に必要な予算の違い）', () => {
    expect(STEAM_LIST_API_TIMEOUT_MS).toBeGreaterThan(STEAM_API_TIMEOUT_MS);
  });
});
