# X自動投稿機能 実装方針・引き継ぎドキュメント

対応 Issue: **#74「X自動投稿機能を追加」**

このドキュメントは、別スレッド（別セッション）でも実装を続行できるよう、
Issue #74 の対応方針・背景・確定済みの設計判断・残作業をまとめたもの。
**次回はこのファイルを最初に読み込めば、続きから着手できる。**

---

## 0. Issue #74 の要件（原文要約）

新規記事作成時に X（旧Twitter）自動投稿を行う機能を追加する。

- **投稿方式**: X API で直接投稿
- **投稿タイミング**: 即時ではなくキュー方式
- **投稿文**: まずはテンプレート方式
- **エラー対応**: `retry_count` で再試行管理
- **重複防止**: 記事No. + 日付で制御

その他:
- URL付き投稿文を AI が作成
- AI が作成した投稿文を管理者が確認してから X 自動投稿される
  （ただし運用が回ってきたら**管理者確認不要で自動投稿されるモード**も用意しておく）
- 管理者確認は、専用画面 or Slack で確認／承認する仕組みを検討

---

## 1. 確定した方針（ユーザーとの合意済み）

| 項目 | 決定 | 補足 |
|---|---|---|
| **管理者** | 非エンジニアの運用担当 | GitHub直編集は不可。Slackで完結させる必要がある |
| **承認方式** | **案② Slack + Cloudflare Worker** | スマホのSlackだけで承認/却下できる |
| **Slack環境** | ワークスペースあり・Slack App 作成可 | Interactive Components 利用可 |
| **編集機能** | **初期は承認/却下のみ**（編集モーダルは将来拡張） | 修正は「却下→再生成」で対応 |
| **X API認証** | **OAuth 1.0a (User Context)** | トークン無期限・リフレッシュ不要・バッチ向き |
| **自動投稿モード** | **環境変数 `AUTO_POST` で切替・初期OFF（false）** | judge同様の運用フラグパターンに揃える |
| **キュー実体** | リポジトリ内 `post-queue.json` | 既存 `history.json` と同じ運用パターン |
| **重複防止キー** | `記事No. + 日付` を `id` に | 例: `issue-011-mewgenics-2026-06-13` |

### 承認方式の検討経緯（なぜ案②か）

3案を比較した:

- **案① GitHub Environments 承認ゲート** … 追加インフラゼロで最速だが、承認は可否のみ・
  投稿文編集にはJSON直編集が必要・GitHub操作が前提。→ **管理者が非エンジニアのため不採用**。
- **案② Slack + Cloudflare Worker**（採用） … スマホSlackだけで完結、通知＝確認＝承認が
  一体、将来その場編集も可能。Worker新設の工数はかかるが運用担当のUXが最良。
- **案③ 専用Web管理画面（Pages+Worker+D1）** … 自由度最大だが週1・記事数本の運用には
  オーバースペック。→ 不採用。

> 管理者が「私（エンジニア）」だった場合は案①が最適だったが、
> **非エンジニアの運用担当**と判明したため案②に確定した。この前提が覆ると結論も変わる。

---

## 2. 全体フロー

```
① [GitHub Actions: weekly-build] build-issue 完了
        ↓
② scripts/generate-posts.ts
   - data/generated-articles.json を読む
   - AIが各記事のURL付き投稿文を生成（テンプレ土台＋AI肉付け）
   - post-queue.json に status=pending_review で追加（id重複はスキップ）
   - commit & push
        ↓
③ Slack通知（草稿＋[承認][却下]ボタン）
        ↓ 運用担当がSlackで操作
④ [Cloudflare Worker] Slack署名検証 → 押されたボタンに応じ
   - 承認: GitHub repository_dispatch で投稿ジョブをトリガー
   - 却下: キューを rejected に
        ↓
⑤ [GitHub Actions: post-to-x] scripts/post-to-x.ts
   - approved & 未投稿を抽出 → X API(OAuth 1.0a)で投稿
   - 成功: posted + tweetId / 失敗: retry_count++（上限超で failed）
   - 結果をSlackスレッドに返信
```

`AUTO_POST=true` のときは ③④ をスキップし、②直後に⑤を呼ぶ（初期は false 固定）。

---

## 3. キュースキーマ（`src/content/post-queue.json`）

```json
{
  "version": 1,
  "posts": [
    {
      "id": "issue-011-mewgenics-2026-06-13",
      "issueNumber": 11,
      "articleSlug": "mewgenics",
      "publishDate": "2026-06-13",
      "text": "【新作】Mewgenics が登場！…\n▶ https://gamewire.example/issues/11 #ゲーム",
      "status": "pending_review",
      "retry_count": 0,
      "maxRetries": 3,
      "tweetId": null,
      "error": null,
      "createdAt": "2026-06-13T06:00:00Z",
      "postedAt": null
    }
  ]
}
```

`status` 遷移: `pending_review → approved → posted` / `rejected` / `failed`

---

## 4. 作るもの一覧

### 新規スクリプト（既存の tsx + Bedrock ラッパー流用）
- `scripts/generate-posts.ts` — 投稿文生成＋キュー追加
- `scripts/post-to-x.ts` — 承認済みをXへ投稿、retry管理
- `scripts/lib/post-queue.ts` — キューの read/modify/write（原子的・JSON妥当性検証）
- `scripts/lib/x-client.ts` — OAuth 1.0a 署名 + `POST /2/tweets`
- `scripts/lib/slack-notify.ts` — 草稿通知（Block Kit）

### 新規データ
- `src/content/post-queue.json` / `src/content/post-queue-dev.json`

### 新規インフラ
- **Cloudflare Worker** — Slack Interactivity の受け口・署名検証・`repository_dispatch` 発火
- **Slack App** — Interactive Components 有効化、Worker URL 登録

### 既存改修
- `.github/workflows/weekly-build.yml` — build-issue 後に generate-posts → Slack通知を追加
- `.github/workflows/post-to-x.yml`（新規）— `repository_dispatch` で起動する投稿ジョブ
- `package.json` — `generate-posts` / `post-to-x` script 追加

### 新Secrets（GitHub Secrets / Cloudflare）
- X: `X_API_KEY` `X_API_SECRET` `X_ACCESS_TOKEN` `X_ACCESS_TOKEN_SECRET`
- Slack: `SLACK_WEBHOOK_URL`（通知用）, `SLACK_SIGNING_SECRET`（Worker署名検証用）
- Worker→GitHub: `GH_DISPATCH_TOKEN`（repository_dispatch 用 PAT）
- 切替: `AUTO_POST`（初期 false）

---

## 5. 重要な設計上の注意

1. **キューファイルの破損対策**（過去に `history.json` の破損・履歴消失の前例あり）
   - read→modify→write を原子的に。commit前に JSON 妥当性検証必須（`jq empty` 相当）。
   - **CI完了前の push 禁止**（メモリの「記事再作成手順」の教訓に従う）。
2. **DEV_MODE**: `post-queue-dev.json` に分岐。
   - dev は **ドライラン（X投稿せずログ出力のみ）をデフォルト**にし、本番アカウントへの誤投稿を防止。
   - 既存スクリプト同様 `const DEV_MODE = process.env.DEV_MODE === 'true'` で判定。
3. **投稿文バリデーション**: 140字 / t.co（URL=23字固定）/ ハッシュタグを考慮して生成後に検証。
4. **却下→再生成**: 編集機能を作らない代わり、却下時は次回 generate-posts で同 id を作り直せる導線を用意。
5. **Worker は承認の受け口のみ**に限定（状態の正は post-queue.json）。Workerに状態を持たせない＝保守軽量化。

---

## 6. 段階リリース（PR分割案）

Issue のスコープが大きいので3分割で進める。**Issue対応ワークフロー厳守**（後述）。

- **PR-1**: キュー基盤 + 投稿文生成
  - `generate-posts.ts` / `lib/post-queue.ts` / スキーマ / テスト
  - この段階ではまだXに投稿しない
- **PR-2**: X投稿ジョブ
  - `post-to-x.ts` / `lib/x-client.ts` / OAuth1.0a / retry / dryrun
  - 手動承認（手で status を approved にして）で検証
- **PR-3**: Slack通知 + Worker承認連携
  - `lib/slack-notify.ts` / Cloudflare Worker / repository_dispatch / Slack App設定

**→ 次回はまず PR-1 から着手する。**

---

## 7. 既存コードベースの関連ポイント（調査済み）

実装時に参照すべき既存実装。

### スクリプト構成とフロー
- `scripts/fetch-data.ts` — データ取得 → `data/selected-games.json`
- `scripts/generate-articles.ts` — Claude/Bedrockで記事生成 → `data/generated-articles.json`
- `scripts/build-issue.ts` — Markdown化・号採番 → `src/content/issues/issue-NNN.md`
  - L424 で issueファイル書き込み、L442-461 で history.json更新、L484 で完了ログ
- npm scripts（`package.json` L6-18）:
  - `build-issue`: `fetch-data && generate && build-issue.ts`
  - `build-issue:dev`: 各ステップに `DEV_MODE=true` を付与

### 投稿文の素材（`data/generated-articles.json`）
各記事は以下を持つ（`GeneratedArticle` interface, generate-articles.ts L1-143）:
- `title` / `category`(newRelease|indie|feature|classic) / `summary`(120字以内) / `content`(Markdown)
- `game`: タイトル・日本語名・ジャンル・プラットフォーム・発売日・開発元など
- `sourceUrls`: `steam` / `igdb` / `metacritic` / `official`(日本語公式) など ← **投稿URLに使える**
- `webSearchSources`: Tavily検索結果（根拠リンク）

### 号URLの組み立て
- Astro サイト上の号ページURL。`issueNumber` から組み立てる（例: `/issues/{issueNumber}` 系。実URLパターンは `src/pages/` を要確認）。

### Bedrock呼び出しラッパー（`scripts/bedrock-client.ts`）
- `initializeBedrockClient()`（L19-36）/ `invokeClaudeModel(systemPrompt, userMessage, {maxTokens, temperature})`（L40-82）
- `ConverseCommand` 使用、modelId は `process.env.BEDROCK_MODEL_ID`
- **投稿文生成もこのラッパーをそのまま再利用する**

### 履歴・重複防止の既存パターン（`scripts/lib/game-history.ts`）
- 本番 `src/content/history.json` / 開発 `src/content/history-dev.json`（L10-15でDEV_MODE分岐）
- `HistoryEntry`: normalizedTitle / title / category / issueNumber / publishDate
- **post-queue.json もこの分岐パターンに完全に倣う**

### GitHub Actions（`.github/workflows/weekly-build.yml`）
- トリガー: `cron: '0 21 * * 5'`（毎週土6:00 JST）+ `workflow_dispatch`(publish_date入力可)
- Step順: checkout → setup-node → npm ci → fetch-data → generate → build-issue
  → validation summary → `jq empty history.json` 検証 → commit&push → astro build → wrangler deploy
- env で各Secretsを注入（YOUTUBE/IGDB/AWS/TAVILY/BEDROCK/CLOUDFLARE/GITHUB_TOKEN）
- **generate-posts はこのワークフローの build-issue 後に挿入。post-to-x は別ワークフロー（repository_dispatch起動）にする**

### Slack連携の現状
- **既存のSlack/Webhook/通知連携は無い**。今回新規に作る。

---

## 8. 厳守すべきプロジェクトルール（実装前に必読）

### Issue対応ワークフロー（main直コミット禁止）
1. ブランチ作成: `git checkout -b feat/issue-74-x-auto-post`（PRごとに `-pr1` 等で細分化可）
2. ブランチ上で実装・動作確認
3. コミット
4. PR作成: `gh pr create --title "..." --body "Closes #74"`（PR分割時は最終PRで Closes、途中は参照に留める）

### DEV_MODE 運用ルール（メモリより）
- ローカル検証は必ず `DEV_MODE=true`（`npm run build-issue:dev` 等）
- 本番ディレクトリ（`issues/`, `features/`, `history.json`）に直接書き込まない
- 本機能では `post-queue-dev.json` を使い、X投稿はドライランで検証

### テストコード品質（グローバルCLAUDE.mdより）
- 意味のないアサーション禁止。具体的な入力と期待出力を検証。
- テストを通すためだけのハードコード・本番コードへの testMode 分岐禁止。
- 境界値・異常系・エラーケースもtestする（投稿文の文字数超過、X API失敗→retry、重複id等）。

### コスト注意
- 投稿文生成でBedrock呼び出しが増える（記事数分）。judge同様コスト発生に留意。

---

## 9. 次回セッションでの開始手順

1. このファイル（`docs/x-auto-post-plan.md`）を読む。
2. `git log`・現状の `scripts/`・`.github/workflows/weekly-build.yml` を確認し、本ドキュメントとの差分がないかチェック。
3. **PR-1 のブランチを切って**着手:
   `git checkout -b feat/issue-74-post-queue`
4. `scripts/lib/post-queue.ts` とスキーマ → `scripts/generate-posts.ts` → テスト の順で実装。
5. 完了したら PR 作成（本文に `Refs #74`、最終 PR-3 で `Closes #74`）。

---

## 10. 未確定・将来検討事項

- Slackでの**投稿文編集モーダル**（初期は見送り、運用が回ったら追加）
- 1記事1ツイートか / 号まとめて1ツイートか / スレッド形式か（投稿文生成の単位は実装時に要確定）
- 投稿スケジュール（号公開と同時か、時間をずらすか）
- `AUTO_POST=true` への切替判断基準（どのくらい運用が安定したら）
- 画像付き投稿（X media upload）の要否 — 初期はテキスト+URLのみ想定
