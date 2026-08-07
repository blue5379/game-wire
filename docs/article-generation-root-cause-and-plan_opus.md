# 記事生成パイプライン モグラ叩き問題 — 原因分析と抜本対策プラン（opus版）

作成日: 2026-07-09
作成者: Claude (Opus 4.8)
目的: 毎号の記事生成で不具合が頻発し、対症療法（モグラ叩き）が続いている状態に対し、
コード・Issue履歴・実データから**独立検証した**根本原因を整理し、別セッション（別担当者/AI）が
このドキュメント単体を読んで実装に着手できるレベルまで対策を具体化する。

## このドキュメントの位置づけ

先行して `docs/article-generation-root-cause-and-plan_fable5.md`（fable5版）が存在する。
本ドキュメントはそれを鵜呑みにせず、実コード・Issue・コミット履歴から独立に再調査した結果であり、
**fable5版の誤り・見落とし・優先順位の問題を修正した上位互換版**である。両者の差分は「§0.5 fable5版との差分」に明記する。
実装に着手する場合は本ドキュメント（opus版）を正とすること。

**着手前の必須確認**: 本ドキュメント記載の行番号・関数名は 2026-07-09 時点のもの。コミットが進むと行番号はズレる。
各節の「現状確認」コマンドを必ず実行し、関数名で再検索して現在地を確定してから着手すること。

---

## 0. パイプライン全体像（実コードで確認済み）

```
scripts/fetch-data.ts (1294 行)
  ├─ Steam / YouTube / IGDB / Metacritic 取得
  ├─ aggregateGames()          (244行) ── 全ソース名寄せ・統合（titleMatches/isSameGame 使用）
  ├─ enrichGameFromIgdb()      (179行) ── IGDB反映（同一性ガード付き, Issue #50/#166）
  ├─ deduplicateGames()        (618行) ── 重複排除
  ├─ reconcileSelectedGames()  (732行)
  ├─ selectGamesForArticles()  (971行) ── カテゴリ別選定
  ├─ removeZombieGames()       (843行) ── 必須情報欠落ゲーム除去
  └─ Completeness Gate (R0〜R4)        ── 機械検証・差し替え/fail（completeness-gate.ts）
        ↓ data/selected-games.json
scripts/generate-articles.ts (1402 行)
  ├─ selectFeatureThemeWithAI / selectFeatureGames ── 特集テーマ・ゲーム選定
  ├─ deduplicateGames()        (603行) ★fetch-data.ts とは別実装の同名関数
  ├─ Tavily Web検索でグラウンディング
  ├─ Bedrock(Claude) で本文生成（generateNewReleaseArticle 等）
  └─ 自動再生成ループ（VALIDATION_AUTO_REGENERATE=true 時のみ, 1回だけ）
        ↓ data/generated-articles.json
scripts/build-issue.ts (647 行)
  ├─ game-source-mismatch 事前チェック（.md 書き込み前, Issue #166）
  ├─ Markdown 組み立て・履歴更新（game-history.ts）
  ├─ validate-article.ts (958行) ── 正規表現バリデータ（生成後・多数ルール）
  └─ judge-article.ts     ── LLM-as-a-judge 事実性チェック（デフォルトON）
```

補助モジュール（実在確認済み）:
- `scripts/identity-resolver.ts` (138行) — **プラットフォーム別ストアURL解決のオーケストレーションのみ。同一性判定関数は持たない**
- `scripts/resolvers/{steam,nintendo,playstation,xbox,appstore,googleplay,match,locale,tavily-search}.ts`
- `scripts/normalize.ts` (27行) — `normalizeTitle`（比較・履歴・除外リスト用）
- `scripts/resolvers/match.ts` (108行) — `normalizeTitle` / `isSameGame` / `matchesAnyTitle`（ストア突合用, **別仕様**）
- `scripts/completeness-gate.ts` (446行) — 生成前の機械検証ゲート R0〜R4
- `scripts/indie-classifier.ts` — `LARGE_DEVELOPERS`（約45社）+ `MAJOR_PUBLISHER_SUBSIDIARIES` 静的リスト, `isLargeStudio` / `isIndieGame`
- `scripts/game-filter.ts` (49行) — `isQualifiedGame` / `isFanGame`
- `scripts/__fixtures__/known-cases.json` — **回帰ケースは実測6件のみ**

---

## 0.5 fable5版との差分（重要）

本ドキュメントが fable5版を上書き・修正する主要点。fable5版だけを読んで着手すると誤った前提で実装してしまうため、必ず確認すること。

| # | fable5版の記述 | 実コードで検証した事実（本ドキュメントの修正） |
|---|---|---|
| D1 | 同一性判定は `fetch-data.ts` と `identity-resolver.ts` の**2系統**に分散 | `identity-resolver.ts` は**同一性判定関数を持たない**（ストアURL解決オーケストレーションのみ）。実際の重複は **3系統**: `normalize.ts` / `fetch-data.ts:116,146` / `resolvers/match.ts:16,57` |
| D2 | 統合先は `identity-resolver.ts` に `isSameGameIdentity` を追加 | `identity-resolver.ts` は責務が違う。**新規の独立モジュール（例 `scripts/game-identity.ts`）** に集約すべき |
| D3 | 「発売年差 ±2 で統合」 | 実際は **fetch-data.ts が ±3**（`SAME_GAME_YEAR_TOLERANCE=3`）、**match.ts が ±2** で**既に不一致**。統合時にどちらに揃えるか要決定（後述） |
| D4 | `deduplicateGames` の重複には言及なし | `fetch-data.ts:618` と `generate-articles.ts:603` に**同名別実装が2つ**存在。統合対象に追加 |
| D5 | 2つの `normalizeTitle` は「用途が違うので統合対象外」（normalize.ts のコメントにも記載） | 用途が違っても**正規化仕様が実際に乖離**（match.ts は句読点全削除 `[^\p{L}\p{N}\s&]`、normalize.ts は句読点を残す）。これが `c00dad8` の "regex inconsistency" 再発根源。少なくとも「仕様差が意図的かをテストで固定」する必要がある |
| D6 | URL解決（公式URL/ストアURL）の再発は個別Issueとして散在扱い | **Issue件数上の最大クラスタ**（約19件）。`resolvers/nintendo.ts` は直近40コミットで5回修正。優先度を格上げすべき |

---

## 1. 洗い出した問題（根本原因・実測エビデンス付き）

### 問題A【最大の再発源】: 公式URL / ストアURL解決の慢性的再発

**エビデンス（実測）**:
- URL/resolver 関連 Issue: `#12, #30, #32, #42, #44, #55, #58, #60, #68, #108, #113, #116, #117, #126, #127, #131, #132, #135, #147, #149, #159` … 約20件が「リンク先が違う / 英語サイトになる / 到達不能 / 表示されない / 別タイトル誤マッチ」に集中。
- 直近40コミットの変更ファイル頻度（実測）: `resolvers/nintendo.ts` 5回、`verify-official-url.ts` 3回、`resolvers/locale.ts` 3回。

**根本原因（確認済み事実 + 推論）**:
- 各 resolver（steam/nintendo/playstation/xbox/appstore/locale）が web-search 経路・IGDB 経路・locale 経路と複数経路を持ち、それぞれで `matchesAnyTitle`（match.ts）を使ってタイトル照合している。照合ロジックの微妙な差（strict フラグの有無、プレフィックス一致の許容度）が経路ごとの誤マッチを生む（#131「プレフィックス一致の過剰許容でシリーズ続編を誤マッチ」が実例）。
- 「照合が経路ごとに散らばり、1経路を直しても他経路が追随しない」構造。これは問題B（同一性判定の分散）の URL 版であり、同根と考えられる（推論）。

fable5版はこのクラスタを個別Issue扱いにしていたが、**発生頻度で見れば最優先級**である。

### 問題B: 「同一ゲーム判定」ロジックが3系統に分散

同じ「これは同じゲームか？」に、独立実装が3つ別々に答えている（実測）。

| 系統 | 正規化 | 一致判定 | 年差許容 |
|---|---|---|---|
| `normalize.ts:19` `normalizeTitle` | `™®©`除去・コロン/ハイフンを空白化・**句読点は残す** | （正規化のみ） | — |
| `fetch-data.ts:116` `titleMatches` + `:146` `isSameGame` | `normalize.ts` を使用 | 完全一致 / 部分一致(≥5文字) / 先頭3語一致 | **±3**（`SAME_GAME_YEAR_TOLERANCE`） |
| `resolvers/match.ts:16` `normalizeTitle` + `:57` `isSameGame` | `&amp;`変換・**句読点全削除** `[^\p{L}\p{N}\s&]` | プレフィックス一致 + strict フラグ | **±2** |

**確認済みの実害**:
- 2つの `normalizeTitle` は同一入力で異なる出力を返しうる（`match.ts` はアポストロフィ・括弧等を削除、`normalize.ts` は残す）。同じタイトルでも突合経路で結果が変わる。
- 年差許容が **±3 と ±2 で不一致**。fetch-data の集約と resolver の突合で「同一ゲームか」の境界が違う。
- `isSameGame` は引数シグネチャ（オブジェクト2つ vs 文字列4つ+strict）も一致ロジックも異なる。

これが `c00dad8`「regex inconsistency」・#166「別ゲームのメタ混入」が形を変えて再発する土台。

### 問題C: `deduplicateGames` が2ファイルで別実装

`fetch-data.ts:618` と `generate-articles.ts:603` に同名 `deduplicateGames`。重複排除ロジックの二重管理。片方だけ修正されるリスクがある（fable5版は未指摘）。

### 問題D: ハードコードされた大手スタジオ静的リストへの構造的依存

- `indie-classifier.ts:9` `LARGE_DEVELOPERS`（約45社）+ `:71` `MAJOR_PUBLISHER_SUBSIDIARIES`。
- **実測の再発**: #164（newRelease に大手ゲート追加）→ 約1週間後 #167（リスト追加漏れで再発）。#162（個人開発ゲームが新作紹介に混入 = 分類ミス）も同根。
- ゲーム業界の実体（新興スタジオ）は増え続けるため、静的リストは「発覚してから追加」の後追いにしかならない構造的問題。

**注意**: 現状 `IGDBGame` 型には `involved_companies` / `game_count` 相当のフィールドが**存在しない**（types.ts 確認済み）。シグナルベース化には IGDB 取得の拡張が前提になる。

### 問題E: 検出が「生成後の正規表現」に偏重

- `validate-article.ts` は958行、大半が生成後の正規表現バリデータ（数値捏造・人物発言・プラットフォーム整合など多数ルール）。バグのたびに検出パターンを1つ追加する運用の証跡。
- 一方、生成**前**の Completeness Gate は R0〜R4 のみで、**識別子の相互整合（別ゲームのメタ混入 #166型）を生成前に機械ブロックしていない**。#166 は本来この段階で機械的に弾けるべき性質のバグ。

### 問題F: リグレッションコーパスが薄い + 「消して再生成」が常態化

- `known-cases.json` のケースは**実測6件**。一方 `fix:` 系コミットは**197件**（`git log --oneline --all | grep -iE "fix:|Issue #|再生成" | wc -l`）。再現可能バグの大半が回帰テスト化されていない。
- 「再生成のため記事と履歴を削除」コミットは Vol.14 だけで3回（`672a118`, `2f9288d`, `6f903a1`）。「公開後に発覚 → 消して再実行」が既定の復旧手段になっている。

### 問題G: `fetch-data.ts` (1294行) への責務集中

集約・名寄せ・IGDB反映・重複排除・照合・選定・ゾンビ除去・ゲート適用が、同一の `GameData[]` を順次変異させる共有状態で結合。直近40コミットで9回修正されており（最多）、密結合が修正の波及と再発を招いていると考えられる（推論）。

---

## 2. 対策の全体方針と優先順位

**fable5版から優先順位を実測再発頻度に合わせて組み替えた。**
土台となる「同一性判定の一本化」を最優先に置き、その上に URL 照合・生成前ゲートを乗せる。

| PR | 対策 | 対応問題 | 優先度 | 独立性 |
|---|---|---|---|---|
| PR-1 | 同一性判定の一本化（`normalizeTitle`/`isSameGame`/`deduplicateGames` を単一モジュール `game-identity.ts` に集約） | B, C, D5 | 最優先 | 他PRの土台 |
| PR-2 | URL/ストア解決の照合を PR-1 に載せ替え + resolver 契約テスト化 | A | 高 | PR-1 完了後 |
| PR-3 | Completeness Gate に R5（識別子相互整合）追加 | E | 中 | PR-1 完了後 |
| PR-4 | 大手スタジオ判定のシグナルベース化（静的リストと OR 併用） | D | 中 | 独立（要 IGDB 拡張） |
| PR-5 | 既知バグの回帰テスト化（継続タスク）+ ルール明文化 | F | 継続 | 独立 |

`fetch-data.ts` の分割（問題G）は PR-1〜PR-3 で同一性・照合・ゲートが外部モジュール化されれば自然に薄くなるため、独立した分割PRは設けず、各PRの副作用として縮小させる方針とする。

---

## PR-1: 同一性判定の一本化

### 目的
「これは同じゲームか」「このタイトルをどう正規化するか」「重複をどう排除するか」の3つの問いに対する実装を、
新規モジュール `scripts/game-identity.ts` に集約し、`fetch-data.ts` / `resolvers/match.ts` / `generate-articles.ts` の重複実装を廃止する。

### 現状確認（着手前に必ず実施）

```bash
grep -n "function titleMatches\|function isSameGame\|SAME_GAME_YEAR_TOLERANCE" scripts/fetch-data.ts
grep -n "function normalizeTitle\|function isSameGame\|function matchesAnyTitle" scripts/resolvers/match.ts
grep -n "function normalizeTitle" scripts/normalize.ts
grep -n "function deduplicateGames" scripts/fetch-data.ts scripts/generate-articles.ts
# 呼び出し元の全量
grep -rn "titleMatches(\|isSameGame(\|matchesAnyTitle(\|normalizeTitle(\|deduplicateGames(" scripts/ --include="*.ts" | grep -v ".test.ts"
```

### 事前の意思決定（実装前に必ず確定）

1. **年差許容値の統一**: 現状 fetch-data=±3、match.ts=±2。統合後の値を決める。
   - 推奨: **±2 に統一**（`known-cases.json` の「同名異作品」ケースのしきい値と整合させる。厳しい側に寄せる方が誤統合による #166 型のメタ混入を防げる）。
   - ただし ±3→±2 で fetch-data の集約挙動が変わるため、**変更前後で `DEV_MODE=true npm run build-issue:dev` の選定結果を比較**し、意図しない分離が起きないか確認する。差異が出た場合はそのゲームを `known-cases.json` に固定してから進める。
2. **正規化仕様の統一方針**: 「比較・履歴用（normalize.ts）」と「ストア突合用（match.ts）」で仕様差が本当に必要か検証する。
   - まず両者の差分を洗い出すユニットテストを書き（同一入力で出力を比較）、差が出るケースを列挙する。
   - 差が**意図的**（例: ストア突合では句読点を消したい）なら、`game-identity.ts` に `normalizeForCompare` / `normalizeForStoreMatch` の2関数として**明示的に共存**させ、テストで仕様を固定する。暗黙の別実装を「明示的に名前の違う2関数」に変えるのが最低ライン。
   - 差が**非意図的**なら1関数に統合する。

### 実装手順

1. **新規モジュール `scripts/game-identity.ts` を作成**し、以下をエクスポートする:
   ```ts
   // 正規化（意思決定2の結果に応じて1つ or 2つ）
   export function normalizeForCompare(title: string): string { /* normalize.ts のロジックを移植 */ }
   export function normalizeForStoreMatch(title: string): string { /* match.ts のロジックを移植 */ }

   // 発売年抽出（fetch-data と match.ts に別実装あり → 統合）
   export function extractYear(dateStr?: string): number | undefined { /* match.ts:33 版が両形式対応で高機能。こちらをベースに */ }

   export const SAME_GAME_YEAR_TOLERANCE = 2; // 意思決定1の結果

   export interface GameIdentitySignals {
     title: string;
     titleJa?: string;
     steamAppId?: number;
     igdbSlug?: string;
     releaseDate?: string;
   }

   /**
    * 2つのゲーム識別子が同一ゲームを指すか判定する唯一の実装。
    * 優先順位: steamAppId 一致 > igdbSlug 一致 > (正規化タイトル一致 AND 年差 <= 許容)
    */
   export function isSameGameIdentity(a: GameIdentitySignals, b: GameIdentitySignals): boolean {
     // 1. steamAppId が両方あり一致 → 無条件で同一（最強シグナル。enrichGameFromIgdb の sameByAppId と同じ思想）
     // 2. igdbSlug が両方あり一致 → 同一
     // 3. タイトル一致（fetch-data:titleMatches のロジック移植）AND 年差判定
     // titleMatches は内部ヘルパーとして残してよいが export しない
   }

   /**
    * ストア突合用（複数クエリタイトル対応）。match.ts:matchesAnyTitle を移植。
    * strict=true でプレフィックス一致を禁止。
    */
   export function matchesAnyTitle(
     queryTitles: string[], candidateTitle: string,
     queryDate?: string, candidateDate?: string, strict?: boolean,
   ): boolean { /* match.ts:99 を移植 */ }

   /** 重複排除（fetch-data:618 と generate-articles:603 を統合） */
   export function deduplicateGames(games: GameData[]): GameData[] { /* 両実装を突き合わせ、上位互換で統合 */ }
   ```
   - **ゼロから書き直さない**。既に Issue 対応で鍛えられた既存ロジック（特に `fetch-data.ts:146` `isSameGame` と `enrichGameFromIgdb` の appId 優先思想、`match.ts` の strict/プレフィックス制御）を移植する。

2. **`fetch-data.ts` の置き換え**: `titleMatches` / `isSameGame` / `deduplicateGames` / `extractYear` / `SAME_GAME_YEAR_TOLERANCE` のローカル定義を削除し、`game-identity.ts` からの import に置き換える。`aggregateGames`・`enrichGameFromIgdb`・`selectGamesForArticles` 等の呼び出しを差し替える。

3. **`resolvers/match.ts` の置き換え**: `normalizeTitle` / `isSameGame` / `matchesAnyTitle` / `extractYear` を `game-identity.ts` に委譲する（`match.ts` は re-export の薄いラッパにするか、呼び出し元を直接 `game-identity.ts` に向ける）。resolver 各ファイル（steam/nintendo/appstore/locale）の `matchesAnyTitle` import 先を更新。

4. **`generate-articles.ts` の置き換え**: ローカル `deduplicateGames` を削除し import に置き換え。

5. **`normalize.ts` の扱い**: `normalizeTitle` は `game-history.ts` など多数から使われている。`game-identity.ts` の `normalizeForCompare` に統合し、`normalize.ts` は re-export だけ残すか、呼び出し元を移行する。**残存参照を grep で必ず確認**。

6. **テスト**:
   - `scripts/game-identity.test.ts` を新設。`known-cases.json` の全6ケースを `isSameGameIdentity` で再現するテストを追加。
   - 正規化2関数の仕様差を固定するテスト（意思決定2で列挙したケース）。
   - 年差 ±2 の境界値テスト（同名で年差2=同一、年差3=別作品）。
   - `npm run test`（= `tsc --noEmit` + `vitest run scripts`）green。
   - `DEV_MODE=true npm run build-issue:dev` で実データの選定結果が意図せず変化していないか目視確認。

### 完了条件
- `fetch-data.ts` / `resolvers/match.ts` / `generate-articles.ts` に同一性判定・正規化・重複排除のロジック定義が存在しない（すべて `game-identity.ts` に委譲）。
- `grep -rn "function titleMatches\|function isSameGame\|function normalizeTitle\|function deduplicateGames" scripts/` の結果が `game-identity.ts` のみ（match.ts/normalize.ts は re-export のみ許容）。
- `known-cases.json` 全ケースが `game-identity.test.ts` で green。
- `npm run test` green。

---

## PR-2: URL/ストア解決の照合を PR-1 に載せ替え + resolver 契約テスト化

### 目的
問題A（URL解決の最大再発クラスタ）に対し、resolver 各経路のタイトル照合を PR-1 の統一関数に集約し、
過去の誤マッチ事例を契約テストとして固定して再発を止める。

### 前提
PR-1 完了（`matchesAnyTitle` が `game-identity.ts` に一本化されていること）。

### 現状確認

```bash
grep -rn "matchesAnyTitle(" scripts/resolvers/*.ts | grep -v test
# 各 resolver の経路（web-search / igdb / locale / storesearch）の照合呼び出しを列挙
grep -rn "startsWith\|includes\|===" scripts/resolvers/locale.ts scripts/resolvers/nintendo.ts | head -30
```

### 実装手順

1. **照合の一元化**: 各 resolver 内で `matchesAnyTitle` を経由せず独自に `startsWith`/`includes` でタイトル比較している箇所があれば、すべて `game-identity.ts` の `matchesAnyTitle`（strict 指定つき）に置き換える。#131（プレフィックス過剰許容）のような経路固有の照合を残さない。

2. **strict ポリシーの明文化**: どの経路で strict=true（完全一致のみ）を使い、どこで false（プレフィックス許容）かをコメントで明記する。原則、**同プラットフォーム内で別タイトルを引きうる locale/nintendo の web-search 経路は strict=true**（#126「同プラットフォーム別タイトル誤検知」の対策と整合）。

3. **契約テストの新設**: `scripts/resolvers/match-contract.test.ts`（または各 resolver の test）に、過去に誤マッチした実タイトルペアを固定する:
   - #131: シリーズ続編の誤マッチ（プレフィックス一致が過剰許容したケース）
   - #126: 同プラットフォーム別タイトル誤検知
   - #149: 英語サイト誤採用（locale 判定）
   - #166: Brick Game（同名旧作の混線）
   各ケースについて「照合結果が期待どおり（マッチ/非マッチ）」をアサートする。

4. **テスト**: `npm run test` green。`DEV_MODE=true npm run build-issue:dev` で URL 解決結果を目視確認し、既知の正しいURLが取れていること・誤URLが排除されていることを確認する。

### 完了条件
- resolver 内のタイトル照合が `game-identity.ts` の `matchesAnyTitle` に統一されている。
- 過去のURL誤マッチ Issue（#126/#131/#149/#166）が契約テストで固定され green。

---

## PR-3: Completeness Gate に R5（識別子相互整合）を追加

### 目的
「別ゲームのメタ混入」（#166 型）を、生成後の `build-issue.ts` の事後チェックではなく、
生成前の Completeness Gate で機械的にブロックする。

### 前提
PR-1 完了（`isSameGameIdentity` が使えること）。

### 現状確認

```bash
grep -n "ViolationId\|RULE_REPLACEABLE\|function check\|checkGame" scripts/completeness-gate.ts
grep -n "steamResolved\|steamAppId\|igdbSlug" scripts/types.ts
```

### 実装手順

1. **`GameData` の識別子解決情報の確認**: R5 は「エントリが持つ識別子どうしが同一ゲームを指すか」を検証する。
   現状 `GameData` に「steamAppId から解決されたタイトル（steamResolvedTitle 等）」が保持されているかを確認する。
   - **保持されていない場合**: まず `types.ts` の `GameData` に解決時タイトル（例 `steamResolvedTitle`, `steamResolvedReleaseDate`）を追加し、`fetch-data.ts` の Steam/IGDB 解決箇所（`searchGameBySteamAppId` / `enrichGameFromIgdb`）で埋めるよう修正する。**この依存を先に解消する**。
   - なお `enrichGameFromIgdb` は既に appId 一致ガードを持つ（#166 対応）。R5 はそれを「生成前ゲートでの独立した二重防御」として機械検証する位置づけ。

2. **R5 ルール定義**:
   ```ts
   export type ViolationId = 'R0' | 'R1' | 'R2' | 'R2b' | 'R3' | 'R4' | 'R5';
   export const RULE_REPLACEABLE: Record<ViolationId, boolean> = {
     R0: false, R1: true, R2: false, R2b: false, R3: true, R4: true,
     R5: false, // 差し替えても再発しうる内部整合性バグシグナル → R2/R2b と同じく false
   };
   ```
   ※ R5 を `false`（差し替え不能=内部バグシグナル）にするか `true`（差し替えで回避）にするかは要検討。**推奨は false**: 別ゲームのメタが混入した状態は「差し替えれば直る」性質ではなく内部整合性の破綻なので、fail に倒して原因を可視化する方が問題F（消して再生成）の抑止になる。

3. **チェック関数**:
   ```ts
   export function checkR5(game: GameData): GateViolation | null {
     const violations: string[] = [];
     if (game.steamAppId && game.steamResolvedTitle) {
       const same = isSameGameIdentity(
         { title: game.title, titleJa: game.titleJa, releaseDate: game.releaseDate },
         { title: game.steamResolvedTitle, releaseDate: game.steamResolvedReleaseDate },
       );
       if (!same) violations.push(`steamAppId=${game.steamAppId} の解決タイトル "${game.steamResolvedTitle}" が game.title と不一致`);
     }
     // igdbSlug についても同様（解決タイトルを保持している場合）
     if (violations.length === 0) return null;
     return { ruleId: 'R5', gameTitle: game.title, detail: violations.join('; ') };
   }
   ```

4. **`checkGame` への組み込み**: `checkGame`（completeness-gate.ts:275）に `checkR5` を追加。呼び出し元（`fetch-data.ts` の `runCompletenessGate` 呼び出し = `removeZombieGames` 直後・`fs.writeFileSync` 前）はそのままで機能する。

5. **テスト**: `scripts/completeness-gate.test.ts` に R5 の正常系・違反系を追加。**#166 の実データパターン（Brick Game: steamAppId が新作を指すのに title/メタが同名旧作）を再現するケースを最低1件**含める。

### 完了条件
- R5 違反時に既存ルールと同様に report に記録され、mode=fail で `process.exit(1)` に至る。
- #166 相当のデータパターンをテストで再現し、生成前にブロックできることを確認。

---

## PR-4: 大手スタジオ判定のシグナルベース化

### 目的
静的リスト（`LARGE_DEVELOPERS` + `MAJOR_PUBLISHER_SUBSIDIARIES`）による大手判定を、IGDB 構造化データから導出できる形に補強し、
新規スタジオの追加漏れ（#167 型）という再発を構造的に緩和する。

### 現状確認

```bash
grep -n "LARGE_DEVELOPERS\|MAJOR_PUBLISHER_SUBSIDIARIES\|isLargeStudio\|isIndieGame" scripts/indie-classifier.ts
grep -n "involved_companies\|game_count\|companies" scripts/fetch-igdb.ts scripts/types.ts
```

**重要な前提**: 現状 `IGDBGame` 型・`fetch-igdb.ts` は `involved_companies` / `game_count` を**取得していない**（確認済み）。シグナルベース化にはまず IGDB 取得の拡張が必要。着手前に IGDB API で実際に取れるフィールドを確認すること。

### 実装方針（いきなり静的リスト撤廃はしない）

2段構えでロールアウト（リグレッションリスク回避）:
1. `indie-classifier.ts` に `hasStrongCompanySignal(game: GameData): boolean` を新設。以下のいずれかで発火:
   - IGDB `involved_companies` の `company.game_count` が閾値以上（要 IGDB 取得拡張）
   - `metascore` が存在（大手作品ほどレビューが付く）
   - `steamRank` 掲載 / `igdbRatingCount` が高い
2. `isLargeStudio` はそのまま残し、呼び出し元で `isLargeStudio(game.developer).isLarge || hasStrongCompanySignal(game)` の **OR 併用**にする。
3. シグナル発火時は必ずログ: `console.log('[indie-classifier] company signal matched (not in static list):', game.title, game.developer)`。これで静的リストの漏れを事後発見できる。
4. 数週間運用し、シグナルが静的リストのカバー範囲を取りこぼさないことをログで確認できたら、静的リストをフォールバックに格下げ。

### テスト
`scripts/indie-classifier.test.ts` に `hasStrongCompanySignal` の単体テストを追加。#167 で漏れていたスタジオが、シグナル経由で大手判定されることを確認するケースを含める。

### 完了条件
- シグナルベース判定が静的リストと OR 併用で動作。
- 発火がログで追跡可能。
- 既存テスト green。

---

## PR-5（継続タスク）: 既知バグの回帰テスト化 + ルール明文化

### 目的
`fix:` コミット（197件）のうちデータ起因で再現可能なものを `known-cases.json`（現状6件）に追加し、CIで恒常検知する。
さらに「今後 data 起因バグを直したら必ず known-cases に追加」をルール化して、モグラ叩きの再発を仕組みで止める。

### 実装手順

1. 直近3ヶ月の対象コミット棚卸し:
   ```bash
   git log --since="3 months ago" --oneline | grep -iE "fix:|Issue #"
   ```
2. 各コミットを `git show <hash>` で確認し、以下を満たすものを抽出:
   - 特定の入力データ（タイトル/ID/APIレスポンス）に対する誤判定である（＝再現可能）
   - `known-cases.json` に同種ケースが未登録
   - 優先的に取り込むべき既知事例: #166（Brick Game）, #131（続編誤マッチ）, #126（同プラットフォーム別タイトル）, #167（大手漏れ）, #162（インディー誤分類）, #102（appId 取り違え）, #150（名作カテゴリ欠落）
3. `scripts/__fixtures__/known-cases.json` の既存フォーマット（`issue`, `scenario`, `input`, `*Mock`, `expected`）に従って追加。
4. `scripts/known-cases.test.ts` が新規ケースを自動的に拾うことを `npm run test` で確認。
5. **ルール明文化**: `CLAUDE.md` の「コミット・PR作成前の品質ゲート」に「data 起因バグの修正時は `known-cases.json` への回帰ケース追加を必須とする」を追記する（別PRまたは本PRで）。

### 完了条件
- 直近3ヶ月の再現可能な `fix:` が `known-cases.json` に反映されている。
- 「data 起因バグ修正時は known-cases 追加必須」が CLAUDE.md に明文化されている。

---

## 3. 実装時の共通ルール

- 各PRはプロジェクトの Issue 対応ワークフロー（`CLAUDE.md`）に従う: ブランチ作成 → 実装 → コミット → `gh pr create`。
  ブランチ名例: `fix/root-cause-pr1-identity-consolidation`, `fix/root-cause-pr2-resolver-match`, ...
- コミット・PR作成前に必ず実行:
  ```bash
  npm run typecheck   # tsc --noEmit --project scripts/tsconfig.json
  npm run test        # typecheck + vitest run scripts
  ```
- シンボルを削除・リネームした場合（PR-1 で `titleMatches`/`isSameGame`/`deduplicateGames` 等を削除する）は残存参照を必ず grep:
  ```bash
  grep -rn "titleMatches\|isSameGame\b\|deduplicateGames\|SAME_GAME_YEAR_TOLERANCE" scripts/ --include="*.ts"
  ```
- 実データ検証は `DEV_MODE=true npm run build-issue:dev` を使用し、本番ディレクトリ（`src/content/issues/`, `data/validation/`）には書き込まない（DEV_MODE の運用ルール遵守）。
- PR作成後は `/code-review` を自動実行し、指摘を確認してから完了とする。
- PRマージ後は `git checkout main && git pull` でローカル main を最新化する。

## 4. 優先着手の推奨

**PR-1（同一性判定の一本化）から着手する。** 理由:
- PR-2/PR-3 が PR-1 の成果物（`game-identity.ts`）に依存するため、先に済ませると手戻りが少ない。
- 問題B/Cは影響範囲が明確（`fetch-data.ts` / `resolvers/match.ts` / `generate-articles.ts` / `normalize.ts`）で着手しやすい。
- 直近の再発バグ（#166, `c00dad8` の regex inconsistency）が最も直接的にこの問題に起因している。

PR-1 完了後、**実測で最大クラスタの PR-2（URL照合）を優先**し、その後 PR-3（生成前ゲート強化）へ進む。PR-4/PR-5 は独立して並行着手可。
