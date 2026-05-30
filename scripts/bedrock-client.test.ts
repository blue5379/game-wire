import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bedrock SDK をモックして LLM 応答を制御する。
// prefilterFeatureCandidatesByTheme の LLM パスを決定論的に検証するため。
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  // new で呼ばれるためコンストラクタ（class）として定義する
  BedrockRuntimeClient: class {
    send = mockSend;
  },
  ConverseCommand: class {
    constructor(public input: unknown) {}
  },
}));

function mockClaudeText(text: string): void {
  mockSend.mockResolvedValueOnce({
    output: { message: { content: [{ text }] } },
  });
}

import {
  buildUserMessage,
  buildFeatureUserMessage,
  prefilterFeatureCandidatesByTheme,
} from './bedrock-client.js';

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

describe('prefilterFeatureCandidatesByTheme - テーマ事前フィルタ', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  // 候補4件・上限3件のサンプル。テーマは「写真の日：フォトモード」を想定。
  const candidates = [
    { title: 'Forza Horizon 6', genres: ['Racing'], summary: 'フォトモード搭載のオープンワールドレース' },
    { title: 'Dota 2', genres: ['MOBA'], summary: '5対5の対戦ゲーム' },
    { title: 'Ghost of Yotei', genres: ['Adventure'], summary: '美しい風景とフォトモード' },
    { title: 'Wallpaper Engine', genres: [], summary: '壁紙ツール' },
  ];

  it('候補数が上限以下なら LLM を呼ばず全件の title を返す', async () => {
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 4);
    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual(['Forza Horizon 6', 'Dota 2', 'Ghost of Yotei', 'Wallpaper Engine']);
  });

  it('候補数が上限超なら LLM を呼び、抽出された title 配列を返す', async () => {
    mockClaudeText('{"titles": ["Forza Horizon 6", "Ghost of Yotei"]}');
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 3);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Forza Horizon 6', 'Ghost of Yotei']);
  });

  it('LLM 応答に前後の地の文が混じっても JSON 部分を抽出する', async () => {
    mockClaudeText('はい、抽出しました:\n{"titles": ["Ghost of Yotei"]}\n以上です');
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 3);
    expect(result).toEqual(['Ghost of Yotei']);
  });

  it('文字列以外の要素は除外する', async () => {
    mockClaudeText('{"titles": ["Forza Horizon 6", 123, "", null]}');
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 3);
    expect(result).toEqual(['Forza Horizon 6']);
  });

  it('JSON が取れない応答なら空配列を返す（呼び出し側でフォールバック）', async () => {
    mockClaudeText('該当なし');
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 3);
    expect(result).toEqual([]);
  });

  it('LLM 呼び出しが失敗しても例外を投げず空配列を返す', async () => {
    mockSend.mockRejectedValueOnce(new Error('network error'));
    const result = await prefilterFeatureCandidatesByTheme('写真の日特集', candidates, 3);
    expect(result).toEqual([]);
  });
});
