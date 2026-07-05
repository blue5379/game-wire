/**
 * ゲームメタデータの補完・検証を一元化するモジュール（PR-B, Issue #97）
 *
 * 責務:
 * 1. IGDB 再検索 1 回 → Steam Storefront API 1 回で欠落フィールドを補完
 * 2. IGDB と Steam の発売日が ±90 日を超えて不一致なら date-mismatch で棄却
 * 3. coverImage に HEAD 200 検証済み URL のみセットし、coverImageOrientation を記録
 *    優先順: ① IGDB t_cover_big → ② Steam CDN library_600x900 → ③ Steam Storefront header_image
 * 4. 構造化エラーログ（サイレント catch 廃止）
 * 5. 必須情報チェック: 不足なら still-missing-required を返す
 */

import { enrichGameWithIGDB } from './fetch-igdb.js';
import { headOk, getImageOrientation } from './url-health.js';
import { parseSteamReleaseDate, isQualifiedCompanyName } from './steam-utils.js';
import type { GameData } from './types.js';

export type FinalizeRejection =
  | 'date-mismatch'
  | 'still-missing-required'
  | 'identity-mismatch';

export type FinalizeStatus =
  | { ok: true; game: GameData }
  | { ok: false; reason: FinalizeRejection; game: GameData };

export interface RequiredFields {
  cover: boolean;
  developer: boolean;
  sourceUrl: boolean;
  /** true のとき steamRecommendations がなければ Storefront API を呼ぶ（話題性ルート用） */
  steamRecommendations?: boolean;
}

const DATE_MISMATCH_DAYS =
  Number(process.env.FINALIZE_DATE_TOLERANCE_DAYS) || 90;

export async function finalizeGameMetadata(
  inputGame: GameData,
  required: RequiredFields
): Promise<FinalizeStatus> {
  // シャローコピー（入力を変更しない）
  const game: GameData = { ...inputGame };

  // --- 1. IGDB 再検索（最大 1 回）---
  if (game.steamAppId || game.igdbSlug) {
    try {
      const igdb = await enrichGameWithIGDB(game.title, {
        expectedYear: extractYear(game.releaseDate),
        // Issue #166: steamAppId があれば appId 逆引きを優先
        steamAppId: game.steamAppId,
      });
      if (igdb) {
        // Issue #166 再発対応: Steam appId アンカーを持つ候補で、IGDB 結果の appId を
        // 確証できない（Steam URL 未登録 or 不一致）場合は補完を保留する。
        // searchGameBySteamAppId で確定した結果は steamUrl に appId が補完されるため通過する。
        // store.steampowered.com アンカー付き regex（fetch-data.ts の extractSteamAppId と同一仕様）
        const igdbSteamAppId = igdb.steamUrl
          ? (() => { const m = igdb.steamUrl!.match(/store\.steampowered\.com\/app\/(\d+)/); return m ? parseInt(m[1], 10) : undefined; })()
          : undefined;
        const igdbConfirmed =
          game.steamAppId === undefined ||
          (igdbSteamAppId !== undefined && igdbSteamAppId === game.steamAppId);

        if (!igdbConfirmed) {
          console.warn(
            JSON.stringify({
              scope: 'finalize-game-metadata',
              title: game.title,
              step: 'igdb-appid-not-confirmed',
              reason: `steam=${game.steamAppId} igdb-steam=${igdbSteamAppId ?? 'none'} — skipping IGDB overwrite`,
            })
          );
        } else {
          // 既存値を上書きしない（?? 演算子で空欄のみ補完）
          game.developer = game.developer ?? igdb.developer;
          game.publisher = game.publisher ?? igdb.publisher;
          game.releaseDate = game.releaseDate ?? igdb.releaseDate;
          game.genres = game.genres.length > 0 ? game.genres : (igdb.genres ?? game.genres);
          game.platforms = game.platforms.length > 0 ? game.platforms : (igdb.platforms ?? game.platforms);
          game.developerCountry = game.developerCountry ?? igdb.developerCountry;
          game.summary = game.summary ?? igdb.summary;
          game.igdbRating = game.igdbRating ?? igdb.rating;
          game.igdbRatingCount = game.igdbRatingCount ?? igdb.ratingCount;
          if (igdb.slug) {
            game.igdbSlug = game.igdbSlug ?? igdb.slug;
            game.sourceUrls = game.sourceUrls ?? {};
            game.sourceUrls.igdb =
              game.sourceUrls.igdb ?? `https://www.igdb.com/games/${igdb.slug}`;
          }
          // IGDB websites(category=13)の Steam URL から appId を引き継ぐ
          // sourceUrls.steam の設定は reconcileSelectedGames（Identity Resolver）に委譲する
          if (igdb.steamUrl) {
            const appId = igdb.steamUrl.match(/\/app\/(\d+)/)?.[1];
            if (appId && game.steamAppId === undefined) {
              game.steamAppId = parseInt(appId, 10);
            }
          }

          // IGDB の発売日との ±90 日チェック（両方判明している場合のみ）
          if (igdb.releaseDate && inputGame.releaseDate) {
            const diff = dateDiffDays(inputGame.releaseDate, igdb.releaseDate);
            if (diff !== null && Math.abs(diff) > DATE_MISMATCH_DAYS) {
              console.warn(
                JSON.stringify({
                  scope: 'finalize-game-metadata',
                  title: game.title,
                  step: 'date-mismatch',
                  reason: `steam=${inputGame.releaseDate} igdb=${igdb.releaseDate} diff=${diff}days`,
                })
              );
              return { ok: false, reason: 'date-mismatch', game };
            }
          }

          // coverImage 候補: IGDB t_cover_big（HEAD 200 検証）
          if (!game.coverImage && igdb.coverUrl) {
            const alive = await headOk(igdb.coverUrl).catch((err) => {
              console.warn(
                JSON.stringify({
                  scope: 'finalize-game-metadata',
                  title: game.title,
                  step: 'igdb-cover-head',
                  reason: String(err),
                })
              );
              return false;
            });
            if (alive) {
              const orientation = await getImageOrientation(igdb.coverUrl).catch(() => null);
              game.coverImage = igdb.coverUrl;
              game.coverImageOrientation = orientation ?? 'portrait';
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'finalize-game-metadata',
          title: game.title,
          step: 'igdb-enrich',
          reason: String(err),
        })
      );
    }
  }

  // --- 2. Steam CDN HEAD チェック（Storefront API とは独立）---
  // IGDB cover が取れなかった場合に試みる。Storefront API の成否に関係なく実行する
  if (!game.coverImage && game.steamAppId) {
    const cdnUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/library_600x900.jpg`;
    const alive = await headOk(cdnUrl).catch((err) => {
      console.warn(
        JSON.stringify({
          scope: 'finalize-game-metadata',
          title: game.title,
          step: 'steam-cdn-head',
          reason: String(err),
        })
      );
      return false;
    });
    if (alive) {
      const orientation = await getImageOrientation(cdnUrl).catch(() => null);
      game.coverImage = cdnUrl;
      game.coverImageOrientation = orientation ?? 'portrait';
    }
  }

  // --- 3. Steam Storefront API 補完（最大 1 回）---
  if (game.steamAppId && needsStorefrontCompletion(game, required)) {
    const appId = game.steamAppId;
    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=jp&l=japanese`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, { success?: boolean; data?: any }>;
      const entry = json[String(appId)];

      if (entry?.success && entry.data) {
        const data = entry.data;

        // releaseDate
        if (!game.releaseDate && data.release_date && !data.release_date.coming_soon) {
          const parsed = parseSteamReleaseDate(data.release_date.date);
          if (parsed) game.releaseDate = parsed;
        }

        // developer / publisher（品質ガード）
        // steamRawDeveloper は品質ガード通過前の生値を保存（話題性ルートの個人開発ラベル生成に使用）
        if (Array.isArray(data.developers) && data.developers.length > 0) {
          const raw = String(data.developers[0]).trim();
          game.steamRawDeveloper = game.steamRawDeveloper ?? raw;
          if (!game.developer && isQualifiedCompanyName(raw)) {
            game.developer = raw;
          }
        }
        if (!game.publisher && Array.isArray(data.publishers) && data.publishers.length > 0) {
          const pub = String(data.publishers[0]).trim();
          if (isQualifiedCompanyName(pub)) game.publisher = pub;
        }

        // steamRecommendations
        if (game.steamRecommendations === undefined && data.recommendations?.total != null) {
          game.steamRecommendations = Number(data.recommendations.total);
        }

        // sourceUrls.steam
        if (!game.sourceUrls?.steam) {
          game.sourceUrls = game.sourceUrls ?? {};
          game.sourceUrls.steam = `https://store.steampowered.com/app/${appId}`;
        }

        // coverImage 最終フォールバック: Steam Storefront header_image
        // API レスポンスに含まれるので存在保証だが、念のため headOk() で確認する
        if (!game.coverImage && data.header_image) {
          const headerUrl = String(data.header_image);
          const alive = await headOk(headerUrl).catch((err) => {
            console.warn(
              JSON.stringify({
                scope: 'finalize-game-metadata',
                title: game.title,
                step: 'header-image-head',
                reason: String(err),
              })
            );
            return false;
          });
          if (alive) {
            const orientation = await getImageOrientation(headerUrl).catch(() => null);
            game.coverImage = headerUrl;
            // header_image は横長（460×215）が基本。orientation 取得失敗なら landscape とみなす
            game.coverImageOrientation = orientation ?? 'landscape';
          }
        }

        // screenshots
        if ((!game.screenshots || game.screenshots.length === 0) && Array.isArray(data.screenshots)) {
          const urls = data.screenshots
            .map((s: any) => s?.path_full)
            .filter((u: unknown): u is string => typeof u === 'string')
            .slice(0, 5);
          if (urls.length > 0) game.screenshots = urls;
        }
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'finalize-game-metadata',
          title: game.title,
          step: 'storefront-api',
          reason: String(err),
        })
      );
    }
  }

  // --- 3. 必須情報チェック ---
  if (!hasAllRequiredFields(game, required)) {
    return { ok: false, reason: 'still-missing-required', game };
  }

  return { ok: true, game };
}

export function hasAllRequiredFields(game: GameData, required: RequiredFields): boolean {
  if (required.cover && !game.coverImage) return false;
  if (required.developer && !game.developer) return false;
  if (required.sourceUrl && !hasAnySourceUrl(game)) return false;
  return true;
}

function hasAnySourceUrl(game: GameData): boolean {
  return Boolean(
    game.sourceUrls?.steam ||
    game.sourceUrls?.official ||
    game.sourceUrls?.igdb ||
    (game.sourceUrls?.stores && game.sourceUrls.stores.length > 0)
  );
}

function needsStorefrontCompletion(game: GameData, required: RequiredFields): boolean {
  if (required.cover && !game.coverImage) return true;
  if (required.developer && !game.developer) return true;
  if (required.sourceUrl && !hasAnySourceUrl(game)) return true;
  if (required.steamRecommendations && game.steamRecommendations === undefined) return true;
  return false;
}

function extractYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const m = releaseDate.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : undefined;
}

function dateDiffDays(a: string, b: string): number | null {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}
