import { describe, it, expect } from 'vitest';
import { buildUserMessage } from './bedrock-client.js';

describe('buildUserMessage - 発売状況の判定', () => {
  const publishDate = new Date('2026-05-10');

  it('publishDate より前の releaseDate に（発売済み）を付与する', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game', releaseDate: '2026-03-27' },
      undefined,
      publishDate
    );
    expect(msg).toContain('発売日: 2026-03-27（発売済み）');
  });

  it('publishDate と同日の releaseDate に（発売済み）を付与する', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game', releaseDate: '2026-05-10' },
      undefined,
      publishDate
    );
    expect(msg).toContain('発売日: 2026-05-10（発売済み）');
  });

  it('publishDate より後の releaseDate に（発売予定）を付与する', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game', releaseDate: '2026-06-01' },
      undefined,
      publishDate
    );
    expect(msg).toContain('発売日: 2026-06-01（発売予定）');
  });

  it('publishDate を渡さない場合はラベルなしで出力する', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game', releaseDate: '2026-03-27' }
    );
    expect(msg).toContain('発売日: 2026-03-27');
    expect(msg).not.toContain('（発売済み）');
    expect(msg).not.toContain('（発売予定）');
  });

  it('releaseDate がない場合は発売日行を出力しない', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game' },
      undefined,
      publishDate
    );
    expect(msg).not.toContain('発売日:');
  });

  it('無効な日付文字列の場合はラベルなしで出力する', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game', releaseDate: 'TBA' },
      undefined,
      publishDate
    );
    expect(msg).toContain('発売日: TBA');
    expect(msg).not.toContain('（発売済み）');
    expect(msg).not.toContain('（発売予定）');
  });
});
