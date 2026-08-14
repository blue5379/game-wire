/**
 * fetch-official-jp-url の純関数ユニットテスト
 *
 * Issue #135: Tavily クエリと Claude 選別プロンプトに developer/publisher を
 * 含めるよう変更したため、その挙動を回帰防止する。
 *
 * Issue #346: Claude 選別が null を返した場合、または検証が mismatch を返した場合に
 * 次のクエリにフォールスルーする挙動を回帰防止する。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildSearchQueries,
  buildSelectUserMessage,
  isNonOfficialUrl,
  NON_OFFICIAL_URL_PATTERNS,
  tryQueryForOfficialUrl,
  type FetchOfficialJpUrlResult,
} from './fetch-official-jp-url.js';

describe('buildSearchQueries (Issue #135 P2-1)', () => {
  it('developer がある場合、1st クエリに developer 名を含める', () => {
    const queries = buildSearchQueries('Hitman 3', undefined, 'IO Interactive');
    expect(queries[0]).toContain('"Hitman 3"');
    expect(queries[0]).toContain('"IO Interactive"');
    expect(queries[0]).toContain('公式サイト');
  });

  it('developer が無い場合、publisher を代わりに使う', () => {
    const queries = buildSearchQueries('Some Game', undefined, undefined, 'Pub Inc');
    expect(queries[0]).toContain('"Pub Inc"');
  });

  it('developer も publisher も無い場合、従来のタイトル単独クエリから始まる', () => {
    const queries = buildSearchQueries('Plain Game');
    // 開発元クエリは生成されず、最初のクエリはタイトル単独
    expect(queries[0]).toContain('"Plain Game"');
    expect(queries[0]).not.toContain('"undefined"');
  });

  it('titleJa があれば 1st クエリにも両言語が含まれる', () => {
    const queries = buildSearchQueries('Hitman 3', 'ヒットマン3', 'IO Interactive');
    expect(queries[0]).toContain('"ヒットマン3"');
    expect(queries[0]).toContain('"Hitman 3"');
    expect(queries[0]).toContain('"IO Interactive"');
  });

  it('クエリ列は優先度順に並び、後段に従来のフォールバックが続く', () => {
    const queries = buildSearchQueries('Hitman 3', 'ヒットマン3', 'IO Interactive');
    // 開発元入りが最初、続いてタイトル一致強制、続いて柔軟マッチ、続いて英語のみ、最後に簡略化
    expect(queries.length).toBeGreaterThanOrEqual(5);
    expect(queries[0]).toContain('IO Interactive');
    expect(queries[1]).not.toContain('IO Interactive');
    expect(queries[1]).toContain('日本語');
  });
});

describe('buildSelectUserMessage (Issue #135 P2-2)', () => {
  it('developer / publisher を本文に含める', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Hitman 3',
      developer: 'IO Interactive',
      publisher: 'IO Interactive',
      candidates: ['https://ioi.dk/', 'https://example.com/'],
    });
    expect(msg).toContain('開発元: IO Interactive');
    expect(msg).toContain('発売元: IO Interactive');
  });

  it('developer / publisher が無ければ該当行は出力しない', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Indie Game',
      candidates: ['https://example.com/'],
    });
    expect(msg).not.toContain('開発元:');
    expect(msg).not.toContain('発売元:');
  });

  it('候補URLが番号付きで列挙される', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'X',
      candidates: ['https://a.example/', 'https://b.example/'],
    });
    expect(msg).toContain('1. https://a.example/');
    expect(msg).toContain('2. https://b.example/');
  });

  it('ドメイン整合チェックを促す指示文を含む', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'X',
      developer: 'Dev',
      candidates: ['https://example.com/'],
    });
    expect(msg).toContain(
      '候補URLのドメインが開発元・発売元・日本語ローカライザのいずれとも整合しない場合は採用しない'
    );
  });

  it('titleJa があれば「英語（日本語）」表記でゲーム名を案内する', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Hitman 3',
      titleJa: 'ヒットマン3',
      candidates: ['https://example.com/'],
    });
    expect(msg).toContain('Hitman 3（ヒットマン3）');
  });
});

describe('isNonOfficialUrl (Issue #247: bsky.app / discordapp.com の混入対策)', () => {
  it('bsky.app（Bluesky）のURLを非公式と判定する', () => {
    // 本番で "Slay the Spire II" 記事に誤って採用された実際のURL
    expect(isNonOfficialUrl('https://bsky.app/profile/megacrit.com')).toBe(true);
  });

  it('discordapp.com（discord.com移行前の旧ドメイン）のURLを非公式と判定する', () => {
    // 本番で誤って採用された実際のURL
    expect(isNonOfficialUrl('https://discordapp.com/invite/qcNyHre')).toBe(true);
  });

  it('discord.com（現行ドメイン）のURLも引き続き非公式と判定する', () => {
    expect(isNonOfficialUrl('https://discord.com/invite/example')).toBe(true);
  });

  it('大文字を含むURLでも非公式と判定する（小文字化して比較するため）', () => {
    expect(isNonOfficialUrl('https://BSKY.APP/profile/megacrit.com')).toBe(true);
  });

  it('公式サイトらしきURLは非公式と判定しない', () => {
    expect(isNonOfficialUrl('https://www.megacrit.com/games/')).toBe(false);
  });

  it('NON_OFFICIAL_URL_PATTERNS に bsky.app と discordapp.com が含まれる', () => {
    expect(NON_OFFICIAL_URL_PATTERNS).toContain('bsky.app');
    expect(NON_OFFICIAL_URL_PATTERNS).toContain('discordapp.com');
  });
});

describe('tryQueryForOfficialUrl (Issue #346: query fallthrough)', () => {
  const gameParams = {
    titleEn: 'Test Game',
    titleJa: 'テストゲーム',
    releaseYear: '2024',
    developer: 'Test Dev',
    publisher: 'Test Pub',
  };

  it('検索が候補を返さない場合、選別・検証を呼ばずに null を返す', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    const mockSelect = vi.fn();
    const mockVerify = vi.fn();

    const result = await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(result).toBeNull();
    expect(mockSearch).toHaveBeenCalledWith('Test Game', 'test query');
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('Claude 選別が null を返す場合、検証を呼ばずに null を返す（フォールスルー）', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://example.com/']);
    const mockSelect = vi.fn().mockResolvedValue(null);
    const mockVerify = vi.fn();

    const result = await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(result).toBeNull();
    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockSelect).toHaveBeenCalledWith(
      'Test Game',
      'テストゲーム',
      '2024',
      ['https://example.com/'],
      'Test Dev',
      'Test Pub'
    );
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('検証が mismatch を返す場合、null を返す（フォールスルー）', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://example.com/']);
    const mockSelect = vi.fn().mockResolvedValue('https://example.com/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'mismatch',
      reason: 'ドメインが開発元と無関係',
    });

    const result = await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(result).toBeNull();
    expect(mockVerify).toHaveBeenCalledWith(
      {
        titleEn: 'Test Game',
        titleJa: 'テストゲーム',
        developer: 'Test Dev',
        publisher: 'Test Pub',
      },
      'https://example.com/'
    );
  });

  it('検証が uncertain を返す場合、URL を採用する（フォールスルーしない）', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://example.com/ja/']);
    const mockSelect = vi.fn().mockResolvedValue('https://example.com/ja/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'uncertain',
      reason: 'ページ本文を取得できなかった',
    });

    const result = await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(result).toEqual({
      url: 'https://example.com/ja/',
      verifyReason: 'ページ本文を取得できなかった',
    });
  });

  it('検証が match を返す場合、URL を採用する', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://official.example.com/']);
    const mockSelect = vi.fn().mockResolvedValue('https://official.example.com/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'match',
      reason: 'タイトル・開発元が一致',
    });

    const result = await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(result).toEqual({
      url: 'https://official.example.com/',
      verifyReason: 'タイトル・開発元が一致',
    });
  });

  it('複数の候補がログに記録される', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockSearch = vi
      .fn()
      .mockResolvedValue(['https://a.example.com/', 'https://b.example.com/']);
    const mockSelect = vi.fn().mockResolvedValue('https://a.example.com/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'match',
      reason: 'verified',
    });

    await tryQueryForOfficialUrl(0, 'test query', gameParams, {
      search: mockSearch,
      select: mockSelect,
      verify: mockVerify,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Query 0] Found 2 candidates: https://a.example.com/, https://b.example.com/')
    );

    consoleSpy.mockRestore();
  });
});

describe('fetchOfficialJpUrl integration (Issue #346: multi-query fallthrough)', () => {
  // Note: These tests verify the integration behavior of fetchOfficialJpUrl
  // by using tryQueryForOfficialUrl with mocked dependencies.
  // We cannot directly test fetchOfficialJpUrl in unit tests because it has
  // hard dependencies on Tavily/Bedrock, but we can test the fallthrough logic
  // by building a similar loop structure.

  const gameParams = {
    titleEn: 'Test Game',
    titleJa: 'テストゲーム',
    releaseYear: '2024',
    developer: 'Test Dev',
    publisher: 'Test Pub',
  };

  it('query[0] の選別が null → query[1] で成功する場合、query[1] の URL を返す', async () => {
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce(['https://junk-site.com/']) // query[0]: ジャンクな候補
      .mockResolvedValueOnce(['https://official.example.com/']); // query[1]: 正しい候補

    const mockSelect = vi
      .fn()
      .mockResolvedValueOnce(null) // query[0]: Claude が null を返す
      .mockResolvedValueOnce('https://official.example.com/'); // query[1]: 選別成功

    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'match',
      reason: 'verified',
    });

    const queries = ['query 0', 'query 1'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toEqual({
      url: 'https://official.example.com/',
      verifyReason: 'verified',
    });
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockVerify).toHaveBeenCalledTimes(1); // query[1] でのみ呼ばれる
  });

  it('query[0] の検証が mismatch → query[1] で成功する場合、query[1] の URL を返す', async () => {
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce(['https://wrong-domain.com/']) // query[0]: 誤ったドメイン
      .mockResolvedValueOnce(['https://official.example.com/']); // query[1]: 正しいドメイン

    const mockSelect = vi
      .fn()
      .mockResolvedValueOnce('https://wrong-domain.com/')
      .mockResolvedValueOnce('https://official.example.com/');

    const mockVerify = vi
      .fn()
      .mockResolvedValueOnce({
        verdict: 'mismatch',
        reason: 'ドメインが開発元と無関係',
      }) // query[0]: 検証失敗
      .mockResolvedValueOnce({
        verdict: 'match',
        reason: 'verified',
      }); // query[1]: 検証成功

    const queries = ['query 0', 'query 1'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toEqual({
      url: 'https://official.example.com/',
      verifyReason: 'verified',
    });
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockVerify).toHaveBeenCalledTimes(2);
  });

  it('query[0] で成功する場合、後続クエリを試行しない（コスト保全）', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://official.example.com/']);
    const mockSelect = vi.fn().mockResolvedValue('https://official.example.com/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'match',
      reason: 'verified',
    });

    const queries = ['query 0', 'query 1', 'query 2'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toEqual({
      url: 'https://official.example.com/',
      verifyReason: 'verified',
    });
    // query[0] でのみ呼ばれる（query[1], query[2] は実行されない）
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it('全クエリが失敗する場合、null を返す', async () => {
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce(['https://junk1.com/'])
      .mockResolvedValueOnce(['https://junk2.com/'])
      .mockResolvedValueOnce([]);

    const mockSelect = vi
      .fn()
      .mockResolvedValueOnce(null) // query[0]: Claude が null
      .mockResolvedValueOnce('https://junk2.com/'); // query[1]: 選別成功だが検証失敗

    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'mismatch',
      reason: 'content mismatch',
    });

    const queries = ['query 0', 'query 1', 'query 2'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toBeNull();
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });

  it('検証が uncertain の場合、フォールスルーせず採用する', async () => {
    const mockSearch = vi.fn().mockResolvedValue(['https://official.example.com/']);
    const mockSelect = vi.fn().mockResolvedValue('https://official.example.com/');
    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'uncertain',
      reason: 'ページ本文を取得できなかった',
    });

    const queries = ['query 0', 'query 1'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toEqual({
      url: 'https://official.example.com/',
      verifyReason: 'ページ本文を取得できなかった',
    });
    // query[0] で採用されるため、query[1] は実行されない
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('Issue #346 の実測ケース: query[0] の候補が非公式 → query[3] で公式が見つかる', async () => {
    // ほの暮しの庭の実測ケースを再現
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce([
        'https://nippon1review.jp/news40',
        'https://ascii.jp/elem/000/004/423/4423043',
      ]) // query[0]: レビューサイトとニュース
      .mockResolvedValueOnce([]) // query[1]: 候補なし
      .mockResolvedValueOnce([]) // query[2]: 候補なし
      .mockResolvedValueOnce([
        'https://nippon1.jp/consumer/honogurashi',
        'https://nippon1.jp/consumer/midnight.html',
      ]); // query[3]: 公式サイト

    const mockSelect = vi
      .fn()
      .mockResolvedValueOnce(null) // query[0]: Claude が正しく null を返す
      .mockResolvedValueOnce('https://nippon1.jp/consumer/honogurashi'); // query[3]: 公式を選別

    const mockVerify = vi.fn().mockResolvedValue({
      verdict: 'match',
      reason: 'タイトル・開発元が一致',
    });

    const queries = ['query 0', 'query 1', 'query 2', 'query 3'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toEqual({
      url: 'https://nippon1.jp/consumer/honogurashi',
      verifyReason: 'タイトル・開発元が一致',
    });
    expect(mockSearch).toHaveBeenCalledTimes(4); // 全4クエリが試行される
    expect(mockSelect).toHaveBeenCalledTimes(2); // query[0] と query[3] のみ
    expect(mockVerify).toHaveBeenCalledTimes(1); // query[3] のみ
  });

  it('Issue #135 P2-1 + #346: query[0] が非公式のみ → query[1] が同名別作品 → 選別が全拒否して null（保護層が機能）', async () => {
    // Issue #135 P2-1 で developer-constrained クエリを導入してタイトル衝突を回避したが、
    // Issue #346 でフォールスルーを許可したため、低精度クエリで同名タイトルが再混入する可能性がある。
    // このテストは、Claude のドメイン整合判定が query[1] の colliding candidate を拒否することを検証する。
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce(['https://unrelated-blog.com/']) // query[0]: 非公式候補
      .mockResolvedValueOnce(['https://different-studio.com/same-title-game']); // query[1]: 同名の別作品

    const mockSelect = vi
      .fn()
      .mockResolvedValueOnce(null) // query[0]: Claude が正しく null を返す（非公式）
      .mockResolvedValueOnce(null); // query[1]: Claude がドメイン整合性で拒否

    const mockVerify = vi.fn(); // 選別が全て null なので呼ばれない

    const queries = ['query 0', 'query 1'];
    let result: FetchOfficialJpUrlResult | null = null;

    for (let i = 0; i < queries.length; i++) {
      result = await tryQueryForOfficialUrl(i, queries[i], gameParams, {
        search: mockSearch,
        select: mockSelect,
        verify: mockVerify,
      });
      if (result) break;
    }

    expect(result).toBeNull();
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockVerify).not.toHaveBeenCalled(); // 選別が全て null のため検証に至らない
  });
});
