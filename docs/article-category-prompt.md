  各セッションの冒頭に貼る共通ヘッダと、PR別の指示に分けています。

## 進捗管理

| PR | ブランチ | 状態 | Issue/PR | 依存関係・備考 |
|---|---|---|---|---|
| PR-0 | `fix/issue-208-search-filter` | ✅ **マージ済み**（2026-08-08。`ad5b916`） | #208（`Refs`。未クローズ）/ PR #219 | **ブランチ名は当初案の `fix/issue-208-searchgamebyname-filter` から短縮**。**レビューで初回実装が差し戻され、無条件適用 → `mainGameOnly` オプションによる呼び出し元切り替えに設計変更**（コミット 2 本）。24 ファイル / 736 テスト全通過（着手前 23 / 724） |
| PR-0.1 | `fix/issue-208-feature-ai-screening` | ✅ **マージ済み**（2026-08-08。`0c07ba1`。**#208 クローズ済み**） | #208（Closed）/ PR #220 | **PR-0 の残タスク**。24ファイル / 744テスト（着手前 736）。レビュー指摘4件のうち1件を本PRで修正、3件を **#221 / #222** に分離。Issue #208 の「想定される修正」2項目目＝特集経路への `isAdultContentByAI` 適用（他 3 カテゴリは適用済み: `generate-articles.ts:1251` / `:1272` / `:1352`。feature のみ適用箇所が無い）。**適用位置は「選定確定後・本数警告の前」に決定済み**（2026-08-08。下記 PR-0.1 節に根拠）。**これで #208 をクローズする**。PR-0 の後・PR-0.5 の前。#219 はマージ済みなので `main` から切ればリベース不要 |
| PR-0.5 | `refactor/parameterize-igdb-filters` | ✅ **マージ済み**（2026-08-08。`28f835f`。squash） | - / PR #224 | 挙動不変の純リファクタ。24ファイル / 749テスト（着手前 744）。`/code-review` の**指摘ゼロ**。**ユーザー確認事項は「`mainGameOnly` を `gameTypes` に一般化しない」で確定**（別軸のため。下記 PR-0.5 節に根拠）。**このPRで `fetch-igdb.ts` の行番号が 21 行目以降すべて +12 ずれた** |
| PR-A | `fix/steam-dlc-exclusion` | ✅ **マージ済み**（2026-08-08。`2011619`。squash） | - / PR #226 | 24ファイル / 760テスト（着手前 749）。**仕様書に無い新事実を実測で発見**: `coming_soon` からサウンドトラック（`type=music`）が混入していた。レビュー指摘4件の内訳は 1件を本PRで修正 / 2件を **#227 / #228** に分離 / 1件（進捗表の更新）は後続の docs PR #229 で対応。**このPRで `fetch-steam.ts` の行番号が大きくずれた**（下記「行番号は必ず自分で確認する」節） |
| PR-B | `feat/newrelease-score-and-remake` | ✅ **マージ済み**（2026-08-08。`1bb61e6`。squash） | #210（`Refs`。未クローズ）/ PR #230 | 26ファイル / 865テスト（着手前 24 / 760）。コミット2本（実装 → レビュー対応）。**`/code-review` の指摘5件は全件が実在し、全件を本PRで修正**（別Issue分離なし）。**着手前測定（§9.3-9）で新作枠0本の原因を特定 → #231**。名作枠に `isFanGame` 未適用だったことも実測で発覚し本PRで修正 |
| PR-B2 | `feat/domestic-sales-axis` | 未着手 | - | PR-B の後。**ただし PR-I を先に入れる**（#231。2026-08-08 のユーザー判断） |
| PR-C | `feat/unreleased-article-branching` | 未着手 | - | PR-E と同じ箇所を触る。どちらか先に入れて他方をリベース |
| PR-D | `refactor/remove-metacritic-path` | 未着手 | - | 名作枠PR と直列（`fetch-data.ts` の名作枠選定部で競合） |
| 名作枠PR | `feat/classic-slot-redesign` | 未着手 | - | PR-D と直列 |
| PR-I | `feat/indie-scale-classification` | 未着手（**次はこれ**。2026-08-08 に前倒し） | 関連 #175（読み替え要）/ **#231** | **PR-B の着手前測定で優先度が上がった。** 新作枠が 0 本になる直接原因が `isLargeStudio` の静的リスト不備で、PR-I の `developed > 20` 判定がそのまま効く（`isLargeStudio` は新作枠ゲートとインディー判定の共通関数）。**インディー枠だけの変更ではないので、新作枠の採用件数の前後比較を受け入れ条件に入れること**（#231） |
| PR-E | `fix/prompt-excerpt-length` | 未着手 | - | PR-C と同じ箇所を触る。どちらか先に入れてリベース |
| PR-F0 | `fix/publish-date-jst` | 未着手 | - | PR-F の直前に入れる |
| PR-F | `feat/feature-event-fallback` | 未着手 | - | PR-F0 の後 |
| PR-G | `feat/article-count-validation` | 未着手 | - | PR-B・名作枠PR より後。severity=high の妥当性は§9.1の保留と合わせて着手前にユーザー確認 |

状態は `未着手` / `実装中` / `レビュー中` / `マージ済み` のいずれかで更新する。

---

  共通ヘッダ（全PRで共通・毎回先頭に貼る）

# 役割分担

  あなたは**実装管理者（Opus）**です。コードを自分で書かず、**実装は Sonnet 
  のサブエージェントに委譲**してください。

- 実装作業（コード編集・テスト作成）: `Agent` ツールで `model: "sonnet"` を指定して委譲
- あなたの担当: 仕様の解釈、作業の分解、Sonnet への指示作成、成果物のレビュー、
品質ゲートの実行、コミット・PR作成
- Sonnet の報告を鵜呑みにせず、**diff を自分で読んで検証**すること
- Sonnet が仕様を誤解していたら、指示を修正して再委譲する

# 必ず先に読むもの

1. `CLAUDE.md`（Issue対応ワークフロー・品質ゲート・テストコード規約・DEV_MODE）
2. `docs/article-category-spec.md` の該当節（下記PR指示で指定）
3. `docs/article-category-spec-review.md` の該当決着ブロック（判断の根拠。grep で探す）

# 全PR共通の規約

## ブランチとPR

- main への直接コミットは禁止。必ずブランチを切る
- PR本文に `Closes #<番号>`（Issueがある場合）
- PR作成後、**`/code-review` を自分で実行する**（`Skill` ツールで `code-review`、引数に PR 番号）。
CLAUDE.md が「ユーザーの指示を待たずに実施」と定めている。
指摘は鵜呑みにせず、**採否を管理者が判断してユーザーに提示する**
  - 当初この節は「Claude からは起動できない」と書いていたが**誤り**（2026-08-08 に実行して確認）。
  ユーザーの明示呼び出しが必要なのは `/code-review ultra`（クラウド多エージェント版）のみ
  - スコープ外の指摘は**別Issueに分離する**（前例: PR-0.1 → #221 / #222）
  - **レビューの提案をそのまま採用しないこと。** PR-0.1 では提案どおり直すと
  #208 で塞いだ穴が再び開く指摘があった（#221 に記録）

## 品質ゲート（コミット前に必須）

- `npm run test`（typecheck + vitest）
- **ベースラインは PR-A マージ後で 24ファイル / 760テスト 全通過**
  （PR-0.5 マージ後は 24 / 749、PR-0.1 マージ後は 24 / 744、PR-0 マージ後は 24 / 736、
  PR-0 着手前は 23 / 724）。
  これを下回らないこと。**着手時に自分で `npm run test` を実行して実際の数を確認すること**
  （この数値は PR がマージされるたび増える）
- シンボルを削除・リネームしたら残存参照を grep で確認

## テストコード（CLAUDE.md の厳守事項）

- **実装前に失敗するテストを書く**（Red-Green-Refactor）
- `expect(true).toBe(true)` のような無意味なアサーションは禁止
- テストを通すためだけのハードコード、本番コードへの `if (testMode)` は禁止
- 閾値は環境変数化する（前例: `INDIE_POPULARITY_STEAM_REVIEWS_MIN` など
`select-indie-with-fallback.ts:19-23`）
- **境界値のテストを必ず含める**

## 実測の原則（今回の調査で得た教訓）

- 仕様の記述を疑ったら、推論せず**ライブAPIで実測**する
- `data/aggregated.json` 等の中間データを実測の代わりに使わない
（中身が古く、一度これで誤判定した）
- ローカルに `.env.local` があるが自動では読まれない。
使うなら `set -a; . ./.env.local; set +a`

## 一時ファイル

- 調査スクリプトは `.claude-scratch/` に置く（gitignore対象）
- スクリーンショットは `screenshots/`
- 実データ検証は `DEV_MODE=true npm run build-issue:dev`。
本番ディレクトリ（`issues/`, `features/`）には書き込まない

## 行番号は必ず自分で確認する

**本ファイル中の行番号は全て「記載時点」のもので、PR がマージされるたびにずれる。**
実際に PR-0 / PR-0.1 のマージで `fetch-igdb.ts` が約+5行、`generate-articles.ts` が
約+22行ずれ、複数の参照が陳腐化した。**さらに PR-0.5 で `fetch-igdb.ts` の
21 行目以降が一律 +12 行ずれた**（`buildIgdbCommonFilters` の本体が 3 行→15 行になったため）。

⚠️ **PR-A（#226）で `fetch-steam.ts` の行番号がずれた。** 位置によってずれ幅が違う
（4 つのループそれぞれに 8 行の判定ブロックが入ったため、後ろほど大きくずれる）。
マージ後の実測値（2026-08-08）:

| シンボル | 記載時点 | PR-A マージ後 |
|---|---|---|
| `ADULT_CONTENT_DESCRIPTOR_IDS` | :98 | **:106** |
| `STEAM_APP_TYPE_GAME`（PR-A で新設） | — | **:110** |
| `isSameSteamApp` | :124 | **:136** |
| `fetchSteamAppName` | :151 | **:163** |
| `getAppDetails` | :182 | **:199** |
| `fetchTopPlayed` | :205 | **:224** |
| `fetchNewReleases` | :243 | **:267** |
| `fetchSteamData` | :318 | **:358** |

⚠️ **PR-B（#230）で `fetch-igdb.ts` / `fetch-data.ts` / `types.ts` / `bedrock-client.ts` の行番号がずれ、
`scripts/newrelease-score.ts` が新設された。** マージ後の実測値（2026-08-08）:

| シンボル | PR-B 前 | PR-B マージ後 |
|---|---|---|
| `buildIgdbCommonFilters`（`fetch-igdb.ts`） | :23 | **:24** |
| `IGDB_GAME_FIELDS`（`fetch-igdb.ts`） | :341 | **:346** |
| 呼び出し元4箇所（`fetch-igdb.ts`） | :524 / :668 / :763 / :861 | **:534 / :679 / :785 / :892** |
| `IGDBGame` 型（`types.ts`） | :42 | :42（不変） |
| `GameData` 型（`types.ts`） | :84 | **:92** |
| `buildUserMessage`（`bedrock-client.ts`） | :404 | **:412** |
| `isFanGame`（`game-filter.ts`） | :45 | **:51** |
| `deduplicateGames`（`fetch-data.ts`。PR-B で export 化） | :539 | **:557** |
| `isAlreadySelected`（PR-B で新設） | — | **`fetch-data.ts:926`** |
| `buildNewReleaseCandidates`（PR-B で新設） | — | **`fetch-data.ts:938`** |
| `isRemakeOrRemaster`（PR-B で新設） | — | **`fetch-data.ts:967`** |
| `buildIndieCandidates`（PR-B で新設） | — | **`fetch-data.ts:990`** |
| `buildClassicCandidates`（PR-B で新設） | — | **`fetch-data.ts:1012`** |
| `computeNewReleaseScore`（PR-B で新設） | — | **`newrelease-score.ts:159`** |

⚠️ **更新したのは後続PR（PR-B / PR-B2 / PR-I）が参照する行番号と PR-0.5 の「実施結果」節だけ**で、
**PR-0 / PR-0.5 の「当初の指示」節および PR-0 の「実施結果」節の行番号は記載時点のまま**
（例: `:124` の `searchGameByName:486` は現在 `:498`、`:172` の `:490` は現在 `:502`、
`:187` の `__test :409` は現在 `:421`、`:451` の呼び出し元 `:512/:656/:751/:849` は現在
`:524/:668/:763/:861`）。これらは**歴史的記録として残してある**ので、
そのまま使わず必ず grep で引き直すこと。

- 行番号は**目印であって根拠ではない**。着手時に必ず `grep` でシンボル名を引き直すこと
- 特に「呼び出し元は N 箇所」という記述は、**件数ごと** grep で再確認する
  （PR-0.5 の `buildIgdbCommonFilters` が 3→4 箇所に増えていた実例がある）

---

  PR-0（最優先・Issue #208）

  【上記の共通ヘッダを先頭に貼る】

# PR-0: 特集の実在検証経路に除外フィルタを追加

> ✅ **実装完了・レビュー対応済み（2026-08-08）。PR #219。** 以下は当初の指示だが、
> **「実装」節と「実測済み」節の内容はレビューで誤りが判明し覆っている**（無条件適用は不可・
> すり替わりは既存バグではない）。着手前に必ず末尾の「実施結果」節を読むこと。

- Issue: #208
- ブランチ: `fix/issue-208-search-filter`（当初案 `fix/issue-208-searchgamebyname-filter` から短縮）
- 仕様: §4.5
- 決着ブロック: `grep -n "J-4-a" docs/article-category-spec-review.md`

## 問題

  `searchGameByName()`（`scripts/fetch-igdb.ts:486`）のクエリに `where` 句が無く、
  特集記事の「LLM提案ゲームの実在検証」経路が全フィルタを迂回している。
  実測でこの経路は成人向けが10件中7件、DLC が2件中2件 通過する。

## 実装

> ⚠️ **この節の指示は誤りだった。** 「クエリに追加する」＝無条件適用は
> Issue #208 本文が禁じていた設計だった。正しい実装は「実施結果」節を参照。

  クエリに `where game_type = 0 & themes != (42)` を追加する。
  既存ヘルパ `buildIgdbCommonFilters()`（同ファイル :19-21）が同じ文字列を返すので流用する。

## 絶対に守ること

- `searchGameBySteamAppId()`**（同ファイル :572）には追加してはならない。**
appId 経由のメタデータ補完が壊れる（検討資料 §10.3(d)）
- ~~すり替わり対策（`limit 1` で1位が落ちると2位が繰り上がる問題）は
**このPRに含めない**。既存バグとして別途扱うと決着済み~~
→ **前半は有効（本PRに含めない）。ただし「既存バグ」という理由付けは誤りだった**（下記「実測済み」参照）

## 実測済み（再調査不要）

- `search` と `where` は併用できる（HTTP 200）
- ~~副作用: `"Fate/Stay Night"` は Erotic 本体が落ちて別作品にすり替わる。
ただし `"Portal 2"` → `Portal Maze 2` 等は**修正前から発生**しており、
本修正が生む新たな害ではない（受容済み）~~
→ ⚠️ **この判断は誤りだった。** フィルタが作るすり替わり先は
**エディション SKU**（`: Deluxe Edition` / `: Limited Box`）で、評価データを持たず
DLC の appId を持つ場合がある。既存の `limit 1` すり替わりとは質が異なる。
実測値は「実施結果」節に記載

## テスト

  `scripts/fetch-igdb.test.ts` に `buildIgdbCommonFilters` の既存テストがある。
  同ファイルの書き方に倣い、`searchGameByName` のクエリに where 句が含まれることと、
  `searchGameBySteamAppId` には含まれないことの両方を検証する。

## 実施結果（2026-08-08）

**PR #219。コミット 2 本。`0eee33d`（初回実装）→ `0f151a2`（レビュー対応。設計変更）。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 最終的な実装（`0f151a2`）

`searchGameByName` / `enrichGameWithIGDB` の `options` に `mainGameOnly?: boolean` を追加し、
**呼び出し元で切り替える**方式にした。

```ts
// scripts/fetch-igdb.ts:490
options?: { expectedYear?: number; mainGameOnly?: boolean }
// :511 — 既定 false のとき where 行そのものを出さない（空の `where ;` も出さない）
const whereClause = options?.mainGameOnly
  ? `\n      where ${buildIgdbCommonFilters()};`
  : '';
```

- `enrichGameWithIGDB`（:994）にも同オプションを追加し `searchGameByName` へ素通し
- **`searchGameBySteamAppId` へは伝播させない**（:1007 にコメントで明記）
- `mainGameOnly: true` を渡すのは `verifyProposedGames`（`generate-articles.ts:562`）**だけ**
- 補完経路 4 箇所は既定のまま**挙動不変**:
  `fetch-data.ts:404` / `:869`、`generate-articles.ts:914`、`finalize-game-metadata.ts:48`
- 既定パスの生成クエリが `0eee33d^`（修正前）と**空白含めて完全同一**であることを実比較で確認済み
- `generate-articles.ts:1434` に `__test = { verifyProposedGames }` を追加（テスト用エクスポート。
  `fetch-igdb.ts:409` の既存 `__test` パターンに倣う）

### ⚠️ 初回実装（`0eee33d`）はレビューで差し戻された — 教訓

初回は指示どおり `where ${buildIgdbCommonFilters()};` を**無条件で**追加した。
しかし **Issue #208 の本文自体が次の設計制約を明記していた**:

> `searchGameByName` は特集経路以外（メタデータ補完）からも呼ばれる。補完経路に
> `game_type = 0` を強制すると DLC の正規メタデータ取得が壊れる可能性がある。
> **呼び出し元で切り替えるか、候補注入経路のみに適用する設計が必要**

**管理者は Issue 本文を読んでいたが、diff レビュー時にこの制約と突き合わせなかった。**
指示書（本ファイルの「実装」節）に記載が無かったことは理由にならない。
**次回以降: Issue 本文の「想定される修正」「注意」節は、指示書に転記されていなくても
diff レビューのチェックリストとして必ず突き合わせること。**

### レビュー指摘の実測による裏付け（管理者がライブ API で再実測）

**(1) 0 件化してメタデータ補完が失敗する**（`.claude-scratch/verify-219.py`）

| タイトル | 修正前 | 無条件適用時 |
|---|---|---|
| `Gothic 1 Remake`（**issue-012 に掲載済み**） | gt=8, rc=26 | **0 件** |
| `ARK: Survival Ascended`（**issue-008 に掲載済み**） | gt=9, rc=30 | **0 件** |
| `FINAL FANTASY VII REMAKE INTERGRADE` | gt=3, rc=114 | **0 件** |
| `Street Fighter 6 - Year 4` | gt=1 | **0 件** |

**(2) エディション商品へのすり替わり**（既存 `limit 1` バグとは質が異なる）

| タイトル | 修正前 | 無条件適用時 |
|---|---|---|
| `The Last of Us Part I` | 本体 rc=795, steamApp=**1888930** | `Digital Deluxe Edition` rc=None, steamApp=**2254450** |
| `Final Fantasy VII Remake` | rc=494 | `Deluxe Edition` rc=None |
| `Silent Hill 2` | rc=286 | `Deluxe Edition` rc=None |

`steamApp=2254450` は **Steam 公式 API で `type='dlc'`** と確認
（`The Last of Us™ Part I - Upgrade to Digital Deluxe Edition`）。
`enrichGameFromIgdb` は `igdbSlug` を `||` で上書きするため（`fetch-data.ts:126`）
エディションページに書き換わり、appId アンカーがある場合は同一性ゲートが
`applied=false` を返して**補完自体が失敗する**。

**(3) appId 逆引きは救済にならない**

`data/aggregated.json` の実測で **105 件中 74 件が `steamAppId` を持たない**
（未発売・コンソール中心の層＝まさに新作枠の対象）。
なお 0 件化した 3 件は appId があれば逆引きで救済されることも実測済み
（レビュー報告の「逆引きでも救済されない」は誤りだった）。

### 品質ゲート

`npm run test` **24 ファイル / 736 テスト 全通過**（ベースライン 23 / 724）。

テストの本体は「**既定でフィルタが付かないこと**」＝今回のレビュー指摘の回帰テスト。
他に `mainGameOnly: false` 明示指定（境界値）、`true` でヘルパ由来の `where` が付くこと、
appId 逆引きクエリにフィルタが乗らないこと（伝播禁止の固定）、名前検索フォールバック
経路には乗ること、`verifyProposedGames` が `true` を渡すこと。

`scripts/generate-articles.test.ts` を新設した（`vi.mock('./fetch-igdb.js')` のみで足りる。
`verifyProposedGames` の実行パスに Bedrock は含まれず、`main()` は
`import.meta.url` ガードで守られているため import 時副作用なし）。

### 対応しなかったレビュー指摘（記録）

- **`vi.restoreAllMocks()` が `global.fetch` の直接代入を戻さない**（指摘4・低）。事実だが、
  既存テスト（`describe('searchGameBySteamAppId')` :174、`describe('fetchIGDBData')` :307）が
  同じパターンで、本PRのスコープ外の一括修正になる。テストファイル全体の
  `vi.stubGlobal` / `vi.unstubAllGlobals` 移行として別途扱う

### レビューで確認されクリアだった点（後続PRで再調査不要）

- `themes = null` の件数は **156,733 でフィルタ前後不変**。`game_type = null` は **0 件**
  → `themes != (42)` が themes 無しのゲームを巻き込む事故は起きない（決着ブロックの主張は正しい）
- `search "Baldur\"s Gate 3"` は IGDB が実際に受け付ける（200、`Baldur's Gate III` を返す）
- **`fetchGameImageAndUrl`（`fetch-igdb.ts:1041`。PR-0.5 マージ後の値）は呼び出し元ゼロの死んだコード**
  → 未フィルタで放置しても実害なし。削除候補として別途扱える

### スコープから外した判断（管理者判断）

Issue #208 の「想定される修正」は 2 項目あるが、**本 PR は 1 項目目のみ**。
そのため PR 本文は `Closes #208` ではなく **`Refs #208`** とし、Issue は開けたままにした。

2 項目目（特集経路への `isAdultContentByAI` 適用）を分離した理由:
- `docs/article-category-spec.md` §8 のロードマップが PR-0 を「除外フィルタを追加」と定義しており、
  2 項目目はロードマップに含まれていない
- `isAdultContentByAI` の追加は Bedrock 呼び出しが増える挙動変更で、1 行のフィルタ追加とは
  レビュー観点が異なる（PR-0 / PR-0.5 を分けた理由と同じ論理。検討資料 :1866）

→ **PR-0.1 として起票し、PR-0.5 より前に入れる**（上表参照）。放置は推奨しない。
検討資料 :2111 が「特集枠の成人向け防御は登録 1 件の手動ブロックリストのみ＝多層防御のうち
特集枠だけが 1 層」と記録しており、`isAdultContentByAI` は `maxTokens: 10` の判定 1 回で
コスト増は無視できる。

---

  PR-0.1（Issue #208 の残タスク）

  【共通ヘッダ】

# PR-0.1: 特集経路にも AI 成人向けスクリーニングを適用する

- Issue: #208（**この PR で `Closes` する**。PR-0 = #219 は `Refs` で開けたまま残してある）
- ブランチ: `fix/issue-208-feature-ai-screening`（`main` から切る。#219 マージ済みなのでリベース不要）
- 順序: PR-0 の後・PR-0.5 の前
- 根拠: 検討資料 :2111（`grep -n "isAdultContentByAI" docs/article-category-spec-review.md`）
- **方針は決定済み**（下記「実装」節）。着手時のユーザー確認は不要

## 問題

`isAdultContentByAI`（`scripts/generate-articles.ts:256`）は 3 カテゴリに適用されているが、
**feature には適用箇所が存在しない**（実読で確認）。

| カテゴリ | 適用 | 行 |
|---|---|---|
| newReleases | ✅ | `:1251` |
| indies | ✅ | `:1272` |
| classic | ✅ | `:1352` |
| **feature** | ❌ なし | — |

PR-0 で IGDB 側の一次フィルタ（LLM 提案経路のみ）は入ったが、特集枠の事後防御は
`isBlockedAdultGame`（`scripts/adult-blocklist.ts`、登録 1 件）のみという状態が残っている。

## PR-0 からの引き継ぎ（着手前に必ず読む）

- **PR #219 は 2026-08-08 にマージ済み**（マージコミット `ad5b916`）。ローカル main も同期済み。
  `main` から切ればリベースは不要
- PR-0 は最終的に `scripts/generate-articles.ts` も触った
  （`:562` の `mainGameOnly: true`、`:1434` の `__test` 追加）。行番号がずれている前提で読むこと
- **`scripts/generate-articles.test.ts` は PR-0 で新設済み。** `vi.mock('./fetch-igdb.js')` だけで
  `verifyProposedGames` をテストできることを実証した（Bedrock は実行パスに含まれず、
  `main()` は `import.meta.url` ガードで守られているため import 時副作用なし）。
  PR-0.1 のテストもこのファイルに足せる
- **`__test = { verifyProposedGames }` が `generate-articles.ts:1434` に既にある。**
  `isAdultContentByAI` や特集生成関数をテストから触るなら同じ `__test` に足す
- **PR-0 で塞がったのは LLM 提案経路（`verifyProposedGames`）の IGDB クエリだけ**。
  `relatedGames` 経路（`aggregated.json` 由来）には届いていない
- 着手前のベースライン: **24 ファイル / 736 テスト 全通過**（自分で `npm run test` して確認すること）

## 実装（方針決定済み: 2026-08-08。管理者がコード実読のうえ推奨・ユーザー承認）

> ✅ **選定確定後に適用する。** 具体的には `generate-articles.ts` の
> **`selectedGameData` が確定した直後、`FEATURE_MIN_GAMES` の本数警告（`:876` 付近）の前**に
> `isAdultContentByAI` で除外するループを入れる。`verifyProposedGames` 内には置かない。

適用位置は既存 3 箇所（`:1251` / `:1272` / `:1352`）の呼び出し方（除外時の `console.warn` +
スキップ）に倣う。

### この位置を選んだ根拠（4 点。コード実読で確認済み）

1. **他 3 カテゴリと役割・位置が揃う。** 既存 3 箇所はいずれも「選定済みゲームを記事生成の
   直前でスクリーニング」している。`verifyProposedGames` 内に置くと「候補生成中のフィルタ」に
   なり役割がずれる。Issue #208 が求めているのは「他 3 カテゴリと揃える」ことなので位置も揃える

2. **`relatedGames` 経路を塞げる（これが決定的）。** `verifyProposedGames` 内に置くと
   `aggregated.json` 由来の `relatedGames` 経路（`:862` 付近の `allPool`）が
   AI スクリーニングを通らない。この経路は他枠の母集団クエリのフィルタを継承しているが、
   **Steam Top Sellers 由来の候補には IGDB のフィルタが効かない**
   （検討資料 :282「Steam 経路には DLC 除外が存在しない」= PR-A の対象）。
   つまり特集枠は IGDB 一次フィルタが届かない流入経路を持つため、事後スクリーニングが必要

3. **コスト増が最小。** 選定後なので判定対象は `FEATURE_MIN_GAMES = 3` 前後。
   `verifyProposedGames` 内だと検証通過分すべてが対象になり判定回数が増える

4. **本数警告より前に置くことで、除外により薄くなった特集が可視化される。**
   スクリーニングで減った結果が `FEATURE_MIN_GAMES` チェックに反映される

### 二重判定について（許容する）

`relatedGames` 経路のゲームが他枠でも判定される可能性はあるが、他枠の判定対象は
`selectedGames.newReleases` / `indies` / `classic` に選ばれたものだけで特集の候補プールとは
別集合。重複は稀で、`maxTokens: 10` の判定 1 回なので無視できる。

### ブロックリスト側は両経路カバー済み（追加対応不要）

`isBlockedAdultGame` は LLM 提案経路（`verifyProposedGames` 内）と
`relatedGames` 経路（`fetch-data.ts` の `aggregateGames`、`:170` 付近）の両方に適用されている。
したがって本 PR で AI スクリーニングを選定後に置けば、**特集枠も他 3 カテゴリと同じ
2 層（ブロックリスト + AI）になる**。

## テスト

`isAdultContentByAI` は Bedrock を呼ぶため、`invokeClaudeModel` をモックして
「YES 応答で候補が除外される」「NO 応答で通る」「例外時は安全側（= 通す。実装が
`catch` で `false` を返す）に倒れる」を検証する。

- 既存 3 カテゴリにはこのスクリーニングのテストが**無い**（PR-0 時点で確認）。
  `scripts/generate-articles.test.ts`（PR-0 で新設）に足すのが素直
- **境界値**: 除外により `selectedGameData` が `FEATURE_MIN_GAMES` を下回った場合に
  本数警告が出ること（適用位置を警告の前にした狙いが効いていることの検証）
- 全件除外されたケース（`selectedGameData` が空）で落ちないこと

## 実施結果（2026-08-08）

**PR #220。マージコミット `0c07ba1`（squash）。Issue #208 クローズ済み。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 実装

- `screenOutAdultGames(games: GameData[]): Promise<GameData[]>` を追加（`isAdultContentByAI` の直後）。
  順次実行（`Promise.all` は使わない）
- `generateFeatureArticle` の `selectedGameData` を `const` → `let` にし、
  fringe 補充完了後・`FEATURE_MIN_GAMES` 警告の前で再代入（`generate-articles.ts:893`）
- `__test` に `screenOutAdultGames` を追加
- **既存3カテゴリの呼び出し箇所と `isAdultContentByAI` 自体は未変更**

### 管理者が自分で検証した点

- **出力経路**: `featureGames` / `recommendedGames`（`:972` / `:982`）は
  `selectedGameData` ループ（`:909`）からのみ構築され `:1009-1010` で返る。
  記事本文・タイトルもそこから導出 → 選定後スクリーニングで内容経路を完全にカバーできる
- **境界値テストの非空虚性を実測**: `:893` の呼び出しを一時的にコメントアウトすると
  `Screened Out Game` が記事に混入してテストが失敗することを確認し、復元・残骸を grep で確認
- **Issue 本文との突き合わせ**（PR-0 の教訓）: 2項目とも充足、
  `searchGameBySteamAppId` 禁止制約に抵触なしを確認したうえで `Closes` にした

### テスト設計上の落とし穴（次回以降の再利用価値あり）

`vi.mock('./bedrock-client.js', async (importOriginal) => ...)` で `invokeClaudeModel` だけを
差し替えても、**`importOriginal` 経由で取り込んだ他の関数（`selectFeatureGames` 等）は
モジュール内部の実 `invokeClaudeModel` を直接参照するためモックを迂回する**。
`generateFeatureArticle` を E2E で駆動する場合は、選定系4関数
（`selectFeatureThemeWithAI` / `proposeThemeGamesFromKnowledge` /
`prefilterFeatureCandidatesByTheme` / `selectFeatureGames`）を個別に `vi.fn()` で上書きする必要がある。

### レビュー指摘の分離（#221 / #222）

- **#221**: 選定ゲームが0本でも記事が生成・発行される（medium）。
  `buildFeatureUserMessage`（`bedrock-client.ts:519`）が空リストでも
  「以下のゲームを全て紹介してください」を出力し、`validateFeaturePlatformConsistency`
  （`validate-article.ts:338`）も空だと早期 return するため捕捉されない。
  **`main`（`ad5b916`）で既存欠陥であることを確認済み**（本PR起因ではない）。
  fringe 補充とスクリーニングの順序問題も同Issueに含む
- **#222**: fail-open の観測不能性 + Bedrock 連続呼び出しに間隔が無い（low）

⚠️ **#221 に記録した重要な注意**: レビューが提案した「スクリーニングを本数チェックより
前に移す」修正は**採用してはいけない**。fringe 補充分がスクリーニングを通らなくなり
#208 で塞いだ穴が再び開く。

---

  PR-0.5（挙動不変のリファクタ）

  【共通ヘッダ】

# PR-0.5: 除外フィルタを枠ごとにパラメータ化

> ✅ **実装完了・マージ済み（2026-08-08）。PR #224。** 以下は当初の指示。
> 着手前に必ず末尾の「実施結果」節を読むこと（**後続PRに効く申し送りが3件ある**）。

- ブランチ: `refactor/parameterize-igdb-filters`
- 仕様: §6.1
- 決着ブロック: `grep -n "J-5" docs/article-category-spec-review.md`
- **PR-0 の後、PR-A / PR-B / 名作枠PR より前に入れる**

## 実装

  `buildIgdbCommonFilters()`（`scripts/fetch-igdb.ts:19-21`）が許可する
  `game_type` の配列を**引数で受け取る**形にする。デフォルトは `[0]`（Main Game のみ）。

  現状:

  function buildIgdbCommonFilters(): string {
    return `game_type = ${IGDB_GAME_TYPE_MAIN} & themes != (${IGDB_THEME_EROTIC})`;
  }

  呼び出し元は**4箇所**（`:512`, `:656`, `:751`, `:849`。2026-08-08 に grep で実測）。
  **このPRでは全て既定値のまま**にする。

  ⚠️ **`:512` は PR-0 が `searchGameByName` 内の `mainGameOnly` 分岐に追加した新しい呼び出し元**。
  当初この節は「3箇所（:651, :746, :845）」と書いていたが誤りだった。
  `gameTypes` を必須引数にすると `:512` だけが漏れて型エラーにならず素通りする危険があるため、
  **着手時に必ず自分で `grep -n "buildIgdbCommonFilters()" scripts/fetch-igdb.ts` を実行して
  件数を確認すること。**

## 制約

- **挙動を変えないこと**（純リファクタ）。既存テストが通ることが成功条件
- **枠ごとに関数を分割する案は採らない**。PR #209 が「`themes != (37)` が3箇所に
コピーされ、37→42 の誤りが3箇所同時に存在した」ことへの対処として生成を1箇所に
集約した経緯があり、分割は同じ事故の再発条件を作る

## テスト

  `game_type = (0,8,9)` のように複数指定した場合のクエリ文字列を検証する。
  IGDB のクエリ構文として `game_type = (0,8,9)` が妥当であることは実測済み。

## 実施結果（2026-08-08）

**PR #224。マージコミット `28f835f`（squash）。`/code-review` の指摘ゼロ。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 実装

```ts
// scripts/fetch-igdb.ts:23
function buildIgdbCommonFilters(options?: { gameTypes?: number[] }): string
```

- 既定は `[IGDB_GAME_TYPE_MAIN]`（`[0]`）。`??` で受けるため `{ gameTypes: [] }` は既定に落ちない
- **要素1個 → `game_type = 0`（括弧なし）、2個以上 → `game_type = (0,8,9)`**
- 空配列 → 例外（`gameTypes must not be empty`）
- 呼び出し元4箇所は**全て引数なしのまま**（`:524` / `:668` / `:763` / `:861`。マージ後の行番号）

### ユーザー確認事項の決着: `mainGameOnly` は `gameTypes` に一般化しない

`mainGameOnly`（`fetch-igdb.ts:502` / `:1006`）は「**where 句を出すか否か**
（`themes != (42)` の有無を含む）」を切り替える軸で、「**どの `game_type` を許すか**」とは
別軸。統合すると 2 つの軸が混ざり、「既定＝フィルタ一切なし」という Issue #208 の
回帰テストの意味が変わる。また `gameTypes` を必要とするのは母集団クエリ
（`:668` / `:763` / `:861`）であって `searchGameByName` ではない。

### ⚠️ 後続PR（PR-B / 名作枠PR）への申し送り — 3件

**(1) 空配列の例外は4箇所すべてで `catch` に飲まれる。ただし劣化の仕方は2種類ある。**
4箇所はいずれも関数全体が `try` で囲まれており、例外はプロセスまで届かない。

| 呼び出し元 | catch の戻り値 | 空配列を渡したときの実際の劣化 |
|---|---|---|
| 母集団クエリ3箇所（`:668` / `:763` / `:861`） | `console.error(...); return []`（`:741` 等） | **その枠の候補が0件** + エラーログ1行 |
| `searchGameByName`（`:524`） | `console.error(...); return null`（**`:562-565`**） | `enrichGameWithIGDB` の名前検索フォールバックが `null` を返し、**そのゲームがメタデータ未補完のまま残る**（候補が減るのではない） |

いずれもビルドは止まらない。`gameTypes` を動的に組み立てる場合は
**呼び出し側で非空を担保すること。**

**(2) PR-B 着手時に「要素1個で括弧を付けない」分岐を畳むか判断する。**
この分岐は既定出力を現行と**バイト単位で同一**に保つためだけの特例。
PR-B が入ってバイト同一性の制約が外れたら、分岐を畳むことで
「動的生成した配列の要素数によって出力形状が変わる」差異を消せる。

⚠️ **畳む場合（既定が `game_type = (0)` になる場合）に落ちるテストは1件ではない。**
`scripts/fetch-igdb.test.ts` で**12箇所**のアサーションが括弧なし `game_type = 0` に依存している
（2026-08-08 に `grep -n "game_type = 0" scripts/fetch-igdb.test.ts` で実測）:

- `:523` / `:536`（正規表現）/ `:547` — `buildIgdbCommonFilters` 直接テスト
- `:548` `not.toContain('game_type = (0)')` / `:554` `not.toContain('game_type = (8)')`
  — **PR-0.5 自身が追加した境界値テスト**
- `:366` / `:415` / `:511` — `searchGameByName` の `mainGameOnly: true` 経路
- `:618` / `:628` / `:632` / `:636` — 3母集団クエリの統合テスト

当初この節は「`:534` のテスト」1件とだけ書いていたが**誤り**だった。
なお `:534` は `const filters = buildIgdbCommonFilters();` の行で、
正規表現アサーション自体は `:536` にある。

**(3) 複数値パスはライブ API で未検証。**
`game_type = (0,8,9)` が正しいことは apicalypse 仕様（スカラーフィールドの `= (a,b,c)` は OR。
配列フィールド用の `[]` / `{}` とは別）と本ファイル記載の過去実測から確認したが、
**本 PR ではライブ IGDB を叩いていない**（本番呼び出し元がまだ存在しないため）。
**最初の実呼び出し元となる PR-B で実 API 検証を行うこと。**

### 品質ゲート

`npm run test` **24ファイル / 749テスト 全通過**（ベースライン 744）。
追加テスト5件: 複数指定 `[0,8,9]` / 境界値 要素1個 `[0]` / 境界値 要素1個 `[8]` /
引数なし呼び出しとの文字列完全一致（`toBe`）/ 空配列の例外送出。**既存3テストは未改変**。

---

  PR-A（Steam DLC 除外）

  【共通ヘッダ】

# PR-A: Steam 経路の DLC 除外

> ✅ **実装完了・マージ済み（2026-08-08）。PR #226。** 以下は当初の指示。
> 着手前に必ず末尾の「実施結果」節を読むこと（**後続PRに効く申し送りが2件ある**）。

- ブランチ: `fix/steam-dlc-exclusion`
- 仕様: §6.1 の「Steam 経路の DLC 除外」ブロック（決定内容と実測値あり）
- 他PRと独立。PR-0.5 の後が望ましい

## 問題

  Steam の Top Sellers / Top Played 経路に DLC を除外する処理が無い。
  `getAppDetails()`（`scripts/fetch-steam.ts:188-196`。**マージ後は :199**）は `name` と
  `isAdultContent` だけを返し、`type` フィールドを読んでいない。

  実測（本日）: Top Sellers 10件中2件が非 game。
  **vol.18 の記事1本目が実際に Street Fighter 6 の DLC だった**（`issue-018.md:7`）。

## 実装（決定済み）

  `type` **が** `game` **以外を候補から除外する。親ゲームへの読み替えはしない。**

  読み替えない理由: `fullgame` フィールドは実在し技術的には可能だが、
  親ゲームは発売から年数が経っており（Street Fighter 6 は2023年発売）
  結果として60日窓で落ちる。除外と同じ結果になるため追加API呼び出しに見合わない。

## 注意

- `type` が取得できないケースがある（実測: `Big Walk and PEAK`）。
この場合も除外側に倒す（`type !== 'game'` で判定すれば自然にそうなる）
- 成人向け判定（`isAdultContent`）の既存挙動を壊さないこと

## テスト

  `scripts/fetch-steam.test.ts` に、`type` が `game` / `dlc` / `undefined` の
  それぞれで採用・除外が正しく分かれることを検証するテストを追加する。

## 実施結果（2026-08-08）

**PR #226。マージコミット `2011619`（squash）。コミット 2 本
（`b007f5f` 実装 → `dc0de26` レビュー対応）。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 実装

- `getAppDetails`（`fetch-steam.ts:199`）の戻り値に `type: string | null` を追加
  （`appData.type ?? null`。`appData` 無し・例外時も `null`）
- 判定値は `STEAM_APP_TYPE_GAME`（`:110`）に定数化
- 4 つのループで `type !== STEAM_APP_TYPE_GAME` を除外（`:75` / `:239` / `:293` / `:329`）
- **判定順序は 成人向け → name 不一致（`isSameSteamApp`）→ type**（レビュー対応で確定。下記）
- スキップ分岐でも 200ms のレート制限待機を維持
- スキップログに `type=${type ?? 'unknown'}` を出す（systemic な取得失敗を運用で識別するため）
- `fullgame` は読まない（親ゲーム読み替えをしないため）。`SteamGame` 型は未変更

### 📊 仕様書に無い新事実を実測で発見（2026-08-08 ライブ API）

| カテゴリ | 混入 | type | 候補処理に到達したか |
|---|---|---|---|
| top_sellers（生 10 件・`slice(0,20)` なので全件処理） | `Street Fighter 6 - Year 4 アルティメットパス`(4412690、**4位**) / `キャラクターパス`(4412680、**6位**) | `dlc`（fullgame=1364780） | ✅ **2件とも到達** |
| coming_soon（生 10 件・**`slice(0,5)` なので上位5件のみ処理**） | `Pight Soundtrack`(4713630、**1位**) | **`music`** | ✅ **到達** |
| 〃 | `Lord of Kensai Soundtrack`(4990990、**10位**) | **`music`** | ❌ **未到達**（slice の外） |

⚠️ **「10 件中 2 件」は生レスポンスに対する測定値。** `coming_soon` は
`fetch-steam.ts:314` の `slice(0, 5)` で上位 5 件しか処理されないため、
**実際に候補プールへ入っていた music は 1 件**（`Pight Soundtrack`、1 位）。
当初この節は 2 件と書いていたが**誤りだった**（レビュー指摘。並び順を実測データで再確認して訂正）。

仕様書は DLC しか挙げていないが、**サウンドトラックが `coming_soon` 経由で混入していた**
（1 件でも実在する経路である点は変わらない）。`fetchNewReleases` の結果は `fetchSteamData` 内で
`topSellers` にマージされるため DLC と同じ穴で、`type !== 'game'` 判定で同時に塞がる。

**混入は現に起きていた**: vol.18 の記事1本目が appId 4412690 のこの DLC そのもの
（`src/content/issues/issue-018.md:7` で実物確認）。

### ⚠️ 後続PRへの申し送り — 2件

**(1) `type` が取れないケースは「DLC だと答えられた」ケースと区別できない（#227）。**
`getAppDetails` はリトライ無しの生 `fetch` で `response.ok` も見ない。取得失敗時も
`type: null` → 除外に倒れる。**本PR以前は `name: storefrontName ?? item.name` により
Featured 側の name で採用されていた**ので、これは挙動変更である
（`fetchTopPlayed` は元から `if (name)` で落ちていたため変化なし）。
1 回の実行で `appdetails` は最大 55 件呼ばれる（20+20+10+5）。

fail-closed 自体は仕様 §6.1 の決定どおりなので**覆さない**。従来の fail-open には
「`appdetails` が取れないと `isAdultContent` が `false` になり成人向けが素通りする」という
別の穴があった。→ **#227** に分離（対応案は `fetchWithRetry` 化 / HTTP 失敗と
`success:false` の区別。いずれも実行時間か仕様の再確認を伴う）。

**(2) スクリーニング処理が 4 ループに重複している（#228）。**
重複は本PR以前から存在（成人向け・name 不一致が 3 箇所にコピー済み）。
`fetchTopPlayed` だけ構造が異なる（`if (name)` 内の `else if` チェーン）ため
横断的な変更で見落としやすい。→ **#228** に分離。
**許可する種別を `'game'` 以外に広げる PR、または `fullgame` 読み替えを入れる PR は
先に #228 を片付けたほうがよい。**

### レビュー指摘への対応（4件の内訳）

| 指摘 | 対応 |
|---|---|
| 判定順序の観測性（low） | ✅ **本PRで修正**（`dc0de26`。下記） |
| `getAppDetails` の取得失敗が候補欠落に直結（high） | **#227** に分離 |
| スクリーニング処理の4重複（low） | **#228** に分離 |
| 進捗表（本ファイル）が未更新（low） | **docs PR #229 で対応**（マージ後に別PRで記録する運用のため。PR-0.5 → #225 と同じ） |

**`type` 判定を `isSameSteamApp` の name 不一致判定の「後ろ」に移した**（`dc0de26`）。
当初の指示では前に置いていたが、appId 取り違え（Issue #102 型）でその appId の実体が
たまたま `dlc` / `music` だった場合、**より診断価値の高い `appId/name mismatch` 警告が
出なくなる**。どちらの判定でもスキップするため候補の採否は変わらず、観測性のみの変更。
成人向け判定は先頭のまま不変。

### テスト設計上の落とし穴（次回以降の再利用価値あり）

初回実装のテストは **「空虚に通る」構造だった**。除外を「候補に居ないこと」だけで
検証していたため、**そのループが丸ごと死んでいても通ってしまう**状態だった。

対策として全ケースに**同カテゴリの `type='game'` 項目を同居させ、それが採用されることを
同じテスト内で assert する**（ポジティブコントロール）形に直した。`coming_soon` の処理
ブロックを一時的に無効化すると、除外側ではなく**採用側の assert が失敗する**ことを実際に
確認済み。**「除外されること」を検証するテストを書くときは必ずこの形にすること。**

管理者は実装を一時的に戻して**新規テスト 7 件がアサーション失敗すること**を独立に再現した
（Sonnet の Red 報告の裏取り）。

### 品質ゲート

`npm run test` **24ファイル / 760テスト 全通過**（ベースライン 749）。実行時間 2.59s
（ベースライン 2.67s。`vi.useFakeTimers()` + `runAllTimersAsync()` で 200ms 待機を消化したため
実行時間はほぼ増えていない。実タイマーだと +2.3 秒だった）。

---

  PR-B（最も大きい・4箇所を触る）

  【共通ヘッダ】

# PR-B: 新作紹介の4軸スコア（国内販売軸を除く3軸）+ ファンゲーム検出 + リメイク明記

- ブランチ: `feat/newrelease-score-and-remake`
- 仕様: §2.3（スコア設計）、§6.1（ファンゲーム）、§6.2（リメイク明記）、§7.1（取得状況）
- 決着ブロック: `grep -n "J-1-c\|N-6" docs/article-category-spec-review.md`
- **PR-0.5 の後**。Issue #210 に初期パラメータの再調整タスクがある

## 重要な前提

  **現在の母集団クエリは以下を1つも取得していません**（実読で確認済み）。
  「判定に条件を足す」ではなく、**フィールド追加 → 型追加 → 変換処理での転記**が
  各指標について必要です。

- `aggregated_rating` / `aggregated_rating_count`（批評軸）
- `game_type`（リメイク明記）
- `keywords`（ファンゲーム判定）
- `date_format`（`games` **直下ではなく** `release_dates.date_format`。実測で確認）

  触る箇所は4つ:

1. `IGDB_GAME_FIELDS`（`scripts/fetch-igdb.ts:341`。PR-0.5 マージ後の値）と3つの母集団クエリの fields
2. `IGDBGame` 型（`scripts/types.ts:42`）
3. `GameData` 型（`scripts/types.ts:84`）
4. `buildUserMessage`（`scripts/bedrock-client.ts:404`）

## 実装内容（3つ。同じ4箇所を触るため同一PR）

### 1. 4軸スコア（国内販売軸は PR-B2 なので**3軸で実装**）

  §2.3 の表のとおり、各軸を0〜100の絶対尺度に変換し**重み付き最大値**を採る。
  データを持たない軸は「棄権」で0点扱いにしない。重みは環境変数化（初期値1.0）。

- 批評: `aggregated_rating × min(1, aggregated_rating_count / 4)`（条件: 媒体数2以上）
- ユーザー票数: `min(100, 100 × log10(rating_count) / log10(500))`（条件: 15票以上）
- Steam: `100 × (1 - (順位-1) / 取得件数)`（分母はハードコードしない）

  **票数軸の100点クリップは必須**（対数式は500票超で100を超え、最大値集約下で
  この軸だけが突き抜けるため）。

### 2. ファンゲーム検出の修正

  `isFanGame()`（`scripts/game-filter.ts:35,38`）はタイトル正規表現とジャンルしか
  見ていない。IGDB の `keywords`（`unofficial` / `fangame` / `fanmade`）を判定に追加する。
  これにより `Pokémon Infinite Fusion`（keywords に該当あり、旧ソートで1位）が落ちる。

### 3. リメイク・リマスターの許可と記事への明記

- 新作枠のクエリに渡す `gameTypes` を `[0, 8, 9]` にする（PR-0.5 の引数を使う）
- `game_type` を【ゲーム情報】欄まで持ち回り「種別: リメイク」等として提示する
（Main Game のときは行を出さない）
- `newReleaseSystem` プロンプトに1行追加:
「提供データに種別がリメイク／リマスターと示されている場合は、記事本文で
その旨を明記すること」

  **禁止リストは緩めない。** 既存の禁止事項は「提供データに明示的に書かれていない
  限り」が前提なので、種別を提供データに載せた時点で記述が許可される。

### 4. 号内重複の比較を正規化タイトルに（小改修・相乗り）

  `fetch-data.ts` がタイトル完全一致で比較している箇所を `normalizedTitle` 比較に変更する
  （『Slay the Spire II』と『Slay the Spire 2』が別扱いになるため）。

  ⚠️ **対象は2箇所ではなく4箇所**（2026-08-08 に実読で確認）:

  - `:971` — indie 候補から newReleases を除外
  - `:1032` — classic 候補から newReleases を除外
  - `:1033` — classic 候補から **indies** を除外
  - `:1034` — classic 候補から **featured** を除外（`g.title !== featured?.title`）

  当初この節は `:971` と `:1032` の2箇所と書いていたが誤りだった。
  `:1033` / `:1034` を直さないと、名作枠と indie / 特集の間で表記ゆれが素通りする
  （＝この項目が塞ごうとしている経路そのものが残る）。

## 受け入れ条件

- `DEV_MODE=true npm run build-issue:dev` で、リメイク種別を渡したときに
**LLM が原作のストーリー・内容（禁止項目）に踏み込まないこと**を確認する
- 回帰ケース: 成人向けのすり抜け、DLC混入、`Pokémon Infinite Fusion` の除外
- 境界値: 批評媒体数 2/1、票数 15/14、Steam 1位/最下位、票数500超のクリップ

## 実施結果（2026-08-08）

**PR #230。マージコミット `1bb61e6`（squash）。コミット 2 本（`f70f027` 実装 → `32e622c` レビュー対応）。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 実装

| 対象 | 内容 |
|---|---|
| `scripts/newrelease-score.ts`（新設） | 3 軸スコア。`loadNewReleaseScoreParams()` / `computeNewReleaseScore()` / `sortByNewReleaseScore()` |
| `fetch-igdb.ts` | `buildIgdbCommonFilters` の要素1個の特例を撤廃（常に括弧付き）。新作枠クエリのみ `gameTypes: [0,8,9]`。4 箇所の fields に `game_type, aggregated_rating, aggregated_rating_count, keywords.slug` を追加 |
| `types.ts` | `IGDBGame` / `GameData` に `gameType` / `aggregatedRating` / `aggregatedRatingCount` / `keywords` |
| `game-filter.ts` | `isFanGame` にキーワード**完全一致**判定を追加 |
| `bedrock-client.ts` | `buildUserMessage` に `gameType`（【ゲーム情報】欄に「種別: リメイク」）。`newReleaseSystem` に明記ルール 1 行 |
| `generate-articles.ts` | newRelease 呼び出しにだけ `gameType` を渡す |
| `fetch-data.ts` | `isAlreadySelected` / `buildNewReleaseCandidates` / `buildIndieCandidates` / `buildClassicCandidates` / `isRemakeOrRemaster` を切り出し。候補ログに score / topAxis / 軸内訳 |

**環境変数（Issue #210 の再調整対象）**: `NEWRELEASE_SCORE_WEIGHT_CRITIC` / `_VOTES` / `_STEAM`（各 1.0）、
`_CRITIC_COUNT_MIN`(2) / `_CRITIC_COUNT_FULL`(4) / `_VOTES_MIN`(15) / `_VOTES_FULL`(500)。
**`Number(x) || 既定値` を使わないこと**（重み 0＝軸の無効化が既定値に化ける）。**環境変数は
モジュール読み込み時ではなく呼び出し時に読む**（`vi.stubEnv` で検証可能にするため。
`select-indie-with-fallback.ts` は読み込み時読みだが、そちらは再調整対象ではない）。

### 📊 着手前測定（§9.3-9 への回答。2026-08-08 ライブ）

**新作枠 0 本の原因を特定した。→ Issue #231**

| 段階 | 件数 |
|---|---|
| 集約後の全ゲーム | 106 |
| `releaseDate` なしで脱落 | 6 |
| フィルタ通過候補 | **23** |
| `finalizeGameMetadata` 失敗 | 5（date-mismatch 2 件） |
| 大手判定ゲート不通過 | **18** |
| 採用 | **0** |

⚠️ **18 件のうち 16 件は正しく除外されている**（PocketPair 等）。**候補プールにあった大手タイトルは
2 件だけで、その 2 件が両方とも判定漏れで落ちた**（`Arc System Works`/**SIE**、
`Nippon Ichi Software`/**NIS America**。いずれも静的リストに未登録）。
**判定さえ正しければ今週はちょうど 2 本埋まっていた。**「18 件が誤判定」ではないので数字の扱いに注意。

### 📊 仕様書の記述の訂正（3 件。実測・実読による）

1. **§6.2 の「未測定」が解消**: `Assassin's Creed Black Flag Resynced` は `aggregated_rating_count = 4`
   で品質条件（媒体数 2 以上）を**通る**（`aggregated_rating=84` / `rating_count=25`）
2. **§6.3 の記述が誤り**: `normalizeTitle`（`normalize.ts:19-27`）はローマ数字とアラビア数字の差を
   **吸収しない**。『Slay the Spire II』/『Slay the Spire 2』は本改修では解決しない
3. **§2.3 の数値が誤り**: 票数軸のクリップ根拠「5,000 票で 133」は正しくは **137**

### ⚠️ 後続PRへの申し送り — 3件

**(1) 3 つの母集団クエリの結果は 1 つのプールに平坦化される。**
`fetchIGDBData` が recent + classic + indie をマージして 1 本の `igdbData.games` にするため、
**「新作枠クエリにだけ許可した種別」は枠の分離を保証しない**。実際 PR-B は
`game_type = (0,8,9)` を新作枠クエリにだけ渡したが、そのリメイクが名作枠の選定条件を
すべて通過する状態になっていた（レビューで指摘され本PRで修正）。
**枠ごとの方針をクエリだけで表現しないこと。選定側にも同じ条件を置く。**

**(2) `deduplicateGames`（`fetch-data.ts:557`）は field ごとの手動マージ。**
`GameData` にフィールドを足したら**必ずこの関数にも足す**。足し忘れると重複マージが
起きた候補でだけ値が消える（PR-B で実際に `keywords` が消え、ファンゲーム判定が
無効化される経路ができていた）。同じ理由で `finalizeGameMetadata`（`igdbConfirmed`
ガードの内側）と `enrichGameFromIgdb`、`aggregateGames` の 2 ブランチも確認する。
**配列フィールドは `||` ではなく length ガードで入れる**（空配列は truthy）。

**(3) `isLargeStudio` は新作枠ゲートとインディー判定の共通関数。**
PR-I はインディー枠だけの変更ではない。→ **#231**

### レビュー指摘への対応（5件。全件が実在し全件を本PRで修正）

| 指摘 | 判定 | 対応 |
|---|---|---|
| `deduplicateGames` が新フィールドをマージしない | ✅ 実在・**重大** | 本PRで修正 |
| リメイクが名作枠・インディー枠に漏れる（本PRの回帰） | ✅ 実在・**重大** | 本PRで修正 |
| `keywords` の上書きが `\|\|` | ✅ 実在 | 本PRで修正 |
| `VOTES_FULL <= 1` で票数軸が壊れる | ✅ 実在 | 本PRで修正 |
| `finalizeGameMetadata` が `gameType` を補完しない | ✅ 実在 | 本PRで修正 |

「プロンプトが原作の年号等に手を伸ばさせるのでは」という情報提供のみの指摘は、
DEV_MODE の実出力と検索コンテキストを突き合わせて**全記述が提供データに根拠を持つ**ことを
確認したため現状維持とした。

### スコープから外した判断（管理者判断）

- **母集団クエリの窓・`hypes > 5`・`sort hypes desc`・`limit 20` は変更しない**（ユーザー確認済み）。
  §2.3 の 60 日窓と §4.1.3 の hypes ソート廃止はサーバ側 sort の代替が未決着のため別PR
- **特集枠への除外フィルタ適用は別Issue** → **#232**（選定経路が `generate-articles.ts` 側にあり調査が要る）
- `date_format`（§2.4 の未発売枠）は PR-C の担当

### テスト設計上の落とし穴（次回以降の再利用価値あり）

- **新モジュールの Red は「モジュールが無い」で通してはいけない。** Sonnet の Red 報告が
  `Cannot find module` だったため、管理者が**実装を一時的に戻して 24 件がアサーション失敗する**ことを
  独立に再現した。さらにスコアモジュールは**ミュータント 3 種**（票数クリップの削除 /
  `Number(x)||default` / `max`→`Σ`）を入れて、対応するテストが実際に殺すことを確認した
- 「除外されること」のテストにポジティブコントロールを同居させる方針は今回も有効だった
  （`deduplicateGames` の回帰テストは「マージ後の primary が `isFanGame` で true になる」形にした）

### 品質ゲート

`npm run test` **26ファイル / 865テスト 全通過**（ベースライン 24 / 760）。

---

  PR-B2（新規スクレイパ・ライセンス制約あり）

  【共通ヘッダ】

# PR-B2: 国内販売軸（第4軸）のデータ取得

- ブランチ: `feat/domestic-sales-axis`
- 仕様: §2.3 の「国内販売軸の重要な制約」ブロック（実測値・ノイズの内訳あり）
- **PR-B の後**

## 背景

  §2.3 が4軸の1つに「Amazon国内ランキング（ファミ通経由）」を据えているが、
  **取得実装がリポジトリに存在しない**（`famitsu.com` は公式URL判定のドメイン
  リストにのみ登場）。

## 実装

### 1. 取得

  ファミ通 `/ranking/amazon` の HTML に埋め込まれた `amazonRankingData`（50件）を取得。
  実測でフィールドは `ranking` / `genre` / `title` / `categoryName` / `releaseDate` 等。

### 2. ノイズ除去（実測値は §2.3 の表を参照）

- **非ゲーム商品 7件**（プリペイド番号、PSストアチケット、Robloxギフトカード）。
**1位がプリペイド番号だった**ので、除去しないと「Amazon 1位 = 100点」が
プリペイドに付く
- **同一タイトルの重複 5組**（オンラインコード版など）→ **上位側の順位を採る**
- 順位は**詰め直さない**。分母は**50固定**

### 3. IGDBタイトルとの照合（このPRの主要作業）

  日本語の商品名（「リズム天国 ミラクルスターズ -Switch」）と英語のIGDBタイトルを
  突き合わせる必要がある。既存の `normalizeTitle` / `isSameGameIdentity` /
  `JAPANESE_TO_ENGLISH_TITLES`（`fetch-igdb.ts:39`。PR-0.5 マージ後の値）を活用する。

### 4. ⚠️  ライセンス制約（設計を縛る最重要事項）

  **順位を永続化される構造体に載せてはならない。**
  Amazon のライセンスは24時間を超える保存を禁じ、ファミ通の著作権条項は蓄積を禁じている。

  載せてはいけない先:

- `GameData` 型
- `data/aggregated.json`、`data/selected-games.json`（**どちらもGit追跡下**。
`aggregated.json` の `games[]` は `GameData` をそのまま直列化している）
- 記事本文・記事の frontmatter

  順位は**選定処理のスコープ内に閉じる**設計にすること。

## 着手前に必須

  ファミ通の取得経路は 2026-08-01 と 2026-08-07 の実測に基づく。
  **着手時にもう一度叩いて構造が変わっていないか確認する**（`.claude-scratch/` に
  プローブを書く）。

---

  PR-C（未発売記事の分岐・3値化）

  【共通ヘッダ】

# PR-C: 未発売記事の構成分岐 + 発売状態の3値化とJST統一

- ブランチ: `feat/unreleased-article-branching`
- 仕様: §2.5、§2.6、§2.7、§2.8、§3.2（インディーは発売済みのみ）
- 決着ブロック: `grep -n "N-5" docs/article-category-spec-review.md`
- **PR-E と同じ箇所を触る**ため、どちらかを先に入れて他方をリベース

## 実装内容（5つ）

### 1. 発売状態を2値→3値に（§2.8）

  `getReleaseStatus()`（`scripts/bedrock-client.ts:99-107`）は現在2値を返し、
  見出し生成・本文生成・バリデータの3箇所で共用されている。
  `本日発売` を追加し、**呼び出し元ごとに解釈を変える**（§2.8 の表のとおり）。

### 2. タイムゾーンをJSTに統一（§2.8）

  現在 `new Date(releaseDate)` が `YYYY-MM-DD` を**UTC 0時**として解釈している。
  §2.2 の境界は「日本時間の当日0時」なのでJST基準に揃える。
  **3値化と同じPRで行う**（分けると「JSTでは未発売だがUTCでは発売済み」という
  9時間の穴が残る）。

### 3. 未発売記事のプロンプト分岐（§2.5）

  未発売タイトルには批評スコアもレビューも存在しない（実測: 未発売973件のうち
  批評スコアを持つものは0件）。§2.5 の表のとおりセクション2と6を差し替え、
  評価データを提示しない。**セクション数は6のまま減らさない。**

### 4. Web検索セットの分岐（§2.6）

- 未発売: レビュー検索を**実行しない**。「発売日・最新情報」検索を追加
- **検索クエリに OR 演算子を使ってはいけない**（実測で5件中2件が完全に失敗。
『Big Walk』が映画『Big』のページを引いた）

### 5. 評価断定バリデータ + judge の追記（§2.7）

  未発売記事が「評価が高い」等と書いていたら **high** 警告。
  本文と要約（summary）の両方を検査。
  **「発売前の先行プレイで好評」は正当**なので誤検出しない設計にすること。

### 6. インディー枠から未発売を除外（§3.3）

  `fetch-data.ts` の `indieRanked` に「発売日 <= JST当日0時」のフィルタを追加。
  過去17号で発生した未発売記事2件は**どちらもインディー枠**だった。

## テスト

  境界値が多い。JST当日0時の前後1秒、当日発売、翌日0時をそれぞれ検証する。

---

  PR-D（削除のみ）

  【共通ヘッダ】

# PR-D: Metacritic / OpenCritic 経路の削除

- ブランチ: `refactor/remove-metacritic-path`
- 仕様: §7.2 の1行目
- 決着ブロック: `grep -n "論点D" docs/article-category-spec-review.md`
- **名作枠PR と直列に並べる**（`fetch-data.ts` の名作枠選定部で競合）

## 背景

  **17号すべてで1件も取得できていなかった**（APIキーがリポジトリ・ローカル・
  GitHub Actions のどこにも設定されていない）。IGDB の批評スコアが同等に機能するため
  復活させず削除する。

## 削除するもの

  取得経路・型・選定条件・プロンプト参照・バリデータ参照。

  `metascore` は 12ファイル・52箇所に出現する。**表示層と過去号のスキーマは互換のため残す**
  （`src/components/*.astro`、`src/content.config.ts`）。

## 注意

- `scripts/validate-article.test.ts:346-356` **は削除対象**。
`metascore: 90` を渡して「警告しない」ことを検証しているテストで、
フィールド廃止と同時に成立しなくなる
- 削除後、残存参照を grep で必ず確認する
- 挙動不変であること（元々動いていなかったため）

---

  名作枠PR

  【共通ヘッダ】

# 名作枠PR: 母集団条件の変更 + リメイク条件 + 📜プロンプト修正

- ブランチ: `feat/classic-slot-redesign`
- 仕様: §5.4、§5.5、§5.6、§5.8（並び順）
- 決着ブロック: `grep -n "論点B\|J-3\|論点G" docs/article-category-spec-review.md`
- **PR-D と直列**

## 背景

  vol.12以降、**6号連続で2026年発売の新作が「名作深掘り」として載っていた**。
  原因は母集団条件が「発売前フォロー数100超」だけで**発売日の条件が一切なかった**こと。

## 実装内容

### 1. 母集団条件（§5.4）

  `total_rating >= 85 & total_rating_count >= 200`、`sort total_rating_count desc`、
  `limit 200`。**経過年数の下限は設けない**（Elden Ring 型を構造的に落とすため）。
  年代を散らす仕組みも入れない。

  `total_rating` **/** `total_rating_count` **/** `parent_game` **は現在どのクエリでも
  取得していない**ので、PR-B と同型のフィールド追加・型追加・転記が必要。

### 2. リメイク条件（§5.5）

  「**原作が母集団に存在しないリメイク・リマスターのみ許可**」。
  `parent_game` が `game_type=0` プールに不在の `t8`/`t9` だけを通す。
  これにより原作とリメイクが同時に母集団に存在することが定義上あり得ず、混線ゼロになる。

### 3. 📜「ゲームの歴史」プロンプトの修正（§5.6）

- 禁止リストから**重複項目を削除**（「発売当時の業界状況、与えた影響に関する
具体的な記述の禁止」）。同じプロンプト内の「推測や創作は絶対にしない」が
既に同じことを述べており、📜 の要求と表面上正面衝突していた
- 📜 の指示を「提供された情報に無い歴史・影響は書かない。材料が無い場合は
このセクションを省略する」に強める

### 4. 歴史検索クエリに発売年を追加（§5.6 の修正3）

## 並び順（決定済み・§5.8）

  **評価母数（total_rating_count）の降順。**
  4軸スコアの流用は実データで**上位20件が全件100点の同点**になるため棄却済み
  （母数200以上が母集団条件なので、500票満点の票数軸に全候補が張り付く）。

## 履歴には手を加えない（§5.7）

  `history.json` の移行作業はゼロ。実測でブロックされるのは既に掲載済みの
  正当な名作6件のみで、これはクールダウンの本来の目的どおりの動作。

  ⚠️  `history.json` **を直接編集しないこと。** 過去に破損・履歴消失の事故がある。

---

  PR-I（規模判定 + steamUrl 抽出）

  【共通ヘッダ】

# PR-I: インディー枠の規模判定 + steamUrl 抽出の修正

- ブランチ: `feat/indie-scale-classification`
- 仕様: §3.4（規模判定）、§3.6（並び順とsteamUrl抽出の警告ブロック）
- 決着ブロック: `grep -n "論点 I-1" docs/article-category-spec-review.md`
- 関連: Issue #175（ただし下記の注意を読むこと）

## 実装内容（2つ）

### 1. 規模判定: 開発本数20超を「大手」として除外（§3.4）

  現在の `isLargeStudio()`（`scripts/indie-classifier.ts:169`）は静的リストの
  完全一致のみで、開発本数を見ていない。これが Nihon Falcom（214本）・
  Cygames（32本）・Studio Wildcard（20本）がインディー枠に載った原因。

  **静的リストは廃止せず OR で併用する**（The Coalition 8本・Unknown Worlds 9本の
  ような大手専属スタジオは本数では拾えないため、両方が必須）。

  **開発本数の取得方法（重要・2026-08-07 実測で確定）**:
  既存の `games` クエリに `involved_companies.company.developed` **を1フィールド
  追加するだけ**で取れる。既に `involved_companies.company.name` を選択しているため。
  `companies` **エンドポイントへの別リクエストは不要**（当初の仕様記述は誤りだった）。

- 生の件数を使う（Main Game に数え直さない。DLC主体の大手をインディー側に
落としてしまうため）
- 閾値20は環境変数化。**境界値20/21のテストを必ず含める**
（IGDBのデータ更新で数件ずれるため）

### 2. `steamUrl` 抽出の修正（§3.6 の警告ブロック）

  **この修正なしではインディー枠の並び順が機能しません。**

  3つの母集団クエリ（`fetchRecentPopularGames` / `fetchClassicGames` /
  `fetchIndieGames`）の変換処理が `websites` を生のまま返し、`steamUrl` を
  抽出していない。抽出しているのは `mapRawGameToIGDBGame`（`fetch-igdb.ts:411`、
  検索経路用。PR-0.5 マージ後の値）だけ。

  そのため `fetch-data.ts:149` の appId 補完（`if (igdbGame.steamUrl)`）が
  母集団由来の候補では**一度も発火せず**、`steamAppId` が埋まらない。
  `steamRecommendations` は `steamAppId` を前提に取得されるため（`fetch-data.ts:431`
  の early continue）、連鎖して並び順キーが欠落する。

  **データは存在する**: 実測で90日窓の発売済み候補33件のうち**30件（91%）が**
  `websites` **に Steam ストアURLを持つ**。真にSteam非掲載は3件のみ。

  3つの変換処理で `mapRawGameToIGDBGame:411` と同じ抽出を行うようにする。

### 3. 並び順の実装（§3.6）

  **Steam おすすめ数の降順。** タイブレークは「おすすめ数を持たない候補は末尾、
  その中では IGDB のユーザー評価点の降順」。**キーが欠けた候補を配列順のまま
  放置しないこと。**

## ⚠️  Issue #175 についての注意

  #175 は大手判定シグナルに `company.game_count` を挙げているが、
  **このフィールドは IGDB に存在せず、クエリに含めると** `400 Invalid field name`
  **になる**（実測済み）。記述どおりには実装できないので `developed` 方式に読み替える。

## 回帰ケース

  Nihon Falcom のインディー誤判定（§8 の検証方法が明示的に要求している）。

---

  PR-E / PR-F0 / PR-F / PR-G（小さめ4件）

  【共通ヘッダ】

# PR-E: 検索結果の抜粋を 300 → 1,500 字に統一

- ブランチ: `fix/prompt-excerpt-length`
- 仕様: §5.6 の「修正2」
- **PR-C と同じ箇所を触る**。どちらかを先に入れてリベース

## 問題

  プロンプトには300字しか渡していないのに、**バリデータは1,500字を見て
  「根拠あり」と判定している**。実測で 300〜1,500字の区間にのみ存在する
  「出典が必要な定量値」が31個あった。これらは記事を書くLLMには渡っていないのに、
  バリデータは警告を抑制する（＝ハルシネーションを見逃す）。

## 実装

  `scripts/fetch-web-search.ts` の **4箇所**（:215, :225, :235, :245）が
  それぞれ独立に `slice(0, 300)` している。すべて `SNIPPET_MAX_LENGTH`（:264、1500）
  に揃える。**1箇所ではなく4箇所**（レビュー情報 / 開発者情報 / Steamレビュー情報 /
  ゲームの歴史）。

  Tavily の呼び出し回数は増えない（取得済み本文を捨てずに使うだけ）。

## 受け入れ条件

  抜粋が長くなることで出力の焦点がぼやける可能性がある。
  `DEV_MODE=true` **で4カテゴリすべての出力を確認してからマージする。**

  【共通ヘッダ】

# PR-F0: 発行日をJST基準で決める

- ブランチ: `fix/publish-date-jst`
- 仕様: §9.3-2（原因は特定済み）
- **PR-F の直前に入れる**（PR-F の測定前提になる）

## 問題（原因は特定済み・コード実読）

  実測で17号中11号が金曜に発行されている（土曜のはず）。

- cron は `0 21 * * 5`（金曜UTC 21:00 = 土曜JST 6:00）で**正しい**
- `PUBLISH_DATE` は `workflow_dispatch` の `inputs.publish_date` にしか
渡っていない（`.github/workflows/weekly-build.yml:66`）ため
**schedule実行では空**になる
- その場合 `scripts/generate-articles.ts:1219` の
`new Date().toISOString().split('T')[0]` が **UTC基準の日付＝金曜**を返す

## 実装

  発行日をJST基準で決める。方法は2案あり実装時に選ぶ:

- ワークフローでJSTの日付を `PUBLISH_DATE` に渡す
- 生成側でJSTに変換する

## 注意

  §2.8 のJST統一（PR-C）は「発売日と発行日の比較」を揃えるもので、
  こちらの「発行日そのものの決定」とは**レイヤーが違う**。混同しないこと。

  【共通ヘッダ】

# PR-F: 特集のイベント0件週フォールバック

- ブランチ: `feat/feature-event-fallback`
- 仕様: §4.3、§4.4
- **PR-F0 の後**

## 問題

  2026年は52週のうち5週が「イベント0件」で、固定文言（「今週の注目ゲーム特集」）に
  フォールバックしていた。その結果、紹介ゲームが他号と重複する割合が
  **イベント0件の号で50%**（イベントがある号は10%）。

## 実装

  **発行日から過去方向に最大7日遡って直近の記念日を採用する。**
  過去方向でも見つからない場合は8日以降の未来方向を見る。

- 記念日データは `data/japanese-events.json`（127件）
- 通常の探索窓は未来方向7日（`getEventsInRange` の既定値）
- 固定文言 `'今週の注目ゲーム特集'` は **`bedrock-client.ts` の2箇所のみ**
  （2026-08-08 に `grep -rn "今週の注目ゲーム特集" scripts/` で実測）:
  - `:616` — フォールバック本体。**こちらが修正対象**
  - `:1043` — `determineFeatureTheme` 内。**呼び出し元ゼロの死んだコードなので変更不要**
    （調べ直す手間を省くため記載。削除するなら別PR）

  ⚠️ 当初この節は `generate-articles.ts:714-715` も挙げていたが誤り。
  同ファイルにこの文字列は存在しない（`:714-715` は `getEventsInRange(publishDate, 7)`
  ＝探索窓の指定で、フォールバック文言とは別物）

  **探索窓を常時広げる案は採らない**（窓を10日にすると隣接号で同じ記念日を使う
  危険が51週中1週→38週に激増する）。段階的フォールバックである必要がある。

## 実装時に決める下位判断

- 記念日の使用履歴の保存先（現在の履歴はゲームタイトルのみ記録し記念日名を
記録していない）と、除外する号数N
- フォールバックが発火したことをログまたは記事データに残す方法

  **「窓に入った」と「テーマとして使った」を区別すること。**
  除外は**実際に使った記念日のみ**に限定する（窓に入った記念日まで広げると
  8〜12日前まで遡ることになり趣旨から外れる）。

  【共通ヘッダ】

# PR-G: 本数不足の検出

- ブランチ: `feat/article-count-validation`
- 仕様: §6.4、§6.5
- **PR-B・名作枠PR より後**（不足が実際に減ったかを観測できる）

## 問題

  vol.17 の検証レポートは「記事4本」を**記録していた**が、ステータス判定
  （`scripts/format-validation-report.ts:38-51`）は high警告 / Web検索失敗 /
  medium警告 / URL欠落 / judge件数 だけを見ており、**記事本数が判定に入っていない**。

  そのため重大警告が0件なら、新作0本でもステータスは「正常」になり、Issueも
  起票されず、Actionsのサマリにも現れない。ログを開かないと気づけない状態だった。

## 実装

- `scripts/validate-article.ts` に本数不足の警告タイプを追加
（カテゴリごとの期待本数 新作2/インディー2/特集1/名作1 を1カテゴリでも下回れば）
- 重大度は **high**（実測で該当は17号中3号なのでノイズにならない）
- `computeReportStatus()` に算入 → `status: error` → 既存のIssue自動起票経路
（`weekly-build.yml:113-160`）に乗る
- `src/pages/launch.astro` の「毎号6本」を実態に合う表現に直す。
**5箇所**（:1019, :1036 のティッカー「6記事 / 号」と :1100, :1163, :1202 の本文）

## 制約

  **生成層には手を入れない**（`fetch-data.ts` / `generate-articles.ts` /
  `completeness-gate.ts`）。「枠を埋めるために不適格なゲームを載せない」
  「号全体を止めない」という Issue #179 の設計原則を維持する。
  本数が足りなければ少ない記事数で発行する。

## 実装時に決める下位判断

  期待本数を環境変数に置くか定数に置くか（前例: `generate-articles.ts:66` の
  `FEATURE_MIN_GAMES = 3`）。

## ⚠️  注意: severity=high の妥当性は保留事項に依存

  §9.1 の保留2件（high警告の重大性の再定義）と同じ束で最終確認する必要がある。
  着手前にユーザーに確認すること。
