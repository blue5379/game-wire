# 記事再生成コマンド

引数（`$ARGUMENTS` として渡される）:
- 第1引数 = Vol 番号（ゼロパディング3桁、例: `012`）→ 以降 `VOL` と表記
- 第2引数 = publish_date（`YYYY-MM-DD` 形式、例: `2026-06-19`）→ 以降 `PUBLISH_DATE` と表記

`$ARGUMENTS` を空白で分割して `VOL` と `PUBLISH_DATE` を取得する。引数が不足している場合は実行を中断し、ユーザーに確認すること。

## 実行方針

**このスキルは確立済みの手順であり、ユーザーへの確認なしに最後まで自律実行する。** 中断してユーザーに確認するのは以下の場合のみ:

- 引数が不足している
- 対象エントリ・ファイルが存在しない（手順 1）
- `data/` 以外に未コミット変更がある（手順 0）
- 同名ブランチが未マージで存在する（手順 2）
- `jq empty` バリデーションが失敗した（手順 3）

## 既知の仕様（問題なし）

- **history-dev.json は更新しない**: 本番 (`history.json`) と開発環境 (`history-dev.json`) のゲーム選定結果は異なる前提のため、`history-dev.json` から対象 Vol のエントリを削除する必要はない
- **issueNumber と publish_date のひも付きは厳密でない**: `workflow_dispatch` を忘れて次週の定期ビルドが issueNumber を再取得しても、号数と日付の対応がずれることは許容範囲。発生してもこのスキルを再実行すれば修復できる

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

未コミットの作業がある場合はユーザーに確認してから進めること。ただし `data/` 以下のファイル（`data/aggregated.json`, `data/generated-articles.json`, `data/selected-games.json` など）の未コミット変更は無視して続行してよい。

### 1. 対象の存在確認

```bash
jq ".entries[] | select(.issueNumber==$(echo $VOL | sed 's/^0*//'))" src/content/history.json
ls -la src/content/issues/issue-$VOL.md
```

該当エントリ・ファイルが存在しない場合は中断してユーザーに確認。

### 2. ブランチ作成

同名ブランチが既に存在する場合、main にマージ済みかどうかで分岐する:

```bash
if git branch --merged main | grep -q "chore/regenerate-vol-$VOL"; then
  git branch -d chore/regenerate-vol-$VOL  # マージ済み残骸 → 確認なしで削除
  git checkout -b chore/regenerate-vol-$VOL
else
  git checkout -b chore/regenerate-vol-$VOL  # 存在しない場合もここに来る
fi
```

ブランチが存在し、かつ未マージの場合のみ中断してユーザーに確認すること（作業中の可能性があるため、勝手に削除しない）。

### 3. history.json から該当エントリを削除 + バリデーション

```bash
jq ".entries |= map(select(.issueNumber != $(echo $VOL | sed 's/^0*//')))" src/content/history.json > src/content/history.json.tmp \
  && mv src/content/history.json.tmp src/content/history.json
jq empty src/content/history.json && echo "OK"   # ★必須
jq '.entries | length' src/content/history.json  # 件数確認
```

`jq empty` が失敗したら commit せず中断する。

### 4. issue ファイルと関連画像を git rm

```bash
git rm src/content/issues/issue-$VOL.md
```

対象号の `featureImage` が `public/images/features/` 配下のローカル画像を指している場合（IGDB 等の外部URLではなく `/images/features/feature-*` 形式のパスの場合）、そのファイルも削除する。再生成後は新しいタイムスタンプで別ファイルとして再生成されるため、削除しないと古い画像がゴミとして残る:

```bash
FEATURE_IMAGE=$(git show HEAD:src/content/issues/issue-$VOL.md | grep -o 'featureImage: *"/images/features/[^"]*"' | sed 's/.*"\(\/images.*\)"/\1/')
if [ -n "$FEATURE_IMAGE" ]; then
  git rm "public${FEATURE_IMAGE}"
fi
```

削除対象が見つからない・パスが特定できない場合はスキップしてよい（featureImage を持たない号もあるため）。

### 5. コミット & push & PR 作成

```bash
git add src/content/history.json
git commit -m "$(cat <<'EOF'
chore: Vol.$VOL 再生成のため記事と履歴を削除

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
EOF
)"
git push -u origin chore/regenerate-vol-$VOL
gh pr create --title "chore: Vol.$VOL 再生成のため記事と履歴を削除" --body "$(cat <<'EOF'
## Summary
- Vol.$VOL に不備があったため、記事を削除して再生成する
- \`src/content/issues/issue-$VOL.md\` を削除
- \`src/content/history.json\` から Vol.$VOL のエントリを除去
- featureImage が存在する場合は \`public/images/features/\` の該当画像も削除

## マージ後の作業
本 PR を main にマージ後、以下で再生成:
\`\`\`bash
gh workflow run weekly-build.yml --field publish_date=$PUBLISH_DATE
\`\`\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 6. PR マージ

このスキルは記事ファイルと history.json エントリの削除のみを行う確立済みの手順であるため、**`/code-review` は実行しない**。そのまま `gh pr merge <PR番号> --merge` でマージする。ユーザーへの確認は不要。

### 7. マージ後: main 同期 → workflow_dispatch

```bash
git checkout main
git pull origin main
gh workflow run weekly-build.yml --field publish_date=$PUBLISH_DATE
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
ls -la src/content/issues/issue-$VOL.md
jq "[.entries[] | select(.issueNumber==$(echo $VOL | sed 's/^0*//'))] | length" src/content/history.json
```

ファイルとエントリが復活していることを確認して完了報告。
