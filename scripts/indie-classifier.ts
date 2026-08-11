import type { GameData } from './types';

interface DeveloperEntry {
  canonical: string;
  aliases: string[];
}

// 大手スタジオ（デベロッパー判定用）
const LARGE_DEVELOPERS: ReadonlyArray<DeveloperEntry> = [
  { canonical: 'CD Projekt RED', aliases: ['cd projekt red', 'cdpr', 'cd projekt', 'cd projekt s.a.'] },
  { canonical: 'Rockstar Games', aliases: ['rockstar games', 'rockstar'] },
  { canonical: 'Take-Two Interactive', aliases: ['take-two interactive', 'take-two', 'take two interactive', 'take two'] },
  { canonical: 'FromSoftware', aliases: ['fromsoftware', 'from software'] },
  { canonical: 'Capcom', aliases: ['capcom', 'カプコン'] },
  { canonical: 'Square Enix', aliases: ['square enix', 'スクウェア・エニックス', 'square enix co', 'square enix ltd'] },
  { canonical: 'Bandai Namco Entertainment', aliases: ['bandai namco entertainment', 'bandai namco', 'bandai namco studios', 'namco bandai', 'namco'] },
  { canonical: 'Nintendo EPD', aliases: ['nintendo epd', 'nintendo', '任天堂'] },
  { canonical: 'Game Freak', aliases: ['game freak', 'ゲームフリーク'] },
  { canonical: 'Konami', aliases: ['konami', 'konami digital entertainment', 'konami holdings', 'コナミ', 'コナミデジタルエンタテインメント'] },
  { canonical: 'Sega', aliases: ['sega', 'セガ', 'sega games', 'sega corporation'] },
  { canonical: 'Atlus', aliases: ['atlus', 'アトラス'] },
  { canonical: 'Koei Tecmo', aliases: ['koei tecmo', 'koei tecmo games', 'コーエーテクモゲームス', 'コーエーテクモ'] },
  { canonical: 'Level-5', aliases: ['level-5', 'level 5', 'level5', 'レベルファイブ'] },
  { canonical: 'miHoYo', aliases: ['mihoyo', 'hoyoverse', 'cognosphere'] },
  { canonical: 'NetEase', aliases: ['netease', 'netease games'] },
  { canonical: 'Tencent', aliases: ['tencent', 'tencent games'] },
  { canonical: 'Ubisoft', aliases: [
    'ubisoft',
    'ubisoft montreal', 'ubisoft quebec', 'ubisoft toronto', 'ubisoft paris',
    'ubisoft annecy', 'ubisoft bordeaux', 'ubisoft reflections', 'ubisoft red storm',
    'ubisoft singapore', 'ubisoft massive', 'ubisoft milan', 'ubisoft bucharest',
    'ubisoft nadeo', 'ubisoft chengdu', 'ubisoft pune', 'ubisoft mumbai',
  ] },
  { canonical: 'Valve', aliases: ['valve', 'valve corporation', 'valve software'] },
  { canonical: 'Riot Games', aliases: ['riot games', 'riot'] },
  { canonical: 'Epic Games', aliases: ['epic games', 'epic'] },
  // 'ea' 単体は IGDB / Steam で返される表記。electronic arts / ea games / ea sports も含む
  { canonical: 'EA', aliases: ['ea', 'electronic arts', 'ea games', 'ea sports', 'ea canada', 'ea tiburon', 'ea vancouver', 'ea redwood shores'] },
  { canonical: 'Activision', aliases: ['activision', 'activision blizzard'] },
  { canonical: 'Mojang', aliases: ['mojang', 'mojang studios', 'mojang ab'] },
  { canonical: 'ZeniMax', aliases: ['zenimax', 'zenimax media'] },
  // 独立系 AA/AAA スタジオ
  { canonical: 'IO Interactive', aliases: ['io interactive', 'ioi', 'io interactive a/s'] },
  { canonical: 'Remedy Entertainment', aliases: ['remedy entertainment', 'remedy'] },
  { canonical: 'Larian Studios', aliases: ['larian studios', 'larian'] },
  { canonical: 'Warhorse Studios', aliases: ['warhorse studios', 'warhorse'] },
  { canonical: '4A Games', aliases: ['4a games', '4a'] },
  { canonical: 'Techland', aliases: ['techland'] },
  { canonical: 'Asobo Studio', aliases: ['asobo studio', 'asobo'] },
  { canonical: 'People Can Fly', aliases: ['people can fly', 'pcf'] },
  { canonical: 'Bloober Team', aliases: ['bloober team', 'bloober'] },
  { canonical: 'Bohemia Interactive', aliases: ['bohemia interactive', 'bohemia'] },
  { canonical: 'Rebellion', aliases: ['rebellion', 'rebellion developments'] },
  { canonical: 'Frontier Developments', aliases: ['frontier developments', 'frontier'] },
  { canonical: 'Saber Interactive', aliases: ['saber interactive', 'saber'] },
  { canonical: 'Behaviour Interactive', aliases: ['behaviour interactive', 'behavior interactive', 'behaviour', 'behavior'] },
  { canonical: 'Crystal Dynamics', aliases: ['crystal dynamics'] },
  { canonical: 'Eidos-Montréal', aliases: ['eidos-montréal', 'eidos montreal', 'eidos-montreal'] },
  { canonical: 'Pearl Abyss', aliases: ['pearl abyss', 'パールアビス'] },
  { canonical: 'SHIFT UP', aliases: ['shift up', 'シフトアップ'] },
  { canonical: 'CyberConnect2', aliases: ['cyberconnect2', 'cyberconnect 2', 'cc2', 'サイバーコネクトツー'] },
  { canonical: 'Cygames', aliases: ['cygames', 'サイゲームス'] },
  { canonical: 'Nihon Falcom', aliases: ['nihon falcom', 'falcom', '日本ファルコム', 'ファルコム'] },
  { canonical: 'Marvelous', aliases: ['marvelous', 'マーベラス'] },
  { canonical: 'Kojima Productions', aliases: ['kojima productions', 'kojipro', 'コジマプロダクション', 'コジプロ'] },
  { canonical: 'PlatinumGames', aliases: ['platinumgames', 'platinum games', 'プラチナゲームズ'] },
  { canonical: 'KRAFTON', aliases: ['krafton', 'krafton inc', 'クラフトン'] },
  // Issue #236: 親会社パブリッシャそのものが LARGE_DEVELOPERS に無く、
  // isLargeStudio('Xbox Game Studios') 等が hit: false になっていた穴を埋める。
  // MAJOR_PUBLISHER_SUBSIDIARIES ではなく親会社自身のエントリなのでこちらに追加する。
  {
    canonical: 'Xbox Game Studios',
    aliases: [
      'xbox game studios',
      'microsoft',
      'microsoft studios',
      'microsoft game studios',
      'xbox game studios publishing',
    ],
  },
  {
    canonical: 'Sony Interactive Entertainment',
    aliases: [
      'sony interactive entertainment',
      'sony computer entertainment',
      'playstation studios',
      'sie',
      'playstation publishing',
    ],
  },
  {
    canonical: 'Nippon Ichi Software',
    aliases: ['nippon ichi software', 'nippon ichi', '日本一ソフトウェア', 'nis america'],
  },
];

// 大手の子会社・専属スタジオ
const MAJOR_PUBLISHER_SUBSIDIARIES: ReadonlyArray<DeveloperEntry> = [
  // Microsoft / Xbox Game Studios
  { canonical: 'Ninja Theory', aliases: ['ninja theory'] },
  { canonical: 'The Coalition', aliases: ['the coalition'] },
  { canonical: 'Compulsion Games', aliases: ['compulsion games'] },
  { canonical: 'Obsidian Entertainment', aliases: ['obsidian entertainment', 'obsidian'] },
  { canonical: 'inXile Entertainment', aliases: ['inxile entertainment', 'inxile'] },
  { canonical: 'Double Fine Productions', aliases: ['double fine productions', 'double fine'] },
  { canonical: 'Playground Games', aliases: ['playground games'] },
  { canonical: 'Rare', aliases: ['rare', 'rare ltd'] },
  { canonical: '343 Industries', aliases: ['343 industries'] },
  { canonical: 'Turn 10 Studios', aliases: ['turn 10 studios', 'turn 10'] },
  { canonical: 'The Initiative', aliases: ['the initiative'] },
  { canonical: 'id Software', aliases: ['id software'] },
  { canonical: 'MachineGames', aliases: ['machinegames', 'machine games'] },
  { canonical: 'Arkane Studios', aliases: ['arkane studios', 'arkane austin', 'arkane lyon'] },
  { canonical: 'Bethesda Game Studios', aliases: ['bethesda game studios', 'bethesda softworks', 'bethesda'] },
  { canonical: 'Tango Gameworks', aliases: ['tango gameworks'] },
  { canonical: 'World\'s Edge', aliases: ["world's edge", 'worlds edge'] },
  { canonical: 'ZeniMax Online Studios', aliases: ['zenimax online studios', 'zenimax online'] },
  // Sony Interactive Entertainment
  { canonical: 'Naughty Dog', aliases: ['naughty dog'] },
  { canonical: 'Guerrilla Games', aliases: ['guerrilla games', 'guerrilla'] },
  { canonical: 'Insomniac Games', aliases: ['insomniac games', 'insomniac'] },
  { canonical: 'Sucker Punch Productions', aliases: ['sucker punch productions', 'sucker punch'] },
  { canonical: 'Santa Monica Studio', aliases: ['santa monica studio', 'sony santa monica'] },
  { canonical: 'Media Molecule', aliases: ['media molecule'] },
  { canonical: 'Polyphony Digital', aliases: ['polyphony digital'] },
  { canonical: 'Bend Studio', aliases: ['bend studio', 'sony bend'] },
  { canonical: 'Bluepoint Games', aliases: ['bluepoint games', 'bluepoint'] },
  { canonical: 'Housemarque', aliases: ['housemarque'] },
  { canonical: 'Firesprite', aliases: ['firesprite'] },
  { canonical: 'Nixxes Software', aliases: ['nixxes software', 'nixxes'] },
  // Nintendo
  { canonical: 'Monolith Soft', aliases: ['monolith soft', 'monolithsoft'] },
  { canonical: 'Retro Studios', aliases: ['retro studios'] },
  { canonical: '1-Up Studio', aliases: ['1-up studio', '1up studio'] },
  { canonical: 'Next Level Games', aliases: ['next level games'] },
  // EA
  { canonical: 'DICE', aliases: ['dice', 'ea dice'] },
  { canonical: 'BioWare', aliases: ['bioware', 'ea bioware'] },
  { canonical: 'Respawn Entertainment', aliases: ['respawn entertainment', 'respawn'] },
  { canonical: 'Motive Studio', aliases: ['motive studio', 'ea motive'] },
  { canonical: 'Criterion Games', aliases: ['criterion games', 'criterion'] },
  // Activision-Blizzard / Microsoft
  { canonical: 'Infinity Ward', aliases: ['infinity ward'] },
  { canonical: 'Treyarch', aliases: ['treyarch'] },
  { canonical: 'Sledgehammer Games', aliases: ['sledgehammer games', 'sledgehammer'] },
  { canonical: 'Raven Software', aliases: ['raven software'] },
  { canonical: 'High Moon Studios', aliases: ['high moon studios', 'high moon'] },
  { canonical: 'Blizzard Entertainment', aliases: ['blizzard entertainment', 'blizzard'] },
  // Take-Two Interactive / Rockstar
  { canonical: 'Rockstar North', aliases: ['rockstar north'] },
  { canonical: 'Rockstar San Diego', aliases: ['rockstar san diego'] },
  { canonical: 'Rockstar Toronto', aliases: ['rockstar toronto'] },
  { canonical: 'Firaxis Games', aliases: ['firaxis games', 'firaxis'] },
  { canonical: 'Visual Concepts', aliases: ['visual concepts'] },
  { canonical: '2K Games', aliases: ['2k games', '2k boston', '2k czech'] },
  // SEGA
  { canonical: 'Creative Assembly', aliases: ['creative assembly', 'the creative assembly'] },
  { canonical: 'Sports Interactive', aliases: ['sports interactive'] },
  { canonical: 'Relic Entertainment', aliases: ['relic entertainment'] },
  { canonical: 'Amplitude Studios', aliases: ['amplitude studios'] },
  { canonical: 'Two Point Studios', aliases: ['two point studios'] },
  // NetEase
  { canonical: 'Quantic Dream', aliases: ['quantic dream'] },
  // KRAFTON
  { canonical: 'PUBG Studios', aliases: ['pubg studios', 'pubg corporation', 'pubg corp'] },
  { canonical: 'Unknown Worlds Entertainment', aliases: ['unknown worlds entertainment', 'unknown worlds'] },
  // ← KRAFTON 傘下エントリここまで
];

export function normalizeDeveloperName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // 株式会社 prefix
    .replace(/^株式会社\s*/, '')
    // suffix removals (order: most specific first)
    .replace(/\s+co\.,?\s*ltd\.?$/i, '')
    .replace(/\s+co\.,?\s*inc\.?$/i, '')
    .replace(/\s+co\.?$/i, '')
    .replace(/\s+ltd\.?$/i, '')
    .replace(/\s+inc\.?$/i, '')
    .replace(/\s+llc\.?$/i, '')
    .replace(/\s+s\.a\.?$/i, '')
    .replace(/\s+corp\.?$/i, '')
    .replace(/\s+gmbh$/i, '')
    // 上記サフィックス除去は先頭に空白のみを要求するため、"Nippon Ichi Software, Inc." のような
    // 「カンマ + サフィックス」形式（"Co." を伴わない）だと " Inc." だけが消えて末尾にカンマが
    // 残ってしまい、カンマ無し表記（"Nippon Ichi Software"）と正規化結果が一致しなくなる不具合が
    // あった（コードレビュー指摘・IGDB は実データでこの表記形式を返す）。
    // ここで「末尾に残ったカンマ」だけを取り除く。$ アンカーにより文字列末尾にしか作用しないため、
    // "Foo, Bar Games" のような語中のカンマは対象外で保持される。
    .replace(/,\s*$/, '')
    .trim();
}

type LargeStudioResult =
  | { hit: true; matched: string; list: 'large' | 'subsidiary' | 'developed-count' }
  | { hit: false };

const DEFAULT_LARGE_STUDIO_DEVELOPED_THRESHOLD = 20;

/**
 * 環境変数を数値として読む。未設定・空文字・数値でない場合のみ既定値にフォールバックする。
 *
 * 注意: `Number(process.env.X) || defaultValue` という書き方はしないこと。
 * `0`（＝閾値0で全件大手扱い、運用上の緊急スイッチ）が既定値に化けてしまう
 * （`0 || default` は default になる）。`Number.isFinite` で明示的に判定する。
 * （newrelease-score.ts の readNumberEnv と同じ方針）
 */
function readLargeStudioDevelopedThreshold(): number {
  const raw = process.env.LARGE_STUDIO_DEVELOPED_THRESHOLD;
  if (raw === undefined || raw === '') return DEFAULT_LARGE_STUDIO_DEVELOPED_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_LARGE_STUDIO_DEVELOPED_THRESHOLD;
}

/**
 * developer が大手スタジオかどうかを判定する（§3.4）。
 *
 * 判定は OR: 静的リスト（LARGE_DEVELOPERS / MAJOR_PUBLISHER_SUBSIDIARIES）に一致する、
 * または developedCount（IGDB `developed` 件数）が閾値を超える、のいずれかで大手と判定する。
 * 静的リストの判定を先に行い、ヒットすれば従来どおりの canonical 名を返す（既存挙動は変えない）。
 * 静的リスト不一致で本数判定がヒットした場合は、canonical 名が無いため developer 引数の
 * 文字列をそのまま matched に入れる（呼び出し側が matched で developer 表記を上書きする際、
 * 正規化した名前を入れると記事の開発元表記が事実と変わってしまうため）。
 */
export function isLargeStudio(
  developer: string | undefined,
  developedCount?: number
): LargeStudioResult {
  if (!developer) return { hit: false };

  const normalized = normalizeDeveloperName(developer);

  for (const entry of LARGE_DEVELOPERS) {
    for (const alias of entry.aliases) {
      if (normalizeDeveloperName(alias) === normalized) {
        return { hit: true, matched: entry.canonical, list: 'large' };
      }
    }
  }

  for (const entry of MAJOR_PUBLISHER_SUBSIDIARIES) {
    for (const alias of entry.aliases) {
      if (normalizeDeveloperName(alias) === normalized) {
        return { hit: true, matched: entry.canonical, list: 'subsidiary' };
      }
    }
  }

  // 開発本数による規模判定（§3.4）。20 は大手ではない、21 から大手。
  if (developedCount !== undefined && developedCount > readLargeStudioDevelopedThreshold()) {
    return { hit: true, matched: developer, list: 'developed-count' };
  }

  return { hit: false };
}

/**
 * 「大手企業の新作」枠の記事カテゴリラベルに使う企業名を選ぶ（Issue #180）。
 *
 * developer が大手ならその canonical 名、受託開発（developer は小規模だが
 * publisher が大手）なら publisher の canonical 名を返す。
 * どちらも大手でなければ developer をそのまま返す（呼び出し側のフォールバック用）。
 *
 * game.developer 自体は事実（受託スタジオ名）を保持する方針のため、
 * 読者向けラベル「◯◯の新作」の◯◯だけをここで大手側に寄せる。
 *
 * developedCount（IGDB 開発本数による規模判定）は渡さない。開発本数判定は
 * インディー枠の除外条件としてのみ使う（論点A / docs/article-category-spec-review.md
 * §11.1 確定事項 #11）。新作枠のラベル選定は静的リストによる判定のみを使う。
 */
export function pickNewReleaseLabelCompany(
  developer: string | undefined,
  publisher: string | undefined
): string | undefined {
  const dev = isLargeStudio(developer);
  if (dev.hit) return dev.matched;
  const pub = isLargeStudio(publisher);
  if (pub.hit) return pub.matched;
  return developer;
}

/**
 * developer 名の一致をゲートにして developerGameCount を選ぶ共通ヘルパ（コードレビュー指摘対応）。
 *
 * developerGameCount は「その developer の IGDB developed 件数」なので、採用した developer 名と
 * 別ソースの件数が組み合わさってはいけない（例: 名前は Steam 由来の小規模スタジオ、件数は IGDB の
 * 共同開発会社（200本超）という取り違え）。normalizeDeveloperName で表記ゆれ（Inc. / Co., Ltd. 等）
 * を吸収した上で、currentDeveloper と sourceDeveloper が正規化一致する場合のみ sourceCount を
 * 採用候補にする。一致しない場合、またはどちらかの名前が undefined の場合は currentCount を返す
 * （sourceCount は採らない。currentCount 自体が undefined ならそのまま undefined）。
 *
 * 呼び出し側の使い分け（挙動が異なる2パターンを、この1つのヘルパで表現できる）:
 * - source 優先で値を更新したい場合（IGDB再取得直後の enrichGameFromIgdb 等。
 *   従来 `source.count ?? current.count` だった箇所）:
 *     x.developerGameCount = pickDeveloperGameCount(x.developer, x.developerGameCount, source.developer, source.developerGameCount);
 * - 既存値があれば変更したくない場合（マージ/dedup系。従来 `current.count ?? source.count` だった箇所）:
 *     x.developerGameCount = x.developerGameCount ?? pickDeveloperGameCount(x.developer, x.developerGameCount, source.developer, source.developerGameCount);
 */
export function pickDeveloperGameCount(
  currentDeveloper: string | undefined,
  currentCount: number | undefined,
  sourceDeveloper: string | undefined,
  sourceCount: number | undefined
): number | undefined {
  if (currentDeveloper === undefined || sourceDeveloper === undefined) {
    return currentCount;
  }
  if (normalizeDeveloperName(currentDeveloper) !== normalizeDeveloperName(sourceDeveloper)) {
    return currentCount;
  }
  return sourceCount ?? currentCount;
}

type IndieResult =
  | { ok: true }
  | { ok: false; reason: 'no-developer' | 'large-studio'; matched?: string };

export function isIndieGame(game: GameData): IndieResult {
  if (!game.developer) {
    return { ok: false, reason: 'no-developer' };
  }

  const result = isLargeStudio(game.developer, game.developerGameCount);
  if (result.hit) {
    return { ok: false, reason: 'large-studio', matched: result.matched };
  }

  return { ok: true };
}
