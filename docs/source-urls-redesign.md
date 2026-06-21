# 参考リンク マルチプラットフォーム対応 — 抜本設計仕様

Issue: #116（直接トリガー）  
関連Issue: #7, #42, #44, #46, #49, #50, #55, #103, #108, #113, #115

## 背景・問題の根本原因

### 症状

vol.12「S&box」（Steam app/590830 で実在）の参考リンクに Steam URL が含まれない。  
誰でも検索で見つけられるリンクが自動生成で取りこぼされた。

### 累積するもぐらたたき

`#7, #42, #44, #46, #49, #50, #55, #103, #108, #113, #115, #116` と **12件以上**が同型 issue として累積。  
毎回「個別タイトルを手で直す」「補完経路を1本足す」「verify の閾値を調整する」を繰り返している。  
これは根本原因が構造側にあるため、個別パッチでは止まらない。

### 根本原因（5点）

#### 原因1：参考リンクスキーマが Steam 一強固定

`scripts/types.ts:149-155` の `SourceUrls` と `src/components/SourceLinks.astro:20-58` が

```ts
{ steam?, igdb?, metacritic?, official? }
```

の4フィールド固定。**Switch eShop / PS Store / Xbox Store / App Store / Google Play のストアリンクを乗せる場所が存在しない。**

`scripts/fetch-official-jp-url.ts:18-28` の `NON_OFFICIAL_URL_PATTERNS` は `store.playstation.com` `store-jp.nintendo.com` `xbox.com/.../games/store` 等を意図的に弾いている（official 枠との混在防止のため正しい設計だが、ストアリンク専用の枠がないため結果的に掲載不可になっている）。

#### 原因2：Steam URL 取得経路に「title→appId 逆引き」が存在しない

現行の Steam URL 取得は3経路のみ：

| 経路 | 場所 | 条件 |
|---|---|---|
| Top Sellers/Played の既知 appId | `fetch-data.ts:199, 231` | ランキング圏内のみ |
| IGDB `websites[category=13]` | `fetch-data.ts:439-441` | IGDB に Steam URL が登録されている場合のみ |
| appId 既知時の appdetails 補完 | `fetch-data.ts:465-477` | appId が既に判明している場合のみ |

**Steam Store Search API（`store.steampowered.com/api/storesearch`）による title→appId 逆引きがコードベースに存在しない。**  
S&box は Top Sellers 圏外 + IGDB websites null + appId 不明 → 3経路すべて空振り。

#### 原因3：verify は「削るだけ」で補完しない

`verifySelectedGamesSteamUrl`（`fetch-data.ts:695-758`）は name mismatch で `delete sourceUrls.steam` するのみ。  
`removeZombieGames`（`fetch-data.ts:771-816`）は「sourceUrl が何か1つあれば通過」のため、`igdb` URL だけ残った状態で記事化される（#103 と同型）。

#### 原因4：newReleases 選定が品質ゲート未適用

`scripts/fetch-data.ts:911-924` の newReleases 選定は品質ゲート（`isQualifiedGame`, `!isFanGame`, `!isInvalidGameTitle`）が未適用。  
また「採用＋予備差し替え」フローがなく、zombie 除去で消えると `length<2` の警告だけ出して号が縮む。

#### 原因5：客観事実の機械検証層が無い

既存の検証層は `validate-article`（正規表現）と `judge-article`（LLM）のみ。  
「Steam に存在するのに `sourceUrls.steam` が空」のような **コードで客観決定可能な事実欠落** を検知していない。

---

## マスト要件（ユーザー確定）

1. **Steam 以外のプラットフォームにも対応**（Switch / PlayStation / Xbox / iOS / Android）
2. **Steam にゲームページが実在するなら必ず Steam リンクも参考リンクに表示**
3. newReleases 選定仕様の見直しもスコープに含める

---

## 設計概要：3ステージ・パイプライン

```
[Discover]          aggregated.json（既存 Steam/YouTube/IGDB データ）
     ↓
[Identity Resolve]  Identity Resolver（新規・核）— マルチプラットフォーム URL を一元解決
     ↓
[Completeness Gate] 客観事実の機械検証（新規）— LLM 不使用
```

---

## A. 参考リンクスキーマの再設計（PR-1）

### 新スキーマ

```ts
// scripts/types.ts

export type StorePlatform =
  | 'steam'
  | 'nintendo'    // Switch eShop / Nintendo 公式ゲーム紹介ページ
  | 'playstation' // PS Store / PlayStation 公式
  | 'xbox'        // Xbox Store / Xbox 公式
  | 'appstore'    // iOS App Store
  | 'googleplay'  // Google Play
  | 'epicgames'
  | 'gog';

export interface StoreLink {
  platform: StorePlatform;
  url: string;
  /** 解決経路（観測可能性のため） */
  resolvedBy: 'cache' | 'igdb-website' | 'storesearch' | 'web-search' | 'manual';
  /** 名前突合の確信度 */
  confidence: 'high' | 'medium' | 'low';
}

export interface SourceUrls {
  /** 公式日本語ページ（既存） */
  official?: string;
  officialUrlSource?: 'tavily' | 'igdb-official' | 'igdb-fallback';
  /** プラットフォーム別ストアリンク（複数） */
  stores?: StoreLink[];
  /** 補助リンク（既存、後方互換） */
  igdb?: string;
  metacritic?: string;
  /** @deprecated stores[] に移行。互換シムで変換する */
  steam?: string;
}
```

### 互換シム方針

- 既存の `selected-games.json` / 過去号の `sourceUrls.steam` を読み込む箇所に「`steam` → `stores[]` 変換シム」を挿入
- 書き出しは新スキーマ（`stores[]`）のみ
- `SourceLinks.astro` は `stores` を map で表示。各 platform にアイコン・ラベルを与える

---

## B. Game Identity Resolver（PR-2 / PR-3）

「ゲームに対して、複数プラットフォームのストア URL と確信度を **一元解決** する」単一ゲートウェイ。

### インターフェース

```ts
// scripts/identity-resolver.ts

export interface ResolveInput {
  title: string;
  titleJa?: string;
  igdbSlug?: string;
  releaseDate?: string;
  igdbWebsites?: { url: string; category?: number }[];
  knownSteamAppId?: number;
  platforms?: string[];
}

export interface ResolveOutput {
  stores: StoreLink[];
  trace: Record<StorePlatform, { attempts: { method: string; ok: boolean; reason?: string }[] }>;
}
```

### プラットフォーム別 resolver（プラグイン構成）

| ファイル | 担当 | 解決経路 |
|---|---|---|
| `scripts/resolvers/steam.ts` | Steam | ① knownAppId → ② IGDB websites[category=13] → ③ **Steam Store Search API（新規）** → ④ titleJa / igdbSlug で再 search |
| `scripts/resolvers/nintendo.ts` | Switch | ① IGDB websites[nintendo.com 系] → ② Tavily 検索 `"{title}" site:nintendo.com/jp` → ③ HEAD 200 検証 |
| `scripts/resolvers/playstation.ts` | PS | ① IGDB websites[playstation.com 系] → ② Tavily 検索 `"{title}" site:playstation.com/ja-jp` → ③ HEAD 200 検証 |
| `scripts/resolvers/xbox.ts` | Xbox | ① IGDB websites[xbox.com 系] → ② Tavily 検索 → ③ HEAD 200 検証 |
| `scripts/resolvers/appstore.ts` | iOS | iTunes Search API（無料・認証不要） |
| `scripts/resolvers/googleplay.ts` | Android | Tavily 検索 `"{title}" site:play.google.com` → HEAD 200 検証 |
| `scripts/resolvers/match.ts` | 共通名前突合 | 正規化後完全一致 OR 年差±2年以内のプレフィックス一致 |

### 実行ポリシー

| Resolver | 実行条件 |
|---|---|
| Steam | **platforms に依らず常時実行**。仕様「Steam に実在するなら必ず表示」を保証する安全網 |
| Nintendo / PlayStation / Xbox | **常時実行**。`platforms` はヒントとして使うが、走らせるかどうかの判断には使わない |
| iOS / Android | `platforms` に "iOS" / "Android" / "mobile" 系が含まれる場合のみ実行 |

---

## C. verify を「補完してから削る」へ（PR-3）

`verifySelectedGamesSteamUrl` → `reconcileSelectedGames` に改名・全面書き換え：

```
for game in selected:
  identityResult = resolveGameIdentity(game)
  game.sourceUrls.stores = identityResult.stores
  既存の旧 sourceUrls.steam が Resolver で confirm されなければ削除
  どの platform でも 1 件も解決できなかった場合のみ「Store 不明」状態として Gate に渡す
```

---

## D. Completeness Gate（PR-5）

`removeZombieGames` の直後・`fs.writeFileSync` の前に挿入する **客観事実の機械検証**（LLM 不使用）。

### ルール一覧

| ID | ルール | 違反内容 |
|---|---|---|
| R1 | ストアリンク最低1件 | `stores.length === 0` かつ `official` も無い |
| R2 | Steam 実在取りこぼし検知 | Resolver が `confidence>=medium` で Steam URL を返したのに `stores[]` に Steam が乗っていない |
| R2b | 他プラットフォーム取りこぼし検知 | `game.platforms` に Switch/PS/Xbox が含まれるのに `confidence=high` で URL が取れたのに乗っていない |
| R3 | 公式 URL 到達性 | `official` が HTTP 200 以外 |
| R4 | カバー画像ホスト許可リスト | `images.igdb.com` / `cdn.cloudflare.steamstatic.com` 以外 |

### 動作モード

| 環境変数 `COMPLETENESS_GATE` | 動作 |
|---|---|
| `warn`（DEV_MODE 既定） | `validation-dev/completeness-report.json` に記録のみ |
| `replace`（PR-5 マージ後本番） | 違反した newReleases/indies は次候補に差し替え |
| `fail`（PR-6 で昇格） | `process.exit(1)` |

---

## E. newReleases 選定の整理（PR-4）

`selectGamesForArticles` の newReleases 部分を `selectNewReleasesWithFallback` に切り出し、  
indies と同じ「採用＋予備差し替え」に統一。

### 新フィルタチェーン

```
直近3ヶ月のゲーム
  ①  既存品質ゲート（isQualifiedGame, !isFanGame, !isInvalidGameTitle, クールダウン）→ newReleases にも適用
  ②  「実存の根拠」フィルタ（以下のいずれか）:
        (a) Steam ランキング由来（steamRank or steamPlayers が有る）
        (b) IGDB rating_count >= 5
        (c) youtubePopularity > 0
  ③  metascore || igdbRating 降順でソート、上位から採用
  ④  Resolver / Gate で落ちたら次候補に差し替え（最大2本まで）
```

### 設計の重要分離

- **選定の判断（②）** と **ストアリンクの取得（後段 Resolver）** は **完全に分離**
- ② は既取得データのみで判定（API コール不要・堅い）
- Nintendo/Switch 専売タイトルは (b) or (c) で通る。Resolver が取りこぼしても **選定からは落ちない**

---

## F. 観測可能性

| ファイル | 内容 |
|---|---|
| `data/identity-resolver-trace.json` | 各ゲームの全 platform 解決トレース |
| `data/completeness-report.json` | Gate 結果 |

「次に類似 issue が来たら trace を grep するだけで原因が分かる」状態を作る。  
これがもぐらたたきを止める鍵。

---

## PR ロードマップ

| PR | ブランチ | 内容 | 影響範囲 | リスク |
|---|---|---|---|---|
| **PR-0** | `fix/issue-116-sbox-steam-url` | vol.12 S&box に Steam URL を手動追加。Issue #116 即クローズ | 1ファイル | 極小 |
| **PR-1** | `feat/issue-116-stores-schema` | `SourceUrls.stores[]` 追加、`SourceLinks.astro` を stores 対応に、互換シム実装 | types.ts, config.ts, SourceLinks.astro | 中（表示確認必須） |
| **PR-2** | `feat/issue-116-identity-resolver` | Identity Resolver 新規実装（Steam + Nintendo + PlayStation 最低限）。trace 出力。**呼び出し側変更なし** | scripts/resolvers/, identity-resolver.ts | 低 |
| **PR-3** | `feat/issue-116-resolver-integration` | Resolver を fetch-data.ts に統合。`verify→reconcile` 改名。**S&box が自動救済される** | fetch-data.ts, finalize-game-metadata.ts | 中（回帰テスト必須） |
| **PR-4** | `feat/issue-116-newreleases-filter` | `selectNewReleasesWithFallback` 新設、品質ゲート適用 | fetch-data.ts | 中 |
| **PR-5** | `feat/issue-116-completeness-gate` | Completeness Gate 導入（`warn` 既定） | scripts/completeness-gate.ts | 中 |
| **PR-6** | `feat/issue-116-known-cases` | 既知ケースフィクスチャ + 回帰テスト、PROD で `fail` 既定に切替 | テスト | 低 |

---

## 変更しないもの

1. **LLM judge を増やさない** — ストア存在判定は API + URL 検証で客観決定可能
2. **`isSameSteamApp` 閾値調整での対処はしない** — 判定責務は名前 + 年照合の多重化で固める
3. **大手 publisher ホワイトリスト** — メンテ負債回避。「実在の根拠」が代理指標として機能する
4. **Steam-centric の前提には戻らない** — スキーマ・Resolver・Gate すべてマルチプラットフォーム前提
5. **評論家スコア軸の議論は別 issue** — Metacritic/OpenCritic/IGDB aggregated_rating はすべて別 issue
6. **既存記事の手動修正でごまかさない**（PR-0 の vol.12 hotfix を除く）

---

## 検証方針

### Resolver 単体テスト（vi.mock で fetch を全モック）

| # | シナリオ | 期待 |
|---|---|---|
| 1 | #116 S&box（IGDB websites null） | Steam storesearch で appId 590830, `high` |
| 2 | Switch 専売（スプラトゥーン3） | Steam 空ヒット, Nintendo resolver が nintendo.com/jp/ で解決 |
| 3 | マルチプラットフォーム（PC+PS5+Xbox） | Steam + PS + Xbox の3件が `stores[]` に乗る |
| 4 | Switch 専売だが実は Steam にも存在 | Nintendo + Steam 両方が `stores[]` に乗る |
| 5 | #46 同名異作品 | releaseDate 年差 > 2 で reject |
| 6 | #108 日本語タイトル | 英名/日本語名どちらかで一致 |
| 7 | 記号タイトル（S&box, Half-Life: Alyx） | 正規化後に突合成功 |
| 8 | 全失敗 | `stores: []`, trace に全失敗理由 |

### 既知ケースフィクスチャ（PR-6）

```jsonc
// scripts/__fixtures__/known-cases.json
[
  {"issue": 116, "scenario": "IGDB websites null だが Steam に存在",
   "input": {"title":"S&box","igdbSlug":"s-and-box","releaseDate":"2026-04-28","platforms":["PC"]},
   "expected": {"stores": [{"platform":"steam","confidence":"high"}]}},
  // #46 / #49 / #50 / #55 / #103 / #108 / #115 を順次追加
]
```

今後 issue が来るたびに1行追加する運用。

### E2E（DEV_MODE）

```bash
DEV_MODE=true npm run build-issue:dev
# data/identity-resolver-trace.json — S&box が steam:high で 590830 解決
# issues-dev/issue-XXX.md の S&box frontmatter に sourceUrls.stores[steam] が入る
# validation-dev/completeness-report.json — violations が 0
```

---

## 期待される効果

- **Switch / PS / Xbox / iOS / Android の参考リンクが構造的に乗る**
- **Steam に実在するなら必ず Steam リンクも併記**（仕様の保証）
- **S&box タイプの取りこぼしがゼロに**（IGDB websites null + Top Sellers 圏外でも救済）
- **newReleases 側でも同型バグの再発防止**
- 過去12件の URL 系 issue が、今後は `known-cases.json` に1行追加するだけで再発防止できる
- trace ファイルにより次の issue 調査は数分で原因特定できる
- LLM コスト増ゼロ、新規外部 API は **iTunes Search API のみ**（無料・認証不要）
