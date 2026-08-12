/**
 * インディーゲーム候補の採用＋予備差し替えフロー（PR-C, Issue #97）
 *
 * 仕様:
 * 1. ranked（スコア順）を先頭から順に評価し、targetCount 件採用するまで繰り返す
 * 2. 通常ルート: finalizeGameMetadata → ok なら確定
 * 3. 話題性ルート: still-missing-required かつ developer のみ欠落 かつ 話題性閾値 OK
 *    → steamRawDeveloper（Steam Storefront developers[0] の生値）を developer に採用して確定
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
 */
export function meetsPopularityThreshold(game: GameData): boolean {
  if ((game.steamRecommendations ?? 0) >= POPULARITY_STEAM_REVIEWS_MIN) return true;
  if ((game.steamRank ?? Infinity) <= POPULARITY_STEAM_RANK_MAX) return true;
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
 * インディーゲームとして採用できるか検証する（選定ループと差し替えで共用）。
 * 通常ルート → 話題性ルートの順で評価し、適格なら finalized GameData を返す。
 * 不適格なら null を返す。
 *
 * runCompletenessGate の slotGates['indies'] として渡すことで、
 * Gate が差し替え候補を補充する際にも選定基準と同じゲートを通す。
 * これにより「枠を埋めるために不適格なゲームを載せない」という設計方針を保証する。
 */
export async function vetIndieCandidate(
  game: GameData
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
    // developer 側は静的リストに加え IGDB 開発本数（developerGameCount）による規模判定も適用する（§3.4）。
    // publisher 側の developed は規模指標にならないため本数判定は適用しない。
    const devHit = isLargeStudio(finalizeResult.game.developer, finalizeResult.game.developerGameCount).hit;
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
  //
  // Issue #274: meetsPopularityThreshold には finalize 前の `game` ではなく
  // finalize 後の `finalizeResult.game` を渡す。
  // finalizeGameMetadata は入力をシャローコピーして返す（入力オブジェクトは変更しない）ため、
  // Storefront API から取得した steamRecommendations は戻り値側にしか反映されない。
  // NORMAL_REQUIRED の steamRecommendations: true は Storefront 呼び出しをトリガーするための
  // フラグに過ぎず、取得した値そのものは finalizeResult.game を見なければ判定に使えない。
  // 同じ if 文内で isOnlyDeveloperMissing だけ finalize 後のオブジェクトを見ていたのに対し、
  // meetsPopularityThreshold が finalize 前のオブジェクトを見ていたのが不整合の原因だった。
  if (
    finalizeResult.reason === 'still-missing-required' &&
    isOnlyDeveloperMissing(finalizeResult.game) &&
    meetsPopularityThreshold(finalizeResult.game)
  ) {
    // Issue #280 A: 話題性ルートにも大手ゲートを掛ける。
    // `developer` は話題性ルートの到達条件（isOnlyDeveloperMissing）により必ず未設定なので、
    // 判定対象は `steamRawDeveloper`（isQualifiedCompanyName が弾く前の生値）。
    // Nintendo / Capcom / FromSoftware 等の単一トークン社名は isQualifiedCompanyName が
    // アカウント名と誤判定して弾いてしまうため、話題性ルートで steamRawDeveloper を見ないと
    // 大手ゲームの混入（ゲート抜け）が発生する（Issue #280 の欠陥1）。
    //
    // 通常ルート（L97）と違い IGDB 開発本数（developerGameCount）は渡さない。
    // developerGameCount は `developer` と同時にのみ書き込まれ（fetch-igdb.ts の
    // involved_companies 由来、および pickDeveloperGameCount のペアリングガード）、
    // `developer` を解除する経路は無い。よって `developer` 未設定が前提のこの経路では
    // 常に undefined であり、渡しても規模判定は発火しない。
    // 開発本数による規模判定をこの経路にも効かせるには、steamRawDeveloper に対応する
    // 開発本数を引く仕組みの新設が必要（Issue #280 の欠陥2、本PRの範囲外）。
    const rawDevHit = isLargeStudio(finalizeResult.game.steamRawDeveloper).hit;
    const pubHit = isLargeStudio(finalizeResult.game.publisher).hit;
    if (rawDevHit || pubHit) {
      console.log(
        JSON.stringify({
          scope: 'vet-indie-candidate',
          title: finalizeResult.game.title,
          step: 'large-studio-gate',
          reason: `not-indie via popularity route (steamRawDeveloper="${finalizeResult.game.steamRawDeveloper ?? ''}", publisher="${finalizeResult.game.publisher ?? ''}")`,
        })
      );
      return null;
    }
    // steamRawDeveloper をそのまま developer に入れる。
    // steamRawDeveloper が undefined の場合は developer も undefined のままとなり、
    // 直後の hasAllRequiredFields(adoptedGame, NORMAL_REQUIRED) が false を返すため
    // return null（候補不採用）に自然に落ちる。
    // ?? 'unknown' フォールバックは削除（根拠のない値を出力することになるため）。
    const adoptedGame: GameData = {
      ...finalizeResult.game,
      developer: finalizeResult.game.steamRawDeveloper,
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
  targetCount: number
): Promise<SelectionResult> {
  const queue = [...ranked];
  const adopted: GameData[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];

  while (adopted.length < targetCount && queue.length > 0) {
    const candidate = queue.shift()!;

    const vetted = await vetIndieCandidate(candidate);
    if (vetted) {
      adopted.push(vetted);
      continue;
    }

    rejected.push({ title: candidate.title, reason: 'not-adopted' });
  }

  return { adopted, rejected };
}
