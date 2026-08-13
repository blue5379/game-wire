/**
 * import 時副作用が無いことの回帰テスト（Issue #330）
 *
 * `isMainModule` 自体のロジックは entrypoint.test.ts が検証する。こちらは
 * **各スクリプトが実際にそのガードを使っているか**を検証する。ガードを消しても
 * `entrypoint.test.ts` は通ってしまうため、この2枚が対で必要になる。
 *
 * 手法: 静的 import を使わず、`console` を監視したうえで動的 import する。
 * ESM のモジュールキャッシュは1テストファイル内で共有されるので、テストファイルを
 * 分けてここで初めて読み込むことで「読み込んだ瞬間に何が起きるか」を観測できる。
 *
 * ⚠️ ガードが外れた状態でこのテストを走らせると、実際にパイプラインが起動して
 * 外部 API を叩き、ファイルを書き込み得る。被害範囲を開発用ディレクトリに限定するため
 * `DEV_MODE=true` を先にセットしておく（テストを通すための分岐ではなく、
 * 失敗時の被害を抑えるためのフェイルセーフ）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** 各スクリプトの main() が最初に出力する文字列（起動したかどうかの指紋） */
const ENTRYPOINTS = [
  { module: './build-issue.js', banner: '=== Game Wire Issue Builder ===' },
  { module: './fetch-data.js', banner: '=== Game Wire Data Fetch ===' },
  { module: './validate-existing-issue.js', banner: 'Usage: npx tsx scripts/validate-existing-issue.ts' },
];

describe('スクリプトを import しても main() が走らない（Issue #330）', () => {
  const originalDevMode = process.env.DEV_MODE;
  let logs: string[];

  beforeEach(() => {
    // ガードが外れていた場合の書き込み先を開発用に寄せるフェイルセーフ
    process.env.DEV_MODE = 'true';
    logs = [];
    const collect = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(collect);
    vi.spyOn(console, 'error').mockImplementation(collect);
    vi.spyOn(console, 'warn').mockImplementation(collect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDevMode === undefined) delete process.env.DEV_MODE;
    else process.env.DEV_MODE = originalDevMode;
  });

  for (const { module, banner } of ENTRYPOINTS) {
    it(`${module} の import で "${banner}" が出力されない`, async () => {
      await import(module);

      const matched = logs.filter((l) => l.includes(banner));
      expect(matched).toEqual([]);
    });
  }

  it('ガードを通る側（直接実行）では main() が呼ばれる想定であることを isMainModule で確認する', async () => {
    const { isMainModule } = await import('./entrypoint.js');
    const { pathToFileURL } = await import('node:url');

    // vitest 実行中は argv[1] が vitest 自身なので、スクリプトの URL では false になる
    // （= import 時に走らない）。argv[1] と一致する URL では true になる（= CLI では走る）。
    expect(isMainModule(pathToFileURL('/app/scripts/build-issue.ts').href)).toBe(false);
    expect(isMainModule(pathToFileURL(process.argv[1]).href)).toBe(true);
  });
});
