/**
 * judge-article の純関数のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildJudgeUserMessage,
  buildGameMetadataSection,
  parseJudgeResponse,
  mapClaimsToWarnings,
  judgeArticles,
  isLlmJudgeEnabled,
  isMetadataOnlyClaim,
  enumerateJudgeSources,
  judgeSystemPrompt,
  CONTRADICTED_CONFIDENCE_THRESHOLD,
  PRIMARY_SOURCE_MARKER_START,
  PRIMARY_SOURCE_MARKER_END,
  SECONDARY_SOURCE_MARKER_START,
  SECONDARY_SOURCE_MARKER_END,
  type JudgeClaim,
} from './judge-article.js';
import type { GeneratedArticle } from './generate-articles.js';
// 執筆プロンプトと judge で同じ行を使うことを確認するため定義元から取る
import { EARLY_ACCESS_LINE } from './bedrock-client.js';

// Bedrock / Tavily への依存をモック
const mockInvoke = vi.fn();
const mockIsTavilyAvailable = vi.fn();
vi.mock('./bedrock-client.js', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./bedrock-client.js');
  return {
    ...actual,
    invokeClaudeModel: (...args: unknown[]) => mockInvoke(...args),
  };
});
vi.mock('./fetch-web-search.js', () => ({
  isTavilyAvailable: () => mockIsTavilyAvailable(),
}));

function makeArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    title: 'デフォルトタイトル',
    category: 'newRelease',
    summary: '',
    content: '',
    ...overrides,
  };
}

describe('buildJudgeUserMessage', () => {
  it('本文と検索結果をマーカーで囲んで含める', () => {
    const article = makeArticle({
      title: 'Test Game の紹介',
      content: '本文テキスト',
      webSearchSources: [
        { url: 'https://example.com/a', title: 'Source A', snippet: 'snippet A' },
      ],
    });

    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('Test Game の紹介');
    expect(msg).toContain('本文テキスト');
    expect(msg).toContain(SECONDARY_SOURCE_MARKER_START);
    expect(msg).toContain('Source A');
    expect(msg).toContain('snippet A');
    expect(msg).toContain('https://example.com/a');
  });

  it('webSearchSources が無くても例外を投げない', () => {
    const article = makeArticle({ content: '本文', webSearchSources: undefined });
    expect(() => buildJudgeUserMessage(article)).not.toThrow();
  });
});

describe('buildGameMetadataSection', () => {
  it('developer・publisher・releaseDate・sourceUrls をすべて含める', () => {
    const article = makeArticle({
      game: {
        title: 'MOLE',
        titleJa: 'モール',
        genre: ['アクション'],
        platforms: ['PC'],
        developer: 'Off Black Creations',
        publisher: 'Off Black Creations',
        releaseDate: '2023-10-15',
      },
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/mole',
        steam: 'https://store.steampowered.com/app/12345',
      },
    });

    const section = buildGameMetadataSection(article);
    expect(section).toContain('MOLE');
    expect(section).toContain('モール');
    expect(section).toContain('Off Black Creations');
    expect(section).toContain('2023-10-15');
    expect(section).toContain('https://www.igdb.com/games/mole');
    expect(section).toContain('https://store.steampowered.com/app/12345');
  });

  it('titleJa が無ければ英語タイトルのみ（日本語タイトルのスラッシュ区切りが出ない）', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [] },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('タイトル: MOLE');
    // " / 日本語タイトル" の形式が含まれないことを確認（ヘッダーの "/" とは別）
    expect(section).not.toMatch(/タイトル: MOLE \//);
  });

  it('developer が無ければ開発元行を出力しない', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [] },
    });
    const section = buildGameMetadataSection(article);
    expect(section).not.toContain('開発元');
  });

  it('stores[] 形式の Steam URL を同定情報に含める（新形式・優先）', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [] },
      sourceUrls: {
        stores: [
          { platform: 'steam', url: 'https://store.steampowered.com/app/99999', resolvedBy: 'igdb-website', confidence: 'high' },
        ],
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('https://store.steampowered.com/app/99999');
  });

  it('sourceUrls.steam 直下（@deprecated）のみの記事でも Steam URL が含まれる（後方互換）', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [] },
      sourceUrls: {
        steam: 'https://store.steampowered.com/app/12345',
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('https://store.steampowered.com/app/12345');
  });

  it('stores[] に steam 以外のプラットフォームしかない場合は Steam URL を出力しない', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [] },
      sourceUrls: {
        stores: [
          { platform: 'nintendo', url: 'https://store.nintendo.com/foo', resolvedBy: 'cache', confidence: 'high' },
        ],
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).not.toContain('Steam:');
  });

  it('sourceUrls が無くても例外を投げない', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [], developer: 'Dev Inc.' },
      sourceUrls: undefined,
    });
    expect(() => buildGameMetadataSection(article)).not.toThrow();
    const section = buildGameMetadataSection(article);
    expect(section).not.toContain('参照URL');
  });

  it('article.game が undefined なら空文字列を返す', () => {
    const article = makeArticle({ game: undefined });
    expect(buildGameMetadataSection(article)).toBe('');
  });

  it('セクション見出しに「転記元・根拠として使用可」の旨が含まれる（定義A）', () => {
    const article = makeArticle({
      game: { title: 'MOLE', genre: [], platforms: [], developer: 'Dev Inc.' },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('転記元・根拠として使用可');
  });

  it('genres と platforms がメタデータセクションに含まれる（Issue #361）', () => {
    const article = makeArticle({
      game: {
        title: 'Test Game',
        genre: ['アクション', 'アドベンチャー'],
        platforms: ['PC', 'PlayStation 5'],
        developer: 'Test Dev',
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('ジャンル: アクション、アドベンチャー');
    expect(section).toContain('対応機種: PC、PlayStation 5');
  });

  it('judgeGrounding があればそれを使う（feature 記事対応）', () => {
    const article = makeArticle({
      game: undefined, // feature 記事は game を持たない
      judgeGrounding: {
        games: [
          {
            title: 'Game A',
            titleJa: 'ゲームA',
            genres: ['RPG'],
            platforms: ['PC'],
            developer: 'Dev A',
            summary: 'IGDB summary A',
          },
        ],
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('Game A');
    expect(section).toContain('ゲームA');
    expect(section).toContain('ジャンル: RPG');
    expect(section).toContain('対応機種: PC');
    expect(section).toContain('概要: IGDB summary A');
  });

  it('feature 記事で複数ゲームのメタデータをゲーム単位で組む', () => {
    const article = makeArticle({
      game: undefined,
      judgeGrounding: {
        games: [
          { title: 'Game A', genres: ['RPG'], platforms: ['PC'] },
          { title: 'Game B', genres: ['Action'], platforms: ['PlayStation 5'] },
        ],
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('Game A');
    expect(section).toContain('Game B');
    // 各ゲームのメタデータが独立したブロックとして現れる
    expect(section.split('【提供メタデータ（転記元・根拠として使用可）】')).toHaveLength(3); // 空文字列 + 2ゲーム
  });

  it('judgeGrounding 経路でも参照URLをゲーム単位で出す（同名別作品の識別が消えないこと）', () => {
    // 全カテゴリが judgeGrounding を持つようになったため article.game フォールバックは
    // 新規記事では通らない。URL をこちらに出さないと judgeSystemPrompt の判定ルール7
    // （URL 等で同名別作品を識別）が根拠を失う
    const article = makeArticle({
      game: undefined,
      judgeGrounding: {
        games: [
          {
            title: 'Game A',
            sourceUrls: {
              igdb: 'https://www.igdb.com/games/game-a',
              steam: 'https://store.steampowered.com/app/111',
              official: 'https://game-a.example',
            },
          },
          { title: 'Game B', sourceUrls: { igdb: 'https://www.igdb.com/games/game-b' } },
        ],
      },
    });
    const section = buildGameMetadataSection(article);
    expect(section).toContain('参照URL: IGDB: https://www.igdb.com/games/game-a / Steam: https://store.steampowered.com/app/111 / 公式: https://game-a.example');
    expect(section).toContain('参照URL: IGDB: https://www.igdb.com/games/game-b');
    // ゲーム B のブロックにゲーム A の URL が混ざらない
    const blockB = section.split('Game B')[1];
    expect(blockB).not.toContain('game-a');
  });

  it('sourceUrls が無いゲームには参照URL行を出さない', () => {
    const article = makeArticle({
      game: undefined,
      judgeGrounding: { games: [{ title: 'Game A' }] },
    });
    expect(buildGameMetadataSection(article)).not.toContain('参照URL');
  });

  it('早期アクセスを judge にも渡す（執筆プロンプトと同じ行。Issue #26 / #361）', () => {
    // 執筆プロンプトは「早期アクセス配信中であることを必ず明記」と指示するので、
    // judge に渡さないと指示どおり書いた記事が unverifiable になる
    const article = makeArticle({
      game: undefined,
      judgeGrounding: { games: [{ title: 'Game A', isEarlyAccess: true }] },
    });
    expect(buildGameMetadataSection(article)).toContain(EARLY_ACCESS_LINE);
  });

  it('早期アクセスでないゲームには早期アクセス行を出さない', () => {
    const article = makeArticle({
      game: undefined,
      judgeGrounding: { games: [{ title: 'Game A', isEarlyAccess: false }, { title: 'Game B' }] },
    });
    expect(buildGameMetadataSection(article)).not.toContain('早期アクセス');
  });
});

describe('buildJudgeUserMessage (with game metadata)', () => {
  it('game メタデータが記事メッセージに含まれる（一般名タイトルの同名別物対策）', () => {
    const article = makeArticle({
      title: 'MOLE 深掘り記事',
      content: '本文テキスト',
      game: {
        title: 'MOLE',
        genre: ['アクション'],
        platforms: ['PC'],
        developer: 'Off Black Creations',
        publisher: 'Off Black Creations',
      },
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/mole',
      },
      webSearchSources: [
        { url: 'https://example.com/review', title: 'MOLE Review', snippet: 'snippet' },
      ],
    });

    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('Off Black Creations');
    expect(msg).toContain('本文テキスト');
    expect(msg).toContain('MOLE Review');
  });

  it('game が undefined の記事でもメタデータなしで正常動作する', () => {
    const article = makeArticle({
      title: 'タイトル',
      content: '本文',
      game: undefined,
      webSearchSources: [{ url: 'https://e.com', title: 'T', snippet: 's' }],
    });
    expect(() => buildJudgeUserMessage(article)).not.toThrow();
    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('本文');
  });

  it('発行日が文字列として現れる（Issue #361）', () => {
    const article = makeArticle({ content: '本文', webSearchSources: [] });
    const publishDate = new Date('2026-09-05T12:00:00Z');
    const msg = buildJudgeUserMessage(article, publishDate);
    expect(msg).toContain('【発行日】');
    expect(msg).toContain('2026年9月5日');
  });

  it('new Date() に依存しない（同じ入力で同一出力）', () => {
    const article = makeArticle({ content: '本文', webSearchSources: [] });
    const publishDate = new Date('2026-09-05T12:00:00Z');
    const msg1 = buildJudgeUserMessage(article, publishDate);
    const msg2 = buildJudgeUserMessage(article, publishDate);
    expect(msg1).toBe(msg2);
  });

  it('一次ソースセクションが現れ、二次ソースと分離されている（Issue #361）', () => {
    const article = makeArticle({
      content: '本文',
      judgeGrounding: {
        games: [
          {
            title: 'Test Game',
            primarySources: [
              { kind: 'official', url: 'https://official.example', content: '公式本文' },
              { kind: 'steam', url: 'https://store.steampowered.com/app/123', content: 'Steam本文' },
            ],
          },
        ],
      },
      webSearchSources: [
        { url: 'https://secondary.example', title: 'Secondary Source', snippet: 'snippet' },
      ],
    });
    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain(PRIMARY_SOURCE_MARKER_START);
    expect(msg).toContain(PRIMARY_SOURCE_MARKER_END);
    expect(msg).toContain(SECONDARY_SOURCE_MARKER_START);
    expect(msg).toContain(SECONDARY_SOURCE_MARKER_END);
    expect(msg).toContain('公式本文');
    expect(msg).toContain('Steam本文');
    expect(msg).toContain('snippet');
    // 一次ソースマーカーの終了が二次ソースマーカーの開始より前にある
    const primaryEnd = msg.indexOf(PRIMARY_SOURCE_MARKER_END);
    const secondaryStart = msg.indexOf(SECONDARY_SOURCE_MARKER_START);
    expect(primaryEnd).toBeGreaterThan(0);
    expect(secondaryStart).toBeGreaterThan(primaryEnd);
  });

  it('feature で複数ゲームの一次ソースがゲーム単位にラベル付けされる（Issue #361）', () => {
    const article = makeArticle({
      content: '本文',
      judgeGrounding: {
        games: [
          {
            title: 'Game A',
            primarySources: [
              { kind: 'official', url: 'https://a.example', content: 'A 公式本文' },
            ],
          },
          {
            title: 'Game B',
            primarySources: [
              { kind: 'steam', url: 'https://b.example', content: 'B Steam本文' },
            ],
          },
        ],
      },
      webSearchSources: [],
    });
    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('【Game A の一次ソース】');
    expect(msg).toContain('【Game B の一次ソース】');
    expect(msg).toContain('A 公式本文');
    expect(msg).toContain('B Steam本文');
  });

  it('出典の [n] が一次ソースから通し番号で振られ、レポートの index と一致する（Issue #361）', () => {
    const article = makeArticle({
      content: '本文',
      judgeGrounding: {
        games: [
          {
            title: 'Game A',
            primarySources: [
              { kind: 'steam', url: 'https://a.steam.example', content: 'A Steam本文' },
              { kind: 'official', url: 'https://a.official.example', content: 'A 公式本文' },
            ],
          },
          {
            title: 'Game B',
            primarySources: [
              { kind: 'official', url: 'https://b.official.example', content: 'B 公式本文' },
            ],
          },
        ],
      },
      webSearchSources: [
        { url: 'https://s1.example', title: 'Secondary 1', snippet: 'snippet 1' },
        { url: 'https://s2.example', title: 'Secondary 2', snippet: 'snippet 2' },
      ],
    });

    const entries = enumerateJudgeSources(article);
    expect(entries.map((e) => `${e.index}:${e.kind}`)).toEqual([
      '1:primary',
      '2:primary',
      '3:primary',
      '4:secondary',
      '5:secondary',
    ]);

    // judge の explanation は出典を [n] で参照するので、プロンプトの採番が
    // レポート（judgedSources）の index とズレると事後に別の出典として読んでしまう
    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('[1] Steamストアページ: https://a.steam.example');
    expect(msg).toContain('[2] 公式サイト: https://a.official.example');
    expect(msg).toContain('[3] 公式サイト: https://b.official.example');
    expect(msg).toContain('[4] Secondary 1');
    expect(msg).toContain('[5] Secondary 2');
    // 二次ソースが [1] から振り直されていないこと
    expect(msg).not.toContain('[1] Secondary 1');
  });

  it('最後の指示文が「提供された情報」を根拠にするよう指示している（Issue #361）', () => {
    const article = makeArticle({ content: '本文', webSearchSources: [] });
    const msg = buildJudgeUserMessage(article);
    expect(msg).toContain('提供された情報（提供メタデータ・一次ソース・二次ソース）を根拠に判定');
    expect(msg).not.toMatch(/外部参照データのみを根拠に/);
  });
});

describe('judgeSystemPrompt', () => {
  it('一次ソース優先規則が含まれる（Issue #361）', () => {
    expect(judgeSystemPrompt).toContain('一次ソース');
    expect(judgeSystemPrompt).toContain('二次ソース');
    expect(judgeSystemPrompt).toContain('矛盾する場合は一次ソースを採る');
  });

  it('内部知識禁止ルールが含まれる', () => {
    expect(judgeSystemPrompt).toContain('内部知識を根拠にしてはならない');
  });

  it('同名別作品の識別機能が含まれる', () => {
    expect(judgeSystemPrompt).toContain('同名の別作品');
    expect(judgeSystemPrompt).toContain('識別');
  });

  it('構造化メタデータがスコープ外と明記されている（Issue #361）', () => {
    expect(judgeSystemPrompt).toContain('対応機種');
    expect(judgeSystemPrompt).toContain('発売日');
    expect(judgeSystemPrompt).toContain('ジャンル');
    expect(judgeSystemPrompt).toContain('判定対象としない主張');
  });

  it('セキュリティ注意書きが実際のマーカー文字列を参照している（プロンプトの自己記述がズレないこと）', () => {
    // マーカー名を手書きすると、定数を変えたときにプロンプトの説明だけが古くなる
    expect(judgeSystemPrompt).toContain(PRIMARY_SOURCE_MARKER_START);
    expect(judgeSystemPrompt).toContain(SECONDARY_SOURCE_MARKER_START);
    // 提供メタデータはマーカーで囲まれない（buildJudgeUserMessage は見出しのみ）ので、
    // マーカーとは別に注意書きを持つ
    expect(judgeSystemPrompt).toContain('【提供メタデータ】');
    const article = makeArticle({
      content: '本文',
      game: { title: 'T', platforms: ['PC'] } as NonNullable<GeneratedArticle['game']>,
      webSearchSources: [],
    });
    expect(buildJudgeUserMessage(article)).not.toContain(PRIMARY_SOURCE_MARKER_START);
  });

  it('「検索結果のみ」という限定表現が残っていない（定義A）', () => {
    // 「提供された情報」という表現に統一されているはず
    expect(judgeSystemPrompt).not.toMatch(/検索結果のみ/);
    expect(judgeSystemPrompt).not.toMatch(/検索結果のテキストのみ/);
  });

  it('メタデータを根拠に使わせない旧ルールが残っていない（Issue #361 §6.2）', () => {
    // 旧仕様: 「【判定対象ゲームの同定情報】…このセクションの情報を主張の裏付け根拠に
    // してはならない。裏付けは検索結果のみ」。この禁止が残っていると IGDB summary に
    // 書いてある内容まで unverifiable になる（redesign doc §3.2）
    expect(judgeSystemPrompt).not.toMatch(/裏付け根拠にしてはならない/);
    expect(judgeSystemPrompt).not.toMatch(/同定情報/);
    expect(judgeSystemPrompt).not.toMatch(/識別するためだけ/);
    // メタデータは根拠として使用可であることがユーザーメッセージ側の見出しで宣言される
    const article = makeArticle({
      content: '本文',
      game: { title: 'T', platforms: ['PC'] } as NonNullable<GeneratedArticle['game']>,
      webSearchSources: [],
    });
    expect(buildJudgeUserMessage(article)).toContain('【提供メタデータ（転記元・根拠として使用可）】');
  });
});

describe('parseJudgeResponse', () => {
  it('正常な JSON から claims を抽出する', () => {
    const raw = `判定結果です:
{
  "claims": [
    {"claim": "主張1", "verdict": "supported", "confidence": 0.9, "explanation": "理由1", "excerpt": "本文1"},
    {"claim": "主張2", "verdict": "contradicted", "confidence": 0.8, "explanation": "理由2", "excerpt": "本文2"}
  ]
}`;
    const result = parseJudgeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0].verdict).toBe('supported');
    expect(result.claims[1].verdict).toBe('contradicted');
    expect(result.claims[1].confidence).toBe(0.8);
  });

  it('JSONブロックが無い応答は { ok: false } を返す', () => {
    const result = parseJudgeResponse('JSONがありません');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('No JSON block');
  });

  it('不正なJSONは { ok: false } を返す（throwしない）', () => {
    const result = parseJudgeResponse('{ claims: [壊れたJSON }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('JSON parse failed');
  });

  it('無効な verdict のエントリは除外する', () => {
    const raw = `{"claims": [
      {"claim": "OK", "verdict": "supported", "confidence": 0.5, "explanation": "", "excerpt": ""},
      {"claim": "NG", "verdict": "maybe", "confidence": 0.5, "explanation": "", "excerpt": ""}
    ]}`;
    const result = parseJudgeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].claim).toBe('OK');
  });

  it('confidence を 0.0〜1.0 にクランプする', () => {
    const raw = `{"claims": [
      {"claim": "A", "verdict": "contradicted", "confidence": 1.5, "explanation": "", "excerpt": ""},
      {"claim": "B", "verdict": "unverifiable", "confidence": -0.3, "explanation": "", "excerpt": ""}
    ]}`;
    const result = parseJudgeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims[0].confidence).toBe(1);
    expect(result.claims[1].confidence).toBe(0);
  });

  it('claim が欠けたエントリは除外する', () => {
    const raw = `{"claims": [
      {"verdict": "supported", "confidence": 0.5, "explanation": "", "excerpt": ""}
    ]}`;
    const result = parseJudgeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toHaveLength(0);
  });

  it('正当な {"claims": []} は { ok: true, claims: [] } として返る', () => {
    const raw = `{"claims": []}`;
    const result = parseJudgeResponse(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toHaveLength(0);
  });
});

describe('mapClaimsToWarnings', () => {
  const article = makeArticle({ title: 'Test', category: 'classic' });

  it('supported は警告化しない', () => {
    const claims: JudgeClaim[] = [
      { claim: 'A', verdict: 'supported', confidence: 0.9, explanation: '', excerpt: '' },
    ];
    expect(mapClaimsToWarnings(article, claims)).toHaveLength(0);
  });

  it('contradicted かつ高確信度は high 警告', () => {
    const claims: JudgeClaim[] = [
      {
        claim: '架空のストーリー',
        verdict: 'contradicted',
        confidence: CONTRADICTED_CONFIDENCE_THRESHOLD,
        explanation: '検索結果と矛盾',
        excerpt: '本文該当箇所',
      },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('high');
    expect(warnings[0].type).toBe('llm-judge-contradicted');
    expect(warnings[0].context).toBe('本文該当箇所');
  });

  it('contradicted でも低確信度は low に格下げする（誤判定対策）', () => {
    const claims: JudgeClaim[] = [
      {
        claim: 'あいまいな主張',
        verdict: 'contradicted',
        confidence: CONTRADICTED_CONFIDENCE_THRESHOLD - 0.1,
        explanation: '',
        excerpt: '',
      },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings[0].severity).toBe('low');
  });

  it('unverifiable は low 警告', () => {
    const claims: JudgeClaim[] = [
      { claim: '裏付け不能', verdict: 'unverifiable', confidence: 0.9, explanation: '', excerpt: '' },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('low');
    expect(warnings[0].type).toBe('llm-judge-unverifiable');
  });

  it('警告に記事タイトル・カテゴリ・確信度を含める', () => {
    const claims: JudgeClaim[] = [
      { claim: 'X', verdict: 'unverifiable', confidence: 0.42, explanation: '理由X', excerpt: '' },
    ];
    const w = mapClaimsToWarnings(article, claims)[0];
    expect(w.articleTitle).toBe('Test');
    expect(w.category).toBe('classic');
    expect(w.message).toContain('42%');
    expect(w.message).toContain('理由X');
  });

  it('警告メッセージが「提供された情報」を参照している（Issue #361）', () => {
    const claims: JudgeClaim[] = [
      { claim: 'A', verdict: 'contradicted', confidence: 0.9, explanation: '', excerpt: '' },
      { claim: 'B', verdict: 'unverifiable', confidence: 0.5, explanation: '', excerpt: '' },
    ];
    const warnings = mapClaimsToWarnings(article, claims);
    expect(warnings[0].message).toContain('提供された情報と矛盾します');
    expect(warnings[1].message).toContain('提供された情報で裏付けられません');
    // 「検索結果」という限定表現が残っていないことを確認
    expect(warnings[0].message).not.toMatch(/検索結果と矛盾/);
    expect(warnings[1].message).not.toMatch(/検索結果で裏付けられません/);
  });
});

describe('isLlmJudgeEnabled', () => {
  const original = process.env.VALIDATION_LLM_JUDGE;
  afterEach(() => {
    if (original === undefined) delete process.env.VALIDATION_LLM_JUDGE;
    else process.env.VALIDATION_LLM_JUDGE = original;
  });

  it('デフォルト（未設定）は有効', () => {
    delete process.env.VALIDATION_LLM_JUDGE;
    expect(isLlmJudgeEnabled()).toBe(true);
  });

  it('VALIDATION_LLM_JUDGE=false で無効', () => {
    process.env.VALIDATION_LLM_JUDGE = 'false';
    expect(isLlmJudgeEnabled()).toBe(false);
  });

  it('false 以外の値は有効のまま', () => {
    process.env.VALIDATION_LLM_JUDGE = 'true';
    expect(isLlmJudgeEnabled()).toBe(true);
  });
});

describe('judgeArticles', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockIsTavilyAvailable.mockReset();
    delete process.env.VALIDATION_LLM_JUDGE;
    mockIsTavilyAvailable.mockReturnValue(true);
  });

  const withSources = (overrides: Partial<GeneratedArticle> = {}): GeneratedArticle =>
    makeArticle({
      title: 'Sourced Article',
      content: '本文',
      webSearchSources: [{ url: 'https://e.com', title: 'T', snippet: 's' }],
      ...overrides,
    });

  it('VALIDATION_LLM_JUDGE=false なら何もせず空を返す', async () => {
    process.env.VALIDATION_LLM_JUDGE = 'false';
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('Tavily 未設定なら何もせず空を返す', async () => {
    mockIsTavilyAvailable.mockReturnValue(false);
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('一次ソースも二次ソースも無い記事はスキップする（Issue #361）', async () => {
    const report = await judgeArticles([
      makeArticle({
        content: '本文',
        webSearchSources: undefined,
        judgeGrounding: undefined,
      }),
    ]);
    expect(report.skippedArticles).toBe(1);
    expect(report.judgedArticles).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('二次ソースが無くても一次ソースがあればスキップされない（Issue #361）', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify({ claims: [] }));
    const report = await judgeArticles([
      makeArticle({
        content: '本文',
        webSearchSources: undefined, // 二次ソース無し
        judgeGrounding: {
          games: [
            {
              title: 'Test',
              primarySources: [
                { kind: 'official', url: 'https://example.com', content: 'content' },
              ],
            },
          ],
        },
      }),
    ]);
    expect(report.judgedArticles).toBe(1);
    expect(report.skippedArticles).toBe(0);
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('judge を実行し contradicted を警告化・集計する', async () => {
    mockInvoke.mockResolvedValue(
      JSON.stringify({
        claims: [
          { claim: '架空の機能', verdict: 'contradicted', confidence: 0.9, explanation: '矛盾', excerpt: '架空の機能について詳しく説明します。この機能は実在しません。' },
          { claim: '正しい説明', verdict: 'supported', confidence: 0.9, explanation: '', excerpt: '実在の機能です。これは本当に存在します。' },
        ],
      })
    );
    const report = await judgeArticles([withSources()]);
    expect(report.judgedArticles).toBe(1);
    expect(report.claimsByVerdict.contradicted).toBe(1);
    expect(report.claimsByVerdict.supported).toBe(1);
    // supported は警告化されない → 警告は1件（contradicted）のみ
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].type).toBe('llm-judge-contradicted');
    expect(report.warnings[0].severity).toBe('high');
  });

  it('Bedrock 呼び出しが失敗した記事はビルドを止めずスキップとして記録される', async () => {
    mockInvoke.mockRejectedValue(new Error('bedrock down'));
    const report = await judgeArticles([withSources()]);
    // 判定できなかった記事を judgedArticles に数えると「判定した記事 1 / 矛盾 0」となり
    // 無検証で通ったことがレポートから読み取れない（Issue #363 レビュー指摘）
    expect(report.judgedArticles).toBe(0);
    expect(report.skippedArticles).toBe(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped![0].articleTitle).toBe(withSources().title);
    expect(report.skipped![0].reason).toContain('judge invocation failed');
    expect(report.skipped![0].reason).toContain('bedrock down');
    // 判定結果が無いので出典も「判定に使った出典」には載せない
    expect(report.judgedSources).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('構造化メタデータの逐語転記を filteredByScope としてカウントする（Issue #361）', async () => {
    mockInvoke.mockResolvedValue(
      JSON.stringify({
        claims: [
          { claim: '対応機種', verdict: 'contradicted', confidence: 0.8, explanation: '', excerpt: '対応機種: PC, PlayStation 5' },
          { claim: '散文の主張', verdict: 'supported', confidence: 0.9, explanation: '', excerpt: '実在の都市でプレイ可能' },
        ],
      })
    );
    const report = await judgeArticles([
      makeArticle({
        content: '本文',
        webSearchSources: [{ url: 'https://e.com', title: 'T', snippet: 's' }],
        judgeGrounding: {
          games: [{ title: 'Test', platforms: ['PC', 'PlayStation 5'] }],
        },
      }),
    ]);
    // 対応機種の逐語転記は filteredByScope でカウント、散文の主張だけが claimsByVerdict に入る
    expect(report.filteredByScope).toBe(1);
    expect(report.claimsByVerdict.contradicted).toBe(0); // 対応機種は除外された
    expect(report.claimsByVerdict.supported).toBe(1); // 散文の主張だけが残る
    expect(report.warnings).toHaveLength(0); // contradicted は除外されたので警告も無い
  });
});

// judge の判定根拠の記録（Issue #363）
// 判定件数だけでは contradicted が「記事の誤り」なのか「出典が薄かった」のか切り分けられない
describe('judgeArticles — 判定根拠の記録', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockIsTavilyAvailable.mockReset();
    delete process.env.VALIDATION_LLM_JUDGE;
    mockIsTavilyAvailable.mockReturnValue(true);
    mockInvoke.mockResolvedValue(JSON.stringify({ claims: [] }));
  });

  it('judge に渡した出典を記事ごとに記録する（一次ソースと二次ソース）', async () => {
    const article = makeArticle({
      title: 'Test Article',
      content: '本文',
      judgeGrounding: {
        games: [
          {
            title: 'Game A',
            primarySources: [
              { kind: 'official', url: 'https://official.example', content: 'official content' },
            ],
          },
        ],
      },
      webSearchSources: [
        { url: 'https://secondary.example', title: 'Secondary Source', snippet: 'snippet' },
      ],
    });

    const report = await judgeArticles([article]);

    expect(report.judgedSources).toHaveLength(1);
    const sources = report.judgedSources![0].sources;
    expect(sources).toHaveLength(2);
    expect(sources[0].kind).toBe('primary');
    expect(sources[0].url).toBe('https://official.example');
    expect(sources[1].kind).toBe('secondary');
    expect(sources[1].url).toBe('https://secondary.example');
    // 一次ソースを [1]、二次ソースを [2] と通し番号で振る
    expect(sources[0].index).toBe(1);
    expect(sources[1].index).toBe(2);
  });

  it('スキップした記事はタイトルと理由を記録する（無検証で通った記事を特定できるように）', async () => {
    const report = await judgeArticles([
      makeArticle({ title: '出典なし記事', content: '本文', webSearchSources: [] }),
      makeArticle({
        title: '出典あり記事',
        content: '本文',
        webSearchSources: [{ url: 'https://e.com', title: 'T', snippet: 's' }],
      }),
    ]);

    expect(report.skippedArticles).toBe(1);
    expect(report.skipped).toEqual([
      { articleTitle: '出典なし記事', reason: 'no primary or secondary sources' },
    ]);
    expect(report.judgedSources?.map((s) => s.articleTitle)).toEqual(['出典あり記事']);
  });

  it('VALIDATION_LLM_JUDGE=false のときは全記事をスキップ理由付きで記録する', async () => {
    process.env.VALIDATION_LLM_JUDGE = 'false';

    const report = await judgeArticles([
      makeArticle({ title: '記事1', content: '本文' }),
      makeArticle({ title: '記事2', content: '本文' }),
    ]);

    // 号全体が無検証だったことがレポートから読み取れること
    expect(report.skippedArticles).toBe(2);
    expect(report.skipped).toEqual([
      { articleTitle: '記事1', reason: 'VALIDATION_LLM_JUDGE=false' },
      { articleTitle: '記事2', reason: 'VALIDATION_LLM_JUDGE=false' },
    ]);
  });

  it('Tavily 未設定のときも全記事をスキップ理由付きで記録する', async () => {
    mockIsTavilyAvailable.mockReturnValue(false);

    const report = await judgeArticles([makeArticle({ title: '記事1', content: '本文' })]);

    expect(report.skipped).toEqual([
      { articleTitle: '記事1', reason: 'TAVILY_API_KEY not set' },
    ]);
  });
});

describe('isMetadataOnlyClaim', () => {
  const games = [
    {
      title: '電車アタック',
      platforms: ['Xbox Series X|S', 'Nintendo Switch 2', 'PC (Microsoft Windows)', 'PlayStation 5'],
      releaseDate: '2026-09-02',
      developer: 'Undercoders',
    },
    {
      title: 'Grand Theft Auto: San Andreas',
      platforms: ['Xbox', 'PlayStation 3', 'PlayStation 4', 'Windows Phone', 'Android', 'PC (Microsoft Windows)', 'iOS', 'Mac', 'Xbox 360', 'PlayStation 2'],
    },
  ];

  it('第20号①の excerpt（対応機種リスト）を落とす', () => {
    const claim: JudgeClaim = {
      claim: '対応機種',
      verdict: 'contradicted',
      confidence: 0.8,
      explanation: '',
      excerpt: '対応機種: Xbox Series X|S, Nintendo Switch 2, PC (Microsoft Windows), PlayStation 5',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(true);
  });

  it('第20号⑥の excerpt（対応機種リスト・別形式）を落とす', () => {
    const claim: JudgeClaim = {
      claim: '対応機種',
      verdict: 'unverifiable',
      confidence: 0.3,
      explanation: '',
      excerpt: '対応機種はXbox、PlayStation 3、PlayStation 4、Windows Phone、Android、PC (Microsoft Windows)、iOS、Mac、Xbox 360、PlayStation 2',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(true);
  });

  it('第20号②の excerpt（散文の主張）を残す', () => {
    const claim: JudgeClaim = {
      claim: '実在の都市の地図を使用してプレイ可能',
      verdict: 'contradicted',
      confidence: 0.85,
      explanation: '',
      excerpt: '実在の都市の地図を使用してプレイ可能',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('第20号③の excerpt（散文の主張）を残す', () => {
    const claim: JudgeClaim = {
      claim: 'ミライド社によってドームで覆われた日本という独特の世界観',
      verdict: 'unverifiable',
      confidence: 0,
      explanation: '',
      excerpt: 'ミライド社によってドームで覆われた日本という独特の世界観も魅力です',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('第20号④の excerpt（散文の主張）を残す', () => {
    const claim: JudgeClaim = {
      claim: '魔法少女メカから動く城、機械の虫まで、予想を超える奇抜なボスたちが登場',
      verdict: 'unverifiable',
      confidence: 0,
      explanation: '',
      excerpt: '魔法少女メカから動く城、機械の虫まで、予想を超える奇抜なボスたちが登場',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('第20号⑤の excerpt（散文の主張）を残す', () => {
    const claim: JudgeClaim = {
      claim: 'Two Point Countyに広がる医療組織を運営する病院経営シミュレーション',
      verdict: 'unverifiable',
      confidence: 0.3,
      explanation: '',
      excerpt: 'Two Point Countyに広がる医療組織を運営する病院経営シミュレーション',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('日付の日本語表記を正規化して落とす', () => {
    const claim: JudgeClaim = {
      claim: '発売日',
      verdict: 'unverifiable',
      confidence: 0.5,
      explanation: '',
      excerpt: '発売日: 発売中（2026年9月2日発売）',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(true);
  });

  it('プラットフォームの日本語別名を正規化して落とす', () => {
    const gamesJp = [
      { title: 'Test', platforms: ['Nintendo Switch 2', 'PlayStation 5'] },
    ];
    const claim: JudgeClaim = {
      claim: '対応機種',
      verdict: 'unverifiable',
      confidence: 0.5,
      explanation: '',
      excerpt: 'ニンテンドースイッチ2とPS5に対応',
    };
    expect(isMetadataOnlyClaim(claim, gamesJp)).toBe(true);
  });

  it('ゲーム間の取り違えを落とさない（値を全ゲームでプールしない）', () => {
    // 「Xbox 360」は Grand Theft Auto: San Andreas の対応機種で、電車アタックのものではない。
    // 全ゲームの値をプールして差し引くと「どちらもメタデータの値」として転記扱いになり、
    // 特集記事で最も起きやすいゲーム間の取り違えが warnings と集計の両方から消える
    const claim: JudgeClaim = {
      claim: '電車アタックは Xbox 360 に対応している',
      verdict: 'contradicted',
      confidence: 0.9,
      explanation: '',
      excerpt: '電車アタックはXbox 360に対応',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('同一ゲーム内の対応機種の転記は落とす（取り違え検出の対照）', () => {
    // 上のテストと同じ形だが、機種がそのゲーム自身のものである場合は転記なので落とす
    const claim: JudgeClaim = {
      claim: '電車アタックは Nintendo Switch 2 に対応している',
      verdict: 'unverifiable',
      confidence: 0.4,
      explanation: '',
      excerpt: '電車アタックはNintendo Switch 2に対応',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(true);
  });

  it('メタデータ値に散文が付いた短い主張を落とさない（残余の文字数で切らない）', () => {
    // 残余は「で協力プレイに」の7文字しかないが、機能の主張なので判定対象に残す。
    // 残余の文字数でしきい値を切ると、この種の短い主張が転記扱いで静かに消える
    const claim: JudgeClaim = {
      claim: '協力プレイに対応している',
      verdict: 'unverifiable',
      confidence: 0.4,
      explanation: '',
      excerpt: 'Nintendo Switch 2で協力プレイに対応',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('メタデータの値が1つも当たらない claim は落とさない（ラベルと助詞が消えただけでは転記ではない）', () => {
    // 残余がひらがなだけになるが、メタデータの値が1つも一致していないので転記ではない
    const claim: JudgeClaim = {
      claim: 'もうすぐあそべる',
      verdict: 'unverifiable',
      confidence: 0.2,
      explanation: '',
      excerpt: 'もうすぐあそべます',
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });

  it('Windows Phone が二重変換されずに差し引かれる（正規化の再マッチ防止）', () => {
    // 「Windows Phone」→「Windows」規則の再マッチで「PC Phone」になると、
    // メタデータ値と一致せず残余に Phone が残って転記扱いにならない
    const gamesWp = [{ title: 'T', platforms: ['Windows Phone', 'Android'] }];
    const claim: JudgeClaim = {
      claim: '対応機種',
      verdict: 'unverifiable',
      confidence: 0.3,
      explanation: '',
      excerpt: '対応機種はWindows Phone、Android',
    };
    expect(isMetadataOnlyClaim(claim, gamesWp)).toBe(true);
  });

  it('短い機種名が長い機種名を先に食わない（Xbox と Xbox 360）', () => {
    const gamesXbox = [{ title: 'T', platforms: ['Xbox', 'Xbox 360'] }];
    const claim: JudgeClaim = {
      claim: '対応機種',
      verdict: 'unverifiable',
      confidence: 0.3,
      explanation: '',
      excerpt: '対応機種はXbox、Xbox 360',
    };
    // 短い方を先に差し引くと「360」が残り、数字が残余に混じって転記と判定できない
    expect(isMetadataOnlyClaim(claim, gamesXbox)).toBe(true);
  });

  it('excerpt が空の contradicted claim を落とさない（静かな検出消失を防ぐ）', () => {
    const claim: JudgeClaim = {
      claim: 'Some claim',
      verdict: 'contradicted',
      confidence: 0.9,
      explanation: 'reason',
      excerpt: '', // 空
    };
    expect(isMetadataOnlyClaim(claim, games)).toBe(false);
  });
});

describe('buildJudgeUserMessage with publishDate (§11.3.5)', () => {
  it('発売予定の記事で user メッセージに追記行が含まれる', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: '本文テキスト',
      category: 'newRelease',
      game: {
        title: 'Test Game',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-09-01', // 未来
      },
      webSearchSources: [
        { url: 'https://example.com', title: 'Source', snippet: 'snippet' },
      ],
    });

    const publishDate = new Date('2026-08-13');
    const msg = buildJudgeUserMessage(article, publishDate);

    // 追記行が含まれることを確認
    expect(msg).toContain('この記事は発売前のタイトルを扱っている');
    expect(msg).toContain('「評価が高い」「好評」「絶賛」');
    // 追記位置が最後の指示文の直前であること
    const lines = msg.split('\n');
    const instructionLineIdx = lines.findIndex((l) =>
      l.includes('上記の本文から事実主張を抽出し、提供された情報')
    );
    const addedLineIdx = lines.findIndex((l) => l.includes('この記事は発売前のタイトルを扱っている'));
    expect(instructionLineIdx).toBeGreaterThan(0);
    expect(addedLineIdx).toBeGreaterThan(0);
    expect(addedLineIdx).toBeLessThan(instructionLineIdx);
  });

  it('本日発売の記事でも追記行が含まれる', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: '本文テキスト',
      category: 'newRelease',
      game: {
        title: 'Test Game',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-08-13', // 当日
      },
      webSearchSources: [
        { url: 'https://example.com', title: 'Source', snippet: 'snippet' },
      ],
    });

    const publishDate = new Date('2026-08-13');
    const msg = buildJudgeUserMessage(article, publishDate);

    expect(msg).toContain('この記事は発売前のタイトルを扱っている');
  });

  it('発売済み記事では追記行が含まれない', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: '本文テキスト',
      category: 'newRelease',
      game: {
        title: 'Test Game',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-08-01', // 過去
      },
      webSearchSources: [
        { url: 'https://example.com', title: 'Source', snippet: 'snippet' },
      ],
    });

    const publishDate = new Date('2026-08-13');
    const msg = buildJudgeUserMessage(article, publishDate);

    expect(msg).not.toContain('この記事は発売前のタイトルを扱っている');
  });

  it('releaseDate 無しの記事では追記行が含まれない', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: '本文テキスト',
      category: 'newRelease',
      game: {
        title: 'Test Game',
        genre: [],
        platforms: ['PC'],
        // releaseDate なし
      },
      webSearchSources: [
        { url: 'https://example.com', title: 'Source', snippet: 'snippet' },
      ],
    });

    const publishDate = new Date('2026-08-13');
    const msg = buildJudgeUserMessage(article, publishDate);

    expect(msg).not.toContain('この記事は発売前のタイトルを扱っている');
  });

  it('publishDate 無しの場合は追記行が含まれない', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: '本文テキスト',
      category: 'newRelease',
      game: {
        title: 'Test Game',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-09-01',
      },
      webSearchSources: [
        { url: 'https://example.com', title: 'Source', snippet: 'snippet' },
      ],
    });

    const msg = buildJudgeUserMessage(article, undefined);

    expect(msg).not.toContain('この記事は発売前のタイトルを扱っている');
  });

  it('system プロンプトが分岐していないこと（judgeSystemPrompt は定数）', () => {
    // judgeSystemPrompt は定数なので、発売状態によって変わらない
    expect(judgeSystemPrompt).toBeTruthy();
    expect(typeof judgeSystemPrompt).toBe('string');
    // 内容の検証（主観的表現の除外ルールが含まれていること）
    expect(judgeSystemPrompt).toContain('主観的表現・感想・期待感');
  });
});
