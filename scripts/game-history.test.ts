/**
 * game-history の getCooldownTitles ユニットテスト
 *
 * 後半に特集で使った記念日の履歴（`featureEvents`。Issue #310 / PR-F）のテストを追加している。
 * §4.4 の「除外対象は直近 N 号が**実際にテーマとして使った**記念日」を成立させるための記録で、
 * 従来の履歴（ゲームタイトル）とは別の配列に持つ。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCooldownTitles } from './game-history.js';

vi.mock('node:fs');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function makeHistory(entries: Array<{ normalizedTitle: string; category: string; publishDate: string }>) {
  return JSON.stringify({
    version: 1,
    entries: entries.map((e) => ({
      ...e,
      title: e.normalizedTitle,
      issueNumber: 1,
    })),
  });
}

describe('getCooldownTitles', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEV_MODE = 'false';
  });

  it('同じカテゴリのタイトルのみをクールダウン対象にする', async () => {
    const { default: fs } = await import('node:fs');
    const now = new Date('2026-06-26');
    const recentDate = new Date(now.getTime() - 4 * WEEK_MS).toISOString().split('T')[0]; // 4週前（17週未満）

    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistory([
        { normalizedTitle: 'game-a', category: 'newRelease', publishDate: recentDate },
        { normalizedTitle: 'game-b', category: 'indie', publishDate: recentDate },
        { normalizedTitle: 'game-c', category: 'classic', publishDate: recentDate },
      ])
    );

    const { getCooldownTitles: getCooldown } = await import('./game-history.js');
    const classicCooldown = getCooldown('classic', now);

    // classic のタイトルのみが含まれる
    expect(classicCooldown.has('game-c')).toBe(true);
    // 他カテゴリは含まれない
    expect(classicCooldown.has('game-a')).toBe(false);
    expect(classicCooldown.has('game-b')).toBe(false);
  });

  it('newRelease クールダウンに classic タイトルが混入しない', async () => {
    const { default: fs } = await import('node:fs');
    const now = new Date('2026-06-26');
    const recentDate = new Date(now.getTime() - 4 * WEEK_MS).toISOString().split('T')[0];

    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistory([
        { normalizedTitle: 'new-game', category: 'newRelease', publishDate: recentDate },
        { normalizedTitle: 'classic-game', category: 'classic', publishDate: recentDate },
      ])
    );

    const { getCooldownTitles: getCooldown } = await import('./game-history.js');
    const newReleaseCooldown = getCooldown('newRelease', now);

    expect(newReleaseCooldown.has('new-game')).toBe(true);
    expect(newReleaseCooldown.has('classic-game')).toBe(false);
  });

  it('クールダウン期間を過ぎたタイトルは含まれない', async () => {
    const { default: fs } = await import('node:fs');
    const now = new Date('2026-06-26');
    // classic クールダウンは52週。54週前は期限切れ
    const expiredDate = new Date(now.getTime() - 54 * WEEK_MS).toISOString().split('T')[0];
    const recentDate = new Date(now.getTime() - 4 * WEEK_MS).toISOString().split('T')[0];

    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistory([
        { normalizedTitle: 'old-classic', category: 'classic', publishDate: expiredDate },
        { normalizedTitle: 'recent-classic', category: 'classic', publishDate: recentDate },
      ])
    );

    const { getCooldownTitles: getCooldown } = await import('./game-history.js');
    const classicCooldown = getCooldown('classic', now);

    expect(classicCooldown.has('old-classic')).toBe(false);
    expect(classicCooldown.has('recent-classic')).toBe(true);
  });
});

/**
 * 特集で使った記念日の履歴（Issue #310 / PR-F）
 */
function makeHistoryWithFeatureEvents(
  featureEvents: Array<{ eventName: string; issueNumber: number; source?: string }>,
  includeEntries = true
) {
  return JSON.stringify({
    version: 1,
    entries: includeEntries
      ? [
          {
            normalizedTitle: 'existing game',
            title: 'Existing Game',
            category: 'newRelease',
            issueNumber: 1,
            publishDate: '2026-01-03',
          },
        ]
      : [],
    featureEvents: featureEvents.map((e) => ({
      eventName: e.eventName,
      issueNumber: e.issueNumber,
      publishDate: '2026-01-03',
      source: e.source ?? 'forward',
    })),
  });
}

describe('getRecentFeatureEventNames（§4.4 の使用済み記念日除外）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DEV_MODE = 'false';
    delete process.env.FEATURE_EVENT_EXCLUDE_ISSUE_COUNT;
  });

  it('直近 N 号（既定 2 号）が使った記念日名を返す', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([
        { eventName: '駅弁の日', issueNumber: 20 },
        { eventName: '母の日', issueNumber: 19 },
        { eventName: 'バレンタインデー', issueNumber: 18 },
      ])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    const names = getRecentFeatureEventNames(21);

    expect(names.has('駅弁の日')).toBe(true);
    expect(names.has('母の日')).toBe(true);
    // 3 号前は除外対象に含めない
    expect(names.has('バレンタインデー')).toBe(false);
  });

  it('現在の号以降の記録は除外対象に含めない（再生成で自分の記念日を弾かないため）', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([
        { eventName: '今号で使った記念日', issueNumber: 21 },
        { eventName: '前号で使った記念日', issueNumber: 20 },
      ])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    const names = getRecentFeatureEventNames(21);

    expect(names.has('今号で使った記念日')).toBe(false);
    expect(names.has('前号で使った記念日')).toBe(true);
  });

  it('号が飛んでいても「直近 N 件の号」で数える', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([
        { eventName: 'A', issueNumber: 15 },
        { eventName: 'B', issueNumber: 9 },
        { eventName: 'C', issueNumber: 3 },
      ])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    const names = getRecentFeatureEventNames(20);

    expect([...names].sort()).toEqual(['A', 'B']);
  });

  it('同一号に複数の記念日が記録されていても 1 号として数える', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([
        { eventName: 'A1', issueNumber: 20 },
        { eventName: 'A2', issueNumber: 20 },
        { eventName: 'B', issueNumber: 19 },
        { eventName: 'C', issueNumber: 18 },
      ])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    const names = getRecentFeatureEventNames(21);

    expect([...names].sort()).toEqual(['A1', 'A2', 'B']);
  });

  it('環境変数 FEATURE_EVENT_EXCLUDE_ISSUE_COUNT で除外号数を上書きできる（0 で無効化）', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([
        { eventName: 'A', issueNumber: 20 },
        { eventName: 'B', issueNumber: 19 },
      ])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');

    process.env.FEATURE_EVENT_EXCLUDE_ISSUE_COUNT = '1';
    expect([...getRecentFeatureEventNames(21)]).toEqual(['A']);

    process.env.FEATURE_EVENT_EXCLUDE_ISSUE_COUNT = '0';
    expect(getRecentFeatureEventNames(21).size).toBe(0);

    delete process.env.FEATURE_EVENT_EXCLUDE_ISSUE_COUNT;
  });

  it('featureEvents を持たない既存の履歴ファイルでも空集合を返す（後方互換）', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistory([{ normalizedTitle: 'game-a', category: 'feature', publishDate: '2026-01-03' }])
    );

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    expect(getRecentFeatureEventNames(21).size).toBe(0);
  });

  it('履歴ファイルが存在しなければ空集合を返す', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { getRecentFeatureEventNames } = await import('./game-history.js');
    expect(getRecentFeatureEventNames(1).size).toBe(0);
  });
});

describe('saveHistory — 特集で使った記念日の保存（Issue #310 / PR-F）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DEV_MODE = 'false';
  });

  /** writeFileSync に渡された JSON をパースして返す */
  async function captureWrite(): Promise<Record<string, unknown>> {
    const { default: fs } = await import('node:fs');
    const write = fs.writeFileSync as ReturnType<typeof vi.fn>;
    expect(write).toHaveBeenCalledTimes(1);
    return JSON.parse(write.mock.calls[0][1] as string) as Record<string, unknown>;
  }

  it('記念日を featureEvents 配列に追記し、既存の entries を壊さない', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([{ eventName: '母の日', issueNumber: 19 }])
    );

    const { saveHistory, createFeatureEventHistoryEntry } = await import('./game-history.js');
    saveHistory([], [createFeatureEventHistoryEntry('駅弁の日', 'backward', 20, '2026-04-11')]);

    const saved = await captureWrite();
    expect(saved.entries).toHaveLength(1); // 既存エントリが残っている
    expect(saved.featureEvents).toEqual([
      { eventName: '母の日', issueNumber: 19, publishDate: '2026-01-03', source: 'forward' },
      { eventName: '駅弁の日', issueNumber: 20, publishDate: '2026-04-11', source: 'backward' },
    ]);
  });

  it('ゲーム履歴が 0 件でも記念日だけで保存する（早期 return に落ちない）', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ version: 1, entries: [] })
    );

    const { saveHistory, createFeatureEventHistoryEntry } = await import('./game-history.js');
    saveHistory([], [createFeatureEventHistoryEntry('恋人の日', 'backward', 20, '2026-06-13')]);

    const saved = await captureWrite();
    expect(saved.featureEvents).toHaveLength(1);
  });

  it('同じ号・同じ記念日の重複記録はスキップする', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([{ eventName: '駅弁の日', issueNumber: 20 }], false)
    );

    const { saveHistory, createFeatureEventHistoryEntry } = await import('./game-history.js');
    saveHistory([], [createFeatureEventHistoryEntry('駅弁の日', 'backward', 20, '2026-04-11')]);

    // 追記対象が無いので書き込まない
    expect((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('同じ記念日でも号が違えば別記録として追記する', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      makeHistoryWithFeatureEvents([{ eventName: '駅弁の日', issueNumber: 20 }], false)
    );

    const { saveHistory, createFeatureEventHistoryEntry } = await import('./game-history.js');
    saveHistory([], [createFeatureEventHistoryEntry('駅弁の日', 'forward', 21, '2026-04-18')]);

    const saved = await captureWrite();
    expect(saved.featureEvents).toHaveLength(2);
  });

  it('記念日を渡さない既存の呼び出し（ゲーム履歴のみ）は挙動が変わらない', async () => {
    const { default: fs } = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ version: 1, entries: [] })
    );

    const { saveHistory, createHistoryEntry } = await import('./game-history.js');
    saveHistory([createHistoryEntry('Elden Ring', 'newRelease', 20, '2026-04-11')]);

    const saved = await captureWrite();
    expect(saved.entries).toHaveLength(1);
    // featureEvents は追加していないので生えない（既存ファイル形式を無用に変えない）
    expect(saved.featureEvents).toBeUndefined();
  });
});
