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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameData, IGDBGame } from './types.js';

vi.mock('./fetch-igdb.js', () => ({
  enrichGameWithIGDB: vi.fn().mockResolvedValue(null),
}));

vi.mock('./bedrock-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bedrock-client.js')>()),
  invokeClaudeModel: vi.fn(),
  // 実装と同じ契約（{ theme, selectedEventName }）を返す。selectedEventName は
  // 「候補の先頭を採用した」相当の値にして、記念日が記事データへ流れることを検証できるようにする
  selectFeatureThemeWithAI: vi
    .fn()
    .mockImplementation(async (events: Array<{ name: string }>) => ({
      theme: 'テスト特集テーマ',
      selectedEventName: events[0]?.name,
    })),
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
  fetchOfficialPageContents: vi.fn().mockResolvedValue({ steamContent: undefined, officialContent: undefined, failures: 0 }),
}));

import { __test, generateFeatureArticle, buildPrimarySources, buildJudgeGroundingGame, formatOutputSizeSummary } from './generate-articles.js';
import type { GeneratedArticle } from './generate-articles.js';
import { enrichGameWithIGDB } from './fetch-igdb.js';
import { invokeClaudeModel, selectFeatureGames, selectFeatureThemeWithAI } from './bedrock-client.js';
import { isTavilyAvailable, searchGameInfo, fetchOfficialPageContents } from './fetch-web-search.js';

const mockEnrich = vi.mocked(enrichGameWithIGDB);
const mockInvoke = vi.mocked(invokeClaudeModel);
const mockSelectFeatureGames = vi.mocked(selectFeatureGames);
const mockSelectFeatureThemeWithAI = vi.mocked(selectFeatureThemeWithAI);
const mockIsTavilyAvailable = vi.mocked(isTavilyAvailable);
const mockSearchGameInfo = vi.mocked(searchGameInfo);
const mockFetchOfficialPageContents = vi.mocked(fetchOfficialPageContents);

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

describe('screenOutAdultGames — adultScreeningFailures カウンタ (Issue #222)', () => {
  it('invokeClaudeModel が reject した場合、stats.adultScreeningFailures が加算され、かつゲームは除外されず通過する（fail-open のポジティブコントロール）', async () => {
    const game = makeGame({ title: 'Unjudgeable Game' });
    mockInvoke.mockRejectedValue(new Error('Bedrock timeout'));
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([game], stats);

    expect(stats.adultScreeningFailures).toBe(1);
    expect(result).toEqual([game]);
  });

  it('例外が発生しない正常系（判定NO）では adultScreeningFailures は加算されない（ネガティブコントロール）', async () => {
    const game = makeGame({ title: 'Normal Game' });
    mockInvoke.mockResolvedValue('NO');
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([game], stats);

    expect(stats.adultScreeningFailures).toBe(0);
    expect(result).toEqual([game]);
  });

  it('例外が発生しない正常系（判定YES＝除外）でも adultScreeningFailures は加算されない', async () => {
    const game = makeGame({ title: 'Adult Game' });
    mockInvoke.mockResolvedValue('YES');
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([game], stats);

    expect(stats.adultScreeningFailures).toBe(0);
    expect(result).toEqual([]);
  });

  it('複数件が失敗した場合、件数が正しく積算される', async () => {
    const gameA = makeGame({ title: 'Fail Game A' });
    const gameB = makeGame({ title: 'OK Game B' });
    const gameC = makeGame({ title: 'Fail Game C' });
    mockInvoke.mockImplementation(async (_system, userMessage: string) => {
      if (userMessage.includes('Fail Game')) throw new Error('Bedrock timeout');
      return 'NO';
    });
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([gameA, gameB, gameC], stats);

    expect(stats.adultScreeningFailures).toBe(2);
    // fail-open: 失敗した2件も判定不能のまま通過するため、3件とも残る
    expect(result).toEqual([gameA, gameB, gameC]);
  });

  it('stats を渡さない場合でも例外を投げない（stats はオプショナル引数）', async () => {
    const game = makeGame({ title: 'Unjudgeable Game' });
    mockInvoke.mockRejectedValue(new Error('Bedrock timeout'));

    await expect(__test.screenOutAdultGames([game])).resolves.toEqual([game]);
  });
});

describe('screenOutAdultGames — unrecognizedScreeningResponses カウンタ (Issue #222 code review 修正3)', () => {
  // isAdultContentByAI は maxTokens: 10 による切り詰めや句読点・記号付与等で、応答が
  // 'YES'/'NO' の厳密一致にならないことがある。この場合は例外を投げないため
  // adultScreeningFailures（catch節）では捕捉できず、もう一つの fail-open 経路になる。
  // ここでは応答形式不正を検知する unrecognizedScreeningResponses カウンタを検証する。

  it.each(['YES.', '', 'MAYBE', '**YES**', 'yes please'])(
    '応答が YES/NO いずれでもない場合（例: %j）、unrecognizedScreeningResponses が加算され、adultScreeningFailures は加算されない',
    async (response) => {
      const game = makeGame({ title: 'Ambiguous Response Game' });
      mockInvoke.mockResolvedValue(response);
      const stats = {
        searchFailures: 0,
        pageContentFailures: 0,
        adultScreeningFailures: 0,
        unrecognizedScreeningResponses: 0,
      };

      const result = await __test.screenOutAdultGames([game], stats);

      expect(stats.unrecognizedScreeningResponses).toBe(1);
      expect(stats.adultScreeningFailures).toBe(0);
      // 応答形式不正時も fail-open の挙動自体は変えない（安全側＝非成人向け扱いで通過）
      expect(result).toEqual([game]);
    }
  );

  it('応答が "NO"（正常系）の場合、unrecognizedScreeningResponses・adultScreeningFailures ともに加算されない（ネガティブコントロール）', async () => {
    const game = makeGame({ title: 'Normal Game' });
    mockInvoke.mockResolvedValue('NO');
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([game], stats);

    expect(stats.unrecognizedScreeningResponses).toBe(0);
    expect(stats.adultScreeningFailures).toBe(0);
    expect(result).toEqual([game]);
  });

  it('応答が "YES"（正常系・除外）の場合も、unrecognizedScreeningResponses・adultScreeningFailures ともに加算されない', async () => {
    const game = makeGame({ title: 'Adult Game' });
    mockInvoke.mockResolvedValue('YES');
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    const result = await __test.screenOutAdultGames([game], stats);

    expect(stats.unrecognizedScreeningResponses).toBe(0);
    expect(stats.adultScreeningFailures).toBe(0);
    expect(result).toEqual([]);
  });

  it('Bedrock 呼び出しが例外を投げた場合（応答形式の問題ではない）は adultScreeningFailures のみ加算され、unrecognizedScreeningResponses は加算されない（2つのカウンタの排他性の確認）', async () => {
    const game = makeGame({ title: 'Unjudgeable Game' });
    mockInvoke.mockRejectedValue(new Error('Bedrock timeout'));
    const stats = {
      searchFailures: 0,
      pageContentFailures: 0,
      adultScreeningFailures: 0,
      unrecognizedScreeningResponses: 0,
    };

    await __test.screenOutAdultGames([game], stats);

    expect(stats.adultScreeningFailures).toBe(1);
    expect(stats.unrecognizedScreeningResponses).toBe(0);
  });

  it('stats を渡さない場合でも例外を投げない（応答形式不正のケース）', async () => {
    const game = makeGame({ title: 'Ambiguous Response Game' });
    mockInvoke.mockResolvedValue('MAYBE');

    await expect(__test.screenOutAdultGames([game])).resolves.toEqual([game]);
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

describe('generateFeatureArticle — 候補が0件になった場合は記事生成を中断する (Issue #221)', () => {
  it('テーマに合う候補が最終的に0件になった場合、空リストのまま本文生成に進まず例外を投げる', async () => {
    // vi.clearAllMocks()（beforeEach）は呼び出し履歴のみをクリアし、他テストが
    // mockResolvedValue で設定した実装は引き継がれてしまう（vi.resetAllMocks ではないため）。
    // 直前のIssue #208テストが selectFeatureGames に3件のタイトルを解決させたままだと、
    // このテストは「qualified/fringeの候補が空でタイトル一致しない」という別経路で
    // 偶然0件になり、本来検証したい「selectFeatureGames自体が0件を返すケース」を
    // 検証しないまま緑になる。明示的に空配列へリセットして意図を保証する。
    mockSelectFeatureGames.mockResolvedValue([]);

    // relatedGames を空にすると、proposeThemeGamesFromKnowledge（デフォルトモック:
    // { proposals: [] }）と合わせて allCandidates が空になり、qualified/fringe も
    // 0件のまま最終選定（selectFeatureGames、上記で空配列に設定）まで進む。
    // fringe 補充ブロックも fringe.length === 0 のため発火せず、
    // screenOutAdultGames([]) も空配列を返すため、0件ガードに到達する。
    await expect(
      generateFeatureArticle(new Date('2026-08-08'), 999, [], [])
    ).rejects.toThrow(/no candidate games remain for theme/);

    // 0件ガードが本文生成（Bedrock 呼び出し）より前で止めていることの証拠として、
    // invokeClaudeModel が一度も呼ばれていないことを確認する
    // （呼ばれていれば、空の「紹介するゲーム」ブロックで LLM がハルシネーションする経路に
    // 入ってしまっていたことになる）。
    expect(mockInvoke).not.toHaveBeenCalled();
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
    expect(mockSearchGameInfo).toHaveBeenCalledWith('Chrono Trigger', 'classic', 'Square', { releaseYear: 1995 });
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

// Issue #361 / docs/llm-judge-redesign.md §6.3:
// 非 feature 経路の judgeGrounding 配線テスト
// （newRelease / indie は export されていないため classic のみで固定。
// 3経路とも同一のヘルパー呼び出しで実装されている）
describe('generateClassicArticle - judgeGrounding 配線（Issue #361 §6.3）', () => {
  // vi.clearAllMocks()（file 直下の beforeEach）は呼び出し履歴だけを消し、
  // mockReturnValue / mockResolvedValue で設定した実装は残る。
  // アサーション失敗時にも後続テストへ漏れないよう、ここで既定値に戻す
  afterEach(() => {
    mockIsTavilyAvailable.mockReturnValue(false);
    mockFetchOfficialPageContents.mockResolvedValue({
      steamContent: undefined,
      officialContent: undefined,
      failures: 0,
    });
  });

  it('article.judgeGrounding.games が1件で、IGDB メタデータが入っている', async () => {
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');
    const game = makeGame({
      title: 'Test Classic',
      titleJa: 'テストクラシック',
      genres: ['Action', 'RPG'],
      platforms: ['PC', 'PS5'],
      releaseDate: '2020-01-01',
      developer: 'Test Studio',
      publisher: 'Test Publisher',
      summary: 'IGDB summary for Test Classic',
    });

    const article = await __test.generateClassicArticle(game, new Date('2026-08-08'));

    expect(article.judgeGrounding).toBeDefined();
    expect(article.judgeGrounding?.games).toHaveLength(1);
    expect(article.judgeGrounding?.games[0]).toMatchObject({
      title: 'Test Classic',
      titleJa: 'テストクラシック',
      genres: ['Action', 'RPG'],
      platforms: ['PC', 'PS5'],
      releaseDate: '2020-01-01',
      developer: 'Test Studio',
      publisher: 'Test Publisher',
      summary: 'IGDB summary for Test Classic',
    });
  });

  it('isTavilyAvailable が false でもメタデータは入り、primarySources だけが undefined になる（メタデータは Tavily の可否に依存しない）', async () => {
    mockIsTavilyAvailable.mockReturnValue(false); // extract が走らない
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');
    const game = makeGame({
      title: 'Test Classic',
      genres: ['Action'],
      platforms: ['PC'],
      developer: 'Test Studio',
      summary: 'IGDB summary',
    });

    const article = await __test.generateClassicArticle(game, new Date('2026-08-08'));

    expect(article.judgeGrounding).toBeDefined();
    expect(article.judgeGrounding?.games[0]).toMatchObject({
      title: 'Test Classic',
      genres: ['Action'],
      platforms: ['PC'],
      developer: 'Test Studio',
      summary: 'IGDB summary',
    });
    // primarySources は undefined（一次ソースが取得できなかった）
    expect(article.judgeGrounding?.games[0].primarySources).toBeUndefined();
  });

  it('extract が成功したときに primarySources が入る', async () => {
    mockIsTavilyAvailable.mockReturnValue(true); // extract が走る
    mockFetchOfficialPageContents.mockResolvedValue({
      steamContent: 'Steam page content',
      officialContent: 'Official page content',
      failures: 0,
    });
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');
    const game = makeGame({
      title: 'Test Classic',
      sourceUrls: {
        steam: 'https://store.steampowered.com/app/123',
        official: 'https://example.com/official',
        officialUrlSource: 'tavily',
      },
    });

    const article = await __test.generateClassicArticle(game, new Date('2026-08-08'));

    expect(article.judgeGrounding?.games[0].primarySources).toBeDefined();
    expect(article.judgeGrounding?.games[0].primarySources).toEqual([
      { kind: 'steam', url: 'https://store.steampowered.com/app/123', content: 'Steam page content' },
      { kind: 'official', url: 'https://example.com/official', content: 'Official page content' },
    ]);
  });

  it('judgeGrounding.games[0].summary が GeneratedArticle.summary（AI 生成のリード文）ではなく IGDB 由来の GameData.summary であること', async () => {
    // generateClassicArticle は invokeClaudeModel を3回呼ぶ: 本文生成、タイトル生成、要約生成
    mockInvoke
      .mockResolvedValueOnce('AI generated article content') // 本文生成
      .mockResolvedValueOnce('AI generated title') // タイトル生成
      .mockResolvedValueOnce('AI generated summary for the article.'); // 要約生成

    const game = makeGame({
      title: 'Test Classic',
      summary: 'IGDB original summary',
    });

    const article = await __test.generateClassicArticle(game, new Date('2026-08-08'));

    // GeneratedArticle.summary は AI 生成のリード文
    // （generateSummary が末尾に「。」を追加するので「.。」で終わる）
    expect(article.summary).toContain('AI generated summary for the article.');
    // judgeGrounding.games[0].summary は IGDB 由来（GameData.summary）
    expect(article.judgeGrounding?.games[0].summary).toBe('IGDB original summary');
    // 2つは異なる（取り違えていない）
    expect(article.judgeGrounding?.games[0].summary).not.toBe(article.summary);
  });
});

describe('generateFeatureArticle — ファンゲーム除外フィルタ (Issue #232)', () => {
  beforeEach(() => {
    // selectFeatureGames はモックでタイトル一致のみで選定するため、
    // 候補に渡されなかったゲームは選定結果にも含まれない（期待挙動）。
    mockSelectFeatureGames.mockImplementation(
      async (_theme: string, candidates: Array<{ title: string }>) => {
        return candidates.map((c) => c.title);
      }
    );
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');
  });

  it('keywords にファンゲーム判定文字列を持つゲームは特集候補から除外される', async () => {
    const normalGame = makeGame({
      title: 'Normal RPG',
      igdbRatingCount: 50, // qualified 条件を満たす
      keywords: ['rpg', 'adventure'],
    });
    const fanGame = makeGame({
      title: 'Fan Project',
      igdbRatingCount: 50, // qualified 条件を満たすが、ファンゲーム判定で除外される
      keywords: ['fangame', 'rpg'],
    });

    const { context } = await generateFeatureArticle(
      new Date('2026-08-08'),
      999,
      [normalGame, fanGame],
      []
    );

    // fanGame は除外され、normalGame のみが選定結果に含まれる
    expect(context.featureGames.map((g) => g.title)).toEqual(['Normal RPG']);
  });

  it('ポジティブコントロール: ファンゲームでない通常のゲームは候補に残る', async () => {
    const gameA = makeGame({
      title: 'Game A',
      igdbRatingCount: 50,
      keywords: ['action'],
    });
    const gameB = makeGame({
      title: 'Game B',
      igdbRatingCount: 50,
      keywords: ['adventure'],
    });

    const { context } = await generateFeatureArticle(
      new Date('2026-08-08'),
      999,
      [gameA, gameB],
      []
    );

    // 両方とも通常のゲームなので両方選定される
    expect(context.featureGames.map((g) => g.title)).toEqual(['Game A', 'Game B']);
  });

  it('リメイク・リマスターは除外されない（回帰テスト）', async () => {
    const remake = makeGame({
      title: 'Final Fantasy VII Remake',
      igdbRatingCount: 100,
      gameType: 8, // リメイク
    });
    const remaster = makeGame({
      title: 'The Last of Us Remastered',
      igdbRatingCount: 100,
      gameType: 9, // リマスター
    });
    const normal = makeGame({
      title: 'Normal Game',
      igdbRatingCount: 50,
    });

    const { context } = await generateFeatureArticle(
      new Date('2026-08-08'),
      999,
      [remake, remaster, normal],
      []
    );

    // リメイク・リマスターは除外されず、すべて候補に残る
    expect(context.featureGames.map((g) => g.title)).toEqual([
      'Final Fantasy VII Remake',
      'The Last of Us Remastered',
      'Normal Game',
    ]);
  });

  it('タイトル由来のファンゲーム判定も効く', async () => {
    const unofficialGame = makeGame({
      title: 'Unofficial Pokemon Game',
      igdbRatingCount: 50,
    });
    const normalGame = makeGame({
      title: 'Official Pokemon Game',
      igdbRatingCount: 50,
    });

    const { context } = await generateFeatureArticle(
      new Date('2026-08-08'),
      999,
      [unofficialGame, normalGame],
      []
    );

    // タイトルに "unofficial" を含むゲームは除外され、Official のみ残る
    expect(context.featureGames.map((g) => g.title)).toEqual(['Official Pokemon Game']);
  });

  it('除外されたファンゲームのタイトルがログに出力される', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const fanGame1 = makeGame({
      title: 'Fan Game A',
      igdbRatingCount: 50,
      keywords: ['fangame'],
    });
    const fanGame2 = makeGame({
      title: 'Unofficial Fan Game B',
      igdbRatingCount: 50,
    });
    const normalGame = makeGame({
      title: 'Normal Game',
      igdbRatingCount: 50,
    });

    try {
      await generateFeatureArticle(
        new Date('2026-08-08'),
        999,
        [fanGame1, fanGame2, normalGame],
        []
      );

      // 除外件数のログが出力されていることを確認
      const excludedCountLog = logSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('Excluded 2 fan game(s) from feature candidates')
      );
      expect(excludedCountLog).toBe(true);

      // 除外されたタイトルのログが出力されていることを確認
      const fanGame1Log = logSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('Fan Game A')
      );
      expect(fanGame1Log).toBe(true);

      const fanGame2Log = logSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('Unofficial Fan Game B')
      );
      expect(fanGame2Log).toBe(true);
    } finally {
      // アサーション失敗時に console.log のスタブが後続テストへ漏れないよう finally で復元する
      logSpy.mockRestore();
    }
  });
});

/**
 * 特集テーマのイベント探索と 0 件週フォールバック（Issue #310 / PR-F）
 *
 * `selectFeatureEventCandidates` 自体の単体テストは fetch-japanese-events.test.ts にある。
 * ここでは generateFeatureArticle が
 * (1) 探索結果をテーマ選定に渡し、(2) 採用した記念日を記事データ（featureEvent）に残し、
 * (3) 除外リストを探索に伝える、という結線を実データで検証する。
 */
describe('generateFeatureArticle — イベント探索と 0 件週フォールバックの結線（Issue #310）', () => {
  /** テーマ選定以降を最小構成で通すためのモック設定 */
  function setupMinimalFeatureRun(): void {
    mockSelectFeatureGames.mockResolvedValue(['Game A', 'Game B', 'Game C']);
    mockInvoke.mockImplementation(async (systemPrompt: string) => {
      if (systemPrompt.includes('コンテンツモデレーター')) return 'NO';
      return 'テスト用ダミー応答。';
    });
    mockIsTavilyAvailable.mockReturnValue(false);
  }

  const candidates = [
    makeGame({ title: 'Game A', normalizedTitle: 'game a', steamRank: 1 }),
    makeGame({ title: 'Game B', normalizedTitle: 'game b', steamRank: 2 }),
    makeGame({ title: 'Game C', normalizedTitle: 'game c', steamRank: 3 }),
  ];

  it('通常週（未来方向にイベントがある）は source=forward で記事データに記録される', async () => {
    setupMinimalFeatureRun();

    const { article } = await generateFeatureArticle(new Date('2026-08-08'), 999, candidates, []);

    expect(article.featureEvent).toEqual({
      eventName: '世界猫の日', // 2026-08-08 の窓の先頭
      source: 'forward',
      dayOffset: 0,
    });
    // 未来方向の窓の全件がテーマ選定に渡る（従来の挙動）
    expect(mockSelectFeatureThemeWithAI).toHaveBeenCalledWith(
      expect.arrayContaining([{ name: '山の日', gameThemeHint: expect.any(String) }])
    );
  });

  it('イベント 0 件週（2026-08-22）は過去方向の記念日を採用し、固定文言に落ちない', async () => {
    setupMinimalFeatureRun();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article, context } = await generateFeatureArticle(
        new Date('2026-08-22'),
        999,
        candidates,
        []
      );

      expect(article.featureEvent).toEqual({
        eventName: '俳句の日', // 3 日前
        source: 'backward',
        dayOffset: -3,
      });
      // 固定文言ではなく記念日由来のテーマが使われている
      expect(context.theme).not.toBe('今週の注目ゲーム特集');
      // 過去方向の記念日の gameThemeHint がテーマ選定に渡る
      expect(mockSelectFeatureThemeWithAI).toHaveBeenCalledWith([
        { name: '俳句の日', gameThemeHint: '和文化ゲーム' },
      ]);
      // フォールバックの発火が出力に残る（§9.2-9）
      expect(
        warnSpy.mock.calls.some(
          (c) => typeof c[0] === 'string' && c[0].includes('[feature-event-fallback]')
        )
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('直近号が使った記念日は除外され、その次に近い記念日が採用される', async () => {
    setupMinimalFeatureRun();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article } = await generateFeatureArticle(
        new Date('2026-08-22'),
        999,
        candidates,
        [],
        undefined,
        ['俳句の日']
      );

      expect(article.featureEvent).toEqual({
        eventName: 'パイナップルの日', // 5 日前（-3 日の俳句の日は前号が使ったので除外）
        source: 'backward',
        dayOffset: -5,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('再生成した記事にも同じ featureEvent が引き継がれる（履歴の記録が消えない）', async () => {
    setupMinimalFeatureRun();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article, context } = await generateFeatureArticle(
        new Date('2026-08-22'),
        999,
        candidates,
        []
      );
      const regenerated = await __test.buildFeatureArticleFromContext(context, '修正指示');

      expect(regenerated.featureEvent).toEqual(article.featureEvent);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('再生成した特集記事にも judgeGrounding が引き継がれる（Issue #361 §4.4）', async () => {
    setupMinimalFeatureRun();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article, context } = await generateFeatureArticle(
        new Date('2026-08-22'),
        999,
        candidates,
        []
      );
      const regenerated = await __test.buildFeatureArticleFromContext(context, '修正指示');

      expect(regenerated.judgeGrounding).toEqual(article.judgeGrounding);
      expect(regenerated.judgeGrounding).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // Issue #361 / docs/llm-judge-redesign.md §5.2:
  // feature 経路で fetchOfficialPageContents が呼ばれる
  it('選定されたゲーム本数だけ fetchOfficialPageContents が呼ばれ、一次ソースが judgeGrounding と執筆プロンプトに渡る', async () => {
    // isTavilyAvailable を true にして extract が走るようにする
    mockIsTavilyAvailable.mockReturnValue(true);
    mockSearchGameInfo.mockResolvedValue({
      gameTitle: 'dummy',
      searchedAt: '2026-08-22T00:00:00.000Z',
    });
    mockSelectFeatureGames.mockResolvedValue(['Game A', 'Game B']);
    mockFetchOfficialPageContents.mockResolvedValue({
      steamContent: 'Steam content for game',
      officialContent: 'Official content for game',
      failures: 0,
    });
    mockInvoke.mockResolvedValue('テスト用ダミー応答。');

    const candidatesWithUrls = [
      makeGame({
        title: 'Game A',
        genres: ['Action'],
        platforms: ['PC'],
        developer: 'Studio A',
        summary: 'Summary A',
        sourceUrls: {
          steam: 'https://store.steampowered.com/app/100',
          official: 'https://example.com/game-a',
          officialUrlSource: 'tavily',
        },
      }),
      makeGame({
        title: 'Game B',
        genres: ['RPG'],
        platforms: ['PS5'],
        developer: 'Studio B',
        summary: 'Summary B',
        sourceUrls: {
          steam: 'https://store.steampowered.com/app/200',
          official: 'https://example.com/game-b',
          officialUrlSource: 'igdb-official',
        },
      }),
    ];

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { article } = await generateFeatureArticle(
        new Date('2026-08-22'),
        999,
        candidatesWithUrls,
        []
      );

      // 2ゲーム分の fetchOfficialPageContents が呼ばれている
      expect(mockFetchOfficialPageContents).toHaveBeenCalledTimes(2);

      // 引数が game.sourceUrls 由来であること
      expect(mockFetchOfficialPageContents).toHaveBeenNthCalledWith(1, {
        steamUrl: 'https://store.steampowered.com/app/100',
        officialUrl: 'https://example.com/game-a',
        officialUrlSource: 'tavily',
      });
      expect(mockFetchOfficialPageContents).toHaveBeenNthCalledWith(2, {
        steamUrl: 'https://store.steampowered.com/app/200',
        officialUrl: 'https://example.com/game-b',
        officialUrlSource: 'igdb-official',
      });

      // judgeGrounding.games が2件で、それぞれに primarySources が入っている
      expect(article.judgeGrounding?.games).toHaveLength(2);
      expect(article.judgeGrounding?.games[0].primarySources).toHaveLength(2);
      expect(article.judgeGrounding?.games[0].primarySources).toEqual([
        { kind: 'steam', url: 'https://store.steampowered.com/app/100', content: 'Steam content for game' },
        { kind: 'official', url: 'https://example.com/game-a', content: 'Official content for game' },
      ]);
      expect(article.judgeGrounding?.games[1].primarySources).toHaveLength(2);
      expect(article.judgeGrounding?.games[1].primarySources).toEqual([
        { kind: 'steam', url: 'https://store.steampowered.com/app/200', content: 'Steam content for game' },
        { kind: 'official', url: 'https://example.com/game-b', content: 'Official content for game' },
      ]);

      // 複数ゲームで一次ソースがゲーム単位に正しく紐づくこと
      // （ゲームAの本文がゲームBに入らないこと。URL で判別）
      expect(article.judgeGrounding?.games[0].primarySources?.[0].url).toBe('https://store.steampowered.com/app/100');
      expect(article.judgeGrounding?.games[1].primarySources?.[0].url).toBe('https://store.steampowered.com/app/200');

      // 執筆プロンプトに【公式ページ情報】が含まれること
      // （invokeClaudeModel に渡ったユーザーメッセージで検証）
      // すべての invokeClaudeModel 呼び出しから【公式ページ情報】を含むものを探す
      const contentGenerationCall = mockInvoke.mock.calls.find(call => {
        const userMessage = call[1];
        return typeof userMessage === 'string' && userMessage.includes('【紹介するゲーム】');
      });
      expect(contentGenerationCall).toBeDefined();
      const userMessage = contentGenerationCall![1];
      expect(userMessage).toContain('【公式ページ情報】');
      expect(userMessage).toContain('[Steamストアページ]');
      expect(userMessage).toContain('Steam content for game');
      expect(userMessage).toContain('[公式サイト]');
      expect(userMessage).toContain('Official content for game');
    } finally {
      warnSpy.mockRestore();
      mockIsTavilyAvailable.mockReturnValue(false); // 元に戻す
    }
  });
});

// Issue #361 / docs/llm-judge-redesign.md §6.3: 共通ヘルパーのテスト
describe('buildPrimarySources', () => {
  it('両方の本文が取得できた場合に2件の一次ソースを返す', () => {
    const pageContents = {
      steamContent: 'Steam page content',
      officialContent: 'Official page content',
    };
    const sources = buildPrimarySources(
      pageContents,
      'https://store.steampowered.com/app/123',
      'https://example.com/official'
    );

    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({
      kind: 'steam',
      url: 'https://store.steampowered.com/app/123',
      content: 'Steam page content',
    });
    expect(sources[1]).toEqual({
      kind: 'official',
      url: 'https://example.com/official',
      content: 'Official page content',
    });
  });

  it('Steam 本文のみ取得できた場合に1件（steam）を返す', () => {
    const pageContents = {
      steamContent: 'Steam page content',
      officialContent: undefined,
    };
    const sources = buildPrimarySources(
      pageContents,
      'https://store.steampowered.com/app/123',
      undefined
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      kind: 'steam',
      url: 'https://store.steampowered.com/app/123',
      content: 'Steam page content',
    });
  });

  it('公式本文のみ取得できた場合に1件（official）を返す', () => {
    const pageContents = {
      steamContent: undefined,
      officialContent: 'Official page content',
    };
    const sources = buildPrimarySources(
      pageContents,
      undefined,
      'https://example.com/official'
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      kind: 'official',
      url: 'https://example.com/official',
      content: 'Official page content',
    });
  });

  it('両方とも取得できなかった場合に空配列を返す（空エントリを作らない）', () => {
    const pageContents = {
      steamContent: undefined,
      officialContent: undefined,
    };
    const sources = buildPrimarySources(pageContents, undefined, undefined);

    expect(sources).toEqual([]);
  });

  it('URL があっても content が空なら含めない', () => {
    const pageContents = {
      steamContent: undefined,
      officialContent: undefined,
    };
    const sources = buildPrimarySources(
      pageContents,
      'https://store.steampowered.com/app/123',
      'https://example.com/official'
    );

    expect(sources).toEqual([]);
  });
});

describe('buildJudgeGroundingGame', () => {
  it('IGDB メタデータと一次ソースを持つ JudgeGroundingGame を返す', () => {
    const game = {
      title: 'Test Game',
      titleJa: 'テストゲーム',
      genres: ['Action', 'Adventure'],
      platforms: ['PC', 'PS5'],
      releaseDate: '2026-01-01',
      developer: 'Test Studio',
      publisher: 'Test Publisher',
      summary: 'A test game summary',
    };
    const primarySources = [
      { kind: 'steam' as const, url: 'https://steam.com/app/123', content: 'Steam content' },
    ];

    const result = buildJudgeGroundingGame(game, primarySources);

    expect(result).toEqual({
      title: 'Test Game',
      titleJa: 'テストゲーム',
      genres: ['Action', 'Adventure'],
      platforms: ['PC', 'PS5'],
      releaseDate: '2026-01-01',
      developer: 'Test Studio',
      publisher: 'Test Publisher',
      summary: 'A test game summary',
      primarySources,
    });
  });

  it('一次ソースが空の場合に primarySources を undefined にする', () => {
    const game = {
      title: 'Test Game',
      genres: ['Action'],
      platforms: ['PC'],
    };

    const result = buildJudgeGroundingGame(game, []);

    expect(result.primarySources).toBeUndefined();
  });

  it('参照URL を渡す（一次ソースの抽出に失敗しても同名別作品の識別は残る）', () => {
    const game = {
      title: 'Test Game',
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/test-game',
        official: 'https://test-game.example',
        stores: [{ platform: 'steam', url: 'https://store.steampowered.com/app/777' }],
      },
    };

    // 一次ソース0件（ページ抽出失敗）でも URL は載る
    const result = buildJudgeGroundingGame(game, []);

    expect(result.sourceUrls).toEqual({
      igdb: 'https://www.igdb.com/games/test-game',
      steam: 'https://store.steampowered.com/app/777',
      official: 'https://test-game.example',
    });
  });

  it('Steam URL は stores[] を優先し、無ければ steam 直下（@deprecated）を使う', () => {
    const withStores = buildJudgeGroundingGame(
      {
        title: 'T',
        sourceUrls: {
          steam: 'https://store.steampowered.com/app/OLD',
          stores: [{ platform: 'steam', url: 'https://store.steampowered.com/app/NEW' }],
        },
      },
      []
    );
    expect(withStores.sourceUrls?.steam).toBe('https://store.steampowered.com/app/NEW');

    const legacyOnly = buildJudgeGroundingGame(
      { title: 'T', sourceUrls: { steam: 'https://store.steampowered.com/app/OLD' } },
      []
    );
    expect(legacyOnly.sourceUrls?.steam).toBe('https://store.steampowered.com/app/OLD');
  });

  it('URL が1つも無ければ sourceUrls を undefined にする', () => {
    expect(buildJudgeGroundingGame({ title: 'T' }, []).sourceUrls).toBeUndefined();
    expect(
      buildJudgeGroundingGame({ title: 'T', sourceUrls: { stores: [] } }, []).sourceUrls
    ).toBeUndefined();
  });

  it('isEarlyAccess を judge 側に伝える（執筆プロンプトが明記を要求するため）', () => {
    expect(buildJudgeGroundingGame({ title: 'T', isEarlyAccess: true }, []).isEarlyAccess).toBe(
      true
    );
    expect(buildJudgeGroundingGame({ title: 'T' }, []).isEarlyAccess).toBeUndefined();
  });
});

describe('formatOutputSizeSummary — CI ログ用サイズ内訳出力 (Issue #380)', () => {
  it('マルチバイト文字を含む JSON で Buffer.byteLength ベースの KB を出力する', () => {
    // 十分に長い日本語を含む JSON を作成（文字列の .length と Buffer.byteLength が明確に異なる）
    const longJapaneseText = 'これは日本語のテストです。'.repeat(50); // 十分に長い文字列
    const articles: GeneratedArticle[] = [
      {
        title: 'テストゲーム',
        category: 'newRelease',
        summary: longJapaneseText,
        content: longJapaneseText,
      },
    ];
    const json = JSON.stringify(articles);

    // 実際の KB を手計算
    const expectedKb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
    const result = formatOutputSizeSummary(json, articles);

    expect(result).toContain(`${expectedKb} KB`);
    expect(result).toContain('1 articles');
    expect(result).toContain('0 grounded games');

    // .length ベースだと異なる値になることを確認（マルチバイトの検証）
    const wrongKb = (json.length / 1024).toFixed(1);
    expect(Buffer.byteLength(json, 'utf8')).toBeGreaterThan(json.length);
    expect(expectedKb).not.toBe(wrongKb);
  });

  it('judgeGrounding を持たない記事が混ざっても落ちず、ゲーム本数に加算されない', () => {
    const articles: GeneratedArticle[] = [
      {
        title: 'Game 1',
        category: 'newRelease',
        summary: 'Summary 1',
        content: 'Content 1',
        judgeGrounding: { games: [{ title: 'Game 1' }] },
      },
      {
        title: 'Game 2',
        category: 'indie',
        summary: 'Summary 2',
        content: 'Content 2',
        // judgeGrounding なし
      },
      {
        title: 'Game 3',
        category: 'classic',
        summary: 'Summary 3',
        content: 'Content 3',
        judgeGrounding: { games: [{ title: 'Game 3' }] },
      },
    ];
    const json = JSON.stringify(articles);
    const result = formatOutputSizeSummary(json, articles);

    expect(result).toContain('3 articles');
    expect(result).toContain('2 grounded games'); // Game 2 は judgeGrounding がないのでカウントされない
  });

  it('games が複数ある記事で本数が合算される', () => {
    const articles: GeneratedArticle[] = [
      {
        title: 'Feature Article',
        category: 'feature',
        summary: 'Feature summary',
        content: 'Feature content',
        judgeGrounding: {
          games: [
            { title: 'Game A' },
            { title: 'Game B' },
            { title: 'Game C' },
          ],
        },
      },
      {
        title: 'Single Game',
        category: 'newRelease',
        summary: 'Single summary',
        content: 'Single content',
        judgeGrounding: { games: [{ title: 'Game D' }] },
      },
    ];
    const json = JSON.stringify(articles);
    const result = formatOutputSizeSummary(json, articles);

    expect(result).toContain('2 articles');
    expect(result).toContain('4 grounded games'); // 3 + 1 = 4
  });

  it('記事0件（空配列）の境界でも正しく動作する', () => {
    const articles: GeneratedArticle[] = [];
    const json = JSON.stringify(articles);
    const result = formatOutputSizeSummary(json, articles);

    const expectedKb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
    expect(result).toBe(`${expectedKb} KB, 0 articles, 0 grounded games`);
  });

  it('games が空配列の judgeGrounding でも落ちずカウントは0になる', () => {
    const articles: GeneratedArticle[] = [
      {
        title: 'Empty Games',
        category: 'feature',
        summary: 'Summary',
        content: 'Content',
        judgeGrounding: { games: [] },
      },
    ];
    const json = JSON.stringify(articles);
    const result = formatOutputSizeSummary(json, articles);

    expect(result).toContain('1 articles');
    expect(result).toContain('0 grounded games');
  });
});
