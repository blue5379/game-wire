# 記事生成パイプライン モグラ叩き問題 — 原因分析と抜本対策プラン

作成日: 2026-07-05
目的: 毎号の記事生成で不具合が頻発し、対症療法（モグラ叩き）が続いている状態に対し、根本原因を整理し、
別セッション（別の担当者/AI）がこのドキュメント単体を読んで実装に着手できるレベルまで対策を具体化する。

このドキュメントは実装計画であり、着手前に必ず現在のコードが本ドキュメント記載の行番号・関数名と一致しているか
確認すること（コミットが進んでいれば行番号はズレる。関数名で再検索するのが確実）。

---

## 0. 前提: パイプライン全体像

```
scripts/fetch-data.ts (現状 1294 行)
  ├─ Steam / YouTube / IGDB / Metacritic からデータ取得
  ├─ aggregateGames()               ── 全ソースの名寄せ・統合
  ├─ Identity Resolver 呼び出し     ── プラットフォーム別ストアURL解決
  ├─ deduplicateGames()             ── 重複排除
  ├─ selectGamesForArticles()       ── カテゴリ別選定
  ├─ removeZombieGames()            ── 必須情報欠落ゲーム除去
  └─ Completeness Gate (R1〜R4)     ── 機械検証・差し替え/fail
        ↓ data/selected-games.json
scripts/generate-articles.ts (現状 1400 行)
  ├─ Tavily Web検索でグラウンディング
  ├─ Bedrock(Claude) で本文生成
  └─ 自動再生成（VALIDATION_AUTO_REGENERATE=true 時のみ）
        ↓ data/generated-articles.json
scripts/build-issue.ts
  ├─ game-source-mismatch 事前チェック
  ├─ Markdown 組み立て・履歴更新（game-history.ts）
  ├─ validate-article.ts  ── 正規表現バリデータ（5種）
  └─ judge-article.ts     ── LLM-as-a-judge 事実性チェック
```

補助モジュール:
- `scripts/identity-resolver.ts` — プラットフォーム別ゲーム同一性解決
- `scripts/resolvers/{steam,nintendo,playstation,xbox,appstore,googleplay,match,locale,tavily-search}.ts`
- `scripts/normalize.ts` — タイトル正規化
- `scripts/completeness-gate.ts` — 生成前の機械検証ゲート
- `scripts/game-filter.ts` / `select-newreleases-with-fallback.ts` / `select-indie-with-fallback.ts` — 選定ロジック
- `scripts/__fixtures__/known-cases.json` + `known-cases.test.ts` — 既知バグの回帰テストコーパス

---

## 1. 洗い出した問題（根本原因）

### 問題1: 「同一ゲーム判定」ロジックが複数箇所に分散・重複している

同じ「これは同じゲームか？」という問いに、独立した実装が別々に答えている。

| 実装箇所 | 関数 |
|---|---|
| `scripts/fetch-data.ts:116` | `titleMatches(title1, title2)` |
| `scripts/fetch-data.ts:146` | `isSameGame(...)` |
| `scripts/identity-resolver.ts:78` | `resolveGameIdentity(input)` |
| `scripts/resolvers/match.ts` | タイトル一致判定ロジック |
| `scripts/normalize.ts:1` | `normalizeTitle(title)`（正規化ルール自体） |

一箇所を修正しても他が追随しないため、同種のバグが形を変えて再発する。実例:
- [c00dad8](../../commit/c00dad8) 「aggregateGames bulk loop, report category loss, and regex inconsistency」— 正規表現の不一致が原因
- [#166](../../issues/166) 「Steam appId による IGDB 同一性解決」— 同一性判定の一部だけを強化した対症療法。直後に再発対応([0601a53](../../commit/0601a53))が必要になった

### 問題2: ハードコードされた許可/ブロックリストへの構造的依存

| リスト | 場所 | 直近の再発 |
|---|---|---|
| 大手スタジオ判定リスト | `scripts/game-filter.ts` 付近（`isQualifiedGame` 系） | [#164](../../issues/164) → 1週間後に [#167](../../issues/167) で追加漏れが再発 |
| カバー画像ドメイン許可リスト | `scripts/completeness-gate.ts` R4 | [#157](../../issues/157) |
| 公式URLソース許可リスト | `scripts/build-issue.ts:271`（`officialUrlSource` 判定） | 複数回改修 |

ゲーム業界の実体（新興スタジオ、新ドメイン）は増え続けるため、静的リストは「発覚してから追加」の後追いにしかならない。これは運用でカバーできる限界を超えた構造的問題。

### 問題3: `fetch-data.ts` が単一ファイルに責務を詰め込みすぎている

1294行の中に、集約・名寄せ・重複排除・選定・ゾンビ除去・ゲート適用が暗黙の実行順序と共有状態（同じ `GameData[]` を順次変異）で結合している。一箇所の修正が他関数の前提（例: 「この時点で `steamAppId` は必ず埋まっている」等）を壊しやすい。

### 問題4: 検出が「生成後」の後追いパターンマッチに偏っている

`scripts/validate-article.ts`（958行）は本文生成後の正規表現バリデータで、バグが起きるたびに検出パターンを1つ追加する運用が続いている。958行という規模自体がモグラ叩きの証跡。一方、生成**前**のデータ品質保証（Completeness Gate）は R1〜R4 の4ルールのみで、識別子（steamAppId / igdbSlug / title / titleJa）の**相互整合性**までは検証していない。[#166](../../issues/166) のような「別ゲームのメタ混入」は本来この段階で機械的にブロックできるはずの性質のバグ。

### 問題5: リグレッションコーパスが薄い

`scripts/__fixtures__/known-cases.json` は正しい方向性の仕組みだが、実エントリ数は10件未満。一方で過去の `fix:` コミットは188件（`git log --oneline --all | grep -iE "fix:|Issue #" | wc -l`）。実際に起きたバグの大半が回帰テストとして固定化されていない。

### 問題6: 「壊れたら消して作り直す」運用が常態化している

コミット履歴に `chore: Vol.0XX 再生成のため記事と履歴を削除` が5回以上出現（例: [6f903a1](../../commit/6f903a1), [2f9288d](../../commit/2f9288d), [672a118](../../commit/672a118)）。事前検出網が機能していれば本来発生しない運用パターンであり、「公開後に発覚 → 消して再実行」がデフォルトの復旧手段になっている。

---

## 2. 対策の全体方針と優先順位

4つの対策を優先度順に並べる。**PR-A → PR-B の順で着手し、PR-C/PR-D は並行可能。**
1回のPRが大きくなりすぎないよう、対策ごとに分割している（プロジェクトの過去のPRも `PR-1, PR-2...` の形で分割する慣習があるため踏襲）。

| PR | 対策 | 対応する問題 | 状態 |
|---|---|---|---|
| PR-A | 同一性解決ロジックの一本化 | 問題1 | **実装済み（2026-07-10）** — 下記「実装結果」参照 |
| PR-B | Completeness Gate に識別子整合ルール(R5)追加 | 問題4 | 未着手。PR-A の成果物 `scripts/game-identity.ts` を利用する |
| PR-C | 大手スタジオ判定のシグナルベース化 | 問題2 | 独立して着手可 |
| PR-D | 既知バグの回帰テスト化（継続タスク） | 問題5, 6 | 独立して継続的に着手可 |

以降、各PRの実装指示を記載する。

---

## PR-A: 同一性解決ロジックの一本化 【実装済み】

### 実装結果（2026-07-10 完了）

計画からの主な変更点と実装内容:

- **集約先は `scripts/identity-resolver.ts` ではなく新設の `scripts/game-identity.ts`**。
  resolver 群（steam.ts 等）が判定関数を import する必要があり、identity-resolver.ts は resolver 群を
  import しているため、当初計画の配置では循環参照になる。依存を持たない葉モジュールとして新設した。
- `game-identity.ts` のエクスポート:
  - `MATCH_PROFILES`: 用途別判定基準の一覧（`aggregation`=loose・年差±3 / `store`=prefix・±2 / `store-strict`=exact・±2）。
    旧実装で分散していた判定基準の差異はここに集約され、以後の調整は必ずここで行う
  - `explainGameIdentity(a, b, profile)`: 根拠（reason）付き同一性判定。steamAppId 両側判明→決定的、
    igdbSlug 一致→同一（不一致は非決定でタイトル照合へ）、以降 title/titleJa クロス照合＋年差
  - `isSameGameIdentity(a, b, profile)`: boolean 版
  - `isIdentityConfirmedByAppId(verdict)`: Issue #166 の「appId 未確証棄却」ポリシーを呼び出し側で書くための述語
  - `matchesAnyTitle(...)`: resolver 互換 API（旧 match.ts と同一シグネチャ）
  - `normalizeTitleForMatch` / `extractYearFromDate` / `isInvalidGameTitle`
- 廃止・置換したもの:
  - `fetch-data.ts` の `titleMatches` / `isSameGame` / `extractYear` / `SAME_GAME_YEAR_TOLERANCE` / `isInvalidGameTitle` → 削除し import に置換
  - `scripts/resolvers/match.ts` / `match.test.ts` → 削除（テストは全ケース `game-identity.test.ts` に移植）
  - `enrichGameFromIgdb` と `aggregateGames` IGDB ループの #166 多層防御 → `explainGameIdentity` ベースに書き換え（判定表は既存テスト6件で等価性を担保）
  - 追加発見: `validate-article.ts` の `GAME_SOURCE_YEAR_TOLERANCE`（コメントで fetch-data 側との手動同期を要求していた）を
    `MATCH_PROFILES.aggregation.yearTolerance` 参照に変更し、独自の `extractYearFromDate`（3実装目）も統合
- normalize.ts の `normalizeTitle` は**統合対象外のまま維持**（history.json の永続キー形式であり互換性を壊せない。#87/#88 の決定踏襲）
- 意図的な軽微挙動改善（PR説明に記載）: igdbSlug 一致時の同一確定、titleJa クロス照合、年抽出の対応フォーマット拡大
- 残課題（フォローアップ）: Steam URL からの appId 抽出（`extractSteamAppId`）が fetch-data.ts / validate-article.ts / resolvers に重複しており未統合

### 当初の目的（記録として保持）
「これは同じゲームか」の判定を一元化し、`fetch-data.ts` 内の重複実装を廃止する。

### 現状確認（着手前に必ず実施）

```bash
grep -n "function titleMatches\|function isSameGame" scripts/fetch-data.ts
grep -n "export async function resolveGameIdentity" scripts/identity-resolver.ts
grep -rn "titleMatches(\|isSameGame(" scripts/ --include="*.ts" | grep -v ".test.ts"
```

上記で呼び出し箇所を全て洗い出し、以下の実装手順のベースにする。

### 実装手順

1. **`identity-resolver.ts` の現状確認**
   `resolveGameIdentity()` (identity-resolver.ts:78) が現在どのシグナル（title / titleJa / steamAppId / igdbSlug / releaseDate）を使って同一性判定をしているかを読み、`fetch-data.ts` の `titleMatches` / `isSameGame` が使っている判定基準（`fetch-data.ts:116`, `146`）との差分を書き出す。特に以下の観点で差分を確認すること:
   - タイトル正規化の適用有無・タイミング（`normalizeTitle()` を通しているか）
   - 発売年の許容差（`known-cases.json` の「同名異作品（年差 > 2年でリジェクト）」ケースのしきい値と一致しているか）
   - appId/slug が両方存在する場合の優先順位

2. **単一の同一性判定関数を `identity-resolver.ts` に集約**
   `resolveGameIdentity` とは別に、軽量な同一性判定だけを行う純関数をエクスポートする（Resolver全体を呼ぶのはコスト高のため）:
   ```ts
   // scripts/identity-resolver.ts に追加
   export interface GameIdentitySignals {
     title: string;
     titleJa?: string;
     normalizedTitle?: string;
     steamAppId?: number;
     igdbSlug?: string;
     releaseDate?: string;
   }

   /**
    * 2つのゲーム識別子セットが同一ゲームを指すかを判定する。
    * プロジェクト内で「同一ゲーム判定」を行う唯一の実装。
    * 優先順位: steamAppId一致 > igdbSlug一致 > (正規化タイトル一致 AND 発売年差 <= 2年)
    */
   export function isSameGameIdentity(
     a: GameIdentitySignals,
     b: GameIdentitySignals
   ): boolean {
     // 実装は fetch-data.ts の isSameGame / titleMatches のロジックを移植し、
     // known-cases.json の全ケースが通ることを確認しながら統合する
   }
   ```
   実装内容は `fetch-data.ts:146` の `isSameGame` をベースに移植すること（既にIssue対応で鍛えられたロジックのため、ゼロから書き直さない）。`titleMatches` はこの関数の内部ヘルパーとして残してよいが、**外部にexportしない**。

3. **`fetch-data.ts` からの置き換え**
   `fetch-data.ts` 内で `titleMatches` / `isSameGame` を呼んでいた箇所（`aggregateGames`, `deduplicateGames` 等）を全て `isSameGameIdentity` の呼び出しに置き換える。置き換え後、`fetch-data.ts:116` と `146` のローカル関数定義は削除する。

4. **`resolvers/match.ts` の統合**
   `resolvers/match.ts` のタイトル一致判定が `isSameGameIdentity` と重複している場合、こちらも `identity-resolver.ts` からインポートする形に置き換える。Resolver 側で追加のシグナル（プラットフォーム固有のID等）が必要な場合は `GameIdentitySignals` を拡張する。

5. **テスト**
   - `scripts/identity-resolver.test.ts` に `isSameGameIdentity` の単体テストを追加。**既存の `known-cases.json` の全ケースをこの関数でも再現できることを確認するテストを追加する**（既存の `known-cases.test.ts` が Resolver 全体を通すテストなら、それとは別に軽量版の直接テストも用意する）。
   - `npm run test`（= `tsc --noEmit` + `vitest run scripts`）が通ることを確認。
   - 統合後に `DEV_MODE=true npm run build-issue:dev` を実行し、実データで選定結果が既存挙動から意図せず変化していないかを目視確認する。

### 完了条件
- `fetch-data.ts` に同一性判定のロジックが存在しない（すべて `identity-resolver.ts` に委譲）
- `known-cases.json` の全ケースが `isSameGameIdentity` の単体テストで通る
- `npm run test` green

---

## PR-B: Completeness Gate に識別子整合ルール（R5）を追加

### 目的
「別ゲームのメタ混入」（[#166](../../issues/166) 型のバグ）を、生成後の `build-issue.ts` の事後チェックではなく、生成前の Completeness Gate で機械的にブロックする。

### 前提
PR-A は実装済み。`scripts/game-identity.ts` の `isSameGameIdentity` / `explainGameIdentity` をそのまま import して使うこと（プロファイルは `aggregation` を使用）。

### 実装手順

1. **`scripts/completeness-gate.ts` の構造を確認**
   ```bash
   grep -n "ViolationId\|RULE_REPLACEABLE\|function check" scripts/completeness-gate.ts
   ```
   既存の R1〜R4 の実装パターン（`ViolationId` 型への追加、`RULE_REPLACEABLE` への追加、チェック関数の追加、呼び出し元への組み込み）を踏襲する。

2. **R5ルールを定義**
   ```ts
   // ViolationId に 'R5' を追加
   export type ViolationId = 'R0' | 'R1' | 'R2' | 'R2b' | 'R3' | 'R4' | 'R5';

   // RULE_REPLACEABLE に追加（差し替えで解消可能 = true）
   export const RULE_REPLACEABLE: Record<ViolationId, boolean> = {
     // ...既存...
     R5: true,
   };
   ```

3. **チェック内容**
   R5: 「1つの `GameData` エントリが持つ識別子（title / titleJa / steamAppId / igdbSlug）が、`isSameGameIdentity` で相互に同一ゲームと判定できない場合、違反とする」。
   具体的には、`GameData` にセットされている `steamAppId` から得られる（またはキャッシュされている）タイトルと `GameData.title` が `isSameGameIdentity` で不一致と判定されたら R5 違反とする。同様に `igdbSlug` から導出できるタイトルとの整合もチェックする。

   実装イメージ:
   ```ts
   function checkIdentityConsistency(game: GameData): ViolationId[] {
     const violations: ViolationId[] = [];
     if (game.steamAppId && game.steamResolvedTitle) {
       const same = isSameGameIdentity(
         { title: game.title, titleJa: game.titleJa, releaseDate: game.releaseDate },
         { title: game.steamResolvedTitle, releaseDate: game.steamResolvedReleaseDate }
       );
       if (!same) violations.push('R5');
     }
     // igdbSlug についても同様
     return violations;
   }
   ```
   **注意**: `GameData` 型に `steamResolvedTitle` 等の解決時タイトルが保持されていない場合は、まず `scripts/types.ts` の `GameData` にこれらのフィールドを追加し、Identity Resolver が解決時に埋めるよう `fetch-data.ts` の該当箇所を修正する必要がある。この依存関係を先に解消すること。

4. **既存の呼び出し元への組み込み**
   `fetch-data.ts` 内で Completeness Gate を呼んでいる箇所（`removeZombieGames` 直後、`fs.writeFileSync` 前 — ファイル冒頭コメントに明記されている）に R5 のチェックを追加する。

5. **テスト**
   `scripts/completeness-gate.test.ts` に R5 の正常系・違反系のテストケースを追加。[#166](../../issues/166) で実際に発生したデータパターン（同名異作品のメタ混入）を再現するケースを最低1件含めること。

### 完了条件
- R5 違反時に `replace` / `fail` モードで既存ルールと同様に動作する
- [#166](../../issues/166) 相当のデータパターンをテストで再現し、生成前にブロックできることを確認

---

## PR-C: 大手スタジオ判定のシグナルベース化

### 目的
静的リストによる「大手企業か」の判定を、IGDBの構造化データから導出できる形に変え、新規スタジオの追加漏れという再発パターンを構造的に解消する。

### 現状確認

```bash
grep -n "大手\|majorStudio\|isMajorStudio\|MAJOR_STUDIO" scripts/game-filter.ts scripts/select-newreleases-with-fallback.ts
```
静的リストの定義箇所と、それを参照している判定関数（`isQualifiedGame` 等）を特定する。

### 実装方針（要件整理が必要なため、着手前に方針確認を推奨）

現状把握した範囲では、「大手企業」判定は以下のいずれかのシグナルで代替できる可能性がある。実装前にIGDBから実際に取得できるフィールドを確認すること:
- IGDB `involved_companies` の `company.game_count`（関連作品数が一定以上）
- Metacritic メタスコアの存在（大手作品ほどレビューが付きやすい）
- Steamのレビュー数閾値（`steamRatingCount` 等、既存データで取得済みか確認）

**推奨アプローチ**: 静的リストを完全撤廃するのではなく、以下の2段構えにする（いきなり全撤廃はリグレッションリスクが高い）:
1. シグナルベース判定を新設し、静的リストと**併用**（OR条件）でロールアウト
2. 数週間〜1ヶ月運用し、シグナルベース判定だけで静的リストがカバーしていたケースを取りこぼさないことをログで確認
3. 取りこぼしがなければ静的リストをフォールバックに格下げ（シグナルが取得できない場合のみ参照）

### 実装手順

1. `scripts/game-filter.ts` に `hasStrongCompanySignal(game: GameData): boolean` を新設し、上記シグナルのいずれかを満たすか判定する。
2. 既存の静的リスト判定関数（例: `isMajorStudio`）はそのまま残し、呼び出し元で `isMajorStudio(game) || hasStrongCompanySignal(game)` の形にOR結合する。
3. シグナルベース判定が発火した場合はログに記録する（`console.log('[game-filter] major studio signal matched (not in static list):', game.title, ...)`）。これにより、静的リストの漏れをログから事後発見できるようにする。
4. テスト: `scripts/game-filter.test.ts`（存在しなければ新設）にシグナルベース判定の単体テストを追加。

### 完了条件
- シグナルベース判定が静的リストと併用で動作する
- ログでシグナルベース判定の発火を追跡できる
- 既存テストが green

---

## PR-D（継続タスク）: 既知バグの回帰テスト化

### 目的
過去の `fix:` コミット（188件）のうち、データ起因で再現可能なものを `known-cases.json` に追加し、CIで恒常的に検知できるようにする。

### 実装手順

1. 対象コミットの棚卸し。まず直近3ヶ月分から着手する:
   ```bash
   git log --since="3 months ago" --oneline | grep -iE "^\w+ fix:"
   ```
2. 各コミットについて、`git show <hash>` で diff を確認し、以下の条件を満たすものを抽出する:
   - 特定の入力データ（ゲームタイトル・ID・レスポンス）に対して誤判定した、というバグである（＝再現可能）
   - 既に `known-cases.json` に同種のケースが存在しない
3. 抽出したケースを `scripts/__fixtures__/known-cases.json` の既存フォーマットに従って追加する（`issue`, `scenario`, `input`, `*Mock`, `expected` の構造）。
4. `scripts/known-cases.test.ts` が新規ケースを自動的に拾って実行することを確認する（フォーマットに追加するだけで実行されるはずだが、念のため `npm run test` で確認）。
5. このタスクは一度で終わらせず、以降 `fix:` コミットを作るたびに対応するケースを `known-cases.json` に追加することをルール化する（CLAUDE.md の「コミット・PR作成前の品質ゲート」に、データ起因のバグ修正時は known-cases.json への追加を必須項目として追記することを検討)。

### 完了条件
- 直近3ヶ月分の `fix:` コミットのうち再現可能なものが `known-cases.json` に反映されている
- 今後のルールとして「データ起因バグの修正時は known-cases.json 追加」が明文化されている

---

## 3. 実装時の共通ルール

- 各PRはプロジェクトのIssue対応ワークフロー（`CLAUDE.md` 記載）に従うこと: ブランチ作成 → 実装 → コミット → `gh pr create`。ブランチ名は `fix/root-cause-pr-a-identity-consolidation` のように対策名を含める。
- コミット・PR作成前に以下を必ず実行する:
  ```bash
  npm run typecheck
  npm run test
  ```
- シンボルを削除・リネームした場合（PR-Aで `titleMatches` / `isSameGame` を削除する等）は、残存参照がないか必ず grep で確認する:
  ```bash
  grep -rn "titleMatches\|isSameGame\b" scripts/ --include="*.ts"
  ```
- 実データでの検証は `DEV_MODE=true npm run build-issue:dev` を使用し、本番ディレクトリ（`src/content/issues/`, `data/validation/`）には書き込まない。
- PR作成後は `/code-review` を自動実行し、指摘を確認してから完了とする。

## 4. 優先着手の推奨

PR-A は実装済み（2026-07-10、ブランチ `fix/root-cause-pr-a-identity-consolidation`）。
次に着手すべきは **PR-B（Completeness Gate への R5 追加）**。PR-A の成果物 `scripts/game-identity.ts` を
そのまま利用でき、直近の再発バグ（[#166](../../issues/166)）の生成前ブロックを実現する。
