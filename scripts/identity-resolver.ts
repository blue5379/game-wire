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

  // Steam / Nintendo / PlayStation は独立しているため並列実行
  const [steamResult, nintendoResult, psResult] = await Promise.all([
    resolveSteam({
      title: input.title,
      titleJa: input.titleJa,
      igdbSlug: input.igdbSlug,
      releaseDate: input.releaseDate,
      igdbWebsites: input.igdbWebsites,
      knownSteamAppId: input.knownSteamAppId,
    }),
    resolveNintendo({
      title: input.title,
      titleJa: input.titleJa,
      releaseDate: input.releaseDate,
      igdbWebsites: input.igdbWebsites,
    }),
    resolvePlayStation({
      title: input.title,
      titleJa: input.titleJa,
      releaseDate: input.releaseDate,
      igdbWebsites: input.igdbWebsites,
    }),
  ]);

  trace.steam = { attempts: steamResult.attempts };
  if (steamResult.link) stores.push(steamResult.link);

  trace.nintendo = { attempts: nintendoResult.attempts };
  if (nintendoResult.link) stores.push(nintendoResult.link);

  trace.playstation = { attempts: psResult.attempts };
  if (psResult.link) stores.push(psResult.link);

  // Xbox は常時実行予定（PR-3 以降で実装）
  trace.xbox = { attempts: [{ method: 'not-implemented', ok: false, reason: 'Xbox resolver is planned for PR-3' }] };

  if (hasMobilePlatform(input.platforms)) {
    trace.appstore = { attempts: [{ method: 'not-implemented', ok: false, reason: 'App Store resolver is planned for PR-3' }] };
    trace.googleplay = { attempts: [{ method: 'not-implemented', ok: false, reason: 'Google Play resolver is planned for PR-3' }] };
  }

  return { stores, trace };
}
