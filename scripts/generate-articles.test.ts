/**
 * generate-articles.ts の verifyProposedGames / screenOutAdultGames ユニットテスト（Issue #208）
 *
 * verifyProposedGames は特集記事の実在検証経路であり、enrichGameWithIGDB に
 * mainGameOnly: true を渡す唯一の呼び出し元である（他4箇所は既定 false のまま）。
 * この呼び出し契約が保たれていることをピン留めする。
 *
 * screenOutAdultGames は isAdultContentByAI を使った成人向けコンテンツの一括除外
 * ヘルパーで、特集記事にも他3カテゴリ（新作・インディー・名作深掘り）と同じ
 * AI スクリーニングを適用するために追加した（PR-0.1）。
 *
 * Bedrock（@aws-sdk/client-bedrock-runtime）は verifyProposedGames の実行パスには
 * 含まれないため呼ばれないが、generate-articles.ts のモジュール読み込み時に
 * bedrock-client.js が import されるため、ネットワークを叩かないよう fetch-igdb.js と
 * bedrock-client.js の invokeClaudeModel のみ vi.mock で差し込む（他の依存は実行に
 * 影響しない）。bedrock-client.js は importOriginal で他のエクスポートを温存する
 * （多数のエクスポートを持つため、bare factory だと未定義エクスポートエラーになる）。
 *
 * 末尾の describe（generateFeatureArticle の FEATURE_MIN_GAMES 境界テスト）だけは
 * generateFeatureArticle をエンドツーエンドで駆動するため、追加で
 * selectFeatureThemeWithAI / proposeThemeGamesFromKnowledge /
 * prefilterFeatureCandidatesByTheme / selectFeatureGames（bedrock-client.js）、
 * fetchOfficialJpUrl（fetch-official-jp-url.js）、generateFeatureImage
 * （generate-feature-image.js）、isTavilyAvailable（fetch-web-search.js）もモックする。
 * これらの関数は importOriginal 経由の実装をそのまま使うと、関数内部で自モジュール内の
 * 実 invokeClaudeModel を直接参照してしまい（モック differs from export binding）
 * 上の invokeClaudeModel モックを迂回して実 Bedrock/Tavily を呼びに行ってしまうため、
 * 個別に vi.fn() で上書きする。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData, IGDBGame } from './types.js';

vi.mock('./fetch-igdb.js', () => ({
  enrichGameWithIGDB: vi.fn().mockResolvedValue(null),
}));

vi.mock('./bedrock-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bedrock-client.js')>()),
  invokeClaudeModel: vi.fn(),
  selectFeatureThemeWithAI: vi.fn().mockResolvedValue('テスト特集テーマ'),
  proposeThemeGamesFromKnowledge: vi.fn().mockResolvedValue({ proposals: [] }),
  prefilterFeatureCandidatesByTheme: vi
    .fn()
    .mockImplementation(async (_theme: string, candidates: Array<{ title: string }>) =>
      candidates.map((c) => c.title)
    ),
  selectFeatureGames: vi.fn().mockResolvedValue([]),
}));

vi.mock('./fetch-official-jp-url.js', () => ({
  fetchOfficialJpUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('./generate-feature-image.js', () => ({
  generateFeatureImage: vi
    .fn()
    .mockRejectedValue(new Error('generateFeatureImage is mocked out in tests')),
}));

vi.mock('./fetch-web-search.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fetch-web-search.js')>()),
  isTavilyAvailable: vi.fn().mockReturnValue(false),
  searchGameInfo: vi.fn(),
}));

import { __test, generateFeatureArticle } from './generate-articles.js';
import { enrichGameWithIGDB } from './fetch-igdb.js';
import { invokeClaudeModel, selectFeatureGames } from './bedrock-client.js';
import { isTavilyAvailable, searchGameInfo } from './fetch-web-search.js';

const mockEnrich = vi.mocked(enrichGameWithIGDB);
const mockInvoke = vi.mocked(invokeClaudeModel);
const mockSelectFeatureGames = vi.mocked(selectFeatureGames);
const mockIsTavilyAvailable = vi.mocked(isTavilyAvailable);
const mockSearchGameInfo = vi.mocked(searchGameInfo);

// テスト用 GameData ファクトリ（必須フィールドのみ設定）
function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    title: 'Test Game',
    normalizedTitle: 'test game',
    genres: [],
    platforms: [],
    source: ['steam'],
    ...overrides,
  };
}

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

describe('screenOutAdultGames — 特集記事への AI スクリーニング適用 (Issue #208)', () => {
  it('invokeClaudeModel が YES を返したゲームは結果から除外される', async () => {
    const game = makeGame({ title: 'Adult Game' });
    mockInvoke.mockResolvedValue('YES');

    const result = await __test.screenOutAdultGames([game]);

    expect(result).toEqual([]);
  });

  it('invokeClaudeModel が NO を返したゲームは結果に残る', async () => {
    const game = makeGame({ title: 'Normal Game' });
    mockInvoke.mockResolvedValue('NO');

    const result = await __test.screenOutAdultGames([game]);

    expect(result).toEqual([game]);
  });

  it('invokeClaudeModel が reject した場合は安全側に倒してゲームを残す（fail-open）', async () => {
    const game = makeGame({ title: 'Unjudgeable Game' });
    mockInvoke.mockRejectedValue(new Error('Bedrock timeout'));

    const result = await __test.screenOutAdultGames([game]);

    expect(result).toEqual([game]);
  });

  it('YES/NO が混在する場合、YES のゲームのみ除外され、残ったゲームの順序は保たれる', async () => {
    const gameA = makeGame({ title: 'Game A' });
    const gameB = makeGame({ title: 'Adult Game B' });
    const gameC = makeGame({ title: 'Game C' });
    const gameD = makeGame({ title: 'Adult Game D' });

    mockInvoke.mockImplementation(async (_system, userMessage) => {
      if (userMessage.includes('Adult Game')) return 'YES';
      return 'NO';
    });

    const result = await __test.screenOutAdultGames([gameA, gameB, gameC, gameD]);

    expect(result).toEqual([gameA, gameC]);
  });

  it('空配列を渡すと空配列を返し、例外を投げない', async () => {
    const result = await __test.screenOutAdultGames([]);

    expect(result).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('全ゲームが成人向け判定された場合は空配列を返し、例外を投げない', async () => {
    const gameA = makeGame({ title: 'Adult Game A' });
    const gameB = makeGame({ title: 'Adult Game B' });
    mockInvoke.mockResolvedValue('YES');

    const result = await __test.screenOutAdultGames([gameA, gameB]);

    expect(result).toEqual([]);
  });

  it('前後の空白・小文字混じりの "YES" 応答（例: " yes\\n"）も YES として扱われる', async () => {
    const game = makeGame({ title: 'Borderline Game' });
    mockInvoke.mockResolvedValue(' yes\n');

    const result = await __test.screenOutAdultGames([game]);

    expect(result).toEqual([]);
  });
});

describe('generateFeatureArticle — スクリーニングが本数警告より前に効くこと (Issue #208)', () => {
  it('AI スクリーニングで選定ゲームが FEATURE_MIN_GAMES(3) を下回った場合、本数不足の警告が出て、除外されたゲームは特集記事に含まれない', async () => {
    const gameA = makeGame({ title: 'Game A', normalizedTitle: 'game a', steamRank: 1 });
    const gameB = makeGame({ title: 'Game B', normalizedTitle: 'game b', steamRank: 2 });
    const adultGame = makeGame({
      title: 'Screened Out Game',
      normalizedTitle: 'screened out game',
      steamRank: 3,
    });

    // selectFeatureGames は本来 LLM 選定結果だが、ここでは3本すべてを選定したことにして
    // スクリーニング前は FEATURE_MIN_GAMES を満たしている状態を作る。
    mockSelectFeatureGames.mockResolvedValue(['Game A', 'Game B', 'Screened Out Game']);

    // isAdultContentByAI（コンテンツモデレーター用プロンプト）呼び出しのみ "Screened Out Game"
    // に対して YES を返し、それ以外の invokeClaudeModel 呼び出し（本文・要約・タイトル生成等）
    // は無害なダミー文字列を返す。
    mockInvoke.mockImplementation(async (systemPrompt: string, userMessage: string) => {
      if (systemPrompt.includes('コンテンツモデレーター')) {
        return userMessage.includes('Screened Out Game') ? 'YES' : 'NO';
      }
      return 'テスト用ダミー応答。';
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article, context } = await generateFeatureArticle(
        new Date('2026-08-08'),
        999,
        [gameA, gameB, adultGame],
        []
      );

      // スクリーニングで "Screened Out Game" が除外され、残り2本（< FEATURE_MIN_GAMES=3）になる
      expect(context.featureGames.map((g) => g.title)).toEqual(['Game A', 'Game B']);
      expect(article.category).toBe('feature');

      // 本数不足の警告が出ていること = screenOutAdultGames が FEATURE_MIN_GAMES 判定より
      // 前に実行され、その結果（2本）が警告に反映されたことの証拠
      const warnedShortfall = warnSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('Feature article has only 2 game(s)')
      );
      expect(warnedShortfall).toBe(true);
    } finally {
      // アサーション失敗時に console.warn のスタブが後続テストへ漏れないよう finally で復元する
      warnSpy.mockRestore();
    }
  });
});

describe('generateClassicArticle — 歴史検索クエリへの発売年の伝播 (docs/article-category-spec.md §5.6 修正3)', () => {
  beforeEach(() => {
    // このブロックの各テストでのみ Web 検索を有効化する。1回目の isTavilyAvailable() 呼び出し
    // （§5.6 の歴史検索分岐）だけ true を返し、2回目以降（公式ページ取得分岐）はデフォルトの
    // false に戻るため、fetchOfficialPageContents は起動しない。
    mockIsTavilyAvailable.mockReturnValueOnce(true);
    mockSearchGameInfo.mockResolvedValue({
      gameTitle: 'dummy',
      searchedAt: '2026-08-09T00:00:00.000Z',
    });
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');
  });

  it('releaseDate が "YYYY-MM-DD" 形式のとき、年だけを取り出して searchGameInfo に渡す', async () => {
    const game = makeGame({
      title: 'Chrono Trigger',
      developer: 'Square',
      releaseDate: '1995-03-11',
    });

    await __test.generateClassicArticle(game, new Date('2026-08-08'));

    expect(mockSearchGameInfo).toHaveBeenCalledTimes(1);
    expect(mockSearchGameInfo).toHaveBeenCalledWith('Chrono Trigger', 'classic', 'Square', 1995);
  });

  it('境界値: releaseDate が undefined のとき、年を渡さない（第4引数が undefined）', async () => {
    const game = makeGame({
      title: 'Chrono Trigger',
      developer: 'Square',
      releaseDate: undefined,
    });

    await __test.generateClassicArticle(game, new Date('2026-08-08'));

    expect(mockSearchGameInfo).toHaveBeenCalledTimes(1);
    expect(mockSearchGameInfo).toHaveBeenCalledWith('Chrono Trigger', 'classic', 'Square', undefined);
  });
});
