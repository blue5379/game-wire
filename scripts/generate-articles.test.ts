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
