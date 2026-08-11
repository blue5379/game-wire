import { finalizeGameMetadata } from './finalize-game-metadata.js';
import type { GameData } from './types.js';

export interface NewReleasesSelectionResult {
  adopted: GameData[];
  rejected: Array<{ title: string; reason: string }>;
  /** 採用・拒否の処理を経ていない残り候補（removeZombieGames 後の補充用） */
  reserves: GameData[];
}

/** cover・developer・sourceUrl をすべて必須とする（finalizeGameMetadata の必須項目）。 */
const NEW_RELEASE_REQUIRED = { cover: true, developer: true, sourceUrl: true } as const;

/**
 * ゲームが「実存の根拠」を持つか判定する。
 * Steam ランキング由来 / IGDB 評価数 / YouTube 人気度 / Amazon 国内ランキング掲載
 * のいずれかを満たせば通過。
 *
 * options 省略時は Amazon 経路が無効になるだけで、既存呼び出し元の挙動は変わらない。
 */
export function hasExistenceEvidence(
  g: GameData,
  options?: { amazonRanked?: boolean }
): boolean {
  // 国内の全国的な販売ランキングに掲載されていること自体が実存の強い裏付けであるため。
  // これが無いと「Amazon掲載で品質条件は通るが実存条件で落ちる」ゲーム（Steam非掲載・
  // IGDB票数5未満の国内専用タイトル）が構造的に残ってしまう（§2.3 PR-B2）。
  if (options?.amazonRanked) return true;
  if (g.steamRank != null) return true;
  if (g.igdbRatingCount != null && g.igdbRatingCount >= 5) return true;
  if (g.youtubePopularity != null && g.youtubePopularity > 0) return true;
  return false;
}

/**
 * 新作ゲームとして採用できるか検証する（選定ループと差し替えで共用）。
 * finalize が通れば適格とみなし、finalized GameData を返す。
 * finalize が失敗した場合のみ null を返す。
 *
 * 企業規模（大手であること）は新作紹介の採用条件ではない（論点A / 仕様書 §1.1・§2.2 で
 * 撤廃が決定済み。docs/article-category-spec-review.md §11.1 確定事項 #1）。
 * 企業規模による除外はインディー枠専用の判定として維持される（同 #11、select-indie-with-fallback.ts）。
 *
 * runCompletenessGate の slotGates['newReleases'] として渡すことで、
 * Gate が差し替え候補を補充する際にも選定基準と同じ検証を通す。
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

  // developer の上書きは行わない（Issue #180, #277）。理由:
  // 1. `pickNewReleaseLabelCompany` 関数（indie-classifier.ts）のJSDocに
  //    「`game.developer` 自体は事実（受託スタジオ名）を保持する方針」と明記されており、
  //    生値の保持が設計方針である。
  // 2. canonical や displayName で上書きすると、Steam の developers[]/publishers[] と
  //    `companyNamesOverlap` 突合時に和名（`任天堂`）vs 英語表記（`Nintendo`）の不一致や、
  //    正規化名（`Nintendo EPD`）vs 生値（`Nintendo`）の不一致が発生し、
  //    同一性照合（`validate-article.ts` → `game-identity.ts`）が回帰する（Issue #277 実測）。
  // 3. Issue #180（受託開発タイトルのラベルを大手側に寄せる）の意図は、記事生成時の
  //    `pickNewReleaseLabelCompany` 呼び出しで既に達成されており、developer フィールド自体の
  //    上書きは不要である（実測: 公開19号の newRelease 記事32本で発火例は0件）。
  //
  // 上書きしないことで、Steam 生値がそのまま残り、全ケースで照合が通る
  // （実測: `overlap('Nintendo','Nintendo')=true`、
  // `overlap('Xbox Game Studios','Xbox Game Studios')=true`）。
  return finalizeResult.game;
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
  // 以前は maxAttempts = targetCount × 3 で試行を打ち切っていたが、上位に finalize 失敗
  // 候補が数件並ぶだけで採用可能な候補（後方）に到達できず、枠が埋まらない問題があった（Issue #189）。
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

    // vetting 失敗の理由を判定するため finalize を再実行するのはコスト大なので理由文字列は
    // 固定するが、企業規模ゲートを撤廃した現在は finalize 失敗のみが不採用理由になる。
    rejected.push({ title: candidate.title, reason: 'not-adopted' });
  }

  const adoptedTitles = new Set(adopted.map((g) => g.normalizedTitle));
  const rejectedTitles = new Set(rejected.map((r) => r.title));
  const reserves = queue.filter(
    (g) => !adoptedTitles.has(g.normalizedTitle) && !rejectedTitles.has(g.title)
  );

  return { adopted, rejected, reserves };
}
