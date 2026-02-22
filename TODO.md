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
- [ ] `.github/workflows/weekly-build.yml` 作成
- [ ] cron スケジュール設定（毎週日曜 AM 9:00 JST）
- [ ] データ取得ステップ
- [ ] 記事生成ステップ
- [ ] Astro ビルドステップ
- [ ] Cloudflare Pages デプロイステップ
- [ ] Secrets 設定手順ドキュメント

### 5.2 Cloudflare Pages 設定
- [ ] `wrangler.toml` 作成（必要に応じて）
- [ ] ビルド設定
- [ ] 環境変数設定
- [ ] カスタムドメイン設定（任意）

### 5.3 手動実行ワークフロー
- [ ] `workflow_dispatch` 対応
- [ ] 任意の日付での生成対応

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
- [ ] README.md 作成
- [ ] 環境構築手順
- [ ] 運用手順書

### 7.2 初回発行準備
- [ ] 全 API キーの取得・設定
- [ ] テスト発行の実施
- [ ] 本番デプロイ確認

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
