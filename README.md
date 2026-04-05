# Game Wire

AIを活用した週刊ゲーム情報雑誌の自動生成システム

毎週土曜日に自動発行されるゲーム情報Webマガジン。Steam Charts、YouTube Data API、IGDB、Metacriticから情報を収集し、Amazon Bedrock経由のClaudeで記事を生成します。

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

# Tavily API (Web検索による記事品質向上)
TAVILY_API_KEY=your_tavily_api_key
```

## 開発

### コマンド一覧

```bash
# 開発サーバー起動
npm run dev

# データ取得（Steam, YouTube, IGDB, Metacritic）
npm run fetch-data

# 記事生成（Bedrock Claude）
npm run generate

# 号の生成（一括実行: fetch → generate → build-issue）
npm run build-issue

# ビルド
npm run build
```

### 開発時の操作手順

ターミナルを2つ開いて作業します。

**ターミナル1: 開発サーバー**
```bash
npm run dev
# → http://localhost:4321 でサイトが表示される
```

**ターミナル2: データ取得・記事生成**
```bash
# 1. データ取得
npm run fetch-data

# 2. 記事生成
npm run generate

# 3. ブラウザをリロードして結果を確認
```

または一括実行:
```bash
npm run build-issue
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
| `TAVILY_API_KEY` | Tavily API キー（Web検索） | [Tavily](https://tavily.com/) |

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

#### Tavily API（Web検索）

Tavily は LLM 向けに最適化された Web 検索 API です。記事生成時にレビュー記事や開発者インタビューなどを検索し、記事品質を向上させます。

1. [Tavily](https://tavily.com/) にアクセス
2. 「Get API Key」からアカウント作成
3. ダッシュボードで API キーをコピー

**料金プラン:**
- Free: 1,000 クエリ/月（開発・テスト用）
- Hobby: $20/月、10,000 クエリ
- Pro: カスタム

> **Note:** Tavily API キーが設定されていない場合でも、記事生成は動作します（Web 検索なしで生成）。

### Cloudflare Pages プロジェクト設定

Cloudflare Dashboard で以下を設定:

- **プロジェクト名**: `game-wire`
- **本番ブランチ**: `main`
- **ビルド設定**: GitHub Actionsでビルドするため設定不要

## 自動デプロイ

GitHub Actions により毎週土曜日 AM 6:00 (JST) に自動実行されます。

手動実行する場合:
1. GitHub リポジトリの「Actions」タブを開く
2. 「Weekly Build and Deploy」ワークフローを選択
3. 「Run workflow」をクリック
4. 必要に応じて発行日を指定（空欄で当日）

## 問題記事の非表示対応

記事が公開された後に問題（成人向けコンテンツ等）が発覚した場合、以下の手順でサイトから非表示にできます。

### 手順

**1. 対象記事のファイルを特定する**

バックナンバーの号番号を確認し、該当ファイルを開きます。
```
src/content/issues/issue-XXX.md   （XXX は号番号）
```

**2. `hidden: true` を追加する**

対象記事の frontmatter に `hidden: true` を追加します。

```yaml
articles:
  - title: "問題のある記事タイトル"
    category: indie
    summary: "..."
    hidden: true      # ← この行を追加
    game:
      ...
```

**3. deploy-only workflow を手動実行する**

記事の再生成は不要です。GitHub Actions の deploy-only workflow を実行するだけでサイトが更新されます。

1. GitHub リポジトリの「Actions」タブを開く
2. 「Deploy Only (No Article Generation)」ワークフローを選択
3. 「Run workflow」をクリック
4. 数分後にデプロイ完了 → サイトから記事が非表示になる

### 非表示になる箇所

- トップページの記事一覧
- バックナンバー詳細ページの記事一覧
- バックナンバー一覧ページの記事数カウント・カバー画像
- 記事詳細ページ（URL 直接アクセスも 404 になる）

---

## 技術スタック

- **フレームワーク**: Astro
- **言語**: TypeScript
- **ホスティング**: Cloudflare Pages
- **CI/CD**: GitHub Actions
- **記事生成AI**: Amazon Bedrock (Claude)

## ライセンス

MIT
