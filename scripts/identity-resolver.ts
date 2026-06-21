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

export interface ResolveOutput {
  stores: StoreLink[];
  /** 各プラットフォームの解決トレース（観測可能性のため） */
  trace: Record<StorePlatform, { attempts: { method: string; ok: boolean; reason?: string }[] }>;
}

/**
 * プラットフォーム名リストに mobile 系キーワードが含まれるか判定
 */
function hasMobilePlatform(platforms?: string[]): boolean {
  if (!platforms?.length) return false;
  const lower = platforms.map((p) => p.toLowerCase());
  return lower.some((p) =>
    p.includes('ios') ||
    p.includes('android') ||
    p.includes('mobile') ||
    p.includes('iphone') ||
    p.includes('ipad')
  );
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
  const trace = {} as ResolveOutput['trace'];

  // ─── Steam（常時実行） ────────────────────────────────────────────────────
  const steamResult = await resolveSteam({
    title: input.title,
    titleJa: input.titleJa,
    igdbSlug: input.igdbSlug,
    releaseDate: input.releaseDate,
    igdbWebsites: input.igdbWebsites,
    knownSteamAppId: input.knownSteamAppId,
  });
  trace.steam = { attempts: steamResult.attempts };
  if (steamResult.link) stores.push(steamResult.link);

  // ─── Nintendo（常時実行） ──────────────────────────────────────────────────
  const nintendoResult = await resolveNintendo({
    title: input.title,
    titleJa: input.titleJa,
    releaseDate: input.releaseDate,
    igdbWebsites: input.igdbWebsites,
  });
  trace.nintendo = { attempts: nintendoResult.attempts };
  if (nintendoResult.link) stores.push(nintendoResult.link);

  // ─── PlayStation（常時実行） ───────────────────────────────────────────────
  const psResult = await resolvePlayStation({
    title: input.title,
    titleJa: input.titleJa,
    releaseDate: input.releaseDate,
    igdbWebsites: input.igdbWebsites,
  });
  trace.playstation = { attempts: psResult.attempts };
  if (psResult.link) stores.push(psResult.link);

  // ─── Xbox / iOS / Android は PR-2 スコープ外（trace エントリのみ設置） ─────
  // Xbox は常時実行予定（PR-3 以降で実装）
  trace.xbox = { attempts: [{ method: 'not-implemented', ok: false, reason: 'Xbox resolver is planned for PR-3' }] };

  if (hasMobilePlatform(input.platforms)) {
    trace.appstore = { attempts: [{ method: 'not-implemented', ok: false, reason: 'App Store resolver is planned for PR-3' }] };
    trace.googleplay = { attempts: [{ method: 'not-implemented', ok: false, reason: 'Google Play resolver is planned for PR-3' }] };
  }

  return { stores, trace };
}
