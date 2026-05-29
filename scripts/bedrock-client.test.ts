import { describe, it, expect } from 'vitest';
import { buildUserMessage, buildFeatureUserMessage } from './bedrock-client.js';

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

describe('fixInstruction の挿入（再生成時のフィードバック）', () => {
  it('buildUserMessage: fixInstruction を渡すと本文に含まれる', () => {
    const msg = buildUserMessage(
      'newRelease',
      { title: 'Test Game' },
      undefined,
      undefined,
      '【前回生成での問題点】\n- 「Switch」は対応機種に含まれません。'
    );
    expect(msg).toContain('前回生成での問題点');
    expect(msg).toContain('Switch');
  });

  it('buildUserMessage: fixInstruction を渡さないと問題点ブロックは含まれない', () => {
    const msg = buildUserMessage('newRelease', { title: 'Test Game' });
    expect(msg).not.toContain('前回生成での問題点');
  });

  it('buildFeatureUserMessage: fixInstruction を渡すと本文に含まれる', () => {
    const msg = buildFeatureUserMessage(
      'テーマ',
      new Date('2026-05-10'),
      [{ title: 'Game A' }],
      '【前回生成での問題点】\n- 数値「18万件」は提供データにありません。'
    );
    expect(msg).toContain('前回生成での問題点');
    expect(msg).toContain('18万件');
  });

  it('buildFeatureUserMessage: fixInstruction を渡さないと問題点ブロックは含まれない', () => {
    const msg = buildFeatureUserMessage('テーマ', new Date('2026-05-10'), [{ title: 'Game A' }]);
    expect(msg).not.toContain('前回生成での問題点');
  });
});
