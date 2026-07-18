/**
 * validate-article のユニットテスト
 *
 * issue-008 のハルシネーション事案を再現するテストケースを含む。
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  validateTitleConsistency,
  validateBodyTitleConsistency,
  validatePlatformConsistency,
  validatePersonAttribution,
  validateNumericClaims,
  validateFeatureNumericClaims,
  validateArticles,
  validateGameSourceConsistency,
  validateReleasedTitleExpression,
  buildFixInstruction,
  extractNumericUnitKey,
} from './validate-article.js';
import type { ValidationWarning } from './validate-article.js';
import type { GeneratedArticle } from './generate-articles.js';
import { clearSteamEntityCache } from './steam-entity.js';

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

  it('issue-191: 4桁以上のプレイ時間を正しく検出する（1000時間以上の下3桁にマッチしない）', () => {
    // バグ時は evidence が "000時間以上" になっていた
    const article = makeArticle({
      title: 'やり込み作',
      content: '前作を1000時間以上プレイしたユーザーも多い。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const playHours = validateNumericClaims(article).filter((w) => w.type === 'numeric-play-hours');
    expect(playHours).toHaveLength(1);
    expect(playHours[0].evidence).toBe('1000時間以上');
  });

  it('issue-191: 5桁のプレイ時間も正しく検出する（10000時間）', () => {
    const article = makeArticle({
      title: 'やり込み作',
      content: '10000時間超えのプレイヤーが続出している。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const playHours = validateNumericClaims(article).filter((w) => w.type === 'numeric-play-hours');
    expect(playHours).toHaveLength(1);
    expect(playHours[0].evidence).toBe('10000時間超え');
  });

  it('issue-191: 4桁の範囲表記を 1 件として正しく検出する（1000〜2000時間）', () => {
    const article = makeArticle({
      title: 'やり込み作',
      content: 'ヘビーユーザーは1000〜2000時間以上プレイしている。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const playHours = validateNumericClaims(article).filter((w) => w.type === 'numeric-play-hours');
    expect(playHours).toHaveLength(1);
    expect(playHours[0].evidence).toContain('1000〜2000時間');
  });

  it('issue-191: 2〜3桁の既存ケースが壊れない（50時間以上）', () => {
    const article = makeArticle({
      title: 'RPG',
      content: 'メインストーリーだけで50時間以上かかる大ボリューム。',
      game: { title: 'Test', genre: [], platforms: ['PC'] },
    });

    const playHours = validateNumericClaims(article).filter((w) => w.type === 'numeric-play-hours');
    expect(playHours).toHaveLength(1);
    expect(playHours[0].evidence).toBe('50時間以上');
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

// ---------------------------------------------------------------------------
// extractNumericUnitKey のユニットテスト
// ---------------------------------------------------------------------------
describe('extractNumericUnitKey', () => {
  it('大きな数値単位（万人）を正しく抽出する', () => {
    expect(extractNumericUnitKey('40万人', '40')).toBe('40万人');
  });

  it('末尾の接尾語（以上）を除去してコア単位を返す', () => {
    expect(extractNumericUnitKey('18万件以上', '18')).toBe('18万件');
  });

  it('プレイ時間の末尾語（超え）を除去する', () => {
    expect(extractNumericUnitKey('100時間超え', '100')).toBe('100時間');
  });

  it('プレイ時間の末尾語（に拡張）を除去する', () => {
    expect(extractNumericUnitKey('40〜60時間に拡張', '40〜60')).toBe('40〜60時間');
  });

  it('パーセント記号はそのまま保持する', () => {
    expect(extractNumericUnitKey('96%', '96')).toBe('96%');
  });

  it('億本の単位を保持する', () => {
    expect(extractNumericUnitKey('2億本', '2')).toBe('2億本');
  });

  it('vehicle-count: 「以上の実車」形式の内部装飾を除去してコア単位「台」を返す', () => {
    // "550台以上の実車" → "550台"（以上の実車 は装飾語）
    expect(extractNumericUnitKey('550台以上の実車', '550')).toBe('550台');
  });

  it('vehicle-count: 「以上の車両」形式も同様に除去する', () => {
    expect(extractNumericUnitKey('550台以上の車両', '550')).toBe('550台');
  });

  it('vehicle-count: 「以上」なしの「の車」形式も除去する', () => {
    // "550台の車" → "550台"（の車 は trailing suffix の の\S+ で除去）
    expect(extractNumericUnitKey('550台の車', '550')).toBe('550台');
  });
});

// ---------------------------------------------------------------------------
// issue-192 の回帰テスト: findSourceFor の単位誤マッチ防止
// ---------------------------------------------------------------------------
describe('validateNumericClaims — 単位誤マッチ防止（issue-192 回帰）', () => {
  it('バグ再現: 本文「約40万人」に対し、検索結果が「40ダメ」しかない場合は sourcedFrom が付かない', () => {
    // 修正前は "40" というキーで照合するため "40ダメ" にもマッチしていた（誤マッチ）
    const article = makeArticle({
      title: 'Slay the Spire 2',
      content: '同時接続プレイヤー数が約40万人を突破した。',
      game: { title: 'Slay the Spire 2', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/guide',
          title: '攻略ブログ',
          snippet: '1コス(＋4スター)で30ダメ(アプデで40ダメ)になった強カード。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-large-count');
    expect(w).toBeDefined();
    // 「40万人」は「40ダメ」に一致してはいけない → sourcedFrom は undefined
    expect(w?.sourcedFrom).toBeUndefined();
  });

  it('正常系: 本文「約40万人」に対し、検索結果に「40万人」が含まれる場合は sourcedFrom が付く', () => {
    const article = makeArticle({
      title: 'Slay the Spire 2',
      content: '同時接続プレイヤー数が約40万人を突破した。',
      game: { title: 'Slay the Spire 2', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/news',
          title: 'ゲームニュース',
          snippet: 'Slay the Spire 2 の同時接続プレイヤー数が40万人を超えたと報告された。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-large-count');
    expect(w).toBeDefined();
    // 「40万人」が検索結果に含まれるので sourcedFrom が付く
    expect(w?.sourcedFrom?.url).toBe('https://example.com/news');
  });

  it('スペース区切りの表記ゆれ「40万 人」も根拠として認識する', () => {
    const article = makeArticle({
      title: 'テストゲーム',
      content: '40万人のプレイヤーが遊んでいる。',
      game: { title: 'テストゲーム', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/stats',
          title: 'Stats',
          snippet: '現在40万 人以上のユーザーが参加している。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-large-count');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom?.url).toBe('https://example.com/stats');
  });

  // --- unitKey の数値先頭桁境界チェック（issue-192 フォローアップ）---

  it('unitKey 桁境界: 本文「96%」に対し、検索結果に「196%」しかない場合は sourcedFrom が付かない', () => {
    // includes("96%") は "196%" にマッチしてしまうが、(?<!\d) により防ぐ
    const article = makeArticle({
      title: '高評価作',
      content: 'Steamで96%の高評価を獲得している。',
      game: { title: '高評価作', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/stats',
          title: 'Stats',
          snippet: '前年比196%増加した驚異的な売上を記録。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom).toBeUndefined();
  });

  it('unitKey 桁境界: 本文「100時間」に対し、検索結果に「3100時間」しかない場合は sourcedFrom が付かない', () => {
    const article = makeArticle({
      title: 'MMO特集',
      content: '100時間超えの大ボリューム。',
      game: { title: 'MMO特集', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/playtime',
          title: 'Playtime Stats',
          snippet: 'ヘビーユーザーの合計プレイ時間は3100時間を超えた。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-play-hours');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom).toBeUndefined();
  });

  it('unitKey 桁境界: 本文「96%」に対し、検索結果に単独の「96%」があれば sourcedFrom が付く', () => {
    const article = makeArticle({
      title: '高評価作',
      content: 'Steamで96%の高評価を獲得している。',
      game: { title: '高評価作', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/review',
          title: 'Review',
          snippet: 'The game holds a 96% positive rating on Steam.',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-percentage');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom?.url).toBe('https://example.com/review');
  });

  it('unitKey 桁境界: 本文「40〜60時間」の範囲表記も根拠として正しく照合される', () => {
    const article = makeArticle({
      title: 'リメイク作',
      content: '原作を40〜60時間のボリュームに拡張した。',
      game: { title: 'リメイク作', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/review',
          title: 'Review',
          snippet: 'ゲームクリアに40〜60時間かかると開発者が述べた。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-play-hours');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom?.url).toBe('https://example.com/review');
  });

  // --- vehicle-count の unitKey 抽出修正（extractNumericUnitKey code-review フォローアップ）---

  it('vehicle-count: 本文「550台以上の実車」に対し、検索結果「550台の車が収録」で sourcedFrom が付く', () => {
    // 修正前は unitKey が "550台以上の実車" のまま残り、"550台の車が収録" にマッチしなかった
    const article = makeArticle({
      title: 'Forza',
      content: '日本全国の実在する景観を550台以上の実車で駆け抜ける。',
      game: { title: 'Forza Horizon 6', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/forza',
          title: 'Forza Horizon 6 レビュー',
          snippet: '550台の車が収録されており、実在の景観を走れる。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-vehicle-count');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom?.url).toBe('https://example.com/forza');
  });

  it('vehicle-count: 本文「550台以上の実車」に対し、検索結果「550台以上の車」でも sourcedFrom が付く', () => {
    const article = makeArticle({
      title: 'Forza',
      content: '550台以上の実車を収録している。',
      game: { title: 'Forza Horizon 6', genre: [], platforms: ['PC'] },
      webSearchSources: [
        {
          url: 'https://example.com/forza2',
          title: 'Forza Horizon 6',
          snippet: '550台以上の車を収録した大規模なレーシングゲーム。',
        },
      ],
    });

    const w = validateNumericClaims(article).find((w) => w.type === 'numeric-vehicle-count');
    expect(w).toBeDefined();
    expect(w?.sourcedFrom?.url).toBe('https://example.com/forza2');
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
// validateGameSourceConsistency — Issue #166 ③ / #179 PR-3: 多軸照合
// ─────────────────────────────────────────────────────────────────────────────
describe('validateGameSourceConsistency', () => {
  beforeEach(() => {
    // fetchSteamEntity はモジュール内キャッシュを持つため、テスト間で必ずクリアする
    clearSteamEntityCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * l=english / l=japanese の2リクエストに応答する Storefront モック。
   * en / ja に null を渡すとその言語のリクエストは失敗（ok=false）にする。
   */
  function makeBilingualFetch(
    appId: string,
    en: unknown | null,
    ja: unknown | null = en
  ): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes('l=japanese') ? ja : en;
      if (data === null) return { ok: false } as Response;
      return {
        ok: true,
        json: async () => ({ [appId]: { success: true, data } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('vol.15 FP-2 再発防止: RE Requiem — 部門名 vs 法人名の developer 単軸不一致では警告を出さない', async () => {
    const article = makeArticle({
      title: '『Resident Evil Requiem』シリーズ最新作が登場',
      category: 'newRelease',
      game: {
        title: 'Resident Evil Requiem',
        titleJa: 'Biohazard: Requiem',
        genre: ['Survival Horror'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2026-02-27',
        developer: 'Capcom Development Division 1',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/3764200' },
    });
    const fetchImpl = makeBilingualFetch(
      '3764200',
      {
        name: 'Resident Evil Requiem',
        release_date: { coming_soon: false, date: '26 Feb, 2026' },
        developers: ['CAPCOM Co., Ltd.'],
      },
      {
        name: 'BIOHAZARD requiem',
        release_date: { coming_soon: false, date: '2026年2月26日' },
        developers: ['CAPCOM Co., Ltd.'],
      }
    );

    // 旧実装は developer 単軸不一致で high → hidden 化していた（vol.15 障害）。
    // タイトル・年が一致（same）なら警告を出さない。
    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
  });

  it('別作品混入（title+year 両軸不一致）→ high game-source-mismatch（evidence 3軸付き）', async () => {
    const article = makeArticle({
      title: '新作『Project Trash』登場',
      category: 'newRelease',
      game: {
        title: 'Project Trash',
        genre: ['Action'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2026-07-10',
        developer: 'Trashbubu Studio',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/271590' },
    });
    const fetchImpl = makeBilingualFetch('271590', {
      name: 'Grand Theft Auto V',
      release_date: { coming_soon: false, date: '13 Apr, 2015' },
      developers: ['Rockstar North'],
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    const mismatch = warnings.find((w) => w.type === 'game-source-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('high');
    // 破壊的アクションのログ・レポートには evidence 3 軸を必ず含める（Issue #179 受け入れ基準）
    expect(mismatch?.message).toMatch(/title=disagree/);
    expect(mismatch?.message).toMatch(/year=disagree/);
    expect(mismatch?.evidence).toBeDefined();
  });

  it('Brick Game 事案（同名・年乖離）: 判定表 行2 により uncertain（medium）— hidden にはしない', async () => {
    // 旧実装では high mismatch → hidden だったが、同名年違いは
    // 原作年/移植年ズレ（リマスター等）と区別できないため破壊しない（Issue #179 行2 の設計判断）。
    // medium の game-source-uncertain としてレポートに evidence を残す。
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
    const fetchImpl = makeBilingualFetch('1087090', {
      name: 'Brick Game',
      release_date: { coming_soon: false, date: '2026年7月4日' },
      developers: ['Daniel Shimmyo'],
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings.filter((w) => w.type === 'game-source-mismatch')).toHaveLength(0);
    const uncertain = warnings.find((w) => w.type === 'game-source-uncertain');
    expect(uncertain).toBeDefined();
    expect(uncertain?.severity).toBe('medium');
    expect(uncertain?.message).toMatch(/year=disagree/);
  });

  it('整合ケース: title・releaseDate とも一致 → 警告なし', async () => {
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
    const fetchImpl = makeBilingualFetch('1087090', {
      name: 'Foo',
      release_date: { coming_soon: false, date: '2026年7月4日' },
      developers: ['Daniel Shimmyo'],
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
  });

  it('developer 不一致でも title+year が一致すれば警告なし（受託開発・部門名ゆれの FP 防止）', async () => {
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
    const fetchImpl = makeBilingualFetch('2222222', {
      name: 'Bar',
      release_date: { coming_soon: false, date: '2026年1月1日' },
      developers: ['Daniel Shimmyo'],
    });

    // 旧実装は developer 単軸不一致で high を出していたが、
    // company は弱シグナルであり title+year の一致（same）が優先される。
    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
  });

  it('共同開発: Steam の developers に複数社ありいずれかが一致しても same → 警告なし', async () => {
    const article = makeArticle({
      title: '新作『Elden Ring』',
      category: 'newRelease',
      game: {
        title: 'Elden Ring',
        genre: ['RPG'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2022-02-25',
        developer: 'FromSoftware',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/1245620' },
    });
    const fetchImpl = makeBilingualFetch('1245620', {
      name: 'ELDEN RING',
      release_date: { coming_soon: false, date: '2022年2月25日' },
      developers: ['Bandai Namco Studios', 'FromSoftware'],
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
  });

  it('coming_soon（未発売）の Steam 側発売年は照合しない（year=unknown → same。false positive 防止）', async () => {
    const article = makeArticle({
      title: '発売予定『Future Game』',
      category: 'newRelease',
      game: {
        title: 'Future Game',
        genre: ['Action'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2020-01-01', // 古い暫定日
        developer: 'Some Studio',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/5555555' },
    });
    // coming_soon=true で raw に年が含まれても照合しない
    const fetchImpl = makeBilingualFetch('5555555', {
      name: 'Future Game',
      release_date: { coming_soon: true, date: '2027' },
      developers: ['Some Studio'],
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
  });

  it('日本語名しか一致しない場合も title=agree（vol.15 FP-1 と同型の二言語照合）', async () => {
    const article = makeArticle({
      title: '『アサシン クリード ブラック フラッグ RE:シンクロ』登場',
      category: 'newRelease',
      game: {
        title: 'アサシン クリード ブラック フラッグ RE:シンクロ',
        genre: ['Action'],
        platforms: ['PC (Microsoft Windows)'],
        releaseDate: '2026-07-09',
        developer: 'Ubisoft',
      },
      sourceUrls: { steam: 'https://store.steampowered.com/app/3751950' },
    });
    const fetchImpl = makeBilingualFetch(
      '3751950',
      {
        name: "Assassin's Creed Black Flag Resynced",
        release_date: { coming_soon: false, date: 'Jul 9, 2026' },
        developers: ['Ubisoft'],
      },
      {
        name: 'アサシン クリード ブラック フラッグ RE:シンクロ',
        release_date: { coming_soon: false, date: '2026年7月9日' },
        developers: ['Ubisoft'],
      }
    );

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings).toHaveLength(0);
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
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
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

    const warnings = await validateGameSourceConsistency(article, fetchMock as unknown as typeof fetch);
    expect(warnings).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Steam URL は stores[] からも抽出できる（同名年乖離 → uncertain が出ることで確認）', async () => {
    const article = makeArticle({
      title: '『Old』',
      category: 'indie',
      game: {
        title: 'Old Game Title',
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
    const fetchImpl = makeBilingualFetch('4444444', {
      name: 'Old Game Title',
      release_date: { coming_soon: false, date: '2026年3月1日' },
    });

    const warnings = await validateGameSourceConsistency(article, fetchImpl);
    expect(warnings.some((w) => w.type === 'game-source-uncertain')).toBe(true);
  });
});

describe('validateReleasedTitleExpression', () => {
  const publishDate = new Date('2026-07-10');

  it('発売済みタイトルの見出しに「発表」が含まれる場合に high 警告を出す（Issue #181 再現）', () => {
    const article = makeArticle({
      title: "Trashbubu Studio新作『Project Trash』発表、注目のインディー開発スタジオが放つ次回作",
      category: 'newRelease',
      game: {
        title: 'Project Trash',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-07-10',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('released-title-expression');
    expect(warnings[0].severity).toBe('high');
  });

  it('発売済みタイトルの見出しに「次回作」が含まれる場合に high 警告を出す', () => {
    const article = makeArticle({
      title: "名スタジオの次回作『Awesome Game』近日登場",
      category: 'indie',
      game: {
        title: 'Awesome Game',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-07-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('high');
  });

  it('発売済みタイトルの見出しに「発売前」が含まれる場合に high 警告を出す', () => {
    const article = makeArticle({
      title: "発売前情報まとめ『Project Trash』の注目ポイント",
      category: 'newRelease',
      game: {
        title: 'Project Trash',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-07-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('released-title-expression');
  });

  it('「発表会」は発売済みゲームの正当な見出し語のため警告しない（false-positive 防止）', () => {
    const article = makeArticle({
      title: "『Game X』発表会レポート：開発陣が語るゲームデザイン",
      category: 'newRelease',
      game: {
        title: 'Game X',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-06-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(0);
  });

  it('発売済みタイトルの見出しが適切な表現なら警告しない', () => {
    const article = makeArticle({
      title: "Trashbubu Studioの新作『Project Trash』発売中、独自メカニクスが光るアクションADV",
      category: 'newRelease',
      game: {
        title: 'Project Trash',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-07-10',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(0);
  });

  it('発売予定タイトルの見出しに「発表」があっても警告しない', () => {
    const article = makeArticle({
      title: "大型タイトル『Future Game』正式発表、2027年発売予定",
      category: 'newRelease',
      game: {
        title: 'Future Game',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2027-01-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(0);
  });

  it('publishDate が渡されない場合はチェックをスキップする', () => {
    const article = makeArticle({
      title: "新作『Project Trash』発表",
      category: 'newRelease',
      game: {
        title: 'Project Trash',
        genre: [],
        platforms: ['PC (Steam)'],
        releaseDate: '2026-07-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, undefined);
    expect(warnings).toHaveLength(0);
  });

  it('feature 記事は対象外', () => {
    const article = makeArticle({
      title: '今週の特集記事：話題の新作発表まとめ',
      category: 'feature',
      game: {
        title: 'Feature Game',
        genre: [],
        platforms: [],
        releaseDate: '2026-07-01',
      },
    });

    const warnings = validateReleasedTitleExpression(article, publishDate);
    expect(warnings).toHaveLength(0);
  });
});
