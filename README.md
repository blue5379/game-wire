# Game Wire

AIを活用した週刊ゲーム情報雑誌の自動生成システム

毎週日曜日に自動発行されるゲーム情報Webマガジン。Steam Charts、YouTube Data API、IGDB、Metacriticから情報を収集し、Amazon Bedrock経由のClaudeで記事を生成します。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、以下の環境変数を設定してください。

```bash
# YouTube Data API
YOUTUBE_API_KEY=your_youtube_api_key

# IGDB (Twitch Developer Portal)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret

# AWS (Amazon Bedrock)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
```

## 開発

```bash
# 開発サーバー起動
npm run dev

# データ取得
npm run fetch-data

# 記事生成
npm run generate

# 号の生成（一括実行）
npm run build-issue

# ビルド
npm run build
```

## デプロイ設定

### GitHub Secrets の設定

GitHub リポジトリの Settings > Secrets and variables > Actions で以下の Secrets を登録してください。

| Secret名 | 説明 | 取得元 |
|----------|------|--------|
| `YOUTUBE_API_KEY` | YouTube Data API キー | [Google Cloud Console](https://console.cloud.google.com/) |
| `IGDB_CLIENT_ID` | IGDB Client ID | [Twitch Developer Portal](https://dev.twitch.tv/console) |
| `IGDB_CLIENT_SECRET` | IGDB Client Secret | [Twitch Developer Portal](https://dev.twitch.tv/console) |
| `AWS_ACCESS_KEY_ID` | AWS アクセスキー | [AWS IAM](https://console.aws.amazon.com/iam/) |
| `AWS_SECRET_ACCESS_KEY` | AWS シークレットキー | [AWS IAM](https://console.aws.amazon.com/iam/) |
| `AWS_REGION` | AWS リージョン（例: `us-east-1`） | - |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID | [Cloudflare Dashboard](https://dash.cloudflare.com/) |

### API キーの取得手順

#### YouTube Data API

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
3. 「APIとサービス」>「ライブラリ」から「YouTube Data API v3」を有効化
4. 「APIとサービス」>「認証情報」>「認証情報を作成」>「APIキー」
5. 作成されたAPIキーをコピー

#### IGDB (Twitch Developer Portal)

1. [Twitch Developer Portal](https://dev.twitch.tv/console) にアクセス
2. Twitchアカウントでログイン
3. 「アプリケーション」>「アプリケーションを登録」
4. アプリケーション名を入力、カテゴリは「Website Integration」を選択
5. 作成後、Client ID と Client Secret をコピー

#### AWS (Amazon Bedrock)

1. [AWS IAM](https://console.aws.amazon.com/iam/) にアクセス
2. 「ユーザー」>「ユーザーを作成」
3. 「AmazonBedrockFullAccess」ポリシーをアタッチ
4. 「セキュリティ認証情報」タブ >「アクセスキーを作成」
5. Access Key ID と Secret Access Key をコピー
6. Bedrock コンソールで Claude モデルへのアクセスをリクエスト

#### Cloudflare Pages

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にアクセス
2. アカウントIDは右サイドバーに表示されています
3. 「Workers & Pages」>「Create」>「Pages」でプロジェクト作成
   - プロジェクト名: `game-wire`
   - 「Direct Upload」を選択（GitHub Actionsからデプロイするため）
4. APIトークン作成:
   - 「My Profile」>「API Tokens」>「Create Token」
   - 「Edit Cloudflare Workers」テンプレートを使用
   - または「Custom token」で以下の権限を付与:
     - Account > Cloudflare Pages > Edit
     - Account > Account Settings > Read

### Cloudflare Pages プロジェクト設定

Cloudflare Dashboard で以下を設定:

- **プロジェクト名**: `game-wire`
- **本番ブランチ**: `main`
- **ビルド設定**: GitHub Actionsでビルドするため設定不要

## 自動デプロイ

GitHub Actions により毎週日曜日 AM 9:00 (JST) に自動実行されます。

手動実行する場合:
1. GitHub リポジトリの「Actions」タブを開く
2. 「Weekly Build and Deploy」ワークフローを選択
3. 「Run workflow」をクリック
4. 必要に応じて発行日を指定（空欄で当日）

## 技術スタック

- **フレームワーク**: Astro
- **言語**: TypeScript
- **ホスティング**: Cloudflare Pages
- **CI/CD**: GitHub Actions
- **記事生成AI**: Amazon Bedrock (Claude)

## ライセンス

MIT
