# ハルシネーション対策ドキュメント

Game Wire における記事生成時・生成後のハルシネーション対策の仕組みをまとめる。

---

## 1. 記事生成時の抑制（予防）

### 1-1. プロンプト設計

**temperature の低減**
- 全記事カテゴリで `temperature: 0.5 → 0.2` に変更
- 創造性よりも事実の忠実な転記を優先

**「ハルシネーション防止のため厳守」ルールの明示**

各カテゴリのシステムプロンプトに以下を追加（`scripts/bedrock-client.ts`）:

| 禁止事項 | 対象カテゴリ |
|----------|------------|
| 開発スタッフの名前・肩書き・発言の生成 | 新作・インディー・名作 |
| ソース不明の具体数値（レビュー数・ユーザー数・プレイ時間等） | 新作・インディー・名作 |
| ストーリー詳細・キャラクター名の独自補完 | 新作・インディー・名作 |
| 提供データ外のゲームを知識から追加すること | 特集 |

**タイトル改変の禁止**

ゲームタイトルのラベルを明示して改変を防止:
- `タイトル（日本語、記事内で優先使用）`
- `タイトル（英語/国際名、変更禁止）`
- 【ゲーム情報】の先頭に「以下のタイトル・各メタデータは正確な公式情報です。一字一句正確に転記し、短縮・翻訳・並べ替え・改変は禁止です。」を追加

### 1-2. Tavily 必須化（web 検索グラウンディング）

`scripts/generate-articles.ts` の起動時に Tavily API の疎通確認を実施。
未設定の場合はビルドを失敗させる（`ALLOW_WITHOUT_WEB_SEARCH=true` でバイパス可）。

これにより各記事の生成前に以下の検索を実施:
- レビュー情報
- 開発者情報
- Steam レビュー（インディーのみ）
- ゲーム歴史（名作のみ）

### 1-3. 特集記事のゲームリスト拡大

特集記事に渡すゲームリストの上限を `5本 → 20本` に拡大。
テーマに合うゲームが少ない場合でも選択肢を確保し、「関連性の低いゲームを無理に使う」ことを防ぐ。

### 1-4. AI 免責表示

全記事の末尾と About ページに免責表示を出す（`src/pages/issue/[issueNumber]/article/[slug].astro`、`src/pages/about.astro`）:

> 本記事はAIによって自動生成されています。Web検索による事実照合や自動チェックを行っていますが、それでも事実と異なる記述が含まれる可能性があります。ゲームの最新情報・正確な仕様・価格・発売日等は、必ず公式サイトや販売店でご確認ください。

**免責表示は「品質担保策」ではなく「保険（最終防衛線）」である。** 予防（1章: プロンプト設計・グラウンディング）や検出（2章: バリデータ、3章: LLM-judge）が実際の品質を高める施策であるのに対し、免責表示は「それでも誤りが残りうる」という前提を読者に伝え、最終確認を促すものである。両者は性質が異なり、免責表示があることをもって品質が担保されるわけではない。文言も「検証している」ことを過度に強調せず、最終的な正確性は保証しない旨を明確に保つ。

---

## 2. 記事生成後の検出（バリデーション）

### 2-1. バリデータの概要

`scripts/validate-article.ts` が記事生成後に自動実行される（`scripts/build-issue.ts` 内）。

5種類のチェックを実施し、重大度（`high` / `medium` / `low`）を付与してレポートを出力する。

### 2-2. チェック項目

| チェック種別 | 内容 | 重大度 |
|-------------|------|--------|
| `title-mismatch` | 記事タイトルにゲームの正式タイトル（en/ja）が含まれているか | high |
| `title-vs-igdb-slug` | `game.title` が IGDB slug と大幅に乖離していないか（word overlap < 60%） | high |
| `platform-mismatch` | 本文中のプラットフォーム言及が提供データと矛盾しないか | high |
| `person-quote` / `person-title` / `person-mention` | 「〜氏によると」「ディレクター〜」等の人物発言・肩書きパターン | high / medium |
| `numeric-*` | ソース不明の具体数値（件数・人数・プレイ時間・台数等） | high / medium / low |

特集記事（`category: feature`）は、選定確定したゲームの `recommendedGames` metadata（`platforms` / `developer` / `publisher`）と、生成時に取得した `webSearchSources` をもとに以下を実施：
- `platform-mismatch`: 全推薦ゲームのプラットフォームの合算を許容セットとして検証
- `person-*`: 全推薦ゲームの `developer` / `publisher` を許容リストとして人物言及を検証し、`webSearchSources` に根拠があれば `sourcedFrom` を付与
- `numeric-*`: 数値クレームを検出し、`webSearchSources` に根拠があれば `sourcedFrom` を付与

特集記事の生成フローは「テーマ選定 → ゲーム選定 → メタデータ取得（候補データ流用＋公式URL＋Tavily検索）→ 本文生成」の順で、ゲーム確定後に正確なメタデータと検索結果を揃えてから本文を書く（グラウンディング）。これにより `recommendedGames` のメタデータと `webSearchSources` が揃い、上記の検証が機能する。

`recommendedGames` にプラットフォームデータが存在しない場合は platform-mismatch チェックをスキップ。

#### `person-quote` / `person-title` / `person-mention` の詳細

人物の発言引用や肩書き付き人名の言及を検出する。AIが実在しない人物や発言を捏造するリスクが高いパターンを対象とする。

検出するパターンと重大度:

| パターン例 | 種別 | 重大度 | 検出する正規表現 |
|-----------|------|--------|----------------|
| `上野氏によると〜` `Smith氏は語った` | `person-quote` | high | `〜氏(?:によると\|は語\|は述べ\|のコメント\|は明か\|は説明\|は強調)` |
| `CEOのJohn Smith` | `person-title` | high | `CEO[のは]〜` |
| `CTOのAlex Williams` | `person-title` | high | `CTO[のは]〜` |
| `ディレクターの田中` `ディレクター・上野氏` | `person-title` | high | `ディレクター[のは・]〜` |
| `プロデューサーの山田` | `person-title` | high | `プロデューサー[のは・]〜` |
| `田中氏を中心に開発` | `person-mention` | medium | `〜氏を中心` |

**スキップ条件（false positive 防止）:**
- 提供データの `developer` または `publisher` 名と完全一致する場合はスキップ（例: `Studio Wildcard氏は語った` → `developer: Studio Wildcard` と一致するためスキップ）
- 2文字未満の名前はスキップ

**未検出のパターン（既知の限界）:**
- `CEOが〜` のように `が` が後続する場合（`[のは]` にマッチしない）
- 「ジョン・カーペンター氏とのタッグ」のような発言引用を伴わない単純言及

#### `numeric-*` の詳細

ソース不明の具体的な数値を検出する。AIが根拠なく数値を「それらしく」生成するハルシネーションが起きやすいパターンを対象とする。

検出するパターンと重大度:

パターン定義は `validateNumericClaims`（newRelease/indie/classic）と `validateFeatureNumericClaims`（feature）で共通の `NUMERIC_PATTERNS` 定数を共用し、両者の検出基準がズレないようにしている。

| パターン例 | 種別 | 重大度 |
|-----------|------|--------|
| `75,995件のレビュー` `12000件` `18万件` | `numeric-review-count` | high |
| `5,000人が参加` `10000人` | `numeric-user-count` | high |
| `1,000万ユーザー` `3億ダウンロード` | `numeric-large-count` | high |
| `550台以上の実車` `200台の車両` | `numeric-vehicle-count` | high |
| `100時間超え` `50時間以上` `40〜60時間` `100時間プレイ` | `numeric-play-hours` | medium |
| `3,980円` `29.99ドル` | `numeric-price` | medium |
| `96%の高評価` `10〜15%` | `numeric-percentage` | medium |
| `100種類以上の恐竜` `500種以上` | `numeric-kind-count` | low |
| `25周年` | `numeric-anniversary` | low |
| `数百万人` `何百時間` `数百種類` | `numeric-approx-count` | low |

**スキップ条件（提供データ内の数値は警告しない）:**
- `game.metascore`（例: `90`）
- `game.userScore`
- `game.releaseDate` に含まれる年・月・日（例: `2023-10-25` → `2023` `10` `25` をすべて許容）
- 概数（`approx-count`）は数値の capture group を持たないため、knownNumbers 照合・`sourcedFrom` 照合の対象外

**設計上の注意:**
- プレイ時間・パーセントの範囲表記（`40〜60時間` / `10〜15%`）は 1 マッチに束ねて二重カウントを防ぐ
- `kind-count` は `2種` のような小さな数を誤検知しないよう 2 桁以上に限定

**未検出のパターン（既知の限界）:**
- 英語表記の数値（`75,995 reviews` 等）。本番8号＋生成分の計13本（約12万字）を実測したところ**出現は 0 件**で、記事は日本語生成され英語数値の転記は発生していないため対応しない
- `5〜6時間分の内容` のような「分」を伴う原作ボリューム言及。ノイズ抑制のため後続語に `分` を含めていない（捏造リスクも低い）

### 2-3. 警告の構造

各警告は以下のフィールドを持つ:

```typescript
{
  articleTitle: string;   // 対象記事のタイトル
  category: string;       // newRelease / indie / feature / classic
  severity: 'high' | 'medium' | 'low';
  type: string;           // チェック種別
  message: string;        // 問題の説明
  evidence?: string;      // マッチした断片
  context?: string;       // 本文中の前後文（判断材料）
  sourcedFrom?: {         // 検索結果に根拠が見つかった場合のみセット
    url: string;
    title: string;
    snippet: string;
  };
}
```

- `context`: 該当箇所の前後 80 文字を含む引用。人間が問題の深刻さを判断するための文脈
- `sourcedFrom`: `person-*` / `numeric-*` 警告に付与。該当キーワードが Tavily 検索結果のいずれかに含まれていた場合にセットされる。**根拠ありの場合は捏造ではない可能性が高く、根拠なしの場合は捏造の可能性が高い**
  - 照合に使う検索結果の snippet は最大 1500 文字を保持する（`SNIPPET_MAX_LENGTH`）。短すぎると本文の数値・人名がコンテンツ後半にあるとき「根拠なし」と誤判定する（false negative）ため
  - `numeric-*` の照合は数値を「独立したトークン」（前後が数字でない）として扱う。本文の「96」が検索結果の「1996」の一部に誤って一致する false positive を防ぐ

`sourcedFrom` は全カテゴリ（newRelease・indie・classic・feature）に付与される。feature 記事も生成フロー再設計により Tavily 検索結果（`webSearchSources`）を持つようになったため、`person-*` / `numeric-*` の根拠有無を判定できる。  
feature 記事の platform-mismatch / person-* は `recommendedGames` の metadata に依存するため、メタデータを取得できたゲームのみが有効な許容セットになる。

### 2-4. CI との連携

- `VALIDATION_HIGH_THRESHOLD`（デフォルト: 5）を超える `high` 警告がある場合、`build-issue` が失敗する
- `VALIDATION_STRICT=true` を設定することでさらに厳格な運用が可能
- DEV_MODE では `data/validation-dev/` に出力、本番では `data/validation/` に出力

### 2-5. GitHub Actions Job Summary への出力

各 Actions 実行後、Summary タブに以下が表示される:

- 警告数のサマリーテーブル（記事数・HIGH/MEDIUM/LOW の件数・判定）
- 警告ごとのブロック:
  - 重大度・種別
  - 対象記事タイトル
  - 問題の説明
  - 本文引用（`context`）
  - 根拠URL（`sourcedFrom` がある場合）またはその旨の注記

表示例:

```
**[HIGH] numeric-review-count**
記事: ARK: Survival Ascended の紹介
内容: 本文に具体的な数値「75,995件」が記載されています。...
> …Steamでは75,995件のレビューが投稿され、「賛否両論」の評価を受けている…
🔗 検索結果に根拠あり（捏造ではない可能性）: [ARK on Steam](https://store.steampowered.com/...)
> ARK has 75,995 reviews on Steam with Mixed rating.

**[HIGH] person-quote**
記事: ある記事タイトル
内容: 本文で人物「田中」が言及されています。...
> …田中氏によると、開発には2年を要したという…
⚠️ 検索結果に根拠なし（捏造の可能性あり）
```

これにより、**AIによる自己評価ではなく人間がコンテキストと根拠URLを確認して問題の深刻さを判断できる**。

### 2-6. 既知の false positive

| パターン | 原因 | 対処状況 |
|----------|------|---------|
| `PC (Steam)` vs `PC (Microsoft Windows)` | 同一プラットフォームの表記ゆれ | 未対処（文脈で判断） |
| `S&box` vs slug `s-and-box` | `&` → `and` の変換差異 | 未対処（文脈で判断） |

### 2-7. 手動検証ツール

既存の号を後からバリデートする場合:

```bash
npm run validate-issue src/content/issues/issue-XXX.md
```

`data/validation-manual/` にレポートが出力される（CI には影響しない）。

---

## 3. LLM-as-a-judge による事実性チェック

正規表現バリデータ（2章）は「定型的な数値・人名の捏造」しか検出できない。これを補完するため、生成記事の本文と Tavily 検索結果（`webSearchSources`）を別の Claude 呼び出しで照合し、散文レベルの事実性を採点する（`scripts/judge-article.ts`）。

### 3-1. 検出対象

正規表現では原理的に届かない以下を対象とする:
- 架空のストーリー描写
- 存在しないゲーム機能の説明
- 誤った歴史的経緯・リリース時期
- 固有名詞・因果関係を含む具体的記述

### 3-2. 仕組み

1. 本文から「検証可能な事実主張」を抽出させる
2. 各主張を検索結果のみを根拠に `supported` / `contradicted` / `unverifiable` で判定させ、`confidence`（0〜1）を付けさせる
3. 判定を `ValidationWarning` に変換:
   - `contradicted` かつ confidence ≥ 0.7 → `llm-judge-contradicted`（high）
   - `contradicted` かつ confidence < 0.7 → `llm-judge-contradicted`（low に格下げ）
   - `unverifiable` → `llm-judge-unverifiable`（low）
   - `supported` → 警告化しない（記録のみ）

### 3-3. judge 自身のハルシネーション対策

- プロンプトで「**内部知識を根拠にせず、検索結果のみで判定。根拠が無ければ unverifiable**」と厳命
- `temperature: 0` で再現性を最大化
- `confidence` しきい値で低確信の矛盾を格下げ
- Bedrock 呼び出し・パース失敗時はその記事をスキップしてビルドを止めない

### 3-4. 運用とコスト

- **デフォルト ON**。`VALIDATION_LLM_JUDGE=false` で明示的に無効化できる（安全弁）
- スキップ条件: Tavily 未設定時、記事に `webSearchSources` が無い場合（照合元が無いと judge 自身が暴走するため）
- 結果は `ValidationReport.llmJudge` に**正規表現由来の warnings とは分離して**記録し、**fail 判定には算入しない**（LLM は非決定的なため、まず人間レビューに供する段階導入）
- コスト目安: 約 $0.3/号（週次で月約 $1.2 / 年約 $15 程度）

---

## 4. 限界と今後の課題

### バリデータが検出できないハルシネーション

- Tavily 検索結果にたまたま含まれていた誤情報の転記（judge も検索結果を根拠とするため検出できない）
- 検索結果が存在せずスキップされた記事の事実誤り（LLM-judge は `webSearchSources` が無いとスキップする）

※「存在しないゲーム機能の説明」「架空のストーリー描写」は 3 章の LLM-as-a-judge である程度検出できるようになった（ただし非決定的なため fail 判定には算入していない）。

### 特集記事の生成フロー再設計（実装済み）

特集記事は「テーマ選定 → ゲーム選定 → メタデータ取得 → 本文生成」の順で生成する（旧フローの「本文生成 → ゲーム名抽出 → IGDB取得」を廃止）。

- ゲーム選定を独立した LLM コール（`selectFeatureGames`）に分離。本文生成前に紹介ゲームが確定する
- 確定ゲームの正確なメタデータ（候補データを流用）と Tavily 検索結果を本文生成プロンプトに注入（グラウンディング）
- `webSearchSources` を feature 記事にも保存し、`validateFeaturePersonAttribution` / `validateFeatureNumericClaims` で `sourcedFrom` 判定が機能する
- `validateFeaturePlatformConsistency` / `validateFeaturePersonAttribution` / `validateFeatureNumericClaims` が feature 記事にも適用される

### 検出 → 改善の閉ループ（実装済み）

high 警告（正規表現バリデータ由来）を持つ記事を、警告内容をプロンプトにフィードバックして**1回だけ自動再生成**する（`scripts/generate-articles.ts` の `main()`）。

- トリガー: `validateArticle()` の high 警告（正規表現由来のみ。LLM-judge は非決定的なため再生成トリガーにしない）
- フィードバック: `buildFixInstruction()` が警告 type 別の修正指示文を組み立て、`buildUserMessage` / `buildFeatureUserMessage` の `fixInstruction` 引数で本文生成プロンプトに付与する
- 全カテゴリ対象。feature は本文だけ作り直し、テーマ選定・ゲーム選定・検索・画像生成はやり直さない（コスト抑制）。newRelease/indie/classic も再生成時は検索結果を流用可能
- 再生成は1記事1回まで（無限ループ防止）。再生成後も high が残る場合はそのまま通す（警告は後段の validate/judge で記録される）
- **デフォルト OFF**。`VALIDATION_AUTO_REGENERATE=true` で有効化（再生成は生成コストが増えるため opt-in）

### 今後の課題

- LLM-judge 結果の fail 判定への算入（運用が安定したら、環境変数で contradicted を high 算入）
- 自動再生成のデフォルト ON 化（運用が安定したら）
