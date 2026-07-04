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
  { canonical: 'Eidos-Montréal', aliases: ['eidos-montréal', 'eidos montreal', 'eidos-montreal', 'eidos'] },
  { canonical: 'Pearl Abyss', aliases: ['pearl abyss', 'パールアビス'] },
  { canonical: 'SHIFT UP', aliases: ['shift up', 'シフトアップ'] },
  { canonical: 'CyberConnect2', aliases: ['cyberconnect2', 'cyberconnect 2', 'cc2', 'サイバーコネクトツー'] },
  { canonical: 'Cygames', aliases: ['cygames', 'サイゲームス'] },
  { canonical: 'Nihon Falcom', aliases: ['nihon falcom', 'falcom', '日本ファルコム', 'ファルコム'] },
  { canonical: 'Marvelous', aliases: ['marvelous', 'マーベラス'] },
  { canonical: 'Kojima Productions', aliases: ['kojima productions', 'kojipro', 'コジマプロダクション', 'コジプロ'] },
  { canonical: 'PlatinumGames', aliases: ['platinumgames', 'platinum games', 'プラチナゲームズ'] },
  { canonical: 'KRAFTON', aliases: ['krafton', 'krafton inc', 'クラフトン'] },
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
];

export function normalizeDeveloperName(name: string): string {
  return name
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
    .trim();
}

type LargeStudioResult =
  | { hit: true; matched: string; list: 'large' | 'subsidiary' }
  | { hit: false };

export function isLargeStudio(developer: string | undefined): LargeStudioResult {
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

  return { hit: false };
}

type IndieResult =
  | { ok: true }
  | { ok: false; reason: 'no-developer' | 'large-studio'; matched?: string };

export function isIndieGame(game: GameData): IndieResult {
  if (!game.developer) {
    return { ok: false, reason: 'no-developer' };
  }

  const result = isLargeStudio(game.developer);
  if (result.hit) {
    return { ok: false, reason: 'large-studio', matched: result.matched };
  }

  return { ok: true };
}
