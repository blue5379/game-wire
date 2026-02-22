# Game Wire

AIを活用した週刊ゲーム情報雑誌の自動生成システム

## プロジェクト概要

毎週日曜日に自動発行されるゲーム情報Webマガジン。Steam Charts、YouTube Data API、IGDB、Metacriticから情報を収集し、Amazon Bedrock経由のClaudeで記事を生成する。

## 技術スタック

- **フレームワーク**: Astro（静的サイト生成）
- **言語**: TypeScript
- **パッケージマネージャー**: npm
- **ホスティング**: Cloudflare Pages
- **CI/CD**: GitHub Actions（毎週日曜日定期実行）
- **記事生成AI**: Amazon Bedrock（Claude）

## 情報源・API

| API | 用途 | 取得データ |
|-----|------|-----------|
| Steam Charts | 人気指標（定量） | Top Sellers / Top Played |
| YouTube Data API | 話題性（拡散） | ゲーム系トレンド動画 |
| IGDB | メタ情報補完 | タイトル正規化・ジャンル・画像 |
| Metacritic | 評価スコア | メタスコア |

## コンテンツ構成（1号あたり）

1. **大手企業の新作紹介**: 2本
   - もうすぐ発売 / 発売されたばかりのタイトル

2. **話題のインディーゲーム**: 2本
   - Steam / YouTubeで話題のタイトル

3. **特集記事**: 1本
   - 周年イベント、季節イベントなど（AIが日付から判断）

4. **名作深掘り**: 1本
   - 選定基準: Steam人気度 + Metacriticスコア
   - 概要、評価が高い理由を詳細に解説

## ディレクトリ構成

```
game-wire/
├── src/
│   ├── components/     # UIコンポーネント
│   ├── layouts/        # ページレイアウト
│   ├── pages/          # ページ（Astro）
│   │   ├── index.astro        # 最新号
│   │   └── archive/           # バックナンバー
│   ├── content/        # 記事コンテンツ（Markdown）
│   │   └── issues/            # 各号のデータ
│   └── styles/         # スタイル（雑誌風デザイン）
├── scripts/
│   ├── fetch-data.ts          # API からデータ取得
│   ├── generate-articles.ts   # Bedrock で記事生成
│   └── build-issue.ts         # 号を組み立て
├── .github/
│   └── workflows/
│       └── weekly-build.yml   # 毎週日曜日の定期実行
├── screenshots/           # 開発・テスト用スクリーンショット（gitignore対象）
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## 開発コマンド

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview

# データ取得（手動実行）
npm run fetch-data

# 記事生成（手動実行）
npm run generate

# 号の生成（fetch + generate + build）
npm run build-issue
```

## 開発ツール（Dev Tools）

開発サーバー実行中、画面右下に開発ツールボタン（紫色）が表示されます。

### 機能

- **データ取得**: APIからゲーム情報を取得（`npm run fetch-data` 相当）
- **記事生成**: Bedrockで記事を生成（`npm run generate` 相当）
- **一括実行**: データ取得 → 記事生成を連続実行

### 使い方

1. `npm run dev` で開発サーバーを起動
2. 画面右下の紫色ボタンをクリック
3. 実行したい処理のボタンをクリック
4. 完了後、自動でページがリロードされる

※ 開発モード（`npm run dev`）でのみ表示されます。本番ビルドには含まれません。

## 環境変数

```bash
# .env.local（ローカル開発用）
# GitHub Secrets（本番用）

YOUTUBE_API_KEY=         # YouTube Data API キー
IGDB_CLIENT_ID=          # IGDB Client ID
IGDB_CLIENT_SECRET=      # IGDB Client Secret
AWS_ACCESS_KEY_ID=       # AWS アクセスキー
AWS_SECRET_ACCESS_KEY=   # AWS シークレットキー
AWS_REGION=              # AWS リージョン（例: us-east-1）
```

## GitHub Actions ワークフロー

毎週日曜日 AM 9:00 (JST) に自動実行:

1. データ取得（Steam, YouTube, IGDB, Metacritic）
2. Claude で記事生成
3. Astro ビルド
4. Cloudflare Pages にデプロイ

## デザイン方針

- **雑誌風リッチレイアウト**: 視覚的に魅力的なデザイン
- **レスポンシブ対応**: PC / タブレット / スマホ
- **画像活用**: IGDB から取得したゲーム画像を表示
- **バックナンバー**: 過去号一覧ページから閲覧可能

## 対象プラットフォーム

- Nintendo Switch
- PlayStation（PS4/PS5）
- Xbox（Series X|S / One）
- PC（Steam）
- モバイル（iOS / Android）

## 多言語対応

- 出力言語: **日本語のみ**
- 海外情報は記事生成時にAIが日本語に翻訳

## 注意事項

- API レート制限に注意（特に YouTube Data API）
- 画像の著作権: IGDB の利用規約に従う
- Bedrock の利用料金に注意
- **スクリーンショットの配置**: テストや検討に使用するスクリーンショットは `screenshots/` ディレクトリに配置すること（gitignore対象、リポジトリには含まれない）
