# Game Wire 実行計画 TODO

## Phase 1: プロジェクト基盤構築

### 1.1 Astro プロジェクト初期化
- [x] `npm create astro@latest` でプロジェクト作成
- [x] TypeScript 設定（strict mode）
- [x] `tsconfig.json` の調整
- [x] `.gitignore` の設定
- [x] `.env.example` ファイル作成（必要な環境変数一覧）

### 1.2 依存パッケージのインストール
- [x] AWS SDK（@aws-sdk/client-bedrock-runtime）
- [x] dotenv（環境変数読み込み）※Astro内蔵のため不要
- [x] 日付操作ライブラリ（date-fns）
- [x] HTTPクライアント（必要に応じて）※fetch APIを使用

---

## Phase 2: データ取得スクリプト開発

### 2.1 Steam データ取得 (`scripts/fetch-steam.ts`)
- [x] Steam Charts スクレイピング or Steam Web API 接続
- [x] Top Sellers 取得ロジック
- [x] Top Played 取得ロジック
- [x] データ型定義（TypeScript interface）
- [x] エラーハンドリング・リトライ処理

### 2.2 YouTube データ取得 (`scripts/fetch-youtube.ts`)
- [x] YouTube Data API v3 接続
- [x] ゲーム系トレンド動画検索
- [x] 関連ゲームタイトル抽出ロジック
- [x] API レート制限対策
- [x] データ型定義

### 2.3 IGDB データ取得 (`scripts/fetch-igdb.ts`)
- [x] IGDB API 認証（OAuth2）
- [x] ゲーム情報検索（タイトル正規化）
- [x] ジャンル・プラットフォーム取得
- [x] カバー画像URL取得
- [x] データ型定義

### 2.4 Metacritic データ取得 (`scripts/fetch-metacritic.ts`)
- [x] Metacritic スクレイピング or API
- [x] メタスコア取得
- [x] ユーザースコア取得（可能であれば）
- [x] データ型定義

### 2.5 データ統合 (`scripts/fetch-data.ts`)
- [x] 全データソースの統合スクリプト
- [x] 取得データのマージ・正規化
- [x] JSON ファイルへの出力
- [x] npm script 登録（`npm run fetch-data`）

---

## Phase 3: 記事生成システム開発

### 3.1 Amazon Bedrock 接続 (`scripts/bedrock-client.ts`)
- [x] Bedrock クライアント初期化
- [x] Claude モデル呼び出し関数
- [x] プロンプトテンプレート管理
- [x] レスポンスパース処理

### 3.2 記事生成ロジック (`scripts/generate-articles.ts`)
- [x] 大手企業新作紹介（2本）生成プロンプト
- [x] インディーゲーム紹介（2本）生成プロンプト
- [x] 特集記事（1本）生成プロンプト（日付ベースイベント判定）
- [x] 名作深掘り（1本）生成プロンプト
- [x] Markdown 形式での出力

### 3.3 号の組み立て (`scripts/build-issue.ts`)
- [x] 号番号の自動採番
- [x] 発行日の設定
- [x] 記事ファイルの配置（`src/content/issues/`）
- [x] メタデータ（frontmatter）生成
- [x] npm script 登録（`npm run build-issue`）

---

## Phase 4: フロントエンド開発

### 4.1 コンテンツコレクション設定
- [x] `src/content/config.ts` でスキーマ定義
- [x] issues コレクション設定
- [x] Zod バリデーション

### 4.2 レイアウト作成 (`src/layouts/`)
- [x] `BaseLayout.astro`（共通HTML構造）
- [x] `MagazineLayout.astro`（雑誌風レイアウト）
- [x] `ArticleLayout.astro`（記事詳細用）

### 4.3 コンポーネント作成 (`src/components/`)
- [x] `Header.astro`（ヘッダー・ナビゲーション）
- [x] `Footer.astro`（フッター）
- [x] `ArticleCard.astro`（記事カード）
- [x] `GameInfo.astro`（ゲーム情報表示）
- [x] `ScoreBadge.astro`（メタスコア表示）
- [x] `CoverImage.astro`（ゲーム画像）
- [x] `IssueNav.astro`（号ナビゲーション）

### 4.4 ページ作成 (`src/pages/`)
- [x] `index.astro`（最新号表示）
- [x] `issue/[issueNumber]/article/[slug].astro`（記事詳細ページ）
- [x] `archive/index.astro`（バックナンバー一覧）
- [x] `archive/[issue].astro`（過去号詳細）
- [x] `about.astro`（サイト説明ページ）

### 4.5 スタイル設計 (`src/styles/`)
- [x] `global.css`（グローバルスタイル）
- [x] `magazine.css`（雑誌風デザイン）
- [x] `responsive.css`（レスポンシブ対応）
- [x] フォント設定（日本語対応）
- [x] カラーパレット定義

---

## Phase 5: CI/CD・デプロイ設定

### 5.1 GitHub Actions ワークフロー
- [x] `.github/workflows/weekly-build.yml` 作成
- [x] cron スケジュール設定（毎週日曜 AM 9:00 JST）
- [x] データ取得ステップ
- [x] 記事生成ステップ
- [x] Astro ビルドステップ
- [x] Cloudflare Pages デプロイステップ
- [x] Secrets 設定手順ドキュメント

### 5.2 Cloudflare Pages 設定
- [x] `wrangler.toml` 作成（必要に応じて）※GitHub Actionsで直接指定のため不要
- [x] ビルド設定（README.mdに手順記載）
- [x] 環境変数設定（README.mdに手順記載）
- [ ] カスタムドメイン設定（任意）

### 5.3 手動実行ワークフロー
- [x] `workflow_dispatch` 対応
- [x] 任意の日付での生成対応

---

## Phase 6: テスト・品質保証

### 6.1 ローカル動作確認
- [x] データ取得スクリプトの動作確認
- [x] 記事生成の品質確認
- [x] フロントエンド表示確認
- [x] レスポンシブデザイン確認

### 6.2 エラーハンドリング
- [ ] API 障害時のフォールバック
- [ ] 生成失敗時の通知（GitHub Actions）
- [ ] ログ出力の整備

---

## Phase 7: ドキュメント・運用準備

### 7.1 ドキュメント整備
- [x] README.md 作成
- [x] 環境構築手順
- [x] 運用手順書

### 7.2 初回発行準備
- [x] 全 API キーの取得・設定
- [x] テスト発行の実施
- [x] 本番デプロイ確認

---

## Phase 8: デザイン・コンテンツ改善

### 8.1 デザイン改善
- [x] トップページのレイアウト調整（フィーチャードレイアウト採用）
- [x] 記事詳細ページのデザイン改善（グラデーションヘッダー、装飾追加）
- [x] ゲーム情報カードのビジュアル強化（背景・枠線・スコア表示改善）
- [x] カバー画像がない場合のプレースホルダー表示
- [x] アニメーション・トランジションの追加
- [x] 詳細ページのレイアウト改善（余白削減、画面全体を使った表示）
- [x] デザインカラーの調整（ウォームアイボリーテーマ採用）
- [ ] ダークモード/ライトモード切り替え（任意）
- [ ] OGP画像・SNSシェア対応

### 8.2 記事内容の改善
- [x] 記事詳細ページの本文をより充実させる（AI生成コンテンツ表示）
- [x] カテゴリ別のテンプレート文言改善（プロンプトテンプレート刷新）
- [x] AI生成時のプロンプト調整で記事品質向上（詳細セクション構成）
- [x] 画像・スクリーンショットの活用
- [x] 関連記事・おすすめ記事の表示
- [x] 作品概要の文字切れ修正（トップページ・詳細ページ）
- [x] ゲームの開発国・地域の表示追加
- [x] 特集記事のAI画像生成（Amazon Nova Canvas）
- [x] 特集記事のAI画像をトップページのタイルにも表示
- [x] Creator's Eye セクションの追加（ゲームクリエイター向けコラム）
- [x] 記事内に参照元URLリンクを表示（Steam、IGDB、OpenCritic、YouTube）

### 8.3 UX改善
- [ ] ローディング状態の表示
- [x] スムーズスクロール
- [ ] キーボードナビゲーション対応
- [ ] アクセシビリティ改善（ARIA属性など）

---

## 実装優先順位

1. **Phase 1** → プロジェクト基盤がないと始まらない
2. **Phase 4.1-4.2** → 最低限の表示基盤
3. **Phase 2** → データがないと記事が作れない
4. **Phase 3** → 記事生成の核心部分
5. **Phase 4.3-4.5** → UI/UX の充実
6. **Phase 5** → 自動化
7. **Phase 6-7** → 品質・運用

---

## 見積もり工数（参考）

| Phase | 内容 | 複雑度 |
|-------|------|--------|
| 1 | プロジェクト基盤 | 低 |
| 2 | データ取得 | 高（API連携多数） |
| 3 | 記事生成 | 中〜高（プロンプト調整） |
| 4 | フロントエンド | 中 |
| 5 | CI/CD | 中 |
| 6 | テスト | 低〜中 |
| 7 | ドキュメント | 低 |

---

*最終更新: 2026-02-15 (Phase 8.1-8.2 タスク追加)*

---

## 完了済み

- [x] Phase 1: プロジェクト基盤構築
- [x] Phase 4.1: コンテンツコレクション設定
- [x] Phase 4.2: レイアウト作成
- [x] 記事詳細ページ追加
- [x] Phase 2: データ取得スクリプト開発
- [x] Phase 3: 記事生成システム開発
- [x] Phase 4.3: コンポーネント作成
- [x] Phase 4.4: ページ作成
- [x] Phase 4.5: スタイル設計
- [x] Phase 8.1 (部分): デザイン改善（レイアウト、記事詳細、ゲーム情報カード）
- [x] Phase 8.2 (部分): 記事内容改善（AI生成コンテンツ表示、プロンプト改善）

---

## Phase 9: 記事品質改善・ハルシネーション対策

### 9.1 セクション構成の見直し

各カテゴリのセクション構成を以下に変更する。

#### 大手新作（newRelease）
1. 導入
2. ゲームの特徴（※レビュー記事をWeb検索）
3. 開発ストーリー（※開発者インタビュー、開発ブログをWeb検索）
4. こんな人におすすめ
5. 発売情報
6. Creator's Eye

#### インディー（indie）
1. 導入
2. ゲームの魅力（※レビュー記事をWeb検索）
3. 開発ストーリー（※開発者インタビュー、開発ブログをWeb検索）
4. プレイヤーの声（※SteamレビューをWeb検索）
5. こんな人におすすめ
6. 発売情報
7. Creator's Eye

#### 特集（feature）
1. 導入
2. おすすめゲーム紹介
3. 遊び方のポイント
4. まとめ
※Creator's Eyeなし

#### 名作深掘り（classic）
1. 導入
2. ゲームの歴史（※発売当時の記事、業界分析をWeb検索）
3. 名作たる理由（※レビュー記事をWeb検索）
4. プレイ環境
5. Creator's Eye

### 9.2 Web検索機能の実装（Tavily API）

- [x] Tavily API キーの取得・設定
- [x] `scripts/fetch-web-search.ts` の作成
- [x] 検索クエリ関数の実装
  - [x] レビュー記事検索: `"{ゲーム名}" レビュー 評価`
  - [x] 開発者情報検索: `"{ゲーム名}" 開発者 インタビュー OR 開発秘話`
  - [x] Steamレビュー検索: `"{ゲーム名}" Steam レビュー 評価`
  - [x] 歴史・影響検索: `"{ゲーム名}" 歴史 影響 名作`
- [ ] 検索結果のキャッシュ機構（同一ゲームの重複検索防止）※任意
- [x] レート制限・エラーハンドリング
- [x] テスト実行・動作確認

### 9.3 プロンプトテンプレートの更新

- [x] `scripts/bedrock-client.ts` のプロンプト修正
  - [x] `newReleaseSystem` の更新（新セクション構成）
  - [x] `indieSystem` の更新（新セクション構成）
  - [x] `featureSystem` の更新（新セクション構成、Creator's Eye削除）
  - [x] `classicSystem` の更新（新セクション構成）
- [x] Web検索結果をプロンプトに組み込む処理（※9.4で実装）
- [x] ハルシネーション防止の制約追加
  - [x] 「与えられた情報のみを使用」の明示
  - [x] 「不明な場合は記載しない」の指示

### 9.4 記事生成フローの更新

- [x] `scripts/generate-articles.ts` の修正
  - [x] 記事生成前にWeb検索を実行
  - [x] 検索結果を `buildUserMessage` に渡す
- [x] temperatureの調整（0.7 → 0.5）

### 9.5 環境変数の追加

- [x] `.env.example` に `TAVILY_API_KEY` を追加
- [x] GitHub Secrets に `TAVILY_API_KEY` を追加（ワークフロー設定済み、Secrets は手動登録）
- [x] README.md に Tavily API の設定手順を追記

### 9.6 開発環境・本番環境の記事自動切り替え

- [x] `src/pages/index.astro` で `import.meta.env.DEV` による自動切り替え
- [x] `src/pages/issue/[issueNumber]/article/[slug].astro` で同様の切り替え
- [x] `src/pages/archive/index.astro` で同様の切り替え
- [x] `src/pages/archive/[issue].astro` で同様の切り替え
- [x] 不要になった `/dev` ページの削除（`src/pages/dev/` 配下）

### 9.7 名作深掘り選定条件の修正

- [x] メタスコア85以上のゲームはSteam/YouTube人気データなしでも選定対象に
- [x] `scripts/fetch-data.ts` の `selectGamesForArticles` 関数を修正

---

## 残タスク一覧（優先度順）

### 高優先度（本番運用に必要）
- [x] ~~GitHub Secrets に `TAVILY_API_KEY` を追加（9.5）~~ ※ワークフロー設定済み、Secrets登録は手動
- [x] ~~README.md に Tavily API の設定手順を追記（9.5）~~

### 中優先度（品質向上）
- [x] OpenCritic API の HTTP 400 エラー対応（2.4）※APIキー必須化に対応、キーなし時はスキップ
- [x] 特集記事で紹介するゲームの選定ロジック改善（10.3）※プロンプト改善
- [ ] API 障害時のフォールバック（6.2）
- [ ] 生成失敗時の通知（GitHub Actions）（6.2）
- [ ] ログ出力の整備（6.2）
- [ ] OGP画像・SNSシェア対応（8.1）

### 低優先度（任意・改善）
- [ ] OpenCritic APIキーの取得・設定（2.4）※スコア取得に必要、申請先: developers@opencritic.com
- [ ] 検索結果のキャッシュ機構（9.2）
- [ ] ダークモード/ライトモード切り替え（8.1）
- [ ] ローディング状態の表示（8.3）
- [ ] キーボードナビゲーション対応（8.3）
- [ ] アクセシビリティ改善（ARIA属性など）（8.3）
- [ ] カスタムドメイン設定（5.2）

---

*最終更新: 2026-03-08 (OpenCritic APIキー対応、特集記事ゲーム選定プロンプト改善)*

---

## Phase 10: 特集記事テーマ選定改善

日本のイベント・記念日データを元に、AIが特集テーマを自動選定する機能を追加。

### 10.1 イベントデータの準備
- [x] `data/japanese-events.json` の作成
- [x] 年間イベント・記念日データの定義
- [x] フォーマット: month, day/dayRange/week+dayOfWeek, name, gameThemeHint

### 10.2 イベント取得ロジックの実装
- [x] `scripts/fetch-japanese-events.ts` の作成
- [x] JSONファイル読み込み関数
- [x] 指定日から直近1週間のイベント取得関数
- [x] week+dayOfWeek（第n週x曜日）の日付計算
- [x] dayRange（期間）の判定ロジック

### 10.3 AIテーマ選定の実装
- [x] `scripts/bedrock-client.ts` にテーマ選定プロンプト追加
- [x] 複数イベントから「知名度」+「ゲーム関連性」で最適なものを選定
- [x] 選定したイベントを元に独自テーマを生成
- [x] フォールバック: イベントなしの場合は汎用テーマ

### 10.4 既存コードの置き換え
- [x] `determineFeatureTheme` 関数を新ロジックに置き換え
- [x] `generateFeatureArticle` から新関数を呼び出し
- [x] 動作確認・テスト
