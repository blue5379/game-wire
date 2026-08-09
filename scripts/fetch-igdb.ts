/**
 * IGDB API データ取得スクリプト
 * ゲームメタデータ（ジャンル、プラットフォーム、画像等）を取得
 */

import type { IGDBGame, IGDBData, FetchResult } from './types.js';
import { meetsClassicPoolThresholds, readClassicTotalRatingMin, readClassicTotalRatingCountMin } from './classic-pool.js';

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_URL = 'https://api.igdb.com/v4';

// IGDB API フィルタ定数（クエリビルダで使用）
const IGDB_THEME_EROTIC = 42;     // 成人向けコンテンツ（Erotic theme）
const IGDB_GAME_TYPE_MAIN = 0;    // Main Game（DLC・エディション違い・バンドルを除外）
const IGDB_GAME_TYPE_REMAKE = 8;  // Remake（新作枠の母集団クエリでのみ許可、§6.2）
const IGDB_GAME_TYPE_REMASTER = 9; // Remaster（新作枠の母集団クエリでのみ許可、§6.2）

/**
 * IGDB クエリで共通使用するフィルタ文字列を生成
 * 成人向けコンテンツ除外 & 指定した game_type のみに限定
 *
 * @param options.gameTypes 許可する game_type の配列（省略時は [IGDB_GAME_TYPE_MAIN] = Main Game のみ）
 *   要素数によらず常に `game_type = (N,M,...)` の括弧付き形式を生成する
 */
function buildIgdbCommonFilters(options?: { gameTypes?: number[] }): string {
  const gameTypes = options?.gameTypes ?? [IGDB_GAME_TYPE_MAIN];
  if (gameTypes.length === 0) {
    throw new Error('buildIgdbCommonFilters: gameTypes must not be empty');
  }
  return `game_type = (${gameTypes.join(',')}) & themes != (${IGDB_THEME_EROTIC})`;
}

// キャッシュ用（同一セッション内でのトークン再利用）
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// 日本語タイトル→英語タイトルのマッピング（よく知られたゲーム）
const JAPANESE_TO_ENGLISH_TITLES: Record<string, string> = {
  'マインクラフト': 'Minecraft',
  'マイクラ': 'Minecraft',
  'フォートナイト': 'Fortnite',
  'エーペックスレジェンズ': 'Apex Legends',
  'エーペックス': 'Apex Legends',
  'ゼルダの伝説': 'The Legend of Zelda',
  'ポケモン': 'Pokemon',
  'ポケットモンスター': 'Pokemon',
  'スプラトゥーン': 'Splatoon',
  'どうぶつの森': 'Animal Crossing',
  'あつまれどうぶつの森': 'Animal Crossing: New Horizons',
  'あつ森': 'Animal Crossing: New Horizons',
  '原神': 'Genshin Impact',
  '崩壊スターレイル': 'Honkai: Star Rail',
  'スタレ': 'Honkai: Star Rail',
  'ファイナルファンタジー': 'Final Fantasy',
  'ドラゴンクエスト': 'Dragon Quest',
  'ドラクエ': 'Dragon Quest',
  'モンスターハンター': 'Monster Hunter',
  'モンハン': 'Monster Hunter',
  'バイオハザード': 'Resident Evil',
  'ストリートファイター': 'Street Fighter',
  'スト': 'Street Fighter',
  'デビルメイクライ': 'Devil May Cry',
  'ダークソウル': 'Dark Souls',
  'エルデンリング': 'Elden Ring',
  '鉄拳': 'Tekken',
  'グランツーリスモ': 'Gran Turismo',
  'メタルギア': 'Metal Gear',
  'ペルソナ': 'Persona',
  '龍が如く': 'Yakuza',
  'スーパーマリオ': 'Super Mario',
  'マリオカート': 'Mario Kart',
  '大乱闘スマッシュブラザーズ': 'Super Smash Bros.',
  'スマブラ': 'Super Smash Bros.',
  'カービィ': 'Kirby',
  'メトロイド': 'Metroid',
  'ファイアーエムブレム': 'Fire Emblem',
  'ゼノブレイド': 'Xenoblade',
  'ピクミン': 'Pikmin',
  '星のカービィ': 'Kirby',
  'キングダムハーツ': 'Kingdom Hearts',
  'テイルズ': 'Tales of',
  'アーマードコア': 'Armored Core',
  'エースコンバット': 'Ace Combat',
  'ソニック': 'Sonic the Hedgehog',
  'ぷよぷよ': 'Puyo Puyo',
  '龍が如く8': 'Like a Dragon: Infinite Wealth',
  'パルワールド': 'Palworld',
};

// ISO 3166-1 数値コード → alpha-2 コードのマッピング（全195カ国）
// IGDBはISO 3166-1数値コードを使用するが、Intl.DisplayNamesはalpha-2を受け取るため変換が必要
const NUMERIC_TO_ALPHA2: Record<number, string> = {
  4: 'AF', 8: 'AL', 12: 'DZ', 20: 'AD', 24: 'AO', 28: 'AG', 32: 'AR', 36: 'AU',
  40: 'AT', 44: 'BS', 48: 'BH', 50: 'BD', 52: 'BB', 56: 'BE', 64: 'BT', 68: 'BO',
  70: 'BA', 72: 'BW', 76: 'BR', 96: 'BN', 100: 'BG', 104: 'MM', 108: 'BI',
  112: 'BY', 116: 'KH', 120: 'CM', 124: 'CA', 132: 'CV', 140: 'CF', 144: 'LK',
  148: 'TD', 152: 'CL', 156: 'CN', 170: 'CO', 174: 'KM', 178: 'CG', 180: 'CD',
  188: 'CR', 191: 'HR', 192: 'CU', 196: 'CY', 203: 'CZ', 204: 'BJ', 208: 'DK',
  212: 'DM', 214: 'DO', 218: 'EC', 222: 'SV', 226: 'GQ', 231: 'ET', 232: 'ER',
  233: 'EE', 242: 'FJ', 246: 'FI', 250: 'FR', 266: 'GA', 268: 'GE', 270: 'GM',
  276: 'DE', 288: 'GH', 292: 'GI', 300: 'GR', 308: 'GD', 320: 'GT', 324: 'GN',
  328: 'GY', 332: 'HT', 340: 'HN', 344: 'HK', 348: 'HU', 356: 'IN', 360: 'ID',
  364: 'IR', 368: 'IQ', 372: 'IE', 376: 'IL', 380: 'IT', 384: 'CI', 388: 'JM',
  392: 'JP', 400: 'JO', 398: 'KZ', 404: 'KE', 408: 'KP', 410: 'KR', 414: 'KW',
  417: 'KG', 418: 'LA', 422: 'LB', 426: 'LS', 428: 'LV', 430: 'LR', 434: 'LY',
  438: 'LI', 440: 'LT', 442: 'LU', 450: 'MG', 454: 'MW', 458: 'MY', 462: 'MV',
  466: 'ML', 470: 'MT', 478: 'MR', 480: 'MU', 484: 'MX', 496: 'MN', 498: 'MD',
  492: 'MC', 504: 'MA', 508: 'MZ', 516: 'NA', 524: 'NP', 528: 'NL', 554: 'NZ',
  558: 'NI', 562: 'NE', 566: 'NG', 578: 'NO', 512: 'OM', 586: 'PK', 591: 'PA',
  598: 'PG', 600: 'PY', 604: 'PE', 608: 'PH', 616: 'PL', 620: 'PT', 634: 'QA',
  642: 'RO', 643: 'RU', 646: 'RW', 659: 'KN', 662: 'LC', 670: 'VC', 882: 'WS',
  674: 'SM', 678: 'ST', 682: 'SA', 686: 'SN', 694: 'SL', 703: 'SK', 705: 'SI',
  706: 'SO', 710: 'ZA', 724: 'ES', 729: 'SD', 740: 'SR', 752: 'SE',
  756: 'CH', 760: 'SY', 762: 'TJ', 764: 'TH', 768: 'TG', 776: 'TO', 780: 'TT',
  788: 'TN', 792: 'TR', 795: 'TM', 800: 'UG', 804: 'UA', 784: 'AE', 826: 'GB',
  834: 'TZ', 840: 'US', 858: 'UY', 860: 'UZ', 548: 'VU', 862: 'VE', 704: 'VN',
  887: 'YE', 894: 'ZM', 716: 'ZW', 158: 'TW', 499: 'ME',
  688: 'RS', 807: 'MK', 90: 'SB',
};

const _displayNames = new Intl.DisplayNames(['ja'], { type: 'region' });

// Intl.DisplayNames の正式名称を読みやすい通称に上書きするマッピング
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'アメリカ合衆国': 'アメリカ',
  '大韓民国': '韓国',
  '朝鮮民主主義人民共和国': '北朝鮮',
  'ロシア連邦': 'ロシア',
  'ボリビア多民族国': 'ボリビア',
  'タンザニア連合共和国': 'タンザニア',
  'コンゴ民主共和国': 'コンゴ（民主共和国）',
  'コンゴ共和国': 'コンゴ（共和国）',
  'ミャンマー（ビルマ）': 'ミャンマー',
  'バチカン市国': 'バチカン',
};

/**
 * game_localizations から日本語タイトルを抽出（region=3: Japan）
 */
function extractJapaneseLocalization(
  localizations?: { name: string; region?: number }[]
): string | undefined {
  return localizations?.find((loc) => loc.region === 3)?.name;
}

/**
 * 国コードを国名に変換
 */
function getCountryName(countryCode: number | undefined): string | undefined {
  if (!countryCode) return undefined;
  const alpha2 = NUMERIC_TO_ALPHA2[countryCode];
  if (!alpha2) {
    console.warn(`  [IGDB] Unknown country code: ${countryCode}`);
    return undefined;
  }
  try {
    const name = _displayNames.of(alpha2);
    if (!name) return undefined;
    return DISPLAY_NAME_OVERRIDES[name] ?? name;
  } catch {
    console.warn(`  [IGDB] Failed to resolve country name for alpha2: ${alpha2}`);
    return undefined;
  }
}

/**
 * 国コードを国名に変換（外部からエクスポート用）
 */
export function getCountryNameFromCode(countryCode: number | undefined): string | undefined {
  return getCountryName(countryCode);
}

/**
 * 日本語タイトルを英語に変換（マッピングがあれば）
 */
function translateToEnglish(title: string): string {
  // 完全一致をチェック
  if (JAPANESE_TO_ENGLISH_TITLES[title]) {
    return JAPANESE_TO_ENGLISH_TITLES[title];
  }

  // 部分一致をチェック（タイトルに含まれる場合）
  for (const [jpTitle, enTitle] of Object.entries(JAPANESE_TO_ENGLISH_TITLES)) {
    if (title.includes(jpTitle)) {
      return title.replace(jpTitle, enTitle);
    }
  }

  return title;
}

/**
 * 無効な検索クエリかどうかをチェック
 */
function isInvalidSearchQuery(query: string): boolean {
  // ハッシュタグやメンションで始まる
  if (query.startsWith('#') || query.startsWith('@')) {
    return true;
  }

  // 短すぎる
  if (query.length < 3) {
    return true;
  }

  // 一般的すぎるワード
  const genericPatterns = [
    /^(game|gaming|ゲーム|実況|プレイ|配信|live|shorts?|vtuber)$/i,
    /^(新作|おすすめ|最新|人気|話題)$/i,
    /^(pc|ps[45]?|xbox|switch|steam)$/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(query)) {
      return true;
    }
  }

  return false;
}

/**
 * IGDBクエリ文字列に埋め込む検索ワードをサニタイズ
 * セミコロン（クエリ区切り文字）・バックスラッシュ・制御文字を除去し、100文字に制限する
 */
function sanitizeIgdbSearchTerm(term: string): string {
  return term
    .replace(/[\x00-\x1F\x7F]/g, '') // 制御文字除去
    .replace(/[;\\]/g, '')            // セミコロン・バックスラッシュ除去
    .slice(0, 100)                    // 最大100文字
    .trim();
}

// 単語マッチング判定で除外する英語のstopword
// "The Legend of You" と "The Legend of Heroes: Trails in the Sky" のように
// 共通単語が the/of/legend のような汎用語のみで一致してしまうのを防ぐ
const ENGLISH_STOPWORDS = new Set([
  'the', 'of', 'in', 'on', 'at', 'an', 'and', 'or', 'to', 'for',
  'with', 'is', 'by', 'a', 'as', 'be', 'it',
  // ゲーム名で頻出のジャンル/汎用語（単独一致では同一性根拠にならない）
  'legend', 'legends', 'tales', 'story', 'world', 'war', 'wars',
  'game', 'games', 'edition', 'remake', 'remaster', 'remastered',
]);

/**
 * 検索結果が検索クエリに対して妥当かどうかをチェック
 *
 * 厳格化ポリシー（Issue #50対策）:
 * - 完全一致 / 部分文字列一致は従来どおり許容
 * - 単語重複判定では stopword（the/of/legend など）を除外
 * - stopword 以外の意味語が **2語以上** 共通する場合のみ一致とみなす
 * - 1語のみ共通の場合は、その語が短いクエリ全体の主要部分を占める場合に限り許容
 */
function isRelevantSearchResult(query: string, resultName: string): boolean {
  const normalizedQuery = query.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const normalizedResult = resultName.toLowerCase().replace(/[^\w\s]/g, '').trim();

  // 完全一致
  if (normalizedQuery === normalizedResult) {
    return true;
  }

  // 部分一致（検索クエリが結果に含まれる、または逆）
  if (normalizedQuery.length >= 3 && normalizedResult.includes(normalizedQuery)) {
    return true;
  }
  if (normalizedResult.length >= 3 && normalizedQuery.includes(normalizedResult)) {
    return true;
  }

  // 単語の重複をチェック（stopwordを除外）
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 0);
  const resultWords = new Set(normalizedResult.split(/\s+/));
  const queryContent = queryWords.filter(
    (w) => w.length > 2 && !ENGLISH_STOPWORDS.has(w)
  );
  const commonContent = queryContent.filter((w) => resultWords.has(w));

  // クエリ側に意味語が無い場合は判定不能 → 拒絶
  if (queryContent.length === 0) {
    return false;
  }

  // 意味語が2語以上共通: 一致と判定
  if (commonContent.length >= 2) {
    return true;
  }

  // 意味語が1語のみ共通: クエリ全体がその1語のみで構成される場合（"Balatro" 等）
  // のみ許容。複数語クエリで1語しか一致しない場合は別作品の可能性が高いので拒絶。
  if (commonContent.length === 1 && queryContent.length === 1) {
    return true;
  }

  return false;
}

/**
 * IGDB websites の種別コード（Issue #234）
 *
 * IGDB API は `websites.category` を返さなくなり `websites.type` に改名された。
 * 2026-08-09 実測（website_types エンドポイント）:
 * 1=Official Website, 2=Community Wiki, 3=Wikipedia, 4=Facebook, 5=Twitter,
 * 6=Twitch, 8=Instagram, 9=YouTube, 10=App Store (iPhone), 11=App Store (iPad),
 * 12=Google Play, 13=Steam, 14=Subreddit, 15=Itch, 16=Epic, 17=GOG, 18=Discord,
 * 19=Bluesky, 22=Xbox, 23=Playstation, 24=Nintendo, 25=Meta, 26=GameJolt
 * （7・20・21 は欠番）。
 * 同日の母集団サンプル（直近発売50件）では type===1 あり=14件 / category===1 あり=0件で、
 * `category` が実質的に返らなくなっていることを確認済み。
 */
export const IGDB_WEBSITE_TYPE = {
  OFFICIAL: 1,
  STEAM: 13,
} as const;

/**
 * IGDB websites 配列から公式サイトURLを推定
 *
 * Issue #117: 「block-list（怪しければ落とす）」から「allow-list（確証された場合のみ採用）」へ転換。
 * type=1 (Official website) フラグが付いた URL のみ採用する。
 *
 * Issue #234: IGDB API が `websites.category` を返さなくなり `websites.type` に改名された
 * （2026-08-09 実測）。`type` を主に見て、`category` は後方互換のため残す。
 * pickSteamUrlFromWebsites と異なり、こちらは URL 部分一致によるフォールバックを持たない。
 * `type`/`category` のどちらも「公式タグ」判定であり、タグ無しURLを拾う経路は存在しない
 * （#117 の allow-list 方針を維持するため意図的に追加しない）。
 *
 * 過去のフォールバック（非SNS・非ストアの先頭URLを機械採用）は無関係なスタジオサイト
 * （例: Dungeon Blitz R に対する theminesa.studio）を採用してしまう構造的欠陥があったため廃止。
 * 公式URLが取得できない場合は undefined を返し、Tavily 経路（fetchOfficialJpUrl）に委ねる。
 */
function pickOfficialUrlFromWebsites(
  websites?: { url: string; category?: number; type?: number }[]
): string | undefined {
  if (!websites?.length) return undefined;
  return websites.find(
    (w) => w.type === IGDB_WEBSITE_TYPE.OFFICIAL || w.category === IGDB_WEBSITE_TYPE.OFFICIAL
  )?.url;
}

/**
 * IGDB websites 配列から Steam ストア URL を抽出する共通ヘルパ（§3.6）。
 *
 * IGDB API は `websites.category` を返さなくなっており `websites.type` に改名されている
 * （2026-08-08 実測: 母集団クエリ60件で category===13 の一致は0件、type===13 なら取れる）。
 * type を最優先で見て、category は後方互換のため残し、どちらのタグも無い場合は
 * URL文字列の部分一致でフォールバックする。
 *
 * mapRawGameToIGDBGame（検索経路）と mapPoolRawGameToIGDBGame（母集団クエリ5種:
 * 発売済み(hypes版)・発売済み(rating_count版)・未発売・名作・インディーが共有する変換関数）の
 * 計2箇所（呼び出し元は実質5クエリ）で使用する。
 *
 * 2パスで探索する: ①まず IGDB_WEBSITE_TYPE.STEAM（13）が type または category に付いた
 * タグ付き URL を探す ②見つからなければ URL 部分一致（store.steampowered.com）でフォールバックする。
 * 1つの find で OR 判定すると配列の先頭に来た要素が無条件で勝ってしまい、無タグの
 * Steam ドメイン URL（バンドル・サウンドトラック・デモのページ等）が、後ろにある
 * タグ付きの正しいストア URL より先に拾われてしまう。2パスにすることで、タグ付き URL が
 * 存在する限り常にそちらを優先し、無タグ URL に先を越されないようにする。
 */
export function pickSteamUrlFromWebsites(
  websites?: { url: string; category?: number; type?: number }[]
): string | undefined {
  if (!websites?.length) return undefined;

  const tagged = websites.find(
    (w) => w.type === IGDB_WEBSITE_TYPE.STEAM || w.category === IGDB_WEBSITE_TYPE.STEAM
  );
  if (tagged) return tagged.url;

  return websites.find((w) => w.url.includes('store.steampowered.com'))?.url;
}

/**
 * IGDB games エンドポイントの生レスポンス（メタデータ取得に使う共通フィールド一式）
 */
interface IGDBRawGame {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  genres?: { name: string }[];
  platforms?: { name: string }[];
  first_release_date?: number;
  involved_companies?: {
    company: { name: string; country?: number; developed?: number[] };
    developer: boolean;
    publisher: boolean;
  }[];
  cover?: { url: string };
  screenshots?: { url: string }[];
  rating?: number;
  rating_count?: number;
  game_localizations?: { name: string; region?: number }[];
  websites?: { url: string; category?: number; type?: number }[];
  /** ゲーム種別（0=Main Game, 8=Remake, 9=Remaster）。新作枠のリメイク明記に使う（§6.2） */
  game_type?: number;
  /** 批評スコア集計（Metacritic 相当） */
  aggregated_rating?: number;
  /** 批評スコアの集計媒体数 */
  aggregated_rating_count?: number;
  /** IGDB キーワード（ファンゲーム判定に使う、§6.1） */
  keywords?: { id: number; slug: string }[];
  /** 総合評価（批評+ユーザーの合成値）。名作枠の母集団条件に使う（§5.4） */
  total_rating?: number;
  /** 総合評価の評価母数。名作枠の母集団条件・並び順に使う（§5.4/§5.8） */
  total_rating_count?: number;
  /** 原作ゲーム（リメイク・リマスターの親）。J-3-e 判定に使う（§5.5） */
  parent_game?: { id: number; game_type?: number; total_rating?: number; total_rating_count?: number };
}

// searchGameByName / searchGameBySteamAppId 共通で使う fields 一覧
const IGDB_GAME_FIELDS = `name, slug, summary, genres.name, platforms.name,
       first_release_date, involved_companies.company.name,
       involved_companies.developer, involved_companies.publisher,
       involved_companies.company.developed,
       cover.url, screenshots.url, rating, rating_count,
       involved_companies.company.country,
       game_localizations.name, game_localizations.region,
       websites.url, websites.category, websites.type,
       game_type, aggregated_rating, aggregated_rating_count, keywords.slug,
       total_rating, total_rating_count,
       parent_game.game_type, parent_game.total_rating, parent_game.total_rating_count`;

/**
 * J-3-e（§5.5決着）: game_type が 8（Remake）/9（Remaster）のリメイク・リマスターについて、
 * 名作枠の母集団に含めてよいか（classicRemakeEligible）を判定する共通ヘルパ。
 * mapRawGameToIGDBGame（検索経路）と mapPoolRawGameToIGDBGame（母集団クエリ5種共通）の
 * 両方から呼ばれる。
 *
 * 判定ルール:
 * - `gameType` が 8 または 9 **でない**場合は `undefined`（リメイクではないので無関係）
 * - `gameType` が 8/9 の場合: **親（parent_game）が §5.4 の母集団条件
 *   （total_rating >= 閾値 & total_rating_count >= 閾値 & game_type = 0）を満たさない**なら
 *   `true`（原作が母集団に居ない＝リメイクを許可）、満たすなら `false`（原作が母集団に居る＝
 *   リメイクは不要）
 * - 親の情報が取れない場合（`parent_game` 自体が無い）は `true`
 *   （原作が特定できない＝母集団に原作が居ることを示せないため許可する）
 *
 * 親の判定は `total_rating` / `total_rating_count` に加えて **`game_type === IGDB_GAME_TYPE_MAIN`
 * （0）も見る**。§5.4 の母集団条件は `total_rating >= 閾値 & total_rating_count >= 閾値 &
 * game_type = 0 & themes != (42)` であり、`game_type = 0` を落とすと誤判定する
 * （実測: `Final Fantasy VII Remake` の親 `Final Fantasy VII` は `total_rating=87.8,
 * total_rating_count=1630` と閾値を超えるが `game_type=10`（拡張版扱い）で母集団外。
 * `game_type` を見ずに判定すると誤って「母集団内」＝リメイク除外と判定してしまう。
 * レビューで検出・修正）。
 *
 * `themes != (42)` は判定に含めない（親が `themes=42`（成人向け）を含む t8/t9 は実測 0 件で
 * 判定結果に影響しないことを管理者が確認済み）。
 *
 * ⚠️ 非対称性の注意: この関数自体は「わからない場合は true」（許可側）に倒れるが、
 * **選定側（fetch-data.ts の isClassicRemakeAllowed）では `undefined` を「除外」として扱う**。
 * これは、この関数が正しく呼ばれた前提での「原作を特定できないなら許可」という判定と、
 * 選定側でフィールドの転記漏れ（バグ）が起きた場合に安全側（リメイクを載せない方向）に
 * 倒すための判定は目的が異なるため。転記漏れが起きても記事に出ないようにするのが選定側の責務。
 */
function computeClassicRemakeEligible(
  gameType: number | undefined,
  parentGame: { game_type?: number; total_rating?: number; total_rating_count?: number } | undefined
): boolean | undefined {
  if (gameType !== IGDB_GAME_TYPE_REMAKE && gameType !== IGDB_GAME_TYPE_REMASTER) {
    return undefined;
  }
  if (!parentGame) return true;
  const parentInPool =
    parentGame.game_type === IGDB_GAME_TYPE_MAIN &&
    meetsClassicPoolThresholds(parentGame.total_rating, parentGame.total_rating_count);
  return !parentInPool;
}

/**
 * IGDB games の生レスポンスを IGDBGame に変換する共通ロジック
 *
 * 名前検索（searchGameByName）と appId 逆引き（searchGameBySteamAppId）で
 * 同一の変換（involved_companies 抽出・画像URL整形・国名変換・steamUrl/officialUrl 抽出）を使う。
 */
function mapRawGameToIGDBGame(game: IGDBRawGame): IGDBGame {
  // 開発会社と販売会社、国情報を抽出
  let developer: string | undefined;
  let publisher: string | undefined;
  let developerCountry: number | undefined;
  // developer 側の developed 件数のみ拾う（規模判定用、§3.4）。publisher 側は拾わない。
  let developerGameCount: number | undefined;

  if (game.involved_companies) {
    for (const ic of game.involved_companies) {
      if (ic.developer && !developer) {
        developer = ic.company.name;
        developerCountry = ic.company.country;
        developerGameCount = ic.company.developed?.length;
      }
      if (ic.publisher && !publisher) {
        publisher = ic.company.name;
      }
    }
  }

  // 画像URLを高解像度に変換
  const formatImageUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    // t_thumb を t_cover_big に変換
    return url.replace('t_thumb', 't_cover_big').replace('//', 'https://');
  };

  const formatScreenshotUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    return url.replace('t_thumb', 't_screenshot_big').replace('//', 'https://');
  };

  // 国コードを日本語名に変換
  const developerCountryName = getCountryName(developerCountry);

  const officialUrl = pickOfficialUrlFromWebsites(game.websites);

  return {
    id: game.id,
    name: game.name,
    titleJa: extractJapaneseLocalization(game.game_localizations),
    slug: game.slug,
    summary: game.summary,
    genres: game.genres?.map((g) => g.name),
    platforms: game.platforms?.map((p) => p.name),
    releaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
      : undefined,
    developer,
    publisher,
    developerCountry: developerCountryName,
    developerGameCount,
    coverUrl: formatImageUrl(game.cover?.url),
    screenshotUrls: game.screenshots
      ?.map((s) => formatScreenshotUrl(s.url))
      .filter((url): url is string => url !== undefined),
    rating: game.rating,
    ratingCount: game.rating_count,
    steamUrl: pickSteamUrlFromWebsites(game.websites),
    officialUrl,
    officialUrlSource: officialUrl ? 'igdb-official' : undefined,
    websites: game.websites?.map((w) => ({ url: w.url, category: w.category, type: w.type })),
    gameType: game.game_type,
    aggregatedRating: game.aggregated_rating,
    aggregatedRatingCount: game.aggregated_rating_count,
    keywords: game.keywords?.map((k) => k.slug),
    totalRating: game.total_rating,
    totalRatingCount: game.total_rating_count,
    classicRemakeEligible: computeClassicRemakeEligible(game.game_type, game.parent_game),
  };
}

/**
 * JST（日本時間）当日 0 時の Unix 秒を算出する（§11.1 確定事項 #6）。
 *
 * 発売済み／未発売の境界として使う純関数。`now` を引数で注入できるようにし、
 * テストで日境界をまたぐ挙動を検証できるようにする（既定値は `new Date()`）。
 *
 * 算出式は `docs/article-category-spec-review.md` §11.1 確定事項 #6 で確定済み:
 * `Math.floor((nowSec + 9*3600) / 86400) * 86400 - 9*3600`
 */
export function getJstDayStartUnixSec(now: Date = new Date()): number {
  const nowSec = Math.floor(now.getTime() / 1000);
  const JST_OFFSET_SEC = 9 * 3600;
  return Math.floor((nowSec + JST_OFFSET_SEC) / 86400) * 86400 - JST_OFFSET_SEC;
}

// テスト用にエクスポート
export const __test = {
  isRelevantSearchResult,
  pickOfficialUrlFromWebsites,
  mapRawGameToIGDBGame,
  mapPoolRawGameToIGDBGame,
  buildIgdbCommonFilters,
};

/**
 * Twitch OAuth2 アクセストークンを取得
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  // キャッシュチェック
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch(`${TWITCH_AUTH_URL}?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json();

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 1分余裕を持たせる
  };

  return cachedToken.accessToken;
}

/**
 * IGDB API リクエスト
 */
async function igdbRequest<T>(
  endpoint: string,
  body: string,
  clientId: string,
  accessToken: string
): Promise<T[]> {
  const response = await fetch(`${IGDB_API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`IGDB API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * ゲーム名で検索してメタデータを取得
 */
// 同名異作品を区別するための発売年差の閾値（±N年）
// 第2層: 既知の発売年と検索結果の発売年が大きく異なる場合は別作品として拒絶
const SEARCH_YEAR_TOLERANCE = 3;

export async function searchGameByName(
  name: string,
  clientId: string,
  accessToken: string,
  options?: { expectedYear?: number; mainGameOnly?: boolean }
): Promise<IGDBGame | null> {
  try {
    // 無効な検索クエリはスキップ
    if (isInvalidSearchQuery(name)) {
      console.log(`  IGDB search skipped (invalid query): "${name}"`);
      return null;
    }

    // 日本語タイトルを英語に変換し、クエリインジェクション対策でサニタイズ
    const searchName = sanitizeIgdbSearchTerm(translateToEnglish(name));
    console.log(`  IGDB search: "${name}" -> "${searchName}"`);

    if (!searchName || searchName.length < 2) {
      console.log(`  IGDB search skipped (empty after sanitize): "${name}"`);
      return null;
    }

    // ゲーム検索。mainGameOnly: true のときのみ成人向け除外 & Main Game 限定を
    // 共通ヘルパで適用する（Issue #208: この関数は特集経路以外（メタデータ補完）
    // からも呼ばれるため、既定ではフィルタを付けない＝修正前と同一挙動を維持する）。
    const whereClause = options?.mainGameOnly
      ? `\n      where ${buildIgdbCommonFilters()};`
      : '';
    const query = `
      search "${searchName.replace(/"/g, '\\"')}";
      fields ${IGDB_GAME_FIELDS};${whereClause}
      limit 1;
    `;

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    if (games.length === 0) return null;

    const game = games[0];

    // 検索結果が検索クエリに対して妥当かチェック
    if (!isRelevantSearchResult(searchName, game.name)) {
      console.log(`  IGDB search result not relevant: "${name}" -> "${game.name}" (skipped)`);
      return null;
    }

    // 第2層: 期待する発売年が指定されている場合、検索結果の発売年が大きく異なれば
    // 同名異作品とみなして拒絶する（両方の年が判明している場合のみ照合）
    if (options?.expectedYear !== undefined && game.first_release_date !== undefined) {
      const resultYear = new Date(game.first_release_date * 1000).getUTCFullYear();
      if (Math.abs(resultYear - options.expectedYear) > SEARCH_YEAR_TOLERANCE) {
        console.log(
          `  IGDB search result year mismatch: "${name}" -> "${game.name}" (expected ${options.expectedYear}, got ${resultYear}, skipped)`
        );
        return null;
      }
    }

    return mapRawGameToIGDBGame(game);
  } catch (error) {
    console.error(`Failed to search game "${name}":`, error);
    return null;
  }
}

/**
 * Steam appId で IGDB を逆引きしてメタデータを取得（Issue #166 ①）
 *
 * 安定した外部ID（Steam appId）は「名前の類似」より強い同一性シグナルであるため、
 * appId が判明しているゲームはこの逆引きを第一級の手段とする。同名異作品が
 * 名前検索で混入する問題（Issue #166: Brick Game）を原理的に防ぐ。
 *
 * 実装メモ（実機確認済み）:
 * - IGDB v4 では external_games の `category` フィルタは deprecated で機能しない。
 *   Steam を示すには `external_game_source = 1` を使う（実機で疎通確認済み）。
 * - games エンドポイントに external_games ネストフィルタをかけ、逆引きとメタ取得を
 *   1リクエストで済ませる（IGDB 呼び出し回数を純増させないため）。
 * - appId 一致は名前より強いシグナルなので、名前一致チェック（isRelevantSearchResult）も
 *   年ゲート（SEARCH_YEAR_TOLERANCE）も適用しない（表記ゆれで正しい結果を捨てないため）。
 * - 見つからなければ null を返す（呼び出し元は名前検索へフォールバック）。
 */
export async function searchGameBySteamAppId(
  appId: number,
  clientId: string,
  accessToken: string
): Promise<IGDBGame | null> {
  try {
    // クエリ文字列に埋め込む前に明示的に文字列化（一貫性・インジェクション対策）
    const uid = String(appId).replace(/[^0-9]/g, '');
    if (uid.length === 0) return null;

    // Steam を示す external_game_source=1 で逆引き（category は deprecated のため不使用）
    const query = `
      fields ${IGDB_GAME_FIELDS};
      where external_games.external_game_source = 1 & external_games.uid = "${uid}";
      limit 1;
    `;

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    if (games.length === 0) return null;

    const result = mapRawGameToIGDBGame(games[0]);
    // appId 逆引きで確定した結果は、その appId が同一性の根拠。
    // IGDB の websites テーブルに Steam リンクが登録されていない場合でも、
    // 逆引きに使った appId から steamUrl を補完しておく。これにより下流の
    // enrichGameFromIgdb で sameByAppId が成立し、Steam名と IGDB名の表記ゆれで
    // 正しい結果が捨てられるのを防ぐ（Issue #166 コードレビュー指摘）。
    if (!result.steamUrl) {
      result.steamUrl = `https://store.steampowered.com/app/${uid}`;
    }
    return result;
  } catch (error) {
    console.error(`Failed to reverse-lookup game by Steam appId "${appId}":`, error);
    return null;
  }
}

/**
 * 複数のゲーム名を検索
 */
export async function searchMultipleGames(
  names: string[],
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  const results: IGDBGame[] = [];

  for (const name of names) {
    const game = await searchGameByName(name, clientId, accessToken);
    if (game) {
      results.push(game);
    }
    // レート制限対策
    await new Promise((r) => setTimeout(r, 250));
  }

  return results;
}

// 母集団クエリ（fetchRecentPopularGames / fetchRecentPopularGamesByRatingCount /
// fetchUpcomingGames / fetchClassicGames / fetchIndieGames）で共有する fields 一覧。
// 5クエリすべてが同じ内容を持つことで枠によってフィールドが欠けて下流の挙動が
// 変わる事故を防ぐ（PR-B / PR-I の教訓）。
export const IGDB_POOL_QUERY_FIELDS = `name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             involved_companies.company.developed,
             cover.url, screenshots.url, rating, rating_count, hypes,
             game_localizations.name, game_localizations.region,
             websites.url, websites.category, websites.type,
             game_type, aggregated_rating, aggregated_rating_count, keywords.slug,
             total_rating, total_rating_count,
             parent_game.game_type, parent_game.total_rating, parent_game.total_rating_count`;

/**
 * 母集団クエリの生レスポンス（IGDB_POOL_QUERY_FIELDS に対応する形）。
 * 5つの母集団クエリすべてで igdbRequest の型引数として共有する。
 */
interface IGDBPoolRawGame {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  genres?: { name: string }[];
  platforms?: { name: string }[];
  first_release_date?: number;
  involved_companies?: {
    company: { name: string; developed?: number[] };
    developer: boolean;
    publisher: boolean;
  }[];
  cover?: { url: string };
  screenshots?: { url: string }[];
  rating?: number;
  rating_count?: number;
  game_localizations?: { name: string; region?: number }[];
  websites?: { url: string; category?: number; type?: number }[];
  game_type?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  keywords?: { id: number; slug: string }[];
  /** 総合評価（批評+ユーザーの合成値）。名作枠の母集団条件に使う（§5.4） */
  total_rating?: number;
  /** 総合評価の評価母数。名作枠の母集団条件・並び順に使う（§5.4/§5.8） */
  total_rating_count?: number;
  /** 原作ゲーム（リメイク・リマスターの親）。J-3-e 判定に使う（§5.5） */
  parent_game?: { id: number; game_type?: number; total_rating?: number; total_rating_count?: number };
}

/**
 * 母集団クエリ（IGDBPoolRawGame）から IGDBGame への変換ロジック（fetchRecentPopularGames /
 * fetchRecentPopularGamesByRatingCount / fetchUpcomingGames / fetchClassicGames /
 * fetchIndieGames の5クエリで共通）。
 * developerGameCount の拾い方・pickSteamUrlFromWebsites による steamUrl 抽出・
 * websites の正規化を含む。
 */
function mapPoolRawGameToIGDBGame(game: IGDBPoolRawGame): IGDBGame {
  let developer: string | undefined;
  let publisher: string | undefined;
  // developer 側の developed 件数のみ拾う（規模判定用、§3.4）。publisher 側は拾わない。
  let developerGameCount: number | undefined;

  if (game.involved_companies) {
    for (const ic of game.involved_companies) {
      if (ic.developer && !developer) {
        developer = ic.company.name;
        developerGameCount = ic.company.developed?.length;
      }
      if (ic.publisher && !publisher) publisher = ic.company.name;
    }
  }

  const formatImageUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    return url.replace('t_thumb', 't_cover_big').replace('//', 'https://');
  };

  return {
    id: game.id,
    name: game.name,
    titleJa: extractJapaneseLocalization(game.game_localizations),
    slug: game.slug,
    summary: game.summary,
    genres: game.genres?.map((g) => g.name),
    platforms: game.platforms?.map((p) => p.name),
    releaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
      : undefined,
    developer,
    publisher,
    developerGameCount,
    coverUrl: formatImageUrl(game.cover?.url),
    screenshotUrls: game.screenshots
      ?.map((s) =>
        s.url?.replace('t_thumb', 't_screenshot_big').replace('//', 'https://')
      )
      .filter((url): url is string => url !== undefined),
    rating: game.rating,
    ratingCount: game.rating_count,
    steamUrl: pickSteamUrlFromWebsites(game.websites),
    websites: game.websites?.map((w) => ({ url: w.url, category: w.category, type: w.type })),
    gameType: game.game_type,
    aggregatedRating: game.aggregated_rating,
    aggregatedRatingCount: game.aggregated_rating_count,
    keywords: game.keywords?.map((k) => k.slug),
    totalRating: game.total_rating,
    totalRatingCount: game.total_rating_count,
    classicRemakeEligible: computeClassicRemakeEligible(game.game_type, game.parent_game),
  };
}

/**
 * 【発売済みのみ・クエリA】直近60日以内に発売された、発売前に話題だった人気ゲームを取得する（§2.3）。
 *
 * 母集団の条件（§2.3）: 発売日が JST 当日 0 時の 60 日前 以上・JST 当日 0 時 未満
 * （= 発売済みのみ。未発売は fetchUpcomingGames が別途担当する）。
 *
 * `hypes > 5` は §2.3 に規定の無い実装独自の条件。外すと候補が激増するため残しているが、
 * 外すかどうかは別途判断する（Issue #241 のスコープ外）。
 *
 * ⚠️ このクエリは実質「発売前フォロー数（hypes）」で母集団が決まるため、hypes を持たない
 * 「静かに売れている発売済みタイトル」を構造的に落とす（2026-08-09 実測: 60日窓の発売済み
 * 3,144件中 hypes>5 は59件のみ）。この欠落を補うのが fetchRecentPopularGamesByRatingCount
 * （クエリB）であり、削除してはならない（hypes が高く票数ゼロの発売直後タイトル、例:
 * 『ほの暮しの庭』のようなケースを拾うのはこのクエリAのみのため）。
 */
async function fetchRecentPopularGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    const dayStart = getJstDayStartUnixSec();
    const sixtyDaysAgo = dayStart - 60 * 24 * 60 * 60;

    const query = `
      fields ${IGDB_POOL_QUERY_FIELDS};
      where first_release_date >= ${sixtyDaysAgo} & first_release_date < ${dayStart} & hypes > 5 & ${buildIgdbCommonFilters({
        gameTypes: [IGDB_GAME_TYPE_MAIN, IGDB_GAME_TYPE_REMAKE, IGDB_GAME_TYPE_REMASTER],
      })};
      sort hypes desc;
      limit 50;
    `;

    const games = await igdbRequest<IGDBPoolRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map(mapPoolRawGameToIGDBGame);
  } catch (error) {
    console.error('Failed to fetch recent popular games:', error);
    return [];
  }
}

/**
 * 【発売済みのみ・クエリB】直近60日以内に発売された、票数（rating_count）のあるゲームを取得する
 * （§2.3、コードレビュー対応）。
 *
 * fetchRecentPopularGames（クエリA、hypes > 5）は実質「発売前フォロー数」で母集団が決まっており、
 * hypes を持たない「静かに売れている発売済みタイトル」が構造的に落ちる
 * （2026-08-09 実測: rating_count 上位20件中11件がクエリAで拾えていない。例: Palworld
 * rating_count=260・hypes=1／Scrap Mechanic rating_count=32・hypes無し／
 * Backrooms: Escape Together rating_count=18・hypes無し／MOLE rating_count=8・hypes=2）。
 *
 * このクエリBはクエリAと同じ発売日窓に対し、`rating_count > 5` でソートして問い合わせる。
 * この閾値は fetchIndieGames が既に使っている条件（`rating_count > 5`）に合わせたもの。
 * 重複は fetchIGDBData の id 重複除去でまとめて処理するため、ここでは重複除去しない。
 */
async function fetchRecentPopularGamesByRatingCount(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    const dayStart = getJstDayStartUnixSec();
    const sixtyDaysAgo = dayStart - 60 * 24 * 60 * 60;

    const query = `
      fields ${IGDB_POOL_QUERY_FIELDS};
      where first_release_date >= ${sixtyDaysAgo} & first_release_date < ${dayStart} & rating_count > 5 & ${buildIgdbCommonFilters({
        gameTypes: [IGDB_GAME_TYPE_MAIN, IGDB_GAME_TYPE_REMAKE, IGDB_GAME_TYPE_REMASTER],
      })};
      sort rating_count desc;
      limit 50;
    `;

    const games = await igdbRequest<IGDBPoolRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map(mapPoolRawGameToIGDBGame);
  } catch (error) {
    console.error('Failed to fetch recent popular games (by rating_count):', error);
    return [];
  }
}

/**
 * 【未発売のみ】これから発売されるゲームを取得する（§2.4）。
 *
 * 母集団の条件（§2.4）: 発売日が JST 当日 0 時 以上・JST 当日 0 時 + 90 日 以下、
 * `hypes > 20`（注目度のフロア）、Main Game / Remake / Remaster
 * （DLC・拡張・バンドル・移植は除外。発売済みクエリ fetchRecentPopularGames /
 * fetchRecentPopularGamesByRatingCount と同じ gameTypes を許可する）。
 * 並び順は発売日の昇順（hypes はソート軸に使わない。§2.4）。
 *
 * Issue #244: §6.2（新作紹介）はリメイク・リマスターを許可しているのに、旧実装の
 * このクエリは Main Game のみに絞っていたため、未発売のリメイク・リマスターが
 * 発売済みクエリにも未発売クエリにも入らない仕様矛盾があった（例: 発売前の
 * Rayman Legends Retold）。§2.4 側を緩めて発売済みクエリと揃える方針でユーザー
 * 判断確定済み。
 *
 * ⚠️ 管理者が実測済み（2026-08-09）: この変更は当日の実データでは取得結果を変えない。
 * where 句合致は 33件→34件に増えるが、`sort first_release_date asc; limit 20` の
 * 先頭20件は変わらず、Rayman Legends Retold は緩和後も34件中23番目で limit に
 * 切られたまま。これは想定どおりであり、目的は仕様矛盾の解消であって取得結果を
 * 増やすことではない。
 *
 * ⚠️ §2.4 が規定する「確定日のみ」フィルタ（`release_dates.date_format`）はここでは
 * 実装しない。担当は PR-C（別 PR）。このクエリは曖昧な発売日（「2026年Q3」等）の
 * タイトルも含んだままになる。
 */
async function fetchUpcomingGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    const dayStart = getJstDayStartUnixSec();
    const ninetyDaysLater = dayStart + 90 * 24 * 60 * 60;

    const query = `
      fields ${IGDB_POOL_QUERY_FIELDS};
      where first_release_date >= ${dayStart} & first_release_date <= ${ninetyDaysLater} & hypes > 20 & ${buildIgdbCommonFilters({
        gameTypes: [IGDB_GAME_TYPE_MAIN, IGDB_GAME_TYPE_REMAKE, IGDB_GAME_TYPE_REMASTER],
      })};
      sort first_release_date asc;
      limit 20;
    `;

    const games = await igdbRequest<IGDBPoolRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map(mapPoolRawGameToIGDBGame);
  } catch (error) {
    console.error('Failed to fetch upcoming games:', error);
    return [];
  }
}

/**
 * 【名作深掘り】評価が高く、かつ評価が十分に定着しているゲームを取得する（§5.4/§5.5決着）。
 *
 * 母集団の条件（§5.4）: `total_rating >= 閾値`（既定85） & `total_rating_count >= 閾値`
 * （既定200） & Main Game(0) / Remake(8) / Remaster(9)、成人向け除外。閾値は
 * classic-pool.ts の関数から取得する（呼び出し時に環境変数を読むためハードコードしない）。
 *
 * 並び順は評価母数（total_rating_count）の降順、取得件数は 200 件（§5.4決着。母集団268件のうち
 * 68件が切られるが仕様どおり）。
 *
 * J-3-e（§5.5決着）: game_type が 8/9 のリメイク・リマスターは、取得後に
 * `classicRemakeEligible === true`（原作が母集団に存在しない）のものだけを残す。
 * Main Game(0) は classicRemakeEligible が undefined でも無条件で残す。
 *
 * 旧実装（`hypes > 100` & `sort hypes desc` & `limit 30`、Main Game のみ）は廃止した。
 * 旧実装は実質「発売前フォロー数」で母集団が決まり、§5.4/§5.5 が要求する評価母数ベースの
 * 母集団と無関係だった。
 */
async function fetchClassicGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    const totalRatingMin = readClassicTotalRatingMin();
    const totalRatingCountMin = readClassicTotalRatingCountMin();

    const query = `
      fields ${IGDB_POOL_QUERY_FIELDS};
      where total_rating >= ${totalRatingMin} & total_rating_count >= ${totalRatingCountMin} & ${buildIgdbCommonFilters({
        gameTypes: [IGDB_GAME_TYPE_MAIN, IGDB_GAME_TYPE_REMAKE, IGDB_GAME_TYPE_REMASTER],
      })};
      sort total_rating_count desc;
      limit 200;
    `;

    const games = await igdbRequest<IGDBPoolRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map(mapPoolRawGameToIGDBGame).filter((g) => {
      if (g.gameType === IGDB_GAME_TYPE_REMAKE || g.gameType === IGDB_GAME_TYPE_REMASTER) {
        return g.classicRemakeEligible === true;
      }
      return true;
    });
  } catch (error) {
    console.error('Failed to fetch classic games:', error);
    return [];
  }
}

/**
 * インディーゲームを取得（過去3ヶ月以内・全プラットフォーム対象）
 */
async function fetchIndieGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    const threeMonthsAgo = Math.floor(
      (Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000
    );

    // where/sort/limit は変更しない。
    const query = `
      fields ${IGDB_POOL_QUERY_FIELDS};
      where first_release_date > ${threeMonthsAgo} & rating_count > 5 & ${buildIgdbCommonFilters()};
      sort hypes desc;
      limit 50;
    `;

    const games = await igdbRequest<IGDBPoolRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map(mapPoolRawGameToIGDBGame);
  } catch (error) {
    console.error('Failed to fetch indie games:', error);
    return [];
  }
}

/**
 * IGDB データ取得のメインエントリーポイント
 */
export async function fetchIGDBData(): Promise<FetchResult<IGDBData>> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      'IGDB_CLIENT_ID or IGDB_CLIENT_SECRET not set, returning empty data.'
    );
    return {
      success: true,
      data: {
        games: [],
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  console.log('Fetching IGDB data...');

  try {
    // アクセストークン取得
    const accessToken = await getAccessToken(clientId, clientSecret);

    // 最近の人気ゲーム（発売済み・hypes版）・最近の人気ゲーム（発売済み・rating_count版）・
    // これから発売されるゲーム（未発売）・名作・インディーゲームを並列取得
    // （Issue #241: 新作枠の母集団を発売済み/未発売に分割。コードレビュー対応で発売済みを
    // さらに hypes版/rating_count版の2クエリに分け、hypes を持たない発売済みタイトルも拾う）
    const [recentGames, recentGamesByRatingCount, upcomingGames, classicGames, indieGames] =
      await Promise.all([
        fetchRecentPopularGames(clientId, accessToken),
        fetchRecentPopularGamesByRatingCount(clientId, accessToken),
        fetchUpcomingGames(clientId, accessToken),
        fetchClassicGames(clientId, accessToken),
        fetchIndieGames(clientId, accessToken),
      ]);

    // 重複除去してマージ（recent(hypes) → recent(rating_count) → upcoming → classic → indie の順）
    const seenIds = new Set<number>();
    const allGames: IGDBGame[] = [];

    for (const game of [
      ...recentGames,
      ...recentGamesByRatingCount,
      ...upcomingGames,
      ...classicGames,
      ...indieGames,
    ]) {
      if (!seenIds.has(game.id)) {
        allGames.push(game);
        seenIds.add(game.id);
      }
    }

    const igdbData: IGDBData = {
      games: allGames,
      fetchedAt: new Date().toISOString(),
    };

    console.log(
      `IGDB data fetched: ${allGames.length} games ` +
        `(recentByHypes=${recentGames.length}, recentByRatingCount=${recentGamesByRatingCount.length}, ` +
        `upcoming=${upcomingGames.length}, classic=${classicGames.length}, indie=${indieGames.length})`
    );

    return { success: true, data: igdbData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch IGDB data:', message);
    return { success: false, error: message };
  }
}

// エクスポート: 外部から IGDB メタ取得を呼び出すための関数
//
// Issue #166: steamAppId があれば appId 逆引きを第一級手段として優先する。
// 逆引きがヒットしなければ従来の名前検索へフォールバックする（IGDB 呼び出し回数は
// 逆引きヒット時 1 回、フォールバック時のみ 2 回で、常に名前検索と逆引きを両方は呼ばない）。
export async function enrichGameWithIGDB(
  gameName: string,
  options?: { expectedYear?: number; steamAppId?: number; mainGameOnly?: boolean }
): Promise<IGDBGame | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);

    // appId 逆引きを優先（安定した外部IDによる同一性解決）。
    // mainGameOnly はここには絶対に伝播させない。appId は名前より強い同一性シグナルであり、
    // DLC の appId 逆引きに game_type = 0 を強制すると救済経路が壊れるため（Issue #208）。
    if (options?.steamAppId !== undefined) {
      const byAppId = await searchGameBySteamAppId(
        options.steamAppId,
        clientId,
        accessToken
      );
      if (byAppId) return byAppId;
      // ヒットしなければ名前検索へフォールバック
    }

    return await searchGameByName(gameName, clientId, accessToken, options);
  } catch (error) {
    console.error(`Failed to enrich game "${gameName}":`, error);
    return null;
  }
}

// スクリプト直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchIGDBData().then((result) => {
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
      process.exit(1);
    }
  });
}
