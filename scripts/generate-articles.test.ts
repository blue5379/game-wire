/**
 * generate-articles.ts の verifyProposedGames ユニットテスト（Issue #208）
 *
 * verifyProposedGames は特集記事の実在検証経路であり、enrichGameWithIGDB に
 * mainGameOnly: true を渡す唯一の呼び出し元である（他4箇所は既定 false のまま）。
 * この呼び出し契約が保たれていることをピン留めする。
 *
 * Bedrock（@aws-sdk/client-bedrock-runtime）は verifyProposedGames の実行パスには
 * 含まれないため呼ばれないが、generate-articles.ts のモジュール読み込み時に
 * bedrock-client.js が import されるため、ネットワークを叩かないよう fetch-igdb.js のみ
 * vi.mock で差し込む（他の依存は verifyProposedGames の実行に影響しない）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IGDBGame } from './types.js';

vi.mock('./fetch-igdb.js', () => ({
  enrichGameWithIGDB: vi.fn().mockResolvedValue(null),
}));

import { __test } from './generate-articles.js';
import { enrichGameWithIGDB } from './fetch-igdb.js';

const mockEnrich = vi.mocked(enrichGameWithIGDB);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnrich.mockResolvedValue(null);
});

describe('verifyProposedGames — mainGameOnly propagation (Issue #208)', () => {
  it('enrichGameWithIGDB に mainGameOnly: true を渡す', async () => {
    const igdbResult: IGDBGame = {
      id: 1,
      name: 'Elden Ring',
      slug: 'elden-ring',
    };
    mockEnrich.mockResolvedValue(igdbResult);

    await __test.verifyProposedGames([
      { title: 'Elden Ring', reason: 'テスト理由', expectedYear: 2022 },
    ]);

    expect(mockEnrich).toHaveBeenCalledTimes(1);
    expect(mockEnrich).toHaveBeenCalledWith(
      'Elden Ring',
      expect.objectContaining({ mainGameOnly: true, expectedYear: 2022 })
    );
  });

  it('IGDB で見つからない提案は破棄され、結果に含まれない', async () => {
    mockEnrich.mockResolvedValue(null);

    const result = await __test.verifyProposedGames([
      { title: 'Nonexistent Game XYZ', reason: 'テスト理由' },
    ]);

    expect(result).toEqual([]);
  });
});
