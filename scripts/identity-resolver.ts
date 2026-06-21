/**
 * Game Identity Resolver
 *
 * 設計書 B. Game Identity Resolver
 * ゲームに対して、複数プラットフォームのストア URL と確信度を一元解決する単一ゲートウェイ。
 */

import type { StoreLink, StorePlatform } from './types.js';
import { resolveSteam } from './resolvers/steam.js';
import { resolveNintendo } from './resolvers/nintendo.js';
import { resolvePlayStation } from './resolvers/playstation.js';
import { resolveXbox } from './resolvers/xbox.js';
import { resolveAppStore } from './resolvers/appstore.js';
import { resolveGooglePlay } from './resolvers/googleplay.js';

export interface ResolveInput {
  title: string;
  titleJa?: string;
  igdbSlug?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
  knownSteamAppId?: number;
  /** ゲームが対応するプラットフォーム（iOS/Android resolver の実行判定に使用） */
  platforms?: string[];
}

/** プラットフォームごとの解決トレース */
export type PlatformTrace = { attempts: { method: string; ok: boolean; reason?: string }[] };

export interface ResolveOutput {
  stores: StoreLink[];
  /**
   * 各プラットフォームの解決トレース（観測可能性のため）。
   * 未実装プラットフォームや mobile 非対象ゲームのキーは存在しない場合がある。
   * Partial<Record<...>> ではなく index signature で表現することで
   * 既知キーへのアクセスは型安全、未設定キーは undefined として扱われる。
   */
  trace: Partial<Record<StorePlatform, PlatformTrace>>;
}

/**
 * プラットフォーム名リストに mobile 系キーワードが含まれるか判定
 */
function hasMobilePlatform(platforms?: string[]): boolean {
  if (!platforms?.length) return false;
  return platforms.some((p) => {
    const lower = p.toLowerCase();
    return (
      lower.includes('ios') ||
      lower.includes('android') ||
      lower.includes('mobile') ||
      lower.includes('iphone') ||
      lower.includes('ipad')
    );
  });
}

/**
 * ゲームのマルチプラットフォームストア URL を一元解決する
 *
 * 実行ポリシー（設計書より）:
 * - Steam: platforms に依らず常時実行
 * - Nintendo / PlayStation / Xbox: 常時実行
 * - iOS / Android: platforms に "iOS" / "Android" / "mobile" 系が含まれる場合のみ実行
 */
export async function resolveGameIdentity(input: ResolveInput): Promise<ResolveOutput> {
  const stores: StoreLink[] = [];
  const trace: ResolveOutput['trace'] = {};

  const isMobile = hasMobilePlatform(input.platforms);

  const resolverCommon = {
    title: input.title,
    titleJa: input.titleJa,
    releaseDate: input.releaseDate,
    igdbWebsites: input.igdbWebsites,
  };

  // Steam / Nintendo / PlayStation / Xbox は常時並列実行
  const [steamResult, nintendoResult, psResult, xboxResult] = await Promise.all([
    resolveSteam({
      title: input.title,
      titleJa: input.titleJa,
      igdbSlug: input.igdbSlug,
      releaseDate: input.releaseDate,
      igdbWebsites: input.igdbWebsites,
      knownSteamAppId: input.knownSteamAppId,
    }),
    resolveNintendo(resolverCommon),
    resolvePlayStation(resolverCommon),
    resolveXbox(resolverCommon),
  ]);

  trace.steam = { attempts: steamResult.attempts };
  if (steamResult.link) stores.push(steamResult.link);

  trace.nintendo = { attempts: nintendoResult.attempts };
  if (nintendoResult.link) stores.push(nintendoResult.link);

  trace.playstation = { attempts: psResult.attempts };
  if (psResult.link) stores.push(psResult.link);

  trace.xbox = { attempts: xboxResult.attempts };
  if (xboxResult.link) stores.push(xboxResult.link);

  // iOS / Android はプラットフォーム指定がある場合のみ実行
  if (isMobile) {
    const [appStoreResult, googlePlayResult] = await Promise.all([
      resolveAppStore(resolverCommon),
      resolveGooglePlay(resolverCommon),
    ]);

    trace.appstore = { attempts: appStoreResult.attempts };
    if (appStoreResult.link) stores.push(appStoreResult.link);

    trace.googleplay = { attempts: googlePlayResult.attempts };
    if (googlePlayResult.link) stores.push(googlePlayResult.link);
  }

  return { stores, trace };
}
