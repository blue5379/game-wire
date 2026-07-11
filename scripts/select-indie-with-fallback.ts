/**
 * インディーゲーム候補の採用＋予備差し替えフロー（PR-C, Issue #97）
 *
 * 仕様:
 * 1. ranked（スコア順）を先頭から順に評価し、targetCount 件採用するまで繰り返す
 * 2. 通常ルート: finalizeGameMetadata → ok なら確定
 * 3. 話題性ルート: still-missing-required かつ developer のみ欠落 かつ 話題性閾値 OK
 *    → 「個人開発（アカウント名）」ラベルを付与して確定
 * 4. どちらも通らない → rejected に追加、次の予備へ
 * 5. 予備が尽きたら targetCount 未満でも終了
 */

import { finalizeGameMetadata, hasAllRequiredFields } from './finalize-game-metadata.js';
import { isLargeStudio } from './indie-classifier.js';
import type { GameData } from './types.js';

/** 話題性ルートの閾値 */
const POPULARITY_STEAM_REVIEWS_MIN =
  Number(process.env.INDIE_POPULARITY_STEAM_REVIEWS_MIN) || 5000;
const POPULARITY_STEAM_RANK_MAX =
  Number(process.env.INDIE_POPULARITY_STEAM_RANK_MAX) || 200;
const POPULARITY_YOUTUBE_PERCENTILE =
  Number(process.env.INDIE_POPULARITY_YOUTUBE_PERCENTILE) || 0.30;

export interface PopularityContext {
  /** 候補プール全体を youtubePopularity 降順に並べたリスト（percentile 計算用） */
  youtubePopularitySorted: GameData[];
}

export interface SelectionResult {
  adopted: GameData[];
  rejected: Array<{ title: string; reason: string }>;
}

// steamRecommendations: true は Storefront API 呼び出しトリガー用。
// hasAllRequiredFields では steamRecommendations は評価されない（RequiredFields の設計による）。
const NORMAL_REQUIRED = { cover: true, developer: true, sourceUrl: true, steamRecommendations: true } as const;

/**
 * ゲームが話題性閾値を満たすか判定する。
 * @param game 評価対象ゲーム
 * @param youtubePopularitySorted 候補プール全体を youtubePopularity 降順に並べたリスト
 */
export function meetsPopularityThreshold(
  game: GameData,
  youtubePopularitySorted: GameData[]
): boolean {
  if ((game.steamRecommendations ?? 0) >= POPULARITY_STEAM_REVIEWS_MIN) return true;
  if ((game.steamRank ?? Infinity) <= POPULARITY_STEAM_RANK_MAX) return true;

  if (game.youtubePopularity !== undefined && youtubePopularitySorted.length > 0) {
    // 上位 POPULARITY_YOUTUBE_PERCENTILE（30%）の閾値スコアを計算
    const thresholdIndex = Math.floor(
      youtubePopularitySorted.length * (1 - POPULARITY_YOUTUBE_PERCENTILE)
    );
    const thresholdScore = youtubePopularitySorted[thresholdIndex]?.youtubePopularity ?? 0;
    if (game.youtubePopularity >= thresholdScore) return true;
  }

  return false;
}

/**
 * developer のみが必須未充足の原因か確認する。
 * cover と sourceUrl が満たされていて developer だけ欠落している場合に true。
 */
function isOnlyDeveloperMissing(game: GameData): boolean {
  const hasCover = Boolean(game.coverImage);
  const hasSourceUrl = Boolean(
    game.sourceUrls?.steam ||
    game.sourceUrls?.official ||
    game.sourceUrls?.igdb ||
    (game.sourceUrls?.stores && game.sourceUrls.stores.length > 0)
  );
  return hasCover && hasSourceUrl && !game.developer;
}

/**
 * 個人開発ラベルを生成する。
 * @param rawName Steam developer 名（アカウント名でも正規名でも）
 */
export function formatIndividualDeveloper(rawName: string): string {
  return `個人開発（${rawName}）`;
}

/**
 * インディーゲームとして採用できるか検証する（選定ループと差し替えで共用）。
 * 通常ルート → 話題性ルートの順で評価し、適格なら finalized GameData を返す。
 * 不適格なら null を返す。
 *
 * runCompletenessGate の slotGates['indies'] として渡すことで、
 * Gate が差し替え候補を補充する際にも選定基準と同じゲートを通す。
 * これにより「枠を埋めるために不適格なゲームを載せない」という設計方針を保証する。
 */
export async function vetIndieCandidate(
  game: GameData,
  context: PopularityContext
): Promise<GameData | null> {
  let finalizeResult: Awaited<ReturnType<typeof finalizeGameMetadata>>;
  try {
    finalizeResult = await finalizeGameMetadata(game, NORMAL_REQUIRED);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'vet-indie-candidate',
        title: game.title,
        step: 'finalize',
        reason: String(err),
      })
    );
    return null;
  }

  if (finalizeResult.ok) {
    // developer または publisher のいずれかが大手なら indie 枠から除外する。
    // publisher のみ大手（受託開発）のケースをカバーするため両方チェックする。
    const devHit = isLargeStudio(finalizeResult.game.developer).hit;
    const pubHit = isLargeStudio(finalizeResult.game.publisher).hit;
    if (devHit || pubHit) {
      console.log(
        JSON.stringify({
          scope: 'vet-indie-candidate',
          title: finalizeResult.game.title,
          step: 'large-studio-gate',
          reason: `not-indie after finalize (developer="${finalizeResult.game.developer ?? ''}", publisher="${finalizeResult.game.publisher ?? ''}")`,
        })
      );
      return null;
    }
    return finalizeResult.game;
  }

  // 通常ルート不通過 → 話題性ルート評価
  if (
    finalizeResult.reason === 'still-missing-required' &&
    isOnlyDeveloperMissing(finalizeResult.game) &&
    meetsPopularityThreshold(game, context.youtubePopularitySorted)
  ) {
    // developer が欠落していても publisher が大手なら個人開発ラベルで採用しない。
    if (isLargeStudio(finalizeResult.game.publisher).hit) {
      console.log(
        JSON.stringify({
          scope: 'vet-indie-candidate',
          title: finalizeResult.game.title,
          step: 'large-studio-gate',
          reason: `not-indie via popularity route (publisher="${finalizeResult.game.publisher ?? ''}")`,
        })
      );
      return null;
    }
    const rawName = finalizeResult.game.steamRawDeveloper ?? 'unknown';
    const adoptedGame: GameData = {
      ...finalizeResult.game,
      developer: formatIndividualDeveloper(rawName),
    };
    if (hasAllRequiredFields(adoptedGame, NORMAL_REQUIRED)) {
      return adoptedGame;
    }
  }

  return null;
}

/**
 * インディー候補リストから targetCount 件を採用する。
 * 通常ルート → 話題性ルートの順に評価し、予備プールからの差し替えも行う。
 */
export async function selectIndieGamesWithFallback(
  ranked: GameData[],
  targetCount: number,
  context: PopularityContext
): Promise<SelectionResult> {
  const queue = [...ranked];
  const adopted: GameData[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];

  while (adopted.length < targetCount && queue.length > 0) {
    const candidate = queue.shift()!;

    const vetted = await vetIndieCandidate(candidate, context);
    if (vetted) {
      adopted.push(vetted);
      continue;
    }

    rejected.push({ title: candidate.title, reason: 'not-adopted' });
  }

  return { adopted, rejected };
}
