import { finalizeGameMetadata } from './finalize-game-metadata.js';
import type { GameData } from './types.js';

export interface NewReleasesSelectionResult {
  adopted: GameData[];
  rejected: Array<{ title: string; reason: string }>;
  /** 採用・拒否の処理を経ていない残り候補（removeZombieGames 後の補充用） */
  reserves: GameData[];
}

/** developer は Resolver（後段）に委譲。cover と sourceUrl のみ選定時ゲートとする。 */
const NEW_RELEASE_REQUIRED = { cover: true, developer: false, sourceUrl: true } as const;

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
      adopted.push(finalizeResult.game);
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
