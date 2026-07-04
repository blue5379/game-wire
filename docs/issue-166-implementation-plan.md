# Issue #166 実装計画 — Steam appId による IGDB 同一性解決

> **引き継ぎ用ドキュメント。** この計画は別の LLM / 開発者がゼロから実装できるよう、
> 原因・対象コードの正確な位置・変更内容・テスト・検証手順・落とし穴まで具体的に記述する。
> 実装前に必ず「調査で確定した事実」と「未確認事項」を読むこと。

---

## 0. 背景（Issue #166 の症状）

本番 Vol.14 のインディー記事「Brick Game」で、**記事本文と `game` メタデータが別ゲームのもの**になっていた。

- 本文・summary：Steam の新作インディー `app/1087090`（開発 Daniel Shimmyo、2026-07-04 発売、
  「1970年代アーケードへのオマージュ」「GameTank 向け」）の説明。
- `game` ブロック（genre/platforms/releaseDate/developer/coverImage）：**同名の別ゲーム**、
  往年の中国製・携帯型液晶ゲーム機「Brick Game」（1989-12-31、Shenzhen Xinfeilong Electronic Factory、
  Handheld Electronic LCD、Puzzle/Racing/Arcade、cover `co4ahd.jpg`）の IGDB メタデータ。
- 参考リンク：`steam: store.steampowered.com/app/1087090`（新作＝正しい）／
  `igdb: igdb.com/games/brick-game`（旧作＝誤り）。

該当記事ファイル：`src/content/issues/issue-014.md` の 143〜194 行目（本番 main に取得済み）。

---

## 1. 調査で確定した事実（一次ソースで確認済み）

1. **Steam 側は appId=1087090 という強い同一性シグナルを持っている。**
   `scripts/fetch-steam.ts` の Top Sellers / New Releases は `appId` と `name` を確実に持つが、
   **`releaseDate` を一切持たない**（`SteamGame` に発売日フィールドがない）。

2. **IGDB 補完は名前検索しか使っていない。**
   `scripts/fetch-igdb.ts:365` `searchGameByName()` は
   `search "Brick Game"; ... limit 1;` で先頭1件を取るのみ。appId は使わない。
   同名異作品では容易に別ゲームを返す。

3. **年ベースの防御層がすべて「発売年が両方判明」を前提にしており、Steam 候補に発売日が無いと全層が同時に無効化される。**
   - `fetch-igdb.ts:440` の年ゲート：`options.expectedYear === undefined` で発動条件を外れスキップ。
     呼び出し元 `fetch-data.ts:388` は `expectedYear = extractYear(game.releaseDate)` = `undefined`。
   - `fetch-data.ts:400-409` `isSameGame`：Steam 側の年が不明のため年照合スキップ
     （`fetch-data.ts:151-155`：片方の年が不明ならタイトル一致だけで通す設計）。
     `titleMatches("Brick Game","Brick Game")` が真 → 同一ゲーム誤判定。
   - `finalize-game-metadata.ts:78` の ±90 日チェック：`inputGame.releaseDate` が無いと条件を外れスキップ。

4. **上書きが無条件。** `fetch-data.ts:411-423` は identity mismatch チェックを通過すると
   genres / platforms / releaseDate / developer / publisher / coverImage / screenshots / summary を
   `||` 演算子で IGDB 値に上書きする（既存値が空/falsy なら上書き）。
   一方 `steamAppId` と Steam URL は Steam 由来のまま残るため、
   「Steam リンクは新作・メタデータは旧作」という食い違いが完成する。

5. **出力段の検証は内的整合性を見ていない。**
   `scripts/validate-article.ts` はプラットフォーム言及・人物属性・数値主張・タイトル整合は見るが、
   **「同一ゲームカードの Steam URL が指す実体と `game` メタデータが一致するか」は検証対象外**。
   `scripts/judge-article.ts`（LLM-as-judge）も本文とWeb検索の矛盾を見るだけ。

6. **IGDB `external_games` エンドポイントで Steam appId から逆引きできる**（context7 の IGDB API ドキュメントで確認）。
   - エンドポイント：`POST https://api.igdb.com/v4/external_games`
   - フィルタ例：`where category = 1 & uid = "1087090";`（`category=1` が Steam、`uid` が Steam appId 文字列）
   - `game` フィールドが IGDB game ID の参照。
   - **注意**：ドキュメント上 `category` は "DEPRECATED! Use `external_game_source` instead" と記載。
     ただし数値 enum（steam=1）は現行 API でまだ機能する（要実機確認、下記 6-2 参照）。

### 未確認事項の実機確認結果（2026-07-05 実施）

実装前に `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` を使い、appId 1087090 と対照群
（Elden Ring appId 1245620）で `external_games` / `games` を実測した結果：

- **未確認A（据え置き）**：Vol.14 生成時に「Steam 候補の releaseDate が実際に空だった」ことは、
  コードのデータフロー上の強い推定であり、当時の実データログでの直接確認はしていない
  （中間データはローカルに残っていない）。原因の論理構造は上記1〜4で確定している。
- **未確認B → 確定**：`category = 1` フィルタは **deprecated で機能しない**（対照群 Elden Ring でも
  0 件）。Steam を示すには **`external_game_source = 1`** を使う（Elden Ring で正しく 1 件返ることを確認）。
  → ①の実装は `external_game_source = 1` を採用。
- **未確認C → 確定（OK）**：`games` エンドポイントの
  `where external_games.external_game_source = 1 & external_games.uid = "...";` の
  ネストフィルタは **1リクエストで通る**（Elden Ring で name/slug/involved_companies/websites を含めて取得できた）。
  → ①は1リクエスト方式を採用（IGDB 呼び出し回数を純増させない）。
- **重要な追加発見**：問題の **新作 Brick Game（appId 1087090）は IGDB に存在しない**
  （`external_games` にも `games` name 検索の該当作にも無い）。このため **① だけでは Brick Game 事案は防げず**、
  名前検索フォールバックが旧作 Brick Game（id=106202, 1989年）を返す。
  さらに旧作 Brick Game は IGDB websites に **Steam URL を持たない**ため、②の appId 不一致ガードも発火しない
  （title 一致・Steam 側 releaseDate 不明で `isSameGame` を通過する）。
  → **Brick Game 事案の実際の防波堤は ③**（game.releaseDate=1989 vs Steam appId 1087090=2026 の乖離検出）。
  ①②③が相補的に機能することを確認した上で全実装した。

---

## 2. あるべき仕様（設計方針）

同一性解決は「名前の類似」ではなく「**安定した外部ID（Steam appId）の突合**」を第一級の手段とする。

- **入力に appId があるゲーム**（Steam 由来の候補＝新作枠・インディー枠の大多数）は、
  IGDB を **appId で逆引き**してメタデータを取る。名前検索はしない。
  → 同名異作品は原理的に混入しない。
- **appId が無いゲーム**（IGDB 由来候補、特集のLLM知識ベース提案など）は従来どおり
  名前検索 + 年ゲートを使う（フォールバック）。
- **メタデータ上書きの一貫性**：appId 一致で確定した IGDB 結果のみ全フィールド上書き可。
  名前検索フォールバックで appId 逆照合が取れない場合はメタデータ上書きを保留する。
- **出力段の保険**：記事の `game` ブロックと Steam URL が指す実体の矛盾を検出して build fail。

---

## 3. 実装タスク（①→②→③の順。各タスクはテストファースト = Red→Green）

### 前提作業

```bash
git checkout main && git pull
git checkout -b fix/issue-166-steam-appid-igdb-lookup
```

**最初に未確認B/Cの疎通確認**（実装の前提が崩れないよう先に実機確認する）：
`IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` を使い、`external_games` に
`fields game,name,uid,category; where category = 1 & uid = "1087090";` を投げて、
Brick Game（新作 = Daniel Shimmyo 側）の IGDB game ID が返るか確認する。
返らない/deprecated で弾かれる場合は `external_game_source` 方式に切り替えてから本実装へ進む。

---

### ① appId で IGDB を逆引きする（根本原因を断つ）

**対象ファイル：`scripts/fetch-igdb.ts`**

新規関数 `searchGameBySteamAppId()` を追加する。既存の `searchGameByName()`（365行）の
戻り値マッピング（450〜513行の involved_companies 抽出・画像URL整形・国名変換・
steamUrl/officialUrl 抽出）と**同一の変換ロジック**で `IGDBGame` を返す。

**推奨実装（1リクエスト方式、未確認Cが OK の場合）**：
`games` エンドポイントに external_games ネストフィルタをかけ、逆引きとメタ取得を1回で済ませる。

```
// searchGameByName と同じ fields 一覧を使う
where external_games.category = 1 & external_games.uid = "${appId}";
limit 1;
```

**フォールバック実装（2リクエスト方式、未確認Cが NG の場合）**：
1. `external_games` に `where category = 1 & uid = "${appId}"; fields game; limit 1;` → IGDB game ID を得る。
2. `games` に `where id = ${gameId}; fields ...(同上); limit 1;` → メタデータを得る。

**共通仕様：**
- appId 逆引きで得た結果は **名前一致チェック（`isRelevantSearchResult`）を通さない**。
  appId は名前より強いシグナルであり、名前一致を要求すると
  「Steam名とIGDB名の表記ゆれ」で正しい結果を捨ててしまう。
- 年ゲート（`SEARCH_YEAR_TOLERANCE`）も appId 経路では**適用しない**（同上の理由）。
- appId が数値であることを検証し、クエリ文字列に埋め込む前に `String(appId)` で明示的に文字列化
  （インジェクション対策。appId は number 型なので実害は低いが一貫性のため）。
- 見つからなければ `null` を返す。

**エクスポート層 `enrichGameWithIGDB()`（894行）の拡張：**
- シグネチャに `steamAppId?: number` を追加：
  `enrichGameWithIGDB(gameName: string, options?: { expectedYear?: number; steamAppId?: number })`
- 本体（907行の `searchGameByName` 呼び出し）を次のロジックに変更：
  - `options?.steamAppId` があれば **まず `searchGameBySteamAppId(appId)` を試す**。
    ヒットしたらそれを返す。
  - ヒットしない、または appId が無い場合は従来の `searchGameByName(gameName, ..., options)` にフォールバック。
- `__test` エクスポート（293行）に `searchGameBySteamAppId` を追加してユニットテスト可能にする
  （※ network 部分は呼び出し側モックでカバー。純粋変換ロジックがあれば切り出して単体テスト）。

**呼び出し元の更新（appId を渡す）：**
- `scripts/finalize-game-metadata.ts:48`
  → `enrichGameWithIGDB(game.title, { expectedYear: extractYear(game.releaseDate), steamAppId: game.steamAppId })`
- `scripts/fetch-data.ts:388`
  → `enrichGameWithIGDB(game.title, { expectedYear, steamAppId: game.steamAppId })`
- `scripts/fetch-data.ts:898`（indie fallback 的 enrich）と
  `scripts/generate-articles.ts:543`（特集 LLM 提案の実在検証）と
  `scripts/generate-articles.ts:901`（特集の公式URLフォールバック）は
  **appId を持たない経路が多い**。`game.steamAppId` があれば渡す、無ければ従来どおり。
  特に `generate-articles.ts:543` の `verifyProposedGames` は LLM が提案したタイトル名しかないので
  appId 無し（名前検索のまま）でよい。

**テスト（`scripts/fetch-igdb.test.ts` に追加）：**
- `searchGameBySteamAppId` が external_games フィルタを正しいクエリ文字列で投げること
  （`igdbRequest` をモックし、body に `external_games` と `uid = "1087090"` が含まれることを検証）。
- appId 逆引きヒット時、名前が食い違っていても（"Brick Game" 新作 vs 旧作）
  **appId に対応する正しい方**を返すこと。
- appId 逆引き 0 件 → null。

---

### ② 上書きの一貫性ガード（appId 不一致の IGDB でメタを上書きしない）

**対象ファイル：`scripts/fetch-data.ts`（388〜424 行の enrich ブロック）**

現状ロジック：
1. `enrichGameWithIGDB` で IGDB 結果を取得（①適用後は appId 逆引き優先になる）。
2. `sameByAppId`（IGDB steamUrl の appId と game.steamAppId が一致）を計算（394-398行）。
3. `sameByAppId` でなければ `isSameGame`（title + 年）で判定、mismatch なら `continue`（上書き拒否）。
4. 通過したら `||` で全フィールド上書き（411-423行）。

**変更方針：**
- ① により、`game.steamAppId` がある候補は appId 逆引きで正しい IGDB 結果を得るので、
  ここに来る IGDB 結果は原則 appId 整合。だが**多層防御として上書きガードを明示的に残す**：
  - `game.steamAppId` があるのに、返ってきた IGDB 結果の appId
    （`extractSteamAppId(igdbGame.steamUrl)`）が **存在して、かつ不一致**なら
    → **メタデータ上書きを行わず `continue`**（別ゲーム混入とみなす）。
    ※ IGDB 側が steamUrl を持たない（appId 不明）ケースは、appId 逆引きで得た結果なら整合が保証されるため許容。
      名前検索フォールバック由来の場合は現状の `isSameGame`（title+年）ガードを維持。
- 上書き演算子（`||`）のセマンティクスは変えない。上書きの「可否」だけをガードする。

**注意：`isSameGame` / `titleMatches` は共有関数**（Steam集約・Metacritic突合・重複除去でも使用）。
**これらの関数のシグネチャ・挙動は変更しない。** ②はあくまで
「appId という強シグナルがある経路での追加ガード」を enrich ブロック内に足すだけにとどめる。

**テスト（`scripts/fetch-data.test.ts` に追加）：**
- Steam 候補（appId=1087090, releaseDate 無し）に対し、IGDB が別 appId を steamUrl に持つ
  「旧作 Brick Game」を返した場合 → **メタデータが上書きされない**こと（genres/releaseDate が Steam のまま）。
- appId 一致の正しい IGDB 結果 → 従来どおり上書きされること（回帰しないこと）。
- ※ `fetch-data.ts` の既存テスト構成を確認し、enrich ブロックが単体で叩けるよう
  必要なら関数抽出（例：`enrichGameFromIgdb(game, igdbGame): boolean`）を行う。抽出時は既存挙動を厳密維持。

---

### ③ 出力段の内的整合性チェック（保険）

**対象ファイル：`scripts/validate-article.ts`**

新規バリデータ `validateGameSourceConsistency(article: GeneratedArticle): ValidationWarning[]` を追加し、
`validateArticle()`（559行）の集約に組み込む。

**検証内容：**
- 対象：`article.game` があり、かつ `article.sourceUrls?.steam`（または `article.game` 側の steam 由来情報）が
  Steam URL を持つ記事（newRelease / indie）。
- Steam appId を URL から抽出し、Steam Storefront API
  （`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=jp&l=japanese`）で
  `name` / `release_date.date` / `developers` を取得。
- `article.game.releaseDate` の年と Storefront の発売年が **2年以上乖離** → `high` / `type: 'game-source-mismatch'`。
- `article.game.developer` と Storefront `developers[0]` がどちらも判明していて
  正規化後に全く一致しない → `high`（表記ゆれ吸収の正規化は既存 `isSameSteamApp` の norm 相当を流用）。
- どちらか一方でも high が立てば、既存の build fail 運用（`writeAndCheckReport` の high 閾値）で止まる。

**設計上の注意：**
- `validateArticle()` は現状**同期関数**（`ValidationWarning[]` を返す）。③は Storefront API 呼び出しで
  **非同期**になる。以下いずれかを選ぶ（実装者判断、影響範囲を確認して決める）：
  - (a) `validateArticle` を `async` 化し、呼び出し元
    （`generate-articles.ts:1341,1348` の再生成前後チェック、`validate-article.ts:629` の `validateArticles`、
    `build-issue.ts:538`）をすべて `await` 対応にする。**影響が広いので全呼び出し元の洗い出し必須。**
  - (b) ③を**別の非同期バリデータ関数**として切り出し、`build-issue.ts` の発行直前チェック
    （`validateArticles` 呼び出し付近、538行）だけに組み込む。同期の `validateArticle` は変更しない。
    → **(b) を推奨**（影響範囲が最小、再生成ループの同期性を壊さない）。
- Storefront API はレート制限がある。記事数は1号あたり最大6本、うち Steam URL 持ちは
  newRelease 2 + indie 2 = 最大4本程度。呼び出し間に 200〜500ms のディレイを入れる
  （既存 `fetch-steam.ts` / `finalize-game-metadata.ts` のディレイ実装を踏襲）。
- API 失敗時は**警告を出さない**（fail-open）。検証は「矛盾を検出したら止める」ものであり、
  API 不達で誤って build を落とさない。失敗は構造化ログ（scope/step）に記録。

**テスト（`scripts/validate-article.test.ts` に追加）：**
- Brick Game 相当のデータ（game.releaseDate=1989、Storefront=2026）→ high 警告が出ること
  （`global.fetch` をモックして Storefront レスポンスを差し込む。既存 finalize テストのモックパターン参照）。
- 整合ケース（game.releaseDate=2026、Storefront=2026）→ 警告なし。
- API 失敗 → 警告なし（fail-open）。

---

## 4. 品質ゲート（コミット・PR 前に必須）

`/Users/ryo/.claude/CLAUDE.md` の規約により、以下をローカルで全通過させてから PR を作る：

```bash
npm run typecheck        # 型チェック（package.json に typecheck スクリプトあり）
npm test                 # vitest（新規テスト含め全通過）
# シンボルの削除・リネームをした場合は残存参照を grep で確認
grep -rn "enrichGameWithIGDB" scripts/
```

- 新規テストは必ず **Red（実装前に失敗）→ Green（実装後に通過）** を確認する。
- `expect(true).toBe(true)` のような無意味アサーション禁止。具体的な入出力を検証する。
- 本番コードに `if (testMode)` 等のテスト専用分岐・マジックナンバーを入れない。
  閾値（乖離年数など）は定数化し、必要なら環境変数で分離。

---

## 5. 二次災害を防ぐための注意点（重要）

1. **IGDB API 呼び出し回数を純増させない。**
   ①は既存の `enrichGameWithIGDB` 呼び出しを「appId 逆引き優先・名前検索フォールバック」に
   置き換える形にする。逆引きと名前検索を**両方**呼ぶ実装にしないこと（レート制限・コスト増）。
   1リクエスト方式（games + external_games ネスト）が使えるなら最優先で採用。

2. **`isSameGame` / `titleMatches` / `normalizeTitle` は共有関数。触らない。**
   これらは新作枠・名作枠・重複除去・Metacritic 突合で多用されている
   （`fetch-data.ts` 内の複数箇所）。挙動を変えると広範囲に回帰する。
   ②の改修は enrich ブロック内に**加算的にガードを足す**方式で、共有関数のセマンティクスは不変に保つ。

3. **`??`（finalize）と `||`（fetch-data）の演算子差に注意。**
   `finalize-game-metadata.ts` は `??`（null/undefined のみ補完、既存値優先）、
   `fetch-data.ts` は `||`（falsy を上書き）。②は上書きの「可否」をガードするだけで、
   両者の演算子の意味は変えない。

4. **③の同期→非同期化は影響が広い。** 推奨は (b) の「別関数を build-issue 直前だけに組み込む」。
   `validateArticle` を async 化する (a) を選ぶ場合は、
   `generate-articles.ts` の再生成ループ（1341/1348行）を含む全呼び出し元の await 対応を漏れなく行う。

5. **fail-open を徹底。** ③の外部API検証は、API 不達で build を落とさない。
   矛盾を「検出できたときだけ」high を立てる。

6. **既存テストが回帰の網。** `fetch-igdb.test.ts` / `finalize-game-metadata.test.ts` /
   `identity-resolver.test.ts` / `select-indie-with-fallback.test.ts` /
   `select-newreleases-with-fallback.test.ts` / `validate-article.test.ts` を必ず全通過させる。

---

## 6. PR 作成とレビュー

```bash
gh pr create --title "fix: Steam appId による IGDB 同一性解決で同名異作品の混線を防止 (#166)" \
             --body "Closes #166"
```

- PR 本文に、原因（§1）・対処（§2,3）・残存リスク（§1 未確認A〜C の結論）を記載する。
- CLAUDE.md 規約により、**PR 作成後は自動で `/code-review` を実行**してレビュー結果を提示する。
- マージ後は `git checkout main && git pull` でローカル main を同期する。

---

## 7. 参考：関連コードの正確な位置（実装時の索引）

| 内容 | ファイル:行 |
|------|-------------|
| `searchGameByName`（名前検索・年ゲート） | `scripts/fetch-igdb.ts:365`, 年ゲート 440 |
| IGDBGame マッピング（involved_companies 等） | `scripts/fetch-igdb.ts:450-513` |
| `enrichGameWithIGDB`（エクスポート層） | `scripts/fetch-igdb.ts:894` |
| `__test` エクスポート | `scripts/fetch-igdb.ts:293` |
| fetch-data の enrich ブロック（②の対象） | `scripts/fetch-data.ts:385-424` |
| `isSameGame` / `titleMatches`（共有・不変） | `scripts/fetch-data.ts:145`, `115` |
| `extractSteamAppId` / `extractYear`（既存ヘルパー） | `scripts/fetch-data.ts:104`, `82` |
| finalize の IGDB 再検索（①で appId 追加） | `scripts/finalize-game-metadata.ts:48` |
| finalize の ±90日チェック | `scripts/finalize-game-metadata.ts:78` |
| indie 選定（finalize 呼び出し） | `scripts/select-indie-with-fallback.ts:103` |
| newRelease 選定（finalize 呼び出し） | `scripts/select-newreleases-with-fallback.ts:50` |
| `validateArticle`（③の組み込み先） | `scripts/validate-article.ts:559` |
| `validateArticles` / `writeAndCheckReport` | `scripts/validate-article.ts:622`, `664` |
| build-issue の検証呼び出し（③推奨組み込み先） | `scripts/build-issue.ts:538` |
| `GeneratedArticle.game` の構造 | `scripts/generate-articles.ts:114-140` |
| Steam Storefront モックの参考パターン | `scripts/finalize-game-metadata.test.ts:159-174` |
| `SteamGame`（releaseDate を持たない） | `scripts/types.ts`（SteamGame 定義） |

---

## 8. 完了の定義（Definition of Done）

- [ ] 未確認B/C を実機確認し、採用する external_games クエリ方式を確定
- [ ] ① `searchGameBySteamAppId` 実装＋テスト、`enrichGameWithIGDB` に steamAppId 経路追加、全呼び出し元更新
- [ ] ② fetch-data enrich ブロックに appId 不一致ガード追加＋テスト
- [ ] ③ build-issue 直前に非同期の内的整合性バリデータ追加＋テスト（Brick Game 相当で high 検出）
- [ ] `npm run typecheck` / `npm test` 全通過
- [ ] Brick Game 相当のシナリオ（appId あり・releaseDate 無し・同名異作品が IGDB に存在）で
      混線が再現しないことをテストで保証
- [ ] PR 作成（Closes #166）→ `/code-review` 実行
