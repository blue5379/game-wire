/**
 * game-history の getCooldownTitles ユニットテスト
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
