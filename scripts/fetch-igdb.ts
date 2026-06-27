/**
 * IGDB API データ取得スクリプト
 * ゲームメタデータ（ジャンル、プラットフォーム、画像等）を取得
 */

import type { IGDBGame, IGDBData, FetchResult } from './types.js';

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_URL = 'https://api.igdb.com/v4';

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
  706: 'SO', 710: 'ZA', 724: 'ES', 144: 'LK', 729: 'SD', 740: 'SR', 752: 'SE',
  756: 'CH', 760: 'SY', 762: 'TJ', 764: 'TH', 768: 'TG', 776: 'TO', 780: 'TT',
  788: 'TN', 792: 'TR', 795: 'TM', 800: 'UG', 804: 'UA', 784: 'AE', 826: 'GB',
  834: 'TZ', 840: 'US', 858: 'UY', 860: 'UZ', 548: 'VU', 862: 'VE', 704: 'VN',
  887: 'YE', 894: 'ZM', 716: 'ZW', 8: 'AL', 158: 'TW', 191: 'HR', 499: 'ME',
  688: 'RS', 807: 'MK', 680: 'SB', 90: 'SB',
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
 * IGDB websites 配列から公式サイトURLを推定
 *
 * Issue #117: 「block-list（怪しければ落とす）」から「allow-list（確証された場合のみ採用）」へ転換。
 * category=1 (Official website) フラグが付いた URL のみ採用する。
 *
 * 過去のフォールバック（非SNS・非ストアの先頭URLを機械採用）は無関係なスタジオサイト
 * （例: Dungeon Blitz R に対する theminesa.studio）を採用してしまう構造的欠陥があったため廃止。
 * 公式URLが取得できない場合は undefined を返し、Tavily 経路（fetchOfficialJpUrl）に委ねる。
 */
function pickOfficialUrlFromWebsites(
  websites?: { url: string; category?: number }[]
): string | undefined {
  if (!websites?.length) return undefined;
  return websites.find((w) => w.category === 1)?.url;
}

// テスト用にエクスポート
export const __test = { isRelevantSearchResult, pickOfficialUrlFromWebsites };

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
  options?: { expectedYear?: number }
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

    // ゲーム検索
    const query = `
      search "${searchName.replace(/"/g, '\\"')}";
      fields name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             cover.url, screenshots.url, rating, rating_count,
             involved_companies.company.country,
             game_localizations.name, game_localizations.region,
             websites.url, websites.category;
      limit 1;
    `;

    interface IGDBRawGame {
      id: number;
      name: string;
      slug: string;
      summary?: string;
      genres?: { name: string }[];
      platforms?: { name: string }[];
      first_release_date?: number;
      involved_companies?: {
        company: { name: string; country?: number };
        developer: boolean;
        publisher: boolean;
      }[];
      cover?: { url: string };
      screenshots?: { url: string }[];
      rating?: number;
      rating_count?: number;
      game_localizations?: { name: string; region?: number }[];
      websites?: { url: string; category: number }[];
    }

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

    // 開発会社と販売会社、国情報を抽出
    let developer: string | undefined;
    let publisher: string | undefined;
    let developerCountry: number | undefined;

    if (game.involved_companies) {
      for (const ic of game.involved_companies) {
        if (ic.developer && !developer) {
          developer = ic.company.name;
          developerCountry = ic.company.country;
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
      return url
        .replace('t_thumb', 't_screenshot_big')
        .replace('//', 'https://');
    };

    // 国コードを日本語名に変換
    const developerCountryName = developerCountry
      ? COUNTRY_CODES[developerCountry]
      : undefined;

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
      coverUrl: formatImageUrl(game.cover?.url),
      screenshotUrls: game.screenshots
        ?.map((s) => formatScreenshotUrl(s.url))
        .filter((url): url is string => url !== undefined),
      rating: game.rating,
      ratingCount: game.rating_count,
      // category=13がSteamだが返却されないことがあるため、URLパターンでも判定
      steamUrl: game.websites?.find((w) =>
        w.category === 13 || w.url.includes('store.steampowered.com')
      )?.url,
      officialUrl,
      officialUrlSource: officialUrl ? 'igdb-official' : undefined,
      websites: game.websites,
    };
  } catch (error) {
    console.error(`Failed to search game "${name}":`, error);
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

/**
 * 最近リリースされた人気ゲームを取得
 */
async function fetchRecentPopularGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    // 過去3ヶ月以内にリリースされた高評価ゲーム
    const threeMonthsAgo = Math.floor(
      (Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000
    );

    const query = `
      fields name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             cover.url, screenshots.url, rating, rating_count, hypes,
             game_localizations.name, game_localizations.region,
             websites.url, websites.category;
      where first_release_date > ${threeMonthsAgo} & hypes > 5 & themes != (37);
      sort hypes desc;
      limit 20;
    `;

    interface IGDBRawGame {
      id: number;
      name: string;
      slug: string;
      summary?: string;
      genres?: { name: string }[];
      platforms?: { name: string }[];
      first_release_date?: number;
      involved_companies?: {
        company: { name: string };
        developer: boolean;
        publisher: boolean;
      }[];
      cover?: { url: string };
      screenshots?: { url: string }[];
      rating?: number;
      rating_count?: number;
      game_localizations?: { name: string; region?: number }[];
      websites?: { url: string; category: number }[];
    }

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map((game) => {
      let developer: string | undefined;
      let publisher: string | undefined;

      if (game.involved_companies) {
        for (const ic of game.involved_companies) {
          if (ic.developer && !developer) developer = ic.company.name;
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
        coverUrl: formatImageUrl(game.cover?.url),
        screenshotUrls: game.screenshots
          ?.map((s) =>
            s.url?.replace('t_thumb', 't_screenshot_big').replace('//', 'https://')
          )
          .filter((url): url is string => url !== undefined),
        rating: game.rating,
        ratingCount: game.rating_count,
        websites: game.websites,
      };
    });
  } catch (error) {
    console.error('Failed to fetch recent popular games:', error);
    return [];
  }
}

/**
 * 高評価の名作ゲームを取得
 */
async function fetchClassicGames(
  clientId: string,
  accessToken: string
): Promise<IGDBGame[]> {
  try {
    // 期待度の高いゲーム（名作候補）
    const query = `
      fields name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             cover.url, screenshots.url, rating, rating_count, hypes,
             game_localizations.name, game_localizations.region,
             websites.url, websites.category;
      where hypes > 100 & themes != (37);
      sort hypes desc;
      limit 30;
    `;

    interface IGDBRawGame {
      id: number;
      name: string;
      slug: string;
      summary?: string;
      genres?: { name: string }[];
      platforms?: { name: string }[];
      first_release_date?: number;
      involved_companies?: {
        company: { name: string };
        developer: boolean;
        publisher: boolean;
      }[];
      cover?: { url: string };
      screenshots?: { url: string }[];
      rating?: number;
      rating_count?: number;
      game_localizations?: { name: string; region?: number }[];
      websites?: { url: string; category: number }[];
    }

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map((game) => {
      let developer: string | undefined;
      let publisher: string | undefined;

      if (game.involved_companies) {
        for (const ic of game.involved_companies) {
          if (ic.developer && !developer) developer = ic.company.name;
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
        coverUrl: formatImageUrl(game.cover?.url),
        screenshotUrls: game.screenshots
          ?.map((s) =>
            s.url?.replace('t_thumb', 't_screenshot_big').replace('//', 'https://')
          )
          .filter((url): url is string => url !== undefined),
        rating: game.rating,
        ratingCount: game.rating_count,
        websites: game.websites,
      };
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

    const query = `
      fields name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             cover.url, screenshots.url, rating, rating_count, hypes,
             game_localizations.name, game_localizations.region,
             websites.url, websites.category;
      where first_release_date > ${threeMonthsAgo} & rating_count > 5 & themes != (37);
      sort hypes desc;
      limit 50;
    `;

    interface IGDBRawGame {
      id: number;
      name: string;
      slug: string;
      summary?: string;
      genres?: { name: string }[];
      platforms?: { name: string }[];
      first_release_date?: number;
      involved_companies?: {
        company: { name: string };
        developer: boolean;
        publisher: boolean;
      }[];
      cover?: { url: string };
      screenshots?: { url: string }[];
      rating?: number;
      rating_count?: number;
      game_localizations?: { name: string; region?: number }[];
      websites?: { url: string; category: number }[];
    }

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    return games.map((game) => {
      let developer: string | undefined;
      let publisher: string | undefined;

      if (game.involved_companies) {
        for (const ic of game.involved_companies) {
          if (ic.developer && !developer) developer = ic.company.name;
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
        coverUrl: formatImageUrl(game.cover?.url),
        screenshotUrls: game.screenshots
          ?.map((s) =>
            s.url?.replace('t_thumb', 't_screenshot_big').replace('//', 'https://')
          )
          .filter((url): url is string => url !== undefined),
        rating: game.rating,
        ratingCount: game.rating_count,
        websites: game.websites,
      };
    });
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

    // 最近の人気ゲーム・名作・インディーゲームを並列取得
    const [recentGames, classicGames, indieGames] = await Promise.all([
      fetchRecentPopularGames(clientId, accessToken),
      fetchClassicGames(clientId, accessToken),
      fetchIndieGames(clientId, accessToken),
    ]);

    // 重複除去してマージ
    const seenIds = new Set<number>();
    const allGames: IGDBGame[] = [];

    for (const game of [...recentGames, ...classicGames, ...indieGames]) {
      if (!seenIds.has(game.id)) {
        allGames.push(game);
        seenIds.add(game.id);
      }
    }

    const igdbData: IGDBData = {
      games: allGames,
      fetchedAt: new Date().toISOString(),
    };

    console.log(`IGDB data fetched: ${allGames.length} games`);

    return { success: true, data: igdbData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch IGDB data:', message);
    return { success: false, error: message };
  }
}

// エクスポート: 外部から名前検索を呼び出すための関数
export async function enrichGameWithIGDB(
  gameName: string,
  options?: { expectedYear?: number }
): Promise<IGDBGame | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);
    return await searchGameByName(gameName, clientId, accessToken, options);
  } catch (error) {
    console.error(`Failed to enrich game "${gameName}":`, error);
    return null;
  }
}

/**
 * ゲーム名からカバー画像と公式サイトURLを取得（特集記事用）
 */
export async function fetchGameImageAndUrl(
  gameName: string
): Promise<{ coverImage?: string; officialUrl?: string; platforms?: string[]; developer?: string; publisher?: string } | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);
    const searchName = sanitizeIgdbSearchTerm(translateToEnglish(gameName));

    if (!searchName || searchName.length < 2 || isInvalidSearchQuery(searchName)) {
      return null;
    }

    console.log(`    IGDB lookup: "${gameName}" -> "${searchName}"`);

    interface IGDBGameWithWebsites {
      id: number;
      name: string;
      cover?: { url: string };
      websites?: { url: string; category: number }[];
      platforms?: { name: string }[];
      involved_companies?: {
        company: { name: string };
        developer: boolean;
        publisher: boolean;
      }[];
    }

    const query = `
      search "${searchName.replace(/"/g, '\\"')}";
      fields name, cover.url, websites.url, websites.category,
             platforms.name,
             involved_companies.company.name, involved_companies.developer, involved_companies.publisher;
      limit 1;
    `;

    const games = await igdbRequest<IGDBGameWithWebsites>(
      'games',
      query,
      clientId,
      accessToken
    );

    if (games.length === 0) return null;

    const game = games[0];

    if (!isRelevantSearchResult(searchName, game.name)) {
      console.log(`    IGDB result not relevant: "${gameName}" -> "${game.name}" (skipped)`);
      return null;
    }

    const coverImage = game.cover?.url
      ? game.cover.url.replace('t_thumb', 't_cover_big').replace('//', 'https://')
      : undefined;

    // category 1 = Official website (IGDB APIでcategoryが返らない場合のフォールバックあり)
    const officialSite = game.websites?.find((w) => w.category === 1);
    let officialUrl = officialSite?.url;

    // categoryが取得できない場合、URLパターンから公式サイトを推定
    if (!officialUrl && game.websites?.length) {
      const nonOfficialPatterns = [
        'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
        'youtube.com', 'twitch.tv', 'reddit.com', 'discord.gg', 'discord.com',
        'store.steampowered.com', 'steampowered.com',
        'store.playstation.com',        // PS Storeのみ除外
        'store-jp.nintendo.com',        // 任天堂ストアのみ除外
        'xbox.com/ja-jp/games/store', 'xbox.com/en-us/games/store',  // Xboxストアのみ除外
        'microsoft.com',
        'gog.com', 'epicgames.com', 'play.google.com', 'apps.apple.com', 'itunes.apple.com',
        'wikipedia.org', 'fandom.com', 'wiki',
      ];
      const candidate = game.websites.find((w) =>
        !nonOfficialPatterns.some((p) => w.url.toLowerCase().includes(p))
      );
      officialUrl = candidate?.url;
    }

    const platforms = game.platforms?.map((p) => p.name);

    let developer: string | undefined;
    let publisher: string | undefined;
    if (game.involved_companies) {
      for (const ic of game.involved_companies) {
        if (ic.developer && !developer) developer = ic.company.name;
        if (ic.publisher && !publisher) publisher = ic.company.name;
      }
    }

    return { coverImage, officialUrl, platforms, developer, publisher };
  } catch (error) {
    console.error(`Failed to fetch image/url for "${gameName}":`, error);
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
