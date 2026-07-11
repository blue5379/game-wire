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
 * 大手新作ゲームとして採用できるか検証する（選定ループと差し替えで共用）。
 * finalize → isLargeStudio の順で評価し、適格なら finalized GameData を返す。
 * 不適格なら null を返す。
 *
 * runCompletenessGate の slotGates['newReleases'] として渡すことで、
 * Gate が差し替え候補を補充する際にも選定基準と同じゲートを通す。
 * これにより「枠を埋めるために不適格なゲームを載せない」という設計方針を保証する。
 */
export async function vetNewReleaseCandidate(game: GameData): Promise<GameData | null> {
  let finalizeResult: Awaited<ReturnType<typeof finalizeGameMetadata>>;
  try {
    finalizeResult = await finalizeGameMetadata(game, NEW_RELEASE_REQUIRED);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'vet-new-release-candidate',
        title: game.title,
        step: 'finalize',
        reason: String(err),
      })
    );
    return null;
  }

  if (!finalizeResult.ok) return null;

  // developer または publisher のいずれかが大手なら通過とみなす。
  // 受託開発の大手 IP タイトル（developer=受託スタジオ、publisher=大手）をカバーする。
  const devResult = isLargeStudio(finalizeResult.game.developer);
  const pubResult = isLargeStudio(finalizeResult.game.publisher);
  if (!devResult.hit && !pubResult.hit) {
    console.log(
      JSON.stringify({
        scope: 'vet-new-release-candidate',
        title: game.title,
        step: 'large-studio-gate',
        reason: `not-large-studio (developer="${finalizeResult.game.developer ?? ''}", publisher="${finalizeResult.game.publisher ?? ''}")`,
      })
    );
    return null;
  }

  // developer が大手なら canonical 名で上書き（同一企業の表記ゆれ吸収。既存挙動）。
  // publisher のみ大手（受託開発）の場合、developer は finalize 結果のまま保持する。
  // Steam の developers[] には受託スタジオ名が載る（実測: Echoes of Aincrad は
  // developers=["Game Studio Inc."] / publishers=["Bandai Namco Entertainment Inc."]）ため、
  // publisher 名で上書きすると記事の開発元表記が事実と異なり、
  // validateGameSourceConsistency の developer 照合とも不一致になる。
  const finalDeveloper = devResult.hit ? devResult.matched : finalizeResult.game.developer;
  return { ...finalizeResult.game, developer: finalDeveloper };
}

/**
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

  // targetCount 件採用するか候補が尽きるまで評価する。
  // 以前は maxAttempts = targetCount × 3 で試行を打ち切っていたが、上位に非大手候補が
  // 数件並ぶだけで大手候補（後方）に到達できず、枠が埋まらない問題があった（Issue #189）。
  // finalizeGameMetadata 内の API 呼び出しは各候補で IGDB 最大1回＋Storefront 最大1回に
  // 制限済みのため、全候補を評価してもクォータ影響は候補数に比例するだけで限定的。
  // indie 側（select-indie-with-fallback.ts）と同じく候補が尽きるまで評価する挙動に揃える。
  while (adopted.length < targetCount && queue.length > 0) {
    const candidate = queue.shift()!;

    const vetted = await vetNewReleaseCandidate(candidate);
    if (vetted) {
      adopted.push(vetted);
      continue;
    }

    // vetting 失敗の理由を判定するため finalize を再実行するのはコスト大なので、
    // rejected には finalize 失敗か large-studio 不通過かを区別せず記録する。
    rejected.push({ title: candidate.title, reason: 'not-adopted' });
  }

  const adoptedTitles = new Set(adopted.map((g) => g.normalizedTitle));
  const rejectedTitles = new Set(rejected.map((r) => r.title));
  const reserves = queue.filter(
    (g) => !adoptedTitles.has(g.normalizedTitle) && !rejectedTitles.has(g.title)
  );

  return { adopted, rejected, reserves };
}
