/**
 * 新作ゲーム候補の採用＋予備差し替えフロー（PR-4, Issue #116）
 *
 * 仕様（設計書 Section E）:
 * 1. 品質ゲート（isQualifiedGame, !isFanGame, !isInvalidGameTitle, クールダウン）を適用
 * 2. 「実存の根拠」フィルタ:
 *    (a) Steam ランキング由来（steamRank または steamPlayers あり）
 *    (b) IGDB rating_count >= 5
 *    (c) youtubePopularity > 0
 * 3. metascore || igdbRating 降順でソート、上位から採用
 * 4. finalizeGameMetadata を経て必須フィールドが揃った場合のみ確定
 * 5. 落ちたら次候補に差し替え（最大 targetCount * 3 件まで試行）
 */

import { finalizeGameMetadata } from './finalize-game-metadata.js';
import type { GameData } from './types.js';

export interface NewReleasesSelectionResult {
  adopted: GameData[];
  rejected: Array<{ title: string; reason: string }>;
}

const NEW_RELEASE_REQUIRED = { cover: true, developer: true, sourceUrl: true } as const;

/**
 * ゲームが「実存の根拠」を持つか判定する。
 * Steam ランキング由来 / IGDB 評価数 / YouTube 人気度のいずれかを満たせば通過。
 */
export function hasExistenceEvidence(g: GameData): boolean {
  if (g.steamRank != null) return true;
  if (g.steamPlayers != null && g.steamPlayers > 0) return true;
  if (g.igdbRatingCount != null && g.igdbRatingCount >= 5) return true;
  if (g.youtubePopularity != null && g.youtubePopularity > 0) return true;
  return false;
}

/**
 * 新作ゲーム候補リストから targetCount 件を採用する。
 * 品質ゲート適用済みの候補をスコア順に評価し、finalizeGameMetadata を通過したものを確定。
 * 落ちた場合は次候補に差し替える。
 *
 * @param ranked 品質ゲート・実存フィルタ適用済み、スコア降順の候補リスト
 * @param targetCount 採用目標件数
 */
export async function selectNewReleasesWithFallback(
  ranked: GameData[],
  targetCount: number
): Promise<NewReleasesSelectionResult> {
  const queue = [...ranked];
  const adopted: GameData[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];

  while (adopted.length < targetCount && queue.length > 0) {
    const candidate = queue.shift()!;

    let finalizeResult: Awaited<ReturnType<typeof finalizeGameMetadata>>;
    try {
      finalizeResult = await finalizeGameMetadata(candidate, NEW_RELEASE_REQUIRED);
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'select-newreleases-with-fallback',
          title: candidate.title,
          step: 'finalize',
          reason: String(err),
        })
      );
      rejected.push({ title: candidate.title, reason: 'finalize-error' });
      continue;
    }

    if (finalizeResult.ok) {
      adopted.push(finalizeResult.game);
      continue;
    }

    rejected.push({ title: candidate.title, reason: finalizeResult.reason });
  }

  return { adopted, rejected };
}
