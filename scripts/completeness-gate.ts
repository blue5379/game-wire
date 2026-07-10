/**
 * Completeness Gate（PR-5）
 *
 * 設計書 D. Completeness Gate
 * removeZombieGames の直後・fs.writeFileSync の前に挿入する客観事実の機械検証（LLM 不使用）。
 *
 * ルール:
 * R1: ストアリンク最低1件（stores.length === 0 かつ official も無い）
 * R2: Steam 実在取りこぼし検知（Resolver が confidence>=medium で Steam URL を返したのに stores[] に Steam が乗っていない）
 * R2b: 他プラットフォーム取りこぼし検知（platforms に Switch/PS/Xbox が含まれるのに confidence=high で URL が取れたのに乗っていない）
 * R3: 公式 URL 到達性（official が HTTP 200 以外）
 * R4: カバー画像ホスト許可リスト（images.igdb.com / steamstatic.com サブドメイン以外）
 * R5: 識別子整合（steamAppId が指す Steam 実体のタイトル/発売年が game メタと同一ゲームを指さない）
 *     — Issue #166「別ゲームのメタ混入」を生成前に機械検出する。生成後の
 *       validateGameSourceConsistency（build-issue）の前倒し版。
 *
 * 動作は 2 軸で決まる:
 * 1. mode（環境変数 COMPLETENESS_GATE）: 違反が残ったときの号全体の扱い
 *    - "warn"（DEV_MODE 既定）: 違反があっても発行。レポート記録のみ
 *    - "replace": 差し替え適格な違反は差し替え、残った違反は許容して発行
 *    - "fail"（本番既定）: 差し替え適格な違反は差し替え、差し替え不能な違反が残れば呼び出し側で process.exit(1)
 * 2. RULE_REPLACEABLE（ルール属性）: そのルールの違反はゲーム差し替えで解消できるか
 *    - true（R1/R3/R4）: 別のゲームなら解決見込み。ゲーム固有のデータ欠落・到達性の問題
 *    - false（R2/R2b）: 差し替えても再発しうる。内部整合性のバグを疑うシグナル
 */

import type { GameData, SelectedGames, StoreLink } from './types.js';
import { headOk } from './url-health.js';
import { explainGameIdentity, extractYearFromDate } from './game-identity.js';

export type GateMode = 'warn' | 'replace' | 'fail';

export type ViolationId = 'R0' | 'R1' | 'R2' | 'R2b' | 'R3' | 'R4' | 'R5';

/**
 * ルール別の「差し替えで解消できるか」属性。
 * true: 別ゲームなら解決見込みがある → replace / fail モードで差し替えを試みる
 * false: 差し替えても再発しうる内部バグシグナル → 差し替えず fail 判定に残す
 *
 * R0 は warn-only（hasMutableViolations に含まれない）ため、この属性は判定に使わない。
 */
export const RULE_REPLACEABLE: Record<ViolationId, boolean> = {
  R0: false,
  R1: true,
  R2: false,
  R2b: false,
  R3: true,
  R4: true,
  // R5（別ゲームのメタ混入）は差し替えで解消できる: そのゲーム枠を別ゲームに丸ごと
  // 入れ替えれば混入したメタも一緒に外れ、号は正しい実体で成立する。
  R5: true,
};

export interface GateViolation {
  ruleId: ViolationId;
  gameTitle: string;
  detail: string;
}

export interface GateReport {
  mode: GateMode;
  violations: GateViolation[];
  replacedGames: string[];
  /**
   * 差し替え前の状態で newReleases / indies に mutable violation（R0 以外）があったか。
   * レポート・観測用。fail 判定には unresolvedMutableViolations を使う。
   */
  hasMutableViolations: boolean;
  /**
   * 差し替え後もなお newReleases / indies に mutable violation が残っているか。
   * 以下のいずれかで true になる:
   * - replaceable=false のルール違反があった（差し替え対象外）
   * - replaceable=true の違反はあったが reserves 枯渇でスロットを埋められなかった
   * mode=fail の exit 判定は呼び出し側がこのフラグを使う。
   */
  unresolvedMutableViolations: boolean;
}

/**
 * identity-resolver-trace.json の型（必要な部分のみ）
 * 各ゲームタイトル → platform → { attempts[] }
 */
export type ResolverTrace = Record<
  string,
  Partial<
    Record<
      string,
      { attempts: { method: string; ok: boolean; reason?: string }[] }
    >
  >
>;

/**
 * 動作モードを環境変数から取得する。
 * DEV_MODE=true のときデフォルト "warn"、それ以外は "fail"（PR-6 で本番デフォルト昇格）。
 */
export function getGateMode(): GateMode {
  const env = process.env.COMPLETENESS_GATE;
  if (env === 'warn' || env === 'replace' || env === 'fail') return env;
  return process.env.DEV_MODE === 'true' ? 'warn' : 'fail';
}

const ALLOWED_IMAGE_HOSTS = [
  'images.igdb.com',
  'steamstatic.com', // cdn.cloudflare.*, shared.akamai.* など Steam CDN サブドメイン全般を許可
];

const CONSOLE_PLATFORMS = ['nintendo', 'switch', 'playstation', 'ps3', 'ps4', 'ps5', 'xbox'];

/**
 * ゲームの platforms 配列にコンソール系が含まれるか
 */
export function hasConsolePlatform(platforms?: string[]): boolean {
  if (!platforms?.length) return false;
  return platforms.some((p) =>
    CONSOLE_PLATFORMS.some((keyword) => p.toLowerCase().includes(keyword))
  );
}

/**
 * resolverTrace の当該ゲームにおいて、指定 platform で confidence>=medium の成功 attempt があるか
 * R2 / R2b の「Resolver が解決したのに乗っていない」検知に使用する
 */
export function traceHasConfidentResult(
  trace: ResolverTrace | undefined,
  gameTitle: string,
  platform: string,
  minConfidence: 'medium' | 'high'
): boolean {
  if (!trace) return false;
  const gameTrace = trace[gameTitle];
  if (!gameTrace) return false;
  const platformTrace = gameTrace[platform];
  if (!platformTrace) return false;
  const hasOk = platformTrace.attempts.some((a) => a.ok);
  if (!hasOk) return false;
  // trace には confidence が直接入っていないため、
  // ok=true の attempt が存在することを「medium 以上」とみなす。
  // （Resolver の実装上、ok=true は confidence=high か medium のどちらか）
  // minConfidence=high の場合は、method が "known-appid" / "igdb-website" / "storesearch" で ok=true のみを high とみなす
  if (minConfidence === 'high') {
    return platformTrace.attempts.some(
      (a) => a.ok && ['known-appid', 'igdb-website', 'storesearch'].includes(a.method)
    );
  }
  return true;
}

/**
 * R0: プラットフォームデータ欠損チェック
 * platforms が空の場合、Nintendo/PS/Xbox resolver が全スキップされ completeness が検証不能になる。
 * warn-only（mode に関わらず fail 対象にしない）。
 */
export function checkR0(game: GameData): GateViolation | null {
  if (!game.platforms?.length) {
    return {
      ruleId: 'R0',
      gameTitle: game.title,
      detail: 'platforms が空のため Nintendo/PS/Xbox resolver がスキップされ completeness を検証できない',
    };
  }
  return null;
}

/**
 * R1: ストアリンク最低1件チェック
 */
export function checkR1(game: GameData): GateViolation | null {
  const hasStore = (game.sourceUrls?.stores?.length ?? 0) > 0;
  const hasOfficial = !!game.sourceUrls?.official;
  const hasSteamLegacy = !!game.sourceUrls?.steam;
  if (!hasStore && !hasOfficial && !hasSteamLegacy) {
    return {
      ruleId: 'R1',
      gameTitle: game.title,
      detail: 'stores.length === 0 かつ official も steam も無い',
    };
  }
  return null;
}

/**
 * R2: Steam 実在取りこぼし検知
 * Resolver が confidence>=medium で Steam URL を解決できたのに stores[] に Steam が乗っていない
 */
export function checkR2(game: GameData, trace: ResolverTrace | undefined): GateViolation | null {
  const hasSteamInStores = game.sourceUrls?.stores?.some((s: StoreLink) => s.platform === 'steam');
  if (hasSteamInStores) return null;
  // trace で Steam が解決されているか確認
  if (traceHasConfidentResult(trace, game.title, 'steam', 'medium')) {
    return {
      ruleId: 'R2',
      gameTitle: game.title,
      detail: 'Resolver が Steam URL を解決したが stores[] に乗っていない',
    };
  }
  return null;
}

/**
 * R2b: 他プラットフォーム取りこぼし検知
 * platforms に Switch/PS/Xbox が含まれ、かつ Resolver が confidence=high で解決できたのに乗っていない
 */
export function checkR2b(game: GameData, trace: ResolverTrace | undefined): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!hasConsolePlatform(game.platforms)) return violations;

  // platformKeywords: game.platforms[] にこのキーワードが含まれる場合のみチェック対象とする。
  // hasConsolePlatform で「何らかのコンソール対応」は確認済みだが、
  // PS 専売ゲームに Nintendo/Xbox の R2b 違反を出さないよう各プラットフォームで絞り込む。
  const platformChecks: { traceKey: string; storeKey: string; label: string; platformKeywords: string[] }[] = [
    { traceKey: 'nintendo', storeKey: 'nintendo', label: 'Nintendo', platformKeywords: ['nintendo', 'switch'] },
    { traceKey: 'playstation', storeKey: 'playstation', label: 'PlayStation', platformKeywords: ['playstation', 'ps3', 'ps4', 'ps5'] },
    { traceKey: 'xbox', storeKey: 'xbox', label: 'Xbox', platformKeywords: ['xbox'] },
  ];

  const platformsLower = (game.platforms ?? []).map((p) => p.toLowerCase());

  for (const { traceKey, storeKey, label, platformKeywords } of platformChecks) {
    const gameHasPlatform = platformKeywords.some((kw) => platformsLower.some((p) => p.includes(kw)));
    if (!gameHasPlatform) continue;
    const hasInStores = game.sourceUrls?.stores?.some((s: StoreLink) => s.platform === storeKey);
    if (hasInStores) continue;
    if (traceHasConfidentResult(trace, game.title, traceKey, 'high')) {
      violations.push({
        ruleId: 'R2b',
        gameTitle: game.title,
        detail: `Resolver が ${label} URL を高確信度で解決したが stores[] に乗っていない`,
      });
    }
  }

  return violations;
}

/**
 * R3: 公式 URL 到達性チェック
 */
export async function checkR3(game: GameData): Promise<GateViolation | null> {
  const official = game.sourceUrls?.official;
  if (!official) return null;
  const ok = await headOk(official, 8000);
  if (!ok) {
    return {
      ruleId: 'R3',
      gameTitle: game.title,
      detail: `official URL が HTTP 200 以外: ${official}`,
    };
  }
  return null;
}

/**
 * R4: カバー画像ホスト許可リストチェック
 */
export function checkR4(game: GameData): GateViolation | null {
  const cover = game.coverImage;
  if (!cover) return null;
  try {
    const host = new URL(cover).hostname;
    const allowed = ALLOWED_IMAGE_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    if (!allowed) {
      return {
        ruleId: 'R4',
        gameTitle: game.title,
        detail: `カバー画像のホストが許可リスト外: ${host}`,
      };
    }
  } catch {
    return {
      ruleId: 'R4',
      gameTitle: game.title,
      detail: `カバー画像 URL が不正: ${cover}`,
    };
  }
  return null;
}

// R5: Steam Storefront API 呼び出しのタイムアウト（ミリ秒）
const R5_STOREFRONT_TIMEOUT_MS = 10000;

/**
 * steamAppId が指す Steam 実体を appdetails API から取得する（R5 用）。
 * 取得できない場合（API 不達・appId 無効等）は undefined を返し、呼び出し側は fail-open する。
 *
 * テストからは fetchImpl を差し替えて実ネットワークなしで検証する。
 */
export async function fetchSteamEntity(
  appId: number,
  fetchImpl: typeof fetch = fetch
): Promise<{ name?: string; releaseDate?: string } | undefined> {
  try {
    // l=english で取得する。R5 は game.title（IGDB 由来で英語名主体）と照合するため、
    // 言語軸を英語に揃える必要がある。l=japanese だと Steam name が日本語ローカライズ名
    // （例: appId=1091500 → "サイバーパンク2077"）で返り、英語の game.title と
    // title-mismatch して正規ゲームを誤検知する（コードレビューで実測確認）。
    // cc は付けない: 同一性照合が目的で地域別の販売可否・価格は不要。
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(R5_STOREFRONT_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<
      string,
      { success?: boolean; data?: { name?: string; release_date?: { date?: string; coming_soon?: boolean } } }
    >;
    const entry = json[String(appId)];
    if (!entry?.success || !entry.data) return undefined;
    // 未発売（coming_soon）は発売日を信頼しない（validateGameSourceConsistency と同方針）
    const releaseDate = entry.data.release_date?.coming_soon
      ? undefined
      : entry.data.release_date?.date;
    return { name: entry.data.name, releaseDate };
  } catch {
    return undefined;
  }
}

/**
 * R5: 識別子整合チェック（Issue #166「別ゲームのメタ混入」の生成前ブロック）。
 *
 * steamAppId が指す Steam 実体のタイトル/発売年を取得し、game メタ（title/releaseDate）が
 * その実体と同一ゲームを指すかを explainGameIdentity（store プロファイル）で照合する。
 * 別ゲームと判定されたら R5 違反。
 *
 * プロファイルに store（prefix 一致・年差±2）を使う理由:
 * - exact（store-strict）は「Witcher 3」vs Steam 正式名「Witcher 3: Wild Hunt」のような
 *   サブタイトル付きで正規ゲームを誤検知（FP）する。R5 の FP は本番で正規ゲームを
 *   差し替え/号停止させるため最も避けたい。
 * - loose（aggregation）は部分一致・先頭3語一致が緩く、別作品の混入を見逃す（FN）。
 * - store の prefix 一致がその中庸。見逃しは後段 validateGameSourceConsistency が保険で拾う。
 *
 * titleJa は照合に使わない: Steam name は l=english で英語取得しており、英語の game.title と
 * 突き合わせるため。日本語名を混ぜると言語軸がずれる（explainGameIdentity 自体も #PR-A 以降
 * titleJa をクロス照合しない）。
 *
 * 重要: 照合では steamAppId を渡さない。game と実体は同じ appId を持つため渡すと
 * explainGameIdentity が step1 で自明に一致（自己参照）してしまう。ここで検証したいのは
 * 「その appId が指す実体のタイトルが、混入した game メタと食い違っていないか」なので
 * title + releaseDate のみで照合する。
 *
 * fail-open: steamAppId が無い / Storefront 実体が取れない場合は違反を出さない
 * （誤って号を落とさない。検出できたときだけ違反にする）。
 */
export async function checkR5(
  game: GameData,
  fetchImpl: typeof fetch = fetch
): Promise<GateViolation | null> {
  if (game.steamAppId === undefined) return null;

  const entity = await fetchSteamEntity(game.steamAppId, fetchImpl);
  if (!entity?.name) return null; // fail-open（実体タイトルが取れなければ照合しない）

  const verdict = explainGameIdentity(
    { title: game.title, releaseDate: game.releaseDate },
    { title: entity.name, releaseDate: entity.releaseDate },
    'store'
  );

  if (!verdict.same) {
    const gameYear = extractYearFromDate(game.releaseDate);
    const steamYear = extractYearFromDate(entity.releaseDate);
    return {
      ruleId: 'R5',
      gameTitle: game.title,
      detail:
        `steamAppId=${game.steamAppId} が指す Steam 実体「${entity.name}」が game メタ「${game.title}」と` +
        `別ゲームと判定されました（${verdict.reason}）。別作品のメタデータが混入している可能性があります。` +
        ` game=${game.releaseDate ?? '年不明'}(${gameYear ?? '?'}) / steam=${entity.releaseDate ?? '年不明'}(${steamYear ?? '?'})`,
    };
  }
  return null;
}

/**
 * 1ゲームに対してすべてのルールを検証する（R3 / R5 は非同期・ネットワークあり）
 *
 * @param fetchImpl R5 の Steam Storefront 呼び出しに使う fetch。テストで差し替える。
 */
export async function checkGame(
  game: GameData,
  trace: ResolverTrace | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<GateViolation[]> {
  const violations: GateViolation[] = [];

  // R0 は warn-only — mode=fail でも exit 判定には使わない（hasMutableViolations に含まれない）
  const r0 = checkR0(game);
  if (r0) violations.push(r0);

  const r1 = checkR1(game);
  if (r1) violations.push(r1);

  const r2 = checkR2(game, trace);
  if (r2) violations.push(r2);

  violations.push(...checkR2b(game, trace));

  const r3 = await checkR3(game);
  if (r3) violations.push(r3);

  const r4 = checkR4(game);
  if (r4) violations.push(r4);

  const r5 = await checkR5(game, fetchImpl);
  if (r5) violations.push(r5);

  return violations;
}

/**
 * Completeness Gate のメインエントリポイント
 *
 * @param selectedGames 選定済みゲーム（removeZombieGames 後）
 * @param trace identity-resolver-trace.json の内容（undefined 可）
 * @param reserveGames 差し替え候補（mode=replace の場合に使用）。reservesByKey が指定されたスロットはそちらが優先される
 * @param mode 動作モード
 * @param reservesByKey スロット別予備候補。指定されたキーは reserveGames の代わりにこちらを使う
 * @param fetchImpl R5 の Steam Storefront 呼び出しに使う fetch（テストで差し替える）
 * @returns GateReport
 */
export async function runCompletenessGate(
  selectedGames: SelectedGames,
  trace: ResolverTrace | undefined,
  reserveGames: GameData[],
  mode: GateMode,
  reservesByKey?: Partial<Record<'newReleases' | 'indies', GameData[]>>,
  fetchImpl: typeof fetch = fetch
): Promise<GateReport> {
  const report: GateReport = {
    mode,
    violations: [],
    replacedGames: [],
    hasMutableViolations: false,
    unresolvedMutableViolations: false,
  };

  // 対象: newReleases + indies（featured / classic は差し替えが複雑なため warn のみ）
  const mutableArrays: { key: 'newReleases' | 'indies'; arr: GameData[] }[] = [
    { key: 'newReleases', arr: selectedGames.newReleases },
    { key: 'indies', arr: selectedGames.indies },
  ];

  // featured / classic は violations 記録のみ（差し替えしない）
  const singletons: (GameData | null)[] = [selectedGames.featured, selectedGames.classic];

  /**
   * ゲームごとの違反を溜め込む。差し替え可否は「そのゲームの違反すべてが replaceable=true」であるかで判定する。
   * 1件でも replaceable=false があれば、差し替えても再発する疑いがあるので差し替え対象にしない。
   */
  const gameViolations = new Map<string, GateViolation[]>();

  for (const { arr } of mutableArrays) {
    for (const game of arr) {
      const v = await checkGame(game, trace, fetchImpl);
      if (v.length > 0) {
        report.violations.push(...v);
        // R0 は warn-only なので mutable 判定に含めない
        const mutable = v.filter((vio) => vio.ruleId !== 'R0');
        if (mutable.length > 0) {
          gameViolations.set(game.title, mutable);
        }
      }
    }
  }

  // featured / classic の違反も記録（差し替えなし・fail 判定対象外）
  for (const game of singletons) {
    if (!game) continue;
    const v = await checkGame(game, trace, fetchImpl);
    report.violations.push(...v);
  }

  report.hasMutableViolations = gameViolations.size > 0;

  // 差し替え対象タイトル（replaceable=true の違反のみを持つゲーム）と、
  // 差し替え不能タイトル（replaceable=false の違反を1件でも含むゲーム）に分ける。
  const replaceableTitles = new Set<string>();
  const unreplaceableTitles = new Set<string>();
  for (const [title, violations] of gameViolations) {
    const allReplaceable = violations.every((vio) => RULE_REPLACEABLE[vio.ruleId]);
    if (allReplaceable) {
      replaceableTitles.add(title);
    } else {
      unreplaceableTitles.add(title);
    }
  }

  // 差し替えを実行するのは mode=replace または mode=fail の時のみ（warn は現状のまま維持）
  const shouldReplace = (mode === 'replace' || mode === 'fail') && replaceableTitles.size > 0;

  /**
   * 差し替えを試みた key ごとに、必要枠を埋められたか記録する。
   * ここで拾いたいのは「Gate による除去のせいで足りなくなった」ケースのみで、
   * 元々コンテンツが不足していた場合（Gate 以前の問題）は扱わない。
   */
  const replacementShortfall = new Set<'newReleases' | 'indies'>();

  if (shouldReplace) {
    // 全スロットの使用中タイトルから差し替え対象を除外して dedup セットを構築する。
    // 差し替え対象は取り除かれるため、その normalizedTitle をブロックしたままにすると
    // 同じ normalizedTitle を持つ予備候補が不当に弾かれる（レビュー指摘 #2）。
    const usedTitles = new Set([
      ...selectedGames.newReleases
        .filter((g) => !replaceableTitles.has(g.title))
        .map((g) => g.normalizedTitle),
      ...selectedGames.indies
        .filter((g) => !replaceableTitles.has(g.title))
        .map((g) => g.normalizedTitle),
    ]);

    for (const { key, arr } of mutableArrays) {
      // このスロットに含まれる差し替え対象ゲーム数（= 埋め直しが必要な枠数）
      const needed = arr.filter((g) => replaceableTitles.has(g.title)).length;
      // unreplaceable な違反ゲームは配列に残す（fail 対象として次段で検知される）
      const kept = arr.filter((g) => !replaceableTitles.has(g.title));

      if (needed <= 0) {
        selectedGames[key] = kept;
        continue;
      }

      const fills: GameData[] = [];
      const candidatePool = reservesByKey?.[key] ?? reserveGames;
      for (const candidate of candidatePool) {
        if (fills.length >= needed) break;
        if (usedTitles.has(candidate.normalizedTitle)) continue;
        if (replaceableTitles.has(candidate.title)) continue;
        if (unreplaceableTitles.has(candidate.title)) continue;
        // 候補も Gate で検証
        const cv = await checkGame(candidate, trace, fetchImpl);
        if (cv.length === 0) {
          fills.push(candidate);
          usedTitles.add(candidate.normalizedTitle);
          report.replacedGames.push(candidate.title);
        }
      }

      selectedGames[key] = [...kept, ...fills];

      if (fills.length < needed) {
        console.warn(
          `  [CompletenessGate] ${key}: ${needed} 枠を差し替える必要があったが ${fills.length} 件しか補充できなかった`
        );
        replacementShortfall.add(key);
      }
    }
  }

  // 差し替え後の未解消違反を判定する
  // - unreplaceable な違反ゲーム（R2/R2b 系）は selectedGames に残っているので fail 対象
  // - replaceable な違反でも reserves 枯渇でスロットが埋まらなかった場合は号のコンテンツが不足 → fail 対象
  report.unresolvedMutableViolations =
    unreplaceableTitles.size > 0 || replacementShortfall.size > 0;

  return report;
}
