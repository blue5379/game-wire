/**
 * 公式日本語ページURL取得スクリプト
 * Tavily Web検索 + Claude でゲームの公式日本語ページURLを取得する
 */

import { tavily } from '@tavily/core';
import { invokeClaudeModel, initializeBedrockClient } from './bedrock-client.js';

// SNS・ストア・Wiki等のURLを除外するパターン（fetch-igdb.ts の nonOfficialPatterns と共通）
export const NON_OFFICIAL_URL_PATTERNS = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'twitch.tv',
  'reddit.com',
  'discord.gg',
  'discord.com',
  'store.steampowered.com',
  'steampowered.com',
  'store.playstation.com',
  'playstation.com',
  'nintendo.com',
  'xbox.com',
  'microsoft.com',
  'gog.com',
  'epicgames.com',
  'play.google.com',
  'apps.apple.com',
  'itunes.apple.com',
  'wikipedia.org',
  'fandom.com',
  'wiki',
  'metacritic.com',
  'opencritic.com',
  'ign.com',
  'famitsu.com',
  'gamespark.jp',
  '4gamer.net',
  'dengekionline.com',
  'gamekult.com',
  'gamespot.com',
  'eurogamer.net',
];

/**
 * URLが非公式サイトかどうかを判定
 */
function isNonOfficialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NON_OFFICIAL_URL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * URLの生存確認（HTTP HEAD）
 * 403はBot対策サイトの可能性があるため有効と判断する
 */
async function isUrlAlive(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
    // 403はBot対策（CloudFront等）の可能性があるため有効とみなす
    return response.ok || response.status === 403;
  } catch {
    return false;
  }
}

/**
 * Tavily検索でゲームの公式日本語ページ候補を取得
 */
async function searchOfficialJpUrl(
  titleEn: string,
  titleJa?: string
): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set');
  }

  const client = tavily({ apiKey });
  const query = titleJa
    ? `"${titleJa}" OR "${titleEn}" 公式サイト 日本語`
    : `"${titleEn}" 公式サイト 日本語`;

  try {
    const response = await client.search(query, {
      maxResults: 5,
      searchDepth: 'basic',
      topic: 'general',
    });

    return response.results
      .map((r) => r.url)
      .filter((url) => !isNonOfficialUrl(url));
  } catch (error) {
    console.error(`  Tavily search failed for "${titleEn}":`, error);
    return [];
  }
}

/**
 * Claude で候補URLから公式日本語ページを選別
 */
async function selectOfficialJpUrlWithClaude(
  titleEn: string,
  titleJa: string | undefined,
  releaseYear: string | undefined,
  candidates: string[]
): Promise<string | null> {
  const gameDesc = titleJa
    ? `${titleEn}（${titleJa}）`
    : titleEn;
  const yearDesc = releaseYear ? `（${releaseYear}年発売）` : '';

  const systemPrompt = `あなたはゲームの公式サイトURLを判定するアシスタントです。
与えられたURL候補の中から、ゲームの**公式日本語ページ**のURLを1つだけ返してください。

## 判定基準
- ゲームの公式サイト（開発会社・パブリッシャーが運営）であること
- 日本語コンテンツが含まれること（URLに /ja/ .jp ?lang=ja jp. などを含む、またはサイト自体が日本語）
- SNS・ストア・Wiki・レビューサイト・ファンサイトは除外
- 確信が持てない場合は null を返す

## 出力形式（必ずJSON形式で返すこと）
{"url": "https://example.com/ja/"} または {"url": null}`;

  const userMessage = `ゲーム: ${gameDesc}${yearDesc}

URL候補:
${candidates.map((u, i) => `${i + 1}. ${u}`).join('\n')}

上記の候補から、${gameDesc}の公式日本語ページURLを1つ選んでください。
該当するURLがない・確信が持てない場合は {"url": null} を返してください。`;

  try {
    initializeBedrockClient();
    const response = await invokeClaudeModel(systemPrompt, userMessage, {
      maxTokens: 256,
      temperature: 0,
    });

    const jsonMatch = response.match(/\{[^}]*"url"[^}]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { url: string | null };
    return parsed.url || null;
  } catch (error) {
    console.error(`  Claude URL selection failed for "${titleEn}":`, error);
    return null;
  }
}

/**
 * ゲームの公式日本語ページURLを取得する
 * @returns URLが見つかった場合はURL文字列、見つからない場合はnull
 */
export async function fetchOfficialJpUrl(params: {
  titleEn: string;
  titleJa?: string;
  releaseYear?: string;
}): Promise<string | null> {
  const { titleEn, titleJa, releaseYear } = params;
  console.log(`  Fetching official JP URL: ${titleEn}`);

  try {
    // Step 1: Tavily で候補URL取得
    const candidates = await searchOfficialJpUrl(titleEn, titleJa);
    if (candidates.length === 0) {
      console.log(`    No candidates found for "${titleEn}"`);
      return null;
    }
    console.log(`    Candidates: ${candidates.length} URLs`);

    // Step 2: Claude で公式日本語ページを選別
    const selectedUrl = await selectOfficialJpUrlWithClaude(
      titleEn,
      titleJa,
      releaseYear,
      candidates
    );

    if (!selectedUrl) {
      console.log(`    No official JP URL selected for "${titleEn}"`);
      return null;
    }

    // Step 3: URL生存確認
    const alive = await isUrlAlive(selectedUrl);
    if (!alive) {
      console.log(`    URL not alive: ${selectedUrl}`);
      return null;
    }

    console.log(`    Official JP URL: ${selectedUrl}`);
    return selectedUrl;
  } catch (error) {
    console.error(`  fetchOfficialJpUrl failed for "${titleEn}":`, error);
    return null;
  }
}

// 単体実行時のテスト
if (import.meta.url === `file://${process.argv[1]}`) {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  config({ path: '.env' });

  const testGames = [
    { titleEn: 'Final Fantasy XVI', titleJa: 'ファイナルファンタジーXVI', releaseYear: '2023' },
    { titleEn: 'Monster Hunter Wilds', titleJa: 'モンスターハンターワイルズ', releaseYear: '2025' },
    { titleEn: 'Persona 5 Royal', titleJa: 'ペルソナ5 ザ・ロイヤル', releaseYear: '2019' },
    { titleEn: 'Hollow Knight', releaseYear: '2017' },
    { titleEn: 'Balatro', releaseYear: '2024' },
  ];

  for (const game of testGames) {
    const url = await fetchOfficialJpUrl(game);
    console.log(`${game.titleEn}: ${url ?? '(not found)'}`);
    console.log('---');
  }
}
