/**
 * fetch-official-jp-url の純関数ユニットテスト
 *
 * Issue #135: Tavily クエリと Claude 選別プロンプトに developer/publisher を
 * 含めるよう変更したため、その挙動を回帰防止する。
 */

import { describe, it, expect } from 'vitest';
import { buildSearchQueries, buildSelectUserMessage } from './fetch-official-jp-url.js';

describe('buildSearchQueries (Issue #135 P2-1)', () => {
  it('developer がある場合、1st クエリに developer 名を含める', () => {
    const queries = buildSearchQueries('Hitman 3', undefined, 'IO Interactive');
    expect(queries[0]).toContain('"Hitman 3"');
    expect(queries[0]).toContain('"IO Interactive"');
    expect(queries[0]).toContain('公式サイト');
  });

  it('developer が無い場合、publisher を代わりに使う', () => {
    const queries = buildSearchQueries('Some Game', undefined, undefined, 'Pub Inc');
    expect(queries[0]).toContain('"Pub Inc"');
  });

  it('developer も publisher も無い場合、従来のタイトル単独クエリから始まる', () => {
    const queries = buildSearchQueries('Plain Game');
    // 開発元クエリは生成されず、最初のクエリはタイトル単独
    expect(queries[0]).toContain('"Plain Game"');
    expect(queries[0]).not.toContain('"undefined"');
  });

  it('titleJa があれば 1st クエリにも両言語が含まれる', () => {
    const queries = buildSearchQueries('Hitman 3', 'ヒットマン3', 'IO Interactive');
    expect(queries[0]).toContain('"ヒットマン3"');
    expect(queries[0]).toContain('"Hitman 3"');
    expect(queries[0]).toContain('"IO Interactive"');
  });

  it('クエリ列は優先度順に並び、後段に従来のフォールバックが続く', () => {
    const queries = buildSearchQueries('Hitman 3', 'ヒットマン3', 'IO Interactive');
    // 開発元入りが最初、続いてタイトル一致強制、続いて柔軟マッチ、続いて英語のみ、最後に簡略化
    expect(queries.length).toBeGreaterThanOrEqual(5);
    expect(queries[0]).toContain('IO Interactive');
    expect(queries[1]).not.toContain('IO Interactive');
    expect(queries[1]).toContain('日本語');
  });
});

describe('buildSelectUserMessage (Issue #135 P2-2)', () => {
  it('developer / publisher を本文に含める', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Hitman 3',
      developer: 'IO Interactive',
      publisher: 'IO Interactive',
      candidates: ['https://ioi.dk/', 'https://example.com/'],
    });
    expect(msg).toContain('開発元: IO Interactive');
    expect(msg).toContain('発売元: IO Interactive');
  });

  it('developer / publisher が無ければ該当行は出力しない', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Indie Game',
      candidates: ['https://example.com/'],
    });
    expect(msg).not.toContain('開発元:');
    expect(msg).not.toContain('発売元:');
  });

  it('候補URLが番号付きで列挙される', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'X',
      candidates: ['https://a.example/', 'https://b.example/'],
    });
    expect(msg).toContain('1. https://a.example/');
    expect(msg).toContain('2. https://b.example/');
  });

  it('ドメイン整合チェックを促す指示文を含む', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'X',
      developer: 'Dev',
      candidates: ['https://example.com/'],
    });
    expect(msg).toContain(
      '候補URLのドメインが開発元・発売元・日本語ローカライザのいずれとも整合しない場合は採用しない'
    );
  });

  it('titleJa があれば「英語（日本語）」表記でゲーム名を案内する', () => {
    const msg = buildSelectUserMessage({
      titleEn: 'Hitman 3',
      titleJa: 'ヒットマン3',
      candidates: ['https://example.com/'],
    });
    expect(msg).toContain('Hitman 3（ヒットマン3）');
  });
});
