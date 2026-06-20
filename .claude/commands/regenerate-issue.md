---
description: 指定 Vol の記事を再生成する（history.json から該当エントリ削除 → issue ファイル削除 → PR → マージ後 workflow_dispatch）
argument-hint: <vol番号(例:012)> <publish_date(例:2026-06-19)>
---

# 記事再生成コマンド

引数:
- `$1` = Vol 番号（ゼロパディング3桁、例: `012`）
- `$2` = publish_date（`YYYY-MM-DD` 形式、例: `2026-06-19`）

引数が不足している場合は実行を中断し、ユーザーに確認すること。

## 厳守事項

過去に history.json 破損で全履歴消失の事故が発生している。以下を**必ず**遵守:

- `history.json` 編集後は **`jq empty` でバリデーション必須**。エラーが出たら commit しない
- `workflow_dispatch` 実行後、**CI 完了まで一切 push しない**（CI の git push と競合し履歴が壊れる）
- ローカルで `npm run build-issue` して直接 push してはならない（Cloudflare Pages にデプロイされない）
- main への直接コミット・プッシュは禁止。必ずブランチを切って PR 経由でマージする

## 手順

### 0. 事前同期

```bash
git status            # 未コミット変更がないか確認
git checkout main
git pull origin main
```

未コミットの作業がある場合はユーザーに確認してから進めること。

### 1. 対象の存在確認

```bash
jq ".entries[] | select(.issueNumber==$(echo $1 | sed 's/^0*//'))" src/content/history.json
ls -la src/content/issues/issue-$1.md
```

該当エントリ・ファイルが存在しない場合は中断してユーザーに確認。

### 2. ブランチ作成

```bash
git checkout -b chore/regenerate-vol-$1
```

同名ブランチが既に存在する場合は中断してユーザーに確認すること（前回の作業残骸の可能性があるため、勝手に削除しない）。

### 3. history.json から該当エントリを削除 + バリデーション

```bash
jq ".entries |= map(select(.issueNumber != $(echo $1 | sed 's/^0*//')))" src/content/history.json > src/content/history.json.tmp \
  && mv src/content/history.json.tmp src/content/history.json
jq empty src/content/history.json && echo "OK"   # ★必須
jq '.entries | length' src/content/history.json  # 件数確認
```

`jq empty` が失敗したら commit せず中断する。

### 4. issue ファイルを git rm

```bash
git rm src/content/issues/issue-$1.md
```

### 5. コミット & push & PR 作成

```bash
git add src/content/history.json
git commit -m "$(cat <<'EOF'
chore: Vol.$1 再生成のため記事と履歴を削除

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push -u origin chore/regenerate-vol-$1
gh pr create --title "chore: Vol.$1 再生成のため記事と履歴を削除" --body "$(cat <<'EOF'
## Summary
- Vol.$1 に不備があったため、記事を削除して再生成する
- \`src/content/issues/issue-$1.md\` を削除
- \`src/content/history.json\` から Vol.$1 のエントリを除去

## マージ後の作業
本 PR を main にマージ後、以下で再生成:
\`\`\`bash
gh workflow run weekly-build.yml --field publish_date=$2
\`\`\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`$1` / `$2` はスラッシュコマンドの引数として展開済みの値が入る。

### 6. ユーザーに PR マージを依頼

PR URL を提示し、「マージしたら教えてください」と伝えて待機する。**勝手にマージしない**。

### 7. マージ後: main 同期 → workflow_dispatch

ユーザーから「マージした」と連絡があったら:

```bash
git checkout main
git pull origin main
gh workflow run weekly-build.yml --field publish_date=$2
sleep 3
RUN_ID=$(gh run list --workflow=weekly-build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "RUN_ID=$RUN_ID"
```

`RUN_ID` を控えてユーザーに提示する。

### 8. CI 完了待ち

ユーザーに「CI 完了を確認したら教えてください」と伝えて待機する。**この間 push 禁止**。

ユーザーから連絡があったら状態を確認:

```bash
gh run view "$RUN_ID" --json status,conclusion
```

### 9. CI 成功後: ローカル同期

```bash
git pull origin main
ls -la src/content/issues/issue-$1.md
jq "[.entries[] | select(.issueNumber==$(echo $1 | sed 's/^0*//'))] | length" src/content/history.json
```

ファイルとエントリが復活していることを確認して完了報告。
