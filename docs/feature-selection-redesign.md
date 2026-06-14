# 特集記事ゲーム選定ロジック 再設計仕様

Issue: #79  
関連Issue: #77（Closes対象）

## 背景・課題

Vol.11「恋人の日」特集で itch.io ファンゲーム「The Amazing Digital Dating Sim」が選定された。  
公式サイト不在・LLM事実性チェックで「裏付け不可」と判定された低信頼タイトル。

### 構造的欠陥（3点）

1. **品質シグナルが選定LLMに渡らない**: `igdbRating`/`igdbRatingCount`/`steamRank`/`metascore` を収集しているが、LLMには `title/titleJa/genres/summary` のみ渡す。LLM はファンゲームと著名高評価作を区別できない。
2. **テーマ合致判断が静的テキストのみ**: `summary`（英語・マーケ文、89/105件しか存在）と `genres` のみで判断。「Dating Sim」というタイトル文字列一致で実態未確認のまま選ばれた。
3. **候補プールが「今週人気」に限定**: `aggregated.json`（Steam/YouTube/IGDB直近人気）のみ。テーマに合う往年の名作・定番がプールに無ければ選べない。

### ローカルデータ実態（2026-05-16時点）

| シグナル | 充足 | 備考 |
|---|---|---|
| `igdbRating`/`igdbRatingCount` | 68/105 | 品質判定の主軸 |
| `steamRank` | 18/105 | Steam Top Sellers のみ |
| `summary` | 89/105 | 英語・長さ不均一 |
| `metascore`/`userScore` | 0 | 本番でも0件（別Issue推奨） |
| `steamPlayers`/`youtubePopularity` | 0 | GameData未永続化 |

`igdbRatingCount` 分布: 中央値 21。単純閾値引き上げは良質ニッチ続編を巻き込むため **複数経路のOR判定** が必須。

---

## 実装方針: 2フェーズ段階的導入

ユーザー確定事項:
- **進め方**: 段階的に両方（フェーズ1先行 → フェーズ2で候補プール拡張）
- **品質バー**: バランス重視（複数信頼経路のOR判定）
- **枯渇時**: 段階的緩和で最低3本確保
- **Web検索**: prefilter通過分のみ（全候補検索はコスト過大）

---

## フェーズ1: 改良型（既存フローの強化）

### 新フロー

```
[全候補] allCandidates
  ↓ isFeatureQualified() による分割
[qualified] / [fringe]
  ↓ prefilterFeatureCandidatesByTheme()  ← qualifiedのみ・品質サマリ付き
[prefilter通過]
  ↓ 【新規】Web検索精査（Tavily）       ← prefilter通過分のみ
[検索結果付き候補]
  ↓ selectFeatureGames()               ← 品質シグナル+検索結果参照
[最終選定]
  ↓ （不足時）fringe緩和投入で3本確保
```

### 変更1: 品質フィルタ定数と `isFeatureQualified()`

**ファイル**: `scripts/generate-articles.ts`

既存の `FEATURE_*` 定数群（57行付近）の隣に追加:

```ts
const FEATURE_IGDB_RC_MIN = 15;        // IGDB評価数の最低ライン
const FEATURE_IGDB_RATING_STRONG = 85; // 高評価少数票の救済しきい値
const FEATURE_IGDB_RC_FLOOR = 8;       // 救済経路での最低評価数
```

`normalizeForMatch`（498行付近）の近くに追加:

```ts
function isFeatureQualified(g: GameData): boolean {
  if (g.igdbRatingCount != null && g.igdbRatingCount >= FEATURE_IGDB_RC_MIN) return true;
  if (g.steamRank != null) return true;
  if (g.steamPlayers != null && g.steamPlayers > 0) return true;
  if (g.metascore != null) return true;
  if (
    g.igdbRating != null && g.igdbRating >= FEATURE_IGDB_RATING_STRONG &&
    g.igdbRatingCount != null && g.igdbRatingCount >= FEATURE_IGDB_RC_FLOOR
  ) return true;
  return false;
}
```

問題ゲーム（rc≈5-7・rating低め・steamRank無し・metascore無し）は全経路で落ちる → 確実に除外。

### 変更2: 品質サマリヘルパーと候補型拡張

**ファイル**: `scripts/bedrock-client.ts`

`prefilterFeatureCandidatesByTheme`（685行）の手前に追加:

```ts
function formatQualitySignals(g: {
  igdbRating?: number;
  igdbRatingCount?: number;
  metascore?: number | null;
  steamRank?: number;
  steamPlayers?: number;
  youtubePopularity?: number;
}): string {
  const parts: string[] = [];
  if (g.igdbRating != null && g.igdbRatingCount != null) {
    parts.push(`IGDB${Math.round(g.igdbRating)}(評価${g.igdbRatingCount}件)`);
  }
  if (g.metascore != null) parts.push(`Metacritic${g.metascore}`);
  if (g.steamRank != null) parts.push(`Steam売上${g.steamRank}位`);
  if (g.steamPlayers != null && g.steamPlayers > 0) parts.push(`同接${g.steamPlayers}`);
  if (g.youtubePopularity != null && g.youtubePopularity > 0) parts.push(`YouTube人気${g.youtubePopularity}`);
  return parts.length > 0 ? parts.join(' / ') : '評価情報なし';
}
```

候補整形（prefilter 695-703行 / select 756-764行）の各行末に:
- prefilter: `/ 評価: ${formatQualitySignals(g)}` を連結
- select: `/ 評価: ${formatQualitySignals(g)} / Web: ${g.webSearchSnippet ?? 'なし'}` を連結

候補引数の型に追加（687行・749行）:

```ts
type FeatureCandidateBase = {
  title: string;
  titleJa?: string;
  genres?: string[];
  summary?: string;
  igdbRating?: number;
  igdbRatingCount?: number;
  metascore?: number | null;
  steamRank?: number;
  steamPlayers?: number;
  youtubePopularity?: number;
};

type FeatureCandidateWithSearch = FeatureCandidateBase & {
  webSearchSnippet?: string;
};
```

### 変更3: Web検索精査ステージ

**ファイル**: `scripts/generate-articles.ts`（`generateFeatureArticle()` 内）

prefilter（609行）と select（611行）の間に挿入:

```ts
// Web検索による実態確認（prefilter通過分のみ）
const searchSnippets = new Map<string, string>();
if (isTavilyAvailable()) {
  for (const game of prefiltered) {
    const snippets = await searchGameInfo(game.title, 'feature', game.developer);
    if (snippets) {
      searchSnippets.set(game.title, formatSearchResultsForPrompt(snippets));
    }
    await delay(500);
  }
  console.log(`  Web search completed for ${searchSnippets.size}/${prefiltered.length} candidates`);
}
```

検索結果の流用: 以降の `searchGameInfo` 再呼び出し箇所（684行付近）で `searchSnippets` から取得し二重検索を回避。

### 変更4: プロンプト改訂

**ファイル**: `scripts/bedrock-client.ts`

`featureGameSelectionPrompt`（633行）に追加ルール:

```
- 各候補の「評価」欄と「Web」欄を必ず参照する。
  タイトルがテーマに合うように見えても、Web検索でテーマとの関連が裏付けられない候補は選ばない。
- テーマ適合を満たした上で、評価が高く話題性のあるタイトルを優先する。
  評価情報が乏しい候補は、明確に評価の高い候補が他に無い場合のみ選ぶ。
- ファンゲーム・非公式作品は選ばない。
```

`featureThemePrefilterPrompt`（659行）に軽い品質ヒント追加（recall段階なので緩め）。

### 変更5: パイプライン統合・フォールバック

**ファイル**: `scripts/generate-articles.ts`（587行付近）

```ts
const qualified = allCandidates.filter(isFeatureQualified);
const fringe = allCandidates.filter((g) => !isFeatureQualified(g));
console.log(`  Feature candidates: ${qualified.length} qualified, ${fringe.length} fringe`);

// qualified のみで prefilter → 検索 → select を実行
// ...

// 不足時: fringe から段階的に補充
if (selectedGameData.length < FEATURE_MIN_GAMES) {
  console.warn(`  [WARN] qualified only gave ${selectedGameData.length} games, supplementing from fringe`);
  // fringe を品質サマリ付きで追加投入して再選定
}
```

### 検証手順

1. `npx tsc --noEmit` エラーなし
2. `DEV_MODE=true npm run build-issue:dev` でドライラン
3. ログで `qualified / fringe` 件数確認
4. ファンゲーム相当（rc<8・steamRank無し・metascore無し）が qualified から外れる
5. `TAVILY_API_KEY` 未設定時に検索ステージスキップ → 従来動作にフォールバック
6. qualified が3本未満のニッチテーマで fringe 緩和警告ログが出て最終3本確保

### ブランチ・PR

```bash
git checkout -b feat/issue-79-feature-quality-filter
```

PR: `Closes #79`（フェーズ1のみ。フェーズ2は別PR）

---

## フェーズ2: 抜本型（テーマ起点候補プール拡張）

フェーズ1完了・本番検証後に着手。

### 新フロー（フェーズ1の前段に候補合流を追加）

```
テーマ確定
  ├─[既存] aggregated.json 候補（今週人気）
  └─[新規] LLMテーマ提案 → enrichGameWithIGDB()実在検証 → 検証通過分をGameData化
  ↓ 合流・重複除去（normalizeForMatch + IGDB id）
  → フェーズ1のフロー（品質フィルタ → prefilter → 検索 → select）
```

**重要**: 提案ゲームは検証通過分のみ候補リストに合流するため、`selectFeatureGames` の「候補 title からのみ選べ」制約はそのまま維持できる（ハルシネーション経路を増やさない）。

### 変更A: LLM提案関数

**ファイル**: `scripts/bedrock-client.ts`（新規）

```ts
async function proposeThemeGamesFromKnowledge(
  theme: string,
  gameThemeHint: string,
  excludeTitles: string[]
): Promise<{ proposals: { title: string; reason: string; expectedYear?: number }[] }>
```

- system: 「テーマに最も合致する評価の高い・定番のゲームを最大15本提案。発売年問わず名作も含めてよい。実在が確実なタイトルのみ。曖昧な記憶や創作は禁止」
- `expectedYear` を出力させ、`searchGameByName` の `±3年照合` で同名異作品の誤マッチを弾く

### 変更B: 実在検証

**ファイル**: `scripts/generate-articles.ts`（新規）

```ts
async function verifyProposedGames(
  proposals: { title: string; reason: string; expectedYear?: number }[]
): Promise<GameData[]>
```

1. `enrichGameWithIGDB(title, { expectedYear })` で検索
2. null（不在/非関連/年不一致）は破棄
3. 通過分を IGDBGame → GameData へマッピング（既存マッピングを切り出し再利用）
4. アダルト除外（`adult-blocklist.ts` 相当）を適用

### 変更C: 候補合流

**ファイル**: `scripts/generate-articles.ts`（566-620行付近）

```ts
// 既存候補 + 検証通過提案ゲームを合流（重複除去）
const proposedGames = await verifyProposedGames(proposals);
const allCandidates = deduplicateGames([...relatedGames, ...proposedGames]);
```

`aggregated.json` には書き戻さない（読み取り元を汚さない）。

### 変更D: featureクールダウン

**ファイル**: `scripts/game-history.ts`（22行付近）

名作の能動探索により「毎号同じ名作が反復」するリスクが生じるため、feature のクールダウン週数を設定。Issue #38 と整合。

### フェーズ2のリスク

- LLM提案の実在検証通過率がテーマにより低い可能性 → 提案本数・検索の調整で対処
- IGDB網羅性: 日本のニッチ恋愛ADV等は登録が薄く検証を通らないことがある
- IGDBジャンル/テーマIDへの機械変換（案A）は **不採用**。精度劣る・保守コスト高のため。

### ブランチ・PR

```bash
git checkout -b feat/issue-79-feature-theme-sourcing
```

PR: `Closes #79`（フェーズ2）

---

## 変更しないもの（副作用の非干渉）

- `scripts/fetch-igdb.ts` の fetch クエリ（`fetchRecentPopularGames`/`fetchClassicGames`/`fetchIndieGames`）— indie/classic カテゴリの母集団に影響するため不変更
- `scripts/fetch-data.ts` の `selectGamesForArticles()`（newRelease/indie/classic選定）— 未変更
- `GameData` 型（`scripts/types.ts`）— 既存フィールドの読み取りのみ。フィールド追加なし

→ 変更は feature 経路に閉じ、他カテゴリへの回帰リスクなし。

---

## 別途対処推奨

- **Metacritic 0件問題**: 本番で `Metacritic data fetched: 0 scores`。`metascore` が死にシグナルになっている。別 Issue として切り出して修正する。
