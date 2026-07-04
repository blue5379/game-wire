/**
 * validate-article のユニットテスト
 *
 * issue-008 のハルシネーション事案を再現するテストケースを含む。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateTitleConsistency,
  validateBodyTitleConsistency,
  validatePlatformConsistency,
  validatePersonAttribution,
  validateNumericClaims,
  validateFeatureNumericClaims,
  validateArticles,
  validateGameSourceConsistency,
  buildFixInstruction,
} from './validate-article.js';
import type { ValidationWarning } from './validate-article.js';
import type { GeneratedArticle } from './generate-articles.js';

function makeArticle(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    title: 'デフォルトタイトル',
    category: 'newRelease',
    summary: '',
    content: '',
    ...overrides,
  };
}

describe('validateTitleConsistency', () => {
  it('issue-008 の Hero Company 事案を検出する（英語タイトルの誤短縮）', () => {
    const article = makeArticle({
      title: '歴史を変えた中隊を指揮せよ！戦術性が光るインディーRTS『Hero Company』',
      category: 'indie',
      game: {
        title: 'Company of Heroes',
        genre: ['RTS'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    const warnings = validateTitleConsistency(article);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('title-mismatch');
    expect(warnings[0].severity).toBe('high');
  });

  it('英語タイトルがそのまま含まれていれば警告しない', () => {
    const article = makeArticle({
      title: 'Company of Heroes が描く第二次世界大戦RTSの傑作',
      category: 'classic',
      game: {
        title: 'Company of Heroes',
        genre: ['RTS'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });

  it('日本語タイトルが含まれていれば警告しない', () => {
    const article = makeArticle({
      title: '『トモダチコレクション わくわく生活』が新登場',
      category: 'newRelease',
      game: {
        title: 'Tomodachi Life: Living the Dream',
        titleJa: 'トモダチコレクション わくわく生活',
        genre: ['Simulator'],
        platforms: ['Nintendo Switch'],
      },
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });

  it('特集記事はチェック対象外', () => {
    const article = makeArticle({
      title: '2026年5月第4週の注目ゲーム4選',
      category: 'feature',
    });

    expect(validateTitleConsistency(article)).toHaveLength(0);
  });
});

describe('validateBodyTitleConsistency', () => {
  it('本文中でタイトルを別名に改変している事案を検出する（Company of Heroes → Hero Company）', () => {
    const article = makeArticle({
      title: '歴史を変えた中隊を指揮せよ！『Company of Heroes』',
      category: 'indie',
      content:
        '## ✨ ゲームの魅力\n\n「Hero Company」は戦術性が光るRTSです。' +
        'Hero Company の戦場では緻密な判断が求められます。',
      game: {
        title: 'Company of Heroes',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateBodyTitleConsistency(article);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('body-title-mismatch');
    expect(warnings[0].severity).toBe('high');
  });

  it('本文中に英語の正式タイトルが含まれていれば警告しない', () => {
    const article = makeArticle({
      title: 'ARK 紹介',
      category: 'indie',
      content: '本作「ARK: Survival Ascended」は広大なオープンワールドが魅力です。',
      game: {
        title: 'ARK: Survival Ascended',
        genre: [],
        platforms: ['PC'],
      },
    });

    expect(validateBodyTitleConsistency(article)).toHaveLength(0);
  });

  it('本文中に日本語タイトルが含まれていれば警告しない（英語タイトル不在でも可）', () => {
    const article = makeArticle({
      title: 'ファイナルファンタジー特集',
      category: 'newRelease',
      content: '「ファイナルファンタジーXVI」は壮大な物語が展開されます。',
      game: {
        title: 'Final Fantasy XVI',
        titleJa: 'ファイナルファンタジーXVI',
        genre: [],
        platforms: ['PS5'],
      },
    });

    expect(validateBodyTitleConsistency(article)).toHaveLength(0);
  });

  it('記号・空白の差異は許容する（コロンや全角の違いで誤検知しない）', () => {
    const article = makeArticle({
      title: 'Atomic Heart 紹介',
      category: 'newRelease',
      content: '本作「Atomic Heart：Blood on Crystal」をご紹介します。',
      game: {
        title: 'Atomic Heart: Blood on Crystal',
        genre: [],
        platforms: ['PC'],
      },
    });

    expect(validateBodyTitleConsistency(article)).toHaveLength(0);
  });

  it('IGDB の name/slug 不整合では誤検知しない（本文が正式名なら slug は無関係）', () => {
    // slug は "richard-and-alice" だが name は "Richard"。本文では正しく Richard と書いている
    const article = makeArticle({
      title: '家族と絶望を描くインディーアドベンチャー「Richard」が話題に',
      category: 'indie',
      content: '「Richard」は家族、絶望、天候をテーマにしたミステリーアドベンチャーです。',
      sourceUrls: {
        igdb: 'https://www.igdb.com/games/richard-and-alice',
      },
      game: {
        title: 'Richard',
        genre: [],
        platforms: ['PC'],
      },
    });

    expect(validateBodyTitleConsistency(article)).toHaveLength(0);
  });

  it('特集記事はチェック対象外', () => {
    const article = makeArticle({
      title: '今週の注目',
      category: 'feature',
      content: '本文に何も含まれていなくても feature は対象外',
    });

    expect(validateBodyTitleConsistency(article)).toHaveLength(0);
  });
});

describe('validatePlatformConsistency', () => {
  it('issue-008 の FiveM 事案を検出する（提供データに無い Linux/Mac の言及）', () => {
    const article = makeArticle({
      title: 'GTAVを無限に遊べるFiveM',
      category: 'classic',
      content: 'FiveMは現在、PC（Microsoft Windows）、Linux、Macでプレイ可能です。',
      game: {
        title: 'FiveM',
        genre: ['Shooter'],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    const warnings = validatePlatformConsistency(article);
    const types = warnings.map((w) => w.evidence);
    expect(types).toContain('Linux');
    expect(types).toContain('Mac');
  });

  it('提供データに合致するプラットフォーム言及は警告しない', () => {
    const article = makeArticle({
      title: 'ARK',
      category: 'indie',
      content: 'PC（Microsoft Windows）と PlayStation 5、Xbox Series X|S で発売中。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'],
      },
    });

    expect(validatePlatformConsistency(article)).toHaveLength(0);
  });

  it('提供データが "PC (Microsoft Windows)" でも記事内の "PC (Steam)" 表記は警告しない', () => {
    const article = makeArticle({
      title: 'Witchspire',
      category: 'indie',
      content: 'PC (Steam) で発売中のインディーゲームです。',
      game: {
        title: 'Witchspire',
        genre: [],
        platforms: ['PC (Microsoft Windows)'],
      },
    });

    expect(validatePlatformConsistency(article)).toHaveLength(0);
  });
});

describe('validatePersonAttribution', () => {
  it('issue-008 の Tomodachi Life 事案を検出する（ディレクター上野氏の発言）', () => {
    const article = makeArticle({
      title: 'Tomodachi Life',
      content:
        '開発チームのディレクター・上野氏によると、「小さな癖」機能の追加により、プレイヤーがMiiキャラクターに歩き方や食事の仕方などの特性や行動を与えられるようになったとのこと。',
      game: {
        title: 'Tomodachi Life',
        genre: [],
        platforms: ['Nintendo Switch'],
        developer: 'Nintendo',
      },
    });

    const warnings = validatePersonAttribution(article);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.evidence?.includes('上野'))).toBe(true);
  });

  it('issue-008 の ARK 事案を検出する（CTO Alex Williams 氏）', () => {
    const article = makeArticle({
      title: 'ARK',
      content: 'CTOのAlex Williams氏を中心に、少数精鋭のチームが開発とプログラミングの両面で手腕を発揮。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC'],
        developer: 'Studio Wildcard',
      },
    });

    const warnings = validatePersonAttribution(article);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.type === 'person-title')).toBe(true);
  });

  it('開発元名と一致する場合は警告しない', () => {
    const article = makeArticle({
      title: 'Test Game',
      content: 'Studio Wildcard氏は語った。', // ありえない文だが照合テスト
      game: {
        title: 'Test',
        genre: [],
        platforms: ['PC'],
        developer: 'Studio Wildcard',
      },
    });

    const warnings = validatePersonAttribution(article);
    // 開発元名と一致するためスキップされる
    expect(
      warnings.filter((w) => w.evidence?.includes('Studio Wildcard'))
    ).toHaveLength(0);
  });
});

describe('validateNumericClaims', () => {
  it('issue-008 の ARK 事案を検出する（Steamレビュー 75,995 件）', () => {
    const article = makeArticle({
      title: 'ARK',
      content: 'Steamでは75,995件のレビューが投稿され、「賛否両論」の評価。',
      game: {
        title: 'ARK',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-review-count')).toBe(true);
  });

  it('issue-008 の Atomic Heart 事案を検出する（1000万ユーザー）', () => {
    const article = makeArticle({
      title: 'Atomic Heart',
      content: 'Atomic Heartは発売から約1年で1,000万ユーザーを突破する大ヒットを記録し',
      game: {
        title: 'Atomic Heart',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-large-count')).toBe(true);
  });

  it('issue-008 の Forza 事案を検出する（550台以上の実車）', () => {
    const article = makeArticle({
      title: 'Forza',
      content: '日本全国の実在する景観を550台以上の実車で駆け抜ける、オープンワールドレーシングの最高峰。',
      game: {
        title: 'Forza Horizon 6',
        genre: [],
        platforms: ['PC'],
      },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-vehicle-count')).toBe(true);
  });

  it('提供データに含まれる数値は警告しない（Metacritic 90 等）', () => {
    const article = makeArticle({
      title: 'Test',
      content: 'Metacriticスコアは90点。',
      game: {
        title: 'Test',
        genre: [],
        platforms: ['PC'],
        metascore: 90,
      },
    });

    // 90単独はパターンにマッチしないため空、年度検査も入らない
    const warnings = validateNumericClaims(article);
    expect(warnings).toHaveLength(0);
  });

  // --- #19 で追加した取りこぼし対策（実測で漏れていた実在事案）---

  it('「プレイ/遊」を伴わないプレイ時間を検出する（100時間超え）', () => {
    const article = makeArticle({
      title: 'RPG特集対象',
      content: 'メインストーリーだけで50時間以上、サイドクエストを含めると100時間超えの大ボリューム。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-play-hours')).toBe(true);
  });

  it('プレイ時間の範囲表記を 1 件として検出する（40〜60時間で二重カウントしない）', () => {
    const article = makeArticle({
      title: 'リメイク作',
      content: '原作のボリュームを40〜60時間のボリュームに拡張した。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const playHours = validateNumericClaims(article).filter((w) => w.type === 'numeric-play-hours');
    expect(playHours).toHaveLength(1);
    expect(playHours[0].evidence).toContain('40〜60時間');
  });

  it('「N万件」のレビュー数を検出する（18万件以上のレビュー）', () => {
    const article = makeArticle({
      title: 'ヒット作',
      content: 'Steamには18万件以上のレビューが寄せられ、96%が好評という評価を得ている。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-review-count')).toBe(true);
  });

  it('評価率（パーセント）を検出する', () => {
    const article = makeArticle({
      title: '高評価作',
      content: 'Steamで96%の高評価を獲得した。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-percentage')).toBe(true);
  });

  it('収録種類数を検出する（100種類以上の恐竜）', () => {
    const article = makeArticle({
      title: 'ARK',
      content: '100種類以上の恐竜や古代生物をテイムできる。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const warnings = validateNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-kind-count')).toBe(true);
  });

  it('概数表現を low で検出する（何百時間）', () => {
    const article = makeArticle({
      title: 'やり込み作',
      content: '何百時間と遊べるほどのコンテンツ量を誇る。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const approx = validateNumericClaims(article).filter((w) => w.type === 'numeric-approx-count');
    expect(approx).toHaveLength(1);
    expect(approx[0].severity).toBe('low');
    // 概数は capture group を持たないため sourcedFrom 照合をスキップする
    expect(approx[0].sourcedFrom).toBeUndefined();
  });

  it('発売日の年号を評価率・種類数と誤検知しない', () => {
    // releaseDate の年（2026）が % や 種 のパターンを誤って踏まないことを確認
    const article = makeArticle({
      title: '新作',
      content: '2026年4月に発売され、2種の限定版が用意された。',
      game: {
        title: 'Test',
        genre: [],
        platforms: ['PC'],
        releaseDate: '2026-04-16',
      },
    });

    const warnings = validateNumericClaims(article);
    // 「2種」は 2 桁以上限定の kind-count にマッチしない、年号も誤検知しない
    expect(warnings.some((w) => w.type === 'numeric-percentage')).toBe(false);
    expect(warnings.some((w) => w.type === 'numeric-kind-count')).toBe(false);
  });
});

describe('validateFeatureNumericClaims', () => {
  it('特集記事でも拡張パターンを共用して検出する（プレイ時間・%）', () => {
    const article = makeArticle({
      title: 'GW特集：連休に遊べる大作',
      category: 'feature',
      content: '100時間超えの大作RPGを厳選。いずれもSteamで96%の高評価を獲得している。',
    });

    const warnings = validateFeatureNumericClaims(article);
    expect(warnings.some((w) => w.type === 'numeric-play-hours')).toBe(true);
    expect(warnings.some((w) => w.type === 'numeric-percentage')).toBe(true);
  });

  it('feature 以外の記事は対象外', () => {
    const article = makeArticle({
      category: 'newRelease',
      content: '100時間超えの大作。',
    });
    expect(validateFeatureNumericClaims(article)).toHaveLength(0);
  });

  it('webSearchSources に根拠がある数値には sourcedFrom が付く（新フローのグラウンディング）', () => {
    const article = makeArticle({
      title: 'GW特集',
      category: 'feature',
      content: 'このゲームはSteamで96%の高評価を獲得している。',
      webSearchSources: [
        {
          url: 'https://example.com/review',
          title: 'Game Review',
          snippet: 'The game has a 96% positive rating on Steam.',
        },
      ],
    });

    const pct = validateFeatureNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(pct).toBeDefined();
    expect(pct?.sourcedFrom?.url).toBe('https://example.com/review');
  });

  it('webSearchSources に根拠がない数値は sourcedFrom が undefined（捏造の可能性）', () => {
    const article = makeArticle({
      title: 'GW特集',
      category: 'feature',
      content: 'このゲームはSteamで96%の高評価を獲得している。',
      webSearchSources: [
        {
          url: 'https://example.com/other',
          title: 'Unrelated',
          snippet: 'This snippet does not mention any rating figure.',
        },
      ],
    });

    const pct = validateFeatureNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(pct).toBeDefined();
    expect(pct?.sourcedFrom).toBeUndefined();
  });

  it('数値が別の数字の一部に一致するだけでは sourcedFrom を付けない（false positive 防止）', () => {
    // 本文の「96%」に対し、検索結果には "1996" しか無い → 根拠とみなさない
    const article = makeArticle({
      title: 'GW特集',
      category: 'feature',
      content: 'このゲームはSteamで96%の高評価を獲得している。',
      webSearchSources: [
        {
          url: 'https://example.com/history',
          title: 'Game History',
          snippet: 'The original game was released in 1996 and became a classic.',
        },
      ],
    });

    const pct = validateFeatureNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(pct).toBeDefined();
    expect(pct?.sourcedFrom).toBeUndefined();
  });

  it('snippet 後半にある根拠も検出する（snippet 拡大による false negative 改善）', () => {
    // 300 文字より後ろに数値の根拠がある場合でも sourcedFrom が付くこと
    const filler = 'あ'.repeat(400);
    const article = makeArticle({
      title: 'GW特集',
      category: 'feature',
      content: 'このゲームはSteamで96%の高評価を獲得している。',
      webSearchSources: [
        {
          url: 'https://example.com/late',
          title: 'Review',
          snippet: `${filler} The game holds a 96% positive rating.`,
        },
      ],
    });

    const pct = validateFeatureNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(pct).toBeDefined();
    expect(pct?.sourcedFrom?.url).toBe('https://example.com/late');
  });
});

describe('validateArticles (集約)', () => {
  it('複数記事から集計レポートを生成する', () => {
    const articles: GeneratedArticle[] = [
      makeArticle({
        title: 'Hero Company',
        category: 'indie',
        game: {
          title: 'Company of Heroes',
          genre: [],
          platforms: ['PC'],
        },
      }),
      makeArticle({
        title: 'Forza Horizon 6 が登場',
        category: 'newRelease',
        content: '550台以上の実車で駆け抜ける。',
        game: {
          title: 'Forza Horizon 6',
          genre: [],
          platforms: ['PC'],
        },
      }),
    ];

    const report = validateArticles(articles, 8);
    expect(report.issueNumber).toBe(8);
    expect(report.totalArticles).toBe(2);
    expect(report.totalWarnings).toBeGreaterThanOrEqual(2);
    expect(report.warningsBySeverity.high).toBeGreaterThanOrEqual(2);
  });
});

describe('buildFixInstruction', () => {
  const w = (type: string, evidence: string): ValidationWarning => ({
    articleTitle: 'T',
    category: 'newRelease',
    severity: 'high',
    type,
    message: '',
    evidence,
  });

  it('警告が無ければ空文字列', () => {
    expect(buildFixInstruction([])).toBe('');
  });

  it('platform-mismatch は対応機種削除の指示を出す', () => {
    const out = buildFixInstruction([w('platform-mismatch', 'Nintendo Switch')]);
    expect(out).toContain('Nintendo Switch');
    expect(out).toContain('対応機種');
    expect(out).toContain('前回生成での問題点');
  });

  it('numeric-* は数値削除の指示を出す', () => {
    const out = buildFixInstruction([w('numeric-review-count', '18万件')]);
    expect(out).toContain('18万件');
    expect(out).toContain('数値');
  });

  it('person-* は人物削除の指示を出す', () => {
    const out = buildFixInstruction([w('person-quote', '田中太郎')]);
    expect(out).toContain('田中太郎');
    expect(out).toContain('人物');
  });

  it('title 系はタイトル正確使用の指示を出す', () => {
    const out = buildFixInstruction([w('title-mismatch', '')]);
    expect(out).toContain('タイトル');
  });

  it('同一内容の指示は重複排除される', () => {
    const out = buildFixInstruction([
      w('platform-mismatch', 'PC (Steam)'),
      w('platform-mismatch', 'PC (Steam)'),
    ]);
    // 同じ指示文は1行のみ
    const occurrences = out.split('\n').filter((l) => l.includes('PC (Steam)')).length;
    expect(occurrences).toBe(1);
  });

  it('複数種類の警告をすべて指示に含める', () => {
    const out = buildFixInstruction([
      w('platform-mismatch', 'Switch'),
      w('numeric-user-count', '40万人'),
      w('person-title', '山田'),
    ]);
    expect(out).toContain('Switch');
    expect(out).toContain('40万人');
    expect(out).toContain('山田');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateGameSourceConsistency — Issue #166 ③: game メタと Steam 実体の内的整合性
// ─────────────────────────────────────────────────────────────────────────────
describe('validateGameSourceConsistency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockStorefront(appId: string, data: unknown): void {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ [appId]: { success: true, data } }),
    }) as unknown as typeof fetch;
  }

  it('Brick Game 事案: game.releaseDate=1989 なのに Steam(1087090)=2026 → high 警告', async () => {
    const article = makeArticle({
      title: '懐かしの携帯型液晶ゲーム機『Brick Game』',
      category: 'indie',
      game: {
        title: 'Brick Game',
        genre: ['Puzzle', 'Racing', 'Arcade'],
        platforms: ['Handheld Electronic LCD'],
        releaseDate: '1989-12-31',
        developer: 'Shenzhen Xinfeilong Electronic Factory',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/1087090' },
    });
    mockStorefront('1087090', {
      name: 'Brick Game',
      release_date: { coming_soon: false, date: '2026年7月4日' },
      developers: ['Daniel Shimmyo'],
    });

    const warnings = await validateGameSourceConsistency(article);

    const yearWarn = warnings.find((w) => w.type === 'game-source-mismatch');
    expect(yearWarn).toBeDefined();
    expect(yearWarn?.severity).toBe('high');
  });

  it('整合ケース: game.releaseDate=2026 と Steam=2026 → 警告なし', async () => {
    const article = makeArticle({
      title: '新作『Foo』登場',
      category: 'newRelease',
      game: {
        title: 'Foo',
        genre: ['Action'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2026-07-04',
        developer: 'Daniel Shimmyo',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/1087090' },
    });
    mockStorefront('1087090', {
      name: 'Foo',
      release_date: { coming_soon: false, date: '2026年7月4日' },
      developers: ['Daniel Shimmyo'],
    });

    const warnings = await validateGameSourceConsistency(article);
    expect(warnings).toHaveLength(0);
  });

  it('developer が全く一致しない場合も high 警告（発売年は一致していても）', async () => {
    const article = makeArticle({
      title: '新作『Bar』登場',
      category: 'newRelease',
      game: {
        title: 'Bar',
        genre: ['Action'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2026-01-01',
        developer: 'Shenzhen Xinfeilong Electronic Factory',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/2222222' },
    });
    mockStorefront('2222222', {
      name: 'Bar',
      release_date: { coming_soon: false, date: '2026年1月1日' },
      developers: ['Daniel Shimmyo'],
    });

    const warnings = await validateGameSourceConsistency(article);
    const devWarn = warnings.find((w) => w.type === 'game-source-mismatch' && /開発/.test(w.message));
    expect(devWarn).toBeDefined();
    expect(devWarn?.severity).toBe('high');
  });

  it('API 失敗時は警告を出さない（fail-open）', async () => {
    const article = makeArticle({
      title: '『Baz』',
      category: 'indie',
      game: {
        title: 'Baz',
        genre: [],
        platforms: [],
        releaseDate: '1989-01-01',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/3333333' },
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const warnings = await validateGameSourceConsistency(article);
    expect(warnings).toHaveLength(0);
  });

  it('Steam URL が無い記事は検証対象外（警告なし・API も呼ばない）', async () => {
    const article = makeArticle({
      title: '『Qux』',
      category: 'classic',
      game: { title: 'Qux', genre: [], platforms: [], releaseDate: '2000-01-01' },
      sourceUrls: { official: 'https://example.com' },
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const warnings = await validateGameSourceConsistency(article);
    expect(warnings).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Steam URL は stores[] からも抽出できる', async () => {
    const article = makeArticle({
      title: '『Old』',
      category: 'indie',
      game: {
        title: 'Old',
        genre: [],
        platforms: [],
        releaseDate: '1989-12-31',
      },
      sourceUrls: {
        stores: [
          {
            platform: 'steam',
            url: 'https://store.steampowered.com/app/4444444',
            resolvedBy: 'igdb-website',
            confidence: 'high',
          },
        ],
      },
    });
    mockStorefront('4444444', {
      name: 'Old',
      release_date: { coming_soon: false, date: '2026年3月1日' },
    });

    const warnings = await validateGameSourceConsistency(article);
    expect(warnings.some((w) => w.type === 'game-source-mismatch')).toBe(true);
  });
});
