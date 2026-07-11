/**
 * matchGameToSteamEntity / companyNamesOverlap の単体テスト（Issue #179 PR-1）
 *
 * vol.15 の障害ケースをゴールデンテストとして固定し、
 * FP（正規コンテンツの破壊）と FN（別作品の混入）両方を検証する。
 */

import { describe, it, expect } from 'vitest';
import { matchGameToSteamEntity } from './game-identity.js';
import { companyNamesOverlap } from './steam-utils.js';
import type { SteamEntity } from './steam-entity.js';

function makeEntity(overrides: Partial<SteamEntity>): SteamEntity {
  return {
    appId: 0,
    nameEn: undefined,
    nameJa: undefined,
    releaseDate: undefined,
    developers: [],
    publishers: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FP 防止テスト（同一ゲームが different にならないこと）
// ─────────────────────────────────────────────────────────────────────────────

describe('matchGameToSteamEntity — FP防止（同一ゲームは same|uncertain）', () => {
  it('vol.15 FP-1: AC Black Flag — 日本語 title × 二言語 entity → same（#179 再発防止）', () => {
    const result = matchGameToSteamEntity(
      { title: 'アサシン クリード ブラック フラッグ RE:シンクロ', releaseDate: '2026-07-09' },
      makeEntity({
        appId: 3751950,
        nameEn: "Assassin's Creed Black Flag Resynced",
        nameJa: 'アサシン クリード ブラック フラッグ RE:シンクロ',
        releaseDate: 'Jul 9, 2026',
      })
    );
    expect(result.verdict).toBe('same');
    expect(result.evidence.title).toBe('agree');
  });

  it('vol.15 FP-1 変形: nameJa 取得失敗（undefined）→ uncertain（different にならない = fail-open）', () => {
    const result = matchGameToSteamEntity(
      { title: 'アサシン クリード ブラック フラッグ RE:シンクロ', releaseDate: '2026-07-09' },
      makeEntity({
        appId: 3751950,
        nameEn: "Assassin's Creed Black Flag Resynced",
        nameJa: undefined,
        releaseDate: 'Jul 9, 2026',
      })
    );
    // title 軸: JA title vs EN entity name → disagree。year は agree。→ uncertain
    expect(result.verdict).not.toBe('different');
  });

  it('vol.15 FP-1 GTA V Legacy: JA title × 二言語 entity, 年差2（許容内）→ same', () => {
    // game.releaseDate=2013-09-17 (2013), entity=Apr 13, 2015 (2015) → 年差2
    const result = matchGameToSteamEntity(
      { title: 'グランド・セフト・オートV レガシー', releaseDate: '2013-09-17' },
      makeEntity({
        appId: 271590,
        nameEn: 'Grand Theft Auto V Legacy',
        nameJa: 'グランド・セフト・オートV レガシー',
        releaseDate: 'Apr 13, 2015',
      })
    );
    expect(result.verdict).toBe('same');
    expect(result.evidence.year).toBe('agree'); // 差2は agree
  });

  it('vol.15 FP-2: RE Requiem — Capcom Division vs CAPCOM Co.Ltd → same（#179 再発防止）', () => {
    const result = matchGameToSteamEntity(
      {
        title: 'Resident Evil Requiem',
        titleJa: 'Biohazard: Requiem',
        developer: 'Capcom Development Division 1',
        releaseDate: '2026-02-27',
      },
      makeEntity({
        appId: 3764200,
        nameEn: 'Resident Evil Requiem',
        nameJa: 'BIOHAZARD requiem',
        developers: ['CAPCOM Co., Ltd.'],
        releaseDate: '26 Feb, 2026',
      })
    );
    expect(result.verdict).toBe('same');
    expect(result.evidence.title).toBe('agree');
  });

  it('PR-B ケース: Cyberpunk 2077 — EN title × 二言語 entity → same', () => {
    const result = matchGameToSteamEntity(
      { title: 'Cyberpunk 2077' },
      makeEntity({
        appId: 1091500,
        nameEn: 'Cyberpunk 2077',
        nameJa: 'サイバーパンク2077',
      })
    );
    expect(result.verdict).toBe('same');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FN 防止テスト（別作品は different になること）
// ─────────────────────────────────────────────────────────────────────────────

describe('matchGameToSteamEntity — FN防止（別作品は different）', () => {
  it('Project Trash vs GTA V: title+year 両方不一致 → different', () => {
    const result = matchGameToSteamEntity(
      { title: 'Project Trash', releaseDate: '2026-07-10' },
      makeEntity({
        appId: 271590,
        nameEn: 'Grand Theft Auto V',
        releaseDate: 'Apr 13, 2015',
      })
    );
    expect(result.verdict).toBe('different');
    expect(result.evidence.title).toBe('disagree');
    expect(result.evidence.year).toBe('disagree');
  });

  it('title=disagree, year=unknown, company=disagree → different（判定表 行4）', () => {
    const result = matchGameToSteamEntity(
      { title: 'Different Game', developer: 'Studio Alpha' },
      makeEntity({
        appId: 999,
        nameEn: 'Another Game',
        developers: ['Studio Beta Inc.'],
      })
    );
    expect(result.verdict).toBe('different');
    expect(result.evidence.title).toBe('disagree');
    expect(result.evidence.year).toBe('unknown');
    expect(result.evidence.company).toBe('disagree');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 判定表の全5行を網羅する単体テスト
// ─────────────────────────────────────────────────────────────────────────────

describe('matchGameToSteamEntity — 判定表5行の網羅', () => {
  const agreeTitle = 'Test Game';
  const disagreeTitle = 'Completely Different Title';
  const agreeDate = '2024-01-01';
  const disagreeDate = '2010-01-01'; // 14年差 > 2
  const agreeDev = 'Studio One';
  const disagreeDev = 'Studio Two';

  const agreeEntity = makeEntity({
    appId: 1,
    nameEn: agreeTitle,
    releaseDate: 'Jan 1, 2024',
    developers: [agreeDev],
  });

  it('行1: title=agree, year=agree, company=任意 → same', () => {
    const result = matchGameToSteamEntity(
      { title: agreeTitle, releaseDate: agreeDate, developer: agreeDev },
      agreeEntity
    );
    expect(result.verdict).toBe('same');
  });

  it('行1 変形: title=agree, year=unknown, company=任意 → same', () => {
    const result = matchGameToSteamEntity(
      { title: agreeTitle }, // releaseDate なし → year=unknown
      makeEntity({ appId: 1, nameEn: agreeTitle })
    );
    expect(result.verdict).toBe('same');
  });

  it('行2: title=agree, year=disagree, company=任意 → uncertain', () => {
    const result = matchGameToSteamEntity(
      { title: agreeTitle, releaseDate: disagreeDate },
      makeEntity({ appId: 1, nameEn: agreeTitle, releaseDate: 'Jan 1, 2024' })
    );
    expect(result.verdict).toBe('uncertain');
    expect(result.evidence.title).toBe('agree');
    expect(result.evidence.year).toBe('disagree');
  });

  it('行3: title=disagree, year=disagree, company=任意 → different', () => {
    const result = matchGameToSteamEntity(
      { title: disagreeTitle, releaseDate: disagreeDate },
      makeEntity({ appId: 1, nameEn: agreeTitle, releaseDate: 'Jan 1, 2024' })
    );
    expect(result.verdict).toBe('different');
    expect(result.evidence.title).toBe('disagree');
    expect(result.evidence.year).toBe('disagree');
  });

  it('行4: title=disagree, year=unknown, company=disagree → different', () => {
    const result = matchGameToSteamEntity(
      { title: disagreeTitle, developer: disagreeDev }, // releaseDate なし → year=unknown
      makeEntity({ appId: 1, nameEn: agreeTitle, developers: [agreeDev] })
    );
    expect(result.verdict).toBe('different');
    expect(result.evidence.title).toBe('disagree');
    expect(result.evidence.year).toBe('unknown');
    expect(result.evidence.company).toBe('disagree');
  });

  it('行5: title=disagree, year=unknown, company=unknown → uncertain（fail-open）', () => {
    const result = matchGameToSteamEntity(
      { title: disagreeTitle }, // developer なし → company=unknown
      makeEntity({ appId: 1, nameEn: agreeTitle }) // developers=[] → company=unknown
    );
    expect(result.verdict).toBe('uncertain');
    expect(result.evidence.title).toBe('disagree');
    expect(result.evidence.year).toBe('unknown');
    expect(result.evidence.company).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// companyNamesOverlap の単体テスト（設計書の検証例）
// ─────────────────────────────────────────────────────────────────────────────

describe('companyNamesOverlap', () => {
  it('Capcom Development Division 1 × CAPCOM Co., Ltd. → true', () => {
    expect(companyNamesOverlap('Capcom Development Division 1', 'CAPCOM Co., Ltd.')).toBe(true);
  });

  it('PocketPair × Pocketpair → true（大文字小文字ゆれ）', () => {
    expect(companyNamesOverlap('PocketPair', 'Pocketpair')).toBe(true);
  });

  it('Game Studio Inc. のみ → undefined（汎用語除去でトークンゼロ）', () => {
    expect(companyNamesOverlap('Game Studio Inc.', 'Another Studio')).toBeUndefined();
  });

  it('Team Ninja × Ninja Theory → true（共通トークン "ninja"）', () => {
    expect(companyNamesOverlap('Team Ninja', 'Ninja Theory')).toBe(true);
  });

  it('株式会社ゲームスタジオ × Game Studio Inc. → undefined（片側トークンゼロ）', () => {
    // 「ゲームスタジオ」は「ゲーム」「スタジオ」が GENERIC_TOKENS には含まれないが
    // 日本語側は「株式会社」除去後に「ゲームスタジオ」→ 英語側は汎用語除去でトークンゼロ
    const result = companyNamesOverlap('株式会社ゲームスタジオ', 'Game Studio Inc.');
    // Game Studio Inc. は全トークンが汎用語・接尾辞 → undefined
    expect(result).toBeUndefined();
  });

  it('全く異なる会社名 → false', () => {
    expect(companyNamesOverlap('Ubisoft', 'Valve')).toBe(false);
  });

  it('FromSoftware × FromSoftware Inc. → true（接尾辞除去後に一致）', () => {
    expect(companyNamesOverlap('FromSoftware', 'FromSoftware Inc.')).toBe(true);
  });

  it('Sega × Ryu Ga Gotoku Studio → false（重なりなし）', () => {
    expect(companyNamesOverlap('Sega', 'Ryu Ga Gotoku Studio')).toBe(false);
  });
});
