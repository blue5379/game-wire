  各セッションの冒頭に貼る共通ヘッダと、PR別の指示に分けています。

---

# 🧭 現在地（最終更新: 2026-08-13）

> **このブロックは毎セッションの終わりに必ず更新する。** 本ファイルは 3,800 行を超えており、
> セッション冒頭に全体を掴む入口が必要なため先頭に置いてある。
> ここが古いと、次のセッションは「Issue 一覧から目についたものを選ぶ」状態に戻る。

| | |
|---|---|
| **§8 実装計画表** | **11 / 15 行 完了** |
| **次に着手する 1 件** | **#309**（PR-C。未発売記事の分岐・3値化・JST統一） |
| その次 | #308（PR-F0）→ #310（PR-F）→ #311（PR-G） |
| ブロック中 | なし |
| `monitoring`（着手しない） | #239 / #240 / #251 / #285 / **#317** / **#318** |

**直近セッションからの申し送り（2026-08-13。#297 のセッション）**

- **#297 は原因が既修正だった。** 発生源は Steam Featured Categories の `(item.id, item.name)` ペア崩れで、**Issue #102 / #103（PR #104。`a1e4f40`）が 2026-06-20 22:03 に修正済み**。混入記事 `issues-dev/issue-019.md` は同日 19:52 生成 = 修正の 2 時間 11 分前の生成物だった。**#239 の監視解除条件には該当しない**（原因候補2ではなかった）
- **事後の同一性照合の verdict ではこのクラスを落とせない。** 混入した値が照合の裏付け軸（year / company）を自分で供給するため、判定表の規則5で `uncertain` にしかならず `different` にならない（#296 の実測）。**混入を止める防御は採用時点にしか置けない。** ただし**指紋（`title=disagree` かつ `year=agree`）を観測するだけなら事後でも可能**で、それが #317 の対処案(c) → 未防御経路を **#317**、それに使える孤立関数を **#318** として分離（どちらも実測0件で `monitoring`）
- **#316 は本番コード無変更（テスト+フィクスチャのみ）なので、行番号の追加のずれは無い**
- PR-E（#307）以降 **#309 は `fetch-web-search.ts` の行番号がずれたまま**（`formatSearchResultsForPrompt` 以降 +41〜+45）。下記「行番号は必ず自分で確認する」節の PR #313 の表に、#309 が引き直すべき現在位置をまとめてある
- DEV_MODE 実行で judge が『ほの暮しの庭』の「発売中」を確信度 95% で contradicted と判定。**#309 の担当範囲に実データの裏付けがある**
- `IGDB enrich rejected` のログは `fetch-data.ts:113` と `:321` で**別物**。#239 の監視解除条件は `:321` のみ（`:113` は該当しない）

## 進め方（2026-08-13 にユーザーと合意。以後これに従う）

### キューは GitHub Milestone `記事カテゴリ抜本改修` が持つ

漂流の原因は「§8 に行があるのに Issue が無い」＝**トラッカー上の可視性の非対称**だった。同じことを構造で防ぐ。

- Milestone に入るのは **#297 / #309 / #308 / #310 / #311 だけ**
- **派生 Issue は既定で Milestone に入れない。** 昇格できるのは次の 2 条件のいずれかを満たすときだけ:
  1. Milestone の項目を**ブロックする**
  2. **読者に見える実害が観測された**
- それ以外は `monitoring` ラベルに落とす（クローズしない）。再開条件を Issue 本文か doc に書く

### 1 セッション = 1 Issue

| 段階 | やること |
|---|---|
| **開始** | 「🧭 現在地」→「作業の優先順位」→ 該当 PR 節。**この 3 つだけ読む。Issue 一覧から選ばない** |
| **途中** | 新しい欠陥を見つけたら **Issue 化し、Milestone には入れず本線に戻る**。止めるのは本線をブロックする場合だけ |
| **終了** | 実装 PR → `/code-review` → マージ → **docs PR（実施結果 + 行番号のずれ + 🧭 現在地の更新）→ マージ** |
| **その後** | コンテキストをクリアする |

> 🚨 **docs PR をマージする前にコンテキストをクリアしない。** これが唯一のセーブポイントである。
> 実装 PR だけマージしてクリアすると、行番号のずれと申し送りが失われ、次セッションが古い行番号で着手する。

### サブエージェントの使い分け（2026-08-13 のユーザー判断）

| 用途 | 方針 |
|---|---|
| `/code-review` | **必須。** 実績: #312 で 2 件・#313 で 1 件、いずれも実在の欠陥を検出 |
| 多仮説の並列調査 | **積極的に使う。** 原因候補が複数あり各々を独立にトレースする場合（#297 がこれ） |
| 実装 | **案件ごとに管理者が判断。** 多サブ項目のもの（#309 は 6 つ）は分割委譲する。**diff は必ず管理者が読む** |
| docs の執筆 | **委譲しない。** 捏造の実績が複数回ある（下記 🚨 節） |

---

## 進捗管理

| PR | ブランチ | 状態 | Issue/PR | 依存関係・備考 |
|---|---|---|---|---|
| PR-0 | `fix/issue-208-search-filter` | ✅ **マージ済み**（2026-08-08。`ad5b916`） | #208（`Refs`。未クローズ）/ PR #219 | **ブランチ名は当初案の `fix/issue-208-searchgamebyname-filter` から短縮**。**レビューで初回実装が差し戻され、無条件適用 → `mainGameOnly` オプションによる呼び出し元切り替えに設計変更**（コミット 2 本）。24 ファイル / 736 テスト全通過（着手前 23 / 724） |
| PR-0.1 | `fix/issue-208-feature-ai-screening` | ✅ **マージ済み**（2026-08-08。`0c07ba1`。**#208 クローズ済み**） | #208（Closed）/ PR #220 | **PR-0 の残タスク**。24ファイル / 744テスト（着手前 736）。レビュー指摘4件のうち1件を本PRで修正、3件を **#221 / #222** に分離。Issue #208 の「想定される修正」2項目目＝特集経路への `isAdultContentByAI` 適用（他 3 カテゴリは適用済み: `generate-articles.ts:1251` / `:1272` / `:1352`。feature のみ適用箇所が無い）。**適用位置は「選定確定後・本数警告の前」に決定済み**（2026-08-08。下記 PR-0.1 節に根拠）。**これで #208 をクローズする**。PR-0 の後・PR-0.5 の前。#219 はマージ済みなので `main` から切ればリベース不要 |
| PR-0.5 | `refactor/parameterize-igdb-filters` | ✅ **マージ済み**（2026-08-08。`28f835f`。squash） | - / PR #224 | 挙動不変の純リファクタ。24ファイル / 749テスト（着手前 744）。`/code-review` の**指摘ゼロ**。**ユーザー確認事項は「`mainGameOnly` を `gameTypes` に一般化しない」で確定**（別軸のため。下記 PR-0.5 節に根拠）。**このPRで `fetch-igdb.ts` の行番号が 21 行目以降すべて +12 ずれた** |
| PR-A | `fix/steam-dlc-exclusion` | ✅ **マージ済み**（2026-08-08。`2011619`。squash） | - / PR #226 | 24ファイル / 760テスト（着手前 749）。**仕様書に無い新事実を実測で発見**: `coming_soon` からサウンドトラック（`type=music`）が混入していた。レビュー指摘4件の内訳は 1件を本PRで修正 / 2件を **#227 / #228** に分離 / 1件（進捗表の更新）は後続の docs PR #229 で対応。**このPRで `fetch-steam.ts` の行番号が大きくずれた**（下記「行番号は必ず自分で確認する」節） |
| PR-B | `feat/newrelease-score-and-remake` | ✅ **マージ済み**（2026-08-08。`1bb61e6`。squash） | #210（`Refs`。未クローズ）/ PR #230 | 26ファイル / 865テスト（着手前 24 / 760）。コミット2本（実装 → レビュー対応）。**`/code-review` の指摘5件は全件が実在し、全件を本PRで修正**（別Issue分離なし）。**着手前測定（§9.3-9）で新作枠0本の原因を特定 → #231**。名作枠に `isFanGame` 未適用だったことも実測で発覚し本PRで修正 |
| PR-B2 | `feat/issue-238-domestic-sales-axis` | ✅ **マージ済み**（2026-08-09。`0a304eb`。squash） | **#238 / #244**（両方 Closed）/ PR #249 | **ブランチ名は当初案の `feat/domestic-sales-axis` から `feat/issue-238-domestic-sales-axis` に変更**。27ファイル / **1021テスト**（着手前 26 / 973）。コミット2本（実装 → レビュー対応）。**新規スクリプト `scripts/fetch-amazon-ranking.ts` を追加**。`/code-review` の指摘6件の内訳は **3件を本PRで修正 / 1件を一部修正（投機的な部分は見送り） / 2件を別Issueに分離**（#250 / #251。うち #251 は実データで懸念が再現しなかったもの）。**#244 の受け入れ条件は実データで再現しなかった**（下記「実施結果」に詳述）。**ミュータント検証20種を管理者が実施し、全種でテストが検出することを確認した** |
| **#241 対応** | `fix/issue-241-newrelease-population-window` | ✅ **マージ済み**（2026-08-09。`31770bc`。squash） | **#241**（Closed）/ 関連 #238・**#244** / PR #243 | 26ファイル / **968テスト**（着手前 960）。コミット2本（実装 → レビュー対応）。発売済みクエリに上限を追加 + 未発売クエリ `fetchUpcomingGames` を新設 + レビュー指摘を受けて発売済みを **2 本立て**（`hypes desc` / `rating_count desc` の和集合）に。実測: プール内の 60 日窓の発売済み **4 → 73 件**、未発売 16 → 23 件（供給維持）、実行時間 2:39 → 2:45。**選定結果は今週のデータでは不変**（下流の品質条件が Steam 依存のため。→ #238）。**仕様の矛盾を 1 件発見 → #244** |
| **#234 対応** | `fix/issue-234-website-type` | ✅ **マージ済み**（2026-08-09。`bd71e4f`。squash） | **#234**（Closed）/ 分離 **#247** / PR #246 | 26ファイル / **973テスト**（着手前 968）。コミット2本（実装 → レビュー対応）。`websites.category` → `type` 改名に追従し `pickOfficialUrlFromWebsites` を復旧。`IGDB_WEBSITE_TYPE` 定数を新設し `website_types` の実測値域を記録。mapper 2 箇所の `category ?? 0` 握り潰しを廃止。**Issue の影響表に無い3箇所目 `fetchGameImageAndUrl` を発見し削除**（呼び出し元ゼロだが #117 で廃止したブロックリスト方式フォールバックを保持していた）。実測: `enrichGameWithIGDB` で 8 タイトル中 **5 件**が `officialUrl` 取得（修正前は構造的に 0 件）。**レビュー指摘から既存欠陥 1 件を分離 → #247** |
| PR-C | `fix/issue-309-unreleased-article-branching` | 未着手 | **#309** | PR-E と同じ箇所を触る。どちらか先に入れて他方をリベース。**残り5件のうち最大**（サブ項目6つ）。ブランチ名は当初案の `feat/unreleased-article-branching` から Issue 番号入りに変更 |
| PR-D | `refactor/remove-metacritic-path` | ✅ **完了**（単独ブランチではなく PR #258 に吸収） | - | **このブランチ自体は使われなかった。** 実際の作業は下記 **`#253` 対応**行（PR #258）としてマージされた。名作枠PR（#254）マージ後に着手されたため、当初想定していた競合は発生しなかった |
| **#253 対応** | `fix/issue-253-qualified-game-cleanup` | ✅ **マージ済み**（2026-08-10。マージコミット `0af2a36`。通常マージ、squashではない） | **#253**（Closed）/ 関連 **#251**（Open のまま。コード変更なし） / PR #258 | PR-D が担当する予定だった `metascore` 削除を吸収 + `steamPlayers` の恒常的デッドコードを発見して削除 + `igdbRating` レスキュー経路を維持して仕様書に明文化。29ファイル / **1101テスト**（着手前 1106）。コミット2本（実装 `5c9e9b4` → `/code-review` 指摘2件の対応 `44bec5b`） |
| 名作枠PR | `feat/issue-classic-slot-population` | ✅ **マージ済み**（2026-08-09。`0a2b025`。merge commit） | 関連 **#238** / PR #254 | **ブランチ名は当初案の `feat/classic-slot-redesign` から変更**。29ファイル / **1106テスト**（着手前 27 / 1021）。コミット2本（実装 → レビュー対応）。母集団条件を評価母数ベース（`total_rating >= 85 & total_rating_count >= 200`）に変更し、選定側 `buildClassicCandidates` も同条件に一本化。実測: **名作枠選定が `Splatoon Raiders` → `The Witcher 3: Wild Hunt` に変化**、他枠は不変。**着手前検証で `parent_game` が展開可能なことを発見**し、決着ブロックが前提としていた ID 集合照合が不要になった（`igdbId` 追加も不要）。**レビューで欠陥1件を検出・修正**（親の `game_type` を見ずに `Final Fantasy VII Remake` を誤除外）。**`/code-review` 指摘4件のうち2件を本PRで対応**（選定側の `game_type` ゲート欠落・`limit 200` の非対称）、**2件を #255 / #256 に分離**（Creator's Eye の影響記述要求・特集プレフィルタのプロンプト肥大） |
| PR-I | `feat/indie-scale-classification` | ✅ **マージ済み**（2026-08-09。`7a2a0da`。squash） | #231（Closed）/ 関連 #175（`Refs`）/ PR #237 | 26ファイル / **960テスト**（着手前 26 / 865）。コミット2本（実装 → レビュー対応）。**着手後に「決着済みだが未実装」の論点A（新作枠の企業規模ゲート撤廃）を発見し、同PRで実装**（下記「実施結果」）。Issue #231 が提案していた方針は決着で棄却された A-3 相当だった。**分離した Issue は 7 件**（#234 / #235 / #236 / #238 / #239 / #240 / #241） |
| PR-E | `fix/issue-307-prompt-excerpt-length` | ✅ **マージ済み**（2026-08-13。マージコミット `dd8e8e9`。通常マージ、squashではない） | **#307**（Closed）/ PR #313 | 29ファイル / **1233テスト**（着手前 1227。新規6件）。コミット2本（実装 `49d5252` → `/code-review` 指摘対応 `b38ad84`）。**PR-C（#309）より先に入ったので、PR-C 側がリベースする。** 4箇所の `slice(0, 300)` を `readSearchContentMaxLength()`（既定1500・環境変数 `SEARCH_CONTENT_MAX_LENGTH` で上書き可）に統一し、旧 `SNIPPET_MAX_LENGTH` を削除。**着手前実測で決着ブロックのコスト見積もりが号単位に集計されていないことを発見**（1記事 7,200字 → 実測 **38,678字/号**、5.4倍）。**受け入れ条件（DEV_MODE で4カテゴリ確認）を実施済み**: high警告 0件（過去2回は各2件）、judge の裏付け済み主張 61（40/41）、裏付け不能 2（8/5）、本文長平均 1,296字（1,299字）。ミュータント検証6種すべて検出。ブランチ名は当初案の `fix/prompt-excerpt-length` から変更 |
| PR-F0 | `fix/issue-308-publish-date-jst` | 未着手 | **#308** | PR-F の直前に入れる。ブランチ名は当初案の `fix/publish-date-jst` から Issue 番号入りに変更 |
| PR-F | `fix/issue-310-feature-event-fallback` | 未着手 | **#310** | PR-F0（#308）の後。ブランチ名は当初案の `feat/feature-event-fallback` から Issue 番号入りに変更 |
| PR-G | `feat/issue-311-article-count-validation` | 未着手 | **#311** | PR-B・名作枠PR より後（**両者マージ済みなのでこの依存は解消**）。severity=high の妥当性は §9.1 の保留1と合わせて着手前にユーザー確認。ブランチ名は当初案の `feat/article-count-validation` から Issue 番号入りに変更 |
| **#260 対応** | `fix/issue-260-newrelease-window` | ✅ **マージ済み**（2026-08-10。マージコミット `7a33cea`。squash） | **#260**（Closed）/ 関連 **#241**（Closed） / PR #261 | 29ファイル / **1104テスト**（着手前 1101）。コミット1本（squash）。`selectGamesForArticles` 内の `releasedAfter` が3ヶ月窓（`setMonth(-3)`、実測約91〜92日）のまま、仕様書§2.3・付録パラメータ表の60日窓（#241対応でIGDB側の母集団クエリは既に統一済み）と乖離していたのを `sixtyDaysAgo`（`setDate(-60)`）に統一。管理者が実データ（`data/aggregated.json` 105件、fetchedAt=2026-05-16）で `buildNewReleaseCandidates` の実ロジックを検証し、**60日窓の候補14件に対し3ヶ月窓の候補は22件、うち`Slay the Spire II`（基準日の91日前発売）は3ヶ月窓では4軸スコアで全候補中2位となり新作枠（採用数2）に実際に選定されるが、60日窓では母集団にすら入らない**実害を確認。`buildNewReleaseCandidates`の境界値回帰テストを新規追加（59日前=含む・60日前=境界で除外・61日前=除外）。`fetch-igdb.ts`の`fetchIndieGames`（インディー枠、§3の母集団取得クエリ）にある同名変数`threeMonthsAgo`は完全に別機能でスコープ外のため変更なし |
| **#250 対応** | `fix/issue-250-upcoming-limit` | ✅ **マージ済み**（2026-08-10。マージコミット `86da8d5`。squash） | **#250**（Closed）/ 関連 **#244**（Closed） / PR #263 | 29ファイル / **1104テスト**（着手前 1104。変化なし。既存クエリ文字列アサーションの更新のみ）。コミット2本（実装 → `/code-review`指摘対応）。`fetchUpcomingGames`（未発売クエリ）の`limit`を20→50に引き上げ、発売済み側の2軸クエリ（#241/PR #243）と揃えた。90日窓の母集団は実測33〜34件あり`limit 20`で切られていたため、#244で緩和したはずの`game_type`条件（Main/Remake/Remaster許可）の恩恵（`Rayman Legends Retold`等）が実質無効化されていた。`/code-review`で、§8実装計画テーブルの#241行（`limit 20`の記述を含む）が未更新のまま矛盾していた点を指摘され、同PRで追加コミットして対応 |
| **#256 対応** | `fix/issue-256-feature-prefilter-summary-cap` | ✅ **マージ済み**（2026-08-10。マージコミット `34919f8`。squash） | **#256**（Closed）/ 関連 名作枠PR（#254） / PR #264 | 29ファイル / **1107テスト**（着手前 1104。新規3件）。コミット1本。特集テーマ事前フィルタ（`prefilterFeatureCandidatesByTheme`）が候補ゲームの`summary`を全文プロンプトに載せており、名作枠の母集団拡大（PR #254、123→288件）で約+34Kトークン/号のコスト増になっていたのを、`FEATURE_PREFILTER_SUMMARY_MAX_CHARS`（200文字）で切り詰めて解消。候補件数・選定ロジック自体は不変。`/code-review`で1件指摘（単純`slice`によるUTF-16サロゲートペア分割のリスク）が出たが、低リスク・既存コード（`fetch-web-search.ts`の同パターン）と整合との判断で見送り、別Issue分離もせず |
| **#255 対応** | `fix/issue-255-creators-eye-hallucination-risk` | ✅ **マージ済み**（2026-08-10。マージコミット `be24575`。squash） | **#255**（Closed）/ 関連 名作枠PR（#254） / PR #265 | 29ファイル / **1109テスト**（着手前 1107。新規2件）。コミット2本（実装 → `/code-review`指摘対応）。`classicSystem`のCreator's Eyeが「後世に影響を与えた革新的な要素」という根拠のない歴史的影響の記述を要求し続けていた（名作枠PR #254の`/code-review`で発覚し本Issueに分離）のを、要求項目自体を削除して解消。§2（📜ゲームの歴史）に既に入れていた「情報が無ければ省略可」ガードは、Creator's Eyeが必須セクションのため踏襲せず。`/code-review`で回帰テストが無い点を指摘され、同PRで追加コミットして対応 |
| **#221 対応** | `fix/issue-221-empty-feature-guard` | ✅ **マージ済み**（2026-08-10。マージコミット `ccc44f1`。squash） | **#221**（Closed）/ 関連 **#179**（設計原則）・**#222**（Closed。PR-0.1の`/code-review`で本Issueと同時に分離された別懸念。→ PR #271 で対応済み） / PR #267 | 29ファイル / **1110テスト**（着手前 1109。新規1件）。コミット2本（実装 → `/code-review`指摘2件の対応）。`selectedGameData`が0件になった場合に`throw`するガードを追加。管理者が実データで検証し、過去に公開された全19号のfeature記事は`recommendedGames`が3〜5件で0件になったことは一度もない（実害はまだ発生していない理論上の欠陥）と確認した |
| **#247 対応** | `fix/issue-247-featured-recommended-url-validation` | ✅ **マージ済み**（2026-08-10。マージコミット `7cfa916`。通常マージ、squashではない） | **#247**（Closed）/ 関連 **#234**（PR #246のレビューで分離） / PR #269 | 29ファイル / **1124テスト**（着手前 1110。新規14件）。コミット2本（実装 → `/code-review`指摘対応）。特集記事`recommendedGames[].officialUrl`にBluesky/Discordの非公式URLが本番で5件混入していた実害を解消。**着手前の独立検証でIssue本文より深い根本原因を発見**（下記「実施結果」に詳述）: `NON_OFFICIAL_URL_PATTERNS`のドメイン抜けにより、Tavily経由の誤候補がIGDBの正しい公式URLを無条件に上書きしていた。根本原因の修正+出力時ゲート追加の両方を実施 |
| **#222 対応** | `fix/issue-222-adult-screening-observability` | ✅ **マージ済み**（2026-08-11。マージコミット `c333eaf`。通常マージ、squashではない） | **#222**（Closed）/ 関連 **#221**（PR-0.1のレビューで同時に分離） / PR #271 | 29ファイル / **1168テスト**（着手前 1124。新規44件）。コミット2本（実装 → `/code-review`指摘4件の対応）。**着手前検証でIssue本文の前提（「AIスクリーニングは特集枠の主防御」）が誤りと判明**し、Issueにコメントで訂正（実際はIGDBの`themes != (42)`が第1層、AIスクリーニングは第3層）。観測の出力先が**2系統**（CIのstdout / 永続化されるValidation Report）あることをデータフロー追跡で発見し、初回実装で漏れていたレポート側も追加対応。`/code-review`が**例外以外の第2のfail-open経路**（応答形式不正）を検出し、別カウンタで計上（ただし実態未観測のため`error`昇格はさせない仕様判断をテストで固定） |
| **#235 対応** | `fix/issue-235-drop-youtube-popularity-route` | ✅ **マージ済み**（2026-08-11。マージコミット `d04a107`。通常マージ、squashではない） | **#235**（Closed）/ 関連 **#217**（YouTube活用の可否検証）・**#274**（本PRのレビューで新規分離） / PR #273 | 29ファイル / **1166テスト**（着手前 1168。YouTube percentileの4テストを削除、回帰テスト+ポジティブコントロールを2件追加）。コミット1本。§3.5が2026-08-07に決定済みだった「話題性ルートをSteamの2経路だけにする」の未実装分を実装。**着手前の独立検証で前セッションの前提が再現しないことが判明**（下記「実施結果」に詳述）: 「YouTubeマッチ0件＝実質デッドコード」は直近データでは成立せず2件マッチしていたが、いずれも先に評価されるSteam経路を満たすためYouTube分岐は到達不能で、結論（供給は減らない）はより強い理由で成立した |
| **#236 対応** | `fix/issue-236-parent-publisher-entries` | ✅ **マージ済み**（2026-08-11。マージコミット `abd8f3e`。通常マージ、squashではない） | **#236**（**Closed にしていない。①が未解決のため**）/ 関連 **#231**（Closed。方針の根拠が実測で崩れた）・**#277**（本PRのレビューの横断確認で新規起票）・**#175**（上位タスク） / PR #276 | 29ファイル / **1178テスト**（着手前 1166）。コミット2本（実装 `76e31e5` → `/code-review` 指摘対応 `dd40bb4`）。真因2層のうち**②（`MAJOR_PUBLISHER_SUBSIDIARIES` にはコメント見出しだけがあり、親会社エントリが `LARGE_DEVELOPERS` に無かった）だけ**を対処し、**①（IGDBのレコード分裂）は未解決のまま Issue を開いている**。Issue #231 が個社追記を退けた根拠（「PR-I の `developed` 判定と二重になる」）は**実測で崩れた**: 『ほの暮しの庭』は `developed=3` の分裂レコードに紐づき `developed` 判定が発火しない。`/code-review` 指摘1件を採用したが、**対処法はレビュー案（別 canonical を立てる）から変更し、エイリアスごと削除**した |
| **#274 対応** | `fix/issue-274-popularity-route-finalize` | ✅ **マージ済み**（2026-08-11。マージコミット `6ac5af0`。通常マージ、squashではない） | **#274**（Closed）/ 関連 **#280**（本PRの `/code-review` で新規分離） / PR #279 | 29ファイル / **1181テスト**（着手前 1178。新規3件）。コミット1本（`47cefc3`）。`meetsPopularityThreshold` に finalize 前のオブジェクトを渡していた不整合の修正（本体1行）。実データ測定で実害は0件だったが、**修正は単調**（供給が減るリスクが構造的にゼロ）なので実施した。**1回目の測定は検出力ゼロ**だった: 本番と同じ `targetCount=2` では上位2候補が通常ルートで採用された時点でループが終了し、24候補中2件しか評価されず話題性ルートが一度も動かなかった。`/code-review` 指摘1件を **Issue #280 に分離** |
| **#280 対応** | `fix/issue-280-popularity-route-developer-gate` | ✅ **マージ済み**（2026-08-11。マージコミット `c823440`。通常マージ、squashではない） | **#280**（Closed）/ 関連 **#284**（欠陥B。本PRから新規分離）・**#285**（欠陥2。本PRから新規分離）・**#274**（本Issueの出所） / PR #282 | 29ファイル / **1184テスト**（着手前 1181。新規6件を追加し、うち3件を`/code-review`指摘により削除）。コミット2本（実装 `09c0710` → `/code-review`指摘対応 `13e63bd`）。話題性ルートの大手ゲートに `isLargeStudio(steamRawDeveloper)` を追加。`isQualifiedCompanyName` が単一トークン社名を弾くため `developer` 未設定になり、大手が「個人開発」ラベルで載り得た欠陥1を解消。**`/code-review` が管理者の実装の半分を無効と判定した**: 同時に入れた第2引数 `developerGameCount` は、この経路では常に `undefined` で発火しない死んだコードだった（到達条件が `!game.developer` である一方、`developerGameCount` は `developer` と同時にのみ書かれ、`developer` を解除する経路が無い）。第2引数と、到達不能な状態を前提にしていたテスト3件を撤回した。実データ測定では変更前後で判定が変わった候補は0件（供給は減らない） |
| **#232 対応** | `fix/issue-232-feature-fangame-filter` | ✅ **マージ済み**（2026-08-12。マージコミット `6829685`。通常マージ、squashではない） | **#232**（Closed）/ 関連 **#289**（本PRの着手前検証で新規起票） / PR #288 | 29ファイル / **1189テスト**（着手前 1184。新規5件）。コミット1本（`8d5911e`）。`deduplicated`（経路1・経路2の合流点）への1箇所適用で qualified / fringe の両分岐をカバー。実測: qualified 227 → 225（−2。Black Mesa / Pokémon Infinite Fusion）。Issue本文の対象が実経路でないことを着手前検証で判明（`fetch-data.ts:1316` の `featured` は特集記事に使われていない → Issue #289）。リメイク非適用はユーザー判断（継承元が3通りに割れる）。`/code-review` 4件すべてスコア80未満で分離なし |
| **#277 対応** | `fix/issue-277-canonical-display-name` | ✅ **マージ済み**（2026-08-12。マージコミット `50e2c7a`。通常マージ、squashではない） | **#277**（Closed）/ 関連 **#236**（本Issueの出所）・**#180**（ラベル方針の起源）・**#175**（上位タスク） / PR #291 | 29ファイル / **1212テスト**（着手前 1189。新規23件）。コミット1本（`fc191d1`）。`DeveloperEntry` に `displayName` フィールドを追加し、規模判定用の内部識別子（`canonical`）と読者向け表示名を分離。`displayName` を付けたのは3エントリのみ（`Nintendo EPD` → `任天堂`、`Xbox Game Studios` → `Microsoft`、`Bethesda Game Studios` → `Bethesda`）。`2K Games` と `PUBG Studios` は対象外と判断（別法人に化ける構造ではない）。**レビューで回帰を検出**: 初回実装は `game.developer` を `displayName` で上書きしていたが、これは `matchGameToSteamEntity` の company 軸を `disagree` へ転落させ、severity `high` の `game-source-mismatch` を誤発報する。管理者の実測で実害を確認し、上書き自体を撤去した。`/code-review` 指摘0件だが、docs stale 1件を管理者判断で採用（本docs PRで対応） |
| **#289 対応** | `fix/issue-289-remove-featured` | ✅ **マージ済み**（2026-08-12。マージコミット `2c12b4d`。通常マージ、squashではない） | **#289**（Closed）/ 関連 **#232**（本Issueの出所）・**#293**（本PRの検討中に新規起票） / PR #294 | 29ファイル / **1214テスト**（着手前 1212。新規2件）。コミット1本（`5116768`）。**対処 (c) 削除を採用**: `SelectedGames.featured` フィールドと全消費者を削除。**Issue本文の「単調な変化」は不正確だった**: 実測で名作候補数は 176→177 件の単調増だが、**採用される1位が Witcher 3 → GTA V に入れ替わる非単調な変化**が生じた（`totalRatingCount` 降順で GTA V = 5896 > Witcher 3 = 5430）。`featured` は死んだ値ではなく、名作枠から1件を締め出すフィルタとして実質機能していた。削除を選んだ根拠3点: ①**ジャンル条件**に設計判断の記録が無い（ジャンルリストは Initial commit から不変。ただしスコア条件の側は `bb7cda2` / `5c9e9b4` で2度受動的に変化しており、当初「条件全体が不変」と書いたのは誤りだった → 実施結果節に訂正表あり） ②仕様 §4.2・§4.5 と正面から矛盾（特に **§4.6 は IGDB のテーマ分類を明示的に棄却済み**） ③除外は常に1件で順序が意味を持たない（`find` vs `filter`）。ミュータント検証4種のうち3種を検出、1種は構造的限界（`selectGamesForArticles` が export されていない）。`/code-review` は PR #294 で3件・本docs PR #295 で3件を検出。PR #294 側は全件不採用、**PR #295 側は1件（スコア条件の履歴の誤り）を管理者が `git show` で実在確認して採用** |
| **#298 対応** | `fix/issue-298-remove-individual-developer-label` | ✅ **マージ済み**（2026-08-12。マージコミット `6dde6b5`。通常マージ、squashではない） | **#298**（Closed）/ 関連 **#284**（本Issueの出所）・**#297**（実例に重なっていた別作品メタデータ混入）・**#296**（同一性照合のスキップ）・**#300**（`/code-review` 指摘から新規起票）・**#97**（`個人開発` 表記の出所） / PR #299 | 29ファイル / **1213テスト**（着手前 1214。削除2件 + 追加1件）。コミット1本（`f5ddcf5`。`/code-review` 指摘は本PRでは修正せず Issue #300 に分離したため追加コミットは無い）。**着手前検証で Issue #284 の実例が別の欠陥の産物と判明**: `個人開発（Petroglyph）` は別作品メタデータ混入（→ #297）で、それが検出されなかった理由は同一性照合のスキップ（→ #296）。**ラベルは症状であって原因ではない**。実装: `formatIndividualDeveloper` 削除、`developer: finalizeResult.game.steamRawDeveloper` に変更、`?? 'unknown'` フォールバック削除。Steam生値は一次ソースの事実で、`NORMAL_REQUIRED.developer = true` を通り供給が減らない（案A）。**自前の検証機構が high で警告していた**: LLM-as-a-judge（`validation-report-019.json`）が「本作は個人開発（Petroglyph）によって制作された」を確信度95%で「明確な誤情報」と判定。同一性照合への影響は中立（実測）。ミュータント検証3種すべて検出。`/code-review` 2件のうち1件を **Issue #300** に分離（スコア75。`deduplicateGames` が `steamRawDeveloper` をマージしない既存問題） |
| **#296 対応** | `fix/issue-296-visualize-identity-check-skip` | ✅ **マージ済み**（2026-08-13。マージコミット `490fd11`。通常マージ、squashではない） | **#296**（Closed）/ 関連 **#297**（別作品メタデータ混入）・**#298**（PR #299。本Issueの発覚源） / PR #303 | 29ファイル / **1220テスト**（着手前 1213。新規7件 + 既存1件の期待値更新）。コミット1本（`3e4e532`）。**着手前検証で Issue 本文の中心数値が誤りと判明**: `extractSteamAppIdFromArticle` は2経路を持つが集計で片方を数え落とし、スキップ率を実測の2倍（55.7% → 実測29.5%）に見積もっていた。対処案1（スクリーンショットから appId 抽出）の救済は「5件」ではなく **0件**。対処案2（`steamAppId` を `GeneratedArticle` に持たせる）は `completeness-gate.ts` の **R5**（`steamAppId` を直接読む同一性照合。`:311-370`）と重複。**同一性照合は二重化されており、上流側は appId を直接見ていた**。案3（スキップを観測可能にする）を採用。`validateGameSourceConsistency` に `severity=low` / `type=game-source-unchecked` 警告を追加（`:710-722`）。バッチ関数は `continue` を残したまま直前で警告を収集（API 呼び出し増加なし。レート制限対策は維持）。`build-issue.ts` で CI 出力（`:532-540`）とレポート記録（`:682-687`）。ミュータント検証3種すべて検出。`/code-review` 2件は両方とも不採用（誤検知）: `format-validation-report.ts` が総称レンダリングするため専用コードは不要（PR #271 の `adultScreeningFailures` はカウンタで構造が違う）/ JSDoc の fail-open は API 呼び出し後の別条件を指しており stale ではない |
| **#300 対応** | `fix/issue-300-dedup-merge-gaps` | ✅ **マージ済み**（2026-08-13。マージコミット `c0862ef`。通常マージ、squashではない） | **#300**（Closed）/ 関連 **#299**（PR #299。本Issueの出所）・**#296**（同一性照合スキップ）・**#297**（別作品メタデータ混入） / PR #305 | 29ファイル / **1227テスト**（着手前 1220。新規7件）。コミット1本（`01fe60f`）。**着手前検証で Issue 本文の指摘（1件）に加え同種の漏れが2件判明**: `deduplicateGames` のマージ対象から抜けていたのは `steamRawDeveloper` だけではなく **3フィールド**（`steamRawDeveloper` / `steamRecommendations` / `igdbWebsites`）。うち `steamRawDeveloper` と `steamRecommendations` は **同じ if ブロック内に隣接して書き込まれる**（`fetch-data.ts:483` / `:492-493`、`steamAppId` 存在が前提）にもかかわらず両方とも漏れていた。GameData の総34フィールド中、マージ対象は本PRで27フィールド（着手前24）。対象外7フィールドの内訳: ①記事生成段階で書かれる値（`coverImageOrientation` / `isAiInferred` / `aiInferredFields`） ②正式名称採用ロジックで意図的に別扱い（`title` / `normalizedTitle`） ③グループ化キー・マージ先選定に使う値（`steamAppId` / `source`）。実害の構造的限界: `steamRawDeveloper` / `steamRecommendations` の書き込み2箇所は `steamAppId` 存在が前提で、dedup のグループ化も同一 `steamAppId` でまとめるため、漏れを持つ dup があるグループでは primary も同じ `steamAppId` を持ち vet 時の Storefront 再取得の前提が構造的に満たされる（実害は Storefront 取得失敗と重なった場合のみ）。`bySlug` グループはどのエントリも書き込み対象外で無関係。`igdbWebsites` には再取得経路が無いため緩和されない。実害の実績は未測定（修正が単調なため測定を待たずに実施。PR #279 の前例に従う）。**`??` 使用の理由**: `steamRecommendations` は `number` 型で `0` が有効値（`\|\|` だと dup 側の値に置き換わる）。`igdbWebsites` は書き込み側が空配列を入れず undefined にする設計（`fetch-data.ts:358-360`）のため `screenshots` 系と同じく `??` が適切。ミュータント検証6種すべて検出。`/code-review` 2件は両方とも不採用（誤検知）: 詳細は下記「実施結果」節 |
| **#297 対応** | `chore/issue-297-appid-mixup-regression` | ✅ **マージ済み**（2026-08-13。マージコミット `df47cc4`。通常マージ、squashではない） | **#297**（Closed）/ 関連 **#102**・**#103**（真の修正元。PR #104）・**#317**・**#318**（本セッションで新規起票。どちらも `monitoring`）・**#296**（照合スキップ）・**#298**（`個人開発` ラベル） / PR #316 | 29ファイル / **1237テスト**（着手前 1233。新規4件）。コミット1本（`24e74ed`）。**本番コードは無変更**（テスト + フィクスチャのみ、121行追加）。**着手前検証で Issue の前提「原因が未特定」が崩れた**: 発生源は原因候補3（Steam 側の候補収集段階での appId 取り違え）で、**既に修正済みの Issue #102 / #103**（PR #104。`a1e4f40`。2026-06-20 22:03:26 JST）だった。`fetch-steam.ts` の `isSameSteamApp` の JSDoc とそのコミットメッセージの両方に、appId 32470 と「サイバーパンク2077 アルティメットエディション」の実ペアおよび「別ゲームのデータ（developer=Petroglyph 等）で記事生成されていた」が明記されている。**混入記事は同日 19:52 生成 = 修正の 2 時間 11 分前の生成物。** 記事の全フィールドが `a1e4f40^` の `verifySelectedGamesSteamUrl` の指紋と一致することを実読で確認（`coverImage` 無しで `coverImageOrientation` だけ残る / `sourceUrls.steam` 消失 / `screenshots`・`developer`・`releaseDate` は残存 / cover 無しで記事化 = `removeZombieGames` 当時未存在 = **#103 のゾンビ問題**）。appId 32470 の実体は 2026-08-13 に Storefront API で再確認（`['Petroglyph']` / 2010年5月25日 / type=game。**混入記事の値と完全一致**）。**副産物: 事後の同一性照合の verdict ではこのクラスを落とせない**（#296 の `uncertain` の agree 2軸は混入した値そのもの。混入が照合の裏付けを自分で供給するため規則5で `different` にならない）→ **混入を止める防御は採用時点にしか置けない**ため **#317 / #318** に分離（指紋の観測だけなら事後でも可能。#317 の対処案(c)）。テストは既存スイートが検出できない3点だけを塞いだ（`new_releases`/`coming_soon` のガード結線 / `name: storefrontName ?? item.name` の優先順 / resolver の `knownSteamAppId` 経路）。Red-Green の代わりに**ミュータント検証4種を実施し全種検出**（各ミュータントが落とすのは対応する1テストのみ）。`/code-review` は**指摘ゼロ**（5エージェント中4つが指摘なし。1件出た「フィクスチャの実測日が混在して見える」はスコア25で不採用 — `2026-08-13` のコメントが導入しているのは新規3定数のみで、再利用した `TIANLIANG_ZHIHOU`/`PIGHT` は自前の 08-08 コメント配下にあり主張が成立しない） |

状態は `未着手` / `実装中` / `レビュー中` / `マージ済み` のいずれかで更新する。

## 🚨 作業の優先順位（2026-08-13 の棚卸しで再設定）

### なぜ棚卸しが必要だったか（事実）

**§8 実装計画表の残り 5 件に GitHub Issue が 1 つも無く、派生 Issue だけがトラッカー上で可視だった。**
その結果、次に何をやるかを Issue リストから選ぶ限り元計画は永久に選ばれない構造になっていた。実測:

| 観測 | 値 |
|---|---|
| §8 計画表 15 行のうち完了 | 10 行 |
| 残り（すべて未着手・Issue 無し） | **5 行**（PR-C / PR-E / PR-F0 / PR-F / PR-G） |
| 計画表を前進させた最後の PR | **#258**（2026-08-10 00:22）。仕様の決定を実装した最後は #273（同日 17:08） |
| それ以降にマージされた code PR | **10 本**（#276 / #279 / #282 / #287 / #288 / #291 / #294 / #299 / #303 / #305）。**#287（サイトデザイン）以外の 9 本すべてが派生 Issue で、計画表は 1 行も進んでいない** |
| 派生チェーンの最大深さ | **6 段**（§3.5 → #235 → #274 → #280 → #284 → #298 → #300） |
| 実装開始（08-08）から**本棚卸しの直前**（08-13。#307〜#311 の起票前）までに起票された Issue | 33 件（closed 23 / open 10）。**open 10 件はすべて派生で、§8 の項目は 1 件も含まれなかった**。⚠️ **これは棚卸し時点のスナップショット。** 本棚卸しで #307〜#311 を起票したので、以降に同じ条件で数えると 38 件（closed 23 / open 15）になり、うち 5 件が §8 の項目になる |
| 直近の派生 PR 9 本のうち実害が観測できなかったもの | **4 本**（#279「実害0件」/ #282「判定が変わった候補0件」/ #303「可観測性のみ・severity=low」/ #305「実害の実績は未測定」） |

### 仕様書が修正対象に挙げた故障 9 件の達成度

| # | 元の故障 | 状態 | 層 |
|---|---|---|---|
| 1 | 新作紹介が 0 本（vol.17。枠が互いの受け皿になっていた。§1.1） | ✅ #237（0 → 2 本） | 選定 |
| 2 | 名作枠に 2026 年の新作が 6 号連続（§5.2） | ✅ #254（Splatoon Raiders → Witcher 3） | 選定 |
| 3 | インディー枠に大手（Nihon Falcom 等。§3.4） | ✅ #237 / #276 | 選定 |
| 4 | Steam 経路の DLC・サントラ混入（§6.1） | ✅ #226 | 選定 |
| 5 | 特集の実在検証にフィルタが無く成人向け・DLC が素通り（§4.5） | ✅ #219 / #220 / #288 | 選定 |
| 6 | 特集がイベント 0 件週に「人気順の先頭」へ収束（重複 50%。§4.3） | ❌ **#310 / #308** | 生成 |
| 7 | 未発売タイトルへの評価断定ハルシネーション（vol.3 / vol.9。§2.5-2.7） | ❌ **#309** | 生成 |
| 8 | 抜粋 300 字 vs バリデータ 1,500 字 → ハルシネーションが「根拠あり」判定（§5.6） | ✅ **#307 / PR #313**（2026-08-13） | 検証 |
| 9 | 本数不足に気づけない（vol.13 の名作 0 本が今回初めて判明。§6.4） | ❌ **#311** | 検証 |

**完了した 1〜5 はすべて「選定ロジック」、残った 6〜9 はすべて「記事生成・検証」。**
直近 3 日の派生作業は全部が**既に完了した選定ロジック側の深掘り**で、読者が実際に読む文章の事実性には触れていない。

### 優先順位

**この表の内容は GitHub Milestone `記事カテゴリ抜本改修` と一致させる**（2026-08-13 に作成。#297 / #309 / #308 / #310 / #311 の 5 件）。
片方だけ更新しないこと。順序の正は本表、可視性の担保が Milestone、という役割分担。

| 順 | 対象 | 理由 |
|---|---|---|
| ~~1~~ | ~~**#297**（別作品メタデータ混入）~~ | ✅ **完了**（2026-08-13。PR #316。マージ `df47cc4`）。**原因は既修正の #102 / #103 だった**（Featured Categories の `(id, name)` ペア崩れ。混入記事は修正の 2 時間 11 分前の生成物）。対処は回帰テストのみ・本番コード無変更。未防御経路を #317 / #318 に分離 |
| ~~2~~ | ~~**#307**（PR-E。抜粋 300→1,500字）~~ | ✅ **完了**（2026-08-13。PR #313。マージ `dd8e8e9`）。受け入れ条件の DEV_MODE 検証まで実施済み |
| **1**（繰り上げ） | **#309**（PR-C。未発売記事の分岐・3値化・JST統一） | 実際に事故が 2 件（vol.3 / vol.9）。**#307 が先に入ったので PR-C 側がリベースする**（`fetch-web-search.ts` の行番号が +41〜+45 ずれている。上記「行番号は必ず自分で確認する」節の PR #313 の表を参照。**#316 は本番コード無変更なので追加のずれは無い**）。DEV_MODE 検証で judge が『ほの暮しの庭』の「発売中」を確信度 95% で contradicted と判定しており、**この症状が PR-C の担当範囲にあることが実データで確認できている** |
| **2** | **#308**（PR-F0）→ **#310**（PR-F） | 特集がイベント0件週に重複50%へ収束する。#308 が #310 の測定前提 |
| **3** | **#311**（PR-G。本数不足の検出） | 着手前に §9.1 保留1（high の再定義）をユーザー確認 |

**#297 を #309 より先にすることは 2026-08-13 にユーザーが確認済みだった**（観測済みの実害があり、かつ `issues-dev/` が gitignore のため先送りのコストが増え続ける唯一の項目だったから）。結果として**原因は既修正で、先送りのコストという判断根拠は正しかった**（`issues-dev/issue-019.md` はまだ残っていたので指紋照合ができた。あと数日で失われていた可能性がある）。

### `monitoring` ラベルへ落とした派生 Issue（クローズしない）

いずれも **Issue 自身が「実害の頻度が未測定」と記録し、着手の前提として測定を要求している**もの。ラベルは 2026-08-13 に付与。

| Issue | 再開条件 |
|---|---|
| **#239**（`aggregateGames` の黙示的上書き） | `IGDB enrich rejected` WARN（`fetch-data.ts:321` の方）が 1 件以上出た号が観測されたとき。実測では PR #237 で 3 件 → 0 件。⚠️ **#297 の原因候補2として名指しされていたが、2026-08-13 の #297 調査で原因ではないことが判明した**（真の発生源は Featured Categories の `(id, name)` ペア崩れ = #102）。**この解除条件は消滅したので、上記の WARN 観測が唯一の再開条件** |
| **#240**（`developed` 生件数が多作な小規模スタジオを誤判定） | 「`developed > 20` かつ静的リスト外」で除外された候補に小規模スタジオが 1 件以上含まれていたとき。Kairosoft（88本）は誤判定例として実測済みだが、**インディー枠の候補に到達したかは未測定** |
| **#251**（批評経路に評点の下限が無い） | 評価 60 未満で批評経路のみ通過するタイトルが実際に選定・公開されたとき。2 回の独立測定でいずれも 0 件。**2026-08-10 に既に監視方針で決着済み**（§9.3-14）で、今回はラベルで可視化しただけ |
| **#285**（話題性ルートに開発本数の軸が無い） | 「静的リスト外かつ開発本数が閾値超」かつ「話題性ルートに到達」の重なりが 1 件以上あったとき。⚠️ **ログ0件を「実害なし」と読む前に、話題性ルート自体への到達件数を数える**（PR #279 に検出力ゼロの測定という前例あり） |
| **#317**（IGDB 由来 appId が name 未検証のまま Storefront メタデータのコピー元になる） | ①ライブ fetch で「`steamAppId` を持ち、かつ `source` に `steam` を含まない候補」が 1 件以上出た ②`matchGameToSteamEntity` の `title=disagree` かつ `year=agree`（= 混入の指紋）がレポートに 1 件でも出た。⚠️ **ローカル `data/aggregated.json`（fetchedAt=2026-05-16、105件）での測定は検出力ゼロ**（steamAppId 保持 31 件が全件 Steam リスト由来で、この経路への到達が 0 件）。#285 と同じ罠なので**到達件数を先に数える** |
| **#318**（`fetchSteamAppName` が呼び出し元ゼロの死んだコード） | ①`identity-resolver-trace.json` に `known-appid` の `ok:false` が出た号があり、その appId が実際には正しかったとき ②#317 の対処で英日照合関数を流用する判断になったとき。⚠️ **#317 より先に (A) 削除を実施しないこと**（#317 の対処案 (a) が流用候補にしているため、消すと作り直しになる） |

### 再発防止

**§8 実装計画表に新しい行を足したら、その場で Issue を起票する。** doc の中だけに残すと、派生 Issue との可視性の非対称が生まれ、元計画が選ばれなくなる。
§9.3-10 が「決着済みだが PR に割り当てられていない決定」を保留事項として挙げているのと同型の問題で、そちらは「§11.1 の確定事項の表と §8 の PR 一覧を定期的に突き合わせること」としているが、**本件は「§8 に行があるのに Issue が無い」という別の抜け方**だった。

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

## 🚨 docs の執筆を委譲したら、全数値・全行番号を実測で検証する（省略禁止）

**Sonnet の docs 初稿には、実データに存在しない記述が混入する。** コード実装より
docs の方が誤りが出やすい（テストや型チェックが効かないため）。委譲後、管理者が必ず:

1. **引用した file:line を全件** `sed -n '<line>p' <file>` で開いて内容が一致するか確認する
2. **削除済みコードの引用**は `git show <sha>^:<path> | sed -n '<range>p'` で実在を確認する
3. **件数・コミット数**は `git rev-list --count` / `git show --stat` で数え直す
4. **記事名・ゲーム名・関数名**は `grep` で実在を確認する（**存在しない固有名詞が最も多い**）
5. **テーブルの列数**は Python で unescaped pipe を数える（GFM の `\|` は awk で過大に見える）
6. **指示していない追記が無いか** diff を通読する

> ⚠️ **この節は2度の事故を受けて追加された（2026-08-12。PR #301）。**
> **1度目**（PR #292 の作業時）: 初稿に**存在しない記事の実例が捏造**されていた（「vol.011 の Halo」）。
> テスト件数の内訳も実測と不一致だった。管理者が差し替えたためマージ内容には残っておらず、
> **git 履歴からは追えない**（セッション引き継ぎメモにのみ記録されていた。だからこの節に残す）。
> なお `grep -rln Halo src/content/issues/` は現在も**0件**で、実在しないことは再確認済み。
> **2度目**（PR #301。1度目の対策後も再発）: 初稿から**6件の誤り**を検出。うち**3件は捏造**で、
> ①**存在しない関数名** `matchBySteamAppId`（`grep -rn` で0件） ②**無関係な appId 292030**
> （実際は 32470。292030 は別作品） ③**登場しないゲーム名** `8 Bit Invaders!`。
> 残る3件は行番号の誤り2件（削除テストの場所・追加テストの行番号）、コミット数の誤り2箇所
> （「2本」と書かれていたが `git rev-list --count` = **1**。既存行のパターンに引きずられた創作）、
> 指示外の重複追記1件。
> **いずれも「もっともらしい」記述で、実測しなければ気づけない。** 特に③のように
> 「実際に存在する別作品」を持ち出す捏造は、文脈が整合して見えるため危険。

# 必ず先に読むもの

1. `CLAUDE.md`（Issue対応ワークフロー・品質ゲート・テストコード規約・DEV_MODE）
2. `docs/article-category-spec.md` の該当節（下記PR指示で指定）
3. `docs/article-category-spec-review.md` の該当決着ブロック（判断の根拠。grep で探す）

# 🚨 着手前の必須検証（厳守事項。省略禁止）

**Issue 本文・本指示書に書かれている「原因の説明」「想定される修正」「対処方針」を、絶対に鵜呑みにしないこと。**
着手前に、仕様書・決着ブロック・コード・実データで**独立に検証**する。これは推奨ではなく厳守事項である。

検証する対象は「その修正が正しいか」だけではない。**「そもそもその処理は仕様上存在してよいのか」**まで含めて確認すること。

手順:

1. Issue が引用している箇所だけでなく、**その Issue が触れていない上位ドキュメント**
   （仕様書の該当節・決着ブロック・§11.1 の確定事項の表）を grep して読む
2. 「この条件・この処理は仕様上存在すべきか」を先に確認してから「どう直すか」に進む
3. **決着済みだが、どの PR にも割り当てられていないタスク**が仕様書に埋もれていることがある。
   §8 の実装計画表と §11.1 の確定事項の表を突き合わせる
4. Issue の**受け入れ条件そのものも検証対象**。実データで前提が再現しないことがある
5. 検証結果が Issue の記述と食い違ったら、**実装を止めてユーザーに提示する**

> ⚠️ **この節は実際の事故を受けて追加された（2026-08-09）。**
> PR-I（#237）で、Issue #231 が挙げた「新作枠の大手判定ゲートの精度を上げる」という方針を
> そのまま実装しかけた。実際には仕様書 §1.1・§2.2 と決着ブロック 論点A（2026-07-29、
> §11.1 確定事項 #1）で**新作枠の企業規模ゲートは撤廃が決定済み**であり、Issue の方針は
> **決着で棄却された A-3 に相当**していた。ユーザーの指摘で初めて発覚した。
> 放置すれば、Steam Top Sellers 1 位のタイトルがどの枠にも載らない状態のままマージされていた。
> **「Issue に書いてあるから」は着手の根拠にならない。**

## Issue が挙げた「実例」も検証対象（症状 ≠ 原因）

**Issue が症状の実例を挙げていても、それがその Issue の原因の証拠とは限らない。**
実例を単独で追跡（そのデータがどこから来たかをエンドツーエンドで確認）してから着手すること。

手順:

1. 実例のデータを**一次ソースで照合**する（Steam API / IGDB を実際に叩く、記事の全フィールドを読む）
2. 「Issue が主張する原因」以外の説明が成り立たないかを確認する
3. **その実例が検出されなかった理由**も追う（検証機構が動いたのに見逃したのか、そもそも動かなかったのか）

> ⚠️ **この節は実際の事故を受けて追加された（2026-08-12。PR #299 / Issue #298）。**
> Issue #284 は `個人開発（Petroglyph）`（`issues-dev/issue-019.md`）を
> 「`isQualifiedCompanyName` が中小社名を誤判定した実例」として挙げていた。
> しかし Steam Storefront API を実際に叩くと **appid 32470 = `STAR WARS™ Empire at War - Gold Pack`
> / `developers=['Petroglyph']` / 2010年5月25日** で、記事の開発元・発売日・スクリーンショット5枚は
> **すべてこの別作品と整合**していた（タイトルと本文だけが Cyberpunk 2077）。
> つまり **`Petroglyph` は誤判定ではなく別作品の正しい開発元**で、実例は
> **別作品メタデータの混入**（→ **Issue #297**）だった。
> さらに、それが検出されなかった理由は同一性照合が `sourceUrls.steam` を持たない記事で
> **丸ごとスキップされる**ため（→ **Issue #296**。公開19号で 88記事中49件・55.7%）だった。
> **1つの Issue の実例を追跡して、その Issue とは別の2つの欠陥が見つかった。**
> ラベルを直しても、この実例の誤情報は消えない。

## 自前の検証機構が出している警告を先に読む

着手前に、対象の症状について **Validation Report / LLM-as-a-judge が既に警告を出していないか**を
`data/validation*/` で確認すること。既に検出されているなら、原因究明の一次資料になる。

> Issue #298 の実例は、**LLM-as-a-judge が severity=high / 確信度95% で
> 「明確な誤情報」と判定していた**（`data/validation-dev/validation-report-019.json` の
> `llmJudge.warnings[6]`）。**自前の事実性チェックが誤情報と断じる出力を、自前のパイプラインが
> 生成していた**が、その警告は運用に反映されていなかった（→ **Issue #156**）。

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

⚠️ **PR-I（#237）で `indie-classifier.ts` / `fetch-igdb.ts` / `fetch-data.ts` の行番号が大きくずれ、
`computeIndieScore` が削除された。** マージ後の実測値（2026-08-09。`7a2a0da`）:

| シンボル | PR-I 前 | PR-I マージ後 |
|---|---|---|
| `LARGE_DEVELOPERS` / `MAJOR_PUBLISHER_SUBSIDIARIES`（`indie-classifier.ts`） | :9 / :71 | :9 / :71（不変） |
| `isLargeStudio`（`indie-classifier.ts`。第2引数 `developedCount` が追加） | :169 | **:203** |
| `pickDeveloperGameCount`（PR-I で新設） | — | **`indie-classifier.ts:277`** |
| `isIndieGame`（`indie-classifier.ts`） | :218 | **:296** |
| `pickSteamUrlFromWebsites`（PR-I で新設） | — | **`fetch-igdb.ts:331`** |
| `IGDB_GAME_FIELDS`（`fetch-igdb.ts`） | :346 | **:375** |
| 3 母集団クエリ（`fetch-igdb.ts`） | :661 / :771 / :875 | **:692 / :810 / :922** |
| `aggregateGames`（`fetch-data.ts`。PR-I で export 化） | :167 | **:175** |
| `deduplicateGames`（`fetch-data.ts`） | :557 | **:575** |
| `buildNewReleaseCandidates`（`fetch-data.ts`） | :938 | **:967** |
| `isWithinIndieReleaseWindow`（PR-I で新設） | — | **`fetch-data.ts:1037`** |
| `compareIndieCandidates`（PR-I で新設。`computeIndieScore` を置換） | — | **`fetch-data.ts:1063`** |
| `buildIndieCandidates`（`fetch-data.ts`） | :990 | **:1092** |
| `buildClassicCandidates`（`fetch-data.ts`） | :1012 | **:1115** |
| `GameData` 型（`types.ts`） | :92 | **:94** |
| ~~`computeIndieScore`~~ | `fetch-data.ts:975` | **削除**（§3.6 で棄却された旧スコア） |

⚠️ **#241 対応（#243）で `fetch-igdb.ts` の母集団クエリ周辺が大きく変わった。**
マージ後の実測値（2026-08-09。`31770bc`）:

| シンボル | #241 前 | #241 マージ後 |
|---|---|---|
| `getJstDayStartUnixSec`（新設） | — | **`fetch-igdb.ts:471`** |
| `IGDB_POOL_QUERY_FIELDS` / `mapPoolRawGameToIGDBGame`（新設。5 クエリで共有） | — | **`fetch-igdb.ts` の母集団クエリ群の直前** |
| `fetchRecentPopularGames`（発売済み・hypes 版） | :692 | **:821** |
| `fetchRecentPopularGamesByRatingCount`（新設。発売済み・票数版） | — | **:866** |
| `fetchUpcomingGames`（新設。未発売） | — | **:909** |
| `fetchClassicGames` | :810 | **:941** |
| `fetchIndieGames` | :922 | **:971** |
| `fetchIGDBData`（5 クエリを並列取得） | :982 付近 | **:1005** |

⚠️ **さらに #234 対応（#246）で `fetch-igdb.ts` の行番号がずれた。ずれ幅は一様ではない。**
`IGDB_WEBSITE_TYPE` 定数を追加したうえ、`pickOfficialUrlFromWebsites` /
`pickSteamUrlFromWebsites` の JSDoc も伸びたため、**上部（この 2 関数）で +24〜26、
`mapRawGameToIGDBGame` 以降で +28、`IGDB_POOL_QUERY_FIELDS` 以降で +29** と段階的に増える。
**一律のオフセットを当てると 4〜6 行ずれる。** マージ後の実測値（2026-08-09。`bd71e4f`）:

| シンボル | #241 マージ後 | #234 マージ後 |
|---|---|---|
| `IGDB_WEBSITE_TYPE`（新設。OFFICIAL=1 / STEAM=13） | — | **`fetch-igdb.ts:309`** |
| `pickOfficialUrlFromWebsites` | :306 | **:330** |
| `pickSteamUrlFromWebsites` | :332 | **:358** |
| `mapRawGameToIGDBGame` | :392 | **:420** |
| `getJstDayStartUnixSec` | :471 | **:499** |
| `IGDB_POOL_QUERY_FIELDS`（#241 で新設） | :709 | **:738** |
| `mapPoolRawGameToIGDBGame`（#241 で新設） | :754 | **:783** |
| `fetchRecentPopularGames`（発売済み・hypes 版） | :821 | **:850** |
| `fetchRecentPopularGamesByRatingCount`（発売済み・票数版） | :866 | **:895** |
| `fetchUpcomingGames`（未発売） | :909 | **:938** |
| `fetchClassicGames` | :941 | **:970** |
| `fetchIndieGames` | :971 | **:1000** |
| `fetchIGDBData`（5 クエリを並列取得） | :1005 | **:1034** |
| ~~`fetchGameImageAndUrl`~~ | :1119 | **削除**（#246。上記「レビューで確認されクリアだった点」を参照） |

**母集団クエリは 3 本 → 5 本になった。** 「3 つの母集団クエリ」という記述が本ファイル中に複数残っているが、
**現在は 5 本**である（発売済み 2 + 未発売 1 + 名作 1 + インディー 1）。`fields` と mapper は
`IGDB_POOL_QUERY_FIELDS` / `mapPoolRawGameToIGDBGame` に一元化済みなので、
**フィールドを足すときは定数 1 箇所を直せば 5 本すべてに反映される**（テストで担保）。

⚠️ **さらに PR-B2（#249）で `game-filter.ts` / `select-newreleases-with-fallback.ts` / `fetch-data.ts` /
`newrelease-score.ts` / `fetch-igdb.ts` の行番号がずれた。ずれ幅は一様ではない。**
マージ後の実測値（2026-08-09。`2f5da86` → `0a304eb`）:

| シンボル（ファイル） | PR-B2 前 | PR-B2 マージ後 | ずれ |
|---|---|---|---|
| `QUALITY_IGDB_RC_MIN`（`game-filter.ts`） | :9 | :9 | 0 |
| `QUALITY_CRITIC_COUNT_MIN`（`game-filter.ts`。本PRで新設） | — | :16 | 新設 |
| `isQualifiedGame`（`game-filter.ts`） | :20 | :37 | +17 |
| `hasExistenceEvidence`（`select-newreleases-with-fallback.ts`） | :19 | :22 | +3 |
| `buildNewReleaseCandidates`（`fetch-data.ts`） | :968 | :971 | +3 |
| `sortByNewReleaseScore` 呼び出し（`fetch-data.ts`） | :983 | :996 | +13 |
| `buildIndieCandidates`（`fetch-data.ts`） | :1093 | :1109 | +16 |
| `buildClassicCandidates`（`fetch-data.ts`） | :1116 | :1132 | +16 |
| `selectGamesForArticles`（`fetch-data.ts`） | :1140 | :1156 | +16 |
| `toPersistableSelectedGames`（`fetch-data.ts`。本PRで新設） | — | :1328 | 新設 |
| `loadNewReleaseScoreParams`（`newrelease-score.ts`） | :78 | :86 | +8 |
| `computeSteamAxis`（`newrelease-score.ts`） | :145 | :154 | +9 |
| `computeDomesticAxis`（`newrelease-score.ts`。本PRで新設） | — | :172 | 新設 |
| `computeNewReleaseScore`（`newrelease-score.ts`） | :159 | :182 | +23 |
| `sortByNewReleaseScore`（`newrelease-score.ts`） | :192 | :222 | +30 |
| `IGDB_WEBSITE_TYPE`（`fetch-igdb.ts`） | :309 | :309 | 0 |
| `IGDB_POOL_QUERY_FIELDS`（`fetch-igdb.ts`） | :738 | :738 | 0 |
| `mapPoolRawGameToIGDBGame`（`fetch-igdb.ts`） | :783 | :783 | 0 |
| `fetchRecentPopularGames`（`fetch-igdb.ts`） | :850 | :850 | 0 |
| `fetchRecentPopularGamesByRatingCount`（`fetch-igdb.ts`） | :895 | :895 | 0 |
| `fetchUpcomingGames`（`fetch-igdb.ts`） | :938 | :951 | +13 |
| `fetchClassicGames`（`fetch-igdb.ts`） | :970 | :985 | +15 |
| `fetchIndieGames`（`fetch-igdb.ts`） | :1000 | :1015 | +15 |
| `fetchIGDBData`（`fetch-igdb.ts`） | :1034 | :1049 | +15 |

**特筆すべき点**: 同一ファイル `fetch-igdb.ts` の中でもずれ幅が **0 / 0 / +13 / +15** と段階的に変わっている
（変更を入れたのが `fetchUpcomingGames` だけのため、それより前は 0、それ以降が +13〜+15）。
`newrelease-score.ts` は +8 / +9 / +23 / +30 と後ろほど大きい。**一律のオフセットを当てると数行〜数十行ずれる。**

新設ファイル `scripts/fetch-amazon-ranking.ts` の主要シンボル（新規なので「ずれ」ではなく初出の位置として別記）:
`AMAZON_RANKING_SLOT_COUNT` :17 / `isNonGameProduct` :63 / `normalizeAmazonProductTitle` :94 /
`buildAmazonRankIndex` :164 / `fetchAmazonRanking` :228

⚠️ **さらに名作枠PR（#254）で `fetch-igdb.ts` / `fetch-data.ts` / `types.ts` / `fetch-web-search.ts` の行番号がずれ、
`scripts/classic-pool.ts` が新設された。ずれ幅は一様ではない。** マージ後の実測値（2026-08-09。`434e660` → `0a2b025`）:

| シンボル（ファイル） | 名作枠PR 前 | 名作枠PR マージ後 | ずれ |
|---|---|---|---|
| `IGDB_GAME_FIELDS`（`fetch-igdb.ts`） | :404 | :411 | +7 |
| `mapRawGameToIGDBGame`（`fetch-igdb.ts`） | :420 | :475 | +55 |
| `IGDB_WEBSITE_TYPE`（`fetch-igdb.ts`） | :309 | :310 | +1 |
| `computeClassicRemakeEligible`（`fetch-igdb.ts`。本PRで新設） | — | :455 | 新設 |
| `IGDB_POOL_QUERY_FIELDS`（`fetch-igdb.ts`） | :738 | :796 | +58 |
| `mapPoolRawGameToIGDBGame`（`fetch-igdb.ts`） | :783 | :849 | +66 |
| `fetchRecentPopularGames`（`fetch-igdb.ts`） | :850 | :919 | +69 |
| `fetchRecentPopularGamesByRatingCount`（`fetch-igdb.ts`） | :895 | :964 | +69 |
| `fetchUpcomingGames`（`fetch-igdb.ts`） | :951 | :1020 | +69 |
| `fetchClassicGames`（`fetch-igdb.ts`） | :985 | :1077 | +92 |
| `fetchIndieGames`（`fetch-igdb.ts`） | :1015 | :1116 | +101 |
| `fetchIGDBData`（`fetch-igdb.ts`） | :1049 | :1150 | +101 |
| `buildNewReleaseCandidates`（`fetch-data.ts`） | :971 | :984 | +13 |
| `isRemakeOrRemaster`（`fetch-data.ts`） | :1013 | :1037 | +24 |
| `isClassicRemakeAllowed`（`fetch-data.ts`。本PRで新設） | — | :1055 | 新設 |
| `isClassicPoolGameType`（`fetch-data.ts`。本PRで新設。`/code-review` 対応） | — | :1078 | 新設 |
| `buildIndieCandidates`（`fetch-data.ts`） | :1109 | :1173 | +64 |
| `buildClassicCandidates`（`fetch-data.ts`） | :1132 | :1226 | +94 |
| `selectGamesForArticles`（`fetch-data.ts`） | :1156 | :1245 | +89 |
| `toPersistableSelectedGames`（`fetch-data.ts`） | :1328 | :1417 | +89 |
| `IGDBGame` 型（`types.ts`） | :42 | :42 | 0 |
| `GameData` 型（`types.ts`） | :94 | :111 | +17 |
| `PromptTemplates.classicSystem`（`bedrock-client.ts`） | :306 | :306 | 0（文字列内部のみ変更） |
| `searchGameHistory`（`fetch-web-search.ts`） | :130 | :133 | +3 |
| `searchGameInfo`（`fetch-web-search.ts`） | :141 | :149 | +8 |
| `generateClassicArticle`（`generate-articles.ts`） | :1035 | :1035 | 0 |
| `finalizeGameMetadata`（`finalize-game-metadata.ts`） | :39 | :39 | 0 |

**特筆すべき点**: `fetch-igdb.ts` 内で `mapRawGameToIGDBGame` 以降は +55〜+58、母集団クエリ群は +66〜+101 と**後ろほど大きい**。
`fetch-data.ts` の `isRemakeOrRemaster`（+24）は直前の `buildNewReleaseCandidates`（+13）より大きくずれており、
**同じファイル内でも隣接シンボル間でずれ幅が単調ではない。**

新設ファイル `scripts/classic-pool.ts` の主要シンボル（新規なので「ずれ」ではなく初出の位置として別記）:
`DEFAULT_CLASSIC_TOTAL_RATING_MIN` :10 / `DEFAULT_CLASSIC_TOTAL_RATING_COUNT_MIN` :13 /
`readClassicTotalRatingMin` :35 / `readClassicTotalRatingCountMin` :50 / `meetsClassicPoolThresholds` :60。

⚠️ **更新したのは後続PR（PR-B / PR-B2 / PR-I / 名作枠PR）が参照する行番号と PR-0.5 の「実施結果」節だけ**で、
**PR-0 / PR-0.5 の「当初の指示」節および PR-0 の「実施結果」節の行番号は記載時点のまま**
（例: `:124` の `searchGameByName:486` は現在 `:498`、`:172` の `:490` は現在 `:502`、
`:187` の `__test :409` は現在 `:421`、`:451` の呼び出し元 `:512/:656/:751/:849` は現在
`:524/:668/:763/:861`）。これらは**歴史的記録として残してある**ので、
そのまま使わず必ず grep で引き直すこと。

⚠️ **さらに PR #258（Issue #253。マージ `0af2a36`）で `game-filter.ts` / `fetch-data.ts` / `types.ts` の行番号がずれ、
`fetch-metacritic.ts` は全削除（260行）された。** `metascore`/`steamPlayers` 経路の削除に伴う純減で、
新設シンボルは無い。マージ後の実測値（2026-08-10。`5c9e9b4^` → `0af2a36`）:

| シンボル（ファイル） | PR #258 前 | PR #258 マージ後 | ずれ |
|---|---|---|---|
| `QUALITY_IGDB_RC_MIN`（`game-filter.ts`） | :9 | :9 | 0 |
| `QUALITY_IGDB_RATING_STRONG`（`game-filter.ts`） | :11 | :11 | 0 |
| `QUALITY_IGDB_RC_FLOOR`（`game-filter.ts`） | :13 | :13 | 0 |
| `QUALITY_CRITIC_COUNT_MIN`（`game-filter.ts`） | :16 | :16 | 0 |
| `isQualifiedGame`（`game-filter.ts`） | :37 | :36 | −1 |
| `aggregateGames`（`fetch-data.ts`） | :180 | :178 | −2 |
| `deduplicateGames`（`fetch-data.ts`） | :586 | :540 | −46 |
| `buildClassicCandidates`（`fetch-data.ts`） | :1226 | :1177 | −49 |
| `selectGamesForArticles`（`fetch-data.ts`） | :1245 | :1196 | −49 |
| `GameData` 型（`types.ts`） | :111 | :96 | −15 |
| ~~`fetch-metacritic.ts`~~（ファイル全体） | 260行 | **削除**（ファイル自体が存在しない） | — |

**特筆すべき点**: `game-filter.ts` の定数群（`QUALITY_*`）は削除箇所より前にあるためずれが 0 だが、
`isQualifiedGame` 本体は削除した2経路分のコード（コメント含む）が詰まって −1。
`fetch-data.ts` は `metascore` の転記・並び順スコア参照・`fetchMetacriticData` の呼び出しが
ファイル全体に分散していたため、後ろのシンボルほど大きく詰まっている（−2 → −46 → −49 → −49）。
**`fetch-metacritic.ts` を参照する過去の行番号（例: `fetchMetacriticData` の位置）はすべて無効**——
ファイルごと削除されたため、ファイル名自体が存在しない。

⚠️ **さらに PR #313（Issue #307 / PR-E。マージ `dd8e8e9`）で `fetch-web-search.ts` の行番号がずれた。**
JSDoc を大幅に追記したため、**`formatSearchResultsForPrompt` より後ろが一律 +41〜+45** ずれる。
それ以前（`searchGameInfo` まで）は 0。マージ後の実測値（2026-08-13。`49d5252^` → `dd8e8e9`）:

| シンボル（ファイル） | PR #313 前 | PR #313 後 | ずれ |
|---|---|---|---|
| `searchGameInfo`（`fetch-web-search.ts`） | :149 | :149 | 0 |
| `sanitizeWebContent`（`fetch-web-search.ts`） | :201 | :201 | 0 |
| `DEFAULT_SEARCH_CONTENT_MAX_LENGTH`（本PRで新設） | — | **:226** | 新設 |
| `readSearchContentMaxLength`（本PRで新設） | — | **:240** | 新設 |
| `formatSearchResultsForPrompt` | :212 | **:257** | **+45** |
| `flattenSearchResults` | :278 | **:319** | +41 |
| `isTavilyAvailable` | :304 | **:346** | +42 |
| `OFFICIAL_PAGE_MAX_LENGTH` | :309 | **:351** | +42 |
| ~~`SNIPPET_MAX_LENGTH`~~ | :273 | **削除**（`readSearchContentMaxLength()` に置換） | — |
| `getReleaseStatus`（`bedrock-client.ts`） | :99 | :99 | 0 |
| `WebSearchSource`（`generate-articles.ts`） | :109 | :109 | 0 |

**`generate-articles.ts` はコメントを3行に分けたため `:112` 以降が +3 ずれた**（型定義そのものの位置 `:109` は不変）。
`_releaseStatus` は :197 → **:200**。

**PR-C（#309）が着手時に引き直すべき現在位置**（2026-08-13。`dd8e8e9` 時点の実測）:

| シンボル | 位置 |
|---|---|
| `getReleaseStatus`（2値・UTC解釈のまま） | `bedrock-client.ts:99` |
| `PromptTemplates.newReleaseSystem` / `indieSystem` / `classicSystem` | `bedrock-client.ts:123` / `:189` / `:306` |
| `getReleaseStatus` の呼び出し元3箇所 | `bedrock-client.ts:451`（【ゲーム情報】欄）/ `generate-articles.ts:200` / `validate-article.ts:825`（見出しの未発売表現バリデータ） |
| `formatSearchResultsForPrompt` の呼び出し元6箇所 | `generate-articles.ts:368` / `:476` / `:847` / `:908` / `:1048` / `:1143` |
| カテゴリ別の検索セット（§2.6 の分岐対象） | `fetch-web-search.ts:163-192` の `switch (category)` |

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
  → **#234 対応（PR #246）で削除済み。** 死んでいただけでなく、**#117 で廃止したはずの
  ブロックリスト方式フォールバック**（非SNS・非ストアの先頭URLを機械採用＝`theminesa.studio`
  事故の原因）を保持したままだった。`category` が返らなくなった以降は、復活させれば
  必ずこの欠陥経路を通る状態だった。**「死んでいるから無害」と判断した当時の評価は不十分**で、
  死んだコードが**廃止済みの設計を温存する**リスクを見落としていた

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

  ⚠️ **その後 PR #294 / Issue #289 で `featured` 自体を廃止したため、この4箇所目は消滅した（現在は3箇所）**（2026-08-12）。

  なお `isAlreadySelected` の JSDoc（`fetch-data.ts`）は同時期に「2箇所」と書き換えられているが、**この2つの数字は矛盾していない。数えている対象が違う**:

  - 上記リストの「3箇所」= **論理的な除外関係**（indie←newReleases / classic←newReleases / classic←indies）
  - JSDoc の「2箇所」= **`isAlreadySelected()` の呼び出し箇所**（`buildIndieCandidates` / `buildClassicCandidates`）

  classic 側は1回の呼び出しで `[...newReleases, ...indies]` を渡すため、除外関係2つが呼び出し1箇所に対応する。

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
- **特集枠への除外フィルタ適用は別Issue** → **#232**（選定経路が `generate-articles.ts` 側にあり調査が要る） → ✅ **完了**（2026-08-12。PR #288）。**この当時の見立て（`generate-articles.ts` 側）が正しかった**
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

## 実施結果（2026-08-09）

**PR #249。マージコミット `0a304eb`（squash）。コミット 2 本（実装 → レビュー対応）。**
Issue #238 / #244 の両方を Closes でクローズした。実装は Sonnet に委譲し、diff を管理者が検証した。
**ブランチ名は当初案の `feat/domestic-sales-axis` ではなく `feat/issue-238-domestic-sales-axis` を使った。**

### 0. 触った関数（一覧）

| 関数・ファイル | 変更 |
|---|---|
| `fetchAmazonRanking` ほか（`fetch-amazon-ranking.ts`。**新設**） | ランキング取得・ノイズ除去・照合索引の構築 |
| `computeDomesticAxis` / `computeNewReleaseScore` / `sortByNewReleaseScore`（`newrelease-score.ts`） | 第 4 軸 domestic を追加（3 軸 → 4 軸） |
| `isQualifiedGame`（`game-filter.ts`） | 批評媒体数 2 以上 / Amazon 掲載の 2 経路を追加（分岐 5 → 7） |
| `hasExistenceEvidence`（`select-newreleases-with-fallback.ts`） | **Amazon 経路を追加。**⚠️ 品質条件だけ通しても実存フィルタで落ちる構造（Steam 非掲載・IGDB 票数 5 未満の国内専用タイトル）が残るため。**§2.4 の「カバー画像がある／開発元が判明している」とは別レイヤーの短絡**である点に注意 |
| `buildNewReleaseCandidates` / `selectGamesForArticles` / `toPersistableSelectedGames`（`fetch-data.ts`） | 索引の配線と、書き出し対象からの reserves 除外 |
| `fetchUpcomingGames`（`fetch-igdb.ts`） | `game_type` を `(0,8,9)` に緩和（#244） |

⚠️ **`isQualifiedGame` には §2.3 に規定が無い経路が 3 つ残っている**（本PRでは削除しない）: `metascore`（削除は PR-D 担当）/ **`steamPlayers > 0`**（§2.3 が挙げるのは Top Sellers であって Top Played ではない。**担当 PR が未割り当て**）/ `igdbRating >= 85 && rc >= 8` の救済。

### 1. 照合方式の決着（§9.2-4）— 当初想定と違った

- **IGDB の `alternative_names` は日本語照合に使えない。** 実測: 発売済み 60 日窓の母集団 17 件のうち
  CJK の別名を持つのは 3 件で、**すべて中国語**（Palworld=幻兽帕鲁 / Rhythm Heaven Groove=節奏天國 奇蹟之星 /
  Unrailed 2=一起开火车2）。『Splatoon Raiders』の別名は "Splatoon RAIDERS"（stylized）のみ
- 代わりに**既に取得済みの `GameData.titleJa`**（IGDB `game_localizations` の `region === 3`）を照合キーに
  使った。母集団クエリのフィールド（`IGDB_POOL_QUERY_FIELDS`）に既に含まれており、`deduplicateGames` を
  含む集約経路すべてで転記されていることを確認済み
- 『Splatoon Raiders』は region=3 に**「スプラトゥーン レイダース」**を持つ
- 60 日窓の母集団での `titleJa` 保有率は **6/17**。ただし Amazon 上位に載る国内タイトルはほぼ保有していた
  （リズム天国 / トモダチコレクション / ビースト オブ リンカネーション / プラグマタ / マーベル・闘魂 / エルデンリング等）
- **誤照合ガード**: 索引側と `GameData` の発売日の差が **365 日超**なら不一致とする。実測で正しい 6 ペアの差は
  すべて **0〜1 日**（DL 版とパッケージ版の差）だった

### 2. ノイズ除去の実測（2026-08-09。仕様書 §2.3 の 2026-08-07 実測から変動）

- 非ゲーム商品は **9 件**（§2.3 記載の実測は 7 件）。1 位がニンテンドープリペイド番号なのは同じ
- 「スプラトゥーン レイダース」は **4 位（オンラインコード版）と 6 位（-Switch2）** に重複掲載
  （§2.3 記載は 5 位と 6 位）
- **`categoryName` はノイズ判定に使えない。** 実測で 5 種混在（ゲームソフト 38 / ダウンロード版ソフト/
  コンテンツ 5 / ジャンル別 3 / PCゲーム 2 / ハンドル・ジョイスティック 2）で、**1 位のプリペイド番号が
  `categoryName=ゲームソフト`**、逆に**本命の 4 位が `ダウンロード版ソフト/コンテンツ`**。判定はタイトル
  ベースにした
- 仕様書が挙げていない非ゲーム類型を実測で追加発見: **アップグレードパス / エキスパンションパス**
  （『ぽこ あ ポケモン エキスパンションパス』5 位、『ゼノブレイド2 …アップグレードパス』33 位）。さらに
  別スナップショットでは **Game Pass Ultimate のサブスク商品**と**ガラスフィルム（保護フィルム）**も
  混入していた。キーワード方式は本質的にスナップショット依存であり網羅は保証できない。ただし本実装は
  「母集団のゲーム側から索引を引く」方向なので、除去漏れの非ゲーム商品は索引に残るだけで実害が出ない
  （fail-closed）
- ⚠️ **ランキングは 1 時間単位のスナップショット**（`countingStartDate` / `countingEndDate` が 1 時間窓）。
  **実行のたびに順位が変わり、選定結果は run 間で再現しない。**検証中にも、ある取得では未掲載だった
  『ほの暮しの庭』が次の取得では 18 位に入った

### 3. ライセンス制約への対応（§2.3）

- 順位は `AmazonRankIndex` を**引数で渡すことだけ**で流通させ、`GameData` には載せない
- ⚠️ **レビューで、順位が並び順から漏れる経路が 2 つ見つかった**（当初の grep によるフィールド名検査では
  検出できなかった）:
  - `SelectedGames.newReleasesReserves` は 4 軸スコア降順の配列で、`JSON.stringify(selectedGames)` により
    `data/selected-games.json`（Git 追跡下）にそのまま書き出されていた。**他 3 軸は `GameData` に永続化済み
    で再計算できるため、domestic が topAxis のゲームは配列内の位置から Amazon 順位が数ランクの幅に絞り込める。**
    → 書き出し対象から `newReleasesReserves` を除外した（`toPersistableSelectedGames`）。`generate-articles.ts`
    は reserves を読み込むだけで一度も参照していないため機能的影響なし。`indieReserves` はインディー枠に
    `amazonRanks` を渡していないため残した
  - 候補ログをスコア降順で出力すると、マスクした行が前後の実数値行に挟まれ、domestic 軸の素点が 2 点刻み
    （`100 − 2×(順位−1)`）であることと合わせて順位が特定できた。→ **ログ出力のみタイトル昇順**に変更
    （選定に使う配列の順序は不変）
- **残る既知の漏れ（許容）**: 採用済み `newReleases`（2 件）の配列順序もスコア降順。要素が 2 つなので順位
  そのものは特定できず両者の大小関係が分かるだけで、記事生成に必須のため除去できない

### 4. 実データでの効果（DEV_MODE 実行）

| 枠 | 変更前 | 変更後 |
|---|---|---|
| 新作枠 候補 | 20 件 | 27 件 |
| 新作枠 採用 | ほの暮しの庭 / Big Walk | ほの暮しの庭 / Rhythm Heaven Groove |
| インディー枠 候補 | 15 件 | 21 件 |
| インディー枠 採用 | Palworld / Scrap Mechanic | 変化なし |
| 名作枠 採用 | Splatoon Raiders | 変化なし |
| 特集枠 | GTA V レガシー | 変化なし |

Amazon 経路で新たに候補入りした国内タイトル: Splatoon Raiders / Rhythm Heaven Groove /
Fire Emblem: Fortune's Weave / Onimusha: Way of the Sword / Star Fox。

### 5. ⚠️ 受け入れ条件のうち 2 件が未達

- **『Splatoon Raiders』は候補には入ったが採用されなかった**（27 件中 4 位。枠は 2 つ）。ほの暮しの庭
  （Steam 1 位 = 100 点）と Rhythm Heaven Groove（Amazon 2 位 = 98 点）に次ぐ。**構造的欠陥（全経路が
  外れて候補にすら入らない）は解消したが、採用は競争結果に依存する。**重みの再調整は Issue #210 の担当
  なので本PRでは触っていない
- **名作枠には引き続き載っている。** `buildClassicCandidates` が `igdbRating >= 85` だけで通すため評価母数
  7 件の本作を拾う。選定側を評価母数ベースに変えるのは名作枠 PR の担当（§8 の 8 行目）

### 6. ⚠️ #244 の受け入れ条件は実データで再現しなかった（着手前検証で発覚）

- `game_type` を `(0)` → `(0,8,9)` に緩めても **`Rayman Legends Retold` は母集団に入らない**
- 実測: where 句合致は **33 件 → 34 件**に増えるが、`sort first_release_date asc; limit 20` の**先頭 20 件は
  緩和前後で完全に同一**。20 番目が `Aniimo`（2026-09-30）、21 番目が `Neverway`（2026-10-01）で切れる。
  **`Rayman Legends Retold` は 34 件中 23 番目**（game_type=8 / hypes=48 / 発売 2026-10-01 で 90 日窓の内側）
- **本作を落としているのは `game_type` フィルタではなく `limit 20` と発売日昇順ソート。**§2.4 の緩和自体は
  §6.2 との仕様矛盾を解消する正しい修正だが、**観測可能な効果は今日のデータではゼロ**
- ユーザー判断により「仕様整合の修正のみ入れる」で確定。limit の問題は **#250** に分離

### 7. レビュー指摘の採否（6 件）

| 指摘 | 採否 | 根拠 |
|---|---|---|
| 順位のマスクが並び順で無効化される（**1 件の指摘だが経路は 2 つ**: ①`newReleasesReserves` のスコア降順 ②候補ログのスコア降順） | 本PRで修正（両経路とも） | 上記 3。**本PRが持ち込んだ、PR自身の主張に反する欠陥。**①は `selected-games.json` への書き出しから除外、②はログ出力をタイトル昇順に変更 |
| `lookup` のガードが英語タイトルへのフォールバックを潰す | 本PRで修正 | `titleJa` がガードで弾かれると `title` を引かずに `undefined` を返していた |
| `isNonGameProduct` が NFKC 正規化していない | 本PRで修正 | 実データでは半角カタカナ 0 件・全角ラテン文字 0 件で実害なし。同一ファイル内の不整合解消として予防的に対応 |
| 全角 `｜` / `- PlayStation 5` 接尾辞 | 一部採用 | 全角 `｜` は実データ 0 件だが 1 行で対応できるため修正。**`PLATFORM_SUFFIX_RE` の拡張は見送り**（`- PlayStation 5` 等はライブデータに存在せず、唯一の `Xbox Series X\|S` は非ゲームのサブスク商品。投機的な拡張はしない） |
| 批評経路が全枠に波及し評点のしきい値が無い | #251 に分離 | 「全枠に波及」は事実だが、懸念された「2 媒体で低評価」は**実データ 0 件**。批評経路だけで通るのは母集団 146 件中 **8 件**で評点は 74 / 76 / 79 / 81 / 82 / 84 / 84 / 87（媒体数 2〜4）。`isQualifiedGame` の通過数は 67/146（経路を外すと 59/146）。§2.3 は媒体数のみを規定しており評点しきい値の追加は仕様変更 |
| `limit 20` でリメイクが Main Game を押し出す | #250 に分離 | 構造的指摘として正しいが、§6.2 は新作紹介でリメイクを許可しているため押し出し自体は意図した挙動。真の問題は `limit 20` による打ち切り |

### 8. 教訓（次回以降）

- **ライセンス制約の検証を「フィールド名の grep」だけで済ませてはいけない。** 並び順・配列の順序といった
  **導出チャネル**から値が漏れる。永続化されるオブジェクト全体を、どのフィールドが何から計算されているか
  まで遡って確認すること
- **`data/` の測定値は復元より先に読む。** 本作業でも 1 度、測定前に `git checkout -- data/` してしまい
  測り直した
- **`scripts/fetch-data.ts` はモジュール読み込み時に `main()` が走る。** テスト以外から `import` すると
  全パイプラインが起動するので、オフライン測定スクリプトから読み込んではいけない

---

  PR-C（未発売記事の分岐・3値化）

  【共通ヘッダ】

# PR-C: 未発売記事の構成分岐 + 発売状態の3値化とJST統一

- ブランチ: `fix/issue-309-unreleased-article-branching`（当初案は `feat/unreleased-article-branching`。→ **Issue #309**）
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

> ✅ **実装完了・レビュー対応済み（2026-08-09）。PR #254（マージ `0a2b025`）。** 以下は当初の指示だが、
> 実装時に決着ブロックの前提が変わった点（`parent_game` 展開）があるため、**「実施結果」節を必ず読むこと。**

- ブランチ: `feat/issue-classic-slot-population`（**当初案の `feat/classic-slot-redesign` から変更**）
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

## 実施結果（2026-08-09）

**PR #254。マージコミット `0a2b025`（merge commit）。コミット 2 本（実装 → `/code-review` 対応）。**
Issue #238 を `Refs` で参照した（#238 自体は PR #249 でクローズ済みで、本 PR は名作枠側の残タスク）。
実装は Sonnet に委譲し、diff を管理者が検証した。
**ブランチ名は当初案の `feat/classic-slot-redesign` ではなく `feat/issue-classic-slot-population` を使った。**

### 0. 触った関数（一覧）

| 関数・ファイル | 変更 |
|---|---|
| `classic-pool.ts`（**新設**） | `meetsClassicPoolThresholds` / `readClassicTotalRatingMin` / `readClassicTotalRatingCountMin`。母集団の数値条件をクエリ側・選定側で共有 |
| `computeClassicRemakeEligible`（`fetch-igdb.ts`。**新設**） | J-3-e 判定。**親の `game_type`/`total_rating`/`total_rating_count` を展開フィールドだけで自己完結的に判定**（後述） |
| `mapRawGameToIGDBGame` / `mapPoolRawGameToIGDBGame`（`fetch-igdb.ts`） | `totalRating` / `totalRatingCount` / `classicRemakeEligible` を転記 |
| `fetchClassicGames`（`fetch-igdb.ts`） | `where`/`sort`/`limit` を全面書き換え（`hypes > 100` 廃止 → §5.4 の条件）+ J-3-e 後段フィルタ |
| `isClassicRemakeAllowed`（`fetch-data.ts`。**新設**） | J-3-e ベースのリメイク許可判定。`isRemakeOrRemaster` の一律除外を置き換え（インディー枠は `isRemakeOrRemaster` を継続使用） |
| `isClassicPoolGameType`（`fetch-data.ts`。**新設。`/code-review` 対応で追加**） | 選定側の `game_type` ゲート（0/8/9 のみ許可）。下記「レビュー指摘」参照 |
| `buildClassicCandidates`（`fetch-data.ts`） | `metascore`/`igdbRating`/Steam・YouTube 人気条件を廃止し `meetsClassicPoolThresholds` に一本化。並び順を `totalRatingCount` 降順に変更 |
| `enrichGameFromIgdb` / `aggregateGames`（2ブランチ） / `deduplicateGames`（`fetch-data.ts`）、`finalizeGameMetadata`（`finalize-game-metadata.ts`） | `totalRating` / `totalRatingCount` / `classicRemakeEligible` の転記（**6 箇所すべて**。`??` 演算子で統一） |
| `IGDBGame` / `GameData`（`types.ts`） | 上記 3 フィールドを追加 |
| `PromptTemplates.classicSystem`（`bedrock-client.ts`） | 禁止リストの重複項目を削除 + 📜 の指示を強化（§5.6 修正1） |
| `searchGameHistory` / `searchGameInfo`（`fetch-web-search.ts`） | 発売年を省略可能な引数として追加（§5.6 修正3。他カテゴリの挙動は不変） |
| `generateClassicArticle`（`generate-articles.ts`） | `releaseDate` から発売年を抽出して渡す |

### 1. 決着ブロックの前提が実装で変わった点 — `parent_game` の展開

論点J-3 の決着（`spec-review.md:1749`）は「`game_type=0` の ID 集合を作り、`t8/t9` の `parent_game` がその集合に無いものだけを残す」という**ID 集合照合**を前提にしていた。

**着手前のライブ API 実測で、`parent_game` はそのまま `parent_game.game_type` / `parent_game.total_rating` / `parent_game.total_rating_count` まで展開できることが判明した。** これにより J-3-e の判定は**1 ゲーム単位で自己完結**し、ID 集合照合が不要になった。決着ブロックが「`GameData` への `igdbId` 追加も `HistoryEntry` の拡張も不要」としていた点はそのまま成り立つが、**実装方法自体が決着ブロックの想定と異なる**（母集団プールを保持して都度突き合わせる必要がない）。

両方式が一致することは、母集団の t8/t9 全 23 件で実測確認済み（不一致 0 件）。

### 2. レビューで見つけて直した欠陥（初回実装）

初回実装の `computeClassicRemakeEligible` は**親の `game_type` を見ておらず**、`total_rating`/`total_rating_count` の数値条件だけで親が母集団に居るかを判定していた。このため `Final Fantasy VII Remake` を誤って除外していた（親 FF VII は `total_rating=87.8, total_rating_count=1630` と数値は超えるが `game_type=10` で母集団外。**§5.5 の表・決着ブロックが名指しで「意図的に許可される」としているケース**）。

母集団の t8/t9 全 23 件で両方式を突き合わせ、ずれるのはこの 1 件だけであることを実測で確定させたうえで修正した。⚠️ Sonnet 自身の初回実測（「23件で不一致0件」）は**親の `game_type` を含めた条件での測定**であり、その JSDoc の記述（「親自身の `game_type` は見ない」）自体が誤っていた。管理者が独立に再測定して初めて発覚した。

### 3. `/code-review` 指摘の採否（4 件）

| 指摘 | 採否 | 根拠 |
|---|---|---|
| 選定側 `buildClassicCandidates` に `game_type` ゲートが無く、第2層エンリッチ（`mainGameOnly` 無しの `searchGameByName`）経由で非 Main Game が数値条件だけで混入する（medium） | **本PRで修正** | 実測で該当 **39 件**（`Final Fantasy VII`(t10)/`Mass Effect Trilogy`(t3)/`The Witcher 3: Wild Hunt - Game of the Year Edition`(t3)/`Blood and Wine`(t2) 等）。**本PRの実行で選ばれた `The Witcher 3: Wild Hunt` の GOTY 版・拡張がまさに混入候補だった。** PR-B の教訓（クエリ側の条件だけでは枠は分離されない）そのものへの取りこぼしのため、別Issueに送らず本PRで直した。新設 `isClassicPoolGameType` で 0/8/9 のみ許可、`undefined` は除外 |
| `CLASSIC_TOTAL_RATING_COUNT_MIN` が引き上げ方向にしか効かない（`limit 200` 固定のため）（low） | **本PRで JSDoc に明記**（挙動は変えず） | `limit 200` は §5.4 の決定事項（ユーザー確認済み）に由来する構造的な性質 |
| `classicSystem` の Creator's Eye が「後世に影響を与えた革新的な要素」を要求し続けている（low） | **#255 に分離** | 論点G の決着が §2（📜）の矛盾しか分析しておらず §5（Creator's Eye）の同じ矛盾を見落としていた。実効性・要否は仕様判断が必要 |
| 特集のテーマ別プレフィルタが候補リストを無制限にプロンプトへ載せている（low） | **#256 に分離** | 実測 **+118K 文字 ≒ +34K トークン/号**。キャップ値の決定は §4 の仕様判断が必要 |

### 4. 実データでの効果（DEV_MODE 実行、2026-08-09）

| 項目 | before | after |
|---|---|---|
| 名作枠クエリの取得結果 | 30 件 | **192 件**（`limit 200` のうち J-3-e で t8/t9 が 8 件脱落） |
| IGDB プール全体 | 123 件 | 288 件 |
| **名作枠の選定** | **Splatoon Raiders** | **The Witcher 3: Wild Hunt** |
| 新作枠 | ほの暮しの庭 / Rhythm Heaven Groove | 変化なし |
| インディー枠 | Palworld / Scrap Mechanic | 変化なし |

母集団の実測: `game_type=0` で 257 件、J-3-e 適用後 **268 件**（§5.4 記載の 266 件とは IGDB 側の漂動範囲内）。`limit 200` による J-3-e の誤許可は実測で **0 件**（親は常にリメイクより評価母数が多く上位に来るため）。

**副次的な変化 2 件**（機序を確認済み）:

- 特集枠は同一エントリのまま表示名が「グランド・セフト・オートV レガシー」→「Grand Theft Auto V」に変化。GTA V が母集団に入り `aggregateGames` の既存挙動（`game.title = igdb.name`）が発火したもの。`titleJa` は保持される
- `Grand Theft Auto VI`（2026-11-19 発売）が母集団から消えた。未発売クエリの窓は +90 日なので**旧名作クエリ（`hypes > 100`・日付条件なし）が唯一の流入経路だった**＝§5.2 の「定義上これから出る話題作リスト」という診断が実データで裏付けられた

### 5. ⚠️ §5.4 の供給根拠と実装の食い違い（申し送り）

§5.4 は供給の根拠に「266 件 = 5.1 年分」を挙げているが、`limit 200`（§5.4 自身が決定事項として明記）により**実際に候補になるのは 200 件 = 3.8 年分**である。#250（未発売クエリの `limit 20` が母集団を切る問題）と同型の乖離。挙動は仕様どおりなので変更していないが、記録として残す。

### 6. 引き継ぎ事項

- **`Black Mesa` は `isFanGame()` に落とされる**（`keywords` に `fangame` を実測確認済み）。J-3-e は `classicRemakeEligible=true` と正しく判定するが（親 Half-Life が `total_rating=84.2` で母集団外）、後段の `isFanGame` フィルタで除外される。`spec-review.md:1839` が「実装時に確認が必要」としていた点で、**ファンメイド・リメイクを名作枠で扱うかは仕様判断が必要**。本PRでは挙動を変えていない
- 成人向けテーマ（`themes != (42)`）は選定側では再現していない（第2層エンリッチ経路に同じ抜け道がある）。ただし実測では成人向けテーマ 10,292 件のうち §5.4 の数値条件を満たすものは 0 件で、現状実害は無い（IGDBデータが変わった場合は要再検証）

### 7. 教訓（次回以降）

- **サブエージェントの実測検証は「何を含み何を含まない条件で測定したか」を自分で確認すること。** 報告の結論だけでなく前提を検証しないと、報告自体が誤った前提に基づいている可能性がある
- **`/code-review` の指摘は実データで規模を測ってから採否を決める。** 4 件中 2 件が実データで確定し、うち 1 件は「別Issueに送らず同PRで直すべき」規模だった（本PRの主旨そのものへの取りこぼし）

---

  PR #258（Issue #253 対応。PR-D を吸収）

  【共通ヘッダ】

# PR #258: isQualifiedGame の仕様外経路を整理する（Issue #253）

- ブランチ: `fix/issue-253-qualified-game-cleanup`
- Issue: **#253**（Closed）。関連 **#251**（Open のまま。コード変更なし。判断内容は本PRのdocs更新で記録する）
- 仕様: §2.3
- 吸収したタスク: PR-D（`refactor/remove-metacritic-path`。未着手のまま §8 に残っていた `metascore` 削除作業）

## 問題

`isQualifiedGame`（`scripts/game-filter.ts`）には、§2.3 の品質条件表に規定が無いのに残っていた経路が 3 つあった（§8 実装計画・行15 で発覚済み、担当PR未割り当てのまま残っていた）。

1. `metascore != null`
2. `steamPlayers > 0`
3. `igdbRating >= QUALITY_IGDB_RATING_STRONG(85) && igdbRatingCount >= QUALITY_IGDB_RC_FLOOR(8)`

## 実施結果（2026-08-10）

**PR #258。マージコミット `0af2a36`（通常マージ、squashではない）。コミット2本（実装 `5c9e9b4` → `/code-review` 指摘2件の対応 `44bec5b`）。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### 0. 触った関数・ファイルの一覧

| ファイル | 変更 |
|---|---|
| `game-filter.ts` | `isQualifiedGame` から `metascore`/`steamPlayers` 経路を削除。`igdbRating`/`igdbRatingCount` の救済経路は維持 |
| `fetch-metacritic.ts` | **全削除**（260行）。`fetchMetacriticData` / `getGameScore` を含む |
| `types.ts` | `GameData` / 別インターフェースの `metascore?` / `userScore?` フィールドを削除 |
| `bedrock-client.ts` | `metascore`/`userScore` を参照していた箇所を削除 |
| `build-issue.ts` | 同上 |
| `fetch-data.ts` | `fetchMetacriticData` の呼び出し・`metascore` の転記・並び順スコアでの参照を削除。`buildClassicCandidates` 直前のコメント「メタスコアが非常に高い」を「評価母数ベースの母集団条件、§5.4/§5.5/§5.8」に更新（`/code-review` 対応、後述） |
| `generate-articles.ts` | `metascore`/`userScore` を参照していた箇所を削除 |
| `select-newreleases-with-fallback.ts` | 同上 |
| `validate-article.ts` | 同上 |
| `validate-existing-issue.ts` | `FrontmatterArticle` インターフェースの `metascore?`/`userScore?` フィールドを削除（`/code-review` 対応、後述） |
| `.env.example` | `OPENCRITIC_API_KEY` の行を削除 |

### 1. `steamPlayers` バグの発見経緯

§2.3 に規定の無い経路を精査する過程で、`steamPlayers > 0` 経路が**単に「未仕様」なだけでなく、恒常的なデッドコードだったこと**を発見した。`fetch-steam.ts` は `SteamData` に `peakPlayers` フィールドしか設定しない。ところが `fetch-data.ts` の `aggregateGames` は `GameData.steamPlayers` への代入時に `SteamData` 上に存在しない `currentPlayers` というフィールドを読んでいた。フィールド名の不一致により、`GameData.steamPlayers` は本番で常に `undefined` だった。したがって本経路は一度も発火しておらず、削除は挙動不変（テストも旧経路を検証していた分だけ削除、新規テストは不要）。

### 2. `metascore` 削除の経緯

論点D（D-1'）は仕様検討資料の段階で既に「削除」と決着していたが、担当ブランチ `refactor/remove-metacritic-path`（PR-D）が §8 の実装計画に「未着手」のまま残っていた。本PRはこの未着手タスクを実行した。Metacritic 取得（`fetch-metacritic.ts`）は API キーの不備で全 17 号にわたり 0 件しか返しておらず、`metascore != null` 経路は一度も発火していなかったため、削除は挙動不変。

### 3. `igdbRating` レスキュー経路を維持した判断

3経路のうち唯一、`igdbRating >= 85 && igdbRatingCount >= 8` は実データで機能している実在の経路であることが確認された（高評価・低投票数タイトル、例: Splatoon Raiders を正しく救済）。削除せず、§2.3 の品質条件表に「条件2（投票数15以上）の閾値緩和版」として明文化した（管理者判断・ユーザー確認済み）。

### 4. `/code-review` 指摘2件の内容と対応

両件とも本PRで修正した（分離なし）。

| 指摘 | 対応 |
|---|---|
| `metascore`/`userScore` 削除後も `validate-existing-issue.ts` の `FrontmatterArticle` インターフェースに陳腐化したフィールドが残っていた | 削除（`toGeneratedArticle` は既に参照していなかった） |
| `fetch-data.ts` の `buildClassicCandidates` 呼び出し直前のコメントが旧仕様（「メタスコアが非常に高い」）のままだった | 現行仕様（評価母数ベースの母集団条件、§5.4/§5.5/§5.8）を指すコメントに更新 |

### 5. テスト数の変化

**1106 → 1101**（削除5件、新規0件）。挙動不変の純削除のため新規テストは不要と判断した。削除した5件は、旧 `metascore`/`steamPlayers` 経路を検証していたテスト（いずれもデッドコード/未発火経路の回帰テストで、削除により意味を失ったもの）。

### 6. Issue #251 への申し送り

本PRはコード変更を行っていない。「批評媒体数が2以上」の品質条件に評価点の下限を追加するかどうかの判断内容は、本PRに同梱する形で `docs/article-category-spec.md` §9.3（新設した14番目の項目）に記録した。詳細はそちらを参照。Issue #251 はクローズせず監視項目として開けたままにする。

---

  PR #261（Issue #260 対応）

  【共通ヘッダ】

# PR #261: 新作枠の選定フィルタを60日窓に修正する（Issue #260）

- ブランチ: `fix/issue-260-newrelease-window`
- Issue: **#260**（Closed）。関連 **#241**（Closed。IGDB側の母集団クエリは既に60日窓に統一済みだった）
- 仕様: §2.3・付録パラメータ表（「発売済みの探索窓 | 60 日」）

## 問題

`scripts/fetch-data.ts` の `selectGamesForArticles` が新作枠候補の絞り込みで `buildNewReleaseCandidates` に渡す `releasedAfter` は、`threeMonthsAgo`（`setMonth(-3)`、実測約91〜92日）のままだった。Issue #241 対応（PR #243）でIGDB側の母集団取得クエリは60日窓に揃えられていたが、この`selectGamesForArticles`内の別レイヤーのフィルタだけが2026-02-22の古い実装のまま3ヶ月で取り残されていた。

## 実施結果（2026-08-10）

**PR #261。マージコミット `7a33cea`（squash）。コミット1本。**

管理者が実データ（過去のスナップショット `data/aggregated.json`、105件、fetchedAt=2026-05-16）で `buildNewReleaseCandidates` の実ロジックを使い60日窓と3ヶ月窓（92日）を比較検証した。

- 60日窓の候補: **14件** / 3ヶ月窓の候補: **22件**
- **`Slay the Spire II`（基準日の91日前発売）が3ヶ月窓では4軸スコアで全候補中2位にランクインし実際に新作枠（採用数2）に選定されるが、60日窓では母集団にすら入らない**、という実害を確認した

これを受けて Issue #260 を起票し、本PRで修正した。`scripts/fetch-data.ts`（1217〜1227行目付近）の `threeMonthsAgo` を `sixtyDaysAgo`（`setDate(-60)`）にリネーム・変更し、`buildNewReleaseCandidates` への `releasedAfter` 引数もこれに追従させた。`scripts/fetch-data.test.ts` に `buildNewReleaseCandidates` の境界値回帰テストを新規追加した（59日前=含む・60日前=境界で除外・61日前=除外。旧3ヶ月窓なら含まれてしまっていたケース）。

テストは修正前 29ファイル / 1101テスト → 修正後 29ファイル / **1104テスト**（新規3件）、全通過。`/code-review` 実施済み、指摘0件。

なお `scripts/fetch-igdb.ts` の `fetchIndieGames` 関数（インディー枠、§3の母集団取得クエリ）にも同名変数 `threeMonthsAgo` があるが、これは完全に別機能でIssueのスコープ外のため変更していない。

---

  PR #263（Issue #250 対応）

  【共通ヘッダ】

# PR #263: 未発売クエリのlimitを50へ引き上げる（Issue #250）

- ブランチ: `fix/issue-250-upcoming-limit`
- Issue: **#250**（Closed）。関連 **#244**（Closed。本Issueの真因はここで見落とされていた）
- 仕様: §2.4

## 問題

`fetchUpcomingGames`（`scripts/fetch-igdb.ts`、未発売クエリ）が `limit 20` を使っていたが、実測（2026-08-09）で90日窓・`hypes > 20` の母集団は33〜34件あり、20件で切られていた。切り捨てられる21番目以降に、Issue #244で緩和したはずの `game_type` 条件（Main/Remake/Remaster許可）の恩恵を受けるタイトル（`Rayman Legends Retold`、34件中23番目）が含まれており、#244の緩和が実質的に無効化されていた。

## 実施結果（2026-08-10）

**PR #263。マージコミット `86da8d5`（squash）。コミット2本（実装 → `/code-review`指摘対応）。**

`limit` を20から50に引き上げた。実測の母集団件数（33〜34件）に十分な余裕を持たせつつ、発売済み側の2軸クエリ（Issue #241 / PR #243）が既に採用している `limit 50` と値を揃えた。`scripts/fetch-igdb.test.ts` のクエリ文字列アサーションを `limit 50` に更新した（新規テスト追加なし。テスト件数は29ファイル / 1104件で変化なし、全通過）。

`/code-review` で、§8実装計画テーブルの#241対応行（`limit 20` の記述を含む）が未更新のまま残っており、§2.4のパラグラフとの間に矛盾が生じていた点を指摘された。同PRで追加コミットし、該当行を「#250は本PRで対応済み」に更新した。

---

  PR #264（Issue #256 対応）

  【共通ヘッダ】

# PR #264: 特集テーマ事前フィルタの候補summaryを200文字に切り詰める（Issue #256）

- ブランチ: `fix/issue-256-feature-prefilter-summary-cap`
- Issue: **#256**（Closed）。関連 名作枠PR（#254。母集団拡大が本Issueの引き金）
- 仕様: §9.3（コスト最適化。品質条件・選定ロジックの変更ではない）

## 問題

`prefilterFeatureCandidatesByTheme`（`scripts/bedrock-client.ts`）が特集テーマ判定のプロンプトに候補ゲームの `summary` を全文載せていた。名作枠の母集団拡大（PR #254、IGDBプール全体が123件→288件）により、summaryを持つ候補が増え、約+34Kトークン/号のコスト増になっていた（実測、2026-08-10）。

## 実施結果（2026-08-10）

**PR #264。マージコミット `34919f8`（squash）。コミット1本。**

候補の件数・選定ロジックは変えず、summaryの長さだけを `FEATURE_PREFILTER_SUMMARY_MAX_CHARS`（200文字）で切り詰めた。`fetch-web-search.ts` の既存パターン（単純な `slice`、省略記号なし）に倣った。`bedrock-client.test.ts` に境界値テスト3件を追加（200文字超は切り詰め・ちょうど200文字は無変更・201文字は1文字切り詰め）。テストは29ファイル / 1104件 → **1107件**（新規3件）、全通過。

`/code-review` で1件指摘（単純 `slice` はUTF-16サロゲートペア境界で分割し得るリスク）が出たが、①`fetch-web-search.ts` の既存 `slice` 呼び出し（複数箇所）も同じリスクを抱えたまま運用されており本PR固有の新規リスクではないこと、②プロンプトへの軽微な文字化けリスクであり実害（記事の事実性・表示崩れ）に直結しないことから、低リスクと判断し本PRでは対応を見送った。別Issueへの分離も行っていない。

---

  PR #265（Issue #255 対応）

  【共通ヘッダ】

# PR #265: classicSystemのCreator's Eyeから根拠不要の影響記述要求を削除する（Issue #255）

- ブランチ: `fix/issue-255-creators-eye-hallucination-risk`
- Issue: **#255**（Closed）。関連 名作枠PR（#254。`/code-review`で本Issueの元になった欠陥を検出）
- 仕様: §5.6

## 問題

名作枠PR（PR #254）の `/code-review` で検出。§5.6の決着（📜ゲームの歴史セクションに「情報が無ければ省略してよい」ガードを追加）は、同じ `classicSystem` プロンプトのCreator's Eyeセクションが「後世に影響を与えた革新的な要素」という根拠のない歴史的影響の記述を要求し続けている矛盾を見落としていた。

## 実施結果（2026-08-10）

**PR #265。マージコミット `be24575`（squash）。コミット2本（実装 → `/code-review`指摘対応）。**

Issueが提示した3案（①📜と同型のスコープ付きガードを追加／②要求自体を削除／③現状維持）のうち、**②要求項目自体を削除する**を採用した。Creator's Eyeは必須セクション（省略不可）のため、📜と同型の「情報が無ければ省略」ガードを足すと運用が複雑になる。要求自体を削れば、それに応えようとして発生するハルシネーションのリスクを構造的に避けられる。Creator's Eyeに残る他の2項目（「ゲームデザインの観点から分析」「面白いゲームを作るためのヒントや学び」）は歴史的影響の断定を必要としないため維持した。

`/code-review` で、§5.6の類似修正（PR #254）が `not.toContain` の回帰テスト＋ポジティブコントロールを追加していたのに対し、本PRには同種のテストが無い点を指摘された。同PRで追加コミットし、削除項目の回帰テストを追加した。テストは29ファイル / 1107件 → **1109件**（新規2件）、全通過。

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

## 実施結果（2026-08-09）

**PR #237。マージコミット `7a2a0da`（squash）。コミット 2 本（`98ba151` 実装 → `373ba2c` レビュー対応）。**
実装は Sonnet に委譲し、diff を管理者が検証した。

### ⚠️ 最重要: 当初スコープは誤っていた（論点A の未実装を発見）

**着手後の実測で、Steam Top Sellers 1 位の『ほの暮しの庭』が新作枠にもインディー枠にも載らない**ことが判明し、
ユーザーの指摘（「新作紹介は大手かインディーかを問わない仕様ではなかったか」）を受けて仕様書を遡ったところ、
**新作枠の企業規模ゲートは撤廃が決定済み**だった。

| 出典 | 記述 |
|---|---|
| 仕様書 §1.1 | 「企業規模の判定はインディー枠の除外条件としてのみ使います。**新作紹介から「大手であること」という条件は撤廃されます**」 |
| 仕様書 §2.2 | 「**企業規模は問わない**。大手でもインディーでも「注目されているなら載せる」」 |
| 決着ブロック 論点A（2026-07-29） | 「✅ **(A-1) を採用。新作紹介から企業規模条件を撤廃する**」 |
| §11.1 確定事項 #1 | 「**撤廃する**。`select-newreleases-with-fallback.ts:56-68` の `isLargeStudio` AND ゲートを削除」 |

**Issue #231 が提案していた「ゲートを維持したまま判定精度を上げる」は、決着で棄却された (A-3) に相当していた。**
この削除タスクは §8 の PR 一覧のどこにも割り当てられていなかったため実装されずに残っていた。
→ **本PRで論点A を実装した**（ユーザー判断で PR-I に同梱、2026-08-09）。
→ 再発防止として**共通ヘッダに「🚨 着手前の必須検証（厳守事項）」節を追加した**。

### 実装（4 つ）

| 対象 | 内容 |
|---|---|
| `indie-classifier.ts` | `isLargeStudio(developer, developedCount?)` に本数判定を OR 追加（`LARGE_STUDIO_DEVELOPED_THRESHOLD`、既定 20、`> 20` で大手）。`pickDeveloperGameCount` を新設 |
| `select-newreleases-with-fallback.ts` | **企業規模ゲートを削除**（論点A）。canonical 名の正規化（Issue #180）は維持（**⚠️ その後 PR #291 / Issue #277 で撤去**） |
| `fetch-igdb.ts` | `involved_companies.company.developed` を 4 クエリに追加。`pickSteamUrlFromWebsites` を新設し 4 箇所で共有。`websites.type` を追加 |
| `fetch-data.ts` | IGDB 単独エントリへの `steamAppId` 引き継ぎ。`computeIndieScore` を廃止し `compareIndieCandidates`（Steam おすすめ数降順）に置換。`isWithinIndieReleaseWindow`（90 日窓）を新設 |

**環境変数**: `LARGE_STUDIO_DEVELOPED_THRESHOLD`(20) / `INDIE_RELEASE_WINDOW_DAYS`(90)。
どちらも `Number(x) || 既定値` を使わず `Number.isFinite` で判定し、呼び出し時に読む。

### 📊 前後比較（2026-08-09 ライブ。#231 の受け入れ条件）

| 指標 | 変更前 | 変更後 |
|---|---|---|
| **新作枠の採用** | **0 本** | **2 本**『ほの暮しの庭』『MARVEL Tōkon: Fighting Souls』 |
| 新作枠 大手ゲート不通過 | 19 件 | **ゲート自体を撤廃** |
| **インディー枠の採用** | 大手 2 本（Nippon Ichi Software / Arc System Works） | Palworld (PocketPair) / Scrap Mechanic (Axolot Games) |
| インディー候補の窓外混入 | 上位 10 件中 **5 件**（Geometry Dash 2013 等） | **0 件** |
| `steamAppId` を持つ候補 | 32 | **92** |
| IGDB 由来のみ かつ `steamAppId` あり | **0** | **59** |
| `steamRecommendations` を持つ候補 | 17 | **60** |
| 実行時間 | 2 分 32 秒 | 2 分 45 秒 |

### 📊 実測で判明した「仕様書に無い事実」（4 件）

1. **IGDB が `websites.category` を `websites.type` に改名している。** 母集団 60 件で `category === 13` の一致は **0 件**。
   Steam URL 抽出が生きていたのは URL 部分一致フォールバックのおかげ。**`officialUrl` 抽出（`category === 1`）は全経路で死んでいる** → **#234**
2. **`aggregateGames` の IGDB 単独エントリに `steamAppId` が設定されていない。** IGDB enrich ループは
   `!coverImage || genres 空` のときしか走らないため、`steamUrl` を抽出しても Storefront 補完に到達しない。
   §3.6 の警告ブロックが指摘していた経路とは**別の欠落**
3. **IGDB に会社レコードの重複がある。** `Nippon Ichi Software`=187 と `Nippon Ichi Software, Inc.`=**3** の 2 レコードがあり、
   『ほの暮しの庭』は後者を参照している。**#231 の「閾値 20 で 2 件とも拾える」という前提は実データで成立しなかった** → **#236**
4. **`normalizeDeveloperName` が「カンマ + Inc.」形式の末尾カンマを除去できない**（`"Nippon Ichi Software, Inc."` →
   `"nippon ichi software,"`）。IGDB は実データでこの表記を返すため、静的リスト照合にも穴があった（本PRで修正）

### レビュー指摘への対応（5 件。3 件を本PRで修正・2 件を分離）

| 指摘 | 検証結果 | 対応 |
|---|---|---|
| `pickSteamUrlFromWebsites` が配列の先頭一致で決まる | 現データでは発生ゼロ（Steam 的 URL が複数の候補 0 件）だが理屈は正しい | ✅ 本PRで 2 パス化 |
| `steamAppId` 引き継ぎで `gameMap.set` の上書き経路が増える | 当該 WARN は実測で **変更前 3 件 → 変更後 0 件**。上書きは既存挙動 | → **#239** |
| 生の `developed` 件数が多作な小規模スタジオを大手扱い | **実測で裏付け: Kairosoft = 88 本**。ただし §3.4 の決定事項 | → **#240** |
| `developer` と `developerGameCount` が別会社の組み合わせになりうる | **本PRが持ち込む欠陥** | ✅ 本PRで修正（`pickDeveloperGameCount`） |
| `INDIE_RELEASE_WINDOW_DAYS=0` のコメントが実挙動と逆 | コードで確認 | ✅ 本PRで修正（コメントのみ） |

### 品質ゲート・検証手法

`npm run test` **26ファイル / 960テスト 全通過**（着手前 26 / 865）。

**ミュータント検証を管理者が 11 種実施し、全種でテストが検出することを確認した**（閾値 20→19 / OR→削除 /
`deduplicateGames` の転記削除 / mapper が publisher の developed を拾う / `steamRecommendations` の 0 を truthy 判定 /
`steamAppId` 引き継ぎ削除 / `type===13` 判定削除 / インディークエリだけ steamUrl 抽出を戻す / ペアリングガード削除 /
末尾カンマ除去削除 / steamUrl 抽出の 1 パス化）。

**うち 2 件は空虚なテストを検出した**（次回以降の再利用価値あり）:

- **`type === 13` 経路のテストがフィクスチャの URL に `store.steampowered.com` を含んでいた**ため、
  URL 部分一致で通っていた。**ドメインを含まない URL** のフィクスチャに直して初めて経路を検証できた
- **「Nihon Falcom(214) は大手」というテストが静的リスト経由で通っていた**（`indie-classifier.ts:63` に登録済み）。
  本数判定を丸ごと削除しても通るため、`list: 'large'` を assert する形と、本数判定専用のケースに分割した

### 本PRの検証中に分離した Issue（7 件）

| Issue | 内容 |
|---|---|
| **#234** | `websites.category` → `type` 改名で `officialUrl` 抽出が全経路で機能していない → ✅ **完了**（2026-08-09。PR #246。マージ `bd71e4f`） |
| **#235** | §3.5 の「話題性ルートから YouTube を外す」決定が未実装・PR 未割り当て → ✅ **完了**（2026-08-11。PR #273。マージ `d04a107`） |
| **#236** | IGDB の会社レコード重複で `developed` 判定が取りこぼす → ②のみ対処（2026-08-11。PR #276。マージ `abd8f3e`）。**①（IGDBのレコード分裂）は未解決のため Issue は Open のまま** |
| **#238** | 話題の国内新作『Splatoon Raiders』が新作枠に載らず名作深掘り枠に選ばれる |
| **#239** | `aggregateGames` が同一 `normalizedTitle` の既存エントリを黙って上書きする |
| **#240** | 生の `developed` 件数が多作な小規模スタジオを大手扱いする（Kairosoft = 88 本） |
| **#241** | 新作枠の母集団クエリに発売日の上限が無く、未発売の大作が枠を占領している |

---

  PR-E / PR-F0 / PR-F / PR-G（小さめ4件）

  【共通ヘッダ】

# PR-E: 検索結果の抜粋を 300 → 1,500 字に統一

- ブランチ: `fix/issue-307-prompt-excerpt-length`（当初案は `fix/prompt-excerpt-length`。→ **Issue #307**）
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

## 実施結果（2026-08-13。PR #313。マージ `dd8e8e9`）

### 0. 触ったファイル

| ファイル | 変更 |
|---|---|
| `scripts/fetch-web-search.ts` | `DEFAULT_SEARCH_CONTENT_MAX_LENGTH`(:226) / `readSearchContentMaxLength`(:240) を新設。4ブロックの `slice(0, 300)` と `flattenSearchResults` の両方が同じ上限を使う。旧 `SNIPPET_MAX_LENGTH` を削除 |
| `scripts/fetch-web-search.test.ts` | 新規6件。`formatSearchResultsForPrompt` / `flattenSearchResults` には**従来テストが1件も無かった**ので今回が初のカバレッジ |
| `scripts/generate-articles.ts` | `WebSearchSource.snippet` のコメントのみ（削除シンボルを参照していた） |
| `docs/hallucination-prevention.md` | `SNIPPET_MAX_LENGTH` の記述を更新し、非対称が閉じたことを追記 |

### 1. ⚠️ 着手前検証: 決着ブロックのコスト見積もりが号単位に集計されていなかった

`spec-review.md` §7 論点G の「6. コスト影響は小さい」は**名作枠 1 記事**（6 結果 → 約 7,200 字）でしか計算されていない。
一方で同じ決着ブロックが「(2) 抜粋長の 300 → 1500 は**全カテゴリに影響する**」と書いている。**集計が欠けていた。**

ライブ Tavily で 1 号ぶん（51 結果）を実測（2026-08-13）:

| カテゴリ | 検索結果 | プロンプト増分 |
|---|---|---|
| newRelease（2記事） | 12 件 | 12,271 字 |
| indie（2記事） | 18 件 | 14,578 字 |
| classic（1記事） | 6 件 | 4,640 字 |
| feature（1記事 / 5ゲーム） | 15 件 | 7,189 字 |
| **合計** | **51 件** | **38,678 字/号**（決着の 7,200 字の **5.4 倍**） |

content 長さは 平均 1,121 / 中央 1,340 / 最小 63 / 最大 2,398 字。**Issue #256（特集プレフィルタの約 +34K トークン/号。PR #264 でコスト削減を実施）と同程度の桁。**

**それでも実装を続行した判断**: これはコスト最適化ではなく、バリデータが誤って警告を抑制する**正しさの欠陥**の修正であり、抜粋を短く保つことは「穴を開けたままにする」ことと同義。上限を環境変数化したので絞れるが、**下げた分がそのまま偽陰性に戻る**ことをコードコメントに明記した。**削るなら検索件数側で調整するのが正しい。**

### 2. 受け入れ条件（DEV_MODE で4カテゴリ確認）の結果

第 24 号 dev、4 カテゴリ 6 本すべて生成（exit 0）。

| 指標 | issue-022（適用前） | issue-023（適用前） | **issue-024（本PR）** |
|---|---|---|---|
| 記事本数 | 5 | 6 | 6 |
| high 警告 | 2 | 2 | **0** |
| medium / low | 0 / 0 | 4 / 3 | 3 / 5 |
| judge: supported | 41 | 40 | **61** |
| judge: contradicted | 4 | 3 | **2** |
| judge: unverifiable | 5 | 8 | **2** |
| 本文長（平均） | 1,172 字 | 1,299 字 | **1,296 字** |

本文長はほぼ同一で**焦点がぼやけた兆候は観測されなかった**。
⚠️ **ただし対照実験ではない**（各条件 N=1・週もタイトルも違う）。同一データでの前後比較には main 側でもう1回実行が必要で、その分のコストが追加で発生する。

**📜「ゲームの歴史」は意図どおり機能した**（本PRの主目的）。名作枠（GTA V）で発売年・業界への影響・受賞歴を含む実質的な記述が出た。

### 3. 受賞歴の記述を検証した（プロンプトの条件付き禁止に触れないか）

`classicSystem` は受賞歴を「**提供データに明示的に書かれていない限り**記載しない」と条件付きで禁止している（`bedrock-client.ts:338`）ため、抜粋への実在を確認した。

| source | snippet 長 | 受賞語の初出位置 |
|---|---|---|
| `gta.fandom.com/wiki/Grand_Theft_Auto_V` | 1,500 | **50 文字目** |
| `imdb.com/title/tt2103188` | 288 | **37 文字目** |

いずれも **300 字以内**。つまり**この受賞歴は PR-E 以前から LLM に渡っていた**もので、本PRが新たに与えたものではない。§9.3-1（受賞歴を検出するバリデータが無い）の露出量を本PRは増やしていない。

### 4. `/code-review` 指摘1件を採用（追加コミット `b38ad84`）

4ブロック検証のアサーションが `prompt.split('\n').filter(l => l.startsWith('  あ'))` で**「抜粋が単一行である」ことを暗黙の前提**にしていた。しかし実測で Tavily の content は 1,500 字の窓の中に改行を含む（『The Witcher 3』の検索結果 6 件中 4 件。1,500 字内の改行数は 33 / 3 / 8 / 14）。合成入力が改行なしなので通っていたが、**改行を含む入力にすると実装が正しくても落ちる**＝実データの形を検証していなかった。行分割をやめ、snippet と同一の文字列が4ブロックに1回ずつ現れることを照合する形に変更した。

不採用2件: 極端に大きい `SEARCH_CONTENT_MAX_LENGTH`（`slice` が content 長で頭打ちになり実害なし）/ `OFFICIAL_PAGE_MAX_LENGTH` の「プロンプトサイズ抑制」との矛盾（別データ源）。

### 5. ミュータント検証（6種すべてテストが検出）

history ブロックだけ 300 に戻す / snippet を 1500 ハードコード / 既定値 300 / 0 と -1 を通す / `Number.isInteger` 検査を外す / env を無視。**改行入り入力に変更した後も上位2種の検出力を維持することを再確認した。**

### 6. 副次的な観測（本PRとは無関係。記録のみ）

- `IGDB enrich rejected (appId not confirmed)` が 1 件発生（`Escape War`）。これは `fetch-data.ts:113` の呼び出し箇所で、**Issue #239 が対象とする `fetch-data.ts:321` の `[WARN] aggregateGames:` とは別**。**#239 の監視解除条件は満たしていない**（`:321` は 0 件）。ログ文言が似ているので着手時は呼び出し箇所まで確認すること
- PR #303 の `game-source-unchecked`（severity=low）が 2 件発火。設計どおり
- judge が『ほの暮しの庭』の「発売中」を確信度 95% で contradicted と判定 → **発売状態の扱いは PR-C（#309）の担当範囲**

### 7. 教訓

**決着ブロックが「影響は小さい」と書いていても、その見積もりの単位（1記事 / 1号）を確認する。**
本件は決着ブロック自身が「全カテゴリに影響する」と書いた直後に1記事分のコストしか出しておらず、**同じブロック内で単位が食い違っていた**。着手前に集計し直したことで 5.4 倍という実測値が出た。

**「テストが通った」と「テストが実データの形を検証している」は別。**
指摘1件は、合成入力が実データの性質（改行を含む）を持たないために成立していた前提だった。ミュータントは検出できていたので**検出力は本当にあった**が、実データの形は検証していなかった。この2つは分けて確認する。

  【共通ヘッダ】

# PR-F0: 発行日をJST基準で決める

- ブランチ: `fix/issue-308-publish-date-jst`（当初案は `fix/publish-date-jst`。→ **Issue #308**）
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

- ブランチ: `fix/issue-310-feature-event-fallback`（当初案は `feat/feature-event-fallback`。→ **Issue #310**）
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

- ブランチ: `feat/issue-311-article-count-validation`（当初案は `feat/article-count-validation`。→ **Issue #311**）
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

---

  PR #267（Issue #221 対応）

  【共通ヘッダ】

# PR #267: 特集記事の候補が0件になった場合は生成を中断する（Issue #221）

- ブランチ: `fix/issue-221-empty-feature-guard`
- Issue: **#221**（Closed）。PR-0.1（#220）の`/code-review`で検出され分離された（関連 **#222**。同時に分離された別懸念で、こちらはOpenのまま未対応）
- 仕様: Issue #179 の設計原則（「不適格なものを載せず枠を埋めない、号全体は止めない」）

## 問題

`generateFeatureArticle`（`scripts/generate-articles.ts`）は、テーマに合う候補ゲームが最終的に0件になっても記事生成を止めるガードが無かった。`buildFeatureUserMessage`は空リストでも「紹介するゲーム」ブロックを無条件出力するため、LLMが中身の無いリストを渡されて内部知識（ハルシネーション）に頼らざるを得なくなる経路が存在した。`validateFeaturePlatformConsistency`も`recommendedGames`が空だと早期returnし、検証層でも捕捉されない。

管理者が実データで検証した結果、**過去に公開された全19号のfeature記事はいずれも`recommendedGames`が3〜5件あり、0件になったことは一度もない**ことを確認した。実害はまだ発生していない理論上の欠陥だった。

## 実施結果（2026-08-10）

**PR #267。マージコミット `ccc44f1`（squash）。コミット2本（実装 `b373c7c` → `/code-review`指摘対応 `41f220e`）。**

`screenOutAdultGames`後に`selectedGameData.length === 0`のガードを追加し、`throw`する対応を採用した。呼び出し元は既にtry/catchで囲まれており、catchは`regenerables.push`を呼ばないため、この`throw`は「特集枠だけスキップされ、号全体は止まらない」という挙動になり、Issue #179 の設計原則に自然に沿う。

**スコープ外**: `FEATURE_MIN_GAMES`（3件）未満だが0件ではないケース（1〜2件の薄い特集）は既存どおり警告のみで続行。fringe補充とスクリーニングの順序問題（本数不足時に補充が走らない構造的非対称）も別Issueで検討することとし、本PRには含めていない。

テストは着手前 29ファイル / 1109テスト → 修正後 29ファイル / **1110テスト**（新規1件）、全通過。

### `/code-review`指摘4件のうち2件を追加コミットで修正

- **テストのモック汚染**: `beforeEach`の`vi.clearAllMocks()`は呼び出し履歴のみをクリアし、`mockResolvedValue`で設定した実装は引き継がれる（`vi.resetAllMocks`ではないため）。直前のIssue #208関連テストが`selectFeatureGames`に戻り値を設定したままだったため、新規回帰テストは「`selectFeatureGames`自体が0件を返す」経路ではなく、たまたま別経路（タイトル不一致）で偶然0件になっていた。`mockSelectFeatureGames.mockResolvedValue([])`を明示的に設定し、検証したい経路を固定した
- **エラーメッセージの原因の誤帰属**: `throw`のメッセージが原因を「AIスクリーニングまたはタイトル一致」に限定していたが、`selectFeatureGames`自体が大きな母集団から0件を返すケース（テーマが狭すぎる等）も原因になり得るため、実際のログ調査時に誤誘導しないよう文言を修正した

### 残り2件は見送り

- 下流関数`buildFeatureUserMessage`自体はガードしていない、という指摘。現在の呼び出し経路では本PRのガードで0件が`generateFeatureArticle`内で必ず先に捕捉されるため、`buildFeatureUserMessage`が空リストを受け取ることは無く、仮説的な懸念にとどまる
- エラーメッセージの診断情報が既存ログと重複する、という指摘。軽微なスタイル上の指摘であり実害を伴わないため見送った

---

  PR #269（Issue #247 対応）

  【共通ヘッダ】

# PR #269: 特集記事recommendedGamesの非公式URL混入を防ぐ（Issue #247）

- ブランチ: `fix/issue-247-featured-recommended-url-validation`
- Issue: **#247**（Closed）。PR #246（#234対応）のレビューで検出・分離された既存欠陥（#246自体が原因ではない）
- 関連: **#234**（IGDBの`websites.category`→`type`改名対応。PR #246の副作用で`recommendedGames`への流入経路が1つ増えていた）

## 問題

特集記事の`recommendedGames[].officialUrl`が、`article.sourceUrls.official`（`build-issue.ts`に既存のゲートあり）と異なり、信頼済みソース判定・到達性チェックを一切通らずに出力されていた。特集記事は`sourceUrls`を持たないため、既存ゲートに構造的に到達しない。

実測（2026-08-09）: 発行済みの号（issue-002/003/004/005/006/008）に、Bluesky プロフィール・Discord 招待リンクが「公式URL」として計5件混入していた。

## 着手前の独立検証で判明した根本原因（Issue本文の診断より深い）

Issue #247本文は「recommendedGamesに出力ゲートが無い」ことを原因としていたが、管理者がライブIGDB照会で独立検証した結果、漏洩した`Slay the Spire II`は**IGDB側に正しい公式URL（`https://www.megacrit.com/games/`、`officialUrlSource: 'igdb-official'`）が存在していた**にもかかわらず、記事には`bsky.app`が出力されていたことが判明した。

原因は2段構え:

1. `fetch-official-jp-url.ts`の`NON_OFFICIAL_URL_PATTERNS`に`discord.gg`/`discord.com`はあるが、実際に漏れた**`discordapp.com`（旧ドメイン）と`bsky.app`（Bluesky）が抜けていた**
2. `generate-articles.ts`（特集）・`fetch-data.ts`（新作/インディー/名作の`enrichSelectedGamesWithOfficialUrl`）はどちらも「Tavilyが何か見つけたらIGDBの正しいURLを無条件に上書きする」設計のため、ドメインフィルタの穴を突いた誤ったTavily候補が正しいIGDB候補を上書きしていた

Issue本文が提案する「recommendedGamesに`sourceUrls.official`と同じゲートを追加」だけでは、`officialUrlSource: 'tavily'`（信頼済み扱い）かつ`isUrlAlive`も通るbsky.app/discordapp.comは防げない。この根本原因（ドメインフィルタの穴）は`recommendedGames`だけでなく**新作/インディー/名作枠の`sourceUrls.official`にも共通して存在する潜在バグ**だった（本番の`official:`フィールドには実測で非公式URLの漏洩は0件だったが、構造的には同じリスクを抱えていた）。

ユーザー判断（2026-08-10）: 根本原因の修正と、Issue本文が求める出力時ゲート追加の**両方を同一PRで実施**することに決定。

## 実施結果（2026-08-10）

**PR #269。マージコミット `7cfa916`（通常マージ、squashではない）。コミット2本（実装 `7a88cc7` → `/code-review`指摘対応 `745d3fd`）。**

### (a) 根本原因対処

`fetch-official-jp-url.ts`の`NON_OFFICIAL_URL_PATTERNS`に`bsky.app`・`discordapp.com`を追加。全カテゴリ（新作/インディー/特集/名作）の`fetchOfficialJpUrl`呼び出しに波及する修正。

### (b) 出力時ゲート追加（多層防御）

- `types.ts`: `RecommendedGame`に`officialUrlSource?: 'tavily' | 'igdb-official'`を追加
- `generate-articles.ts`: `recommendedGames.push()`で`officialUrlSource`を伝播
- `build-issue.ts`: `recommendedGames`の出力ループに、既存の`sourceUrls.official`ゲートと同じロジックを適用

テストは着手前 29ファイル / 1110テスト → 修正後 29ファイル / **1124テスト**（新規14件）、全通過。型チェックも通過。

### `/code-review`指摘4件のうち3件を追加コミットで修正

- **未定義ソースが信頼済み扱いになる**: `recommendedGames`側のゲートは`officialUrlSource`が`undefined`の場合もソース判定をすり抜けて`isUrlAlive`のみの判定になり、ドメイン不問で通ってしまう欠陥があった。実データ追跡の結果、現在のコードパスでは`officialUrl`と`officialUrlSource`が必ずペアで設定されるため実害は無いが、`RecommendedGame.officialUrlSource`は本PRで新設したフィールドで後方互換の必要が無いため、**厳格化して未定義も「信頼できない」として拒否する**よう変更した（`sourceUrls.official`側は既存の後方互換動作を維持）
- **ゲートロジックの重複**: `sourceUrls.official`と`recommendedGames`のゲートがほぼ同一のまま重複していたため、共通ヘルパー`resolveGatedOfficialUrl(url, source, opts)`に切り出した。`opts.allowUndefinedSource`で両者の挙動差（後方互換の有無）を制御する
- **テストの無意味な`vi.restoreAllMocks()`**: `global.fetch`を直接代入で差し替えているため実質no-op（スパイではないため何も復元しない）だったので削除した

### 残り1件は見送り

- `isUrlAlive`のHEADリクエストがループ内で逐次awaitされ並列化されていない、という指摘。既存の`sourceUrls.official`ゲートも同型の逐次パターンを踏襲しているだけで新規の問題ではなく、週次バッチ処理でタイムクリティカルでもないため見送った

---

  PR #271（Issue #222 対応）

  【共通ヘッダ】

# PR #271: AI成人向けスクリーニングのfail-openを観測可能にする（Issue #222）

- ブランチ: `fix/issue-222-adult-screening-observability`
- Issue: **#222**（Closed）。PR-0.1（#220）の`/code-review`で**#221と同時に**分離された既存仕様の欠陥
- 関連: **#221**（PR #267で対応済み。同じ`generateFeatureArticle`周辺）

## 問題

`isAdultContentByAI`（`scripts/generate-articles.ts`）はBedrock呼び出しが例外を投げた場合、`console.warn`を出して`false`（＝非成人向け）を返す。これは意図的な安全側フォールバック（判定不能なら通す）で仕様としてピン留めされているが、**失敗回数がどこにも記録されない**ため、「成人向けが0件だった正常系」と「Bedrock障害で判定が全件失敗し、この層が事実上無効化された異常系」がログ上で区別できなかった。

## ⚠️ 着手前検証: Issue本文の前提が誤っていた

Issue本文は次のように主張していたが、**コード実読で誤りと確認した**（Issueにコメントで訂正済み）:

> PR #220 以降、AI スクリーニングは特集枠の主防御（ブロックリストは登録1件のみ）になった

実際の特集経路の防御層は**3層**:

| 層 | 実装 | 特集経路への適用 |
|---|---|---|
| 1 | IGDB `themes != (42)`（Erotic）| `fetch-igdb.ts`の`buildIgdbCommonFilters()`。`verifyProposedGames` → `enrichGameWithIGDB({ mainGameOnly: true })` → `searchGameByName`で適用される。`aggregated.json`プール側も母集団クエリで同フィルタを通る |
| 2 | `isBlockedAdultGame` ブロックリスト | 登録1件のみ（本文の記述どおり） |
| 3 | AI スクリーニング | **本Issueの対象** |

したがってfail-openの影響は本文の想定より小さい。ただし**観測不能性そのものは実在する欠陥**のため、ユーザー判断で**項目1（fail-openの観測）のみ対応**した。**項目2（Bedrock連続呼び出しの間隔）はスコープ外**（本文自身が「スロットリングに達する可能性は低い」と認めており実害未観測のため）。

## 実施結果（2026-08-11）

**PR #271。マージコミット `c333eaf`（通常マージ、squashではない）。コミット2本（実装 `cbeb371` → `/code-review`指摘4件の対応 `3fb2ebc`）。**

既存の`WebSearchStats`パターン（カウンタ → `generated-articles.json`永続化 → 集約警告）を踏襲した。`WebSearchStats`は Web検索専用ではなくなったため **`GenerationStats`** に改名（ファイル外にexportしていないため影響範囲は本ファイル内のみ）。

### 観測の出力先は2系統ある（データフロー追跡で発見）

初回実装はCIのstdout警告だけを追加していたが、管理者がデータフローを追ったところ**永続化される側が漏れている**ことが判明した:

| 出力先 | 永続性 | 対応 |
|---|---|---|
| `generate`実行時のstdout | CIログのみ（流れて消える） | 集約警告を追加 |
| **Article Validation Report**（markdown永続化 → `validation`ラベルのIssue自動起票。#211/#206が実例） | 永続 | サマリ表・推奨アクションに追加し、Web検索失敗と同じく**`error`ステータスに昇格** |

`error`は**ビルドを止めず**、`weekly-build.yml`のIssue自動起票条件に一致するだけであることを確認済み。Web検索失敗（品質問題）が既に同じ扱いである以上、安全確認の失敗を同格にするのが整合的と判断した。

テストは着手前 29ファイル / 1124テスト → 修正後 29ファイル / **1168テスト**（新規44件）、全通過。

### `/code-review`指摘4件を全件採用

- **markdownが「未計測」を「計測して0件」に潰す**: stdoutは`unmeasured (old cache)`と出すのに、人間が読むmarkdownは`✅ 0件`と断言していた（両者が矛盾）。未計測経路は`validate-existing-issue.ts`が`webSearchStats=undefined`を渡すケース等で実在する。3分岐（未計測/0/N）に修正
- **`GeneratedIssue`の型の嘘**: `build-issue.ts`が`JSON.parse(...) as GeneratedIssue`で古いJSONを読むため、実行時`undefined`なのに型は`number`だと主張していた。optionalに変更
- **例外以外の第2のfail-open経路**: `result === 'YES'`の厳密一致のため、`YES.`／`**YES**`／空文字／切り詰め応答（`maxTokens: 10`）は例外を投げずに無言で`false`になり、カウントもログも残らなかった。別カウンタ`unrecognizedScreeningResponses`で計上・ログ・レポート表示するようにした。⚠️ **ただし`error`昇格はさせない**——実際のモデル応答形式（`YES.`等の揺らぎ頻度）が**未観測**であり、閾値未検証のまま自動起票を強制すると誤報で毎週Issueが立つリスクがあるため。まず実態を観測してから昇格を検討する。**この仕様判断はテストで固定した**（誤って昇格させるミュータントで3件のテストが落ちることを管理者が独立に確認）
- **自動起票タイトルの矛盾**: スクリーニング失敗のみで起票されると「要対応の問題（HIGH: 0件）」になっていた。件数をタイトルに含めるよう修正。ただし`ADULT=0`のときは従来形式を維持し、既存Issueとの重複防止一致を保つ設計にした

### 管理者による独立ミュータント検証

サブエージェントの報告を鵜呑みにせず、以下を自分で再実行して確認した:

| ミュータント | 結果 |
|---|---|
| カウンタ加算を削除 | 2件失敗 ✅ |
| 無条件に加算（正常系でも加算） | 4件失敗 ✅ |
| `computeReportStatus`から`adultScreeningFailures`の昇格条件を削除 | 1件失敗 ✅ |
| `computeReportStatus`に`unrecognizedScreeningResponses`を誤って追加 | 3件失敗 ✅ |

また、既存テスト1件が変更されていたため内容を確認し、旧仕様（`✅ 0件`表示）のアサーションを正しい`❓ 未計測` + `not.toContain`ガードに置き換える**強化**であって弱体化ではないことを確認した。

---

  PR #273（Issue #235 対応）

  【共通ヘッダ】

# PR #273: インディー枠の話題性ルートから YouTube 経路を外す（Issue #235）

- ブランチ: `fix/issue-235-drop-youtube-popularity-route`
- Issue: **#235**（Closed）。PR-I（#237）の検証中に分離された7件のうちの1件
- 関連: **#217**（YouTube 活用の可否検証）/ **#274**（本PRのレビューで新規分離）

## 問題

`docs/article-category-spec.md` §3.5 が 2026-08-07 のユーザー判断で決定した「インディー枠の話題性ルートから YouTube 経路を外し、Steam の2経路だけにする」が、どの PR にも割り当てられないまま未実装だった。§9.3 項目10 が「決着済みだが PR に割り当てられていない決定」として本 Issue を指していた。

削除対象の実装には2つの欠陥があった:

- 降順配列に対して `floor(件数 × (1 − 0.30))` の位置を閾値にしていたため、意図（上位30%）と逆に**上位80%を通していた**
- `youtubePopularity` を持たない候補が多いと閾値インデックスの要素が値を持たず `?? 0` で**閾値0に落ち、値を持つ候補が無条件に通るフリーパス**になっていた

§3.5 は「廃止する経路のバグを直す意味が無く、供給をさらに狭める」として、閾値バグの修正ではなく**経路ごとの削除**を決定していた。

## 着手前の独立検証（前セッションの前提が再現しなかった）

前セッションの先行調査は「`youtubePopularity` が定義済みのゲーム0件、`source` に `youtube` を含むゲーム0件 ＝ YouTube→GameData のマッチングが1件も成立しておらず実質デッドコード」としていた。しかし:

- ローカルの `data/aggregated.json` は **fetchedAt 2026-05-16 の約3ヶ月前のスナップショット**で、前セッションが使ったものと同一だった
- `weekly-build.yml` は `src/content/issues/`・`history.json`・画像・`data/validation/` しかコミットせず、**`aggregated.json` を永続化していない**（artifact アップロードも無い）。つまりライブ実行しない限り直近データは入手できない
- そこで `npm run fetch-data` をライブ実行し、**2026-08-10 のスナップショット（320ゲーム / インディー候補24件）**を取得して再測定した

結果、**前提は再現しなかった**:

| 指標 | 5/16 | 8/10 |
|---|---|---|
| games | 105 | 320 |
| `youtubePopularity` 定義済み | 0件 | **2件** |
| trendingVideos / 抽出成功 | 30 / 17 | 30 / 23 |

**ただし結論（削除しても供給は減らない）は、より強い理由で成立した。** `meetsPopularityThreshold` は Steam の2経路を先に評価して早期 return するため、`youtubePopularity` を持つ2件はいずれも YouTube 分岐に到達しない:

| ゲーム | youtubePopularity | steamRecommendations | steamRank | Steam経路 |
|---|---|---|---|---|
| ほの暮しの庭 | 542,378 | 255 | 1 | ✅ rank ≤ 200 |
| Meccha Chameleon | 889,066 | 72,927 | 4 | ✅ 両方 |

## 等価性の証明（`youtubePopularitySorted` の構築方法に非依存）

変更前の true 集合を `upperOld(g) = new(g) || (youtubePopularity が定義済み)` で上から抑えた。変更前の YouTube 分岐は「`youtubePopularity` が定義済み」を必須とするため閾値が0（最も緩い場合）でも `変更前 ⊆ upperOld` が成り立ち、かつ Steam 2経路を含むので `new ⊆ 変更前`。実測で `new` と `upperOld` が全ゲームで一致したため、`youtubePopularitySorted` をどう構築しても変更前後は等価と確定した。**この論法により `indieRanked` を再構築せずに結論を出せる**（前セッションの測定は本番と異なる構築で行った箇所があったという申し送りがあったため、構築方法に依存しない手法を選んだ）。

```
snapshot 2026-08-10 / games=320 : new=135件, upperOld=135件, 判定が変わるゲーム 0件
snapshot 2026-05-16 / games=105 : new=18件,  upperOld=18件,  判定が変わるゲーム 0件
```

採用件数はインディー枠 2件 → 2件 で不変（Palworld / Scrap Mechanic）。どちらも `developer` が正規名で `個人開発（…）` ラベルではないため、そもそも話題性ルートに到達せず通常ルートで採用されていた。

## 実施結果（2026-08-11）

**PR #273。マージコミット `d04a107`（通常マージ、squashではない）。コミット1本（`1e94f18`）。**

- `select-indie-with-fallback.ts`: `meetsPopularityThreshold` から YouTube 分岐と percentile 計算を削除し第2引数を廃止。`PopularityContext` と `POPULARITY_YOUTUBE_PERCENTILE`（`INDIE_POPULARITY_YOUTUBE_PERCENTILE`）を削除。`vetIndieCandidate` / `selectIndieGamesWithFallback` から `context` 引数を削除
- `fetch-data.ts`: `youtubePopularitySorted` の構築を**2箇所**削除。**引き継ぎ文書は1箇所（通常選定）しか挙げていなかったが、CompletenessGate の差し替え用クロージャという第2の構築箇所があった**（`indieReserves` からソートして渡していたもの）。後者は `indies: vetIndieCandidate` に簡約した
- §3.5「廃止の範囲」表で「残す」と決まっている用途は変更していない（新作枠の実存判定、プロンプトへの視聴回数提示、`fetchYouTubeData`、集約時のマージ、型定義）
- `INDIE_POPULARITY_YOUTUBE_PERCENTILE` はコード内定義以外に参照が無く（.env / workflow / docs いずれにも無し）、残骸は出ていない

テストは着手前 29ファイル / 1168テスト → 修正後 29ファイル / **1166テスト**（YouTube percentileの4テストを削除、回帰テスト1件とポジティブコントロール1件を追加。差し引き −2）、全通過。型チェックも通過。

### ミュータント検証（管理者が実行）

| ミュータント | 結果 |
|---|---|
| YouTube 経路を復活（`if (game.youtubePopularity !== undefined) return true;`） | 新規回帰テストが**1件だけ**失敗 ✅ |
| `meetsPopularityThreshold` を常に `false` に | ポジティブコントロール3件＋統合テスト3件の**計6件**が失敗 ✅ |

### `/code-review` 指摘1件 → 別 Issue #274 に分離

`meetsPopularityThreshold(game)` が `finalizeGameMetadata` の**戻り値ではなく引数（finalize 前のオブジェクト）**を読んでいるため、finalize 中に Steam Storefront から取得した `steamRecommendations` が話題性判定に効かない、という指摘。前提5点をすべて実読で確認し**正しいと判断**した上で、本PRでは修正せず Issue #274 に分離した。

判断根拠:

- **既存バグである**（`main` の `ba195e6` でも同じく finalize 前オブジェクトを渡していた。本PRは第2引数を消しただけ）
- **供給を増やす方向の変更**であり、#235 はそもそも「供給件数が変わる変更を PR-I の前後比較に混ぜない」という理由で分離された Issue なので、同じ理由でここに混ぜるべきではない
- **本PRの等価性証明は無効化されない**（証明は同一入力に対する変更前後の関数一致を示すもの。変更前・変更後のどちらも同じ `game` を読むため等価性は厳密に成立する）

規模の実測（2026-08-10 スナップショット / 320ゲーム）: `steamRecommendations` 未取得 152件、うち `steamAppId` も無く集約時に Storefront をスキップした 89件、うち `igdbSlug` があり finalize の IGDB 再検索が走り得る（＝ギャップ母集団）**89件**。ただし実際に採否が変わるにはさらに「finalize 後も developer が欠落」「finalize の Storefront が 5,000 以上を返す」が必要で、**実害の発生件数は未計測**。

なお **89件はギャップ母集団の下限**である。`steamAppId` を持ちながら `steamRecommendations` が未取得の 63件のうち、集約時の Storefront 呼び出しが一過性で失敗したもの（今回の実行ログでは **4件失敗**）は `finalizeGameMetadata` 側の再取得（`finalize-game-metadata.ts` の `needsStorefrontCompletion`）で成功し得るため、同じギャップに該当する。Issue #274 の規模をこの数字から見積もる場合は下限として扱うこと。

### Issue #217 への材料

当初、8/10 データで `めっちゃカメレオン` → `Meccha Chameleon` の**日英マッチが成立した**と記録したが、**これは誤りだった**（PR #275 の `/code-review` で指摘され、コード実読で確認）。実際の機構は次のとおり:

1. Steam は `cc=jp&l=japanese` で取得するため（`fetch-steam.ts:50, 204, 270`）、このゲームは**日本語タイトル `めっちゃカメレオン` のまま `gameMap` に入る**
2. YouTube のマージ（`fetch-data.ts:246-279`）は IGDB エンリッチ（同 `:281` 以降）**より先に走る**ため、照合は**日本語同士**で成立した
3. その後 IGDB エンリッチが `game.title = igdb.name`（同 `:327`）で英語名に上書きし、`normalizedTitle` も再計算した（同 `:328`）

照合ロジック自体に音訳・日英変換は無い。`titleJa` はタイトル照合に使わないことが `game-identity.ts` の `GameIdentitySignals` に明記されている（loose の部分一致で日本語シリーズ名が誤マージするため）。実データでも `Meccha Chameleon` は `titleJa = 'めっちゃカメレオン'` / `normalizedTitle = 'meccha chameleon'` となっており、上記の経路と整合する。

**したがって §3.5 の「日英表記でマッチしない」という 8/07 実測の見立ては覆っていない。** むしろ 8/10 データはそれを裏付けている:

| 抽出タイトル | 件数 | 状況 |
|---|---|---|
| `Beast of Reincarnation` | 2 | **同一ゲームが英語・カタカナで別キーに分裂している** |
| `ビーストオブリンカネーション` | 1 | 同上 |
| `マイクラ` | 4 | 略称と正式名が別キーに分裂している |
| `マインクラフト` | 1 | 同上 |

`normalizeTitle` による集約は表記が一致するものしかまとめられないため、上記4種は**4つの独立したエントリ**として `youtubeTitleCounts` に載る。#217 は「タイトル抽出の精度」と「日英・略称の照合」という2つの独立した問題を、この前提のまま検証してよい。

**教訓**: 実データで観測した英語タイトルを見て「日英マッチが成立した」と結論づけたが、**そのタイトルは照合の後で書き換えられた値**だった。データフロー上の「いつその値になったか」を確認せずに、最終的な値から遡って機構を推論したことが原因。

---

  PR #276（Issue #236 対応）

  【共通ヘッダ】

# PR #276: 大手企業のインディー判定漏れを塞ぐ（Issue #236 ②）

- ブランチ: `fix/issue-236-parent-publisher-entries`
- Issue: **#236**（**Closed にしていない。①が未解決のため**）
- 関連: **#231**（Closed。方針の根拠が実測で崩れた）/ **#277**（本PRのレビューの横断確認で新規起票）/ **#175**（上位タスク）

## 何が壊れていたか

`MAJOR_PUBLISHER_SUBSIDIARIES` は `// Microsoft / Xbox Game Studios` や `// Sony Interactive Entertainment` という**コメント見出し**の下に子会社だけを列挙し、親会社そのものがエントリとして存在しなかった。そのため `isLargeStudio('Xbox Game Studios')` が `hit: false` を返していた。ただし `isLargeStudio`（`indie-classifier.ts:245-258`）は `LARGE_DEVELOPERS` を走査した後に **`MAJOR_PUBLISHER_SUBSIDIARIES` も走査する**。このリストには実データで publisher として現れる名前（`2K Games` / `Bethesda Softworks` / `Blizzard Entertainment` / `Rare` 等）が含まれているため、**修正前の publisher 側ゲート（`select-indie-with-fallback.ts:98`）は「親会社名が偶然 `LARGE_DEVELOPERS` にも載っている場合だけ機能する」という記述が示唆するより広い範囲で発火していた**。

## 影響範囲は5箇所（引き継ぎ文書は2箇所と見積もっていた）

管理者が実読で確認した消費者一覧:

| # | 箇所 | 影響 |
|---|---|---|
| 1 | `select-indie-with-fallback.ts:97-98` | インディー枠ゲート（developer/publisher両方）→ 供給↓（狙い） |
| 2 | `select-indie-with-fallback.ts:120` | 話題性ルートの publisher ゲート → 供給↓ |
| 3 | `fetch-data.ts:1130`（`isIndieGame`） | 候補プール構築段階の絞り込み（developer のみ）→ 供給↓ |
| 4 | `select-newreleases-with-fallback.ts:75-76` | `game.developer` を canonical 名で上書き。その値は `validateGameSourceConsistency`（`validate-article.ts:720-722`）経由で `matchGameToSteamEntity` の company 軸（`game-identity.ts:382`）に流れる。company 軸が `disagree` になると、判定表の行4（title disagree + year unknown + company disagree）で `verdict='different'` となり、severity `high` の `game-source-mismatch` 警告（`validate-article.ts:728-733`）が出る。ただし company 軸が verdict を左右するのは**判定表の行4に限られる**（行1「title agree かつ year が disagree でない」なら company 軸に関わらず `same`）。また company 軸は `gameCompanies = [game.developer, game.publisher]` として developer・publisher の両方を見るため（`game-identity.ts:382`）、publisher 側は上書きされない以上、developer の上書きだけで verdict が変わるとは限らない。実害は未測定 **⚠️ PR #291 / Issue #277 でこの上書き自体を撤去した。ここに書かれていた「実害は未測定」は PR #291 で測定され、`displayName` への差し替えでは company軸が実際に `disagree` へ転落することが確認された** |
| 5 | `generate-articles.ts:417`（`pickNewReleaseLabelCompany`） | 新作記事のラベル「◯◯の新作」 |

**新作枠の採用可否ゲートは §11.1 確定事項 #1 のとおり PR #237 で撤廃済み**なので、新作枠への波及は採用件数には及ばない。ただし**「ラベル表記のみ」でもない**: 項目4のとおり developer の canonical 上書きは `matchGameToSteamEntity` の company 軸を経由し、判定表の行4に限って severity `high` の `game-source-mismatch` 警告に波及し得る（行1が成立する場合や publisher 側が一致している場合はこの経路の影響を受けない）。**実害は未測定**である。**⚠️ PR #291 / Issue #277 でこの上書きを撤去した。実害は測定され、`displayName` への差し替えでは `matchGameToSteamEntity` の company 軸が `disagree` へ転落することが確認された**。

## 追加したエントリ

`LARGE_DEVELOPERS` に3エントリ。`Xbox Game Studios` / `Sony Interactive Entertainment` / `Nippon Ichi Software`。

- **`Halo Studios` は追加していない**（publisher=`Xbox Game Studios` 経由で救えるため、改称スタジオ名の個別追記は不要だった）
- 単体の `sony` / `xbox` / `playstation` エイリアスは追加していない（既存のネガティブテスト `Sony Pictures Imageworks → hit: false` を保護するため）
- 子会社見出し9群のうち親会社エントリが欠けていたのは Microsoft/Xbox と SIE の**2群だけ**で、追加対象は列挙可能な穴だった

## 実データによる変更前後比較

`DEV_MODE=true npm run fetch-data` をライブ実行して**2026-08-11T02:12Z のスナップショット（314ゲーム / 発売日90日窓 81件）**を取得し、**同一スナップショットに変更前（main）と変更後の分類器を両方適用**して測定した。fetch を2回走らせるとライブデータが変わって比較にならないため「1回の fetch + 2つの分類器」で決定論的に測った。

| 指標 | 変更前 | 変更後 |
|---|---|---|
| 大手ゲート hit | 14件 | 16件 |
| インディー候補として残る | 67件 | 65件 |

判定が変わったのは2件だけ:

| ゲーム | developer (`developed`) | publisher | 除外経路 |
|---|---|---|---|
| ほの暮しの庭 | `Nippon Ichi Software, Inc.`（3） | `NIS America, Inc.` | developer 側 |
| Halo: Campaign Evolved | `Halo Studios`（16） | `Xbox Game Studios` | publisher 側 |

回帰条件: PocketPair(7) / Yacht Club Games(12) / ZA/UM(6) はいずれも変更前後とも `hit=false`。スナップショット内の該当5タイトルもインディー判定のまま。

## `/code-review` 指摘への対応

指摘1件（medium）。`'nis america'` を `Nippon Ichi Software` のエイリアスにしたため canonical が記事ラベルに出て誤帰属になる、というもの。管理者の実測:

- `pickNewReleaseLabelCompany('FuRyu', 'NIS America, Inc.')` → `Nippon Ichi Software` → ラベル「Nippon Ichi Softwareの新作」
- **このエイリアスの実データ上の修正効果はゼロ**（『ほの暮しの庭』は developer 側で除外されるため publisher 側は冗長）

レビューは「別 canonical `NIS America` を立てる」を提案したが、それでは「NIS America は大手」という未検証の仕様上の主張が残り、レビュー自身が挙げた過剰除外の懸念が解消しないため、**エイリアスごと削除**した。削除後も変更前後比較は完全に同一だった。

## ミュータント検証

管理者が自分で再実行。`indie-classifier.ts` を main のものに差し替えると、エイリアス削除**前**は 8件失敗/168件成功、削除**後**は 7件失敗/169件成功。`NIS America, Inc. → hit: false` のテストは main の状態でも成功するため、キルされるミュータントからネガティブコントロールに変わったという想定どおりの変化。

## 残る課題

①（IGDB のレコード分裂）は未解決。加えて今回追加した `Nippon Ichi Software` エントリは①の症状を個社で塞いでいるため、**この企業については①が観測しにくくなった**。①を検証する際は別の企業で測る必要がある。

### Issue #277: `isLargeStudio` の canonical 名が別法人・別部門に化ける

`NIS America` の指摘（上記「`/code-review` 指摘への対応」）を横断確認する過程で、`isLargeStudio` の既存欠陥を発見し #277 として起票した。`canonical` 名がエイリアスの実体と別の法人・別部門を指すエントリが既にあり、`Nintendo` → `Nintendo EPD`、`Bethesda Softworks` → `Bethesda Game Studios` のように、記事に出る企業名がゲームの実際の発売元・開発元とは異なる部門名にすり替わる。

**本PRで追加したエントリも同じ欠陥クラスの新しい実例である**: `Xbox Game Studios` は alias に `microsoft` を、`Sony Interactive Entertainment` は alias に `playstation studios` を持つ（`indie-classifier.ts:75, 86`）。そのため developer/publisher が「Microsoft」のタイトルはラベルが「Xbox Game Studiosの新作」になり、上記の項目4の経路で developer 表記も同様に書き換わる。

**規模は未測定**。全エントリ中の該当件数を機械的に列挙しようとしたが断念した: 文字列の類似度では「別法人か否か」を判定できない（`nintendo` は `Nintendo EPD` の部分文字列であり、素朴な包含判定では `Nintendo → Nintendo EPD` のような代表例自体が「一致」と誤判定されて漏れる）ため。

✅ **解決済み（2026-08-12。PR #291）**: `DeveloperEntry` に `displayName` フィールドを追加し、規模判定用の内部識別子（`canonical`）と読者向け表示名を分離した。`displayName` を付けたのは3エントリのみ（`Nintendo EPD` → `任天堂`、`Xbox Game Studios` → `Microsoft`、`Bethesda Game Studios` → `Bethesda`）。`2K Games`（`2k boston`/`2k czech` は傘下スタジオ）と `PUBG Studios`（`pubg corporation` は旧社名）は「別法人に化ける」構造ではないため対象外と判断した。あわせて `vetNewReleaseCandidate`（`select-newreleases-with-fallback.ts`）の `game.developer` の canonical 上書きを撤去した（`displayName` で上書きすると `matchGameToSteamEntity` の company 軸が `disagree` へ転落し、severity `high` の `game-source-mismatch` を誤発報する実害が測定されたため）。**撤去前の該当コードは `fc191d1^` 時点の `:75-76`**（`const finalDeveloper = devResult.hit ? devResult.matched : ...`）。現在の同ファイルの `:66-81` は「なぜ上書きしないのか」を説明するコメントに置き換わっている。

### 教訓

- **引き継ぎ文書が挙げる「影響箇所」の件数を信用しない。** 2箇所と見積もられていたが実読で5箇所あった。特に `generate-articles.ts:417` の記事ラベル経路は文書に記載が無く、canonical 文字列が読者向け表示に直結していた
- **「前のIssueがその方針を退けた」という理由を、退けた根拠ごと再検証する。** #231 は「PR-I の `developed` 判定が代わりに直す」として個社追記を退けたが、その `developed` 判定が実測でこのケースを覆っていなかった。**方針の結論ではなく、方針が依拠した機構が今も成立しているかを確認する**

---

# PR #279: 話題性ルートの判定に finalize 後のオブジェクトを渡す（Issue #274）

- ブランチ: `fix/issue-274-popularity-route-finalize`
- Issue: **#274**（Closed）。PR #273 の `/code-review` で分離
- 関連: **#280**（本PRの `/code-review` で新規分離）

## 何が壊れていたか

同じ `if` 文の中で finalize 前後のオブジェクトが混在していた。`isOnlyDeveloperMissing(finalizeResult.game)`（finalize 後）と `meetsPopularityThreshold(game)`（finalize 前）。`finalizeGameMetadata` は入力をシャローコピーして返す（`finalize-game-metadata.ts:44`）ため、Storefront から取得した `steamRecommendations`（同 `:225-226`）は戻り値側にしか無い。`NORMAL_REQUIRED` の `steamRecommendations: true` は Storefront 呼び出しのトリガー用フラグで、取得した値が判定に使われていなかった。

## 単調性（Issue にも引き継ぎ文書にも書かれていなかった不変条件）

`meetsPopularityThreshold` が読むのは `steamRecommendations` と `steamRank` の2つだけ。前者は `undefined` のときにしか書かれず（`finalize-game-metadata.ts:225`）、**後者は finalize が一切書かない**（grep で確認）。したがって修正後の判定は修正前の**上位集合**であり、採用件数が減るリスクは構造的にゼロ。

## 実データによる実害測定（2段階）

### 第1回（本番と同じ条件）→ 検出力ゼロ。結論に使えない

`DEV_MODE=true npm run fetch-data` を本番と同じ `targetCount=2` で実行したところ計測ログは0件。しかし `selectIndieGamesWithFallback` は `while (adopted.length < targetCount && queue.length > 0)` で回るため、**上位2候補（Palworld / Scrap Mechanic）が通常ルートで採用された時点でループが終了**し、24候補中2件しか `vetIndieCandidate` に到達せず**話題性ルートは一度も評価されなかった**。「計測して0件」と「計測経路に到達していない」は別物である。

### 第2回（全候補）→ 実害0件

保存済みスナップショット（`fetchedAt=2026-08-11T04:24Z` / 315ゲーム）に対して全候補を vet し直した。YouTube クォータを再消費しないよう fetch は再実行せず、`fetch-data.ts` の `main()` 呼び出しだけを取り除いた複製から `buildIndieCandidates` を読んだ（依存モジュール22件に無ガードの `main()` が無いことを事前確認）。`cooldown` は空にしたため本番より広い**上限母集団**。

| 指標 | 件数 |
|---|---|
| インディー候補（cooldown 無し・上限） | 24 |
| vet 通過 | 22 |
| `still-missing-required` に到達 | 2 |
| うち `onlyDevMissing=true` | 2 |
| **うち pre≠post（判定が変わる）** | **0** |
| **finalize が `steamRecommendations` を補完** | **0** |

到達した2件（Home4Us / The Sculptor）はいずれも **`steamRank`（6位 / 12位）で既に閾値を満たしており**、`steamRecommendations` は finalize 前後とも未取得だった。`steamRank` は finalize が触らないため、この2件では pre/post の区別が判定に影響しない。

**本スナップショットでの実害は0件。ただし1スナップショットの測定であり「発生しない」証明ではない**（Issue #240 と同じ留保）。

計測は一時的なコードを当てて行い、**測定後に削除**したのでPRには含まれない。

## 実害0でも修正した理由

1. 同じ `if` 文で finalize 前後が混在している不整合そのものが、将来の変更で誤りを増幅する
2. 単調性により供給が減るリスクが構造的にゼロで、修正コストが低い
3. `steamRecommendations: true` が Storefront 呼び出しをトリガーしているのに、取得した `steamRecommendations` の値だけが捨てられていた（同じ呼び出しで得られる cover / publisher / sourceUrls は使われているため、呼び出し自体が無駄だったわけではない）

## テスト

1178 → 1181。Issue が要求した設計（**入力側に `steamRecommendations` を持たず finalize のモック戻り値にだけ持つ** フィクスチャ）に従った。既存の `lemorion_1224` テストは入力側とモック戻り値が同一オブジェクトで finalize 前後の区別に盲目なため、そのままでは修正前でも通ってしまう。新規は本体 / ネガティブコントロール（4999）/ 境界値（5000）の3件で、`expect(candidate.steamRecommendations).toBeUndefined()` のガードを入れて前提自体をテストが保証するようにした。既存テストは削除も変更もしていない。

**ミュータント検証**（管理者が再実行）: 修正を元に戻すと**2件が失敗**（本体・境界値）。ネガティブコントロールは閾値未満でどちらの実装でも不採用なので不変であり、これは想定どおり。

## `/code-review` 指摘 → Issue #280 に分離

話題性ルートが `steamRawDeveloper` に対して `isLargeStudio` を一度も呼ばないため、実在スタジオが「個人開発」として載り得るという指摘。実測で確認した内容:

- `isQualifiedCompanyName`（`steam-utils.ts:35-39`）は「英数字とアンダースコアのみで20文字未満」を弾くため、**`Nintendo` / `Capcom` / `SEGA` / `Valve` / `Konami` / `Ubisoft` / `Bethesda` はすべて `developer` 未設定になる**（いずれも `isLargeStudio=true`）
- 話題性ルートの大手ガードは `publisher` にしか掛かっていない（`select-indie-with-fallback.ts:129`）ため、`個人開発（Capcom）` のようなラベルが生成され得る
- `個人開発（Petroglyph）` が `src/content/issues-dev/issue-019.md`（**DEV_MODE 出力**）に存在する。**公開済み記事には出ていない**（`src/content/issues/issue-012.md` の `個人開発（lemorion_1224）` は Steam アカウント名で意図どおり）
- レビューが提案した `isLargeStudio(steamRawDeveloper)` の追加は**大手のケースは塞ぐが Petroglyph のような中小スタジオの誤ラベルは塞がない**（静的リストに無いため）

本PRで直さなかった理由: 既存欠陥であること、対処が**供給の減る方向**で Issue #274 の修正（増える方向・単調）と性質が逆であり同一PRでは前後比較が解釈不能になること、本PRによる露出拡大が実測で0件であること。

### 教訓

- **「計測して0件」と「計測経路に到達していない」を区別する。** 本番と同じ条件で計測ログが0件だったが、これはループが2候補で打ち切られ話題性ルートが一度も動かなかったためだった。**計測する前に「その経路は何件処理されるのか」を確認する**こと

---

# PR #282: 話題性ルートの大手ゲートに steamRawDeveloper を追加する（Issue #280）

- ブランチ: `fix/issue-280-popularity-route-developer-gate`
- Issue: **#280**（Closed）。PR #279 の `/code-review` で分離
- 関連: **#284**（欠陥B。本PRから新規分離）・**#285**（欠陥2。本PRから新規分離）・**#274**（本Issueの出所）

## 何が壊れていたか（Issue #280 が挙げた欠陥1）

話題性ルートの大手ゲートは `publisher` に対してのみ `isLargeStudio` を呼んでおり（`select-indie-with-fallback.ts:129`）、`steamRawDeveloper` を全く見ていなかった。一方、`isQualifiedCompanyName`（`steam-utils.ts:35-39`）は「英数字とアンダースコアのみで20文字未満」を弾くため、単一トークン社名である `Nintendo` / `Capcom` / `SEGA` / `Valve` / `Konami` / `Ubisoft` / `Bethesda` はすべて `developer` 未設定になる（いずれも `isLargeStudio=true`）。この2つの条件が組み合わさることで、`個人開発（Capcom）` のような誤ラベルが生成され得た。

## 着手前の独立検証で判明したこと

### 該当する大手は7社ではなく計15社

Issue #280 本文は Nintendo / Capcom / SEGA / Valve / Konami / Ubisoft / Bethesda の7社を挙げていたが、管理者が実測すると**計15社**が同条件（`isQualifiedCompanyName`=false かつ `isLargeStudio`=true）に該当した。追加8社は:

- FromSoftware
- Atlus
- Rockstar
- Activision
- Blizzard（`MAJOR_PUBLISHER_SUBSIDIARIES` 経由）
- Microsoft
- EA
- Falcom（Bethesda も同じく `MAJOR_PUBLISHER_SUBSIDIARIES` 経由）

### 仕様書に記述が存在しない「個人開発」ラベル経路

**✅ PR #299 で経路自体が廃止された**（2026-08-12。マージコミット `6dde6b5`）。以下は PR #299 以前の記録。

`個人開発` ラベル経路は **`docs/article-category-spec.md` に記述が存在しない**（`grep -r '個人開発'` でヒット0件）。出所は Issue #97 の**コメント**（本文ではない）で、「『個人開発（〇〇）』表記の品位: アカウント名そのまま括弧内に入れることが許容範囲か運用後に判断」と保留項目として書かれたまま仕様に昇格していない。

### 公開記事への実害の確認（PR #299 以前）

`grep -r '個人開発（' src/content/issues/` を実行したところ、ヒットは `src/content/issues/issue-012.md` の `個人開発（lemorion_1224）` のみで、これは実際のSteamアカウント名なので誤りではない。`個人開発（Petroglyph）` は DEV_MODE 出力（`issues-dev/issue-019.md`）にのみ存在し、公開記事には出ていない。

## 実データによる前後比較測定（決定論的）

ユーザー承認を得て `DEV_MODE=true npm run fetch-data` をライブ実行し、新規スナップショット316件（`fetchedAt=2026-08-11T12:56:55.814Z`）を取得した。同一スナップショットに旧ロジック（修正前）と新ロジック（修正後）の両方を適用する決定論的比較（PR #276 で確立した手法）を実施した。

| 指標 | 件数 |
|---|---|
| インディー枠候補（通常ルート） | 27 |
| うち話題性ルート到達 | 5 |
| **うち新旧で判定が変わる** | **0** |

話題性ルートに到達した5件は:

1. **Soulmask**: `developer` 無・`developerGameCount` 無・`publisher=Qooland Games`（非大手）→ **新旧とも採用**
2. **Sunkenland**: `developer=Vector3 Studio`（非大手）→ 大手ゲート評価前に不採用（`publisher` が無いため別経路で弾かれる）
3. **Satisfactory**: `developer` 無・`publisher=Coffee Stain Publishing`（非大手）→ **新旧とも採用**
4. **Enshrouded**: `developer=Keen Games`（非大手）→ **新旧とも採用**
5. **V Rising**: `developer=Stunlock Studios`（非大手）→ **新旧とも採用**

**変更前後で判定が変わった候補は0件。供給は減らない。**

### ポジティブコントロール

話題性ルートに到達した5件はいずれも非大手だったため、新ゲートが実際に大手を弾くことを別途確認した。Issue #280 本文の7社 + 追加8社のうち、スナップショットに含まれている社名を `steamRawDeveloper` に持つレコードを抽出し、手動で `candidate` 相当のオブジェクトを作成して `isLargeStudio` を評価した。結果:

- **Capcom**: `true`（`LARGE_DEVELOPERS` 経由）
- **Nintendo**: `true`（`LARGE_DEVELOPERS` 経由）
- **Valve**: `true`（`LARGE_DEVELOPERS` 経由）

**新ゲートは大手に対して実際に発火することを確認した。**

## `/code-review` の結果（指摘1件を採用、信頼度100）

5エージェントのうち4件が同じ箇所を指摘したが**結論が正反対**だった:

- **2件**: 「Steam由来の名前とIGDB由来の件数を組み合わせるペアリング違反」（`steamRawDeveloper` + `developerGameCount`）
- **2件**: 「第2引数は常に undefined で到達不能」

両立しないため管理者が実コードで検証した。

### 検証結果: 後者が正しい（第2引数は常に undefined）

`developerGameCount` の全書き込み箇所を追跡:

1. **`fetch-igdb.ts:486-488` / `:857-859`**: 同一 `involved_companies` レコード由来で `developer` と同時にのみ設定
2. **`fetch-data.ts:135` / `:337` / `:611`**: `pickDeveloperGameCount` が `developer` をガードしており、`developer` が無いと `undefined` を返す
3. **`fetch-data.ts:385`**: 同一 `igdb` オブジェクトから同一リテラル内で `developer` と同時に代入
4. **`finalize-game-metadata.ts:81`**: `pickDeveloperGameCount` でガード

**すべての書き込み箇所で `developerGameCount` は `developer` と同時にのみ設定され、`developer` を解除する経路は存在しない。** したがって `developer` 未設定が到達条件のこの経路（`isOnlyDeveloperMissing` が `true`）では、`developerGameCount` は常に `undefined`。ペアリング違反（前者）は起こり得ない。

### 対処

- 第2引数 `developerGameCount` を削除
- コメントを「渡さない理由」の説明に差し替え
- 到達不能な状態（`developer` 未設定かつ `developerGameCount` 設定済み）を前提にしていたテスト3件（count=50/21/20）を削除

テストは 1181 + 6（新規）- 3（削除）= 1184 件になった。

### ミュータント検証（管理者が再実行）

ゲートを修正前（`publisher` のみ）に戻すと Capcom のテストが1件失敗し、ポジティブコントロール（`NaipSoft`）は通過し続けた。**テストが自明に緑になっていないことを確認した。**

## 分離した課題

### Issue #285（欠陥2）

開発本数による規模判定をこの経路に効かせるには `steamRawDeveloper` に対応する開発本数を新たに引く仕組みが必要。`developerGameCount` は IGDB の `involved_companies.company.developed` 由来で、`steamRawDeveloper` は Storefront の `app_details.developers[0]` 由来のため、現状では紐づかない。実害は未測定。

### Issue #284（欠陥B）

`isQualifiedCompanyName` が Petroglyph / Supergiant / Klei / tinyBuild のような中小の単一トークン社名を誤ってアカウント名と判定する。影響は話題性ルートに限らず `finalize` 全体（新作枠・名作枠を含む）。ラベル表記自体が仕様未確定である点も含む（`docs/article-category-spec.md` に記述が無い）。

## テスト

1181 → 1184。新規6件を追加し、うち3件を `/code-review` 指摘により削除した。

### 新規テスト（残存3件）

1. **Capcom**: `steamRawDeveloper='Capcom'` / `publisher='Capcom'`。新ゲートで弾かれることを確認
2. **NaipSoft**（ポジティブコントロール）: 非大手。新旧とも採用
3. **Steam名無し・件数有り**（ネガティブコントロール）: `developerGameCount=50` だが `steamRawDeveloper` 無し。第2引数を渡していた当初実装では弾かれたが、削除後は通過

## 教訓

### 自分の実装の前提（データフロー上の制約）を実装前に確認する

「通常ルートと軸を揃える」という発想は妥当だったが、`developer` 未設定が到達条件の経路に `developer` と同時にしか書かれない値を渡しても意味がないことを、実装前に確認していなかった。**到達条件と渡す値の依存関係を実装前にコードで追跡すること。**

### レビューエージェントが同じ箇所について正反対の結論を出すことがある

両立しない指摘は多数決ではなく、管理者が一次ソース（実コード）で決着させる。今回は4件の指摘が2-2に割れたが、書き込み箇所を grep で全件追跡することで結論を確定した。

### スナップショットが古いと「0件」に検出力が無い

測定中に `data/aggregated.json` で「count有・developer無」を数えて0件を得たが、当該スナップショットは `fetchedAt=2026-05-16` で `developerGameCount` フィールド自体が存在せず、この0件は無意味だった。結論は実データではなくコード上の不変条件（全書き込み箇所で `developer` と同時にのみ設定）から導いた。**スナップショットの取得日時とスキーマ変更歴を突き合わせること。**
- **副作用のあるスクリプトでも、`main()` 呼び出しだけを除いた複製を作れば分析に使える。** 再 fetch による外部APIクォータの消費を避けつつ、本番と同じロジックで測れる。複製前に依存モジュール全件に無ガードの `main()` が無いことを確認すること

---

# PR #288: 特集枠の候補母集団に isFanGame 除外を適用する（Issue #232）

- ブランチ: `fix/issue-232-feature-fangame-filter`
- Issue: **#232**（Closed）
- 関連: **#289**（本PRの着手前検証で新規起票）
- PR: #288（マージ `6829685`。2026-08-12）

## 何が壊れていたか

特集枠の候補母集団（`deduplicated`、`generate-articles.ts` 内）に対して `isFanGame` 除外フィルタが一切掛かっていなかった。新作枠・インディー枠・名作枠は `scripts/fetch-data.ts` の各 `build*Candidates` 関数でフィルタを適用しているが、特集枠だけは `generate-articles.ts` 側に選定経路があり見落とされていた（§6.1 が既に指摘済み）。

## 着手前の独立検証で判明したこと

### Issue #232 が対象としていたコードは特集記事に使われていない

Issue #232 本文は `scripts/fetch-data.ts:1316` の `selectedGames.featured` 選定を対象としていたが、**この値は特集記事の素材になっていない**。

- `generateFeatureArticle` の呼び出し（`generate-articles.ts:1421`。**本PRのマージ後の行番号**。マージ前は `:1394`）に渡されるのは `filteredAllGames`（`:1408-1412` で構築）であり、`selectedGames.featured` ではない
- `git log -S 'selectedGames.featured' --all -- scripts/generate-articles.ts` で全履歴を確認したが、`selectedGames.featured` が特集記事生成関数に渡されたことは**一度もない**
- `generate-articles.ts:1393` のコメント「（selectedGames.featured は特集記事自身の素材のため除外しない）」は**事実に反する**（コミット `8130eb8`、2026-04-11 で追加。行番号は本PRのマージ後の値で、マージ前は `:1366`）
- `featured` に現存する効果は3つのみ: ①`fetch-data.ts:1327` の `alreadySelected` に入り**名作枠の重複除外リストになる** ②`fetch-data.ts:676`/`:851` で IGDB/Metacritic の追加取得対象になり**APIコストを消費する** ③`completeness-gate.ts:451` のチェック対象

この件は **Issue #289** として起票済み（タイトル: 「fetch-data.ts の featured 選定が特集記事に使われていない（コメントも事実に反する）」）。

**✅ 解決済み**（2026-08-12。PR #294）。対処 **(c) 削除**を採用し、`SelectedGames.featured` フィールドと全消費者を削除した。

### 仕様 §6.2 の「他の枠を継承」は継承先が一意に定まらない

Issue が特集枠への適用を求めたのは `isFanGame` だけだが、仕様書 §6.2 は「リメイク・リマスターも他枠の方針を継承」と書いている。しかし継承元が3通りに割れている:

| 枠 | リメイク・リマスター方針 |
|---|---|
| 新作紹介 | Main Game + リメイク + リマスターを許可 |
| インディー | Main Game のみ（一律除外） |
| 名作深掘り | Main Game + 原作が母集団にいないリメイク・リマスターを許可 |

→ **ユーザー判断で決着（2026-08-12）**: 特集枠には**リメイク・リマスターを意図的に非適用**とする。理由: ①継承元が3通りに割れて一意に定まらない ②特集はテーマに合うゲームを横に並べる枠であり、リメイクでもテーマ適合性は損なわれない。

## 適用位置を1箇所にした理由

特集候補の入口は2経路ある:

1. **経路1**: `aggregated.json` 由来（`relatedGames` から構築）
2. **経路2**: LLM 提案 → `verifyProposedGames` の実在検証通過分

この2経路は `deduplicated`（`deduplicateGames([...(relatedGames ?? []), ...proposedAndVerified])`）で合流する。さらに、`deduplicated` を `isQualifiedGame` で分割して `qualified` / `fringe` を作るが、この2つは相補的な二分（qualified = true / qualified = false）なので、**分割前の `deduplicated` に掛ければ両方に効く**。

→ したがって、`isFanGame` を `deduplicated` への1箇所適用で、経路1・経路2の両方と、qualified / fringe の両分岐をカバーできる。

実装位置: `generate-articles.ts:796-811`。`deduplicated` の構築（`:784`）と `qualified` / `fringe` の分割（`:814-815`）の間に挟む。`isFanGame` を候補ごとに1回だけ評価し、除外したタイトルをそのまま記録できるよう、`filter` ではなく単一パスのループにした:

```ts
const allCandidates: GameData[] = [];
const excludedFanGameTitles: string[] = [];
for (const g of deduplicated) {
  if (isFanGame(g)) {
    excludedFanGameTitles.push(g.title);
  } else {
    allCandidates.push(g);
  }
}
```

除外したタイトルは `fetch-data.ts:1302-1307` の `[indie] rejected candidates:` の前例に倣ってログに出す。**件数は0件でも常にログする**（「除外が0件だった正常系」と「フィルタが動いていない異常系」をログ上で区別できるようにするため）。

## 実データによる前後比較測定

管理者がユーザー承認を得て `DEV_MODE=true npm run fetch-data` を実行（2026-08-11 15:20 JST）。新規スナップショット315件、`fetchedAt=2026-08-11T15:20:45.532Z`。

**検出力の確認が必要だった点**: 既存の `data/aggregated.json`（`fetchedAt=2026-05-16`）は `keywords` を持つゲームが**0件**、`gameType` を持つゲームが**0件**で、`isFanGame` / `isRemakeOrRemaster` の判定に必要なフィールド自体が存在しなかった。そのまま測ると「0件」に検出力が無いため、ライブ fetch で測り直した。新スナップショットは keywords 292/315、gameType 311/315。

### 候補の変化

| 指標 | 変更前 | 変更後 |
|---|---|---|
| 経路1候補（`relatedGames` 相当） | 310 | 310 |
| qualified | 227 | 225（−2） |
| fringe | 83 | 83（−0） |

除外された2件（いずれも qualified 側）:

| タイトル | 検出理由 | igdbRating / igdbRatingCount |
|---|---|---|
| Black Mesa | `keywords=[fangame]`（`gameType=8`） | 87.7 / 547 |
| Pokémon Infinite Fusion | `keywords=[unofficial,fangame,fanmade]` | 98.4 / 23 |

- Black Mesa は商業リリース作品なので `isFanGame` の判定は厳しめだが、**他の3枠では既に同じ `isFanGame` で除外されている**。本PRは枠間の不整合を解消する方向の変更
- 2件は qualified の115番目 / 146番目で、フォールバックの上位20件（`FEATURE_CANDIDATE_LIMIT = 20`）の窓の外にある。ただし `prefilterFeatureCandidatesByTheme` は候補数が上限を超える場合に**全227件をLLMへ送る**ため、どちらも選定され得る（到達可能性を管理者が確認済み）
- 修正後も qualified 225件で `FEATURE_MIN_GAMES = 3` に対し供給は十分
- なお `Pokémon Infinite Fusion` が過去号（`issue-017.md:202`）に載っている件は `category: classic` であり、§6.1 が「PR #230 で名作枠に適用して解消した」と記録しているケースそのもの。特集経路の実害例ではない

## テスト

### 新規5件の内容

1. **`keywords: ['fangame']` のゲームが候補から除外される**
2. **ポジティブコントロール**: 通常ゲーム2件（`keywords=['action']` / `keywords=['adventure']`）はどちらも残る
3. **回帰: `gameType: 8`/`9`（リメイク・リマスター）は除外されない**
4. **タイトル `Unofficial Pokemon Game` が除外される**（タイトル正規表現）
5. **除外されたタイトルが `console.log` に出力される**（スパイは `finally` で復元）

テスト数: 1184 → **1189**（新規5件）、全通過。

### ミュータント検証（管理者が実施）

除外を `const allCandidates: GameData[] = deduplicated;` に戻すと **3 failed | 29 passed**:

- 落ちたのは上記1 / 4 / 5 の3件（keywords検出・タイトル検出・ログ出力）
- ポジティブコントロール（2）とリメイク回帰（3）は緑のまま

復元後32件全通過を確認。

## `/code-review` の結果（4件すべてスコア80未満）

5エージェントで4件の指摘が出たが、**信頼度スコアはすべて80未満（50 / 0 / 50 / 0）でPRコメントは投稿しなかった**。管理者が個別に検証した採否:

| 指摘 | スコア | 採否と根拠 |
|---|---|---|
| 仕様書の「未適用 → Issue #232」が未更新 | 50 | **実質採用（本docs PRで対応）**。事実だが、本リポジトリは「コードPR → docs PR」を分離する運用（`CLAUDE.md`「コードPRにドキュメントを混ぜない」）。PR本文にフォローアップ予定を書いていなかったのは不備なのでPRにコメント追記した |
| 新規テスト5件のうち `finally` を使うのが5件目だけで不統一 | 0 | **却下**。1〜4件目はスパイもモックも作っていないため復元対象が存在しない |
| ポジティブコントロールが `keywords: ['action']` で「惜しい値」を使っていない | 50 | **却下**。`fan-translation`/`fanservice`/`fan-service`/`fanfiction` の near-miss は `game-filter.test.ts:48-63` が**同一テスト内にポジティブコントロールを同居させた形で**既に網羅済み。統合層のテストの役割は「パイプラインで実際にフィルタが掛かること」の検証なので、判定関数の境界値を再現するのは層の重複 |
| 「全件がファンゲーム」「空配列」の境界テストが無い | 0 | **却下**。空プールは `generate-articles.ts:958-966` の abort ガードがあり、Issue #221 の既存テスト（`:412-437`）が空配列入力で `mockInvoke` が呼ばれないことを検証済み |

## 分離した課題

### Issue #289

`fetch-data.ts:1316` の `featured` が特集記事に使われていないことへの対処3案:

- **(a)** 特集記事に使うよう経路を接続する（§4.5 の「2経路」構造が壊れる可能性）
- **(b)** 名作候補から除外する用途として維持（現状維持）
- **(c)** ゼロ本許可として削除（API コスト削減）

決着には、(b)/(c) を選ぶなら**先に名作枠候補数への影響を実データで測る**必要がある。

**✅ 解決済み**（2026-08-12。PR #294）。**管理者がライブfetch実測で測定**（2026-08-12、312件）し、**(c) 削除を採用**した:

| | 名作候補数 | 採用される1位 |
|---|---|---|
| `featured` を除外リストに含む（修正前） | 176件 | **The Witcher 3: Wild Hunt** |
| `featured` を含まない（PR #294） | 177件 | **Grand Theft Auto V** |

候補数の増加は単調（176→177）だが、**採用結果が別タイトルに入れ替わる非単調な変化**を引き起こす（名作枠のソートキーは `totalRatingCount` 降順で、GTA V = 5896 > Witcher 3 = 5430）。**Issue #289 本文が「単調な変化」としていた記述は不正確だった**: `featured` は「死んだ値」ではなく、名作枠から1件を締め出すフィルタとして実質機能していた。

## 教訓

### Issue が指すコードパスが複数あるときは、どれが実際に出力へ流れるかを `git log -S` で全履歴確認する

Issue #232 の記述が誤っていたのは、`isFanGame` 適用の検討が `fetch-data.ts` の3枠のビルダーを起点にしていたため。**Issue が指す「特集枠の選定経路」は2つあり、実経路は `generate-articles.ts` 側だった**。Issue 本文の「想定される修正」を鵜呑みにせず、`git log` で実際の使用箇所を追跡する必要があった。

### 仕様の「他の枠を継承」のような相対参照は、継承元が複数あって割れていると解決できない

§6.2 の「他の枠の方針を継承（→ §4.5）」は相対参照だが、§4.5 は特集の候補が複数経路から来ることを書いているだけで、リメイク・リマスターの扱いは新作=許可 / インディー=除外 / 名作=条件付き許可の3通りに割れている。コードでは決められないのでユーザー判断を仰いだ。

### スナップショットに測定対象フィールドが存在するかを先に確認する

**PR #279・PR #282 に続き3PR連続で踏んでいる罠**（#279 は `targetCount` の早期終了で経路に到達せず、#282 は `developerGameCount` フィールド自体が無く、本PRは `keywords` / `gameType` が無い）。`data/aggregated.json`（`fetchedAt=2026-05-16`）には `keywords` を持つゲームも `gameType` を持つゲームも0件で、そのまま測れば `isFanGame` の実害は「0件」になるが、それは検出力が無いだけだった。**測定の前に、対象フィールドがそのスナップショットに何件存在するかを `grep -c` で数えること。**

なお本PRでは今回さらに一歩進めて、**除外された2件が実際に選定され得るのか（到達可能性）も確認した**。2件は qualified の115番目 / 146番目でフォールバックの上位20件の窓の外にあり、そこだけ見れば「窓外なので実害なし」と誤結論しかねなかったが、`prefilterFeatureCandidatesByTheme` が候補数超過時に全件をLLMへ送るため到達可能だった。**「候補に入ったか」ではなく「選定され得るか」まで追うこと。**

---

# PR #291: `isLargeStudio` の canonical 名を表示用と規模判定用に分離する（Issue #277）

- ブランチ: `fix/issue-277-canonical-display-name`
- Issue: **#277**（Closed）
- 関連: **#236**（本Issueの出所）/ **#180**（ラベル方針の起源）/ **#175**（上位タスク）
- PR: #291（マージ `50e2c7a`。2026-08-12）

## 何が壊れていたか

`isLargeStudio` の `canonical` 名が、一部のエントリでエイリアスの実体と別の法人・別部門を指していた。例えば `Nintendo` → `Nintendo EPD`、`Bethesda Softworks` → `Bethesda Game Studios`、`Microsoft` → `Xbox Game Studios` のように、記事に出る企業名がゲームの実際の発売元・開発元とは異なる部門名にすり替わる。

`canonical` は規模判定用の内部識別子として機能していたが、`pickNewReleaseLabelCompany`（`generate-articles.ts:417`）で読者向けラベルにも使われており、「規模判定」と「読者向け表示」という異なる目的が1つのフィールドに載っていた。

## 着手前の独立検証で判明したこと

### Issue 本文の実害記述は経路として不正確だった

Issue は「記事のカテゴリラベル → 記事タイトルに誤った社名」を第一の実害として挙げていたが、`labelCompany` は記事に直接出力されない。`generate-articles.ts:417-419` で `generateTitle` の**プロンプト内の「カテゴリ:」行**に入るだけで、そこから先はLLMの裁量。

管理者の実測: 公開19号の newRelease 記事**32本**すべてに実関数を通したが、**タイトルに誤社名が出た例は0件**（vol.002 は `developer=Omega Force` / `publisher=Nintendo` でラベルが `Nintendo EPDの新作` になるが、実タイトルは社名を含まない）。

実際に読者に届く経路は **frontmatter の `developer`**（`select-newreleases-with-fallback.ts` の上書き → `generate-articles.ts:435` → 記事の「開発元」表記）。ただし**公開済みの記事でこの上書きが発火した例は0件**（実測。`developer: "Xbox Game Studios"` 等で公開19号を grep してヒット0件）。発火するのは `Arkane Lyon` → `Arkane Studios` のような別部門→親スタジオのケースであり、公開データには現れていない。したがって Issue #277 の実害は**ラベル経路（プロンプト）とfrontmatter経路のどちらも、公開記事では未発現**である。

### Issue が「規模は未測定」としていた点を測定した

Issue は「全エントリのうち何件が該当するか測定できていない」「文字列の類似度では別法人か否かを判定できないため機械的な列挙は断念した」としていた。

管理者は公開19号の newRelease 32本の `developer`/`publisher` 実データを実関数に通す方法で測定し、ラベルが別法人名に化けた実例（vol.002 の `Nintendo EPDの新作`）と、`developer` 上書きの発火例が**0件**であることを確認した。

## 採用した方針

Issue #277 の案1（`displayName` による分離）を採用した。

1. `DeveloperEntry`（`scripts/indie-classifier.ts`）に任意フィールド `displayName?: string` を追加。省略時は `canonical` にフォールバック
2. `displayName` を付けたのは **3エントリのみ**:
   - `Nintendo EPD` → `任天堂`（aliases に `nintendo`/`任天堂` を含む開発部門名）
   - `Xbox Game Studios` → `Microsoft`（aliases に `microsoft` 等を含む）
   - `Bethesda Game Studios` → `Bethesda`（aliases に別法人 `bethesda softworks` を含む）

### 対象外と判断した2エントリ

Issue 本文は4例を同列に挙げていたが、以下の2つは「別法人に化ける」構造ではない:

- **`2K Games`**: `2k boston`/`2k czech` は**傘下スタジオ**であって別法人ではない（親会社の名義で出る）
- **`PUBG Studios`**: `pubg corporation` は**旧社名**であって別法人ではない（改称後も同一法人）

## レビューで検出した欠陥（最重要）

**Sonnet の初回実装は `developer` 上書きを `displayName` に差し替えていたが、これは同一性照合に回帰を入れる。管理者の diff 検証で検出し撤去した。**

### データフローと実害

`vetNewReleaseCandidate`（`select-newreleases-with-fallback.ts`）での上書きは、`generate-articles.ts:435` 等の frontmatter に入り、`validate-article.ts:721` 経由で `matchGameToSteamEntity` の **company軸**（`game-identity.ts:382-402`）に渡され、Steam の `developers[]` と `companyNamesOverlap`（`steam-utils.ts:90-112`）で突合される。

管理者の実測:

| Steam生値 | canonical上書き（撤去前main） | displayName上書き | 上書きなし（PR #291） |
|---|---|---|---|
| `Nintendo` | `Nintendo EPD` → true | `任天堂` → **false** | `Nintendo` → **true** |
| `Nintendo EPD` | `Nintendo EPD` → true | `任天堂` → **false** | `Nintendo EPD` → **true** |
| `Xbox Game Studios` | `Xbox Game Studios` → true | `Microsoft` → **false** | `Xbox Game Studios` → **true** |
| `Bethesda Softworks` | `Bethesda Game Studios` → true | `Bethesda` → true | **true** |

エンドツーエンドで `matchGameToSteamEntity` に実データを投入して確認した実害: `publisher` も和名の場合、または `publisher` が無い場合、company軸が `agree` → **`disagree`** に転落。title軸がdisagreeの状況で `verdict` が `uncertain` → **`different`** に変わり、`severity: 'high'` の `game-source-mismatch` を**誤発報**する。通常ケース（`publisher='Nintendo'` が併存）では publisher 側で company軸が救われるが、これは偶然の冗長性への依存。

### 撤去の根拠4点

1. `pickNewReleaseLabelCompany` のJSDocが「**`game.developer` 自体は事実（受託スタジオ名）を保持する方針**」と明記しており、canonical上書きはこの方針と矛盾していた
2. 上書きしなければ生値が残り、全ケースで照合が通る
3. Issue #180 の意図（受託開発のラベルを大手側に寄せる）はラベル経路で達成済み
4. 実測: 公開32本で上書きの発火例は0件。公開データへの影響なし

### 管理者の自己申告（必ず記録すること）

**この欠陥のリスクは `docs/article-category-prompt.md:2326`（PR #276 の影響範囲表の項目4）に着手前から既に文書化されていた。** company軸への流入経路、判定表の行4に限られること、`publisher` 側が一致していると影響を受けないことまで書かれていた。設計判断の段階でこの記述を grep していれば、実装前に気づけた。

## ミュータント検証（管理者が実施。4種すべて検出）

| ミュータント | 結果 |
|---|---|
| `developer` の canonical 上書きを再導入 | ✅ 3件失敗 |
| `developer` の displayName 上書きを再導入（検出した欠陥そのもの） | ✅ 5件失敗 |
| ラベルを `matched` に戻す（#277修正の取り消し） | ✅ 4件失敗 |
| `displayName ?? canonical` のフォールバックを削除 | ✅ 13件失敗 |

## `/code-review` の結果

5観点すべて実行。**投稿された指摘は0件**（スコア80未満のため自動投稿なし）。ただし1件（docs の stale 化）は管理者が一次ソースで再検証して**実在を確認**したため、本docs PRで対応する。他4観点（CLAUDE.md準拠 / 表層バグ / git履歴の文脈 / コード内コメント準拠）は指摘なし。

git履歴観点のレビューが補強した事実（コミットの帰属は本docs PRの `/code-review` 指摘を受けて管理者が `git show` で再確認した）: Issue #180 対応時に**同型の問題が既に一度起きて撤回されていた**。

| コミット | 内容 |
|---|---|
| `d2da1d5` | `developer` 側の canonical 上書きを導入（`pubResult` は大手ゲートの判定にのみ使い、`finalDeveloper` には使っていない） |
| `8b637c5` | `/code-review` 指摘を受けて **publisher 側の canonical 上書きを追加**（`: pubResult.hit ? pubResult.matched : ...`） |
| `9b6c0f9` | その publisher 側の上書きを**撤回**。理由は「`validateGameSourceConsistency` の developer 照合と確実に不一致になり、`game-source-mismatch` (high) → hidden 化（#179 FP-2 型の破壊）を誘発する」 |

つまり `9b6c0f9` が撤回したのは `8b637c5` が追加した publisher 側の上書きであり、`d2da1d5` が導入した developer 側の上書きはこのとき残された。**今回の PR #291 はその残っていた developer 側の上書きを、`9b6c0f9` と同じ理由（company 軸との不一致）で撤去したことになる。** 同じ原則が2度目に適用されるまで約1ヶ月かかっている。

## テスト

29ファイル / **1212テスト**全通過（着手前ベースライン 1189。+23件）。

新規に追加した `it()` ブロックの内訳（`git show fc191d1` で実測）:

| ファイル | 件数 | 内容 |
|---|---|---|
| `indie-classifier.test.ts` | 15 | `displayName` の3エントリ全alias（11パターン）での `hit` 不変性、`pickNewReleaseLabelCompany` が表示名を返すこと、`list: 'developed-count'` 経路、ポジティブコントロール（`capcom` → `Capcom` / `falcom` → `Nihon Falcom` で表記ゆれ吸収が生きていること） |
| `select-newreleases-with-fallback.test.ts` | 6 | `developer` が上書きされず生値が保持されること（`displayName` 有り3件 + `displayName` 無しの `capcom` + 小規模スタジオ + 通常ルートの既存テスト更新分） |
| `validate-article.test.ts` | 4 | 同一性照合の保全。生値なら company軸が `agree`（2件）、**ネガティブコントロール**として `任天堂` / `Microsoft` に上書きした場合は `company=disagree` で `uncertain` 警告が出ること（2件） |

なお `indie-classifier.test.ts` では既存の `toEqual` アサーション11件に `displayName` フィールドを追加する更新も行っている（`LargeStudioResult` に必須フィールドを足したため）。**既存テスト `expect(pickNewReleaseLabelCompany('nintendo', undefined)).toBe('Nintendo EPD')` はバグを固定していたため、期待値を更新した**（削除ではなく更新）。

## 教訓

### 既存 docs に同じリスクが文書化されていないか、設計判断の前に grep する

今回の欠陥は `docs/article-category-prompt.md:2326` に着手前から書かれていた。過去PRの「影響範囲表」は、次の変更の設計制約になる。`developer` / `canonical` / `displayName` / `matchGameToSteamEntity` / `game-source-mismatch` のいずれかで grep していれば、実装前に気づけた。

### 表示用の値と照合用の値を同じフィールドに載せない

`game.developer` は読者向け表示と同一性照合の**両方**に使われるため、片方の都合で書き換えると他方が壊れる。今回は「上書きしない」ことで両立させた。

- **表示用**: frontmatter → 記事の「開発元」表記
- **照合用**: `validateGameSourceConsistency` → `matchGameToSteamEntity` の company 軸 → Steam の `developers[]` と突合

前者を canonical 名で書き換えると、後者が「Steam に無い社名」との照合になり `disagree` へ転落する。

### Issue が「測定できない」としている項目こそ、別の測定手段を探す

Issue #277 は文字列類似度による自動列挙を断念していたが、公開記事の実データを実関数に通す方法で測定できた。

- ラベルが `Nintendo EPDの新作` になった記事: 32本中**2本**（vol.002 / vol.008）。うち**帰属が事実と異なるのは1本**（vol.002 は `developer=Omega Force` なので Nintendo EPD 帰属は誤り。vol.008 は `developer=Nintendo EPD Production Group No. 4` なので帰属自体は妥当）
- そのラベルが記事タイトルに出た例: **0件**（ラベルはプロンプト経由のためLLMの裁量）
- `developer` 上書きの発火例: **0件**（公開データへの影響なし）
- company軸が転落するケース: 実測で確認（上記の表）

「測定できていない」は「機械的な全件列挙ができない」だけで、実ケースによる実測は可能だった。

---

# PR #294: `SelectedGames.featured` の廃止（Issue #289）

- **Issue**: #289（Closed）
- **関連**: #232（本Issueの出所）、#293（本PRの検討中に新規起票。暴力表現レーティング上限の不在）
- **PR**: #294
- **ブランチ**: `fix/issue-289-remove-featured`
- **マージ**: 2026-08-12（マージコミット `2c12b4d`。通常マージ、squashではない）
- **コミット**: 1本（`5116768`）
- **テスト**: 29ファイル / **1214テスト**全通過（着手前 1212。新規2件）

## 何が壊れていたか

> ⚠️ **以下の行番号はすべて `5116768^`（PR #294 のマージ前）時点の値**。PR #294 が該当コードを削除したため、現在の同じ行番号には別の内容が入っている（例: 現在の `fetch-data.ts:1316` は `reconcileSelectedGames` の `classic` 追加行）。PR #292 の `/code-review` 指摘で確立した「削除済みコードの引用には時点を明記する」方式に従う。

PR #288（Issue #232）の着手前検証で、`scripts/fetch-data.ts:1316` の `selectedGames.featured` 選定が**特集記事に使われていない**ことが判明した:

- `generateFeatureArticle` の呼び出し（`generate-articles.ts:1421`）に渡されるのは `filteredAllGames`（`:1408-1412` で構築）であり、`selectedGames.featured` ではない
- `git log -S 'selectedGames.featured' --all -- scripts/generate-articles.ts` で全履歴を確認したが、`selectedGames.featured` が特集記事生成関数に渡されたことは**一度もない**
- `generate-articles.ts:1393` のコメント「（selectedGames.featured は特集記事自身の素材のため除外しない）」は**事実に反する**

`featured` に現存する効果は3つのみ:

1. `fetch-data.ts:1327` の `alreadySelected` に入り**名作枠の重複除外リストになる**
2. `fetch-data.ts:676` / `:851` で IGDB/Metacritic の追加取得対象になり**APIコストを消費する**
3. `completeness-gate.ts:451` のチェック対象

対処3案を Issue #289 として起票した:

- **(a)** 特集記事に使うよう経路を接続する（§4.5 の「2経路」構造が壊れる可能性）
- **(b)** 名作候補から除外する用途として維持（現状維持）
- **(c)** ゼロ本許可として削除（API コスト削減）

ユーザー判断で **(c) 削除**が採択された（2026-08-12）。

## 着手前の独立検証で判明したこと

### 検出力チェック（Issue #279・#282・#288 に続き4PR連続で必要だった）

測定の前に検出力を確認した。ローカルスナップショット（`fetchedAt=2026-05-16`）では:

| 指標 | 旧スナップショット | ライブfetch（2026-08-12） |
|---|---|---|
| `totalRating` 保持 | **0件** | **236件** |
| `totalRatingCount` 保持 | **0件** | 236件 |
| 名作母集団条件（`meetsClassicPoolThresholds`）の通過 | **0件** | **183件** |

旧データでは母集団が構造的に空になるため「差0件」が出るが、これは検出力ゼロによるもので「実害なし」ではない。**PR #279・#282・#288 に続き4PR連続で同型の罠に遭遇した**（毎回フィールドの存在確認が必要だった）。

### Issue の「単調な変化」という記述が不正確だった

管理者がライブfetch実測（`DEV_MODE=true npm run fetch-data`、2026-08-12、312件）:

| | 名作候補数 | 採用される1位 |
|---|---|---|
| `featured` を除外リストに含む（修正前） | 176件 | **The Witcher 3: Wild Hunt** |
| `featured` を含まない（PR #294） | 177件 | **Grand Theft Auto V** |

Issue #289 は対処案(c)の影響を「**除外対象が1件減るので名作候補が増える方向。単調な変化**」と記述していたが、**これは不正確だった**。候補数の増加は単調（176→177）でも、**採用結果が別タイトルに入れ替わる非単調な変化**を引き起こす。名作枠のソートキーは `totalRatingCount` 降順で、GTA V = 5896 > Witcher 3 = 5430 のため。

つまり `featured` は「死んだ値」ではなく、**名作枠から1件を締め出すフィルタとして実質機能していた**。

## 削除を選んだ根拠（3点）

1. **ジャンル条件に設計判断の記録が無い**。`git log -S "'sports', 'racing', 'simulation'"` のヒットは `898224c`（Initial commit）の1件のみで、**ジャンルリスト `['sports','racing','simulation']` は一度も変更されていない**。仕様策定前の初期実装の残骸。

   ⚠️ **ただしスコア条件の側は2度変更されている**（本docs PRの `/code-review` 指摘を受けて管理者が `git show` で再確認）。「条件全体が Initial commit から不変」と読める書き方は誤りだった:

   | コミット | スコア条件 |
   |---|---|
   | `898224c`（Initial commit） | `metascore > 75`（加えて `games.find((g) => g.steamPlayers > 50000)` のフォールバックがあった） |
   | `bb7cda2`（Phase 13） | `(metascore > 75) \|\| (igdbRating >= 75)` に拡張 |
   | `5c9e9b4`（Issue #253 対応） | `metascore` 削除に伴い `igdbRating >= 75` のみに |

   つまりスコア条件は他の変更（`metascore` 廃止など）に**受動的に追従して変わった**だけで、「このジャンルでこの閾値が妥当か」という**ジャンル選定そのものの設計判断は一度も行われていない**。根拠としての結論は変わらないが、事実関係はこの表のとおり。
2. **仕様と正面から矛盾する**。`docs/article-category-spec.md` §4.2 の特集枠は「暦のイベント起点でテーマを決め、そのテーマに合うゲームを3本以上」。§4.5 の候補経路は2つ（プールの残り / LLM提案）で「ジャンルで1本選ぶ」経路は存在しない。特に **§4.6 は IGDB の機械可読なテーマ分類を「記念日→ジャンルの編集意図から離れる」として明示的に棄却済み**。ジャンル固定で縛る発想そのものが仕様として否定されている
3. **除外されるタイトルが意味のない順序で決まっていた**。`games.find()` なので**除外は常にちょうど1件**（`filter` ではない）。どのタイトルになるかは `aggregateGames`（`fetch-data.ts` で `Array.from(gameMap.values())`）の挿入順＝Steam Top Sellers → Top Played → YouTube → IGDB という、**選定上の意味を持たない順序**で決まっていた

## 実装

削除した箇所:

| ファイル | 削除内容 |
|---|---|
| `types.ts` | `SelectedGames` 型の `featured: GameData \| null` フィールド |
| `fetch-data.ts` | 選定ロジック（ジャンル条件 `['sports','racing','simulation']` かつ `igdbRating >= 75` の `games.find()`）、`buildClassicCandidates` の `alreadySelected` からの除去、戻り値、`reconcileSelectedGames` / `enrichSelectedGamesWithOfficialUrl` の対象、`removeZombieGames` の nullify ブロック、サマリログ |
| `completeness-gate.ts` | `singletons` から除去（`classic` のみに）、コメント3箇所 |
| `generate-articles.ts` | フォールバックの `featured: null`、および**誤コメント**「（selectedGames.featured は特集記事自身の素材のため除外しない）」 |

あわせて `isAlreadySelected` の JSDoc の「4箇所」を、実際の呼び出し箇所を数えて「2箇所（`buildIndieCandidates` / `buildClassicCandidates`）」に修正した（**この記述は本PR以前から stale だった**）。

## ミュータント検証（管理者が実施）

| ミュータント | 結果 |
|---|---|
| `buildClassicCandidates` にジャンル除外を追加 | ✅ 1件失敗（新規回帰テストが検出） |
| 重複除外機構（`isAlreadySelected`）を無効化 | ✅ 3件失敗 |
| 名作枠のソートを昇順に反転 | ✅ 2件失敗 |
| `selectGamesForArticles` 内に `featured` 除外を再導入 | ❌ **検出できない** |

最後の1件は**構造的な限界**で本PRの欠陥ではない。`selectGamesForArticles`（`fetch-data.ts`）が export されておらずユニットテストから到達できないため。この制約は `fetch-data.test.ts` に既に記録されている既知事項。テスト可能な単位（`buildClassicCandidates` / `isAlreadySelected`）では全ミュータントを検出できている。

## `/code-review` の結果

5観点すべて実行。**投稿された指摘は0件**（3件検出されたが全件スコア0）。管理者が3件すべて一次ソースで再検証し、**全件不採用**と判断:

1. 「genre条件は `1bb61e6` で変更された」→ **誤り**。`git show 1bb61e6` で確認したところ、同コミットが触った `metascore`/`igdbRating` は名作枠プールの別フィルタ（`> 80`、`>= 85`）で、`featured` のジャンル条件は一行も変更していない
2. 「`toPersistableSelectedGames` に `featured` 除去の移行コードが必要」→ **不要**。`grep -n "readFileSync" scripts/fetch-data.ts` はゼロ件で、`selected-games.json` は毎回 `selectGamesForArticles` の戻り値から新規構築される。型から消えた以上、次回実行時の出力に `featured` は含まれない。`as any` で死んだ移行コードを足す提案は不適切
3. 「`isAlreadySelected` の JSDoc が参照する PR #209 は `alreadySelected` の話ではない」→ **事実として正しいが対処不要**。`gh pr view 209` で確認: PR #209 は IGDB の `themes != (37)` → `(42)` 修正。ただし JSDoc の「同じ誤りが3箇所に同時に存在する事故」という記述自体は正確（3つの母集団クエリに同一バグがあった）で教訓の引用として成立。この参照は本PR以前から存在し、管理者は件数（4→2）のみ修正したためスコープ外

## 分離した Issue

### Issue #293

検討中に、**暴力表現に対するレーティング上限が仕様に存在しない**ことが判明した（成人向け除外は IGDB の Erotic テーマのみで、暴力・犯罪描写の観点はどのゲートも見ていない）。公開済みの号にも既に該当作（Red Dead Redemption 2 / The Last of Us Part II / Cyberpunk 2077）が載っている既存の課題。→ **Issue #293** として起票済み。

## テスト

29ファイル / **1214テスト**全通過（着手前 1212。新規2件）。

新規に追加した `it()` ブロックの内訳（`git show 5116768` で実測）:

| ファイル | 件数 | 内容 |
|---|---|---|
| `fetch-data.test.ts` | 2 | `buildClassicCandidates` にジャンル条件フィルタが無いこと（スポーツ・レーシング・シミュレーションでも候補に入る）、`buildClassicCandidates` の除外リストが `newReleases` と `indies` のみで `featured` を含まないこと |

## 教訓

### 「`find` と `filter` を読み分ける」

管理者は当初「条件を満たす大作は常に名作候補から落ちる」と説明したが誤りで、`games.find()` なので**落ちるのは常に1件だけ**だった。ユーザーの指摘で訂正した。1文字違いの API で影響範囲の見積もりが桁違いになる。

### 「検出力の確認は4PR連続で必要だった」

PR #279・#282・#288・#294。測定の前に「そのスナップショットに測定対象フィールドが何件あるか」を必ず数える。

### 「仕様に無いコードは『使われていない』とは限らない」

`featured` は特集記事に使われていなかったが、名作枠への副作用として実質機能していた。「未使用」と「無害」は別。

### 「Issue が書いた影響予測（単調/非単調）も検証対象」

Issue #289 は「単調な変化」としていたが、候補数は単調でも採用結果は非単調だった。

---

# PR #299: 根拠のない「個人開発」断定を廃止する（Issue #298）

- **Issue**: #298（Closed）
- **関連**: #284（本Issueの出所。同じ症状を「実装バグ」として扱っていた）、#297（実例に重なっていた別作品メタデータ混入。本セッションで新規起票）、#296（同一性照合のスキップ。本セッションで新規起票）、#300（`/code-review` 指摘から新規起票）、#97（`個人開発` 表記の出所）
- **PR**: #299
- **ブランチ**: `fix/issue-298-remove-individual-developer-label`
- **マージ**: 2026-08-12（マージコミット `6dde6b5`。通常マージ、squashではない）
- **コミット**: 1本（`f5ddcf5`）。`/code-review` 指摘は本PRでは修正せず Issue #300 に分離したため、追加コミットは無い
- **テスト**: 29ファイル / **1213テスト**全通過（着手前 1214。削除2件 + 追加1件）

## 何が問題だったか

### 「個人開発」判定の実体

`scripts/` を `solo` / `individual` / `一人` / `ひとり` / `teamSize` / `team_size` で grep した結果、**開発規模・チーム人数・法人格を判定するロジックは存在しない**。ヒットしたのは `formatIndividualDeveloper` という関数名だけで、実質の判定内容は「IGDB に開発元情報が無く、Steam の文字列が `isQualifiedCompanyName` に弾かれ、静的大手リストにも載っていない」＝**メタデータが揃わなかったことの証拠**にすぎない。

`isLargeStudio` の否定は「大手ではない」であって「個人開発」ではない（中小スタジオが丸ごと含まれる）。

### 誤情報が出力される機構

`generate-articles.ts:509` が `developer: game.developer` を `buildUserMessage` に渡し、`bedrock-client.ts:461-462` が `開発: ${gameInfo.developer}` としてプロンプトに載せる。同プロンプトの `:431` が「※以下のタイトル・各メタデータは正確な公式情報です。本文内では一字一句正確に転記し、短縮・翻訳・並べ替え・改変は禁止です。」と宣言している。indie のシステムプロンプト `:204` が「※提供された開発者情報を参考にしてください。情報がない場合は開発者/開発チームの紹介に留めてください」と本文への展開を促している。

**LLM はハルシネーション防止ルールを守って忠実に転記しており、誤情報を作ったのはデータ供給側。**

### 判定が文字列の形に依存する実測表

管理者が実コードを直接実行して確認した結果:

| 社名 | isQualifiedCompanyName | isLargeStudio | 「個人開発」と断定されるか |
|---|---|---|---|
| Petroglyph | false | false | する（実在スタジオ） |
| Supergiant | false | false | する（実在スタジオ） |
| Supergiant Games（正式名） | true | false | しない |
| Klei | false | false | する（実在スタジオ） |
| Klei Entertainment（正式名） | true | false | しない |
| tinyBuild | false | false | する（実在スタジオ） |
| ConcernedApe | false | false | する（実際に個人開発。偶然の一致） |
| ZA/UM | true | false | しない（記号を含むため） |

`Supergiant` と `Supergiant Games` で結果が変わる = **判定しているのは開発規模ではなく文字列の形**。

### 自前の検証機構が high で警告していた

LLM-as-a-judge（`data/validation-dev/validation-report-019.json` の `llmJudge.warnings[6]`）が、severity=high / type=`llm-judge-contradicted` / 確信度95%で次のメッセージを出していた:

> 主張「本作は個人開発（Petroglyph）によって制作された」は検索結果と矛盾します（確信度 95%）。検索結果[4][5]で開発スタジオはCD PROJEKT REDであることが明記されており、個人開発でもPetroglyphでもない。明確な誤情報

**自前の事実性チェックが「明確な誤情報」と判定する内容を、自前のパイプラインが生成していた。**

### 仕様上の裏付けが無い

`docs/article-category-spec.md` を `grep '個人開発'` で確認すると**0件**。出所は Issue #97 のコメント（本文ではない）で、「『個人開発（〇〇）』表記の品位: アカウント名そのまま括弧内に入れることが許容範囲か運用後に判断」と保留項目として書かれたまま仕様に昇格していない。

## 調査で判明したこと

### Issue #284 の実例は別の欠陥の産物だった

Issue #284 が「実例」として挙げた `個人開発（Petroglyph）` を実データでトレースした結果、**ラベルは症状であって原因ではない**ことが判明した:

- 記事の `game.title` は「サイバーパンク2077 アルティメットエディション」（`issues-dev/issue-019.md:166`）だが、`game.developer` は `個人開発（Petroglyph）`、`releaseDate` は `2010-05-25`、`screenshots` 5枚はすべて `apps/32470/`
- **appid 32470 の実体は別作品**（Steam Storefront API を実際に叩いて確認）: `name=STAR WARS™ Empire at War - Gold Pack` / `developers=['Petroglyph']` / `publishers=['LucasArts','Lucasfilm','Disney']` / `release_date=2010年5月25日`。記事の開発元・発売日・スクリーンショットは**すべて Empire at War 側と整合**しており、タイトルと本文だけが Cyberpunk 2077
- したがって **`Petroglyph` は誤ラベルではなく別作品の正しい開発元**（Cyberpunk 2077 の実際の開発元は CD PROJEKT RED）。混入がどの段階で起きたかは**未特定**（→ **Issue #297**。`issues-dev/` は gitignore 対象で当時のスナップショットが残らず、ローカル `data/aggregated.json` は `fetchedAt=2026-05-16` で当該候補を含まないため追跡できない）
- **混入が検出されなかった理由**: この記事の `sourceUrls` は `official` のみで `steam` を持たないため、`extractSteamAppIdFromArticle`（`validate-article.ts:658-672`）が `undefined` を返し、`:710` の早期 return で同一性照合が**丸ごとスキップ**されていた。スクリーンショット URL に appid 32470 が5回出現しているのに参照していない（→ **Issue #296**。公開19号では88記事中49件・55.7%が同様にスキップされている）

つまり、ラベルを直しても Issue #284 が挙げた実例は解消されない。Issue #284 は原因を取り違えていた。

### Issue #284 本文の誤りを指摘した内容

#284 は「単一トークン社名は枠を問わず `developer` 未設定になり得る（新作枠・名作枠を含む）」と書いていたが**後半は不正確**。IGDB 由来の `developer` 代入は `isQualifiedCompanyName` を1度も呼ばない（`grep -c isQualifiedCompanyName scripts/fetch-igdb.ts` = 0）。両呼び出し箇所（`finalize-game-metadata.ts:215` / `fetch-data.ts:484`）は `!game.developer` ガード付きなので、Steam の短縮形で未設定になるのは **IGDB に developer が無い候補に限られる**。

新作枠・名作枠では未設定＝`hasAllRequiredFields` 不通過で**候補が落ちるだけ**でラベルは付かない（`select-newreleases-with-fallback.ts:12` の `NEW_RELEASE_REQUIRED`、`fetch-data.ts:782` の classic 側 `developer: false`）。**表記が壊れるのは indie 枠の話題性ルートのみ。** この点をIssue #284 にコメントで指摘済み。

### 実害の範囲

公開記事（`src/content/issues/`）の `個人開発（` のヒットは `issue-012.md` の `個人開発（lemorion_1224）` のみ。これは実際に個人開発者のアカウント名なので結果としては誤りではないが、**正しさは偶然でシステムが検証した結果ではない**。

DEV_MODE 出力は `issues-dev/issue-019.md` の `個人開発（Petroglyph）` 1件（誤情報）。

## 採用した案（案A）とその理由

4案を提示してユーザーが選択:

- **案A: 生値を入れる**（採用）
- 案B: `開発元情報なし`
- 案C: `developer` を空にし必須条件から外す
- 案D: 現状維持を仕様承認

### 理由

1. 生値は Steam Storefront `developers[0]` の一次ソースの事実
2. `developer` に値が入るため `hasAllRequiredFields`（`NORMAL_REQUIRED.developer = true`）を通り供給が減らない
3. 案B は事実に反する（開発元名は取得できており「情報が無い」のではなく「正規社名かアカウント名か判別できない」だけ）
4. `vetNewReleaseCandidate`（`select-newreleases-with-fallback.ts:66-81`）が Issue #277 で確立した「上書きせず生値を保持する」方針と一致

### 受容した副作用

`lemorion_1224` のようなアカウント名が装飾なしで表示される。Issue #97 が「表記の品位」として保留した論点だが、品位のために事実でない断定を付けるのは逆方向のトレードオフという判断。

## 実装

- `formatIndividualDeveloper` を削除（`f5ddcf5^` 時点の `scripts/select-indie-with-fallback.ts:57-63`）
- `developer: formatIndividualDeveloper(rawName)` → `developer: finalizeResult.game.steamRawDeveloper`
- `?? 'unknown'` フォールバックを削除。`steamRawDeveloper` が undefined なら `developer` も undefined のままとし、既存の `hasAllRequiredFields(adoptedGame, NORMAL_REQUIRED)` が false を返して不採用に落ちる（新たな条件分岐は追加していない）
- コメント修正4ファイル（`select-indie-with-fallback.ts` / `finalize-game-metadata.ts` / `fetch-data.ts` 3箇所 / `indie-classifier.test.ts`）

## 同一性照合への影響は中立

実測:

```
companyNamesOverlap('個人開発（Petroglyph）',   'Petroglyph')    = true
companyNamesOverlap('個人開発（lemorion_1224）','lemorion_1224') = true
companyNamesOverlap('Petroglyph',              'Petroglyph')    = true
```

`tokenizeCompanyName` が括弧を除去するため、ラベルの有無で company 軸の判定は変わらない。

## テスト

29ファイル / **1213テスト**全通過（着手前 1214。削除2件 + 追加1件）。

- 削除2件: `formatIndividualDeveloper` の単体テスト（`f5ddcf5^` 時点の `select-indie-with-fallback.test.ts:84-95`。関数ごと削除したため）
- 追加1件: 回帰防止テスト（現在の `select-indie-with-fallback.test.ts:500-527`）。`developer` に `個人開発` が含まれないこと（ネガティブ）と、`steamRawDeveloper` の生値と一致すること（**ポジティブコントロール**）を同時に assert する。「含まれない」だけでは `developer` が undefined でも通ってしまうため
- 期待値変更7件: 話題性ルートの採用結果を検証する既存テストを生値に変更。うち「`steamRawDeveloper` が undefined → `個人開発（unknown）`」テストは仕様変更に伴い**「不採用」の検証に改訂**（`:225-247`）

### ミュータント検証（管理者が実施。3件すべて検出）

| ミュータント | 結果 |
|---|---|
| ラベルを復活させる（`個人開発（${raw}）`） | ✅ 6件失敗 |
| `?? 'unknown'` フォールバックを復活させる | ✅ 1件失敗 |
| `developer: undefined` 固定にする | ✅ 6件失敗（回帰防止テストのポジティブコントロールが機能） |

## `/code-review` の結果

5観点すべて実行し、**検出は2件**。いずれもスコア80未満で自動投稿はされておらず、管理者が一次ソースで再検証して採否を判断した:

| 指摘 | スコア | 採否 | 根拠 |
|---|---|---|---|
| `deduplicateGames` が `steamRawDeveloper` をマージしない | 75 | **別Issue（#300）で採用** | 実在するが本PRの変更行外の既存問題 |
| spread時に `developerGameCount: undefined` を明示すべき | 25 | 不採用 | 到達条件が `!game.developer` で常に undefined。既存コメントが理由を明記済み |

レビュアー5人のうち3人（CLAUDE.md準拠 / バグスキャン / コメント整合）は指摘0件。

## 分離した Issue

### Issue #300

`deduplicateGames`（`fetch-data.ts:596-`）は `primary.<field> =` で **24フィールド**をマージするが `steamRawDeveloper` だけが漏れている。`developer` は `:607` でマージ、直後の `developerGameCount` は `:611-618` で `pickDeveloperGameCount` ガード付きでマージされている。

影響2方向:

1. **供給**: `developer` を埋められず候補が落ちる
2. **大手ゲートの無効化**: `isLargeStudio(undefined)` は即 `{hit:false}` を返すため Issue #280 欠陥1の再発経路になり得る。こちらの方が重い

緩和要因: `steamRawDeveloper` は vet 時の Storefront 呼び出し（`finalize-game-metadata.ts:214`）で再取得される。`needsStorefrontCompletion`（`:303-309`）が `required.developer && !game.developer` で true を返すため話題性ルート候補では必ず発火する（前提: `steamAppId` が存在すること）。したがって実害になるのは `steamAppId` が無いか Storefront 取得が失敗した場合（Issue #227 の fail-closed と重なったとき）。

**実データでの発生は未測定**（ローカル `data/aggregated.json` は `fetchedAt=2026-05-16` で `steamRawDeveloper` の出現件数が0件のため検出力ゼロ）。

## 教訓

### 未検証の推測値をプロンプトに「正確な公式情報」として渡す構造そのものが誤情報の発生源になる

LLM 側のハルシネーション対策（転記の厳格化、省略・改変の禁止）を固めても、データ供給側が推測を事実として渡せば誤情報は出る。`formatIndividualDeveloper` は判定ロジックを持たず、メタデータの欠損を装飾していただけだった。

### 自前の検証機構が high で警告している内容を放置していた

LLM-as-a-judge の指摘（Issue #156 が扱う「Validation Report の活用方法」）が運用に反映されていなかった。severity=high / 確信度95%で「明確な誤情報」と警告されている記述が生成されていた。

### 症状の実例が別の欠陥の産物である可能性を疑う

Issue が挙げた実例（`個人開発（Petroglyph）`）を追跡したら、そのIssueとは別の2つの欠陥（#296 の同一性照合スキップ / #297 の別作品メタデータ混入）が見つかった。ラベルを直しても実例は直らない。Issue の「実例」は、その Issue の原因の証拠とは限らない。

---

# PR #303: 同一性照合のスキップを可視化する（Issue #296）

- **Issue**: #296（Closed）
- **関連**: #297（別作品メタデータ混入。Issue #284 の実例の真因）、#298（`個人開発` ラベル。PR #299 の出所）
- **PR**: #303
- **ブランチ**: `fix/issue-296-visualize-identity-check-skip`
- **マージ**: 2026-08-13（マージコミット `490fd11`。通常マージ、squashではない）
- **コミット**: 1本（`3e4e532`）
- **テスト**: 29ファイル / **1220テスト**全通過（着手前 1213。新規7件 + 既存1件の期待値更新）

## 何が問題だったか

### Issue 本文の主張

Issue #296 は「`sourceUrls.steam` を持たない記事で同一性照合が丸ごとスキップされる（公開19号で88記事中49件・55.7%）」とし、3つの対処案を提示していた:

1. スクリーンショットURLから appId を抽出する（救済5件）
2. `GeneratedArticle` に `steamAppId` を持たせて `extractSteamAppIdFromArticle` の依存を減らす
3. スキップされた記事を観測可能にする（**採用**）

### 着手前の独立検証で判明した Issue 本文の誤り

管理者が実コードとデータで検証した結果、**中心数値が誤っていた**:

#### 訂正1: スキップ率は 49件・55.7% ではなく **26件・29.5%**

`extractSteamAppIdFromArticle`（`validate-article.ts:658-672`）は appId の取得元を **2経路**持つ:

- `sourceUrls.steam`
- `sourceUrls.stores[]` の `platform==='steam'` の `url`

Issue 本文はこの2経路を正しく引用していながら、集計では `stores[]` 経路を数え落としていたと考えられる。

- `sourceUrls.steam` のみを見る数え方: **48件・54.5%**（Issue 本文の49件にほぼ一致。差1件は端の記事の扱いによると考えられる）
- 実コードと同じ2経路で数える: **26件・29.5%**

食い違いは新しい号に集中する（`stores[]` 形式が使われ始めたため）。号別の実測値:

| 号 | Issue本文の主張 | 実測 |
|---|---|---|
| 013 | 3件 | 0件 |
| 014 | 5件（全件） | 0件 |
| 015 | 2件 | 0件 |
| 016 | 4件 | 0件 |
| 017 | 3件（全件） | 1件 |
| 018 | 4件（全件） | 0件 |
| 019 | 3件（全件） | 1件 |

Issue 本文が「全件スキップで最悪」とした号のうち 014 / 018 は **実際には全件カバー済み**だった。

なお `stores[]` の URL は末尾スラッシュ付き（例 `https://store.steampowered.com/app/3768760/`）だが、正規表現 `store\.steampowered\.com\/app\/(\d+)` は末尾の有無に依存しないため問題なく appId を抽出できることを実行確認した。

#### 訂正2: 対処案1（スクリーンショットからの appId 抽出）の救済は5件ではなく **0件**

Issue 本文は「救済できるのは49件中5件のみ（issue-013 / 014×2 / 017 / 019）」としていた。しかし **真にスキップされる26件**を対象に測ると救済は0件。Issue 本文が挙げた5件は、いずれも `stores[]` 経路で **すでに appId が取れている**記事だった。

26件の `game` ブロックを走査したが、Steam CDN の `apps/<appid>/` を含む URL を持つ記事は1件も無い（カバー画像・スクリーンショットはすべて `images.igdb.com` 由来）。

#### 訂正3: Issue 本文に記載のない既存機構 **R5**（`checkR5`）がある

`scripts/completeness-gate.ts:311-370` に、`sourceUrls` に一切依存しない appId ベースの同一性照合が既に存在する:

- `game.steamAppId` を直接読むため、Issue が問題にしているスキップが構造的に起きない
- `matchGameToSteamEntity` の3軸照合を使う（`build-issue.ts` の `validateGameSourceConsistency` と共通）
- `verdict=different` なら `ruleId: 'R5'` の violation を出す（`:337`。`RULE_REPLACEABLE` テーブル（`:43-53`）の `:52` で `R5: true` と定義されており、差し替え適格）
- コード自身のコメント（ファイル冒頭のルール一覧、`:15`）が「生成後の `validateGameSourceConsistency`（build-issue）の前倒し版」と述べている
- 実行順序: R5 は `fetch-data.ts` の `runCompletenessGate` 呼び出しで選定段階（`removeZombieGames` の直後・`selected-games.json` 書き出し前）、`validateGameSourceConsistency` は `build-issue.ts` で発行直前。**同一性照合は二重化されており、上流側は appId を直接見ている**
- `data/validation-dev/completeness-report.json` の直近 dev 実行では R5 violation 0件・`uncertainIdentity` 0件（記録されていた違反は R1（`:6-8`）と R3（`:10-13`）が各1件）

#### 訂正4: 対処案2（`GeneratedArticle` に `steamAppId` を持たせる）の効果は小さい見込み

`data/selected-games.json`（n=6）の実測で `steamAppId` と `sourceUrls.steam` が完全に相関していた（両方あるか両方ないか）。これは設計によるもので、`fetch-data.ts` の reconcile 処理が「Resolver が Steam を解決できなくても `steamAppId` が既知なら `sourceUrls.steam` を保持する」「Steam URL が解決できたら `steamAppId` も埋める」という双方向の補完構造になっている。

ただし n=6 かつ `fetchedAt=2026-05-16` の古いスナップショットなので、**ライブ測定で確定はしていない**。

### 実測で裏付けられた点（案3を実施した根拠）

1. **スキップは完全に silent**。appId 不在時の早期 return（修正前は `3e4e532^` 時点の `validate-article.ts:710` の `if (appId === undefined) return warnings;`）は警告を1件も出さない
2. **`game-source-mismatch` / `game-source-uncertain` の発報実績が0件**。`data/validation*/validation-report-*.json` 全30件を JSON 走査して確認（**Issue 本文は「31レポート」としていたが実測30件**）

## 採用した案（案3）とその理由

案3「スキップされた記事を観測可能にする」を採用。理由:

- 対処案1は救済0件（実測）
- 対処案2は `steamAppId` と `sourceUrls.steam` が相関しており効果不明（n=6の小標本。ライブ測定は未実施）
- 既存の R5（選定段階）が `steamAppId` を直接見て照合済みで、Issue が扱う発行段階の照合スキップは二重チェックの後段が動かないだけという位置づけ
- スキップは silent で、照合が動いたが問題なかった場合と、そもそも照合が動かなかった場合の区別がつかない（実害は観測されていないが、観測手段が無い）

## 実装

### validate-article.ts

`validateGameSourceConsistency`（`:698-769`）に `severity=low` / `type=game-source-unchecked` 警告を追加（`:710-722`）:

- appId 未取得時に警告を push
- feature 記事と `game` ブロック無し記事は対象外（`:704-707`。既存のガードより後ろに置いたので母数が水膨れしない）
- メッセージに「appId は `sourceUrls.steam` または `sourceUrls.stores[]` の `platform='steam'` から抽出されます」と明記（`:719`）

`validateGameSourceConsistencyForArticles`（`:775-797`）の変更:

- 元は `appId === undefined` の場合に `continue` だけで丸ごとスキップしていた（`3e4e532^` 時点の `:771`）
- 修正後も `continue` は残したまま、その直前に `validateGameSourceConsistency` を呼んで警告を収集する（`:786-789` のブロック。収集が `:787`、`continue` が `:788`）
- **API 呼び出しは増えない**。appId が無い場合は `validateGameSourceConsistency` 内の早期 return（`:710`）で `fetchSteamEntity`（`:725`）を呼ぶ前に抜けるため。レート制限対策のディレイ（`STOREFRONT_REQUEST_DELAY_MS`）も、`first` フラグ（`:780`）を更新せずに `continue` するので実 API 呼び出しの間隔だけに効き続ける

### build-issue.ts

2箇所の変更:

1. CI stdout への出力（`:532-540`。フィルタが `:532`、メッセージが `:536`）:
   - `sourceCheckWarnings` を `game-source-unchecked` でフィルタし `uncheckedWarnings` に分離
   - 件数と記事タイトルのリストを `console.warn` で出力
   - `:536` のメッセージ `⚠️  game-source-unchecked (appId 未取得のため照合スキップ):`

2. レポートへの反映（`:682-687`。コメント行が `:682`、加算が `:685-686`）:
   - `uncheckedWarnings` を `report.warnings` に追加
   - `report.totalWarnings` / `report.warningsBySeverity.low` をインクリメント

### severity=low を選んだ理由

fail 閾値は `VALIDATION_HIGH_THRESHOLD`（`:695`。コメントは `:694`）で high 件数のみを見る。`build-issue.ts` の hidden 化・号停止は `game-source-mismatch` のみが対象（2件以上で `process.exit(1)` が `:563`、1件なら hidden で続行が `:574`）。**severity=low なら号の発行判定に一切影響しない**。

### 総称レンダリングが機能する理由

`format-validation-report.ts` は `report.warnings` を総称的に全件レンダリングする（`:233-238` の `for (const w of report.warnings)` → `formatWarningBlock(w)`）。`ValidationWarning` として追加すれば既存経路に自動的に乗るため、新しい `type` ごとの専用コードは不要。

PR #271 の `adultScreeningFailures` は `webSearchStats` の **カウンタ**で `report.warnings` に入らないため、専用の描画コードが必要だった（推奨アクションへの反映が `format-validation-report.ts:114-117`）。`/code-review` の指摘はこの構造の違いを見落としており、**類推が成立しない**。

## テスト

29ファイル / **1220テスト**全通過（着手前 1213。新規7件 + 既存1件の期待値更新）。

### 新規7件

`validate-article.test.ts` に追加:

1. appId が取れない記事 → `game-source-unchecked` 警告（severity=low）が1件出る
2. ポジティブコントロール: `sourceUrls.steam` を持つ記事 → unchecked 警告は出ない
3. ポジティブコントロール: `sourceUrls.stores[]` 経由で appId が取れる記事 → unchecked 警告は出ない
4. feature 記事は appId が無くても unchecked 警告を出さない
5. `game` ブロック無し記事も unchecked 警告を出さない
6. バッチ実行（`validateGameSourceConsistencyForArticles`）で appId 無し記事の警告を収集する
7. バッチ実行で appId 無し記事のみの場合、Storefront fetch が1回も呼ばれない（レート制限対策の最適化が維持される）

### 既存1件の期待値更新

「Steam URL が無い記事は検証対象外（警告なし・API も呼ばない）」テスト（`3e4e532^` 時点の `:1220`）を、unchecked 警告が出る動作に合わせて改題・期待値変更した（現在の `:1221`）。

### ミュータント検証（管理者が実施。3種すべて検出）

| ミュータント | 結果 |
|---|---|
| `severity` を `low` → `medium` に変える | 2件 failed |
| バッチ関数の警告収集を元の `continue` に戻す | 2件 failed |
| 警告 push を feature / `game` ガードより前に移す（母数の水膨れ） | 2件 failed |

## `/code-review` の結果

5エージェントのうち3件が指摘ゼロ、2件が指摘。両方とも管理者が一次ソースで再検証して **不採用**（誤検知）と判定した:

| 指摘 | スコア | 採否 | 根拠 |
|---|---|---|---|
| `format-validation-report.ts` にサマリ行・推奨アクション・ヘルパー関数を追加しておらず PR #271 の観測性パターンを完遂していない | 25 | **不採用** | `format-validation-report.ts:233-238` が `report.warnings` を総称的に全件レンダリングするため、`ValidationWarning` として追加すれば既存経路に自動的に乗る。PR #271 の `adultScreeningFailures` は `webSearchStats` の **カウンタ**で総称レンダリングの対象外だったため専用コードが必要だった＝**類推が成立しない** |
| `validateGameSourceConsistency` の JSDoc「fail-open: …警告を出さない」が stale になった | 50 | **不採用** | JSDoc の当該文（`:695`）の主語は「Storefront API 不達・実体取得失敗時」で、これは `fetchSteamEntity`（`:725`）後の `if (!entity) return warnings;`（`:726`）を指す。この行は本PRで変更していないため記述は現在も正確。appId 不在は API 呼び出し前の別条件 |

## 教訓

### Issue 本文の数値は、その Issue 自身が引用しているコードと突き合わせて検算する必要がある

Issue #296 は `extractSteamAppIdFromArticle` の2経路を正しく引用していながら、自分の集計では片方しか数えていなかった。その結果:

- 実害の見積もりが約2倍に膨らんだ（55.7% → 29.5%）
- 対処案の優先順位まで歪んだ（案1は「救済5件」ではなく救済0件、案2は既存 R5 と重複）
- 「全件スキップで最悪」とした号（014 / 018）が実際には全件カバー済みだった

**Issue の数値を信じる前に、Issue が根拠として引用しているコードで実データを追跡し、独立に測り直す必要がある。**

### 同一性照合は二重化されていたが、片方しか知られていなかった

`completeness-gate.ts` の R5（選定段階）と `validate-article.ts` の `validateGameSourceConsistency`（発行段階）は、両方とも `matchGameToSteamEntity` の3軸照合を使う同一チェック。R5 は `steamAppId` を直接読むため `sourceUrls` に依存しない。Issue が問題にしていたスキップは **二重チェックの後段が動かないだけ**という位置づけだった。

コードには設計判断が書かれている（`completeness-gate.ts:15` の「前倒し版」というコメント）が、Issue #296 の起票時にはこの二重化が参照されていなかった。**同種の機構が複数レイヤーに分かれている場合、片方だけを見て実害を見積もると誤る。**

---

# PR #305: deduplicateGames のマージ漏れ3フィールドを塞ぐ（Issue #300）

- **Issue**: #300（Closed）
- **関連**: #299（`steamRawDeveloper` 経由で `developer` を充填）、#296（同一性照合スキップ）、#297（別作品メタデータ混入。Issue #284 の実例）
- **PR**: #305
- **ブランチ**: `fix/issue-300-dedup-merge-gaps`
- **マージ**: 2026-08-13（マージコミット `c0862ef`。通常マージ、squashではない）
- **コミット**: 1本（`01fe60f`）
- **テスト**: 29ファイル / **1227テスト**全通過（着手前 1220。新規7件）

## 何が問題だったか

### Issue 本文の主張

Issue #300 は「`deduplicateGames` が `steamRawDeveloper` をマージせず、IGDB側がprimaryになると生値が失われる（24フィールド中これだけ漏れている）」とし、3つのデータ例を挙げていた:

- `steamRawDeveloper` の書き込み2箇所は Steam Storefront 由来（`fetch-data.ts:483` / `:492-493` の隣接した if ブロック内）
- 緩和要因として、vet 時の Storefront 再取得で復元される経路がある

**Issue 本文の記述はおおむね正確だった**。書き込み箇所の引用、緩和要因の指摘、マージ対象24フィールドという数え方（後述の内訳と一致）はいずれも検証可能で、Issue が単純な誤認に基づくものではないことを示していた。

### 着手前の独立検証で判明した追加の発見

管理者が `GameData` 型定義（`scripts/types.ts:96-148`）の全フィールドと `deduplicateGames` のマージ処理（`fetch-data.ts:601-647`）を突き合わせた結果、**漏れは3件あった**:

| フィールド | 由来 | 用途 |
|---|---|---|
| `steamRawDeveloper` | Steam Storefront | 話題性ルートの大手ゲート（`select-indie-with-fallback.ts:134`）+ PR #299 以降は `developer` の充填元 |
| `steamRecommendations` | Steam Storefront | 話題性閾値の判定軸（`meetsPopularityThreshold`。`select-indie-with-fallback.ts:36-40`） |
| `igdbWebsites` | IGDB | reconcile で `resolveGameIdentity` に渡され store URL 解決に使われる（`fetch-data.ts:359`） |

**Issue のタイトル「24フィールド中これだけ漏れている」は不正確で、実際は3件あった。** 特に重要な点として、`steamRawDeveloper` と `steamRecommendations` は **同じ if ブロック内に隣接して書き込まれる**（`fetch-data.ts:480-493`。両方とも `game.steamAppId` の存在が前提）にもかかわらず、両方ともマージ対象外だった。

#### GameData の全フィールドとマージ対象の内訳

GameData は総**34フィールド**（`types.ts:96-148` を正規表現 `^\s+[a-zA-Z_]+(\?)?:` でフィルタして計数。コメント行を除外）。本PR後のマージ対象は **27フィールド**（`fetch-data.ts:601-647` で `primary.<field> =` の行を計数）。

**対象外7フィールド**（34 − 27）の内訳と理由:

| フィールド | 対象外の理由 |
|---|---|
| `coverImageOrientation` | 記事生成段階で書かれる値（`finalize-game-metadata.ts:152` / `:187` / `:254`）。dedup 時点に存在しない |
| `isAiInferred` / `aiInferredFields` | 記事生成段階で書かれる値（`generate-articles.ts:151` / `:557`、`build-issue.ts:293-295`）。dedup 時点に存在しない |
| `title` / `normalizedTitle` | 正式名称採用ロジックで意図的に別扱い（`fetch-data.ts:591-594`。IGDB 由来のタイトルを primary に上書き） |
| `steamAppId` / `source` | グループ化キー（`steamAppId` は `:541-549` の `byAppId`、`:555-564` の `bySlug`）およびマージ先選定（`source.length` は `:579`）に使う値。マージ処理の入力自体なので対象外 |

本PRで追加したのは3行（`fetch-data.ts:605` / `:611` / `:628`）で、マージ対象は 24 → **27フィールド**になった。

### 発見2: 実害の条件は Issue 本文よりさらに狭い（構造的な理由）

`steamRawDeveloper` / `steamRecommendations` の書き込み2箇所は **どちらも `game.steamAppId` の存在が前提**（`fetch-data.ts:446-448` の早期 `continue` で `!game.steamAppId` は弾かれる）。

一方、dedup のグループ化は `steamAppId` が **同じ**ものをまとめる（`:541-549` の `byAppId`）。したがって、`steamRawDeveloper` または `steamRecommendations` を持つ dup があるグループでは、**primary も必ず同じ `steamAppId` を持つ**ため、vet 時の Storefront 再取得（`select-indie-with-fallback.ts` / `select-newreleases-with-fallback.ts` が呼ぶ `finalizeGameMetadata` の内部。`finalize-game-metadata.ts:192` の `if (game.steamAppId && needsStorefrontCompletion(game, required))` で発火し `:195` で `appids=${appId}` を叩く）の前提が構造的に満たされる。

実害は **Storefront 取得失敗**（Issue #227。API 不達やタイムアウト）と重なった場合に限られる。

`bySlug` グループ（`steamAppId` なし組。`:555-564`）ではどのエントリも `steamAppId` を持たず、書き込み処理に到達しないため `steamRawDeveloper` / `steamRecommendations` が存在し得ない。無関係。

`igdbWebsites` には Storefront 再取得の経路が無いため、この緩和は適用されない。

### 実害の実績は未測定のまま実施

ローカル `data/aggregated.json` は `fetchedAt=2026-05-16` で `steamRawDeveloper` の出現件数が0件のため、検出力が無い。

修正が **単調**（未設定の値を埋めるだけで既存値を上書きしない。`??` による補完のため、primary が既に値を持つ場合は何も起きない。供給が減るリスクが構造的にゼロ）なので、Issue #274 対応（PR #279）の前例に従い測定を待たずに実施した。

## 実装内容

3行追加のみ。既存24フィールドの行には手を触れていない。

```typescript
// fetch-data.ts:605 (igdbWebsites)
primary.igdbWebsites = primary.igdbWebsites ?? dup.igdbWebsites;

// fetch-data.ts:611 (steamRawDeveloper)
primary.steamRawDeveloper = primary.steamRawDeveloper ?? dup.steamRawDeveloper;

// fetch-data.ts:628 (steamRecommendations)
primary.steamRecommendations = primary.steamRecommendations ?? dup.steamRecommendations;
```

配置と、`??` を選んだ理由:

### `steamRecommendations` に `??` を使った理由

`steamRecommendations` は `number` 型で、**`0` は「おすすめ数0件」という有効な実測値**。`||` 演算子だと `0` が偽値として扱われ、primary が `0` を持つ場合に dup 側の値（例えば `5000`）に置き換わってしまう。これは「より良い値を採る」方針に反し、primary の実測値を消去する。

`??` は `undefined` / `null` のみを偽として扱うため、`0` を保持する。

### `igdbWebsites` に `??` を使った理由

`igdbWebsites` は配列だが、書き込み側が **空配列を入れず undefined にする設計**（`fetch-data.ts:358-360` の `if (igdb.websites?.length)` ガード。`websites` が空配列なら書き込まない）。

したがって、`genres` / `platforms` 系の `.length ?` パターン（`:607-608`）ではなく、`screenshots` / `keywords` と同じく `??` が適切（`:624` / `:642`）。

## テスト

7件追加（`fetch-data.test.ts`）。テスト数は 1220 → **1227**。

### 新規7件の内訳

テスト名で記録する（行番号は今後のテスト追加でずれるため、`grep -n "  it(" scripts/fetch-data.test.ts` で引き直すこと）。いずれも `describe('deduplicateGames — steamRawDeveloper/steamRecommendations/igdbWebsites のマージ (Issue #300)')` 配下。

| # | テスト名 | 検証内容 |
|---|---|---|
| 1 | 「Steam側がprimaryに選ばれるとき、IGDB側の重複から igdbWebsites を引き継ぐ」 | `steamRank` を持つ Steam 側が primary になり、IGDB 側 dup の `igdbWebsites` を引き継ぐ |
| 2 | 「Steam由来の2フィールド（steamRawDeveloper/steamRecommendations）を dup 側が持ち primary が持たない場合に引き継がれる」 | Steam Storefront 由来の2フィールドの補完 |
| 3 | 「境界値: dup.steamRecommendations が 0 のとき primary の undefined に対して 0 が正しく引き継がれる」 | **`0` が有効値として通ること**（`\|\|` 実装なら失敗する） |
| 4 | 「境界値: primary が steamRecommendations = 0 を持ち dup が大きい値を持つ場合、primary の 0 が保持される」 | `??` の意味（既存値が `0` でも上書きしない） |
| 5 | 「primary の既存値が上書きされないこと（3フィールドすべて）。ポジティブコントロールとして primary が値を持たないケースを同居させる」 | 3フィールドの非上書き。**同一テスト内にポジティブコントロール（primary が値を持たず補完されるケース）を同居** |
| 6 | 「回帰の実害: steamRawDeveloper がマージされることで、isLargeStudio(merged.steamRawDeveloper).hit が true になる（大手ゲートが機能する）」 | マージにより大手ゲートが機能する。`Ubisoft Montreal` → `{hit: true, matched: 'Ubisoft'}`（`indie-classifier.ts:40` に `'ubisoft montreal'` が実在。管理者が `isLargeStudio` を実行して確認）／**ポジティブコントロール**として `Tiny Indie Studio` → `{hit: false}` |
| 7 | 「igdbWebsites が undefined のまま残るケース（両方持たない）」 | 空配列への暗黙変換が起きないことの確認 |

## ミュータント検証（管理者が実施。6種すべてテストが検出）

検出したテストは行番号ではなくテスト名で記録する（行番号は今後のテスト追加でずれるため）。

| ミュータント | 結果 | 検出したテスト |
|---|---|---|
| `steamRecommendations` を `??` → `\|\|` に変える | 1件 failed | 「境界値: primary が steamRecommendations = 0 を持ち dup が大きい値を持つ場合、primary の 0 が保持される」 |
| `steamRawDeveloper` のマージ行を削除（元の欠陥に戻す） | 3件 failed | 「Steam由来の2フィールド…を dup 側が持ち primary が持たない場合に引き継がれる」「primary の既存値が上書きされないこと（3フィールドすべて）…」「回帰の実害: steamRawDeveloper がマージされることで、`isLargeStudio(merged.steamRawDeveloper).hit` が true になる…」 |
| `steamRecommendations` のマージ行を削除 | 3件 failed | 「Steam由来の2フィールド…」「境界値: dup.steamRecommendations が 0 のとき primary の undefined に対して 0 が正しく引き継がれる」「primary の既存値が上書きされないこと…」 |
| `igdbWebsites` のマージ行を削除 | 2件 failed | 「Steam側がprimaryに選ばれるとき、IGDB側の重複から igdbWebsites を引き継ぐ」「primary の既存値が上書きされないこと…」 |
| `steamRawDeveloper` の上書き方向を反転（`dup.steamRawDeveloper ?? primary.steamRawDeveloper`） | 1件 failed | 「primary の既存値が上書きされないこと（3フィールドすべて）…」 |
| `igdbWebsites` の上書き方向を反転 | 1件 failed | 「primary の既存値が上書きされないこと（3フィールドすべて）…」 |

## `/code-review` の結果

5エージェントのうち3件が指摘ゼロ、2件が指摘。両方とも管理者が一次ソースで再検証して **不採用**（誤検知）と判定した。

### 指摘1（スコア25。不採用）: 「`steamRecommendations` は人気指標なので JSDoc の方針に反する。`??` ではなく `Math.max` にすべき」

#### 指摘の根拠

`deduplicateGames` の JSDoc（`fetch-data.ts:533-537`）が「スコア・人気指標は合算ではなく『より良い値』を採用する（重複加算を防ぐ）」と述べており、マージブロックに「スコア・人気指標は『より良い値』を採用」という節（`:629-633`）があって `steamRank` が `Math.min`（`:631`。小さいほうが上位）、`youtubePopularity` が `Math.max`（`:633`。大きいほうが人気）を使っている。

指摘は「`steamRecommendations` も人気指標なので `Math.max` にすべき。`??` では primary=10 / dup=50000 のペアで primary の 10 が採用され、閾値5000を誤って落とす」という失敗シナリオを挙げた。

#### 不採用の根拠（到達不能）

`steamRecommendations` の書き込み2箇所は **どちらも `game.steamAppId` の存在が前提**（`fetch-data.ts:446-448` の早期 `continue` が `!game.steamAppId` を弾く。書き込みは `:492-493`）。値は `appids=${game.steamAppId}` で取得される（`:458`）。

一方、dedup は **同一 `steamAppId`** でグループ化する（`:541-549` の `byAppId`）。同一グループのメンバーは **同じ appId = 同じ API 応答**から値を得る。異なる値を持つ状態が構造的に発生しない。

`bySlug` グループ（`:555-564`）は appId がなく、そもそも書き込み処理に到達しないため `steamRecommendations` が存在し得ない。

#### 対比として重要: なぜ `youtubePopularity` は `Math.max` を必要とするか

`youtubePopularity` の書き込み（`:269`）は `steamAppId` に依存せず、**タイトル正規化でマッチした動画ごとに加算される**（`:265-275`。`isSameGameIdentity` の照合が通るたびに `+=`）。

したがって、同一グループ内のメンバーが **異なる動画とマッチ**した場合、値が分岐し得る。`Math.max` はこの分岐を「より人気が高い方を採る」で解決する。

`steamRank` も Top Sellers（`fetch-data.ts:192-213`）と Top Played（`:215-236`）で別の順位が入り得るため、`Math.min` が必要。

**`steamRecommendations` はこの2つと構造が異なる。** 書き込みガードとグループ化キーが同じ `steamAppId` であるため、値が分岐しない。

### 指摘2（スコア25。不採用）: 「`steamRawDeveloper` は `developer` と対なので `developerGameCount` と同様のペアリングガードが必要」

#### 指摘の要旨

「`developerGameCount` は `pickDeveloperGameCount` 関数（`indie-classifier.ts:347-360`）を使ってペアリングガードしている（`fetch-data.ts:612-622`。コメントが `:612-614`、呼び出しが `:615-622`）が、`steamRawDeveloper` は `developer` と対になる値なので、同様のガードを追加すべき」という指摘。

#### 不採用の根拠

`steamRawDeveloper` の消費は話題性ルート（`select-indie-with-fallback.ts`）の2箇所（`:134` の `isLargeStudio(finalizeResult.game.steamRawDeveloper).hit` / `:154` の `developer: finalizeResult.game.steamRawDeveloper` による充填。`:147-151` はその理由を述べたコメント）のみ。

到達条件が **`isOnlyDeveloperMissing`**（同ファイル `:117` の呼び出し）= `developer` が未設定であること（定義は同ファイル `:46-54`。`:54` が `return hasCover && hasSourceUrl && !game.developer;`）。

つまり、`developer` と併存した状態で読まれる経路が無く、不一致が観測されない。

#### 対比: `developerGameCount` のガード（`pickDeveloperGameCount`）が必要な理由

「名前と件数が別ソース由来で取り違わる」実害を防ぐもの（PR #237 のレビューで追加）。`developer` は IGDB / Steam の複数経路から書かれる（`fetch-data.ts:132` の `enrichGameWithIGDB` 内、`:334` の `aggregateGames` 内、`:384` の新規エントリ生成、`:484` の Steam Storefront 補完）。一方 `developerGameCount` は IGDB 単独由来で、書き込みは `pickDeveloperGameCount` 経由の `:337-342` のみ。

ペアリングガードは「マージ後の `primary.developer` と dup 側の名前が一致する場合のみ dup の件数を採る」（`:612-614` のコメント）。

`steamRawDeveloper` は Steam 単独由来（`:483`）で、同種の実害が生じない。

## 教訓

### 1. Issue が指摘した1件を直す前に、同じ構造の漏れが他にないか型定義と突き合わせる

Issue #300 は正確に1件（`steamRawDeveloper`）を指摘していたが、実際は同種の漏れが **3件**あった。

うち1件（`steamRecommendations`）は指摘された `steamRawDeveloper` と **同じ if ブロック内に隣接して書き込まれる**フィールドだった（`fetch-data.ts:480-493`）。1件だけ直せば、次に同じ Issue を立てることになっていた。

**型定義の全フィールド（34件）を列挙し、マージ処理の全行（27件）と突き合わせて、漏れの全件（3件）を先に確定してから修正する必要がある。**

### 2. 手で列挙するマージ処理は構造的に漏れる

24フィールドを1行ずつ列挙する形（`fetch-data.ts:601-647`）は、`GameData` にフィールドを追加したときの更新漏れを防げない。

今回の3件はいずれもその産物:

- `steamRawDeveloper`: PR #280（2026-08-11）で追加。dedup への反映漏れ
- `steamRecommendations`: PR #226（2026-08-08）で追加。dedup への反映漏れ
- `igdbWebsites`: Issue #234（2026-08-09）対応で `websites` が復活。dedup への反映漏れ

対処案3として Issue #239 と合わせて別途検討する。

### 3. 「方針に反する」という指摘は、その方針が守るべき実害が到達可能かまで確認して採否を決める

`steamRecommendations` を `Math.max` にすべきという指摘は、JSDoc の記述（「スコア・人気指標は『より良い値』を採用」）としては筋が通る。

しかし、書き込みガードとグループ化キーが同じ `steamAppId` であるため、**値が分岐する状態が構造的に発生しない**。指摘が想定する失敗シナリオ（primary=10 / dup=50000）は到達不能。

`youtubePopularity` は書き込みが `steamAppId` に依存しないため値が分岐し得る。`steamRecommendations` とは構造が異なる。

**方針への適合だけでなく、その方針が防ごうとする実害が実際に起こり得るかまで確認する必要がある。**

---
