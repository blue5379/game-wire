  各セッションの冒頭に貼る共通ヘッダと、PR別の指示に分けています。

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
| PR-C | `feat/unreleased-article-branching` | 未着手 | - | PR-E と同じ箇所を触る。どちらか先に入れて他方をリベース |
| PR-D | `refactor/remove-metacritic-path` | ✅ **完了**（単独ブランチではなく PR #258 に吸収） | - | **このブランチ自体は使われなかった。** 実際の作業は下記 **`#253` 対応**行（PR #258）としてマージされた。名作枠PR（#254）マージ後に着手されたため、当初想定していた競合は発生しなかった |
| **#253 対応** | `fix/issue-253-qualified-game-cleanup` | ✅ **マージ済み**（2026-08-10。マージコミット `0af2a36`。通常マージ、squashではない） | **#253**（Closed）/ 関連 **#251**（Open のまま。コード変更なし） / PR #258 | PR-D が担当する予定だった `metascore` 削除を吸収 + `steamPlayers` の恒常的デッドコードを発見して削除 + `igdbRating` レスキュー経路を維持して仕様書に明文化。29ファイル / **1101テスト**（着手前 1106）。コミット2本（実装 `5c9e9b4` → `/code-review` 指摘2件の対応 `44bec5b`） |
| 名作枠PR | `feat/issue-classic-slot-population` | ✅ **マージ済み**（2026-08-09。`0a2b025`。merge commit） | 関連 **#238** / PR #254 | **ブランチ名は当初案の `feat/classic-slot-redesign` から変更**。29ファイル / **1106テスト**（着手前 27 / 1021）。コミット2本（実装 → レビュー対応）。母集団条件を評価母数ベース（`total_rating >= 85 & total_rating_count >= 200`）に変更し、選定側 `buildClassicCandidates` も同条件に一本化。実測: **名作枠選定が `Splatoon Raiders` → `The Witcher 3: Wild Hunt` に変化**、他枠は不変。**着手前検証で `parent_game` が展開可能なことを発見**し、決着ブロックが前提としていた ID 集合照合が不要になった（`igdbId` 追加も不要）。**レビューで欠陥1件を検出・修正**（親の `game_type` を見ずに `Final Fantasy VII Remake` を誤除外）。**`/code-review` 指摘4件のうち2件を本PRで対応**（選定側の `game_type` ゲート欠落・`limit 200` の非対称）、**2件を #255 / #256 に分離**（Creator's Eye の影響記述要求・特集プレフィルタのプロンプト肥大） |
| PR-I | `feat/indie-scale-classification` | ✅ **マージ済み**（2026-08-09。`7a2a0da`。squash） | #231（Closed）/ 関連 #175（`Refs`）/ PR #237 | 26ファイル / **960テスト**（着手前 26 / 865）。コミット2本（実装 → レビュー対応）。**着手後に「決着済みだが未実装」の論点A（新作枠の企業規模ゲート撤廃）を発見し、同PRで実装**（下記「実施結果」）。Issue #231 が提案していた方針は決着で棄却された A-3 相当だった。**分離した Issue は 7 件**（#234 / #235 / #236 / #238 / #239 / #240 / #241） |
| PR-E | `fix/prompt-excerpt-length` | 未着手 | - | PR-C と同じ箇所を触る。どちらか先に入れてリベース |
| PR-F0 | `fix/publish-date-jst` | 未着手 | - | PR-F の直前に入れる |
| PR-F | `feat/feature-event-fallback` | 未着手 | - | PR-F0 の後 |
| PR-G | `feat/article-count-validation` | 未着手 | - | PR-B・名作枠PR より後。severity=high の妥当性は§9.1の保留と合わせて着手前にユーザー確認 |
| **#260 対応** | `fix/issue-260-newrelease-window` | ✅ **マージ済み**（2026-08-10。マージコミット `7a33cea`。squash） | **#260**（Closed）/ 関連 **#241**（Closed） / PR #261 | 29ファイル / **1104テスト**（着手前 1101）。コミット1本（squash）。`selectGamesForArticles` 内の `releasedAfter` が3ヶ月窓（`setMonth(-3)`、実測約91〜92日）のまま、仕様書§2.3・付録パラメータ表の60日窓（#241対応でIGDB側の母集団クエリは既に統一済み）と乖離していたのを `sixtyDaysAgo`（`setDate(-60)`）に統一。管理者が実データ（`data/aggregated.json` 105件、fetchedAt=2026-05-16）で `buildNewReleaseCandidates` の実ロジックを検証し、**60日窓の候補14件に対し3ヶ月窓の候補は22件、うち`Slay the Spire II`（基準日の91日前発売）は3ヶ月窓では4軸スコアで全候補中2位となり新作枠（採用数2）に実際に選定されるが、60日窓では母集団にすら入らない**実害を確認。`buildNewReleaseCandidates`の境界値回帰テストを新規追加（59日前=含む・60日前=境界で除外・61日前=除外）。`fetch-igdb.ts`の`fetchIndieGames`（インディー枠、§3の母集団取得クエリ）にある同名変数`threeMonthsAgo`は完全に別機能でスコープ外のため変更なし |
| **#250 対応** | `fix/issue-250-upcoming-limit` | ✅ **マージ済み**（2026-08-10。マージコミット `86da8d5`。squash） | **#250**（Closed）/ 関連 **#244**（Closed） / PR #263 | 29ファイル / **1104テスト**（着手前 1104。変化なし。既存クエリ文字列アサーションの更新のみ）。コミット2本（実装 → `/code-review`指摘対応）。`fetchUpcomingGames`（未発売クエリ）の`limit`を20→50に引き上げ、発売済み側の2軸クエリ（#241/PR #243）と揃えた。90日窓の母集団は実測33〜34件あり`limit 20`で切られていたため、#244で緩和したはずの`game_type`条件（Main/Remake/Remaster許可）の恩恵（`Rayman Legends Retold`等）が実質無効化されていた。`/code-review`で、§8実装計画テーブルの#241行（`limit 20`の記述を含む）が未更新のまま矛盾していた点を指摘され、同PRで追加コミットして対応 |
| **#256 対応** | `fix/issue-256-feature-prefilter-summary-cap` | ✅ **マージ済み**（2026-08-10。マージコミット `34919f8`。squash） | **#256**（Closed）/ 関連 名作枠PR（#254） / PR #264 | 29ファイル / **1107テスト**（着手前 1104。新規3件）。コミット1本。特集テーマ事前フィルタ（`prefilterFeatureCandidatesByTheme`）が候補ゲームの`summary`を全文プロンプトに載せており、名作枠の母集団拡大（PR #254、123→288件）で約+34Kトークン/号のコスト増になっていたのを、`FEATURE_PREFILTER_SUMMARY_MAX_CHARS`（200文字）で切り詰めて解消。候補件数・選定ロジック自体は不変。`/code-review`で1件指摘（単純`slice`によるUTF-16サロゲートペア分割のリスク）が出たが、低リスク・既存コード（`fetch-web-search.ts`の同パターン）と整合との判断で見送り、別Issue分離もせず |
| **#255 対応** | `fix/issue-255-creators-eye-hallucination-risk` | ✅ **マージ済み**（2026-08-10。マージコミット `be24575`。squash） | **#255**（Closed）/ 関連 名作枠PR（#254） / PR #265 | 29ファイル / **1109テスト**（着手前 1107。新規2件）。コミット2本（実装 → `/code-review`指摘対応）。`classicSystem`のCreator's Eyeが「後世に影響を与えた革新的な要素」という根拠のない歴史的影響の記述を要求し続けていた（名作枠PR #254の`/code-review`で発覚し本Issueに分離）のを、要求項目自体を削除して解消。§2（📜ゲームの歴史）に既に入れていた「情報が無ければ省略可」ガードは、Creator's Eyeが必須セクションのため踏襲せず。`/code-review`で回帰テストが無い点を指摘され、同PRで追加コミットして対応 |
| **#221 対応** | `fix/issue-221-empty-feature-guard` | ✅ **マージ済み**（2026-08-10。マージコミット `ccc44f1`。squash） | **#221**（Closed）/ 関連 **#179**（設計原則）・**#222**（Closed。PR-0.1の`/code-review`で本Issueと同時に分離された別懸念。→ PR #271 で対応済み） / PR #267 | 29ファイル / **1110テスト**（着手前 1109。新規1件）。コミット2本（実装 → `/code-review`指摘2件の対応）。`selectedGameData`が0件になった場合に`throw`するガードを追加。管理者が実データで検証し、過去に公開された全19号のfeature記事は`recommendedGames`が3〜5件で0件になったことは一度もない（実害はまだ発生していない理論上の欠陥）と確認した |
| **#247 対応** | `fix/issue-247-featured-recommended-url-validation` | ✅ **マージ済み**（2026-08-10。マージコミット `7cfa916`。通常マージ、squashではない） | **#247**（Closed）/ 関連 **#234**（PR #246のレビューで分離） / PR #269 | 29ファイル / **1124テスト**（着手前 1110。新規14件）。コミット2本（実装 → `/code-review`指摘対応）。特集記事`recommendedGames[].officialUrl`にBluesky/Discordの非公式URLが本番で5件混入していた実害を解消。**着手前の独立検証でIssue本文より深い根本原因を発見**（下記「実施結果」に詳述）: `NON_OFFICIAL_URL_PATTERNS`のドメイン抜けにより、Tavily経由の誤候補がIGDBの正しい公式URLを無条件に上書きしていた。根本原因の修正+出力時ゲート追加の両方を実施 |
| **#222 対応** | `fix/issue-222-adult-screening-observability` | ✅ **マージ済み**（2026-08-11。マージコミット `c333eaf`。通常マージ、squashではない） | **#222**（Closed）/ 関連 **#221**（PR-0.1のレビューで同時に分離） / PR #271 | 29ファイル / **1168テスト**（着手前 1124。新規44件）。コミット2本（実装 → `/code-review`指摘4件の対応）。**着手前検証でIssue本文の前提（「AIスクリーニングは特集枠の主防御」）が誤りと判明**し、Issueにコメントで訂正（実際はIGDBの`themes != (42)`が第1層、AIスクリーニングは第3層）。観測の出力先が**2系統**（CIのstdout / 永続化されるValidation Report）あることをデータフロー追跡で発見し、初回実装で漏れていたレポート側も追加対応。`/code-review`が**例外以外の第2のfail-open経路**（応答形式不正）を検出し、別カウンタで計上（ただし実態未観測のため`error`昇格はさせない仕様判断をテストで固定） |
| **#235 対応** | `fix/issue-235-drop-youtube-popularity-route` | ✅ **マージ済み**（2026-08-11。マージコミット `d04a107`。通常マージ、squashではない） | **#235**（Closed）/ 関連 **#217**（YouTube活用の可否検証）・**#274**（本PRのレビューで新規分離） / PR #273 | 29ファイル / **1166テスト**（着手前 1168。YouTube percentileの4テストを削除、回帰テスト+ポジティブコントロールを2件追加）。コミット1本。§3.5が2026-08-07に決定済みだった「話題性ルートをSteamの2経路だけにする」の未実装分を実装。**着手前の独立検証で前セッションの前提が再現しないことが判明**（下記「実施結果」に詳述）: 「YouTubeマッチ0件＝実質デッドコード」は直近データでは成立せず2件マッチしていたが、いずれも先に評価されるSteam経路を満たすためYouTube分岐は到達不能で、結論（供給は減らない）はより強い理由で成立した |
| **#236 対応** | `fix/issue-236-parent-publisher-entries` | ✅ **マージ済み**（2026-08-11。マージコミット `abd8f3e`。通常マージ、squashではない） | **#236**（**Closed にしていない。①が未解決のため**）/ 関連 **#231**（Closed。方針の根拠が実測で崩れた）・**#277**（本PRのレビューの横断確認で新規起票）・**#175**（上位タスク） / PR #276 | 29ファイル / **1178テスト**（着手前 1166）。コミット2本（実装 `76e31e5` → `/code-review` 指摘対応 `dd40bb4`）。真因2層のうち**②（`MAJOR_PUBLISHER_SUBSIDIARIES` の親会社エントリ欠落）だけ**を対処し、**①（IGDBのレコード分裂）は未解決のまま Issue を開いている**。Issue #231 が個社追記を退けた根拠（「PR-I の `developed` 判定と二重になる」）は**実測で崩れた**: 『ほの暮しの庭』は `developed=3` の分裂レコードに紐づき `developed` 判定が発火しない。`/code-review` 指摘1件を採用したが、**対処法はレビュー案（別 canonical を立てる）から変更し、エイリアスごと削除**した |

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
| `select-newreleases-with-fallback.ts` | **企業規模ゲートを削除**（論点A）。canonical 名の正規化（Issue #180）は維持 |
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
| **#236** | IGDB の会社レコード重複で `developed` 判定が取りこぼす |
| **#238** | 話題の国内新作『Splatoon Raiders』が新作枠に載らず名作深掘り枠に選ばれる |
| **#239** | `aggregateGames` が同一 `normalizedTitle` の既存エントリを黙って上書きする |
| **#240** | 生の `developed` 件数が多作な小規模スタジオを大手扱いする（Kairosoft = 88 本） |
| **#241** | 新作枠の母集団クエリに発売日の上限が無く、未発売の大作が枠を占領している |

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

`MAJOR_PUBLISHER_SUBSIDIARIES` は `// Microsoft / Xbox Game Studios` や `// Sony Interactive Entertainment` という**コメント見出し**の下に子会社だけを列挙し、親会社そのものがエントリとして存在しなかった。そのため `isLargeStudio('Xbox Game Studios')` が `hit: false` を返し、インディー枠の publisher 側ゲート（`select-indie-with-fallback.ts:98`）が「親会社名が偶然 `LARGE_DEVELOPERS` にも載っている場合だけ機能する」状態だった。

## 影響範囲は5箇所（引き継ぎ文書は2箇所と見積もっていた）

管理者が実読で確認した消費者一覧:

| # | 箇所 | 影響 |
|---|---|---|
| 1 | `select-indie-with-fallback.ts:97-98` | インディー枠ゲート（developer/publisher両方）→ 供給↓（狙い） |
| 2 | `select-indie-with-fallback.ts:120` | 話題性ルートの publisher ゲート → 供給↓ |
| 3 | `fetch-data.ts:1130`（`isIndieGame`） | 候補プール構築段階の絞り込み（developer のみ）→ 供給↓ |
| 4 | `select-newreleases-with-fallback.ts:75` | developer 名の canonical 上書き（表示文字列） |
| 5 | `generate-articles.ts:417`（`pickNewReleaseLabelCompany`） | 新作記事のラベル「◯◯の新作」 |

**新作枠の採用可否ゲートは §11.1 確定事項 #1 のとおり PR #237 で撤廃済み**なので、新作枠への波及は採用件数ではなく**ラベル表記のみ**である。

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

### 教訓

- **引き継ぎ文書が挙げる「影響箇所」の件数を信用しない。** 2箇所と見積もられていたが実読で5箇所あった。特に `generate-articles.ts:417` の記事ラベル経路は文書に記載が無く、canonical 文字列が読者向け表示に直結していた
- **「前のIssueがその方針を退けた」という理由を、退けた根拠ごと再検証する。** #231 は「PR-I の `developed` 判定が代わりに直す」として個社追記を退けたが、その `developed` 判定が実測でこのケースを覆っていなかった。**方針の結論ではなく、方針が依拠した機構が今も成立しているかを確認する**
