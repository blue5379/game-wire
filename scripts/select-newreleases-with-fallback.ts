import { finalizeGameMetadata } from './finalize-game-metadata.js';
import { isLargeStudio } from './indie-classifier.js';
import type { GameData } from './types.js';

export interface NewReleasesSelectionResult {
  adopted: GameData[];
  rejected: Array<{ title: string; reason: string }>;
  /** 採用・拒否の処理を経ていない残り候補（removeZombieGames 後の補充用） */
  reserves: GameData[];
}

/** 大手スタジオゲートを通過したゲームが前提。cover・developer・sourceUrl をすべて必須とする。 */
const NEW_RELEASE_REQUIRED = { cover: true, developer: true, sourceUrl: true } as const;

/** API 呼び出し上限（targetCount × 3）。IGDB/Steam Storefront のクォータ保護。 */
const MAX_ATTEMPTS_MULTIPLIER = 3;

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
 * @param ranked 品質ゲート・実存フィルタ適用済み、スコア降順の候補リスト
 * @param targetCount 採用目標件数
 */
export async function selectNewReleasesWithFallback(
  ranked: GameData[],
  targetCount: number
): Promise<NewReleasesSelectionResult> {
  const maxAttempts = targetCount * MAX_ATTEMPTS_MULTIPLIER;
  const queue = [...ranked];
  const adopted: GameData[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];
  let attempts = 0;

  while (adopted.length < targetCount && queue.length > 0 && attempts < maxAttempts) {
    const candidate = queue.shift()!;
    attempts++;

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
      // finalize 後に developer が確定した状態で大手スタジオ判定を行う
      const studioResult = isLargeStudio(finalizeResult.game.developer);
      if (!studioResult.hit) {
        console.log(
          JSON.stringify({
            scope: 'select-newreleases-with-fallback',
            title: candidate.title,
            step: 'large-studio-gate',
            reason: `not-large-studio (developer="${finalizeResult.game.developer ?? ''}")`,
          })
        );
        rejected.push({ title: candidate.title, reason: 'not-large-studio' });
        continue;
      }
      // canonical 名を developer フィールドに書き戻す
      adopted.push({ ...finalizeResult.game, developer: studioResult.matched });
      continue;
    }

    rejected.push({ title: candidate.title, reason: finalizeResult.reason });
  }

  const adoptedTitles = new Set(adopted.map((g) => g.normalizedTitle));
  const rejectedTitles = new Set(rejected.map((r) => r.title));
  const reserves = queue.filter(
    (g) => !adoptedTitles.has(g.normalizedTitle) && !rejectedTitles.has(g.title)
  );

  return { adopted, rejected, reserves };
}
