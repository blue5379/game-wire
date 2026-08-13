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
  try {
    return moduleUrl === pathToFileURL(scriptPath).href;
  } catch {
    // pathToFileURL は不正な入力で throw する。判定不能なら「直接実行ではない」に倒す
    // （import 時に副作用を起こさない側が安全なので、fail-safe の向きはこちら）。
    return false;
  }
}
