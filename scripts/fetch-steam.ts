/**
 * Steam データ取得スクリプト
 * Top Sellers と Top Played のデータを取得
 */

import type { SteamGame, SteamData, FetchResult } from './types.js';

const STEAM_STORE_API = 'https://store.steampowered.com/api';
const STEAM_CHARTS_API = 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1';

// リトライ付きfetch
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'GameWire/1.0',
          'Accept': 'application/json',
          ...options.headers,
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        // Rate limited, wait longer
        await new Promise((r) => setTimeout(r, delay * (i + 2)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Steam Store Featured Categories から Top Sellers を取得
 */
async function fetchTopSellers(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(
      `${STEAM_STORE_API}/featuredcategories/?cc=jp&l=japanese`
    );
    const data = await response.json();

    const topSellers: SteamGame[] = [];

    // Featured categories から top_sellers を探す
    if (data.top_sellers?.items) {
      for (const item of data.top_sellers.items.slice(0, 20)) {
        // appdetails で成人向けコンテンツチェック + appId/name 整合性検証（Issue #102）
        const { name: storefrontName, isAdultContent } = await getAppDetails(item.id);
        if (isAdultContent) {
          console.log(`  [Steam] Skipping adult content game: "${item.name}" (appId: ${item.id})`);
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        // appId と Featured Categories の name が乖離している場合は除外
        if (storefrontName && !isSameSteamApp(item.name, storefrontName)) {
          console.warn(
            `  [Steam] appId/name mismatch in top_sellers: featured="${item.name}" storefront="${storefrontName}" (appId: ${item.id}) — skipping`
          );
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        topSellers.push({
          appId: item.id,
          // Storefront API の正規名を優先（Featured Categories の name はバンドル名等で不正確な場合がある）
          name: storefrontName ?? item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '無料',
          discount: item.discount_percent || 0,
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return topSellers;
  } catch (error) {
    console.error('Failed to fetch top sellers from Steam Store:', error);
    return [];
  }
}

// Steam content_descriptors IDs that indicate adult/sexual content
// 1: Some Nudity or Sexual Content
// 2: Frequent Nudity or Sexual Content
// 3: Adult Only Sexual Content
const ADULT_CONTENT_DESCRIPTOR_IDS = [1, 2, 3];

/**
 * Featured Categories の `item.name` と Storefront `appData.name` が
 * 同じゲームを指しているか粗く判定する（Issue #102 対策）。
 *
 * Featured Categories の Top Sellers / New Releases にはエディションのバンドル等で
 * appId とタイトルの組合せがズレるエントリが稀に混入する（観測済み: appId=32470 が
 * "サイバーパンク2077 アルティメットエディション" として返されたが、appId 32470 の
 * 実体は "STAR WARS™ Empire at War - Gold Pack" だった）。
 *
 * 入口でこの不整合を弾くため、以下を不一致と判定する:
 * - 双方を正規化（小文字化、空白除去、記号除去）した上で
 * - 共通プレフィックス比較で短い側の 60% 以上が一致しなければ別ゲーム
 *
 * 多言語表記（"Apex Legends" vs "エーペックスレジェンズ"）は文字種が異なるため
 * 一致判定できないが、Featured Categories は通常 cc/l パラメータで言語が統一される
 * ため実害は小さい。完全一致や前方一致で十分なケースをカバーする。
 */
export function isSameSteamApp(itemName: string, appDataName: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[\s　™®©:;'",.\-_!?()[\]【】「」『』]/g, '');
  const a = norm(itemName);
  const b = norm(appDataName);
  if (!a || !b) return true; // 片方空なら検証保留
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // 共通プレフィックスが短い側の 60% 以上
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let common = 0;
  while (common < shorter.length && shorter[common] === longer[common]) common++;
  return common / shorter.length >= 0.6;
}

/**
 * Steam Storefront API から指定 appId のゲーム名を取得（検証用）
 * - appId が存在しない / Steam に published されていない場合は null を返す
 * - 成人向けフラグなどは見ない（検証は name 比較のみ）
 *
 * Issue #49 対策: IGDB websites などから採用しようとしている Steam URL の
 * appId が実在し、かつ期待するゲーム名と一致するかをクロスチェックする。
 */
export async function fetchSteamAppName(appId: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const entry = data[appId];
    if (!entry?.success) return null;
    return entry.data?.name || null;
  } catch {
    return null;
  }
}

/**
 * Steam公式APIからゲーム詳細（名前・成人向けフラグ）を取得
 */
async function getAppDetails(appId: number): Promise<{ name: string | null; isAdultContent: boolean }> {
  try {
    const response = await fetch(
      `${STEAM_STORE_API}/appdetails?appids=${appId}&cc=jp&l=japanese`
    );
    const data = await response.json();
    const appData = data[appId]?.data;
    if (!appData) return { name: null, isAdultContent: false };

    const descriptorIds: number[] = appData.content_descriptors?.ids ?? [];
    const isAdultContent = descriptorIds.some((id) =>
      ADULT_CONTENT_DESCRIPTOR_IDS.includes(id)
    );

    return { name: appData.name || null, isAdultContent };
  } catch {
    return { name: null, isAdultContent: false };
  }
}

/**
 * Steam公式 Charts API から Top Played を取得
 */
async function fetchTopPlayed(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(STEAM_CHARTS_API);
    const data = await response.json();

    const topPlayed: SteamGame[] = [];
    const ranks = data.response?.ranks || [];

    // 上位20件を取得
    for (const item of ranks.slice(0, 20)) {
      // ゲーム名と成人向けフラグを取得（レート制限対策で少し待機）
      const { name, isAdultContent } = await getAppDetails(item.appid);
      if (name) {
        if (isAdultContent) {
          console.log(`  [Steam] Skipping adult content game: "${name}" (appId: ${item.appid})`);
        } else {
          topPlayed.push({
            appId: item.appid,
            name,
            rank: item.rank,
            peakPlayers: item.peak_in_game,
          });
        }
      }
      // Steam Store API のレート制限対策
      await new Promise((r) => setTimeout(r, 200));
    }

    return topPlayed;
  } catch (error) {
    console.error('Failed to fetch from Steam Charts API:', error);
    return [];
  }
}

/**
 * Steam Store から新作・近日発売を取得
 */
async function fetchNewReleases(): Promise<SteamGame[]> {
  try {
    const response = await fetchWithRetry(
      `${STEAM_STORE_API}/featuredcategories/?cc=jp&l=japanese`
    );
    const data = await response.json();

    const newReleases: SteamGame[] = [];

    // new_releases カテゴリから取得
    if (data.new_releases?.items) {
      for (const item of data.new_releases.items.slice(0, 10)) {
        const { name: storefrontName, isAdultContent } = await getAppDetails(item.id);
        if (isAdultContent) {
          console.log(`  [Steam] Skipping adult content game: "${item.name}" (appId: ${item.id})`);
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        if (storefrontName && !isSameSteamApp(item.name, storefrontName)) {
          console.warn(
            `  [Steam] appId/name mismatch in new_releases: featured="${item.name}" storefront="${storefrontName}" (appId: ${item.id}) — skipping`
          );
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        newReleases.push({
          appId: item.id,
          name: storefrontName ?? item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '無料',
          discount: item.discount_percent || 0,
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // coming_soon カテゴリも取得
    if (data.coming_soon?.items) {
      for (const item of data.coming_soon.items.slice(0, 5)) {
        const { name: storefrontName, isAdultContent } = await getAppDetails(item.id);
        if (isAdultContent) {
          console.log(`  [Steam] Skipping adult content game: "${item.name}" (appId: ${item.id})`);
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        if (storefrontName && !isSameSteamApp(item.name, storefrontName)) {
          console.warn(
            `  [Steam] appId/name mismatch in coming_soon: featured="${item.name}" storefront="${storefrontName}" (appId: ${item.id}) — skipping`
          );
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        newReleases.push({
          appId: item.id,
          name: storefrontName ?? item.name,
          priceFormatted: item.final_price
            ? `¥${(item.final_price / 100).toLocaleString()}`
            : '価格未定',
          discount: 0,
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return newReleases;
  } catch (error) {
    console.error('Failed to fetch new releases:', error);
    return [];
  }
}

/**
 * Steam データ取得のメインエントリーポイント
 */
export async function fetchSteamData(): Promise<FetchResult<SteamData>> {
  console.log('Fetching Steam data...');

  try {
    // 並列でデータ取得
    const [topSellers, topPlayed] = await Promise.all([
      fetchTopSellers(),
      fetchTopPlayed(),
    ]);

    // 新作リリースも取得（Top Sellers に追加情報として）
    const newReleases = await fetchNewReleases();

    // Top Sellers に新作を統合（重複除去）
    const seenAppIds = new Set(topSellers.map((g) => g.appId));
    for (const game of newReleases) {
      if (!seenAppIds.has(game.appId)) {
        topSellers.push(game);
        seenAppIds.add(game.appId);
      }
    }

    const steamData: SteamData = {
      topSellers,
      topPlayed,
      fetchedAt: new Date().toISOString(),
    };

    console.log(
      `Steam data fetched: ${topSellers.length} top sellers, ${topPlayed.length} top played`
    );

    return { success: true, data: steamData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Steam data:', message);
    return { success: false, error: message };
  }
}

// スクリプト直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSteamData().then((result) => {
    if (result.success) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
      process.exit(1);
    }
  });
}
