/**
 * 公式日本語ページURL取得スクリプト
 * Tavily Web検索 + Claude でゲームの公式日本語ページURLを取得する
 */

import { tavily } from '@tavily/core';
import { invokeClaudeModel, initializeBedrockClient } from './bedrock-client.js';
import { verifyOfficialUrlContent } from './verify-official-url.js';

// SNS・ストア・Wiki等のURLを除外するパターン（fetch-igdb.ts の nonOfficialPatterns と共通）
// 注意: nintendo.com/playstation.com/xbox.com はゲーム紹介ページも持つため、
//       ストアURLのパターンのみを除外し、紹介ページは通過させる
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
  'discordapp.com', // Issue #247: discord.com への移行前の旧ドメイン。本番で誤採用された実害あり
  'bsky.app', // Issue #247: Bluesky。本番で誤採用された実害あり
  'store.steampowered.com',
  'steampowered.com',
  'store.playstation.com',   // PS Storeのみ除外（www.playstation.com/ja-jp/games/ は通過）
  'store-jp.nintendo.com',   // 任天堂ストアのみ除外（www.nintendo.com/jp/switch/ は通過）
  'xbox.com/ja-jp/games/store',  // Xboxストアのみ除外（xbox.com/ja-JP/games/[title] は通過）
  'xbox.com/en-us/games/store',
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
export function isNonOfficialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NON_OFFICIAL_URL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Tavily検索でゲームの公式日本語ページ候補を取得（単一クエリ）
 */
async function searchWithQuery(
  client: ReturnType<typeof tavily>,
  query: string
): Promise<string[]> {
  const response = await client.search(query, {
    maxResults: 10,
    searchDepth: 'basic',
    topic: 'general',
  });
  return response.results
    .map((r) => r.url)
    .filter((url) => !isNonOfficialUrl(url));
}

/**
 * Tavily 検索クエリリストを構築する（純関数）。
 *
 * Issue #135 P2-1: タイトル衝突への耐性を上げるため、開発元/発売元を含むクエリを
 * 優先度の高い位置に挿入する。同名タイトル別作品（例: "Atomic Heart" のような
 * 一般的な語の組合せ）が混入する事故を減らす。
 *
 * 既存の「タイトルのみ」のクエリは後段のリトライとして残し、開発元情報が
 * 不正確だった場合のフォールバックを確保する。
 */
export function buildSearchQueries(
  titleEn: string,
  titleJa?: string,
  developer?: string,
  publisher?: string
): string[] {
  const studio = developer || publisher;
  const queries: string[] = [];

  // 1st: 開発元/発売元を含むクエリ（タイトル衝突に最も強い）
  if (studio) {
    queries.push(
      titleJa
        ? `"${titleJa}" OR "${titleEn}" "${studio}" 公式サイト`
        : `"${titleEn}" "${studio}" 公式サイト`
    );
  }

  // 2nd: 現行クエリ（完全一致を強制）
  queries.push(
    titleJa
      ? `"${titleJa}" OR "${titleEn}" 公式サイト 日本語`
      : `"${titleEn}" 公式サイト 日本語`
  );

  // 3rd: クォートなし日本語タイトル（検索エンジンの柔軟マッチングを活用）
  if (titleJa) {
    queries.push(`${titleJa} 公式サイト`);
  }

  // 4th: 英語タイトルのみ
  queries.push(`${titleEn} 公式サイト 日本語`);

  // 5th: キーワード簡略化
  if (titleJa) {
    queries.push(`${titleJa} 公式`);
  }

  return queries;
}

/**
 * Tavily検索でゲームの公式日本語ページ候補を取得（単一クエリ版）
 */
async function searchOfficialJpUrl(
  titleEn: string,
  query: string
): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set');
  }

  const client = tavily({ apiKey });

  try {
    return await searchWithQuery(client, query);
  } catch (error) {
    console.error(`  Tavily search failed for "${titleEn}" with query "${query}":`, error);
    return [];
  }
}

/**
 * Claude 選別の system プロンプト（Issue #135 P2-2 で「ドメイン整合判断」を追加）。
 *
 * 開発元/発売元の表記とドメイン名が無関係（例: developer "IO Interactive" に対して
 * ドメインが個人ブログや別スタジオ）な候補を機械的に除外できないため、
 * Claude に明示判断させる。ただし、パブリッシャー流通のゲームでは公式日本語サイトが
 * ローカライザのドメイン（例: spike-chunsoft.co.jp 配下）に置かれることも多いため、
 * 「dev/pub と一字一句一致」ではなく「開発元・発売元・日本語ローカライザの
 * いずれかと整合する」程度に緩く判定する。
 */
export const selectUrlSystemPrompt = `あなたはゲームの公式サイトURLを判定するアシスタントです。
与えられたURL候補の中から、ゲームの**公式日本語ページ**のURLを1つだけ返してください。

## 判定基準
- ゲームの公式サイト（開発会社・パブリッシャー・日本語ローカライザが運営）であること
- 日本語コンテンツが含まれること（URLに /ja/ .jp ?lang=ja jp. などを含む、またはサイト自体が日本語）
- SNS・ストア・Wiki・レビューサイト・ファンサイトは除外
- 確信が持てない場合は null を返す

## ドメイン整合チェック（重要）
開発元・発売元が指定されている場合、候補URLのドメインがそれらと整合するかを必ず確認すること。
- 開発元・発売元の社名／略称が含まれるドメイン → 採用候補
- 日本語ローカライザ（例: spike-chunsoft.co.jp）配下のゲーム個別ページ → 採用候補
- 開発元・発売元と全く関係ないドメイン（例: 個人ブログ・別スタジオ） → 除外
- 表記の揺れ（"IO Interactive" → "ioi.dk" など）は許容する。確信が持てなければ null

## 出力形式（必ずJSON形式で返すこと）
{"url": "https://example.com/ja/"} または {"url": null}`;

/**
 * 選別用のユーザーメッセージを構築する（純関数）。
 */
export function buildSelectUserMessage(params: {
  titleEn: string;
  titleJa?: string;
  releaseYear?: string;
  developer?: string;
  publisher?: string;
  candidates: string[];
}): string {
  const { titleEn, titleJa, releaseYear, developer, publisher, candidates } = params;
  const gameDesc = titleJa ? `${titleEn}（${titleJa}）` : titleEn;
  const yearDesc = releaseYear ? `（${releaseYear}年発売）` : '';

  const lines: string[] = [];
  lines.push(`ゲーム: ${gameDesc}${yearDesc}`);
  if (developer) lines.push(`開発元: ${developer}`);
  if (publisher) lines.push(`発売元: ${publisher}`);
  lines.push('');
  lines.push('URL候補:');
  lines.push(candidates.map((u, i) => `${i + 1}. ${u}`).join('\n'));
  lines.push('');
  lines.push(
    `上記の候補から、${gameDesc}の公式日本語ページURLを1つ選んでください。`
  );
  lines.push(
    '候補URLのドメインが開発元・発売元・日本語ローカライザのいずれとも整合しない場合は採用しないこと。'
  );
  lines.push('該当するURLがない・確信が持てない場合は {"url": null} を返してください。');
  return lines.join('\n');
}

/**
 * Claude で候補URLから公式日本語ページを選別
 */
async function selectOfficialJpUrlWithClaude(
  titleEn: string,
  titleJa: string | undefined,
  releaseYear: string | undefined,
  candidates: string[],
  developer?: string,
  publisher?: string
): Promise<string | null> {
  const userMessage = buildSelectUserMessage({
    titleEn,
    titleJa,
    releaseYear,
    developer,
    publisher,
    candidates,
  });

  try {
    initializeBedrockClient();
    const response = await invokeClaudeModel(selectUrlSystemPrompt, userMessage, {
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

export interface FetchOfficialJpUrlResult {
  url: string;
  verifyReason: string;
}

/**
 * 単一クエリで公式日本語ページURLの取得を試行する（テスタビリティ向上）。
 *
 * 検索・選別・検証の3ステップを実行し、いずれかが失敗した場合はnullを返す。
 * 検証結果が `mismatch` の場合はフォールスルー（null）、`uncertain` の場合は採用する。
 *
 * @param queryIndex クエリのインデックス（ログ表示用）
 * @param query 検索クエリ文字列
 * @param params ゲーム情報
 * @param dependencies 外部依存（テスト時にモック可能）
 * @returns URLと検証理由、または null（フォールスルー）
 */
export async function tryQueryForOfficialUrl(
  queryIndex: number,
  query: string,
  params: {
    titleEn: string;
    titleJa?: string;
    releaseYear?: string;
    developer?: string;
    publisher?: string;
  },
  dependencies: {
    search: (titleEn: string, query: string) => Promise<string[]>;
    select: (
      titleEn: string,
      titleJa: string | undefined,
      releaseYear: string | undefined,
      candidates: string[],
      developer?: string,
      publisher?: string
    ) => Promise<string | null>;
    verify: (
      identity: { titleEn: string; titleJa?: string; developer?: string; publisher?: string },
      url: string
    ) => Promise<{ verdict: 'match' | 'mismatch' | 'uncertain'; reason: string }>;
  }
): Promise<FetchOfficialJpUrlResult | null> {
  const { titleEn, titleJa, releaseYear, developer, publisher } = params;

  // Step 1: 候補URL取得
  console.log(`    [Query ${queryIndex}] Searching: ${query}`);
  const candidates = await dependencies.search(titleEn, query);

  if (candidates.length === 0) {
    console.log(`    [Query ${queryIndex}] No candidates found`);
    return null;
  }

  console.log(`    [Query ${queryIndex}] Found ${candidates.length} candidates: ${candidates.join(', ')}`);

  // Step 2: Claude 選別
  const selectedUrl = await dependencies.select(
    titleEn,
    titleJa,
    releaseYear,
    candidates,
    developer,
    publisher
  );

  if (!selectedUrl) {
    console.log(`    [Query ${queryIndex}] Claude selection returned null (no suitable candidate)`);
    return null;
  }

  console.log(`    [Query ${queryIndex}] Claude selected: ${selectedUrl}`);

  // Step 3: 内容一致検証
  const verification = await dependencies.verify(
    { titleEn, titleJa, developer, publisher },
    selectedUrl
  );

  if (verification.verdict === 'mismatch') {
    console.log(`    [Query ${queryIndex}] Verification mismatch, falling through: ${selectedUrl} (${verification.reason})`);
    return null;
  }

  if (verification.verdict === 'uncertain') {
    console.log(`    [Query ${queryIndex}] Verification uncertain, accepting anyway: ${selectedUrl} (${verification.reason})`);
  } else {
    console.log(`    [Query ${queryIndex}] Verification passed: ${selectedUrl} (${verification.reason})`);
  }

  return { url: selectedUrl, verifyReason: verification.reason };
}

/**
 * ゲームの公式日本語ページURLを取得する（Issue #346 対応版）
 *
 * 複数の検索クエリを優先度順に試行し、各クエリで候補取得→Claude選別→内容検証を実行する。
 * Claude選別がnullを返した場合、または内容検証が`mismatch`を返した場合は次のクエリに
 * フォールスルーする（`uncertain`は採用する）。
 *
 * @returns URL と内容検証の判定根拠。全クエリで見つからない場合は null
 */
export async function fetchOfficialJpUrl(params: {
  titleEn: string;
  titleJa?: string;
  releaseYear?: string;
  developer?: string;
  publisher?: string;
}): Promise<FetchOfficialJpUrlResult | null> {
  const { titleEn, titleJa, releaseYear, developer, publisher } = params;
  console.log(`  Fetching official JP URL: ${titleEn}`);

  try {
    const queries = buildSearchQueries(titleEn, titleJa, developer, publisher);
    console.log(`  Trying ${queries.length} queries in order`);

    // 各クエリを順番に試行し、最初に成功したものを返す
    for (let i = 0; i < queries.length; i++) {
      const result = await tryQueryForOfficialUrl(
        i,
        queries[i],
        { titleEn, titleJa, releaseYear, developer, publisher },
        {
          search: searchOfficialJpUrl,
          select: selectOfficialJpUrlWithClaude,
          verify: verifyOfficialUrlContent,
        }
      );

      if (result) {
        console.log(`  Official JP URL found with query ${i}: ${result.url}`);
        return result;
      }
    }

    console.log(`  No official JP URL found after trying all ${queries.length} queries`);
    return null;
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
    console.log(`${game.titleEn}: ${url ? `${url.url} (${url.verifyReason})` : '(not found)'}`);
    console.log('---');
  }
}
