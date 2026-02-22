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

// IGDB国コード→国名のマッピング（主要な国のみ）
const COUNTRY_CODES: Record<number, string> = {
  392: '日本',
  840: 'アメリカ',
  826: 'イギリス',
  124: 'カナダ',
  276: 'ドイツ',
  250: 'フランス',
  380: 'イタリア',
  724: 'スペイン',
  752: 'スウェーデン',
  578: 'ノルウェー',
  208: 'デンマーク',
  246: 'フィンランド',
  528: 'オランダ',
  56: 'ベルギー',
  616: 'ポーランド',
  203: 'チェコ',
  804: 'ウクライナ',
  643: 'ロシア',
  156: '中国',
  410: '韓国',
  158: '台湾',
  344: '香港',
  36: 'オーストラリア',
  554: 'ニュージーランド',
  76: 'ブラジル',
  484: 'メキシコ',
  32: 'アルゼンチン',
  756: 'スイス',
  40: 'オーストリア',
};

/**
 * 国コードを国名に変換
 */
function getCountryName(countryCode: number | undefined): string | undefined {
  if (!countryCode) return undefined;
  return COUNTRY_CODES[countryCode];
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
export async function searchGameByName(
  name: string,
  clientId: string,
  accessToken: string
): Promise<IGDBGame | null> {
  try {
    // 日本語タイトルを英語に変換
    const searchName = translateToEnglish(name);
    console.log(`  IGDB search: "${name}" -> "${searchName}"`);

    // ゲーム検索
    const query = `
      search "${searchName.replace(/"/g, '\\"')}";
      fields name, slug, summary, genres.name, platforms.name,
             first_release_date, involved_companies.company.name,
             involved_companies.developer, involved_companies.publisher,
             cover.url, screenshots.url, rating, rating_count,
             involved_companies.company.country;
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
    }

    const games = await igdbRequest<IGDBRawGame>(
      'games',
      query,
      clientId,
      accessToken
    );

    if (games.length === 0) return null;

    const game = games[0];

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

    return {
      id: game.id,
      name: game.name,
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
             cover.url, screenshots.url, rating, rating_count, hypes;
      where first_release_date > ${threeMonthsAgo} & hypes > 5;
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
             cover.url, screenshots.url, rating, rating_count, hypes;
      where hypes > 100;
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
      };
    });
  } catch (error) {
    console.error('Failed to fetch classic games:', error);
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

    // 最近の人気ゲームと名作を並列取得
    const [recentGames, classicGames] = await Promise.all([
      fetchRecentPopularGames(clientId, accessToken),
      fetchClassicGames(clientId, accessToken),
    ]);

    // 重複除去してマージ
    const seenIds = new Set<number>();
    const allGames: IGDBGame[] = [];

    for (const game of [...recentGames, ...classicGames]) {
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
  gameName: string
): Promise<IGDBGame | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);
    return await searchGameByName(gameName, clientId, accessToken);
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
