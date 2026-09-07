/**
 * Steam Resolver の失敗理由の記録（Issue #363）
 *
 * 第20号では appdetails が 10 回中 10 回失敗したが、attempts の reason が
 * `name mismatch or appdetails failed` に丸められていたため、
 * 「API 障害（403/429/タイムアウト）」と「名前不一致（別ゲームの appId）」を
 * 事後に切り分けられなかった。attempts に理由が残ることを検証する。
 *
 * fetch は差し替え（Steam には一切アクセスしない）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSteam } from './steam.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

/** JSON を返す Response 相当 */
function jsonRes(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** appdetails / storesearch の応答を URL で振り分ける fetch を作る */
function makeFetch(handlers: {
  appdetails?: (appId: number) => Response | Promise<Response>;
  storesearch?: (term: string) => Response | Promise<Response>;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/appdetails')) {
      const appId = Number(url.match(/appids=(\d+)/)?.[1]);
      if (!handlers.appdetails) throw new Error('unexpected appdetails call');
      return handlers.appdetails(appId);
    }
    if (url.includes('/api/storesearch')) {
      const term = decodeURIComponent(url.match(/term=([^&]*)/)?.[1] ?? '');
      if (!handlers.storesearch) throw new Error('unexpected storesearch call');
      return handlers.storesearch(term);
    }
    throw new Error(`unexpected url: ${url}`);
  }) as unknown as typeof fetch;
}

/** method に対応する attempt の reason を取り出す */
function reasonOf(
  attempts: { method: string; ok: boolean; reason?: string }[],
  method: string
): string {
  const attempt = attempts.find((a) => a.method === method);
  expect(attempt, `attempt ${method} が記録されていない`).toBeDefined();
  return attempt!.reason ?? '';
}

describe('resolveSteam: known-appid の失敗理由', () => {
  it('appdetails が HTTP 403 なら API 障害として理由に残す', async () => {
    global.fetch = makeFetch({
      appdetails: () => jsonRes({}, 403),
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'Onimusha', knownSteamAppId: 111 });

    expect(result.link).toBeNull();
    const reason = reasonOf(result.attempts, 'known-appid');
    expect(reason).toContain('403');
    expect(reason).toContain('111');
  });

  it('appdetails がタイムアウトしたら例外の内容を理由に残す', async () => {
    global.fetch = makeFetch({
      appdetails: () => {
        throw new Error('TimeoutError: aborted');
      },
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'Onimusha', knownSteamAppId: 222 });

    expect(reasonOf(result.attempts, 'known-appid')).toContain('TimeoutError');
  });

  it('名前不一致は API 障害と区別でき、両方の名前を理由に含む', async () => {
    global.fetch = makeFetch({
      appdetails: (appId) =>
        jsonRes({
          [String(appId)]: {
            success: true,
            data: { name: 'Totally Different Game', release_date: { date: 'Jan 1, 2020' } },
          },
        }),
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'Onimusha', knownSteamAppId: 333 });

    const reason = reasonOf(result.attempts, 'known-appid');
    expect(reason).toContain('name mismatch');
    // 実際に返ってきた名前と期待した名前の両方が残る（別ゲームの appId だったのか判断できる）
    expect(reason).toContain('Totally Different Game');
    expect(reason).toContain('Onimusha');
    expect(reason).not.toContain('HTTP');
  });

  it('success:false は名前不一致とも HTTP エラーとも別の理由として残す', async () => {
    global.fetch = makeFetch({
      appdetails: (appId) => jsonRes({ [String(appId)]: { success: false } }),
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'Onimusha', knownSteamAppId: 444 });

    expect(reasonOf(result.attempts, 'known-appid')).toContain('success:false');
  });

  it('名前が一致すれば従来どおり high confidence の Steam URL を返す', async () => {
    global.fetch = makeFetch({
      appdetails: (appId) =>
        jsonRes({
          [String(appId)]: { success: true, data: { name: 'Onimusha', release_date: {} } },
        }),
    });

    const result = await resolveSteam({ title: 'Onimusha', knownSteamAppId: 555 });

    expect(result.link).toEqual({
      platform: 'steam',
      url: 'https://store.steampowered.com/app/555/',
      resolvedBy: 'cache',
      confidence: 'high',
    });
  });
});

describe('resolveSteam: storesearch の失敗理由', () => {
  it('storesearch が全タイトルで HTTP 403 なら API 障害と明示する', async () => {
    global.fetch = makeFetch({
      storesearch: () => jsonRes({}, 403),
    });

    const result = await resolveSteam({ title: 'MOLE' });

    const reason = reasonOf(result.attempts, 'storesearch');
    expect(reason).toContain('API 障害');
    expect(reason).toContain('403');
  });

  it('検索結果 0 件は API 障害として扱わない', async () => {
    global.fetch = makeFetch({
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'Nonexistent Game' });

    const reason = reasonOf(result.attempts, 'storesearch');
    expect(reason).toContain('0 件');
    expect(reason).not.toContain('API 障害');
  });

  it('ヒットしたがタイトル一致しない場合は先頭候補名を理由に残す', async () => {
    global.fetch = makeFetch({
      storesearch: () =>
        jsonRes({
          total: 1,
          items: [{ id: 900, name: 'Something Else Entirely' }],
        }),
    });

    const result = await resolveSteam({ title: 'MOLE' });

    const reason = reasonOf(result.attempts, 'storesearch');
    expect(reason).toContain('Something Else Entirely');
    expect(reason).not.toContain('API 障害');
  });

  it('一部のタイトルだけ API 失敗した場合は API 障害と断定しない', async () => {
    // 英語タイトルは 500、日本語タイトルは正常に 0 件 → API 全滅ではない
    global.fetch = makeFetch({
      storesearch: (term) =>
        term === 'MOLE' ? jsonRes({}, 500) : jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({ title: 'MOLE', titleJa: 'モグラ' });

    const reason = reasonOf(result.attempts, 'storesearch');
    expect(reason).toContain('500');
    expect(reason).not.toContain('API 障害');
  });

  it('storesearch がヒットしても appdetails 検証で落ちたら、どちらの段で落ちたか分かる', async () => {
    global.fetch = makeFetch({
      storesearch: () => jsonRes({ total: 1, items: [{ id: 777, name: 'MOLE' }] }),
      appdetails: () => jsonRes({}, 429),
    });

    const result = await resolveSteam({ title: 'MOLE' });

    const reason = reasonOf(result.attempts, 'storesearch');
    expect(reason).toContain('777');
    expect(reason).toContain('429');
  });
});

describe('resolveSteam: igdb-website の失敗理由', () => {
  it('IGDB の Steam URL の appId が名前不一致なら appId と両方の名前を残す', async () => {
    global.fetch = makeFetch({
      appdetails: (appId) =>
        jsonRes({
          [String(appId)]: { success: true, data: { name: 'Wrong Entry', release_date: {} } },
        }),
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({
      title: 'Onimusha',
      igdbWebsites: [{ url: 'https://store.steampowered.com/app/2524850/', type: 13 }],
    });

    const reason = reasonOf(result.attempts, 'igdb-website');
    expect(reason).toContain('2524850');
    expect(reason).toContain('Wrong Entry');
  });

  it('appId を抽出できない Steam URL は従来どおりの理由を残す', async () => {
    global.fetch = makeFetch({
      storesearch: () => jsonRes({ total: 0, items: [] }),
    });

    const result = await resolveSteam({
      title: 'Onimusha',
      igdbWebsites: [{ url: 'https://store.steampowered.com/search/?term=onimusha', type: 13 }],
    });

    expect(reasonOf(result.attempts, 'igdb-website')).toContain('appId');
  });
});
