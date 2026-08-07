# 記事削除コマンド

過去に本番環境で公開された号を、なんらかの理由で削除するためのコマンド。**再生成は行わない**（再生成が必要な場合は `/regenerate-issue` を使うこと）。

引数（`$ARGUMENTS` として渡される）:
- 第1引数 = Vol 番号（ゼロパディング3桁、例: `012`）→ 以降 `VOL` と表記

`$ARGUMENTS` を空白で分割して `VOL` を取得する。引数が不足している場合は実行を中断し、ユーザーに確認すること。

## 実行方針

このコマンドは PR 作成まで自律実行してよいが、**PR のマージはユーザーが行う**（`/regenerate-issue` と異なり、削除には再生成のような回復手段がないため、マージ前にユーザーの目視確認を挟む）。中断してユーザーに確認するのは以下の場合のみ:

- 引数が不足している
- 対象エントリ・ファイルが存在しない（手順 1）
- `data/` 以外に未コミット変更がある（手順 0）
- 同名ブランチが未マージで存在する（手順 2）
- `jq empty` バリデーションが失敗した（手順 3）

## 既知の仕様（問題なし）

- **history-dev.json は更新しない**: 本番 (`history.json`) と開発環境 (`history-dev.json`) のゲーム選定結果は異なる前提のため、`history-dev.json` から対象 Vol のエントリを削除する必要はない

## 厳守事項

過去に history.json 破損で全履歴消失の事故が発生している。以下を**必ず**遵守:

- `history.json` 編集後は **`jq empty` でバリデーション必須**。エラーが出たら commit しない
- main への直接コミット・プッシュは禁止。必ずブランチを切って PR 経由でマージする
- **PR のマージはユーザーが行う**。このコマンドは PR 作成までで完了とし、自動マージしない

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
if git branch --merged main | grep -q "chore/delete-vol-$VOL"; then
  git branch -d chore/delete-vol-$VOL  # マージ済み残骸 → 確認なしで削除
  git checkout -b chore/delete-vol-$VOL
else
  git checkout -b chore/delete-vol-$VOL  # 存在しない場合もここに来る
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

対象号の `featureImage` が `public/images/features/` 配下のローカル画像を指している場合（IGDB 等の外部URLではなく `/images/features/feature-*` 形式のパスの場合）、そのファイルも削除する:

```bash
FEATURE_IMAGE=$(grep -o 'featureImage: *"/images/features/[^"]*"' src/content/issues/issue-$VOL.md.orig 2>/dev/null || git show HEAD:src/content/issues/issue-$VOL.md | grep -o 'featureImage: *"/images/features/[^"]*"' | sed 's/.*"\(\/images.*\)"/\1/')
if [ -n "$FEATURE_IMAGE" ]; then
  git rm "public${FEATURE_IMAGE#/images}" 2>/dev/null || git rm "public${FEATURE_IMAGE}"
fi
```

削除対象が見つからない・パスが特定できない場合はスキップしてよい（featureImage を持たない号もあるため）。

### 5. コミット & push & PR 作成

```bash
git add src/content/history.json
git commit -m "$(cat <<'EOF'
chore: Vol.$VOL の記事と履歴を削除

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
EOF
)"
git push -u origin chore/delete-vol-$VOL
gh pr create --title "chore: Vol.$VOL の記事と履歴を削除" --body "$(cat <<'EOF'
## Summary
- Vol.$VOL を削除する（再生成は行わない）
- \`src/content/issues/issue-$VOL.md\` を削除
- \`src/content/history.json\` から Vol.$VOL のエントリを除去
- featureImage が存在する場合は \`public/images/features/\` の該当画像も削除

## 削除理由
（ユーザーに削除理由を確認し、ここに記載する）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 6. 完了報告

PR の URL をユーザーに提示し、**マージはユーザー自身が行うこと**を伝えて終了する。マージ後の `git checkout main && git pull` は CLAUDE.md のグローバル指示に従って案内する。
