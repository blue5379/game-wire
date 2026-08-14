/**
 * entrypoint（直接実行判定）のユニットテスト（Issue #330）
 */

import { describe, it, expect, afterEach } from 'vitest';
import { pathToFileURL } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isMainModule } from './entrypoint.js';

describe('isMainModule', () => {
  it('実行中スクリプトと同じパスなら true', () => {
    const script = '/Users/ryo/projects/game-wire/scripts/build-issue.ts';
    expect(isMainModule(pathToFileURL(script).href, script)).toBe(true);
  });

  it('別のモジュールから import された場合は false', () => {
    // build-issue.ts が実行中に、validate-article.ts の判定を行う状況
    expect(
      isMainModule(
        pathToFileURL('/app/scripts/validate-article.ts').href,
        '/app/scripts/build-issue.ts'
      )
    ).toBe(false);
  });

  it('同じディレクトリの紛らわしい名前と混同しない（前方一致では判定しない）', () => {
    expect(
      isMainModule(pathToFileURL('/app/scripts/build.ts').href, '/app/scripts/build-issue.ts')
    ).toBe(false);
    expect(
      isMainModule(pathToFileURL('/app/scripts/build-issue.ts').href, '/app/scripts/build.ts')
    ).toBe(false);
  });

  it('パスに空白が含まれていても正しく true になる（文字列連結の実装では false になっていた）', () => {
    const script = '/Users/ryo/my projects/game-wire/scripts/fetch-data.ts';
    const moduleUrl = pathToFileURL(script).href;

    // 前提の確認: import.meta.url 相当の値は空白がパーセントエンコードされる
    expect(moduleUrl).toContain('%20');
    // 旧実装（file:// への素朴な文字列連結）はこの入力で一致しない
    expect(moduleUrl).not.toBe(`file://${script}`);

    expect(isMainModule(moduleUrl, script)).toBe(true);
  });

  it('パスに # が含まれていても正しく true になる', () => {
    const script = '/app/scripts/build#1.ts';
    const moduleUrl = pathToFileURL(script).href;
    expect(moduleUrl).not.toBe(`file://${script}`);
    expect(isMainModule(moduleUrl, script)).toBe(true);
  });

  it('相対パスで起動された場合も cwd 基準で解決して一致させる', () => {
    const relative = 'scripts/build-issue.ts';
    const absolute = pathToFileURL(relative).href; // cwd 基準で解決される
    expect(isMainModule(absolute, relative)).toBe(true);
  });

  it('scriptPath が undefined（REPL や -e 実行で argv[1] が無い）なら false', () => {
    expect(isMainModule('file:///app/scripts/build-issue.ts', undefined)).toBe(false);
  });

  it('scriptPath が空文字なら false', () => {
    expect(isMainModule('file:///app/scripts/build-issue.ts', '')).toBe(false);
  });

  it('拡張子の違い（.ts と .js）は別モジュールとして扱う', () => {
    expect(
      isMainModule(pathToFileURL('/app/scripts/build-issue.js').href, '/app/scripts/build-issue.ts')
    ).toBe(false);
  });

  describe('symlink 経由の起動（/code-review の指摘。実測で再現した失敗）', () => {
    const created: string[] = [];

    afterEach(() => {
      for (const p of created.splice(0)) fs.rmSync(p, { recursive: true, force: true });
    });

    /** 実ファイルと、それを指す symlink のパスを作る */
    function makeSymlinkedScript(): { realPath: string; linkPath: string } {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-entrypoint-'));
      created.push(dir);
      // mkdtemp が返すパス自体に symlink が含まれ得る（macOS の /tmp → /private/tmp）ので
      // 「実パス」側は realpath で確定させる
      const realDir = fs.realpathSync(dir);
      const realPath = path.join(realDir, 'script.ts');
      fs.writeFileSync(realPath, '// test fixture\n');

      const linkDir = `${realDir}-link`;
      fs.symlinkSync(realDir, linkDir);
      created.push(linkDir);
      return { realPath, linkPath: path.join(linkDir, 'script.ts') };
    }

    it('argv[1] が symlink・import.meta.url が実パスでも true になる（node の既定挙動）', () => {
      const { realPath, linkPath } = makeSymlinkedScript();

      // 前提の確認: 素の argv[1] を URL 化しただけでは実パスの URL と一致しない
      expect(pathToFileURL(linkPath).href).not.toBe(pathToFileURL(realPath).href);

      expect(isMainModule(pathToFileURL(realPath).href, linkPath)).toBe(true);
    });

    it('argv[1] も import.meta.url も symlink 側でも true になる（--preserve-symlinks 実行）', () => {
      const { linkPath } = makeSymlinkedScript();
      expect(isMainModule(pathToFileURL(linkPath).href, linkPath)).toBe(true);
    });

    it('symlink 先が別ファイルなら false のまま（symlink 対応で判定が緩くなっていない）', () => {
      const { realPath, linkPath } = makeSymlinkedScript();
      const otherPath = path.join(path.dirname(realPath), 'other.ts');
      fs.writeFileSync(otherPath, '// another fixture\n');

      expect(isMainModule(pathToFileURL(otherPath).href, linkPath)).toBe(false);
    });
  });

  it('第2引数を省略すると process.argv[1] を見る', () => {
    // vitest 実行中の argv[1] は vitest 自身なので、任意のスクリプト URL とは一致しない
    expect(isMainModule('file:///app/scripts/build-issue.ts')).toBe(false);
    // argv[1] 自身の URL を渡せば一致する
    expect(isMainModule(pathToFileURL(process.argv[1]).href)).toBe(true);
  });
});
