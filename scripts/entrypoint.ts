/**
 * スクリプトの直接実行判定（Issue #330）
 *
 * `main()` をモジュールのトップレベルで無条件に呼ぶと、テストやツールが
 * そのモジュールを import しただけでパイプライン全体が起動する。実測では
 * `npm run test` が Steam / YouTube / IGDB へ実リクエストを飛ばしており、
 * `build-issue.ts` は `Mode: PRODUCTION`（出力先 `src/content/issues`）で
 * 起動していた。CLI として直接実行されたときだけ `main()` を呼ぶためのヘルパー。
 *
 * 使い方（各スクリプトの末尾）:
 *
 * ```ts
 * if (isMainModule(import.meta.url)) {
 *   main().catch((error) => {
 *     console.error('Fatal error:', error);
 *     process.exit(1);
 *   });
 * }
 * ```
 */

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * 与えられたモジュールが、いま直接実行されているスクリプト本体かを判定する。
 *
 * 判定には `pathToFileURL` を使う。従来この判定は「file:// に argv[1] を文字列連結して
 * import.meta.url と比較する」形で書かれていたが、パスに空白や `#` 等が含まれると
 * `import.meta.url` 側はパーセントエンコードされる一方で連結側はされないため不一致になり、
 * **CLI 実行なのに `main()` が呼ばれない**（スクリプトが黙って何もせず終了する）という
 * 失敗をする。`pathToFileURL` はエンコードを含めて正規化するのでこの穴が無い。
 *
 * 同じ「CLI 実行なのに main() が呼ばれない」失敗は **symlink 経由の起動**でも起きる
 * （`/code-review` の指摘。実測で再現した）。対処は関数本体のコメントを参照。
 *
 * @param moduleUrl 判定したいモジュールの `import.meta.url`
 * @param scriptPath 実行中スクリプトのパス。既定は `process.argv[1]`
 */
export function isMainModule(
  moduleUrl: string,
  scriptPath: string | undefined = process.argv[1]
): boolean {
  // argv[1] が無い実行形態（`node -e` / REPL）を明示的に落とす。
  // ⚠️ この行を消しても現在の挙動は変わらない（`pathToFileURL(undefined)` は TypeError を
  // 投げるので下の catch が false を返し、`''` は cwd の URL になってモジュール URL と
  // 一致しない）。ミュータント検証でもこの行を消したミュータントは生存する。
  // それでも残しているのは、**node の throw する/しないという実装詳細に依存させない**ため。
  if (!scriptPath) return false;

  // symlink 経由で起動された場合、argv[1] は symlink のパスだが `import.meta.url` は
  // node が解決した実パスになる（実測: symlink 経由だと argv[1]=/tmp/gw-symlink/probe.ts /
  // import.meta.url=file:///Users/.../probe.ts）。そのため素の argv[1] だけを見ると
  // **CLI 実行なのに main() が呼ばれない**。逆に `--preserve-symlinks` 付きで実行すると
  // `import.meta.url` が symlink 側になるので、実パスだけを見ても取りこぼす。
  // どちらの向きでも成立させるため、両方の形を候補にして「いずれかが一致」で判定する。
  for (const candidate of [scriptPath, realPathOrUndefined(scriptPath)]) {
    if (candidate === undefined) continue;
    try {
      if (moduleUrl === pathToFileURL(candidate).href) return true;
    } catch {
      // pathToFileURL は不正な入力で throw する。その候補は一致しなかったものとして次へ
      // （import 時に副作用を起こさない側に倒すのが安全なので、fail-safe の向きはこちら）。
      continue;
    }
  }
  return false;
}

/**
 * symlink を解決した実パスを返す。解決できない場合（存在しないパス等）は undefined。
 * 実パスが入力と同じなら重複して比較する意味が無いので undefined を返す。
 */
function realPathOrUndefined(scriptPath: string): string | undefined {
  try {
    const real = fs.realpathSync(scriptPath);
    return real === scriptPath ? undefined : real;
  } catch {
    return undefined;
  }
}
