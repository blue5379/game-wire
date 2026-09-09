# LLM-as-a-judge 事実性チェック — 抜本設計仕様

Issue: #361（直接トリガー）
関連Issue: #358（第20号 検証レポート）, #350（重大度設計。本doc の結論を待っている側）, #364, #373

**このdocは「judge が何を保証する仕組みなのか」の定義変更を記録するものです。** 実装（§6 のチェックリスト）は §2 の定義に従属します。実装から入らないこと。

---

## 0. 決定サマリ（先に読む1枚）

| 論点 | 決定 |
|---|---|
| 1. judge は何を保証するか | **ハルシネーション検出器**。照合先は「執筆AIに渡した入力」。事実の正確性は担保しない（§2） |
| 2. 検証済み一次データを検証対象に含めるか | **含めない**。構造化メタデータは judge のスコープ外（§3） |
| 3. grounding に何を渡すか | 執筆AIの入力と**対称化**する。judge 専用フィールド `judgeGrounding` を新設し `webSearchSources` は共有しない（§4） |
| 4. ソース信頼性の扱い | **一次/二次の2階層のみ**。ドメイン単位の重み付けはしない（§5） |
| 5. judge 出力の使い道 | **本Issueでは変えない**。verdict の意味が変わることを #350 に申し送る（§7） |
| 6. コストに見合うか | **維持する**。$0.3 → 約$0.39〜0.44/号（推定）（§8） |
| 7. feature の grounding | **公式/Steam本文の取得だけ追加**。検索は増やさない（§5.2） |

---

## 1. 背景 — 第20号で何が起きたか

第20号（2026-09-05 発行 / CI 実行 2026-09-04）の judge 由来の指摘 6 件（`contradicted` 2 / `unverifiable` 4）について、**確認できた範囲すべてで記事側が正しく judge 側が誤りだった**（Issue #358 → #361）。

原因は個別のプロンプト不備ではなく、**judge に何を根拠として渡すかの設計そのもの**にあった。

### 1.1 一次ソースで確認した事実（2026-09-09 再検証）

Issue #361 本文の記述を独立に再検証した結果。**すべて実読・実測・API 直叩きで確認済み。**

| 欠陥 | 確認箇所 | 判定 |
|---|---|---|
| 1. 日付コンテキストが渡らない | `judge-article.ts` の `buildJudgeUserMessage`。`publishDate` は `getReleaseStatus` / `isUpcomingForBody` にのみ渡り、**日付文字列はプロンプトに一度も現れない**。電車アタックは発売済み（`releaseDate=2026-07-15` / 発行 `2026-09-05`）なので未発売時の注記も発火しない | 確認 |
| 2. 配線の非対称 | `generate-articles.ts` の3箇所（newRelease / indie / classic）で `officialContent`・`steamContent` は `officialPageContext` として**執筆プロンプト専用引数**へ渡るだけ。`webSearchSources` は `flattenSearchResults(searchResults)` のみから構築され、合流点は存在しない | 確認 |
| 3. ソース信頼性を区別しない | 権威度の重み付け機構は無い。加えて **`flattenSearchResults` が Tavily の `score` を捨てている**（`title`/`url`/`snippet` のみ保存） | 確認（+追加発見） |
| 4. feature の grounding が貧弱 | `fetch-web-search.ts` の `searchGameInfo` で feature は `searchReviews()` のみ。さらに feature 経路は **`fetchOfficialJpUrl()`（公式URL探索）を実行しているのに `fetchOfficialPageContents()`（本文抽出）を呼んでいない**。URL は分かっているのに本文を読まない | 確認（+追加発見） |
| 5. ルール6（メタデータを根拠に使わない） | `judgeSystemPrompt` に存在。`mapClaimsToWarnings` で `unverifiable` は常に `low` | 確認 |

### 1.2 Issue #361 本文の原因帰属の訂正

Issue は誤判定②（911 Operator）を「欠陥2＋欠陥4」としているが、**911 Operator は feature なので `fetchOfficialPageContents` をそもそも呼んでいない**。合流させるべき `officialContent` が生成されていないため、**②の原因は欠陥4単独**（欠陥2は newRelease/indie/classic の話）。

### 1.3 judge に渡っていないものは `officialContent` だけではない

Issue #361 が挙げていない欠落を検証で発見した。**これが範囲の中心。**

**⚠️ 非対称はカテゴリによって形が違う。feature は特に深刻で、メタデータが1文字も渡っていない。**

`buildGameMetadataSection`（`judge-article.ts:97-119`）は先頭で `const g = article.game; if (!g) return '';` する。ところが `buildFeatureArticleFromContext`（`generate-articles.ts:769-778`）が返す `GeneratedArticle` には **`game` も `sourceUrls` も無い**（`title` / `category` / `summary` / `content` / `featureImage` / `recommendedGames` / `webSearchSources` / `featureEvent` のみ）。したがって **feature 記事では judge にタイトル・開発元・発売日すら渡っていない。**

| 情報 | 執筆プロンプト（newRelease/indie/classic） | judge（newRelease/indie/classic） | 執筆プロンプト（feature） | judge（feature） |
|---|---|---|---|---|
| タイトル | ○ | ○ | ○ | **×** |
| 開発元・発売元・発売日 | ○ | ○ | ○ | **×** |
| ジャンル・対応機種 | ○ | **×** | ○ | **×** |
| 種別（`gameType`） | ○（newRelease のみ） | × | ×（項目自体が無い） | × |
| 概要（IGDB `summary`） | ○ | **×** | ○ | **×** ← 誤判定⑤の原因 |
| 公式サイト本文・Steamストアページ本文 | ○ | **×** ← 誤判定③④の原因 | **×**（取得自体していない） | **×** ← 誤判定②の原因 |
| Tavily 検索結果 | ○ | ○ | ○ | ○ |
| 発行日 | **×**（`buildUserMessage` は日付文字列を出さない） | **×** | ○（`bedrock-client.ts:747`） | **×** |

**この表から読み取るべきこと:**

- **誤判定②⑤はどちらも feature 記事**（`validation-report-020.json` の `category` で確認）。つまり⑤を直すには「`buildGameMetadataSection` に `summary` を足す」だけでは足りず、**feature 用にメタデータセクションを組む経路そのものを新設する必要がある**（§4.2 / §6.2）
- **発行日は newRelease/indie/classic の執筆プロンプトにも渡っていない。** よって judge に日付を渡す変更は「執筆AIとの対称化」ではなく、**judge が発売時期の主張を判定するために必要な独自の追加**である（誤判定①は indie 記事なので、①の因果は「執筆AIは日付を知っていたが judge は知らなかった」ではない。①は §3 でスコープ外になることで解決する）
- **`gameType` は judge に渡さない。** 4カテゴリ中 newRelease だけが執筆プロンプトに渡しており（indie は `generate-articles.ts:552-561`、classic は `1255-1264` で未指定、`FeatureSelectedGame` には項目自体が無い）、judge に渡すと対称化が逆向きに破れる。かつ §3 で種別は判定対象外なので渡す動機も無い

### 1.4 第20号の6件 — 一次ソースによる採点

「執筆AIの入力にあったか」「現実に正しいか」を1件ずつ一次ソースで確認した結果。**この表が §2 の定義選択の根拠であり、§6 の回帰テストの元ネタでもある。**

| # | カテゴリ | 指摘 | 重大度 | 入力にあったか（確認方法） | 現実 | 定義A での正解 | 定義B での正解 |
|---|---|---|---|---|---|---|---|
| ① | indie | 電車アタック 対応機種 | `HIGH contradicted` 80% | **あり**（`【ゲーム情報】対応機種` ＝ IGDB 転記） | 正しい（Switch 2 は発売済み） | **スコープ外** | `supported` |
| ② | feature | 911 Operator「実在の都市の地図を使用してプレイ可能」 | `HIGH contradicted` 85% | **なし**（IGDB API 直叩きで基本版 summary に該当記述なしを確認。feature は公式/Steam本文を取らない） | 正しい（公式・Steam に明記） | **警告は正しい** | **誤判定** |
| ③ | indie | 電車アタック「ミライド社によってドームで覆われた日本」 | `LOW unverifiable` 0% | **あり**（`officialContent` = undercoders.com。CIログで extract 成功を確認） | 正しい | `supported` | `supported` |
| ④ | indie | 電車アタック「魔法少女メカから動く城、機械の虫まで」 | `LOW unverifiable` 0% | **あり**（同上） | 正しい | `supported` | `supported` |
| ⑤ | feature | Two Point Hospital「Two Point County に広がる」 | `LOW unverifiable` 30% | **あり**（IGDB API 直叩きで summary に `across Two Point County` を確認。`FeatureSelectedGame.summary` 経由で執筆プロンプトへ渡る） | 正しい | `supported` | `supported` |
| ⑥ | classic | GTA:SA 対応機種 | `LOW unverifiable` 30% | **あり**（`【ゲーム情報】対応機種` ＝ IGDB 転記） | 正しい | **スコープ外** | `supported` |

**定義A では 5 件が構造的に消え、②だけが「正しい検出」として残る。定義B では 6 件すべてが誤判定のまま。**

一次ソースの原文（再検証時に取得）:

- `http://www.jutsugames.com/911/` → `download and play on ANY REAL CITY in the world!`
- Steam appid 503560 → `PLAY ON ANY CITY IN THE WORLD` / `The Free Play mode lets you choose a city to play on - the game will download its map, along with real streets, addresses and the emergency infrastructure`
- `https://www.undercoders.com/game/denshattack` → `Miraido` / `sealed under domes` / `magical girl` / `moving castle` / `mechanical worm` すべて実在
- IGDB `911 Operator`（基本版）summary → 実在都市への言及なし
- IGDB `Two Point Hospital` summary → `spread your budding healthcare organisation across Two Point County`

---

## 2. 論点1の決着 — judge は「ハルシネーション検出器」である

### 2.1 定義

> **judge は、執筆AIが渡された入力を超えて創作したかを検出する装置である。事実の正確性の担保は行わない。**

照合先（何を「真」とみなすか）は **執筆AIに渡した入力**。世界の事実ではない。

| | 定義A: ハルシネーション検出器（**採用**） | 定義B: 事実の正確性の担保（棄却） |
|---|---|---|
| 照合先 | 執筆AIに渡した入力 | 世界の事実 |
| 問う質問 | 「執筆AIは入力を超えて創作したか」 | 「本文の記述は現実に正しいか」 |
| 入力に無い・現実に正しい | **検出が正しい**（偶然当たっただけ） | 誤判定 |
| 入力にある・現実に誤り | 対象外（入力側の問題） | 検出したい |

### 2.2 定義A を採る根拠

1. **第20号の6件のうち5件が構造的に消え、残る②は本物の指摘になる**（§1.4）。定義B ではどう手当てしても6件全部が誤判定のままで、①⑥は judge に世界知識を与えない限り解けない
2. **手当てがすべて配線の変更なので回帰テストで固定できる**。定義B の手当ては検索の厚みとプロンプト表現の改善で、次号以降の実測でしか検証できない。「判定精度を改善した」という測定不能な約束をしなくて済む
3. **既存の責任分界と整合する**。入力の質（IGDB/Steam データと URL の正しさ）は同一性照合ゲート・URL検証・IGDB公式タグ限定が既に担っている。judge がそこを二重に疑うことが誤判定の温床になっている
4. **定義B は `judgeSystemPrompt` のルール1（内部知識を根拠にしてはならない）と衝突する**。①⑥を定義B で解くには judge に「Nintendo Switch 2 は発売済み」という世界知識を与えるしかなく、judge 自身のハルシネーションを解禁する方向になる

### 2.3 定義A の下での②の位置づけ（重要）

②（911 Operator）は**内容が現実に正しいが、警告として残るのが正しい**。執筆AIは提供データのどこにも無い機能説明を書いており、これは執筆プロンプトの「提供された情報のみを使用し、推測や創作は絶対にしない」への違反そのものである。内容が真だったのは執筆AIの内部知識が偶然当たったから。

**対処は「judge の判定を直す」ではなく「grounding を厚くして入力に根拠を作る」**（§5.2）。公式/Steam 本文が入力に入れば、次からは同じ記述が合法（`supported`）になる。

### 2.4 定義A で judge の警告が何に使えるようになるか

- **定義A**: 警告は「その記述を消せば直る差し戻し理由」。入力に根拠が無いのだから消すのが正解で、自動再生成（`VALIDATION_AUTO_REGENERATE`）のトリガーとして機能しうる
- **定義B**: 警告は「人間が事実確認する宿題」。judge は現実を知らないので、判定が正しいかを人間が確認するまで何もできない。**第20号がまさにこの状態で、6件すべてを手で確認する必要があった**

この差が #350（重大度設計）の入力になる（§7）。

### 2.5 定義A で残る限界（明示）

定義A は「入力が正しいこと」を前提にする。よって:

- **Tavily 検索結果に混入した誤情報の転記は検出できない**（`docs/hallucination-prevention.md` 4章が既に認めている限界）
- 入力の質の担保は同一性照合ゲート・URL検証・IGDB公式タグ限定の責任であり、judge の責任ではない

---

## 3. 論点2の決着 — 構造化メタデータは judge のスコープ外

`【ゲーム情報】` 欄の値（**対応機種・発売日・ジャンル・種別・開発元・発売元**）を judge の判定対象から外す。

### 3.1 根拠

- 執筆プロンプトが「一字一句正確に転記し、短縮・翻訳・並べ替え・改変は禁止」と指示している領域＝**転記の正しさは原理的に文字列一致で検証できる**（LLM の散文判定に向かない）
- `bedrock-client.ts` の `buildUserMessage` は「対応機種・発売日はこのゲーム情報欄の表記を使用すること。Web検索結果や公式ページの表記で置き換えてはならない」と明示している。**つまり Tavily で裏付けられないのが設計上正しい**。judge が「検索結果に無い」を理由に警告するのは設計と真正面から衝突する
- 第20号の6件中2件（①⑥）がまさに対応機種リストの逐語転記

### 3.2 既存の決定的バリデータでカバーされる範囲（正確な実態）

⚠️ **「決定的バリデータが同じことを検証済みだから judge は完全な重複」という単純な話ではない。** 実態は下表のとおりで、スコープ外にすると検出の空白が残る項目がある。

| メタデータ項目 | 既存の決定的バリデータ | カバー範囲 |
|---|---|---|
| 対応機種 | `validatePlatformConsistency` / `validateFeaturePlatformConsistency`（`platform-mismatch` / **high**） | **片方向のみ。**「本文で言及されたが公式リストに無い」（`validate-article.ts:614-628`, `452-465`）だけを見る。公式リストにあるものが本文から落ちた／改変された転記は検出しない |
| 開発元・発売元 | `validatePersonAttribution` / `validateFeaturePersonAttribution` | 部分的（人物言及の許容リストとして使うだけ。転記の正しさは見ない） |
| **発売日** | **無し** | **空白** |
| **ジャンル** | **無し** | **空白** |
| **種別（`gameType`）** | **無し** | **空白** |

**この空白は本Issueでは埋めない**（決定的バリデータの新設はスコープ外）。判断の根拠:

- judge にこれらを判定させても第20号の実績は「対応機種2件が両方とも誤判定」であり、**現状の judge はこの領域で検出力よりノイズを出している**
- 転記の崩れは決定的に検証できる性質のものなので、必要になったら `validate-article.ts` 側に `metadata-transcription-mismatch` を新設するのが正しい形。**別Issueとして起票すべき残作業**として §9 に記録する

### 3.3 実装方針（2段構え）

プロンプトだけでは遵守が測定不能になるので、**決定的なフィルタを必ず併設する**。

1. `judgeSystemPrompt` の「判定対象としない主張」に構造化メタデータを追記
2. `mapClaimsToWarnings` **および `claimsByVerdict` の集計より前**に **`isMetadataOnlyClaim()`** を挟む（§6.2 に集計順序の注意あり）

`isMetadataOnlyClaim()` の判定ロジック:

> claim の `excerpt` から、メタデータのラベル（`対応機種` / `発売日` / `ジャンル` / `種別` / `開発` / `発売元` 等）とメタデータの各値（`platforms` の各要素・`releaseDate`・`genres`・`developer`・`publisher`）および区切り記号を差し引き、**残りがほぼ空なら主張ではなく転記**と判定して落とす。

**⚠️ 表記正規化を必ず含めること。** 素朴な文字列差分では `発売日` に効かない:

- 本文の日付は日本語表記（`src/content/issues/issue-020.md:33` の `**発売日**: 発売中（2026年9月2日発売）`）だが `releaseDate` は `2026-09-02` 形式。差分を取っても excerpt がほぼ丸ごと残り「落とす」判定にならない
- プラットフォーム名がローカライズ表記（例「ニンテンドースイッチ2」）で書かれた場合も同様。`validate-article.ts` の `KNOWN_PLATFORM_PATTERNS` に別名テーブルがあるので流用できる

**§3.4 の回帰ケース①⑥はどちらも `対応機種` の逐語転記なので、正規化を入れなくてもテストは緑になる。** テストが緑でも `発売日` 系の誤判定は残るので、正規化のテストケースを別途足すこと。

### 3.4 第20号の excerpt に対する期待動作（回帰テストで固定する）

excerpt の原文は `data/validation/validation-report-020.json` の `llmJudge.warnings[].context`（下記は原典と一字一句一致することを確認済み）。

- ① `対応機種: Xbox Series X|S, Nintendo Switch 2, PC (Microsoft Windows), PlayStation 5` → **落とす**
- ⑥ `対応機種はXbox、PlayStation 3、PlayStation 4、Windows Phone、Android、PC (Microsoft Windows)、iOS、Mac、Xbox 360、PlayStation 2` → **落とす**
- ② `実在の都市の地図を使用してプレイ可能` → **残す**
- ③ `ミライド社によってドームで覆われた日本という独特の世界観も魅力です` → **残す**
- ④ `魔法少女メカから動く城、機械の虫まで、予想を超える奇抜なボスたちが登場` → **残す**
- ⑤ `Two Point Countyに広がる医療組織を運営する病院経営シミュレーション` → **残す**

追加で固定すべき正規化ケース（第20号には無いので合成する）:

- `発売日: 発売中（2026年9月2日発売）` ＋ `releaseDate: '2026-09-02'` → **落とす**
- `ニンテンドースイッチ2とPS5に対応` ＋ `platforms: ['Nintendo Switch 2', 'PlayStation 5']` → **落とす**

### 3.5 ルール6（メタデータを裏付け根拠に使わない）は撤去する

ルール6は定義B の枠組み（IGDB データ自体の真偽を疑う）から来ている。§3 でメタデータをスコープ外にすれば循環参照の懸念は消え、かつ誤判定⑤の救済には `summary` を根拠として使わせる必要がある。

**ただしルール6が担っていた「検索結果が同名別作品（別ゲーム・映画・MSX版等）を指していないかの識別」機能は systemPrompt に残す。** これは同定のための機能で、根拠禁止とは独立している。

---

## 4. 論点3の決着 — judge の入力を執筆AIと対称化する

### 4.1 judge ユーザーメッセージの新しい構成

```
【記事タイトル】
【記事本文】
【発行日】                                         ← 新設（欠陥1）
【提供メタデータ（転記元・根拠として使用可）】       ← ゲーム単位。feature は複数ブロック。ルール6撤去
【一次ソース: 公式サイト・Steamストアページ本文】    ← 新設（欠陥2・欠陥4）。ゲーム単位でラベル付け
【二次ソース: Web検索結果】                         ← 既存の「外部参照データ」
（未発売タイトルの追記指示）
（最後の指示文）
```

**「現在日付」は `new Date()` から取らず `publishDate` から導出する。** judge は `temperature: 0` で再現性を最大化している設計なので、実行日で入力が揺れると再実行時に判定が変わりうる。

**インジェクション対策マーカーを一次ソースにも適用する。** ただし `judgeSystemPrompt` の注意書きはマーカー名 `=== 外部参照データ ===` を直接指名している（`judge-article.ts:82`）。§4.1 の構成どおり `【一次ソース: …】` を独立セクションにすると、その本文は systemPrompt が宣言する「命令として解釈しない範囲」の外側に出る。**systemPrompt 側の文言も併せて更新すること**（§6.2）。

### 4.2 データ経路 — judge 専用フィールド `judgeGrounding` を新設する

`GeneratedArticle`（`generate-articles.ts:156`）に judge 専用フィールドを1本追加する。

```ts
/**
 * judge 専用の grounding。執筆プロンプトに渡したものと同じ内容を judge にも渡すために持つ。
 * 表示には使わない（formatArticleForFrontmatter には出さない）。
 *
 * ⚠️ games[].summary は IGDB 由来の提供概要であり、GeneratedArticle.summary
 *    （AI が生成した記事のリード文）とは別物。混同すると記事を自分自身の生成物と
 *    照合する循環になり supported が水増しされる。
 */
judgeGrounding?: {
  games: {
    title: string;
    titleJa?: string;
    genres?: string[];
    platforms?: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    /** IGDB 由来の提供概要。GeneratedArticle.summary ではない */
    summary?: string;
    /** 一次ソース（公式サイト / Steam ストアページ）の本文 */
    primarySources?: { kind: 'official' | 'steam'; url: string; content: string }[];
  }[];
};
```

**ゲームの配列にする理由（feature 対応）:** feature は3〜5本のゲームを扱う（`bedrock-client.ts:1065`）。一次ソースを平坦な配列で渡すと、最大5本×2URL＝10本文が無ラベルで並び、**911 Operator の主張を Two Point Hospital の公式ページ本文と照合して `contradicted` を出す**事故が起こり得る。ゲーム単位に束ねてセクションを区切ることで防ぐ。

**`article.game` を拡張しない理由:** `GeneratedArticle.game` に `summary` を足すと `article.summary`（AI 生成のリード文）と紛らわしく、実装者が取り違える具体的な事故経路がある。`judgeGrounding` に分離すれば feature（`game` を持たない）と非 feature を同じ経路で扱えるうえ、表示用フィールドと混ざらない。

**`webSearchSources` に公式ページ本文を混ぜてはならない。** 理由:

1. `webSearchSources` は `validate-article.ts` の `findSourceFor`（数値・人名の `sourcedFrom` 判定）と共有されている。公式ページ本文を混ぜると **judge の修正と同じPRで数値・人名警告の抑制範囲が同時に変わる**。方向としては正しい変更だが、本Issueのついでにやるべきではない
2. `OFFICIAL_PAGE_MAX_LENGTH`（3000）と `DEFAULT_SEARCH_CONTENT_MAX_LENGTH`（1500）の非対称を `webSearchSources` に持ち込むことになる。`fetch-web-search.ts` の `DEFAULT_SEARCH_CONTENT_MAX_LENGTH` の決着ブロックが「上限を分けるとこの穴が再び開く」と強く警告している領域

### 4.3 渡すもの / 渡さないもの

**渡す**: `title` / `titleJa` / `genres` / `platforms` / `releaseDate` / `developer` / `publisher` / IGDB `summary` / `primarySources` / 発行日

**渡さない**:

- `gameType`（種別）— 執筆側が newRelease だけしか受け取っておらず、渡すと対称化が逆向きに破れる（§1.3）
- `coverImage` / `screenshots` / `igdbRating` / `igdbRatingCount` — 本文の事実主張と照合しない
- `GeneratedArticle.summary` — AI 生成のリード文なので根拠にすると循環する（§4.2 の警告）

### 4.4 データフロー上の注意

`generate-articles.ts` が `data/generated-articles.json` を書き、`build-issue.ts` がそれを読んで `judgeArticles()` を呼ぶ。したがって **`judgeGrounding` は `generated-articles.json` に永続化される必要がある**。

**サイズ影響:** 非 feature 5記事（新作2/インディー2/名作1）× 2URL ＋ feature 最大5本 × 2URL ＝ 最大20本文。`OFFICIAL_PAGE_MAX_LENGTH=3000` なので最大 60,000字、日本語 UTF-8 なら**最大約180KB**。現行の `generated-articles.json` は 33KB なので**桁が変わる**。gitignore 対象ではない（`data/` はコミットされる）ため、実装時にファイルサイズを実測して記録すること。過大なら `judgeGrounding` だけ別ファイルに分ける判断もあり得る。

**再生成経路の注意（§6.3 に対応項目あり）:**

- `regenOpts.cachedSearch` は**定義と読み出しだけで書き込む箇所が存在しない死んだ経路**（`grep cachedSearch` で確認）。ここに載せても効かない
- 非 feature の自動再生成は `regenerate: (fix) => generateNewReleaseArticle(game, publishDate, { fixInstruction: fix })`（`1439` / `1460` / `1548` 行）で `cachedSearch` 無し＝**検索と extract を再取得する**ので `judgeGrounding` は自然に再構築される
- **feature の再生成は `buildFeatureArticleFromContext(featureContext, fix)`（`1529` 行）で `FeatureArticleContext` から組み直す。** よって `FeatureArticleContext` と `769-778` 行の返り値に `judgeGrounding` を載せない限り、**再生成された特集記事だけ `judgeGrounding` が消えて judge が一次ソース無しで走る**

---

## 5. 論点4・論点7の決着 — ソース信頼性と feature の grounding

### 5.1 論点4: 一次/二次の2階層だけ

- **データ側**: §4.1 のセクション分離で階層を表現する
- **プロンプト側**: 「**一次ソースと二次ソースが矛盾する場合は一次ソースを採る**」という優先規則を1行入れる。誤判定②はこれで直接救われる（公式/Steam が個人ブログに勝つ）

**やらないこと:**

- 「大手メディア > 個人ブログ」のドメイン単位の重み付け。判定基準が主観的で、許可リストの保守コストが継続的に発生し、効果は測定不能
- `flattenSearchResults` が捨てている Tavily `score` の復活。**関連度は権威度ではない**ので論点4の材料にならず、混同すると悪化する

### 5.2 論点7: feature に公式/Steam本文の取得だけ追加する

`fetchOfficialPageContents` を feature 経路（`generate-articles.ts` のフェーズ3ループ）にも呼ぶ。**検索は増やさない。**

根拠:

- 誤判定②の原因は検索本数不足ではなく「`fetchOfficialJpUrl` で**URLは既に取っているのに本文を読んでいない**」こと
- 911 Operator の `sourceUrls.official` は IGDB 公式タグ由来（`http://www.jutsugames.com/911`）で `officialUrlSource='igdb-official'` が付くため、`fetchOfficialPageContents` の信頼済みソース判定を通る。**Tavily 探索が失敗しても extract 対象になる**（第20号では Tavily が jutsugames.com トップページを「複数タイトル並列掲載」として正しく棄却し、IGDB 由来の値が残った）
- レイテンシ実測: extract は 1URL 約3秒（+ delay 300ms）＝約3.3秒。feature は**最大5本**（`bedrock-client.ts:1065`）×2URL＝最大10本文で **+約35秒**（3本なら +約20秒）

**取得した本文は執筆プロンプトにも渡す。** feature の `FeatureSelectedGame.webSearchContext` に合流させれば、②の記述に執筆時点で根拠が生まれ、次号以降は `supported` になる（§2.3）。judge だけに渡すと「執筆AIは知らないまま書き、judge だけが知っている」という逆向きの非対称になる。

検索を増やさない根拠: `fetchOfficialJpUrl` の実測（911 Operator 18秒 / Project Hospital 16秒）を見るとゲーム単位の追加検索はレイテンシ増が大きく、②への効果は不明。

---

## 6. 実装チェックリスト

### 6.1 前提条件（grounding 変更と不可分）

grounding を厚くすると claims が増え、`maxTokens: 2048`（**1リクエストあたりの上限**）で出力が切り詰められる確率が上がる。切り詰まると `parseJudgeResponse` が `JSON.parse` で throw し、catch で `[]` を返して **「judge 実行済み・claim 0件」として静かに消える**（`judge-article.ts` の `JudgeArticleOutcome` の doc コメントが自ら認めている穴）。

**トークン余裕の実測に基づく見積り（重要 — 現状すでに張り付いている可能性がある）:**

第20号の judge 警告メッセージは 1件 115〜323字（平均約195字）。claim オブジェクトは `claim` + `explanation` + `excerpt` + キーで概ね 250〜350字＝日本語で **200〜300トークン規模**。7 claims/記事なら **1,400〜2,100トークン**で、**2048 に既に達しているおそれがある**。切り詰まった記事は claim 0件として静かに消えるため、レポートからは判別できない（＝「余裕は約2倍ある」という見方は号合計と1リクエスト上限を混同した過小評価）。

- [ ] `judgeArticle` の `maxTokens` を 2048 → 4096
- [ ] `parseJudgeResponse` の戻り値を「JSON が見つからない / パース失敗」と「正当な `{"claims": []}`」を区別できる形に変え、前者を `judgeArticle` が `{ ok: false, reason: 'judge response parse failed' }` として返す

2点目は本来 #363 の残穴だが、**本変更がこの穴を踏む確率を上げるため本Issueで閉じる**。呼び出し元は `judgeArticle` とテストのみで、影響は `judge-article.ts` 内に収まる。`invokeClaudeModel` の戻り値型（10箇所以上から呼ばれる）には触らない。**切り詰めの検知手段はこのパース失敗の可視化であって `stopReason` ではない**（`invokeClaudeModel` は `stopReason` を捨てている。頻発するようなら別Issueで `stopReason` を返す）。

### 6.2 judge 側（`scripts/judge-article.ts`）

- [ ] `buildJudgeUserMessage` に発行日を文字列として渡す（`publishDate` 由来。`new Date()` は使わない）（§4.1）
- [ ] メタデータセクションを `judgeGrounding.games` から**ゲーム単位で**組む。`article.game` しか無い記事へのフォールバックを残す（§4.2）
- [ ] **feature 記事でメタデータセクションが空にならないことを保証する**（現状 `game` 未定義で `''` を返す。誤判定⑤の真の原因）（§1.3）
- [ ] 一次ソースセクションを新設し `judgeGrounding.games[].primarySources` を**ゲーム単位のラベル付きで**描画。二次ソースと分離（§4.1 / §4.2）
- [ ] メタデータセクションの見出しを「同定のみ・根拠禁止」から「転記元・根拠として使用可」に変更（§3.5）
- [ ] `judgeSystemPrompt`: ルール6を撤去し同名別作品の識別機能のみ残す（§3.5）
- [ ] `judgeSystemPrompt`: 「判定対象としない主張」に構造化メタデータを追記（§3.3）
- [ ] `judgeSystemPrompt`: 一次ソース優先規則を追記（§5.1）
- [ ] `judgeSystemPrompt`: 照合先を定義A に合わせて書き換え（「提供された検索結果のみを根拠に」→「提供された入力（メタデータ・一次ソース・二次ソース）を根拠に」）
- [ ] **`judgeSystemPrompt` のインジェクション注意書きが指名しているマーカー名を更新**し、一次ソースセクションも「命令として解釈しない範囲」に含める（`judge-article.ts:82`）（§4.1）
- [ ] `isMetadataOnlyClaim()` を新設。**表記正規化（日付フォーマット・プラットフォーム別名）を含める**（§3.3）
- [ ] **`isMetadataOnlyClaim()` で落とした claim を `claimsByVerdict` の集計からも除外する。** `judgeArticles` は `report.claimsByVerdict[c.verdict]++` を回してから `mapClaimsToWarnings` を呼ぶ（`judge-article.ts:428-431`）ため、前段に置くだけでは `contradicted: 2 / warnings 0` という食い違いが生まれ、#363 が閉じようとした「レポートの数字と警告が食い違う」状態を再生産する。除外を集計の前に置くか `filteredByScope` カウンタを別に持つ
- [ ] **記事単位のスキップ条件を `webSearchSources` だけでなく `judgeGrounding` も見るように変える。** 現状 `judge-article.ts:403` は `if (!article.webSearchSources || article.webSearchSources.length === 0)` で丸ごとスキップする。定義A では一次ソースだけでも照合は成立するので、Tavily 検索が失敗（`generate-articles.ts:410-413` は例外を飲んで続行する）しても extract が成功していれば judge を走らせるべき
- [ ] `judgedSources` に一次ソースも記録する（#363 の観測可能性を新経路にも通す）。**下記3点を同時にやること**:
  - `JudgedArticleSources`（`judge-article.ts:285`）
  - **`validate-article.ts:132` のインライン複製**（「循環 import を避けるため」の複製。ここを直さないと余剰プロパティ扱いで型エラーにならずレポート型宣言に現れない）
  - **`format-validation-report.ts:639-645` の Markdown 出力**（ここを直さないとレポートに出ない）
  - `index` の採番規則（現状「`buildJudgeUserMessage` が振る `[n]` と一致」— `judge-article.ts:287`）。一次/二次で採番が分かれるなら規則を明文化する

### 6.3 生成側（`scripts/generate-articles.ts` / `scripts/bedrock-client.ts`）

`GeneratedArticle` は `generate-articles.ts:156` 定義（`types.ts` ではない）。

- [ ] `GeneratedArticle` に `judgeGrounding` を追加（§4.2）
- [ ] newRelease / indie / classic の3経路で、`pageContents` と IGDB `summary` / `genres` / `platforms` / `releaseDate` / `developer` / `publisher` を `judgeGrounding.games[0]` に詰める（`officialPageContext` は執筆用にそのまま残す）
- [ ] feature 経路（フェーズ3ループ）に `fetchOfficialPageContents` を追加し、**取得した本文を `FeatureSelectedGame.webSearchContext`（執筆用）と `judgeGrounding.games[]`（judge用）の両方に載せる**（§5.2）
- [ ] feature の `judgeGrounding.games[]` を `FeatureSelectedGame`（`bedrock-client.ts:712`。`summary` を持つ）から組む。**`RecommendedGame`（`types.ts:196`）からは組めない** — `summary` / `genres` / `releaseDate` / `titleJa` を持たないため
- [ ] **`FeatureArticleContext`（`generate-articles.ts:731`）と `buildFeatureArticleFromContext` の返り値（`769-778`）に `judgeGrounding` を載せる。** 載せないと自動再生成された特集記事だけ `judgeGrounding` を失う（§4.4）
- [ ] `regenOpts.cachedSearch` には**手を入れない**（死んだ経路。§4.4）

### 6.4 テスト — 固定するもの / しないもの

**固定する（すべて配線・純関数）:**

- [ ] `buildJudgeUserMessage` に発行日が文字列として現れる／`new Date()` に依存しない（同じ入力で2回呼んで同一出力）
- [ ] `genres` / `platforms` / IGDB `summary` がメタデータセクションに現れる
- [ ] **`game` を持たない feature 記事（`judgeGrounding` のみ）でメタデータセクションが空にならない**
- [ ] `primarySources` が一次ソースセクションに現れ、二次ソースと分離されている
- [ ] **feature で複数ゲームの一次ソースがゲーム単位にラベル付けされ、混同できない形になっている**
- [ ] 一次ソースにもインジェクション対策マーカーが適用され、`judgeSystemPrompt` が指名するマーカー名と一致している
- [ ] `judgeSystemPrompt` に一次ソース優先規則が存在する
- [ ] `judgeSystemPrompt` にルール6（メタデータ根拠禁止）が存在しない
- [ ] **`isMetadataOnlyClaim` が第20号①⑥の excerpt を落とし、②③④⑤の excerpt を残す**（§3.4。原文は `data/validation/validation-report-020.json` の `llmJudge.warnings[].context`）
- [ ] **`isMetadataOnlyClaim` が日付の日本語表記・プラットフォーム別名を正規化して落とす**（§3.4 の合成ケース）
- [ ] **落とした claim が `claimsByVerdict` にも計上されない**
- [ ] **`webSearchSources` が空でも `judgeGrounding` があればスキップされない**
- [ ] feature 経路で `fetchOfficialPageContents` が呼ばれる
- [ ] **feature の再生成（`buildFeatureArticleFromContext`）後も `judgeGrounding` が残る**
- [ ] 出力が切り詰められた / JSON でない場合に `{ ok: false }` になる（§6.1）
- [ ] `judgedSources` に一次ソースが含まれ、Markdown レポートにも現れる

**固定しない（できない）:**

> **判定結果そのもの。** ①⑥がスコープ外になることは `isMetadataOnlyClaim` のテストで固定できるが、③④⑤が `supported` になるかは次号以降の実測でしか分からない。②が `unverifiable` として残る（定義A では正しい検出）ことも保証はできない。
>
> **回帰テストで固定できるのは「日付が渡ること」「一次ソースが合流すること」「メタデータがスコープ外になること」という配線であって、判定結果ではない。** ここを混同して「判定精度を改善した」と書かないこと（#362 / PR #370 の「未検証」節と同じ制約）。

### 6.5 doc

- [ ] `docs/hallucination-prevention.md` 3章を定義A で書き直す（3-1 検出対象 / 3-2 仕組み / 3-3 judge 自身のハルシネーション対策 ＋ 新設で責任分界＝judge がやらないことと、それを担う既存の仕組み）
- [ ] 同3章のスキップ条件の記述（「記事に `webSearchSources` が無い場合」）を新しい条件に合わせる
- [ ] 同3章から本doc へのポインタを張る（PR #374 で暫定版を設置済み。実装後に文言を更新する）
- [ ] 同 doc 2-2 表の実装との乖離は **#373 の担当なので触らない**

---

## 7. #350（重大度設計）への申し送り

**#350 は本doc の結論を待っている側。** 定義A では verdict の意味が変わるので、そのまま重大度を決められない。

| verdict | 定義A での意味 | 現状の severity | 不整合 |
|---|---|---|---|
| `contradicted` | **入力と矛盾**（転記ミスか創作） | confidence ≥ 0.7 で high、未満は low | 定義A では最も強い異常。confidence による格下げの是非を再検討する余地 |
| `unverifiable` | **入力に根拠が無い**（創作の疑い） | 常に `low` | 定義A では「実害限定」ではなく**本命の検出対象**。常時 low は不整合 |
| `supported` | 入力に根拠がある | 警告化しない | 変更なし |

また §2.4 のとおり、定義A では judge の警告が「その記述を消せば直る差し戻し理由」になるため、**自動再生成（`VALIDATION_AUTO_REGENERATE`）のトリガーに載せる余地が生まれる**（現状は「LLM-judge は非決定的なため再生成トリガーにしない」）。これも #350 / #364 の判断材料。

---

## 8. コストとレイテンシ

### 8.1 実測値（第20号 CI: run 33926205290 / 2026-09-04）

| 項目 | 実測 |
|---|---|
| CI 全体 | **9分**（`timeout-minutes: 30`）。直近8回は 7〜14分 |
| judge | 4記事で 86秒（約21.5秒/記事）。6記事なら約130秒 |
| `fetchOfficialPageContents` | steam+official の2URLで約7秒（1URL 約3秒 + delay 300ms） |
| judge 出力 | 4記事29 claims（約7 claims/記事）。警告メッセージ 1件 115〜323字（平均約195字） |
| extract 失敗 | 1件のみ（`rockstargames.com`、`pageContentFailures: 1`）。**undercoders.com の extract は成功していた**（執筆AIは読めて judge は読めなかったことの実測的裏付け） |
| `generated-articles.json` | 33KB |

⚠️ Issue #361 の作業指示にあった「CI 推定 15〜16分」は **#360 の Steam ペーシング増分を足した見込み値で、実測ではない**。

### 8.2 増分（推定・実測ではない）

- Bedrock Sonnet 4.5、入力 $3/MTok
- 一次ソースは最大20本文（非 feature 5記事×2URL ＋ feature 最大5本×2URL）× 3000字上限
- **+$0.09〜0.14/号**。$0.3 → 約 **$0.39〜0.44/号**（年 +約$5〜7）
- レイテンシ: feature の extract 追加で **+20〜35秒**（3本〜5本）。30分予算に対して無視できる
- `generated-articles.json`: 最大約180KB まで増えうる（§4.4）。実装時に実測すること

### 8.3 論点6の判断

**維持する。** 定義A に切り替えることで、次号のレポートで「②型（入力に根拠が無い記述）だけが残るか」を見れば効果が判定できる。定義B のまま維持するなら無効化を推奨するが、定義A なら維持する価値がある。

---

## 9. 変更しないもの（本Issueのスコープ外）

- **`src/content/` は触らない。** 既発行号の記事修正・再生成は行わない（全号まとめての再作成を別途予定しているため）。修正は生成・検証パイプライン側に入れて次号以降で効かせるところまでが範囲
- **`VALIDATION_AUTO_REGENERATE` の既定値**（OFF）は変えない（#350 の判断待ち）
- **high 警告の重大度設計そのもの**は変えない（#350 / #364 の担当）。§7 は申し送りであって実装ではない
- **`webSearchSources` の中身**は変えない（§4.2）。数値・人名の `sourcedFrom` 判定に一次ソースを載せるかは別Issueの判断
- **`invokeClaudeModel` の戻り値型**は変えない（§6.1）
- **`regenOpts.cachedSearch`** には手を入れない（死んだ経路。§4.4）
- **`docs/hallucination-prevention.md` 2-2 表**の実装との乖離は #373 の担当
- **Tavily 検索クエリの定式化**は変えない（`docs/article-category-spec.md` §11.3.3 の決着済み事項）

### 別Issueとして起票すべき残作業

- **メタデータ転記の決定的検証**（§3.2）。`発売日` / `ジャンル` / `種別` を検証するバリデータが存在せず、judge のスコープ外にすると検出の空白が残る。`validate-article.ts` に `metadata-transcription-mismatch` を新設するのが正しい形
- **`platform-mismatch` の片方向性**（§3.2）。「公式リストにあるものが本文から落ちた／改変された」方向は現状どこも見ていない
- **`stopReason` の伝播**（§6.1）。切り詰めをパース失敗経由でなく直接検知したい場合に必要

---

## 10. 承認履歴・改訂履歴

| 日付 | 内容 |
|---|---|
| 2026-09-09 | §0 の7論点すべてユーザー承認。§6.1 の `parseJudgeResponse` 戻り値変更を本Issueに含めることも承認済み。実装 → PR → `/code-review` までは自走可、**マージと Issue クローズは別途承認を取る** |
| 2026-09-09（改訂） | PR #374 の `/code-review` 指摘13件を一次ソースで検証して反映。主な変更: ①**feature 記事は `article.game` を持たずメタデータが1文字も渡っていない**ことを §1.3 に追加（誤判定⑤の真の原因はここ。②⑤はどちらも feature）／②`primarySources` 単体案を**ゲーム単位の `judgeGrounding`** に変更（feature 複数ゲームの取り違え防止・`article.summary` との混同防止）／③`gameType` を渡す対象から除外（執筆側が newRelease のみ）／④`isMetadataOnlyClaim` に**表記正規化**を必須化（`発売日` に効かない）／⑤`claimsByVerdict` の集計順序・スキップ条件・`judgedSources` の型複製3箇所を §6.2 に追加／⑥feature 再生成経路（`FeatureArticleContext`）を §6.3 に追加／⑦§3.2 の「決定的バリデータと完全な重複」を実態（プラットフォームのみ・片方向）に訂正し検出の空白を明示／⑧トークン見積り・サイズ・レイテンシ・コストを最大構成（feature 5本）ベースに修正。**論点1〜7の決定そのものは変わっていない** |
