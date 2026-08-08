# 記事カテゴリ仕様の抜本見直し — 検討資料と素案

作成日: 2026-07-26
作成者: Claude (Opus 5)
契機: vol.17 で「新作紹介」が 0 件になった障害（Issue #206 と併発）の原因調査。
      調査の結果、問題は新作枠単独ではなく **4 カテゴリのうち 3 カテゴリが当初の編集意図から乖離している**ことが判明したため、
      個別バグ修正ではなくカテゴリ仕様そのものの再定義として扱う。

最終更新: 2026-08-06（**論点J-1 の決着**＝新作紹介のリメイク・リマスターを **(J-1-c)** に確定。**`game_type = 0, 8, 9` を許可し、`game_type` を `GameData` まで持ち回って【ゲーム情報】欄に提示することで、`newReleaseSystem` に「リメイク／リマスターである旨を明記する」ルールを 1 行足す。Port(11) は除外のまま**。決定的根拠は「**名作枠 J-3 で混線 11 件を生んだ構造が新作枠には存在しない**」こと＝新作枠の窓は 60 日なので原作とリメイクが同一プールに入り得ず、`parent_game` 参照も `HistoryEntry` 拡張も不要で `[0,8,9]` の単純許可でよい。(J-1-a) 許可するだけを棄却したのは、既存禁止リストの「続編・関連作・DLC・コラボの存在」（`bedrock-client.ts:162`）により **`Star Fox`(2026, t8) が完全新作として書かれ、しかも judge もバリデータも検出できない**ため。逆にその禁止リストは「提供データに明示的に書かれていない限り」が前提なので、**種別を提供データに載せれば禁止リストを緩めずに**明記できる。実装は PR-B に含める（`IGDB_GAME_FIELDS` / `IGDBGame` / `GameData` / `buildUserMessage` の同一 4 箇所を触る）。**未測定**: 該当 3 件が `agg_count >= 2` を通るか / 60 日窓での実際の増分 / 種別提示時の出力品質。§7 論点J-1 / §5.2【A】/ §7 論点J 冒頭の状態表・枠別サマリ / §9 を更新）

過去の更新:
- 2026-08-06（**論点H の決着 ＝ §7 の全論点が決着した**。供給不足時の挙動を **(e)** に確定。**公開は止めず、生成層の「不足でも発行する」挙動（Issue #179 の設計原則）は変えない。変えるのは検証層で、`validate-article.ts` に本数不足の警告タイプを追加し `format-validation-report.ts` の `computeReportStatus()` に算入して `status: error` → Issue 自動起票（Issue #202 で実装済みの経路）に乗せる。あわせて `launch.astro` の「毎号6本」3 箇所を実態に合う表現に直す**。決定的事実は「`totalArticles` はレポートに記録されているが `computeReportStatus()` の判定入力に入っていない」こと＝**本数不足は号のステータスにも Issue 起票にも Actions サマリにも一切反映されない**。vol.17 が Issue 起票されたのは HIGH 警告 3 件が理由で、新作 0 本は理由ではなかった。実測で期待 6 本を満たしたのは **14/17 号**で、欠けたのは newRelease 2 号（015=1本 / 017=0本）と **classic 1 号（013=0本。本調査で初めて判明し、原因は不明）**。(b) 他カテゴリで埋める案は §5.1 のカテゴリ構成と衝突、(c) 条件緩和は N-6 / PR-B と二重、(d) ビルド失敗は Issue #179 の原則を覆すため棄却。§6.4 / §7 論点H / §9 / §11.5 を更新。**残る⏸保留は §11.3.6 と §11.3.7 の 2 件のみ**）
- 2026-08-05（**論点F の決着**＝特集テーマを **(F-2')** に確定。**暦イベント（`data/japanese-events.json`）を主軸に維持し、イベント 0 件の週だけ「発行日から後方向（過去）に最大 7 日遡って直近の記念日」を採用する。IGDB の構造化テーマ（`themes` / `game_modes`）は使わない**。検討途中で (F-2)（0 件週に構造化テーマをフォールバック）で決着しかけたが、**ユーザー判断により変更した**（「設計されている記念日から離れすぎるのは意図に合わないため、直近のイベントに限定したい」）。前提として、暦イベント起点は**壊れていない**（14/17 号で特集タイトルがイベント名に紐づく）。壊れているのは 0 件週で、2026 年は**52 週中 5 週**、実 17 号では vol.2 と vol.8 の 2 号が該当し、この 2 号は**他号との特集ゲーム重複率が 50%（イベントあり号は 10%）**だった。設計を決めたのは「**窓に入った ≠ テーマとして使った**」という区別で、窓に入った 40 種のうち実際に使われたのは 14 種にすぎないため、除外を「実際に使った記念日」に限れば **-1日 駅弁の日 / -5日 世界電気通信の日**が採用できる（「直前号の窓に入った」まで除外すると -8〜-12 日に後退する）。窓そのものを常時広げる案は隣接週の重複が **1/51 → 38/51** に激増するため棄却。§7 論点F / §9 / §11.5 を更新）
- 2026-08-04（**論点G の決着**＝名作枠の 📜ゲームの歴史 セクションを (G-4) に確定。**セクションは維持し、①`classicSystem` の禁止リストから重複項目 `:342`「発売当時の業界状況・与えた影響の具体記述の禁止」を削除して 📜 の指示を「材料が無ければ省略」に強める ②`fetch-web-search.ts` のプロンプト抜粋を `slice(0, 300)` → `slice(0, SNIPPET_MAX_LENGTH)`(1500) に統一 ③クエリに発売年を追加**。決定的根拠は「律速が検索ではなく抜粋長だった」こと＝**専用ページは 11/16 で引けているのに使える 300 字は 7/16** で、差の 8 件は Wikipedia を引けているのに先頭 300 字が受賞リストや序文で埋まっていた。あわせて**プロンプト 300 字 vs バリデータ 1500 字の非対称**を発見（LLM が見ていない定量値 31 個をバリデータが「根拠あり」と判定して警告を抑制する。プロンプト内は 10 個）。出力側の実測では 📜 は 16/17 号で書かれており、**クリーンなのは 7/16 号のみ**。§7 論点G / §5.2 プロンプト方針 / §9 / §11.5 を更新。**受賞歴・順位・裸の人名を検出するバリデータが存在しない**ことを別課題として切り出した）
- 2026-08-04（**論点D の決着**＝`metascore` / OpenCritic を (D-1') に確定。**取得経路・型・選定条件・プロンプト参照・バリデータ参照を削除し、表示層 5 ファイルと `content.config.ts` は過去号互換のため残す**。決定的事実として、**`metascore` は全 17 号で 1 件も取得できていなかった**（`fetch-metacritic.ts` は OpenCritic API を叩く実装で `OPENCRITIC_API_KEY` 必須だが、キーは `.env.local`・GitHub Actions・リポジトリのいずれにも存在しない）。したがって §4.6 の「`aggregated_rating` への置き換え」という枠組みは前提が誤りで、**置き換える対象が存在しなかった**。§7 論点D / §4.6 / §9 / §11.5 を更新。副産物として `issue-002.md:11`「Metacriticで89点」が数値ハルシネーションである可能性を記録）
- 2026-08-04（**論点I の決着**＝移行時の履歴の扱いを (I-1) に確定。**`history.json` には一切手を加えない（移行作業ゼロ）**。当初「誤選定作がロックされるだけで実害は小さい」としていた前提は実測で誤りと判明し、実際にブロックされるのは `Red Dead Redemption 2`（新母集団 5 位）など**既に掲載済みの正当な名作 6 件のみ＝仕様どおりの動作**だった。削除案 (I-2) は対象 10 件が新母集団に含まれないため効果ゼロ、全削除案 (I-4) は RDR2 が vol.2 と重複する。§7 論点I / §3.3 / §9 / §11.5 を更新。**§3.3 に履歴すり抜けの実データ 3 経路を追記**（日本語タイトル 20/105 件・`Subnautica 2` vs `サブノーティカ２` の実害 / カテゴリ横断重複 6 件 / 版名サフィックス））
- 2026-08-03（**論点J-3 の決着**＝名作枠のリメイク・リマスターを (J-3-e) に確定。`game_type = 0` に加え「`parent_game` が `game_type=0` プールに不在の `t8`/`t9`」のみ許可する。母集団 266 件・**混線 0 件**・`HistoryEntry` 拡張と 105 件の履歴移行は不要。決定的根拠は「落ちるリメイク 22 件のうち 11 件は原作もプール外」（`Resident Evil` / `Half-Life` / `FF VII` が名作枠に一度も登場できなくなる）。§7 論点J-3 / §5.2 名作枠の表 / §7 論点B の副作用節 / §9 / §11.5 を更新。**前セッションの 2 つの誤報告を訂正**（FF VII Remake は `t8` で `t0` ではない / 「原作側で拾える」は半分しか成り立たない））
- 2026-08-01（**論点 N-5 の決着**＝未発売記事の情報ソースと構成を確定。①インディー枠は発売済み限定 ②6 セクション維持（🔥なぜ注目されているか）③Tavily は `searchReviews` を外し OR なしの新規クエリを追加 ④評価断定バリデータを high で追加 ⑤judge は user メッセージに 1 行追記。`VALIDATION_AUTO_REGENERATE` と high 警告の重大性再定義は**保留**。§11.3.1〜11.3.7 を追加し、§7 論点C / §9 / §11.1（確定事項 #17〜#21）/ §11.4 の状況表 / §11.5 を更新）
- 2026-08-01（**論点 N-6 の決着**＝発売済み側のソート軸を「4 軸を絶対尺度で 0〜100 に写した重み付き最大値」に確定。第 4 軸として国内販売（ファミ通経由 Amazon ランキング）を追加。§11.4.5〜11.4.11 を追加。パラメータの運用後再調整は Issue #210）
- 2026-07-30（**論点 I-1 の決着**＝インディー枠の規模判定を「`developed` 生件数 + `> 20`」に確定。§11.4.1〜11.4.4 を追加し、§4.1.5 / §5.2 / §6.3 / §7 論点E / §9 / §11.1 を更新）

**このドキュメントの位置づけ**: 議論のための検討資料であり、確定仕様書ではない。
合意後に本ドキュメントを仕様書として確定させ、実装に着手する。

**表記ルール**: 本ドキュメントでは確認済み事実と推論を区別する。
- 「〜である」= コード・API 実行結果・実データで確認済み
- 「〜と考えられる」「〜の可能性がある」= 推論
- 「不明」= 確認手段がない、または未確認

---

## 0. 読む順序（セッションを跨いで作業する人向け）

議論が複数セッションに分かれたため、**節番号順に読むと古い情報から入ることになる**。以下の順で読むこと。

| 目的 | 読む節 |
|---|---|
| **いま何が決まっていて、次に何を決めるのか** | **§11**（2026-07-29 / 07-30 / 08-01 の議論結果。これが最新） |
| 指標フィールド（`hypes`, `aggregated_rating`, `developed` 等）の定義と使い分け | **§4.1**（用語集。§11 の前提知識） |
| なぜ現状が壊れているのか（背景） | §1〜§3 |
| カテゴリの編集意図の素案 | §5 |
| 論点の初期整理（一部は §11 で決着済み） | §7（冒頭に決着状況の対応表あり） |
| 単独で修正できるバグ | §8（**§8.1 の Steam 経路 DLC 混入は新規発見・未修正**） |
| 次のアクション | §9 |
| 済んだ修正の記録 | §10（PR #209） |

**議論の対象範囲**: §11 の議論は **新作紹介（newRelease）・インディー（indie）** の 2 カテゴリのみを対象とした。名作深掘り（classic）・特集（feature）は未着手である。

---

## 1. 現状のカテゴリ構成と乖離の全体像

雑誌 1 号は 4 カテゴリ・計 6 本で構成される（CLAUDE.md 記載）。

| カテゴリ | 本数 | `要件.md` の記述（原典の意図） | 実装されているプロンプトの前提 | 実際の出力 |
|---|---|---|---|---|
| 新作紹介 (`newRelease`) | 2 | 大手企業の**もうすぐ発売**／発売されたばかりのゲーム | 「大手ゲーム企業の新作」 | **発売済みのみ**。未発売作は構造的に採用不可。vol.17 は 0 件 |
| インディーゲーム (`indie`) | 2 | 最近話題、とても評価が高い（インディーゲーム） | 「個人や小規模チームの作品への敬意を示す」 | Nihon Falcom / Cygames / Neowiz / Studio Wildcard などが混入 |
| 特集 (`feature`) | 1 | 発行日に近い日のイベント（周年・季節）の特集記事 | テーマに沿った複数ゲーム紹介 | **意図どおり機能している** |
| 名作深掘り (`classic`) | 1 | **世界的に評価の高い**ゲーム、なぜ評価が高いのかを深掘り | 「過去の名作」「発売当時」「懐かしさ」 | vol.12 以降 **6 号連続で 2026 年の新作** |

### 1.1 実出力の実測（vol.12〜17、`src/content/issues/` の frontmatter より）

```
vol.12  newRelease×2, indie×2, feature, classic   classic = Dungeon Blitz R (2026-04-06)
vol.13  newRelease×2, indie×2, feature            classic 欠落。indie = DJMAX RESPECT V (Neowiz), 空の軌跡 the 1st (Nihon Falcom)
vol.14  newRelease×2, indie×2, feature, classic   indie = ARK の DLC 2 本 (Studio Wildcard)。classic = Subnautica 2 (2026-05-14)
vol.15  newRelease×1, indie×2, feature, classic   indie = Palworld (PocketPair), GRANBLUE Relink DLC (Cygames)
vol.16  newRelease×2, indie×2, feature, classic   classic = MOLE (2026-06-15)
vol.17  newRelease×0, indie×2, feature, classic   classic = Pokémon Infinite Fusion (2026-07-10)
```

### 1.2 名作深掘り枠の変遷（全 17 号、`classic` 記事の対象ゲーム発売年）

```
vol.1  Dig Island            2026-01-30   ← 初号から既にブレ
vol.2  Red Dead Redemption 2 2018-10-26   ← 意図どおり
vol.4  Star Citizen          2013-08-30
vol.5  The Last of Us Part II 2020-06-19  ← 意図どおり
vol.7  Stardew Valley        2016-02-26   ← 意図どおり
vol.9  Cyberpunk 2077        2020-12-10
vol.12 Dungeon Blitz R       2026-04-06   ← 以降すべて 2026 年発売
vol.14 Subnautica 2          2026-05-14
vol.16 MOLE                  2026-06-15
vol.17 Pokémon Infinite Fusion 2026-07-10
```

### 1.3 履歴の蓄積状況（`src/content/history.json`、105 件）

| カテゴリ | 累計採用数 | クールダウン |
|---|---|---|
| indie | 34 | 35 週 |
| newRelease | 31 | 17 週 |
| feature | 24 | 17 週 |
| classic | 16 | 52 週 |

launch は 2026-04-04（vol.1）。**newRelease のクールダウンは 1 件も満了していない**（初回満了は 2026-08-01）。

---

## 2. なぜ乖離したか — 共通の構造的原因

3 カテゴリの乖離は、いずれも **「母集団の取得クエリが、そのカテゴリが表現したい概念とは別の指標で切られている」** という同一構造に起因する。

### 2.1 `hypes` の正体（IGDB 公式ドキュメント確認済み）

IGDB API ドキュメント（api-docs.igdb.com, Game エンドポイント）の定義:

> **hypes** — Integer — *Number of follows a game gets before release*

**発売前フォロー数の累計**である。API 実行で確認した性質:

**(a) 発売後は増えない**（IGDB のフォロー機能導入以前の作品は 0）

| ゲーム | 発売日 | user rating | rating_count | hypes |
|---|---|---|---|---|
| Grand Theft Auto V | 2013-09-17 | 90 | 5839 | **0** |
| Portal 2 | 2011-04-18 | 91 | 4412 | **0** |
| Skyrim | 2011-11-10 | 88 | 4277 | **0** |
| Half-Life 2 | 2004-11-16 | 90 | 3395 | **0** |
| The Last of Us | 2013-06-14 | 93 | 3510 | **0** |
| The Witcher 3 | 2015-05-19 | 94 | 5375 | 179 |
| Red Dead Redemption 2 | 2018-10-26 | 93 | 3736 | 257 |

**(b) 上位は未発売作と近年作に偏る**（hypes 降順トップ7）

```
1038  Cyberpunk 2077          2020-12-10  rating_count=1588
 990  Arena Breakout Infinite 2025-09-15  rating_count=146
 964  Grand Theft Auto VI     2026-11-19  rating_count=0   ← 未発売
 594  Star Citizen            2013-08-30  rating_count=87
 492  The Elder Scrolls VI    TBA         rating_count=0   ← 未発売
 429  PUBG: Black Budget      TBA         rating_count=0   ← 未発売
 380  Fable                   2027-02-23  rating_count=0   ← 未発売
```

**(c) `hypes > 100` の母集団内訳（計 109 件）**

| 条件 | 件数 |
|---|---|
| hypes > 100 全体 | 109 |
| うち未発売 | 17 |
| うち発売済み | 80 |
| うち **2024 年以降**発売 | **44** |
| うち 2020 年より前発売 | 20 |

### 2.2 各カテゴリのクエリと乖離の対応

| カテゴリ | 現行クエリ（`scripts/fetch-igdb.ts`） | 乖離のメカニズム |
|---|---|---|
| 新作 | `fetch-igdb.ts:638` `where first_release_date > (90日前) & hypes > 5` / `sort hypes desc` / `limit 20` | **発売日の上限がない**ため未発売作が枠を食う。vol.17 は 20 枠中 15 枠が未発売作 |
| 名作 | `fetch-igdb.ts:733` `where hypes > 100` / `sort hypes desc` / `limit 30` | **発売日条件が一切ない**。母集団 109 件の 56% が 2024 年以降または未発売 |
| インディー | `fetch-igdb.ts:832` `where first_release_date > (90日前) & rating_count > 5` / `sort hypes desc` / `limit 50` | 「インディーかどうか」の判定を後段の静的リスト（`isLargeStudio`）に委ねており、母集団側には条件がない |

### 2.3 新作枠が 0 件になった直接原因（vol.17 実ログ `/tmp/wf017.log` で確認済み）

大手判定ゲート（`select-newreleases-with-fallback.ts:vetNewReleaseCandidate`）は**設計どおり動作した**。候補プールに大手作品が 1 件も無かったことが原因である。

```
[newReleases] candidates after filter: 18件
{"scope":"vet-new-release-candidate","title":"ドラゴンソード:アウェイクニング","step":"large-studio-gate","reason":"not-large-studio (developer=\"Hound13\", publisher=\"Hound13\")"}
… large-studio-gate による棄却が計 15 件
[Warning] newReleases採用0件 — 新作記事は生成されません
```

3 つの原因が重畳している。

1. **2.2 のとおり母集団の 75% が未発売作**。未発売作は `rating_count=0` / `steamRank` なし / `metascore` なしなので、後段の `isQualifiedGame()`（`scripts/game-filter.ts`）を必ず落ちる。
2. **`isQualifiedGame()` の大手向け経路が実質 1 本しかない**。
   - `metascore` 経路は**恒久的に死んでいる**: `OPENCRITIC_API_KEY` が `.github/workflows/weekly-build.yml` に存在しない。vol.16・vol.17 両方のログに `OpenCritic API key not set, skipping score fetch` / `Metacritic data fetched: 0 scores` が記録されている。
   - `steamRank` 経路は生きているが、Steam JP のトップセラー／新作は小規模タイトルが優勢のため、実質**インディーの取り込み口**として機能している。
   - 残るのは `igdbRatingCount >= 15` のみ。
3. **クールダウン 17 週が newRelease 履歴 31 件すべてを封鎖中**（1.3 参照）。大手かつ品質条件を満たした 5 件のうち 4 件がこれで落ちた。

なお、vol.17 の実行時点の `data/aggregated.json` は `.gitignore` 対象かつ Actions アーティファクトにも保存されていないため、**特定タイトル（例: ACBF Resynced）が vol.17 の候補 18 件に入らなかった理由は不明のまま**。確認するには aggregated.json をアーティファクトとして保存する仕組みが必要。

ただし `ACBF Resynced` については、IGDB 上で `game_type = 8`（Remake）であることを実測確認した。**PR #209 適用後は「Remake なので母集団クエリで除外される」ことが確定している**（今後の号について。vol.17 時点で除外された理由が同じだったかは確認できない）。この扱いの妥当性は §7 論点J-1 で議論する。

### 2.4 ケーススタディ: Splatoon Raiders（Nintendo, 2026-07-23 発売）が候補に挙がらなかった理由

ユーザーからの指摘（vol.17 の新作紹介に Splatoon Raiders が候補として挙がってもおかしくない）を受けて調査した。

**確認方法**: (1) vol.17 の GitHub Actions 実行ログ（`/tmp/wf017.log`、run 30129193266）を確認、(2) vol.17 実行時点と同一条件（`threeMonthsAgo` のタイムスタンプ、`sort hypes desc`, `limit 20`, `themes != (37)`）で IGDB API に再現クエリを実行。

**確認済み事実**:

1. vol.17 のログ上、新作枠の「候補18件」「releaseDateなし10件」のいずれにも Splatoon Raiders は出現しない。→ **`large-studio-gate` で落ちたのではなく、そもそも母集団取得の時点で候補に入っていない。**
2. Splatoon Raiders の IGDB 実データ: `first_release_date=2026-07-23`, `hypes=26`, `aggregated_rating=87`（`aggregated_rating_count=1`）, developer=`Nintendo EPD Production Group No. 5`, publisher=`Nintendo`, `game_type=0`。大手判定・品質条件は通過できるはずのタイトルである。
3. vol.17 実行時点の条件で母集団クエリ（`fetch-igdb.ts:651` 当時: `first_release_date > 90日前 & hypes > 5 & themes != (37)`, `sort hypes desc`, `limit 20`）を再現した結果、上位20件は以下（実測）:

```
1  hypes=964  Grand Theft Auto VI            2026-11-19  未発売
2  hypes=380  Fable                          2027-02-23  未発売
3  hypes=289  007 First Light                2026-05-27  発売済み
4  hypes=245  Marvel's Wolverine             2026-09-15  未発売
5  hypes=227  The Blood of Dawnwalker        2026-09-03  未発売
6  hypes=186  Phantom Blade 0                2026-10-29  未発売
7  hypes=183  Control Resonant               2026-09-24  未発売
8  hypes=173  Onimusha: Way of the Sword     2026-09-04  未発売
9  hypes=163  NTE: Neverness to Everness     2026-04-29  発売済み
10 hypes=129  The Wolf Among Us 2            2027-12-31  未発売
11 hypes=126  Exodus                         2027-12-31  未発売
12 hypes=124  Intergalactic: The Heretic Prophet 2027-12-31 未発売
13 hypes=123  Assassin's Creed Black Flag Resynced 2026-07-09 発売済み
14 hypes=123  Directive 8020                 2026-05-12  発売済み
15 hypes=120  Tomb Raider: Legacy of Atlantis 2027-02-12 未発売
16 hypes=113  Resonance: A Plague Tale Legacy 2026-08-27 未発売
17 hypes=113  Ill                            2027-12-31  未発売
18 hypes=110  Beast of Reincarnation          2026-08-04  未発売
19 hypes=104  Saros                          2026-04-30  発売済み
20 hypes=103  Stranger Than Heaven           2027-01-15  未発売
```

Splatoon Raiders（hypes=26）は 20 位（hypes=103）にも遠く届かず、選外である。20 件中 11 件が未発売作であり、`sort hypes desc` が §2.1 のとおり未発売作を上位に押し上げる構造がここでも再現している。

**結論（確認済み事実）**: Splatoon Raiders が vol.17 の新作紹介候補に挙がらなかったのは、大手判定ゲートや品質フィルタ以前の段階、**母集団取得クエリ（`sort hypes desc`, `limit 20`）が発売済みの中堅タイトルを拾えていないこと**が直接原因である。§2.1〜2.2 で指摘した構造的原因（未発売作が `hypes` 上位を占有し枠を食う）の実例であり、新しい原因ではない。

**関連する指標の補足**: Splatoon Raiders は `aggregated_rating=87`（Metacritic相当の批評集計値、§4.1 参照）を持つが `aggregated_rating_count=1` のため信頼度は低い（批評媒体1社のみ）。`hypes`（発売前フォロー数）は発売後に増えない指標であるため、発売済み作品の質を測る用途には本質的に不適合である（§2.1 参照）。素案 A-1（`sort hypes desc` → `sort aggregated_rating desc` への変更、§5.2【A】）が採用された場合、Splatoon Raiders のような発売直後の中堅タイトルが上位に来る可能性がある（`aggregated_rating_count>=2` を品質条件にした場合は `n=1` のため通過しない可能性もあり、論点D の閾値次第）。

---

## 3. 調査で判明した付随バグ（カテゴリ仕様とは独立に修正が必要）

仕様議論とは切り離して修正すべき事実確認済みの不具合。

> **対応状況（2026-07-26 更新）**: §3.1 / §3.2 は **Issue #207 / PR #209 で修正済み**。
> 修正の詳細と検証結果は **§10 対応済みバグの記録** を参照。
> レビューで別経路の同種リークが判明し **Issue #208** として分離起票した（§10.3）。

### 3.1 【重大】成人向け除外フィルタが機能していない

`fetch-igdb.ts` の 3 クエリすべてが `themes != (37)` で成人向けを除外しようとしているが、**IGDB の themes に id=37 は存在しない**。

API 実行結果（themes 全 22 件）:
```
1:Action 17:Fantasy 18:Science fiction 19:Horror 20:Thriller 21:Survival 22:Historical
23:Stealth 27:Comedy 28:Business 31:Drama 32:Non-fiction 33:Sandbox 34:Educational
35:Kids 38:Open world 39:Warfare 40:Party 41:4X 42:Erotic 43:Mystery 44:Romance
```

**Erotic は id=42**。id=37 は欠番（`where id = 37` は空配列）。

除外が効いていない証拠:
```
themes = (42) のゲーム数:  10220
themes = (37) のゲーム数:  0
themes != (37) のゲーム数: 370449   ← 全ゲーム数と同一。1 件も除外されていない
themes != (42) のゲーム数: 360229
全ゲーム数:                370449
```

現行の新作枠クエリに `themes = (42)` を足すと Erotic 作品が実際にヒットする:
```
Haunted by Femboy               hypes=26  themes=[Horror, Erotic, Romance]
My Femboy Roommate: Special Weekend  hypes=7   themes=[Comedy, Erotic, Romance]
```

現状は Steam の `content_descriptors` 判定（`fetch-steam.ts:192`）、AI スクリーニング（`generate-articles.ts:256 isAdultContentByAI`）、手動ブロックリスト（`scripts/adult-blocklist.ts`、登録 1 件）の 3 層で事後的に止まっている。IGDB 経路の一次フィルタは**無効のまま運用されている**。

→ `themes != (42)` への修正が必要。仕様議論の結論を待たず先行して直せる。

### 3.2 DLC / エディション違いが除外されていない

`game_type` フィールドで機械的に判別できることを確認した（`game_types` エンドポイント実測）:

```
0:Main Game  1:DLC  2:Expansion  3:Bundle  4:Standalone Expansion  5:Mod
6:Episode  7:Season  8:Remake  9:Remaster  10:Expanded Game  11:Port
12:Fork  13:Pack / Addon  14:Update
```

現行クエリは `game_type` を一切見ていない。直近 90 日発売の件数比較:

| 条件 | 件数 |
|---|---|
| 直近 90 日 全部 | 5172 |
| 直近 90 日 `game_type = 0`（Main Game のみ） | 4525 |

vol.17 の候補にも実際に混入していた（実ログより）: `プライムステータスアップグレード`、`GRANBLUE FANTASY: Relink - Endless Ragnarok（Standard Edition）`。
vol.14 のインディー枠は **ARK の DLC 2 本**だった。

> **【2026-07-29 追記】** 本項の対策として PR #209 で `game_type = 0` を適用した（§10）。しかしこれは **IGDB 経路にしか効かない**。もう一方の入口である **Steam Top Sellers / Top Played 経路には DLC 除外が存在しない**ことが判明した（`fetch-steam.ts` が `appData.type` を読んでいない。現在の Top Sellers 10 件中 2 件が DLC）。→ **§8.1**（✅ **2026-08-08 に PR #226 で修正済み**。§8.1.1）。
> また IGDB 側のエディション混入は運用条件下では定量的に軽微であることも確認した → **§8.3**。

### 3.3 履歴のクールダウンがすり抜ける経路

`build-issue.ts:591` は履歴エントリを `a.game!.title`（日本語タイトルになり得る）で保存する。一方 IGDB 由来の候補は英語タイトルで照合されるため、`normalizeTitle` の比較が一致せずクールダウンをすり抜ける経路がある。

→ ユーザー判断により**据え置き**（日本語ゲームでの副作用があるため）。本ドキュメントでは記録のみ。

**2026-08-04 追記: 実データで 3 つの経路を確認した**（`.claude-scratch/measure-i.ts` → `out-i.txt`。論点I の測定中に判明。いずれも③④⑤の決定とは独立した既存課題で、本ドキュメントでは記録のみ）。

**(a) 日本語タイトルでの記録が実在する — 20/105 件。** 特に `feature` 枠は日本語で記録される傾向がある。**実害の実例: `Subnautica 2`（classic, vol.14）と `サブノーティカ２`（feature, vol.16）は同一作品だが `normalizedTitle` が別キーになっている。** 他に `バイオハザード7 レジデント イービル` / `アサシン クリード ローグ` / `ノーマンズスカイ` / `アウター・ワイルズ` / `アサシン クリード ブラック フラッグ RE:シンクロ` など。`GameData` には `titleJa` フィールドがあるため、履歴側に英語・日本語の両キーを持たせれば照合できると考えられる（未検証）。

**(b) クールダウンがカテゴリ別なので、同一作品が別カテゴリで重複掲載されている — 実測 6 件。**
```
Resident Evil Requiem: newRelease(vol.3)  + classic(vol.15)
Subnautica 2         : newRelease(vol.7)  + classic(vol.14)
Star Citizen         : classic(vol.4)     + feature(vol.14)
Forza Horizon 6      : indie(vol.3)       + newRelease(vol.14)
007 First Light      : indie(vol.9)       + newRelease(vol.14)
空の軌跡 the 1st      : indie(vol.13)      + feature(vol.14)
```
`getCooldownTitles()`（`game-history.ts:112`）は `if (entry.category !== category) continue;` で他カテゴリを読み飛ばすため、これは実装どおりの挙動である。「別カテゴリなら再登場して良い」を仕様として認めるか、カテゴリ横断の最小間隔を設けるかは未決（本レビューの論点には含めていない）。

**(c) 版名サフィックスが `normalizeTitle` で削られない。** `Dark Souls` と `Dark Souls: Remastered` は別キーになる。名作枠については④(J-3-e) が母集団側で解決したが、新作枠・インディー枠には残る。**除去ルールの追加では原理的に解けない**（`part i` 除去は `Part II` を誤同一視し、`3d` 除去は `Super Mario 3D World` を `Super Mario World` と誤同一視する。§7 論点J-3 の決着ブロックの表を参照）。

**同一カテゴリ内で同一タイトルが 2 回載っている件は 0 件**（実測）。既存のクールダウンはカテゴリ内では正しく機能している。

### 3.4 `involved_companies.company.game_count` は存在しない

Issue #175 が大手判定のシグナルとして挙げている `game_count` フィールドは IGDB に存在せず、クエリに含めると `400 Invalid field name` になる。

代替として **`companies` エンドポイントの `developed` / `published`（Game ID 配列）の件数**が使える。実測値:

| 会社 | developed | published | 設立 |
|---|---|---|---|
| Nintendo | 676 | 2831 | 1889-09-23 |
| Capcom | 902 | 1298 | 1979-05-30 |
| Nihon Falcom | 214 | 155 | 1981-03-01 |
| Cygames | 32 | 31 | 2011-05-09 |
| Studio Wildcard | 20 | 20 | 2014-12-31 |
| PocketPair | 7 | 13 | 2015-04-01 |
| Crate Entertainment | 8 | 5 | 2008-12-31 |
| Hound13 | 1 | 1 | 2014-12-31 |

**これは静的リストを置き換えられる連続量である**（§6.2 で活用案を示す）。

> **【2026-07-29 訂正】** この評価は 2 点で修正が必要である（詳細は **§4.1.5**）。
> 1. **`developed` は Main Game 以外（DLC・Bundle・Pack・Port・Remake・Remaster・Update）をすべて含む。** 上表の Studio Wildcard 20 件は Main 換算 **4 件**（Expansion が 11 件）。生件数を規模の代理指標にすると小規模スタジオを大手側に誤判定する
> 2. **`published` は規模指標として使用不可。** tinyBuild `published=149` に対し Yacht Club Games 17。かつ `published` は他社開発作品を含む（実測確認済み）
>
> また **静的リストを「置き換える」ことはできない**。The Coalition（`developed=8`）・Unknown Worlds Entertainment（`developed=9`）のような大手専属スタジオは件数では拾えないため、**静的リストと閾値の OR 併用が必須**である（§11.4 論点 I-1 の実測）。

---

## 4. 使えるデータの棚卸し — metascore は必要か

ユーザーからの論点「metascore などのデータも参考にしたほうが良いのか」に対する調査結果。

### 4.1 指標フィールド用語集 — 定義・性質・用途

> **この節の位置づけ**: 本ドキュメント全体および §11 の決定事項で使う指標フィールドの定義を 1 箇所に集約する。
> すべて IGDB 公式ドキュメントの定義 + 実 API 実測で確認済み（実測日: 2026-07-26 および 2026-07-29）。
> 件数系の値（`developed` 等）は IGDB のデータ更新で漂動する（実測: Nintendo の `developed` は 07-26 時点 676、07-29 時点 675）。閾値設計では 1 件単位の精度に依存しないこと。

#### 4.1.1 一覧と公式定義

| フィールド | エンドポイント | 公式定義（原文） | 実体 |
|---|---|---|---|
| `rating` | games | *Average IGDB user rating* | IGDB **サイト利用者**の平均評価（0〜100） |
| `rating_count` | games | *Number of external critic scores* ← **ドキュメントの誤記**。実体はユーザー投票数 | IGDB ユーザー評価の**投票数** |
| `aggregated_rating` | games | *Rating based on external critic scores* | **外部批評スコアの集計＝Metacritic 相当** |
| `aggregated_rating_count`（本書では **agg_count** と略記） | games | *Number of external critic scores* | 集計に使われた**批評媒体数**＝スコアの信頼度 |
| `total_rating` | games | *Average rating based on both IGDB user and external critic scores* | ユーザー評価と批評スコアの合成 |
| `total_rating_count` | games | *Total number of user and external critic scores* | 合成の母数 |
| `hypes` | games | *Number of follows a game gets before release* | **発売前**フォロー数の累計（§2.1） |
| `follows` | games | ***DEPRECATED! - To be removed*** | 使用不可 |
| `developed` | **companies** | その企業が developer として関わった **Game ID の配列** | 件数を開発規模の代理指標として使う |
| `published` | **companies** | その企業が publisher として関わった **Game ID の配列** | **規模指標としては使用不可**（4.1.5） |
| `parent` | **companies** | **親会社の company ID**（単一値） | 資本関係を辿る経路（4.1.6） |

**`rating_count` のドキュメント誤記について**: 公式ドキュメントは `rating_count` を *Number of external critic scores* と説明しているが、実データはユーザー投票数である。実測（2026-07-29）:

```
The Witcher 3   rating=93.8 (rating_count=5377)   aggregated_rating=91.7 (agg_count=26)
Elden Ring      rating=93.5 (rating_count=2217)   aggregated_rating=96.9 (agg_count=10)
Cyberpunk 2077  rating=82.9 (rating_count=1592)   aggregated_rating=75.2 (agg_count=21)
```

批評媒体が 5,377 社存在することはあり得ないため、`rating_count` はユーザー投票数、`agg_count` が批評媒体数である。**本ドキュメントはこの実測解釈を採る。**

#### 4.1.2 現行コードでの在庫状況（実読、2026-07-29）

**7 指標のうち `GameData` に到達しているのは `rating` / `rating_count` の 2 つだけである。**

| フィールド | IGDB クエリで取得しているか | `GameData` へのマッピング |
|---|---|---|
| `rating` | ○（`fetch-igdb.ts:648, 743, 841`） | `igdbRating`（`fetch-data.ts:137`） |
| `rating_count` | ○（同上） | `igdbRatingCount`（`fetch-data.ts:138`） |
| `hypes` | ○（取得はしている） | **なし**。クエリの `where` / `sort` にしか使われず、選定後は破棄される |
| `aggregated_rating` | **×**（`grep aggregated_rating scripts/*.ts` → 0 件） | なし |
| `agg_count` | × | なし |
| `total_rating` / `total_rating_count` | × | なし |
| `developed` | × | なし（`companies` エンドポイントへの追加リクエストが必要） |
| `parent` | × | なし（同上） |

→ 後半 5 指標はすべて**新規に取得経路を作る必要がある**。特に `developed` / `parent` は `games` エンドポイントから辿れず、企業 ID を集めてから `companies` を別途叩く設計になる（§6.3）。

#### 4.1.3 `hypes` の性質 — 「人気」ではなく「その時点の IGDB でのフォロー数」

定義どおり**発売前**の累計なので、**発売後は増えない**。加えて IGDB のユーザー数が少なかった時代の作品にはほとんど付いていない。実測（発売年別、`rating_count > 50` の上位）:

```
[1年前発売]  Hollow Knight: Silksong hypes=220 (rc=477)   Arena Breakout: Infinite hypes=990 (rc=146)
[5年前発売]  Death's Door hypes=7 (rc=183)                The Forgotten City hypes=7 (rc=149)
             Pokémon Unite hypes=1 (rc=97)
[10年前発売] Inside hypes=11 (rc=1617, agg_count=39)      Dead by Daylight hypes=0 (rc=421)
             Persona 5 hypes=34 (rc=1092)
```

**`Inside` は `rating_count=1617` の名作だが `hypes=11`。`Dead by Daylight` は `hypes=0`。Palworld も `hypes=1`。**
`hypes` は時代依存の量であり、**発売済み作品の質・人気を測る指標として本質的に不適合である。**

現行の 3 クエリすべてが `sort hypes desc` を使っている（`fetch-igdb.ts:652, 747, 845`）。名作枠は `where hypes > 100` のみで発売日条件すら無い。これが §2 の乖離の根本原因である。

#### 4.1.4 `aggregated_rating` と `rating_count` の相補性 — 時間軸で役割が分かれる

| | 発売前 | 発売直後 | 発売から年数経過 |
|---|---|---|---|
| `aggregated_rating` / `agg_count` | **絶対に付かない** | すぐ付く（批評は発売日に出る） | 蓄積して信頼度が上がる |
| `rating` / `rating_count` | ほぼ付かない | まだ少ない | 大量に蓄積 |
| `hypes` | **これしか無い** | 増えない | 増えない・時代依存 |

未発売作のスコア在庫（未発売 90 日窓 973 件、`game_type=0`、実測 2026-07-29）:

```
aggregated_rating あり:  0 件   ← 未発売作に批評スコアは存在しない
rating あり:             1 件
rating_count > 0:        1 件
hypes > 0:             347 件
```

**未発売枠では `aggregated_rating` / `rating` / `rating_count` はいずれも使用不可であり、使える指標は `hypes` のみである。** これは §11 の未発売枠設計の前提となる確認済み事実。

逆に発売直後は `aggregated_rating` の方が `rating_count` より 5 倍以上取得できる（§4.2 の 86 対 16）。

#### 4.1.5 `developed` の性質 — DLC・バンドル・移植をすべて含む

`developed` は Main Game だけでなく **DLC・Bundle・Pack・Port・Remake・Remaster・Update をすべて含む**。内訳の実測（2026-07-29、`developed` の全 ID を `games` に問い合わせて `game_type` を集計）:

```
企業名                       developed  Main のみ  内訳
Studio Wildcard                 20         4    Expansion:11 Main:4 DLC:2 Bundle:2 Remaster:1
Quarter Up                      19         2    Pack:13 DLC:3 Main:2
Illfonic                        19         8    Main:8 DLC:6 Update:4 Fork:1
Evil Empire                     14         3    Bundle:7 Main:3 DLC:3 Update:1
Yacht Club Games                12         5    Main:5 StandaloneExp:3 Expansion:1 Bundle:1 ...
Mad Head Games                  15        15    Main:15
SUKEBAN                         11        11    Main:11
Housemarque                     36        22    Main:22 DLC:7 Port:3 Bundle:1 Remake:1 Remaster:1 Update:1
Remedy Entertainment            36        14    Main:14 Bundle:9 Expansion:5 DLC:2 Remake:2 Update:2 ...
Asobo Studio                    47        28    Main:28 Port:6 DLC:3 Bundle:3 Update:3 Pack:2 ...
Frogwares                       44        20    Main:20 DLC:8 Pack:6 Bundle:5 Remaster:3 Remake:1 Port:1
Traveller's Tales              127        61    Main:61 Pack:26 Port:17 DLC:15 Bundle:3 Remaster:3 ...
Nihon Falcom                   214       119    Main:119 Remake:27 Port:21 Remaster:16 Bundle:11 ...
Cygames                         32        20    Main:20 DLC:5 Pack:3 Bundle:2 Remaster:1 Update:1
```

**生件数と Main 換算のずれが大きい企業がある**: Quarter Up は 19 本のうち 13 本が Pack で Main は 2 本、Evil Empire は 14 本中 Bundle が 7 本で Main は 3 本、Studio Wildcard は 20 本中 Expansion が 11 本で Main は 4 本。

→ **規模判定に生件数を使うと、DLC・Pack を多く出している小規模スタジオを誤って大手側に落とす。**

> **【2026-07-30 追記・結論】** 上記を根拠に当初は「閾値設計は Main 換算で行うべき」としていたが、**プール全 85 社の再測定により Main 換算は棄却した**（§11.4.1）。理由は 3 点:
> 1. **`game_type = 0` にエディション違いが混入しているため Main 換算値自体が不正確。** 上表の `Mad Head Games` は Main 15 本のうち 8 本が `- Collector's Edition` であり実質 7 本。上表で「生件数と Main 換算が一致する信頼できる例」として挙げたのは誤りだった
> 2. **Main 換算は DLC 主体の大手をインディー側に落とす**（`Milestone S.r.l.` は raw 66 → Main 2）。この誤判定の向きは、生件数の誤判定（小規模を大手側に）より編集意図上まずい
> 3. 数え方の選択が判定を変えるのは 6 社 / 85 社
>
> **決定: 生件数を使い、閾値は `developed > 20`。** この閾値ではエディション汚染が判定に影響しない。詳細は §11.4 論点 I-1。

**`published` は規模指標として使用不可**（実測で確定）:
- インディー系パブリッシャの方が数が多い: tinyBuild 149、Top Hat Studios 78、Hooded Horse 55、Dear Villagers 53、Kwalee 37 に対し、Yacht Club Games 17、ZA/UM 6
- `published` は他社開発作品を含む。tinyBuild の `published` から 5 本抽出して developer を確認した結果、すべて他社（Lazy Bear Games、Bread Team、Mokus、Fly Anvil、HakJak Productions）

#### 4.1.6 `parent` の性質 — 大手専属スタジオに偏って埋まっている

保有率は低い（発売済み 90 日 + 未発売 90 日のプールで **13/89 社 = 15%**）が、**大手の子会社・専属スタジオに偏って埋まっている**。実測:

```
The Coalition(developed=8)   → Microsoft Studios (published=247)
Unknown Worlds(9)            → Krafton (published=36)
Housemarque(36)              → Sony Interactive Entertainment (published=377)
Bandai Namco Aces Inc.(4)    → Bandai Namco Entertainment (published=160)
Mad Head Games(15)           → Saber Interactive (developed=149)
GPTRACK50(1)                 → NetEase Games (developed=63)
Traveller's Tales(127)       → TT Games (developed=45)
Supermassive Games(39)       → Nordisk Film (published=2)
```

**使用上の注意 2 点**（いずれも実測で判明）:

1. **親も `parent` を持つ（多段）**。`Sony Interactive Entertainment (id=10100)` → `Sony (id=10282)`。1 段だけ辿れば SIE の `published=377` が得られるが、Sony 本体は `published=20` しかない。**辿る段数を決める必要がある。**
2. **親側の判定には `published` を使う。`developed` は使えない**。SIE は `developed=8` / `published=377`、Xbox Game Studios は `developed=3` / `published=259`。持株的なパブリッシャは自社開発が少ないため、親の規模は `published` でしか測れない。

→ 用途は「`developed` が少なくても資本的に大手」なケース（The Coalition 8 本、Unknown Worlds 9 本）の検出。保有率 15% なので単独では機能せず、**静的リストの代替ではなく第 3 のシグナルとして併用する**のが妥当と考えられる。

#### 4.1.7 用途マトリクス（§11 の決定を反映した提案）

> **N-6 の決着（2026-08-01）を反映済み。** 発売済み枠は単一フィールドによる主軸ソートをやめ、4 軸の重み付き最大値をスコアとする（11.4.5）。以下の「スコア軸」はその 1 軸として使うことを意味する。

| フィールド | 新作紹介（発売済み） | 新作紹介（未発売） | インディー | 名作深掘り |
|---|---|---|---|---|
| `aggregated_rating` | **スコア軸**（`× min(1, n/4)` で信頼度補正。11.4.5） | **使用不可**（0 件） | 参考 | フロア（`total_rating` 経由） |
| `agg_count` | フロア `>= 2` ＋ 上記の信頼度補正に使用 | 使用不可 | — | フロア |
| `rating` | 参考 | 使用不可 | 参考 | フロア |
| `rating_count` | フロア `>= 15`（OR 条件）＋ **スコア軸**（`log10(rc)/log10(500)`。11.4.5） | 使用不可（973 件中 1 件） | **主軸ソート** | フロア `>= 100` |
| Steam Top Sellers 順位 | フロア（OR 条件）＋ **スコア軸**（`1-(順位-1)/枠数`。11.4.5） | 使用不可 | 参考 | — |
| Amazon 国内ランキング順位<br>（ファミ通経由） | フロア（OR 条件）＋ **スコア軸**（`1-(順位-1)/50`。11.4.5）<br>**記事には出力しない** | 使用不可（発売済みのみ掲載） | 未検証（大手が上位を占めるため機能しにくい） | 未検証 |
| `hypes` | **使用禁止**（4.1.3） | **品質フロア `> 20`** のみ。ソート軸には使わない | **使用禁止** | **使用禁止** |
| `developed`（Main 換算） | 使わない（規模条件を撤廃） | 使わない | **規模判定** | — |
| `published` | 使用不可（4.1.5） | 使用不可 | 使用不可 | 使用不可 |
| `parent.published` | 使わない | 使わない | 規模判定の補助シグナル | — |

---

#### 4.1.8 `aggregated_rating` は Metacritic の代替になる

**重要**: `aggregated_rating` は IGDB 側に既に存在する。つまり **Metacritic 相当のスコアを OpenCritic API 経由で別途取得する必要はない**。実データ照合:

| ゲーム | aggregated_rating | Metacritic 実スコア（参考） |
|---|---|---|
| God of War (2018) | 96 (n=26) | 94 |
| Red Dead Redemption 2 | 94 (n=17) | 97 |
| The Witcher 3 | 92 (n=26) | 93 |
| Breath of the Wild | 98 | 97 |
| Grand Theft Auto V | 88 (n=27) | 97 |

数値は完全一致ではない（IGDB 独自の集計）が、批評的評価の指標としては同等に機能する。

### 4.2 `aggregated_rating` のカバレッジ（実測）

| 条件 | 件数 |
|---|---|
| 全ゲーム | 370,449 |
| `aggregated_rating` あり | 16,805 (4.5%) |
| `aggregated_rating` あり & `count >= 5` | 3,005 |
| 直近 90 日発売 | 5,172 |
| 直近 90 日発売 & `aggregated_rating` あり | **86** |
| 直近 90 日発売 & `rating_count >= 15` | **16** |

**発売直後の作品では `aggregated_rating` の方が `rating_count` より 5 倍以上取得できる**（86 対 16）。批評は発売直後に出るが、ユーザー評価は蓄積に時間がかかるためと考えられる。

### 4.3 新作枠の供給量（`game_type = 0` で DLC 除外、Erotic 除外後）

| 期間 | 全件 | agg あり（週換算） | agg_count>=2（週換算） | rating_count>=15（週換算） |
|---|---|---|---|---|
| 直近 30 日 | 1,669 | 14 (週 3.3) | 3 (週 0.7) | 3 (週 0.7) |
| 直近 60 日 | 3,147 | 30 (週 3.5) | 7 (週 0.8) | 7 (週 0.8) |
| 直近 90 日 | 4,525 | 67 (週 5.2) | 25 (週 1.9) | 14 (週 1.1) |
| 直近 180 日 | 9,879 | 180 (週 7.0) | 73 (週 2.8) | 31 (週 1.2) |

新作枠は 2 本／週を要求する。**現行の `rating_count >= 15` 単独では週 0.7〜1.2 本しか供給されない**（＝構造的に不足）。`aggregated_rating` を条件に加えると週 3.3〜5.2 本になり、2 本／週が成立する。

### 4.4 直近 90 日・`aggregated_rating` あり・Main Game の実在リスト（上位抜粋）

新作枠の実際の供給内容。大手が含まれることが確認できる。

```
agg=91(n=5)  rc=23  2026-05-29  Mina the Hollower            [Yacht Club Games]
agg=90(n=5)  rc=74  2026-05-19  Forza Horizon 6              [Xbox Game Studios]
agg=90(n=4)  rc=9   2026-04-30  Saros                        [Sony Interactive Entertainment]
agg=89(n=3)  rc=32  2026-05-22  LEGO Batman: Legacy of the Dark Knight [WB Games]
agg=87(n=1)  rc=0   2026-07-23  Splatoon Raiders             [Nintendo]
agg=82(n=6)  rc=130 2026-05-27  007 First Light              [IO Interactive]
agg=82(n=3)  rc=0   2026-05-21  Yoshi and the Mysterious Book [Nintendo]
agg=81(n=4)  rc=23  2026-05-12  Directive 8020               [Bandai Namco Entertainment]
agg=81(n=1)  rc=0   2026-07-02  Rhythm Heaven Groove         [Nintendo]
agg=80(n=4)  rc=10  2026-04-28  Aphelion                     [DON'T NOD]
agg=80(n=1)  rc=0   2026-07-09  EA Sports College Football 27 [EA Sports]
```

**注意**: `aggregated_rating_count = 1` のものは批評媒体 1 社のみの評点であり、信頼度が低い。閾値の設定が必要（§7 論点D）。

### 4.5 名作枠の母集団候補比較（発売 3 年以上前）

| 条件 | 件数 |
|---|---|
| `rating_count >= 500` | 352 |
| `rating_count >= 200` | 926 |
| `aggregated_rating >= 85 & aggregated_rating_count >= 5` | 475 |
| `total_rating >= 85 & total_rating_count >= 100` | **426** |

上表はいずれも `game_type` / `themes` の絞り込みを**かけていない**素の件数である。`total_rating >= 85 & total_rating_count >= 100 & 3 年以上前` に絞り込みを重ねた実測値は以下（`themes != (42)` は名作級のタイトルに Erotic が無いため件数に影響しない）:

| 絞り込み | 件数 |
|---|---|
| なし | 426 |
| `themes != (42)` のみ | 426 |
| `game_type = 0`（PR #209 適用後の実際の母集団） | **322** |
| `game_type = (0,8,9)`（リメイク・リマスターを許可した場合） | 350 |

以降の年代分布と供給量の議論は **`game_type = 0` の 322 件**を前提とする。リメイク・リマスターの扱いは §7 論点J-3 で議論する。

`total_rating >= 85 & total_rating_count >= 100 & 3年以上前 & game_type=0` を `total_rating_count` 降順で引いた結果:

```
GTA V (2013) / The Witcher 3 (2015) / Portal 2 (2011) / GTA San Andreas (2004)
Red Dead Redemption 2 (2018) / The Last of Us (2013) / God of War (2018)
BioShock (2007) / Assassin's Creed II (2009) / GTA Vice City (2002)
Breath of the Wild (2017) / Mass Effect 2 (2010) / BioShock Infinite (2013)
Batman: Arkham City (2011) / Uncharted 4 (2016) / Batman: Arkham Asylum (2009)
Mass Effect (2007) / Red Dead Redemption (2010) / Horizon Zero Dawn (2017) / Elden Ring (2022)
```

**この 20 件はすべて「世界的に評価の高いゲーム」と呼べる**。`hypes` を捨てて `total_rating` に替えるだけで、名作枠は要件.md の意図どおりになると考えられる。

年代分布（`game_type = 0 & themes != (42)`、322 件の内訳）:

| 年代 | 件数 |
|---|---|
| 1990 年より前 | 2 |
| 1990 年代 | 48 |
| 2000 年代 | 116 |
| 2010–2014 | 54 |
| 2015–2019 | 63 |
| 2020–2023 | 39 |

52 週クールダウン・年 52 本消費に対し **322 件の母集団は 6 年分**。供給に余裕がある。

### 4.6 結論: OpenCritic / Metacritic 取得は不要と考えられる

| 選択肢 | 評価 |
|---|---|
| (a) `OPENCRITIC_API_KEY` を Secrets に追加し `metascore` 経路を復活させる | RapidAPI の有料プラン契約が必要。ゲーム名検索によるタイトル照合ミスのリスクも新たに抱える |
| (b) **`aggregated_rating` を使い、`metascore` 経路を廃止する** | 追加コスト 0。IGDB 1 回の取得で同時に得られる。ID ベースなので照合ミスがない。カバレッジは §4.2 のとおり十分 |

**(b) を推奨する。** ただし `scripts/fetch-metacritic.ts` および `GameData.metascore` を削除するか、`aggregated_rating` の受け皿として残すかは要決定（§7 論点D）。

> **✅ 2026-08-04 追記（論点D 決着）: (b) を採用。ただし本節の書き方は不正確だった。**
> 本節は「`metascore` を `aggregated_rating` に**置き換える**」という枠組みで書かれているが、実測の結果 **`metascore` は全 17 号で 1 件も取得できておらず（0/17）、置き換える対象が存在しなかった**。`fetch-metacritic.ts` は `OPENCRITIC_API_KEY` を必須とし、そのキーはリポジトリ・`.env.local`・GitHub Actions のいずれにも設定されていない（`.env.example:22` に空のプレースホルダのみ）。
> したがって決定は「置き換え」ではなく **(D-1') 動作していない取得経路の削除**である。`aggregated_rating` の `GameData` への追加は別作業（PR-B / N-6 スコア実装）に属する。詳細は §7 論点D の決着ブロックを参照。

---

## 5. 各カテゴリの編集意図（読者に何を伝えるか）— 素案

仕様の前提として、まずカテゴリごとの「読者への約束」を言語化する。
読者像は `要件.md` に基づく: **ゲームクリエイターを目指す学生。幅広いジャンル・種類のゲームの情報を、短時間で濃く得たい。**

この読者像から導くと、4 枠は「面白いゲームの寄せ集め」ではなく **ゲームを見る 4 つの異なる視点**を提供するべきである、というのが素案の立場である。

### 5.1 素案: 4 カテゴリの軸を「時間」に統一する

現状 4 枠の切り口は互い違いになっている。

| カテゴリ | 現状の軸 |
|---|---|
| 新作紹介 | 企業規模（大手）× 時期（新しい） |
| インディー | 企業規模（非大手）× 話題性 |
| 名作深掘り | 評価の高さ ×〜~~時期（古い）~~〜（未実装） |
| 特集 | テーマ（暦） |

新作とインディーが「企業規模」で排他になっているため、**vol.17 のように大手が枯渇すると新作枠が消え、その分がインディー枠に流れ込む**（Grim Dawn / ドラゴンソードが indie に押し出されたのがこれ）。枠が互いの受け皿になっており、独立していない。

素案では**軸を「ゲームの時間軸」に揃え、企業規模は軸から降格させる**。

| カテゴリ | 素案の軸 | 読者への約束 |
|---|---|---|
| 新作紹介 | **これから／今** | 「今週チェックすべき新しいゲームはこれ」— 市場の最前線を知る |
| インディー | **作り手の視点** | 「小さなチームがどう作ったか」— 自分が作る側に立ったときの参考 |
| 特集 | **横のつながり** | 「今この時期に意味を持つ切り口」— 単体では見えない文脈 |
| 名作深掘り | **時間に耐えたもの** | 「なぜ何年経っても評価されるのか」— 良いゲームの普遍的条件 |

この整理だと、**インディー枠だけは「規模」が軸として本質的**（作り手の視点＝小規模開発の話を聞く枠）であり、新作枠は規模を軸から外せる。これが素案の中核的な提案である。

### 5.2 カテゴリ別素案

以下、各カテゴリについて「読者への約束 → 選定条件 → プロンプト方針」の順に素案を示す。
数値は §4 の実測供給量に基づく暫定値であり、要議論。

---

#### 【A】新作紹介 (`newRelease`) — 2 本

**読者への約束**: 「今週、ゲーム業界で何が新しく出たか／出るか」。市場の最前線の定点観測。

**素案 A-1: 「大手」条件を外し「注目度」条件に置き換える**

要件.md は「大手企業の」と書いているが、読者価値の観点では**「大手だから紹介する」のではなく「注目されているから紹介する」**のが本質だと考えられる。実際 vol.17 の候補 18 件には Palworld（PocketPair、世界的ヒット作の続編相当）が含まれていたが、大手ゲートで落とされている。読者にとっては Palworld は「今週の新作」として十分な価値がある。

一方、大手条件を完全に外すとインディー枠と区別がつかなくなる。素案では**「注目度」で切り、企業規模はスコアの一要素に格下げする**。

| 項目 | 現行 | 素案 |
|---|---|---|
| 母集団クエリ | `first_release_date > 90日前 & hypes > 5`, `sort hypes desc`, `limit 20` | `first_release_date > 90日前 & first_release_date < now & game_type = 0 & themes != (42)`, `sort aggregated_rating desc`, `limit 100` |
| 品質条件 | `isQualifiedGame()`（実質 `igdbRatingCount >= 15` のみ生存） | `aggregated_rating_count >= 2` **または** `rating_count >= 15` **または** `steamRank` 掲載 |
| 企業規模 | `isLargeStudio(dev) OR isLargeStudio(pub)` を**必須**（AND ゲート） | **必須条件から外す**。並び順のスコア要素にする |
| DLC | 制限なし | `game_type = 0` で除外 |
| リメイク・リマスター | 制限なし | ✅ **`game_type = 0, 8, 9` を許可し記事に明記させる**（2026-08-06。(J-1-c)。§7 論点J-1 の決着ブロック）。Port(11) は除外のまま |
| 未発売作 | 実質採用不可（品質条件で落ちる） | **論点C として別途決定**（下記） |

**供給量の見込み**（§4.3）: `agg あり` 週 3.3〜5.2 本、`agg_count>=2` 週 0.7〜2.8 本。2 本／週の要求に対し、`agg_count>=2` 単独では不足する可能性がある。`OR steamRank` を残すことで補う設計。

**未発売作の扱い（要件.md の「もうすぐ発売」）**: 今後 90 日発売・`game_type=0`・`hypes > 20` の実在数は 35 件（週 2.7 本相当）で、供給は成立する。実在リスト:
```
hypes=245  2026-09-15  Marvel's Wolverine            [Sony Interactive Entertainment]
hypes=227  2026-09-03  The Blood of Dawnwalker        [Bandai Namco Entertainment]
hypes=183  2026-09-24  Control Resonant              [Remedy Entertainment]
hypes=173  2026-09-04  Onimusha: Way of the Sword    [Capcom]
hypes=113  2026-08-27  Resonance: A Plague Tale Legacy [Focus Entertainment]
hypes= 95  2026-10-06  Gears of War: E-Day           [Xbox Game Studios]
hypes= 84  2026-09-24  Silent Hill: Townfall         [Annapurna Interactive/Konami]
hypes= 61  2026-10-15  Castlevania: Belmont's Curse  [Konami]
hypes= 48  2026-10-02  Ace Combat 8                  [Bandai Namco Entertainment]
```
**未発売作こそ hypes が正しく機能する領域である**（定義上「発売前フォロー数」なので）。ただし未発売作には評価もレビューもプレイ体験も存在しないため、現行プロンプトの「✨ゲームの特徴」「💬プレイヤーの声」は書けない。ハルシネーション対策と正面衝突する（Issue #206 の HIGH 警告と同種の問題）。

**プロンプト方針**: 現行 `newReleaseSystem`（`bedrock-client.ts:123`）の構成（導入 / ✨ゲームの特徴 / 🎨開発ストーリー / 👥こんな人におすすめ / 📅発売情報 / 🎯Creator's Eye）は概ね維持。ただし「大手ゲーム企業の新作」という前提文は素案 A-1 と矛盾するため書き換えが必要。

---

#### 【B】インディーゲーム (`indie`) — 2 本

**読者への約束**: 「小さなチームがどうやってこれを作ったのか」。読者がクリエイター志望である以上、**この枠が最も読者価値が高い**可能性がある。大手の新作は他メディアでも読めるが、小規模開発の話は探しにくい。

**現状の問題**: `isLargeStudio()` が静的リスト（`LARGE_DEVELOPERS` 約 45 社 + `MAJOR_PUBLISHER_SUBSIDIARIES`）の完全一致判定なので、リストに無い会社はすべて「インディー」になる。Nihon Falcom（developed 214 本、1981 年設立）、Cygames（32 本）、Studio Wildcard（20 本）がインディー枠に載ったのはこれが原因。Issue #167（リスト追加漏れによる再発）も同根。

**素案 B-1: 静的リストを `companies.developed` / `published` 件数による連続量判定に置き換える**

§3.4 の実測値から、**「開発本数」でスタジオ規模は概ね切れる**と考えられる。

```
Nintendo             developed=676  published=2831
Capcom               developed=902  published=1298
Nihon Falcom         developed=214  published=155
Cygames              developed= 32  published= 31
Studio Wildcard      developed= 20  published= 20
PocketPair           developed=  7  published= 13
Crate Entertainment  developed=  8  published=  5
Hound13              developed=  1  published=  1
```

例えば `developed <= 15` を「小規模」とすると、PocketPair / Crate / Hound13 は通り、Nihon Falcom / Cygames / Studio Wildcard は落ちる。**閾値の妥当性は要検証**（§7 論点E）。実装は静的リストとの OR 併用から始め、ログで乖離を観測してから静的リストをフォールバックに格下げする段階的移行が安全と考えられる（Issue #175 / opus 版プランの PR-4 と同方針）。

> **【2026-07-30 決定】** 閾値は **`developed > 20`（生件数）を「大手」** とすることに決着した。また **`published` は規模指標として使用不可**であり、**静的リストは「置き換える」のではなく OR で併用し続ける**（大手専属スタジオは件数では拾えないため）。詳細は §11.4 論点 I-1。

| 項目 | 現行 | 素案 |
|---|---|---|
| 母集団クエリ | `first_release_date > 90日前 & rating_count > 5`, `sort hypes desc`, `limit 50` | `first_release_date > 90日前 & first_release_date < now & game_type = 0 & themes != (42)`, `sort rating_count desc`, `limit 100` |
| 規模判定 | 静的リスト完全一致（`isLargeStudio`） | `companies.developed` 件数 + 静的リストの OR/AND 併用 |
| DLC | 制限なし（vol.14 は ARK の DLC 2 本） | `game_type = 0` で除外 |
| リメイク・リマスター | 制限なし | **論点J-2**。この枠では影響が極小（36 件 → 39 件）なので `game_type = 0` 維持が有力 |
| 話題性ルート | `steamRecommendations >= 5000` / `steamRank <= 200` / YouTube 上位 30% | 維持 |

**プロンプト方針**: 現行 `indieSystem`（`bedrock-client.ts:188`）は「個人や小規模チームの作品への敬意を示す」とあり意図と合致している。読者価値の観点では 🎨開発ストーリー を厚くする方向の調整余地があるが、ハルシネーション制約（開発期間・費用・人数の記述禁止）とのバランスが要検討。

---

#### 【C】特集 (`feature`) — 1 本

**読者への約束**: 「今この時期に意味を持つ切り口で、複数のゲームを横に並べて見る」。単体レビューでは見えない文脈を提供する。

**現状**: 唯一意図どおり機能しているカテゴリ。日本のイベントカレンダー（`fetch-japanese-events.ts`）＋ LLM テーマ選定（`selectFeatureThemeWithAI`）＋ LLM 知識からのゲーム提案（`proposeThemeGamesFromKnowledge`）＋ IGDB 実在検証（`verifyProposedGames`）という多段構成で、`FEATURE_MIN_GAMES = 3` を満たすフォールバックも実装済み。vol.17 の「劇画の日特集」も成立している。

**素案 C-1: 現状維持。ただし母集団側の改善を波及させる**

特集の候補プールは `relatedGames`（aggregated.json 由来）＋ LLM 提案なので、§3.1（Erotic 除外）・§3.2（DLC 除外）の修正はそのまま恩恵になる。

検討の余地がある点:
- `themes`（22 種）と `game_modes`（6 種）が構造化データとして使えることを確認した。現状の特集テーマは暦イベント起点だが、**「ホラーゲーム特集」「協力プレイ特集」のような構造化テーマも機械的に組める**。ただしこれは「暦イベント」という現行の切り口を薄める方向なので、要議論（§7 論点F）。
- `featureSystem`（`bedrock-client.ts:255`）には Creator's Eye セクションがない。他 3 カテゴリにはある。読者がクリエイター志望であることを踏まえると追加を検討する余地がある。
- **リメイク・リマスターの扱い**: 特集は独自の母集団クエリを持たないため、他枠の `game_type` 方針を継承する。ただし LLM 提案の実在検証経路（`verifyProposedGames` → `searchGameByName`）には `where` 句が無く（Issue #208）、この枠だけ実質無制限になっている。詳細と選択肢は **§7 論点J-4**。

---

#### 【D】名作深掘り (`classic`) — 1 本

**読者への約束**: 「なぜこのゲームは何年経っても評価され続けるのか」。良いゲームの普遍的条件を学ぶ枠。**クリエイター志望の読者にとって最も学びが大きい枠**と考えられる。

**現状の問題**: §2.1 のとおり母集団が `hypes > 100` のみで、実質「近年の話題作リスト」になっている。vol.12 以降 6 号連続で 2026 年発売作が「名作深掘り」として載り、プロンプト（`classicSystem`）が要求する「発売当時の業界状況」「懐かしさ」と噛み合っていない。

さらに `classicSystem` のハルシネーション対策ルールが「発売当時の業界状況、与えた影響に関する具体的な記述」を禁止しているため、**📜ゲームの歴史 セクションが構造的に書けない**（提供データに含まれない限り）。名作枠は「母集団の誤り」と「プロンプトの自己矛盾」の二重の問題を抱えている。

**素案 D-1: 母集団を `total_rating` に置き換え、発売からの経過年数を必須条件にする**

| 項目 | 現行 | 素案 |
|---|---|---|
| 母集団クエリ | `hypes > 100`, `sort hypes desc`, `limit 30` | `total_rating >= 85 & total_rating_count >= 100 & first_release_date < (3年前) & game_type = 0 & themes != (42)`, `sort total_rating_count desc`, `limit 100` |
| 選定条件 | `(metascore > 80 \|\| igdbRating >= 80)` → 追加で `>= 85` or Steam/YouTube 人気 | `total_rating` / `aggregated_rating` 基準に統一 |
| 経過年数 | **条件なし** | ~~**必須**（下限は論点B）~~ → ✅ **設けないことに決着**（2026-08-03。代わりに `total_rating_count >= 200`。§7 論点B の決着ブロック） |
| リメイク・リマスター | 制限なし | ~~`game_type = 0` 維持が有力~~ → ✅ **`game_type = 0` + 「`parent_game` が母集団に不在の `t8`/`t9` のみ」に決着**（2026-08-03。§7 論点J-3 の決着ブロック） |
| 供給量 | — | ✅ **266 件**（`total_rating_count >= 200`・年数下限なし・J-3-e 適用後。52 週クールダウンで 5.1 年分） |

> ⚠️ **上記「素案」の経過年数条件は決着時に棄却された。** 確定した母集団条件は次のとおり。`total_rating >= 85 & total_rating_count >= 200 & themes != (42)` を満たすもののうち、
> - `game_type = 0`（Main Game）、**または**
> - `game_type ∈ {8, 9}`（Remake / Remaster）かつ `parent_game` が上記 `game_type = 0` の集合に含まれないもの
>
> `sort total_rating_count desc`、`limit 200`、**経過年数の下限なし**。年数を設けない理由は §7 論点B の決着ブロック（評価母数が自然に時間フィルタとして働くため年数は不要な二重の網であり、年数で切ると Elden Ring 型の「評価が定着した新しい傑作」を構造的に落とす）。リメイク条件の理由は §7 論点J-3 の決着ブロック（`total_rating >= 85` が 2010年以前の原作を systematically に落とすため、`game_type = 0` のみでは `Resident Evil` / `Half-Life` が名作枠に一度も登場できない）。

素案条件で引いた実際の上位 20 件は §4.5 のとおり全件が「世界的に評価の高いゲーム」であり、要件.md の意図に合致する。

**年代の偏り**: 素案条件の母集団は 2000 年代 116 件・1990 年代 48 件と古い作品が厚い（§4.5）。`total_rating_count` 降順だと GTA V / Witcher 3 のような大作から順に消費されることになる。~~**年代を意図的に散らす仕組み**（例: 直近 4 号で同じ年代を続けない）を入れるかは要議論（§7 論点B）。~~ → ✅ **入れないことに決着**（2026-08-03。1 年分 52 件の年代分布が 2010年代 24 / 2000年代 20 / 1990年代 7 / 1980年代 1 と自然にばらけるため。§7 論点B の決着ブロック）

**プロンプト方針**: `classicSystem` のハルシネーション制約と 📜ゲームの歴史 セクションの矛盾を解消する必要がある。選択肢:
- (a) Tavily による Web グラウンディングを名作枠で強化し、「当時の状況」を検索結果に基づいて書けるようにする
- (b) 📜ゲームの歴史 セクションを廃止し、🏆名作たる理由（ゲームデザインの分析）に集約する
- (c) 現状維持（セクションは残すが実質書けないまま）

読者価値の観点では (a) が最善だが Tavily 呼び出し量が増える。(b) は安全だが「深掘り」の情報量が減る。~~要議論（§7 論点G）。~~

> ✅ **2026-08-04 追記（論点G 決着）: 上記 3 択はいずれも採らず、測定中に追加した (G-4) を採用した。** 上記の「(c) 現状維持（セクションは残すが**実質書けないまま**）」という前提は実測で誤りだった。📜 セクションは**16/17 号で実際に出力されている**（issue-013 のみ欠落）。問題は「書けない」ことではなく、**書かれた 9/16 号がプロンプトの禁止カテゴリに触れていること**である。
>
> また「(a) は Tavily 呼び出し量が増える」という前提も不要だった。実測で律速だったのは検索ではなく**プロンプトに渡す抜粋が 300 字しかないこと**（専用ページは 11/16 で引けているのに、使える抜粋は 7/16）。**呼び出し回数を増やさず、既に取得済みの本文を 1500 字まで使う**のが (G-4) である。詳細は §7 論点G の決着ブロック。

---

## 6. 実装上の共通変更（素案が採用された場合）

### 6.1 IGDB クエリの共通修正

3 つの母集団クエリすべてに適用（**PR #209 で対応済み**、§10 参照）:

```diff
- where ... & themes != (37);
+ where ... & game_type = 0 & themes != (42);
```

**論点J で枠ごとに `game_type` の許可集合を変える場合**、現在 3 クエリで共有している `buildIgdbCommonFilters()` をパラメータ化する必要がある。共通部分（`themes != (42)`）と枠別部分（`game_type`）を分離する形が素直と考えられる:

```ts
// 例: 枠別に許可する game_type を渡せるようにする
function buildIgdbCommonFilters(allowedGameTypes: readonly number[] = [IGDB_GAME_TYPE_MAIN]): string
```

加えて、取得フィールドに `aggregated_rating`, `aggregated_rating_count`, `total_rating`, `total_rating_count`, `game_type` を追加する。`GameData` / `IGDBGame` 型（`scripts/types.ts`）の拡張が必要。`game_type` を記事データまで持ち回れば、プロンプト側で「リメイクであることを明記する」（論点J-1-c）も実装できる。

### 6.2 `isQualifiedGame()` の再設計

現行（`scripts/game-filter.ts`）は OR ゲートで 6 経路あるが、実質 `igdbRatingCount >= 15` と `steamRank` の 2 経路しか生きていない（`metascore` 経路は §2.3 のとおり死んでいる）。

素案では `aggregated_rating` 経路を追加し、`metascore` 経路を `aggregated_rating` に置き換える。閾値は §4.2〜4.4 の供給量実測に基づいて決める（論点D）。

### 6.3 `isLargeStudio()` のシグナル化

§3.4 / §5.2【B】のとおり `companies` エンドポイントの `developed` / `published` 件数を使う。IGDB の `companies` エンドポイントへの追加リクエストが必要になるため、レート制限（IGDB は 4 req/sec）と実行時間への影響を要確認。**候補ごとに毎回引くのではなく、候補確定後の対象のみに引く**設計が妥当と考えられる。

> **【2026-07-30 更新・確定】** 設計方針が実測により確定した（§4.1.5 / §4.1.6 / §11.4 論点 I-1）。
> - **適用範囲**: 論点A の決着により、新作紹介では規模判定を使わない。**インディー枠の除外条件としてのみ使う**
> - **`developed` の生件数を使う。Main 換算はしない**（§11.4.1 で棄却。エディション汚染により精度が上がらず、DLC 主体の大手をインディー側に落とす）
> - **閾値は `developed > 20` を「大手」とする**（§11.4.2）
> - **`published` は使わない**（規模指標として機能しない）
> - **静的リストは残す**。`developed` 件数では The Coalition(8) / Unknown Worlds(9) のような大手専属スタジオを拾えないため、静的リストと閾値の **OR 併用**が必須
> - **`companies.parent` は第 3 のシグナルとして併用できる**が、保有率 15% なので単独では機能しない。多段（SIE → Sony）であること、親の規模は `published` で測る必要があることに注意（併用するかは未決）

### 6.4 供給不足時の挙動

vol.17 のように候補が枯渇した場合、現状は**黙って本数が減る**（警告ログは出るが記事は 0 本のまま公開される）。これ自体が仕様として妥当かは要議論（§7 論点H）。選択肢:
- (a) 現状維持（枠が減っても公開する）
- (b) 他カテゴリで埋める（新作が足りなければインディーを 3 本にする）
- (c) 条件を段階的に緩める（90 日 → 180 日に拡大して再検索する）
- (d) ビルドを失敗させて人が介入する
- (e) 公開はするが「本数不足」を validation の検出対象に昇格させる（測定中に追加した案）

✅ **2026-08-06 追記（論点H 決着）: (e) を採用した。** 生成層の「不足でも発行する」挙動（Issue #179 の設計原則）は**変えない**。変えるのは検証層で、`validate-article.ts` に本数不足の警告タイプを追加し `computeReportStatus()` に算入して `status: error` → Issue 自動起票に乗せる。あわせて `launch.astro` の「毎号6本」（3 箇所）を実態に合う表現に直す。

なお上記の「警告ログは出る」という記述は正しいが、実読の結果**より深い問題が判明した**: `totalArticles` はレポートに記録されているが `computeReportStatus()` の判定入力に入っていないため、**本数不足は号のステータスにも Issue 起票にも Actions サマリにも一切反映されない**。vol.17 が Issue 起票されたのは HIGH 警告 3 件が理由で、新作 0 本は理由に入っていなかった。詳細は §7 論点H。

### 6.5 テスト・検証方針

CLAUDE.md および ~/.claude/CLAUDE.md の規定に従う。
- 実装前に失敗するテストを書く（Red-Green-Refactor）
- 選定条件の閾値は環境変数化し、本番コードにテスト用分岐を入れない
- 境界値（閾値ちょうど、経過年数ちょうど）のテストを必ず含める
- 実データ検証は `DEV_MODE=true npm run build-issue:dev`（`issues-dev/` に出力、本番ディレクトリに書かない）
- 変更前後で選定結果を比較し、意図しない除外が起きていないか確認する
- `known-cases.json` に回帰ケースを追加（Erotic すり抜け、DLC 混入、Nihon Falcom のインディー誤判定）

---

## 7. 意思決定が必要な論点

> **状態（2026-07-30 時点）**: 本節は §11 の議論（2026-07-29/30、対象カテゴリ = **新作紹介・インディー**）を経て一部が決着した。
> **最新の確定事項・残論点は §11 を参照すること。** 本節は論点の初期整理として残す。
>
> | 論点 | 状態 |
> |---|---|
> | A（新作紹介の大手条件） | ✅ **決着**（A-1 = 規模条件を撤廃）→ §11.1 |
> | B（名作の経過年数下限） | 未決（名作枠は今回の対象外） |
> | C（未発売作を扱うか） | ✅ **決着**（C-2 相当 = 発売済み優先の可変配分）→ §11.1 |
> | D（metascore / OpenCritic） | 未決。ただし §11 で「未発売作に `aggregated_rating` は 0 件」が確定 |
> | E（スタジオ規模判定の閾値） | ✅ **決着**（2026-07-30。生件数 + `developed > 20`）→ §11.4 論点 I-1 |
> | F・G | 未決（特集・名作枠は今回の対象外） |
> | H（供給不足時の挙動） | 部分決着（発売済み優先の可変配分で吸収）→ §11.1 |
> | I（移行時の履歴の扱い） | 未決。新たに「N-3=(a) 採用に伴う `HistoryEntry` の phase 追加とマイグレーション」が追加 → §11.4 |
> | J（リメイク・リマスター・移植） | ✅ **全項決着**（J-1 = 2026-08-06 / J-2・J-3 = 2026-08-03 / J-4・J-5 = 2026-08-01） |

以下は初期整理時点では全て未決だった。合意なしに実装着手しない。

### 論点A: 新作紹介の「大手」条件をどう扱うか

> ✅ **決着（2026-07-29）: (A-1) を採用。新作紹介から企業規模条件を撤廃する。** 詳細と根拠は §11.1。

要件.md は「大手企業の」と明記している一方、素案 A-1 は大手条件を必須から外すことを提案している。
- (A-1) 大手条件を外し「注目度」で切る（素案の推奨）— Palworld のような大型インディーも新作枠に入る。インディー枠との境界が曖昧になる
- (A-2) 大手条件を維持し、供給不足は許容する（vol.17 のような 0 件を受け入れる）
- (A-3) 大手条件を維持し、`isLargeStudio` の判定精度を上げて供給を増やす（§6.3 のシグナル化で大手側の判定漏れを減らす）

**関連ケーススタディ**: Splatoon Raiders（Nintendo, 2026-07-23発売）が vol.17 で候補に挙がらなかった事例（§2.4）。大手判定ゲート以前の母集団取得クエリ（`sort hypes desc`）の段階で選外になっており、A-1（`sort aggregated_rating desc` への変更）を採ればこの種のタイトルを拾える可能性があることを示す実例。

### 論点B: 名作深掘りの「経過年数」下限

母集団件数（`total_rating >= 85 & total_rating_count >= 100 & game_type = 0 & themes != (42)`、実測）:

| 下限 | 件数 | 52 週クールダウン換算 | 備考 |
|---|---|---|---|
| 下限なし | **349** | 6.7 年分 | 現行（＝経過年数条件が存在しない） |
| 3 年以上前 | **321** | 6.2 年分 | Elden Ring (2022) が入る |
| 5 年以上前 | **304** | 5.8 年分 | Elden Ring (2022) が外れる |
| 10 年以上前 | **241** | 4.6 年分 | BotW (2017)・God of War (2018)・RDR2 (2018) が外れる |
| 15 年以上前 | **183** | 3.5 年分 | Witcher 3 (2015)・GTA V (2013) が外れる |
| 20 年以上前 | **129** | 2.5 年分 | 2000 年代後半が外れる |

（2026-08-01 再測定。`.claude-scratch/measure-classic.ts` → `out-classic.txt`。3 年下限は以前 322 件と記録していたが同条件の再測定で 321 件。IGDB 側のデータ更新によるもので判断には影響しない）

**下限を厳しくしても供給はほとんど減らない**（349 → 241 で 31% 減、なお 4.6 年分ある）。「何年経っても評価される理由」を論じる枠の趣旨からは 10 年下限も現実的な選択肢である。

また年代を意図的に散らすか（直近 4 号で同年代を続けない等）も要決定。

なおリメイク・リマスターを母集団に含めるかは §7 論点J-3 で別途議論する（含めると各下限で +18〜32 件）。

---

> ## ✅ 論点B の決着（2026-08-03。ユーザー判断）
>
> ### 決定内容
>
> **経過年数の下限は設けない。** 名作枠の母集団は評価母数で定義する。
>
> ```
> 母集団クエリ（fetch-igdb.ts:746 の `where hypes > 100 & ...` を置換）
>   where total_rating >= 85
>       & total_rating_count >= 200
>       & ${buildIgdbCommonFilters()}          // = game_type = 0 & themes != (42)
>   sort total_rating_count desc;
>   limit 200;      // 現行 30 では 4.9 年分の母集団を回せない
> ```
>
> - **経過年数の下限: 設けない**
> - **年代を意図的に散らす仕組み: 入れない**
> - **`aggregated_rating` は母集団条件に加えない**（`total_rating` が既に批評＋ユーザーの合成値であるため）。ただしソート軸として N-6 第 1 軸を流用する余地は残す
>
> ### 決定の経緯（重要 — 当初案を棄却した）
>
> 当初この論点は「経過年数の下限を何年にするか」として設計されており、実測に基づき 10 年下限を推奨していた。**ユーザーの指摘により、この枠組み自体が誤りであることが判明した。**
>
> > 「Elden Ring という特定のゲームを名作として取り上げたいのではなく、Elden Ring は名作として扱われるべきタイトルであり、それが対象から漏れる構造には問題があるのではないか」
>
> **経過年数は「評価が定着したか」の代理指標にすぎず、本来の指標は評価母数（`total_rating_count`）である。** 代理指標で切ると Elden Ring(2022-02) のように「評価が既に定着した新しい傑作」を構造的に落とす。実測はこの指摘を裏付けた。
>
> ### 判断根拠（2026-08-03 実測。`.claude-scratch/measure-classic-def.ts` → `out-classic-def.txt`）
>
> **(1) 年数下限は不要 — 評価母数が自然に時間フィルタとして働く。** 年数下限を一切かけず 349 件を `total_rating_count` 降順に並べ、52 件（クールダウン 1 年分）を消費したときに含まれる「発売 3 年以内」の件数:
>
> | 母数閾値 | 上位 52 件中 3 年以内 | 5 年以内 | 該当タイトル |
> |---|---|---|---|
> | >= 100 | **1 件** | 2 件 | `Baldur's Gate III`(2023-08) |
> | >= 200 | **1 件** | 2 件 | 同上 |
> | >= 300 | **1 件** | 2 件 | 同上 |
> | >= 500 | **1 件** | 2 件 | 同上 |
>
> **年数下限がなくても、1 年間の掲載枠に入る発売 3 年以内の作品は BG3 の 1 件だけ**であり、BG3 は `total_rating=95 / n=1560 / agg=95(n=10)` で名作枠に何の問題もない。
>
> **(2) その機序 — 新しい作品は母数が薄い**（プール内・発売年ごとの `total_rating_count` 中央値）:
>
> | 発売年 | 件数 | 母数の中央値 |
> |---|---|---|
> | 2019 | 10 | 559 |
> | 2020 | 15 | 270 |
> | 2022 | 8 | 374 |
> | 2024 | 8 | 203 |
> | 2025 | 11 | 225 |
> | 2026 | 3 | **131** |
>
> 降順ソートで新作は自然に後ろへ回る。年数下限は**不要な二重の網**だった。
>
> **(3) 現状の誤掲載の真因は年数条件の欠如ではなかった。** `history.json` の classic 16 件を新条件（`total_rating >= 85 & total_rating_count >= 100 & game_type = 0`）に当てると、**9 件が年数条件を一切使わずに母集団外になる**: `Subnautica 2` / `MOLE` / `Dig Island` / `Dungeon Blitz R` / `Pokémon Infinite Fusion` / `Star Citizen` / `Cyberpunk 2077` / `FF VII REMAKE` / `FF VII REMAKE INTERGRADE`（最後の 2 件は非 Main）。
>
> 真因は 2 つ（実読で確認）: ①母集団クエリが `hypes > 100` + `sort hypes desc`（発売前フォロー数順＝定義上「これから出る話題作リスト」）②選定側の品質条件が `igdbRating >= 80` のみで**評価母数を見ていない**（`fetch-data.ts:1022`）。
>
> **(4) Elden Ring はどの母数閾値でも残る**: `2022-02 / n=2229` → `>= 1000` でも通過。
>
> ### 母数閾値 `>= 200` を選んだ理由
>
> | 閾値 | 母集団 | 52週換算 | 落ちる注目作 |
> |---|---|---|---|
> | >= 100 | 349 | 6.7 年分 | — |
> | **>= 200** | **254** | **4.9 年分** | `Suikoden II`(n=113) / `Ghost of Yotei`(n=106) / `Crimson Desert`(2026-03, n=108) / `Pragmata`(2026-04, n=131) |
> | >= 300 | 200 | 3.8 年分 | + `Half-Life: Alyx`(n=255) / `Astro Bot`(n=163) / `Hades II`(n=156) |
> | >= 500 | 147 | 2.8 年分 | + `Hollow Knight: Silksong`(n=482) |
> | >= 1000 | 90 | 1.7 年分 | + `TotK`(n=897) / `Outer Wilds`(n=861) |
>
> - `>= 100` は評価母数の薄い 2026 年発売作（`Crimson Desert` n=108 / `Pragmata` n=131）と `Ghost of Yotei`(n=106) を母集団に残してしまう
> - `>= 300` は `Half-Life: Alyx`(n=255) を落とす。VR の代表的名作を構造的に除外するのは損失
> - `>= 200` は 254 件 = **4.9 年分**で供給に余裕がある
> - 「3 年以内が母集団に 15 件混ざる」ことは実害にならない（上記 (1) のとおり上位 52 に入るのは BG3 のみ）
>
> ⚠️ **`>= 200` でも `Resident Evil Requiem`(2026-02, n=303) は母集団に残る**（`>= 300` でも残る）。この 1 件は母数閾値では排除できない。ただし `total_rating_count` 降順では 200 位以下に沈むため掲載には至らないと考えられる。確実に排除したい場合は別途「発売から N か月」の最小条件が必要になるが、それは本決定で棄却した年数条件の再導入にあたるため、**運用で観察してから判断する**（Issue #210 のパラメータ再調整に含める）。
>
> ### 棄却した案
>
> - **経過年数の下限を設ける（3/4/5/7/10/15/20 年）**: 上記のとおり代理指標であり、Elden Ring 型の「評価が定着した新しい傑作」を構造的に落とす。なお実測では供給差も小さく（3 年 321 件 / 5 年 304 件で差 17 件）、年数の選択は編集判断以外の根拠を持たなかった
> - **`aggregated_rating_count >= 2 & aggregated_rating >= 85` を母集団条件に必須化**: 母数 >= 200 の 254 件中 `agg_count >= 2` は 204 件（80%）で、**50 件（20%）が落ちる**。落ちる側には Metacritic 以前のレトロ名作（`Suikoden II` `Chrono Trigger` 世代）が含まれると考えられる。`total_rating` が既に批評＋ユーザーの合成値なので二重条件になる
> - **年代を意図的に散らすロジック**: 実測で 1 年分 52 件の年代分布が 2010年代 24 / 2000年代 20 / 1990年代 7 / 1980年代 1 と自然にばらけるため（`out-classic2.txt`）、実装コストに見合わない
>
> ### この決定の副作用（④＝論点J-3 に引き継ぎ、✅ 解決済み）
>
> **年数下限を撤廃したため、原作 vs リメイクの同一性混線は年数では縮まらなくなった。** 10 年下限なら混線 7 組に縮んでいたが、年数なしでは 13 組のままである（実測 `out-classic-floor.txt`）。
>
> → ✅ **論点J-3 で決着（2026-08-03）。** クールダウン側を拡張するのではなく**母集団側で解いた**: `game_type ∈ {8,9}` は「`parent_game` が `game_type=0` プールに不在のもの」だけを許可する（J-3-e）。原作とリメイクが同時に母集団に存在し得なくなるため、**混線は定義上 0 件**になる。`HistoryEntry` の拡張も 105 件の移行も不要。詳細は §7 論点J-3 の決着ブロック。
>
> ### 未決の残課題
>
> - **ソート軸**: 上記の実測はすべて `total_rating_count` 降順で行った。これが最終案かは未決着（現行の `sort hypes desc` は §4.1.3 により廃止確定）。`total_rating` 降順にすると `Suikoden II`(n=113) のような母数の薄い作品が上位に来るため単独では使えない。N-6 の 4 軸スコアを流用するかを別途決める
> - **1980 年代の母集団が 2 件しかない**（1990年代 48 / 2000年代 116 / 2010年代 116 / 2020年代 67）。「レトロゲーム枠」を求める場合は `total_rating_count` 閾値自体が制約になる

### 論点C: 未発売作（「もうすぐ発売」）を扱うか

> ✅ **決着（2026-07-29）: 扱う。ただし独立枠にはせず（C-3 を採らず）、新作紹介 2 枠を「発売済み優先の可変配分」で埋め、不足分を未発売作で補う。** 未発売作は情報ソース・記事構成を発売済みと分ける（論点 N-5 → **2026-08-01 決着**。§11.3.1〜11.3.5）。**インディー枠は未発売作を扱わない**（確定事項 #17 / §11.3.2）。詳細は §11.1 / §11.3。

要件.md は明記しているが、現状扱えていない。供給は成立する（今後 90 日で 35 件）。
- (C-1) 扱わない — 要件.md の記述を仕様変更として明示的に落とす。ハルシネーションリスク最小
- (C-2) 新作 2 本のうち 1 本を「もうすぐ発売」枠にする — 未発売専用のプロンプト（プレイ体験・評価を書かない構成）が必要
- (C-3) 5 番目のカテゴリとして独立させる — 号あたり 7 本になり生成コストが増える

### 論点D: `metascore` / OpenCritic をどうするか

§4.6 の結論として `aggregated_rating` への置き換えを推奨したが、実装の形は要決定。
- (D-1) `scripts/fetch-metacritic.ts` を削除し、`GameData.metascore` を廃止して `aggregatedRating` に置き換える — 最もクリーン。`validate-article.ts` / プロンプト / 型定義への波及が広い
- (D-2) `GameData.metascore` を `aggregated_rating` の受け皿として流用し、`fetch-metacritic.ts` の呼び出しだけ止める — 変更範囲が小さいが「metascore」という名前が実体とずれる
- (D-3) OpenCritic API キーを取得して両方使う — コスト増、照合ミスリスク
- (D-4) 何もしない（現状維持）

また品質条件の閾値（`aggregated_rating_count >= 2` が妥当か、`>= 1` を許すか、`>= 3` にするか）も要決定。§4.4 のとおり `n=1` は批評媒体 1 社のみで信頼度が低い。

---

> ### ✅ 決着（2026-08-04）: **(D-1') を採用** — 取得経路・型・プロンプト参照を削除し、表示層とスキーマは残す
>
> #### 【重大な前提の訂正】`metascore` は既に 1 件も取得できていない
>
> 本項は「`aggregated_rating` への置き換え」として書かれていたが、**置き換える対象が存在しなかった**。実行パスを全ステップ実読して確認した事実:
>
> ```
> 全 17 号の frontmatter で metascore を持つ号: 0 号（実測）
> ```
>
> **原因**: `scripts/fetch-metacritic.ts` は Metacritic ではなく **OpenCritic API** を叩く実装であり、`OPENCRITIC_API_KEY` が必須（`:12`, `:15-17`）。しかしキーはどこにも設定されていない:
>
> | 場所 | 状態 |
> |---|---|
> | `.env.local` | **キーなし**（実測 0 件） |
> | `.github/` ワークフロー | `OPENCRITIC` への言及なし |
> | `.env.example:22` | `OPENCRITIC_API_KEY=` （空のプレースホルダのみ） |
>
> キーが無いときの挙動（`fetch-metacritic.ts:71-73`, `:125-128`）:
> ```ts
> if (!isOpenCriticAvailable()) return null;   // searchGameOnOpenCritic
> if (!isOpenCriticAvailable()) {
>   console.log('OpenCritic API key not set, skipping score fetch');
>   return scores;                             // 常に空配列
> }
> ```
>
> 実行パス全体が空を通す:
> ```
> fetch-metacritic.ts   → scores: []（キーなし）
> fetch-data.ts:369     → for (const score of metacriticData.scores) が 0 回
> fetch-data.ts:513     → getGameScore() も null
> GameData.metascore    → 常に undefined
> build-issue.ts:242    → undefined なので frontmatter に書かれない
> ```
>
> **この結果が「全 17 号で 0 件」という実測と一致する。** したがって本項の判断は「置き換え方の選択」ではなく「動作していないコードをどう畳むか」である。
>
> #### 決定内容
>
> **削除するもの**:
> - `scripts/fetch-metacritic.ts` 全体（261 行）
> - `fetch-data.ts` の取得経路（`:369-386` の Metacritic スコア付与、`:509-526` の enrich、`:1065-1128` の並列取得と受け渡し、`:620-621` の重複マージ、`:1199`, `:1226`）
> - 型定義（`types.ts:69-79` の `MetacriticScore` / `MetacriticData`、`:101-102` の `metascore` / `userScore`、`:106` の `source` から `'metacritic'`、`:127`、`:185` の `sourceUrls.metacritic`）
> - **`game-filter.ts:25` の `if (g.metascore != null) return true;`** — `isQualifiedGame()` の 5 経路のうち 1 つだが、`metascore` が常に undefined なので**一度も成立していない**。削除しても挙動は変わらない
> - プロンプト（`bedrock-client.ts:464-466` の `Metacriticスコア:` 行、`:831` の `Metacritic${g.metascore}`、`:415-416`, `:822`, `:846` の型）
> - バリデータ参照（`validate-article.ts:601-602`）と、それを検証している **`validate-article.test.ts:346-356`**（`metascore: 90` を渡して「警告しない」ことを検証しているテストなので削除対象）
>
> **残すもの（過去号互換とスコープ管理のため）**:
> - 表示層 5 ファイル（`GameInfo.astro`, `ScoreBadge.astro`, `ArticleCard.astro`, `ArticleLayout.astro`, `pages/issue/[issueNumber]/article/[slug].astro:245-247`）
> - `src/content.config.ts:15-16`（`.optional()` なので過去号を壊さない）
> - `fetch-official-jp-url.ts:38` の `'metacritic.com'`（公式 URL 判定の除外ドメインリスト。無関係）
>
> #### 判断根拠
>
> **1. `aggregated_rating` を二重に持つ理由がない。** OpenCritic の `topCriticScore` と IGDB の `aggregated_rating` は**同種の指標**（批評家スコアの集計）。③論点B と N-6 で名作枠・新作枠のスコア軸を `total_rating` / `aggregated_rating` に確定させたので、OpenCritic を足しても選定には一切使われない。
>
> **2. (D-3) は Issue #208 と同型の照合ミスリスクを新たに持ち込む。** `searchGameOnOpenCritic()` は `searchResults[0]` を無条件に採用する（`:88`）。これは `searchGameByName` の `limit 1` と同じ構造の欠陥で、`Portal 2` → `Portal Maze 2` 型のすり替わりが起こり得る。しかも `fetch-data.ts:373` にコメントで明記されている: **「Metacritic 側に発売年情報がないため、年照合は適用されずタイトル一致で通る」**。IGDB 経路には年照合があるのに、この経路には無い。
>
> **3. (D-2) は記事に誤った出典を書かせる。** `metascore` フィールドに `aggregated_rating` を入れると、`bedrock-client.ts:465` の `Metacriticスコア: ${gameInfo.metascore}` が**実際には IGDB の値なのに「Metacritic」としてプロンプトに入る**。これは事実性の問題であり、LLM-as-a-judge でも検出できない（提供データ自体が誤っているため）。
>
> **4. (D-4) は無駄な API 呼び出しとログを残し続ける。** `fetch-data.ts:1065-1070` は毎回 `fetchMetacriticData()` を並列実行し、`OpenCritic API key not set, skipping score fetch` を出力する。
>
> #### 副産物として判明した事実（別途対応が必要・本項では決めない）
>
> **`issue-002.md:11` と `issue-004.md:142` に Metacritic への言及がある。**
> ```
> issue-002.md:11  「レビュー集積サイトMetacriticで89点を獲得し、ポケモンシリーズ歴代最高スコアを記録」
> issue-004.md:142 「海外レビューサイトMetacriticでは高評価を獲得」
> ```
> **`metascore` は常に undefined なので、これらは提供データに基づかない記述＝LLM のハルシネーションと考えられる**（`bedrock-client.ts:464` の条件が false なので `Metacriticスコア:` 行はプロンプトに入っていない）。特に issue-002 の「89点」は**出典付きの具体的な数値**であり、`validate-article.ts:601` は `metascore != null` のときだけ既知数値に加えるため、**検出されるべきだった**。
>
> vol.2 当時に当該バリデータが存在したかは**確認していない**（未検証）。現在の `validate-article.ts` がこの形（提供データに無い出典付き数値）を捕まえられるかは別途確認が必要と考えられる。**論点D の決定はこの課題に影響しない**（D-1' で `metascore` 参照を消しても、常に undefined だったので数値検証の挙動は変わらない）。
>
> #### 棄却した案
>
> - **(D-1)（元の案）** — `GameData.metascore` を `aggregatedRating` に「置き換える」としていたが、**置き換える対象が動作していなかった**ため前提が成立しない。`aggregated_rating` の `GameData` への追加は PR-B（N-6 スコア実装）の作業であり、本項の範囲ではない
> - **(D-2)** — 上記 3 のとおり記事に誤った出典が書かれる
> - **(D-3)** — 上記 2 のとおり年照合なしの `searchResults[0]` 採用で、Issue #208 と同型の欠陥を新規に導入する
> - **(D-4)** — 上記 4 のとおり無駄な呼び出しが残る
> - **表示層とスキーマの削除** — 過去 17 号は `metascore` を持たないため互換上の問題はないが、`GameInfo.astro:114` は `(metascore || userScore) && (...)` で条件表示しており、消すと props 型変更が 4 ファイルに波及する。**選定・生成に影響しない表示層まで削るのは PR のスコープを不必要に広げる**ため残す（デッドコードとして残ることは認識した上での判断）
>
> #### 品質条件の閾値について
>
> 本項末尾の「`aggregated_rating_count >= 2` が妥当か」は、**論点B（2026-08-03）で決着済み**。名作枠の母集団条件は `total_rating >= 85 & total_rating_count >= 200` であり、`aggregated_rating_count` を必須条件にしない（母数 >= 200 の 254 件中 `agg_count >= 2` は 204 件で 50 件が落ち、Metacritic 以前のレトロ名作が排除される）。新作枠での `aggregated_rating_count >= 2` は N-6 の決着（2026-08-01）に含まれる。
>
> #### 実装上の位置づけ
>
> **単独 PR（PR-D）として実装できる。** 削除のみで挙動不変なので、他の PR との依存がない。ただし `fetch-data.ts` の名作枠選定部（`:1015`, `:1022`, `:1025`, `:1036`）は③④で全面書き換えの対象なので、**名作枠 PR と競合する。名作枠 PR より前か後にまとめるのが安全**。

### 論点E: スタジオ規模判定の閾値

> ✅ **決着（2026-07-30）: `developed` の生件数を使い、`developed > 20` を「大手」としてインディー枠から除外する。静的リストとの OR 併用を維持する。** 詳細と根拠は §11.4 論点 I-1。
>
> **経緯**: 2026-07-29 時点では「`developed` は DLC・Bundle・Pack をすべて含むため生件数は使えず、Main 換算が必要」と判断していた（§4.1.5）。しかし 2026-07-30 にプール全 85 社を Main 換算して再測定した結果、**(1) `game_type = 0` にエディション違いが混入しており Main 換算値自体が不正確**（Mad Head Games の Main 15 本は実質 7 本）、**(2) Main 換算は DLC 主体の大手をインディー側に落とす**（Milestone S.r.l. は 66→Main 2）、**(3) 数え方の選択が判定を変えるのは 6/85 社**という 3 点が判明し、Main 換算は棄却した。**採用した閾値 `> 20` ではエディション汚染が判定に影響しない**ことも確認済み。
>
> また **`published` は規模指標として使用不可**であることも実測で確定した（tinyBuild `published=149` に対し Yacht Club Games 17。かつ `published` は他社開発作品を含む。§4.1.5）。したがって本項末尾の「publisher 側も見るか」という選択肢は否定される。
>
> 適用範囲: 論点A の決着により、規模判定は**新作紹介では使わず、インディー枠の除外条件としてのみ使う**。

（以下は 2026-07-26 時点の初期整理。生件数前提のため現在は無効）

`companies.developed` 件数の閾値をどこに引くか。§3.4 の実測値を参照。
- `developed <= 10`: PocketPair(7) / Crate(8) / Hound13(1) が通る。Studio Wildcard(20) は落ちる
- `developed <= 15`: 同上
- `developed <= 30`: Cygames(32) は落ちるが際どい

publisher 側も見るか（`published` 件数）、大手パブリッシャーが付いた小規模開発（受託）をどう扱うかも要決定。

### 論点F: 特集テーマに構造化テーマを加えるか

現行は暦イベント起点。IGDB の `themes`（22 種）/ `game_modes`（6 種）を使った構造化テーマ（「ホラー特集」「協力プレイ特集」）も機械的に組める。
- (F-1) 暦イベント起点を維持（現状維持）
- (F-2) 暦イベントが薄い週のフォールバックとして構造化テーマを使う
- (F-3) 構造化テーマを主軸にする
- (F-2') イベント 0 件週のフォールバックとして、**発行日から後方向（過去）に遡って直近の記念日**を採用する（測定中に追加した案）

---

> ### ✅ 決着（2026-08-05）: **(F-2') を採用** — 暦イベントを主軸に残し、イベント 0 件週は「後方向に 7 日遡って直近の記念日」で埋める
>
> **⚠️ 検討経緯**: 当初 (F-2)「イベント 0 件週に IGDB の構造化テーマ（`themes` / `game_modes`）をフォールバックとして使う」で決着しかけたが、**ユーザー判断により変更した**。理由は「設計されている記念日から離れすぎるのは意図に合わないため、直近のイベントに限定したい」。**IGDB の構造化テーマは使わない。**
>
> #### 決定内容
>
> **暦イベント起点は主軸として維持する。** 変更するのは `selectFeatureThemeWithAI()` の「イベント 0 件」分岐のみ。
>
> **(1) `scripts/bedrock-client.ts:615-617` の固定フォールバックを差し替える**
>
> ```ts
> // 現行
> if (events.length === 0) {
>   return '今週の注目ゲーム特集';
> }
> ```
>
> イベントが 0 件のときは、**発行日から後方向（過去）に最大 7 日遡り、最も近い記念日を採用する**。
>
> - **遡る上限は 7 日**。実測では最大 5 日前で足りたが、`japanese-events.json` の改訂に備えて余裕を持たせる
> - **除外対象は「直近 N 号がテーマとして使った記念日」のみ。** 窓に入っただけで使われなかった記念日は除外しない（後述の判断根拠 3）
> - 7 日前まで遡っても候補が無い場合に限り、前方向（+8 日以降）を見る
>
> **(2) `scripts/generate-articles.ts:714-715` の `gameThemeHint` 経路も同時に直す**
>
> ```ts
> const gameThemeHint =
>   events.length > 0 ? events.map((e) => e.gameThemeHint).join(', ') : theme;
> ```
>
> イベント 0 件のとき `theme`（現行では固定文言）がそのまま `gameThemeHint` になり、`featureThemeGameProposalPrompt` の「指定されたテーマ」として LLM のゲーム提案に渡る。(1) でフォールバックが記念日を返すようになれば、**その記念日の `gameThemeHint`（例: 「鉄道・旅ゲーム」）をそのまま渡す**。
>
> #### 判断根拠（2026-08-05 実測。`.claude-scratch/measure-f.ts` 〜 `measure-f4.ts`）
>
> **1. 「イベントが薄い週」は実在する。年 52 週のうち 5 週がイベント 0 件**（`measure-f.ts` → `out-f.txt`）。`data/japanese-events.json`（127 件・version 1.2）で 2026 年の全土曜日について `getEventsInRange(発行日, 7)` を実行した結果:
>
> | | 週数 |
> |---|---|
> | イベント **0 件** | **5 週**（2026-04-11 / 05-23 / 06-13 / 08-22 / 09-12） |
> | イベント 1 件 | 9 週 |
> | イベント 4 件以上 | 16 週 |
> | 1 週あたり平均 | 2.6 件 |
>
> イベント定義は月ごとに 10〜12 件でほぼ均等（1月 11 / 2月 10 / … / 12月 11）だが、**土曜発行 + 7 日窓という切り取り方の結果として 5 週の穴が生じる**。`gameThemeHint` は 127 件中 116 件がユニークで、重複は「農業ゲーム」「ホラーゲーム」「和文化ゲーム」等 8 種。
>
> **2. 暦イベント起点は 14/17 号で実際に機能している（出力の実測）**（`measure-f2.ts` → `out-f2.txt`）。特集タイトルがイベント名に紐づいた号は 14/17。紐づかなかった 3 号のうち **2 号はイベント 0 件の号そのもの**だった:
>
> | 号 | 発行日 | イベント | 特集タイトル |
> |---|---|---|---|
> | issue-002 | 2026-04-11 | **0 件** | 今週プレイすべき注目タイトル4選：新作から隠れた名作まで徹底紹介 |
> | issue-008 | 2026-05-22 | **0 件** | 2026年5月第4週の注目ゲーム4選：日本が舞台のForza新作とSlay the Spire続編が登場 |
> | issue-013 | 2026-06-26 | 2 件（露天風呂の日 / 海開き） | 夏の海を満喫できるゲーム3選 ※「海開き」から発想したと考えられるが表層一致しなかった |
>
> 機能した例: 「世界保健デー特集：命を救うドクター・病院経営ゲーム」「国際博物館の日特集：古代遺跡の謎に挑む歴史探索ゲーム4選」「オカルト記念日に贈る、背筋が凍る本格ホラーゲーム5選」。**イベントがゲームジャンルへの具体的な橋渡しになっている。**
>
> **3. テーマ不在の号は「人気順の先頭」に収束していた（これが (F-2) を選んだ決定的根拠）**（`measure-f4.ts` → `out-f4.txt`）。特集本文から紹介ゲームを抽出し号横断で照合した結果:
>
> | | 他号の特集にも登場した割合 |
> |---|---|
> | **イベント 0 件の号（2 号）** | **5/10 タイトル = 50%** |
> | イベントあり号（15 号） | 3/29 タイトル = **10%** |
>
> 具体的な重複:
>
> | タイトル | 登場号 |
> |---|---|
> | `Forza Horizon 6` | **vol.2 と vol.8**（両方ともイベント 0 件の号） |
> | `Slay the Spire II` | **vol.2 と vol.8**（同上） |
> | `Subnautica 2` | vol.8 と vol.10 |
> | `ウィッチャー` | vol.4 と vol.5（GW 特集が 2 週連続したため） |
>
> vol.2 と vol.8 は 6 週間離れているが、テーマが両方とも固定文言なので**同じ人気タイトルが選ばれた**。
>
> **4. 後方向（過ぎたばかりの記念日）のほうが前方向より圧倒的に近い**（`measure-f5.ts` → `out-f5.txt`）。土曜基準の 0 件週 5 件すべてで:
>
> | 0 件週 | 後方向の最近 | 前方向の最近 |
> |---|---|---|
> | 2026-04-11 | **-1日** 駅弁の日（鉄道・旅ゲーム） | +11日 アースデイ |
> | 2026-05-23 | **-5日** 国際博物館の日 | +8日 世界禁煙デー |
> | 2026-06-13 | **-1日** 恋人の日 | +8日 父の日 |
> | 2026-08-22 | **-3日** 俳句の日 | +9日 野菜の日 |
> | 2026-09-12 | **-3日** 救急の日 | +8日 空の日 |
>
> 後方向は **1〜5 日前**、前方向は **8〜11 日先**。「記念日から離れすぎない」という要求には**後方向が合致する**。
>
> **5. 窓を常時広げる案は副作用が大きいため棄却した**（`measure-f5.ts`）。
>
> | 窓 | 0 件週（土曜基準） | 隣接週とイベント集合が重なる週 |
> |---|---|---|
> | **7 日（現行）** | 5 週 | **1/51** |
> | 9 日 | 0 週 | — |
> | 10 日 | 0 週 | **38/51**（重複イベント計 61 件） |
> | 14 日 | 0 週 | **46/51**（重複 126 件） |
>
> 常時 10 日にすれば 0 件週は消えるが、隣接号で同じ記念日を使う危険が 1/51 → 38/51 に激増する。**「0 件のときだけ遡る」段階的フォールバックでなければならない。**
>
> **6. 除外の基準を「窓に入った」ではなく「実際に使った」にすると 1〜5 日前で採用できる（これが F-2' の設計を決めた）**（`measure-f6.ts` → `out-f6.txt`）。
>
> **窓に入った記念日と、テーマとして使われた記念日は別物である。** 17 号の実測で、窓に入った記念日 40 種のうち**実際にテーマとして使われたのは 14 種**で、**26 種は使われず余っていた**。
>
> 実際の 0 件週 2 件で検証した結果:
>
> **issue-002（2026-04-11）** — 直前号は「世界保健デー」、直後号は「アースデイ」を使用
>
> ```
>  -1日 (04-10) 駅弁の日(鉄道・旅ゲーム)          ← ✅ 採用可
>  -3日 (04-08) 入学式(学園・青春・新生活ゲーム)
>  -4日 (04-07) 世界保健デー                       ❌ 直前号が使用済み
>  -7日 (04-04) あんぱんの日(料理・パン屋経営)
> ```
>
> **issue-008（2026-05-22）** — 直前号は「国際博物館の日」、直後号は「写真の日」を使用
>
> ```
>  -4日 (05-18) 国際博物館の日                     ❌ 直前号が使用済み
>  -5日 (05-17) 世界電気通信の日(ネットワークゲーム) ← ✅ 採用可
>  -7日 (05-15) 沖縄本土復帰記念日(島・南国ゲーム)
> ```
>
> **どちらも 1〜5 日前の記念日で埋まる。** 「駅弁の日 → 鉄道・旅ゲーム特集」「世界電気通信の日 → ネットワークゲーム特集」はいずれも記念日起点として成立している。
>
> **逆に、除外を「直前号の窓に入っていたもの」まで広げると -8〜-12 日まで遡ることになり不必要に遠くなる**（2026 年の全 0 件週で実測: -8日 沖縄本土復帰記念日 / -9日 国際子どもの本の日 / -9日 ドラえもんの誕生日 / -11日 山の日 など）。**除外は「実際にテーマとして使った記念日」に限る。**
>
> **7. 変更が 1 箇所に閉じる。** 壊れているのは `bedrock-client.ts:615-617` の 3 行と、それが流れる `generate-articles.ts:714-715` の 1 箇所だけ。(F-3) のように全面置換する必要はない。
>
> **8. 参考: 構造化テーマの供給は十分あった（当初 (F-2) の根拠。採用しないが記録として残す）**（`measure-f.ts` → `out-f.txt`）。`themes` 22 種 / `game_modes` 6 種について `total_rating >= 75 & total_rating_count >= 50 & game_type = 0 & themes != (42)` で件数を引いた結果、供給が 8 件未満だったのは `Battle Royale`(8 件) のみ。`Open world` 283 / `Horror` 228 / `Historical` 199 / `Co-operative` 451 など。**供給量は問題ではなく、「記念日起点という編集意図から離れる」ことが棄却理由である。**
>
> **6. 現在はクールダウンが後付けで効いている（ただし vol.2 / vol.8 当時は無かった）。** `game-history.ts:25` に `feature: 17`（約4ヶ月）が設定され、`build-issue.ts:602-608` が `article.recommendedGames` の各 `title` を履歴に記録する。ただし `history.json` の feature 履歴 24 件は**すべて vol.12 以降**であり、vol.2 / vol.8 当時は記録されていなかった。したがって上記 3 の重複は「クールダウンが無かった時期の実害」であり、**現在なら同じ重複は 17 週クールダウンで防がれると考えられる**。それでも (F-2) が必要な理由は、クールダウンは「同じタイトルの再掲」を防ぐだけで、**テーマが無いこと自体（＝特集が人気順の羅列になること）は防げない**ため。
>
> #### 棄却した案
>
> - **(F-2) IGDB 構造化テーマをフォールバックにする**: **ユーザー判断により棄却**。「設計されている記念日から離れすぎるのは意図に合わない」。供給量（判断根拠 8）や実装の容易さでは問題なかったが、`Open world` / `Horror` のような抽象カテゴリは `japanese-events.json` に込められた「記念日 → ゲームジャンル」という編集意図から外れる
> - **(F-3) 構造化テーマを主軸**: 14/17 号で機能している暦イベント起点を捨てることになる。「母の日に家族で楽しむ協力プレイゲーム」「七夕に遊びたい星空と宇宙のゲーム」のような**季節性・情緒的な訴求を失う**
> - **(F-1) 現状維持**: 年 5 週で特集がテーマを失う。実測で 50% が他号と重複していた
> - **(F-1') `gameThemeHint` への流入だけ直す**: (2) のみ実施する案。0 件週のテーマ不在という本体の問題が残る
> - **窓を常時 9〜10 日に広げる**: 0 件週は消えるが隣接週の重複が 1/51 → 38/51 に激増（判断根拠 5）
> - **除外を「直前号の窓に入っていた記念日」まで広げる**: -8〜-12 日まで遡ることになり「直近に限定する」という要求に反する（判断根拠 6）
>
> #### 測定手法の限界（明示）
>
> - **特集の紹介ゲームは本文の `『』` 抽出で得たもので、`recommendedGames` フィールドではない。** イベント名（「世界海洋デー」「恋人の日」）や情緒表現（「大切な人との絆」「ときめき」）が混入するため手作業のノイズリスト 18 語で除去している。**網羅ではなく、取りこぼし・過剰除去がありうる**
> - **日英表記ゆれの吸収は実データを見て手で作ったエイリアス表 8 組**（`Subnautica 2` / `サブノーティカ２` など）に依存している。論点J-3 で学んだとおりタイトル文字列の正規化は原理的に不完全であり、**重複を取りこぼしている可能性がある**（＝ 50% / 10% はいずれも下限寄り）
> - **「50% vs 10%」は 2 号 vs 15 号の比較**で、イベント 0 件の号のサンプルが 2 件しかない。傾向は明確だが統計的な強度は弱い
> - **発行日の実測では 17 号中 11 号が金曜日だった**（土=6）。CLAUDE.md の「毎週土曜日 AM 6:00 (JST)」と実際の `publishDate` がずれている理由は**未調査**。上記 1 の 52 週測定は土曜基準で行ったため、**実運用の曜日とは一致していない**（金曜基準なら 0 件週の顔ぶれは変わる）
>
> #### 実装上の位置づけ
>
> - **PR-F として単独実装できる**（他の論点と独立。特集枠の 2 箇所のみ）
> - **「直近 N 号がテーマとして使った記念日」を判定するには記念日の使用履歴が必要になる。** `history.json` は**ゲームタイトル**を記録しており**記念日名は記録していない**（実読で確認）。記録先（`history.json` の拡張 / 過去号 frontmatter の走査 / 別ファイル）と N の値は実装時に決める。記録するのは記念日名のみで済む
> - **フォールバックが発火した号を判別できるようにする**（ログまたは frontmatter）。現行は固定文言に落ちたことが出力から追えず、実際に発火した 2 号（vol.2 / vol.8）は特集タイトルの傾向から推測するしかなかった
>
> #### 測定手法の限界（追記。F-2' 固有）
>
> - **「実際にテーマとして使った記念日」の同定は特集タイトルとの表層一致**で行った（`measure-f6.ts`）。`issue-013`（露天風呂の日 / 海開き → 「夏の海を満喫できるゲーム3選」）は**同定できなかった**。「海開き」から発想したと考えられるがタイトルに記念日名が現れていない。したがって「使われた 14 種 / 余った 26 種」という切り分けには取りこぼしがある
> - **フォールバックの検証は 2026 年の `japanese-events.json`（version 1.2）に対するもの**。イベント定義を改訂すれば 0 件週の顔ぶれと遡る日数は変わる
>
> #### 本論点の範囲外として切り出す課題
>
> - **発行日が土曜でなく金曜になっている（実測 11/17 号）**。CLAUDE.md および GitHub Actions の設定（毎週土曜 AM 6:00 JST）と実際の `publishDate` の不一致。原因未調査。イベント窓の当たり方に直接影響するため、PR-F の実装前に確認しておくのが望ましい。**なお 0 件週の数は基準曜日で変わる**（土曜基準 5 週 / 金曜基準 3 週。実測）が、F-2' はどちらでも成立する（金曜基準の 3 週も後方向 -2〜-4 日で埋まる）
> - **`history.json` に特集で使った記念日が記録されていない**。上記のとおり F-2' の「使用済み除外」に必要

### 論点G: 名作深掘りの「歴史」セクション

`classicSystem` のハルシネーション制約と 📜ゲームの歴史 セクションが矛盾している。
- (G-1) Tavily グラウンディングを強化して書けるようにする（Tavily 呼び出し増）
- (G-2) 📜ゲームの歴史 を廃止し 🏆名作たる理由 に集約する
- (G-3) 現状維持
- (G-4) 📜 を残し、禁止リストを 📜 の要求と整合させたうえで、プロンプトに渡す抜粋長を 300 → 1500 字に揃える（測定中に追加した案）

---

> ### ✅ 決着（2026-08-04）: **(G-4) を採用** — 禁止リストを整合させ、プロンプト抜粋を 300 → 1500 字に拡大する
>
> #### 決定内容
>
> 📜ゲームの歴史 セクションは**維持する**。矛盾の原因は「セクションの存在」ではなく「プロンプトの禁止リストの書き方」と「プロンプトに渡る抜粋が短すぎること」の 2 点であり、それぞれを直す。
>
> **(1) `scripts/bedrock-client.ts` の `classicSystem` を修正する**
>
> - 禁止リストの最終項目 `:342`「発売当時の業界状況、与えた影響に関する具体的な記述（「〜の先駆け」「〜に影響を与えた」等は提供データに無ければ書かない）」を**削除する**。`:333` の「推測や創作は絶対にしない」が同じことを既に述べており、この項目は重複した念押しでありながら、📜 セクションの要求文と表面上正面衝突している
> - 代わりに 📜 セクションの指示 `:315`「※提供された歴史・影響に関する情報を参考にしてください」を、**「※提供された情報に無い歴史・影響は書かないこと。材料が無い場合は本セクションを省略すること」**に強める
>
> **(2) `scripts/fetch-web-search.ts` の抜粋長を揃える**
>
> - `:215` / `:225` / `:235` / `:245` の `content.slice(0, 300)` を `content.slice(0, SNIPPET_MAX_LENGTH)`（= 1500）に変更し、**プロンプトとバリデータが同じ本文を見る**ようにする
> - `:264` の `SNIPPET_MAX_LENGTH = 1500` を単一の定義元として共用する
>
> **(3) `searchGameHistory()` のクエリ改善は補助として同時に行う**
>
> - `:132` の `` `"${gameTitle}" 歴史 影響 名作 ゲーム業界` `` に**発売年**を加える（実測で改善が見られた変種 v1）。ただし後述のとおり効果は不安定であり、主たる対策は (2) である
>
> #### 判断根拠（2026-08-04 実測。`.claude-scratch/measure-g.ts` 〜 `measure-g5.ts`）
>
> **1. プロンプト内の矛盾は実在する（実読）。** `bedrock-client.ts:313-315` は 📜 に「発売当時の背景、業界への影響など（150〜200文字）」を要求する一方、同じプロンプトの `:342` が「発売当時の業界状況、与えた影響に関する具体的な記述」を禁止している。さらに `:335-341` は個人名 / 売上本数 / 受賞歴・スコア・順位 / 続編の存在 / 開発期間も禁止しており、歴史記述の材料がほぼ全て禁止対象に含まれる。
>
> **2. 出力側の実測: 📜 は 16/17 号で書かれており、うち 9 号が禁止カテゴリに触れている**（`measure-g4.ts` → `out-g4.txt`）。
>
> | 禁止カテゴリ | 該当号数 | 実例 |
> |---|---|---|
> | 業界への影響の具体記述 | 5/16 | issue-002「業界に多大な」「波及」「革新的」「新たな可能性」 |
> | 続編・関連作の存在 | 4/16 | issue-006「全3部作」 / issue-010「前作『」 |
> | 売上本数・DL数 | 3/16 | issue-002「5000万本」 / issue-007「1500万本」 / issue-014「200万本」 |
> | 受賞歴・スコア・順位 | 3/16 | issue-005「受賞」「Game of the Year」 / issue-006「第3位」「ランクイン」「トップセールス」 |
> | 個人名 | 2/16 | issue-004「クリス・ロバーツ」 / issue-007「本名：」「Eric Barone」「ConcernedApe」 |
> | 開発期間・費用・人数 | 1/16 | issue-007「一人で」 |
>
> **禁止カテゴリを 1 つも含まない 📜 は 7/16 号**（issue-001 / 008 / 009 / 011 / 012 / 016 / 017）。つまり (G-2) の全廃は「禁止事項を踏まずに書けていた 44% の号」も同時に失う。
>
> **3. 律速は検索ではなく抜粋長である（これが (G-4) を選んだ決定的根拠）。** 名作枠の 16 タイトルで現行クエリをそのまま実行した結果（`measure-g3.ts` → `out-g3.txt`）:
>
> | 指標 | 実測 |
> |---|---|
> | A) そのゲーム専用のページを引けた | **11/16** |
> | B) プロンプトに渡る 300 字が 📜 の材料を含んだ | **7/16** |
> | A と B の差 | **4 件が「ページは引けたが抜粋が使えない」** |
>
> 「ページ○・抜粋✕」の 8 件は `Super Mario 64` / `BioShock` / `Assassin's Creed II` / `The Witcher 3` / `Red Dead Redemption 2` / `Elden Ring` / `Grand Theft Auto V` / `Baldur's Gate III`。いずれも Wikipedia 等の専用ページを引けているが、先頭 300 字が受賞リストや定型の序文で埋まっており、歴史記述には使えない。**検索を強化しても、抜粋が 300 字のままではこの 8 件は救えない。**
>
> **4. (G-1) 単独では不安定（実測）。** 失敗した 10 件に対してクエリ変種 4 種を試した結果（`measure-g2.ts` → `out-g2.txt`）:
>
> | タイトル | v0 現行 | v1 発売年追加 | v2 短文 | v3 wiki指定 |
> |---|---|---|---|---|
> | Super Mario 64 | 0/3 | **1/3** | 0/3 | 0/3 |
> | BioShock | 0/3 | 0/3 | **2/3** | 1/3 |
> | GTA: Vice City | 0/3 | 1/3 | 0/3 | **2/3** |
> | Red Dead Redemption 2 | 0/3 | 0/3 | **2/3** | 1/3 |
> | The Witcher 3 | 0/3 | 0/3 | **1/3** | 0/3 |
> | GTA: San Andreas | 0/3 | 0/3 | 0/3 | 0/3 |
>
> **どの変種も全タイトルで安定せず、`Grand Theft Auto: San Andreas` は 4 変種すべてで 0/3。** v1（発売年追加）は 10 件のうち 6 件を救済したので併用する価値はあるが、これ単独を主対策にはできない。
>
> なお現行クエリには**明確な失敗例**もある。`The Legend of Zelda: Ocarina of Time` は 3 件中 2 件が英単語 `the` の辞書ページ（Wiktionary / dictionary.com、score 0.037）であり、`Hades` は 3 件すべてが「ゲーム業界の転機となった10の出来事」等の一般記事でそのゲームの話を含まない。`GTA: San Andreas` / `Vice City` は 3 件すべてが GTA シリーズ全体の記事だった。
>
> **5. プロンプト 300 字とバリデータ 1500 字の非対称が偽陰性を生む（本論点の調査中に発見。`measure-g5.ts` → `out-g5.txt`）。**
>
> ```
> fetch-web-search.ts:215,225,235,245  → プロンプトには content.slice(0, 300)
> fetch-web-search.ts:264,281          → webSearchSources.snippet は content.slice(0, 1500)
> validate-article.ts:174,188          → sourcedFrom 判定は snippet(1500) に対して照合
> judge-article.ts:150                 → judge も snippet(1500) を見る
> ```
>
> 48 件の検索結果で実測（content 平均 1591 字 / 300 字超 42 件 / 1500 字超 31 件）:
>
> | 区間 | 出典が必要な定量値の個数 |
> |---|---|
> | プロンプト 300 字の中 | **10 個** |
> | 300〜1500 字だけに存在 | **31 個** |
>
> **この 31 個は記事を書く LLM には渡っていないのに、バリデータは `sourcedFrom` を付けて警告を抑制する。** 実例として `The Witcher 3` の日本語 Wikipedia は 300〜1500 字の区間に「2800万本」「5000万本」「6000万本」「6500万本」を含み、`Super Mario World` の Wikipedia は「2061万本」「382万本」「355万本」「第2位」を含む。記事がこれらを書いた場合、実体は内部知識由来（ハルシネーション）だが「根拠あり」と判定される。抜粋を 1500 字に揃えると**この穴は構造的に閉じる**。
>
> **6. コスト影響は小さい。** content 平均は 1591 字なので 1500 字はほぼ全文に相当する。名作枠は 1 号 1 本、Tavily 結果は `reviews` 3 件 + `history` 3 件 = 6 件なので、増分は 1 記事あたり概ね 7,200 字（300→1500 × 6 件）＝日本語で数千トークン程度と見積もられる。Tavily の呼び出し回数は**増えない**（既に取得済みの本文を捨てずに使うだけ）。
>
> #### 棄却した案
>
> - **(G-2) 📜 廃止**: 禁止カテゴリを踏まずに書けていた 7/16 号を失う。また非対称（上記 5）は `reviews` / `developerInfo` / `steamReviews` の 3 セクションにも同じ形で存在するため、📜 を廃止しても別途対応が必要になる
> - **(G-1) 単独**: 上記 4 のとおり効果が不安定。ただし v1 のクエリ改善は (G-4) に含めて併用する
> - **(G-3) 現状維持**: 9/16 号での禁止事項違反が続く
>
> #### 本論点の範囲外として切り出す課題
>
> **受賞歴・ランキング順位を検出するバリデータが存在しない（実読で確認）。** `validate-article.ts:438-457` の `NUMERIC_PATTERNS` に「受賞」「Game of the Year」「第N位」を捕まえるパターンは 1 つもない（grep で 0 件）。また `validatePersonAttribution()`（`:544-587`）は `〜氏によると` / `CEOの〜` 形式しか見ないため、`Eric Barone` / `ConcernedApe` のような裸の人名は検出されない。**これは 📜 に限らず全カテゴリ・全セクションに効く検出範囲の問題**なので、⏸保留中の「high 警告の重大性の再定義」（§11.3.7）と同じ束で扱う。
>
> 実際に validation レポートで確認できた `classic` 警告は全期間で 7 件のみ、うち 📜 本文内は issue-007 の「1500万本」2 件（いずれも `sourcedFrom=なし`＝未グラウンドとして正しく検出）だけだった。issue-003 / 004 / 005 は禁止カテゴリを含むが 📜 本文内の警告は 0 件で、すり抜けている。
>
> #### 測定手法の限界（明示）
>
> - **`measure-g3.ts` の `isDedicatedPage()` は URL とタイトルの表層一致による判定であり、誤検出がある。** 具体例として `Elden Ring, a Masterpiece of Modern Gaming`（tamug.edu）を URL に `eldenring` を含むため「専用ページ」に分類した。したがって A) 11/16 は上限寄りの値と考えられる
> - **`measure-g4.ts` の禁止カテゴリ検出は正規表現による表層一致であり、意味的な判定ではない。** 「影響を与え」等の語が提供データに根拠を持つケースと持たないケースを区別できないため、9/16 号という数字は「禁止カテゴリの語を含む号数」であって「実際にハルシネーションした号数」ではない
> - **validation レポートは 17 号中 8 号分（1, 3, 4, 5, 7, 8, 9, 17）しか存在しない。** 残り 9 号はバリデータがすり抜けたのか、そもそも検証されていないのかを**確認できない**。したがって「すり抜け 3 件」は下限値である
>
> #### 実装上の位置づけ
>
> - (1) プロンプト修正と (3) クエリ改善は**名作枠 PR（③論点B + ④論点J-3）に含める**（同じ `classicSystem` / 名作枠の検索経路を触るため）
> - (2) 抜粋長の 300 → 1500 は**全カテゴリに影響する**ため、名作枠 PR とは分けて単独 PR にする。プロンプトが長くなることによる出力品質の変化を `DEV_MODE=true` で 4 カテゴリすべて確認してからマージする

### 論点H: 供給不足時の挙動

§6.4 の (a)〜(d)。vol.17 の「黙って 0 本」を仕様として許容するか。

- (a) 現状維持（枠が減っても公開する）
- (b) 他カテゴリで埋める（新作が足りなければインディーを 3 本にする）
- (c) 条件を段階的に緩める（90 日 → 180 日に拡大して再検索する）
- (d) ビルドを失敗させて人が介入する
- (e) **公開はするが「本数不足」を一級の検出対象に昇格させる**（測定中に追加した案）

> ### ✅ 決着（2026-08-06）: **(e) を採用** — 公開は止めず、不足を validation の status に算入して Issue 自動起票に乗せる
>
> #### 決定内容
>
> **(1) 生成層の挙動は変えない。** 「枠を埋めるために不適格なゲームを載せない」「号全体を止めない」という Issue #179 の設計原則（`completeness-gate.ts:588-593` にコメントとして明記されている）をそのまま維持する。本数が足りなければ少ない記事数で発行する。全滅ガード（`newReleases` と `indies` が**両方**空のときのみ `fail`。`completeness-gate.ts:591-597`）も現状のまま。
>
> **(2) 検証層に「本数不足」を追加する。** `validate-article.ts` に本数不足の警告タイプを新設し、`format-validation-report.ts` の `computeReportStatus()`（`:38-51`）の判定入力に算入する。これにより `status: "error"` となり、`weekly-build.yml:113-160`（Issue #202 で実装済みの自動起票経路）にそのまま乗る。
>
> - **判定条件**: カテゴリごとの期待本数（newRelease 2 / indie 2 / feature 1 / classic 1）を**1 カテゴリでも下回れば** high
> - **severity = high** とする理由: 実測で該当は 3/17 号なので毎週鳴るノイズにはならない。⏸保留中の「high 警告の重大性の再定義」（§11.3.7）と同じ束で最終確認する
> - 期待本数を環境変数か定数のどこに置くかは実装時に決める（`generate-articles.ts:66` の `FEATURE_MIN_GAMES = 3` が既存の前例）
>
> **(3) `src/pages/launch.astro` の「毎号6本」を実態に合う表現に直す。** `:1100` / `:1163` / `:1202` の 3 箇所。実測で 3/17 号が 6 本を下回っているため、読者への記述として不正確である。
>
> **(e) を採っても本数そのものは増えない。** (e) は「不足に気づける状態にする」までで、埋めるかどうかは運用実績を見てから別途判断する。
>
> #### 判断根拠
>
> **1. 真の欠陥は「不足していること」ではなく「不足が運用者に届かないこと」だった**（実読で確認）。
>
> `data/validation/validation-report-017.json` は `totalArticles: 4` を**記録している**。しかし `status` を決める `computeReportStatus()`（`format-validation-report.ts:38-51`）が見るのは **HIGH 警告数 / Web検索失敗 / MEDIUM / 公式URL欠落 / judge 件数だけ**で、**記事本数は判定に一切入っていない**（grep で `totalArticles` の参照は `format-validation-report.ts:166` の表示のみ）。
>
> したがって vol.17 が `status: "error"` になり Issue が自動起票されたのは **HIGH 警告 3 件が理由**であって、新作 0 本が理由ではない。**新作 0 本でも HIGH 警告が 0 件なら status は `ok` になり、Issue は起票されず、Actions サマリにも現れない**（`weekly-build.yml:128-132` は `status != error` なら `exit 0`）。不足の記録は Actions の実行ログを開かないと見えない。
>
> §6.4 の「警告ログは出るが記事は 0 本のまま公開される」という記述は正しいが、実態はさらに踏み込んで「**本数不足は号のステータスにも Issue 起票にも Actions サマリにも反映されない**」である。
>
> **2. 不足の実測値**（`measure-h.ts` → `out-h.txt`。全 17 号の frontmatter）
>
> | 号 | newRelease | indie | feature | classic | 計 |
> |---|---|---|---|---|---|
> | 001〜012, 014, 016 | 2 | 2 | 1 | 1 | **6** |
> | **013** | 2 | 2 | 1 | **0** | **5** |
> | **015** | **1** | 2 | 1 | 1 | **5** |
> | **017** | **0** | 2 | 1 | 1 | **4** |
>
> - 期待 6 本を満たしたのは **14/17 号**
> - 欠けたのは **newRelease 2 号**（015=1本 / 017=0本）と **classic 1 号**（013=0本）。**indie と feature は 17/17 号で充足**
> - **vol.13 の classic 欠落は本調査で初めて判明した**。これまでの議論では一度も出ていない。`generate-articles.ts:1346` の `console.warn('No classic game selected, skipping')` の経路と考えられるが、当時のログが残っていないため**断定できない**
> - 特集記事の紹介ゲーム本数は **17/17 号すべてで 3 件以上**（`FEATURE_MIN_GAMES = 3` を満たす。3件=4号 / 4件=9号 / 5件=4号）＝ 特集枠の「本数」側は壊れていない
> - `hidden: true` の記事は vol.1 に 1 件のみ
>
> **3. 生成層の「不足を許容する」は明示的な設計判断として既に入っている**（実読で確認）。
>
> `completeness-gate.ts:588-593` のコメント:
> > 補充不能（shortfall）は原則 fail 対象にしない: 違反ゲームは除去済みで破壊は残っておらず、「枠を埋めるために不適格なゲームを載せる」ことも「号全体を止める」ことも**せず**、少ない記事数で発行する（**Issue #179 の設計原則**。選定時の「2件未満で発行」と同じ扱い）
>
> `:591-597` の全滅ガードは `newReleases` と `indies` が**両方**空のときだけ `fail` に倒す。vol.17 は `newReleases` だけ 0 だったので通った。`generate-articles.ts:1218-1223` も `console.warn` のみで続行する。
>
> **推論**: この判断が Issue #179 の教訓（不適格なゲームを枠埋めに使って障害になった）から来ているのは妥当だが、「不適格を載せない」ことに集中していて「**不足したことを運用者と読者に伝える**」側は手つかずで残ったと考えられる。(e) は後者だけを埋める。
>
> **4. 表示層は本数不足で壊れないが、「毎号6本」という宣言だけが残っている**（実読で確認）。
>
> `src/pages/index.astro:35` は `!article.hidden` でフィルタして配列を回すだけなので、4 本でもレイアウトは崩れず欠番の告知も出ない。`src/pages/archive/[issue].astro:51` / `archive/index.astro:36` も同様。一方 `src/pages/launch.astro` の **3 箇所**（`:1100`「読み応えのある記事が毎号6本」/ `:1163`「AIが6本の記事を自動執筆」/ `:1202`「毎号6本の記事を掲載」）が読者に 6 本を約束している。vol.17 は 4 本だった。
>
> **5. (b)(c)(d) はいずれも他の決定と衝突する**。(e) だけがどれとも衝突しない。
>
> **6. 不足の原因は本論点の外ですでに手当てされている。** vol.17 の 0 本は「母集団の 75% が未発売」「`isQualifiedGame()` の大手経路が実質 1 本」「クールダウン 17 週」の重畳（§2.3、実ログで確認済み）であり、論点B / N-6 / PR-B / §8.1 が扱う対象である。論点H で供給量を増やす仕組みを足すと二重投資になる。
>
> **7. 仕組みが既にある。** Issue #202 で `status: error → gh label create → gh issue create`（同一タイトルの既存 Issue があればスキップ）の経路が `weekly-build.yml:113-160` に入っている。`computeReportStatus()` に 1 条件足すだけで本数不足が毎週 Issue として上がる。新しい通知経路を作る必要がない。
>
> #### 棄却した案
>
> - **(a) 現状維持**: 実測 3/17 号で本数が欠けており、そのうち **vol.13 の classic 欠落は今回の測定まで誰も把握していなかった**。「気づけない」状態を仕様として固定することになる
> - **(b) 他カテゴリで埋める**: indie は 17/17 号で 2 本充足しているので予備が実際にある**可能性はある**が、供給量は**未測定**。より重いのは「新作紹介 0 本の号を作らない代わりにカテゴリ構成が号ごとに変わる」こと。§5.1 で決めた「4 カテゴリを時間軸で統一する」編集意図と衝突する
> - **(c) 条件を段階的に緩める（90 日 → 180 日）**: vol.17 の直接原因は大手判定ゲートと 17 週クールダウン（§2.3 実ログ）であり、窓を広げても大手が増えるとは限らない。加えて新作枠の再設計（N-6 / §5.2 / PR-B）がこの領域をすでに触るため二重になる
> - **(d) ビルドを失敗させる**: 週次自動発行が止まる。Issue #179 の設計原則（号を止めない）を正面から覆す。なお `VALIDATION_STRICT=true` を立てれば現状でも high 閾値超えで `process.exit(1)` する経路が既にある（`build-issue.ts:649-656`）ので、(e) を入れた上で運用者が必要と判断すればこの環境変数で (d) 相当に寄せられる
>
> #### 測定手法の限界
>
> - **本数は frontmatter の `category` 行を数えて求めた**（`measure-h.ts`）。生成時に何本を狙って何本落ちたかは frontmatter に残らないため、**「不足」か「そもそも生成しようとしなかった」かは区別できない**。vol.13 の classic 欠落の原因が特定できないのはこれによる
> - **`recommendedGames` の件数はインデント依存の正規表現でカウントした**。YAML パーサを通していないため、ネスト構造が変わっている号があれば数え落とす可能性がある（全 17 号で 3〜5 件という妥当な範囲に収まっているため、大きな取りこぼしは無いと考えられる）
> - **過去号の生成ログは残っていない**。`data/aggregated.json` は `.gitignore` 対象で Actions アーティファクトにも保存されていない（§2.3 と同じ制約）
>
> #### 本論点の範囲外として切り出す課題
>
> - **vol.13 の classic 欠落の原因が不明**。`generate-articles.ts:1346` の経路と考えられるが確認できない。(e) を入れれば今後は同型の事象が Issue として上がるので、原因はそのとき調査できる
> - **`data/validation-manual/` に 7 件、`data/validation/` に 1 件しかレポートが無い**（実測。`data/validation-dev/` は 21 件）。§7 論点G で切り出した「validation レポートが 17 号中 8 号分しかない」と同じ事象で、本番レポートの継続保存が始まったのは Issue #202（`weekly-build.yml:102-103` の `git add data/validation/`）以降であることが実読で確認できた
>
> #### 実装上の位置づけ
>
> - **PR-G として単独実装できる**。触るのは `validate-article.ts`（警告タイプ追加）/ `format-validation-report.ts`（`computeReportStatus()` に 1 条件）/ `launch.astro`（3 箇所の文言）。生成層（`fetch-data.ts` / `generate-articles.ts` / `completeness-gate.ts`）には**手を入れない**
> - 他の論点と独立。ただし新作枠の再設計（PR-B / 名作枠 PR）を入れた後に走らせると、不足が実際に減ったかを (e) の Issue 起票で観測できる。**PR-B・名作枠 PR より後に置くのが望ましい**

### 論点I: 移行時の履歴の扱い

名作枠の選定条件を変えると、vol.12〜17 で「名作」として消費された 2026 年発売作（Dungeon Blitz R, Subnautica 2, MOLE, Pokémon Infinite Fusion）が履歴に 52 週分残る。これらは新条件では名作ではないので、
- (I-1) 履歴を維持する（該当作が 52 週間ロックされるだけなので実害は小さい）
- (I-2) 誤って名作枠に入った作品の履歴を削除する（該当作が他カテゴリで再登場できるようになる）
- (I-3) 過去号の記事自体を作り直す（コストが大きい。過去号の書き換えは読者体験上も要検討）
- (I-4) classic 履歴 16 件を全削除して名作枠の履歴をリセットする（測定中に追加した案）

---

> ### ✅ 決着（2026-08-04）: **(I-1) を採用** — 履歴をそのまま維持する（移行作業なし）
>
> #### 決定内容
>
> **`history.json` には一切手を加えない。** 名作枠の条件変更（③論点B / ④論点J-3）に伴う履歴の移行・削除・記事再生成はいずれも行わない。
>
> #### 判断根拠（2026-08-04 実測。`.claude-scratch/measure-i.ts` → `out-i.txt`）
>
> **1. 論点I の元の前提が誤っていた。** 本項は当初「誤選定作が 52 週ロックされるだけなので実害は小さい」と書いていたが、実測すると I-1 で実際にブロックされるのは**新条件でも正当な名作**だった。次号（2026-08-08）時点で classic 履歴 16 件はすべてクールダウン中であり、新母集団 266 件と照合すると:
>
> | 作品 | 母集団順位 | 掲載号 | 解除日 |
> |---|---|---|---|
> | **Red Dead Redemption 2** | **5 位** (n=3764) | vol.2 | 2027-04-10 |
> | **Stardew Valley** | **36 位** (n=1797) | vol.7 | 2027-05-15 |
> | **The Last of Us Part II** | **38 位** (n=1750) | vol.5 | 2027-04-30 |
> | Final Fantasy VII Remake | 154 位 (t8) | vol.6 | 2027-05-07 |
> | Hollow Knight: Silksong | 157 位 | vol.3 | 2027-04-16 |
> | Resident Evil Requiem | 209 位 | vol.15 | 2027-07-10 |
>
> **これは誤作動ではなく仕様どおりの動作である。** 6 件はいずれも既に名作枠で掲載済みであり、クールダウンが重複掲載を防ぐという本来の目的を果たしている。母集団 266 件に対し 6 件（2.3%）のブロックは供給に影響しない。
>
> **2. (I-2) には測定上まったく効果がない。** 削除対象となる「新条件で名作でない 10 件」（`Dig Island` / `Star Citizen` / `FiveM` / `Cyberpunk 2077` / `Ghost of Yotei` / `FF VII REMAKE INTERGRADE` / `Dungeon Blitz R` / `Subnautica 2` / `MOLE` / `Pokémon Infinite Fusion`）は**新母集団 266 件に含まれない**。履歴に残っていても名作枠の選定を一切妨げないため、削除しても名作枠の挙動は変わらない。得られるのは「履歴の見た目の正しさ」だけで、`history.json` を手作業で編集するリスク（過去に破損・履歴消失の事故がある。`feedback_article_regeneration.md`）に見合わない。
>
> **3. (I-4) は重複掲載を招く。** `Red Dead Redemption 2` は新母集団 5 位なので、履歴をリセットすると `total_rating_count` 降順で即座に再選出され、vol.2 と重複する。
>
> #### 母集団内 6 件 / 母集団外 10 件の内訳（実測）
>
> ```
> 母集団内  6 件: Red Dead Redemption 2 / Stardew Valley / The Last of Us Part II
>                 Final Fantasy VII Remake / Hollow Knight: Silksong / Resident Evil Requiem
> 母集団外 10 件: Dig Island / Star Citizen / FiveM / Cyberpunk 2077 / Ghost of Yotei
>                 FF VII REMAKE INTERGRADE / Dungeon Blitz R / Subnautica 2 / MOLE
>                 Pokémon Infinite Fusion
> ```
>
> なお `Final Fantasy VII Remake`(t8, n=502) が母集団内なのは ④(J-3-e) の決定によるもので、原作 FF VII が `game_type=10` でプール外のため意図的に許可されている。
>
> #### 棄却した案
>
> - **(I-2)** — 上記 2 のとおり効果がなく、手編集のリスクのみ負う
> - **(I-4)** — 上記 3 のとおり `Red Dead Redemption 2` が vol.2 と重複する
> - **(I-3)** — 過去号の記事再生成。コストが大きく、公開済み号の書き換えは読者体験上も要検討。かつ上記のとおり移行の必要自体が無い
>
> #### この決定の帰結
>
> - **`HistoryEntry` の構造変更は不要**（④(J-3-e) が母集団側で混線を解いたため `parent_game` の記録が不要になった。§7 論点J-3 の決着ブロック参照）
> - **105 件の履歴移行スクリプトは不要**。`scripts/migrate-history.ts` は初期履歴生成用の 1 回限りスクリプトであり、再実行しない
> - **名作枠 PR に履歴関連の変更は含まれない**

### 論点J: リメイク・リマスター・移植をカテゴリごとにどう扱うか

**前提**: PR #209 で 3 カテゴリすべてに `game_type = 0`（Main Game のみ）を一律適用した。これは DLC・エディション違いの除外を目的とした変更だが、**副作用として Remake(8) / Remaster(9) / Port(11) も全カテゴリから除外されている**（§10.4 に既知の限界として記録）。

現状はフィルタが `buildIgdbCommonFilters()` として 3 クエリで共有されているため、**カテゴリごとに扱いを変えられない構造**になっている。カテゴリの編集意図が枠ごとに異なる以上、`game_type` の許可集合も枠ごとに決めるべきかを判断する必要がある。

**枠別サマリ**（詳細は各項）:

| カテゴリ | 除外による供給への影響（実測） | 質的な論点 | 暫定推奨 |
|---|---|---|---|
| 【A】新作紹介 | agg あり 67 → 71（週 -0.4 本） | 大手のリメイクを「新作」として扱わないのは読者の期待と乖離 | ✅ **`0, 8, 9` を許可 + 記事に明記**（J-1-c） |
| 【B】インディー | 36 → 39（差 3） | 小規模開発のリメイクは稀。DLC 混入防止が本来の目的 | `0` のみ維持 |
| 【D】名作深掘り | 322 → 350（差 28） | 原作とリメイクが別エントリ = 同じゲームが複数回載る | `0` のみ維持 |
| 【C】特集 | 独自クエリなし（他枠のプールを継承） | Issue #208 の検索経路にフィルタが無い点と併せて要決定 | 他枠の方針を継承 |

#### J-1: 新作紹介での扱い

**失われている実タイトル**（発売済み、大手作品）:
```
Remake  hypes=123 rc=17 agg=84  2026-07-09  Assassin's Creed Black Flag Resynced  [Ubisoft]
Remake  hypes= 62 rc= 0 agg=81  2026-07-28  Halo: Campaign Evolved                [Xbox]
Remake  hypes= 21 rc=11 agg=82  2026-06-25  Star Fox                              [Nintendo]
Remake  hypes= 64 rc=25 agg=56  2026-06-05  Gothic 1 Remake
```
今後発売予定分: `Rayman Legends Retold` (2026-10-01)、`Trails in the Sky 2nd Chapter` (2026-09-17)、`MGS4: Master Collection Version` (2026-08-27)、`Steins;Gate Re:Boot` (2026-08-20) など。

**供給量への影響**（発売済み 90 日窓、実測）:

| 品質条件 | `game_type = 0` | `0\|8\|9` | 差 |
|---|---|---|---|
| 全件 | 4451 | 4475 | 24 |
| `aggregated_rating` あり | 67 | 71 | **4** |
| `rating_count >= 15` | 14 | 16 | **2** |
| `hypes > 5` | 105 | 108 | 3 |

直近 180 日では `aggregated_rating` あり 180 → 191（差 11）。**週あたり約 0.4 本**の供給減。

**論点**: 数量的な打撃は小さいが、質的には問題がある。`Halo: Campaign Evolved`(agg=81) / `Star Fox`(agg=82) / `ACBF Resynced`(agg=84) はいずれも大手の主要リリースであり、**一般のゲームメディアは当然これらを「新作」として扱う**。要件.md の「大手企業のもうすぐ発売／発売されたばかりのゲーム」に照らすと、リメイクを機械的に除くのは読者の期待と乖離していると考えられる。

- (J-1-a) `game_type = 0, 8, 9` を許可する（推奨）— リメイク・リマスターは「新しく遊べるようになったゲーム」として新作の実質を持つ
- (J-1-b) `game_type = 0` のみ（現状維持）— オリジナル作品のみを新作として扱う
- (J-1-c) 許可するが記事中で明示する — プロンプトに「リメイク／リマスターである旨を明記する」ルールを追加し、読者が誤認しないようにする

**なお `ACBF Resynced` は §2.3 で「vol.17 の候補 18 件に無かった理由は不明」としていた作品である。** IGDB 上の `game_type = 8`（Remake）を実測確認済みで、PR #209 適用後は**今後の号でも構造的に除外される**ことが確定している（vol.17 時点の除外理由が同じだったかは aggregated.json が残っていないため確認できない）。

**Port(11) は別扱いが妥当と考えられる。** 実測すると 71 件あるが、内容は `Arcade Archives: Syvalion`、`Eggconsole Dragon Slayer Level 2.0 PC-8801`、`Console Archives: Rhapsody` 等のレトロ復刻配信が大半で、品質条件を満たすのは `aggregated_rating` あり **1 件**・`rating_count >= 15` **0 件**。新作枠に入れる価値は低く、除外したままでよいと考えられる。

---

> ### ✅ 決着（2026-08-06）: **(J-1-c) を採用** — `game_type = 0, 8, 9` を許可し、リメイク／リマスターであることを記事に明記させる
>
> #### 決定内容
>
> **(1) 母集団クエリの `gameTypes` に `[0, 8, 9]` を渡す。** Port(11) は除外したまま（上記のとおり品質条件をどの枠でも通らない）。J-5 の決着により `buildIgdbCommonFilters()` は `gameTypes` 配列を引数で受ける形になるため、変更は呼び出し側の引数のみ。
>
> **(2) `game_type` を `GameData` まで持ち回り、プロンプトに渡す。** IGDB レスポンス → `IGDBGame` → `GameData` → `buildUserMessage` の【ゲーム情報】欄に「種別: リメイク」「種別: リマスター」相当の行として提示する（Main Game のときは行を出さない）。
>
> **(3) `newReleaseSystem` に明記ルールを 1 行足す。** 「提供データに種別がリメイク／リマスターと示されている場合は、記事本文でその旨を明記すること」。
>
> #### 判断根拠
>
> **1. 名作枠（J-3）で混線を起こした構造は、新作枠には存在しない。** J-3 で 11 件の混線が発生したのは、名作枠の母集団が数十年分をカバーするため原作とリメイクが同時にプールに入り得るからである。**新作枠の窓は 60 日（確定事項 #4）であり、原作とリメイクが同じ 60 日間に発売されることは事実上ない。** J-3 で必要だった `parent_game` 参照・`normalizeTitle` の限界・`HistoryEntry` 拡張の問題は、いずれも新作枠には波及しない。**枠ごとに逆向きの結論になるのは、窓の幅が 60 日と数十年で異なるためである**（J-5 判断根拠 5 の「枠ごとに要求が逆向き」の具体的な機序）。
>
> なお J-3 と異なり原作が同一プールにいないため、「原作が母集団に不在のものだけ許可」（J-3-e 相当）の条件を新作枠に持ち込む必要はない。**`[0, 8, 9]` の単純許可でよい。**
>
> **2. 許可するだけ（J-1-a）では事実性の問題が残る。** `newReleaseSystem`（`bedrock-client.ts:162`）の禁止リストに **「続編・関連作・DLC・コラボの存在」** が含まれている（実読で確認）。リメイクの原作は関連作にあたるため、提供データに書かれていない限り LLM は言及できない。結果として:
>
> - `Star Fox`(2026, `game_type=8`) が **完全新作の任天堂タイトルとして**書かれる
> - 読者は誤認するが、LLM 側はルールを守っているだけなので judge もバリデータも検出できない
>
> **3. 逆に、提供データに明示すれば既存の禁止リストを一切変えずに書けるようになる。** 上記禁止リストの前提は「**提供データに明示的に書かれていない限り**、絶対に記載しないこと」（`:156`）である。したがって `game_type` を提供データに載せた時点で、リメイクである旨の記述は禁止対象から自然に外れる。**禁止リストの緩和（＝他の項目にも穴を開けるリスク）が不要**という点が (J-1-c) の実装上の利点である。
>
> **4. 追加の実装コストは小さい。** `game_type` の持ち回りは `IGDB_GAME_FIELDS`（`fetch-igdb.ts:329`）への 1 フィールド追加、`IGDBGame` / `GameData` 型（`types.ts:84`）への 1 フィールド追加、`mapRawGameToIGDBGame` での転記、`buildUserMessage` での 1 行出力。**PR-B は `aggregated_rating` / `agg_count` の追加でまったく同じ 4 箇所を触るため**（§11.4 その他の残課題 #5）、同一 PR に含めれば増分は小さい。
>
> **5. 供給の増分は小さいが、失うタイトルの質が問題である。** 90 日窓で `aggregated_rating` あり 67 → 71（週 +0.4 本）。数量は小さいが、落ちているのは `ACBF Resynced`(agg=84) / `Star Fox`(agg=82) / `Halo: Campaign Evolved`(agg=81) という大手の主要リリースであり、一般メディアが当然「新作」として扱うものである。
>
> #### 未測定・確認できていないこと（明示）
>
> - **上記 3 件が品質条件（`agg_count >= 2`）を通るかは未測定。** §7 J-1 の実測記録には `aggregated_rating` の値のみが残り `agg_count` が記録されていない。特に `Halo: Campaign Evolved` は `rc=0` なので、`agg_count` が 1 なら品質条件で落ちる。**この場合 (J-1-c) を採っても当該タイトルは載らない**（決定の妥当性は変わらないが、期待する効果が出ない可能性がある）
> - **J-1 の測定はすべて 90 日窓で行われている。** 確定した発売済み窓は **60 日**（確定事項 #4）なので、実際の増分は +4 件より少ないと考えられるが未測定
> - **リメイクである旨を明記したときの出力品質は未検証。** 「種別: リメイク」という提供データを LLM が「原作の説明」に展開してしまう（＝禁止項目である原作の内容・ストーリーに踏み込む）可能性がある。`DEV_MODE=true` での確認を PR の受け入れ条件にする
>
> #### 棄却した案
>
> - **(J-1-a) 許可するだけ** — 上記 2 のとおり、読者が誤認する状態を作りながら検出手段が無い
> - **(J-1-b) Main Game のみ（現状維持）** — 上記 5 のとおり大手の主要リリースを構造的に落とす
> - **J-3-e 相当の条件（原作が母集団に不在のものだけ許可）を新作枠にも適用** — 上記 1 のとおり 60 日窓では原作が同一プールに存在し得ないため、条件が常に真になる。無意味な複雑化
> - **`Port(11)` も許可** — 実測 71 件中 `aggregated_rating` あり 1 件・`rating_count >= 15` は 0 件。品質条件をどの枠でも通らない
>
> #### 実装上の位置づけ
>
> - **PR-B（N-6 のスコア実装）に含める。** `IGDB_GAME_FIELDS` / `IGDBGame` / `GameData` / `buildUserMessage` という同一の 4 箇所を触るため、分けるとコンフリクトする
> - **PR-0.5（`buildIgdbCommonFilters()` のパラメータ化）が前提。** 引数を渡せる形になっていないと実装できない
> - プロンプト変更（上記 3）は `newReleaseSystem` のみ。インディー枠・名作枠のプロンプトは触らない

#### J-2: インディーでの扱い

**影響は極小**（直近 90 日・`rating_count > 5`、実測）: `game_type = 0` → 36 件、`0|8|9` → 39 件（差 3）。

小規模開発のリメイクは稀であり、この枠の `game_type = 0` の主目的は vol.14 の ARK DLC 型混入の防止である。

- (J-2-a) `game_type = 0` のみ（推奨・現状維持）— DLC 混入防止という当初目的に合致
- (J-2-b) `0, 8, 9` を許可 — 影響は 3 件と小さいが、インディーのリメイクを扱う意義は薄い

#### J-3: 名作深掘りでの扱い

**ここが最も判断の分かれる箇所である。** 素案 D-1 の条件（`total_rating >= 85 & total_rating_count >= 100 & 3年以上前`）で実測すると:

| 条件 | 件数 |
|---|---|
| `game_type = 0` | 322 |
| `0\|8\|9` | 350 |

許可した場合に名作枠に入るリメイク・リマスター（`total_rating_count` 降順）:
```
t9 total=95(n=1693) 2014-07-26  The Last of Us Remastered
t8 total=90(n=1415) 2019-01-25  Resident Evil 2
t8 total=86(n= 941) 1989-11-01  Tetris
t8 total=85(n= 797) 2022-09-02  The Last of Us Part I
t8 total=92(n= 667) 2023-03-24  Resident Evil 4
t9 total=87(n= 565) 2018-05-23  Dark Souls: Remastered
t8 total=86(n= 570) 2012-10-09  XCOM: Enemy Unknown
t8 total=92(n= 555) 2004-01-29  Pokémon FireRed Version
t8 total=90(n= 549) 2014-11-04  The Binding of Isaac: Rebirth
t8 total=88(n= 548) 2020-03-06  Black Mesa
t8 total=91(n= 533) 2011-06-16  The Legend of Zelda: Ocarina of Time 3D
t8 total=89(n= 501) 2020-04-10  Final Fantasy VII Remake
```
（`total_rating_count >= 500` の上位 12 件。差 28 件の残りはこれより評価母数が少ない作品）

**問題は同一性の混線である。** `The Last of Us`（2013, t0）と `The Last of Us Remastered`（2014, t9）と `The Last of Us Part I`（2022, t8）が**独立した 3 エントリとして母集団に存在する**。クールダウンは `normalizedTitle` 比較なので 3 件は別作品として扱われ、**同じゲームが 3 回「名作深掘り」に載り得る**。`Resident Evil 2`（1998 オリジナルと 2019 リメイク）、`Ocarina of Time`（1998 と 3D 版）も同様。

さらに「なぜ何年経っても評価されるのか」を論じる枠でリメイク版を扱うと、**評価の対象がオリジナルの設計かリメイクの実装かが曖昧になる**。`FF VII Remake`(2020) を名作として深掘りすると、オリジナル(1997)の何が評価されたのかという本来の主題からずれる。

なお `Black Mesa`（Half-Life のファンメイド・リメイク、t8）が入ることにも注意が必要。`isFanGame()`（`game-filter.ts`）による除外対象と重なる可能性がある。

- (J-3-a) `game_type = 0` のみ（現状維持）— オリジナルを扱う。同一性混線を構造的に回避できる
- (J-3-b) `0, 8, 9` を許可し、クールダウンをシリーズ単位（IGDB の `parent_game` / `franchise` を使う）に拡張する — 同一作品の重複を防ぐ追加実装が必要
- (J-3-c) 無条件に許可 — 同じゲームが複数回載るリスクを受容する
- **(J-3-e) `game_type = 0` に加え、「`parent_game` が母集団に不在のリメイク・リマスターのみ」を許可する**（測定中に見つけた案。↓ で採用）

これは論点B（経過年数の下限）とも連動する。10 年下限を採ると `FF VII Remake`(2020) / `The Last of Us Part I`(2022) / `Resident Evil 4`(2023) / `Black Mesa`(2020) は自動的に外れ、混線の範囲は縮む。

---

> ### ✅ 決着（2026-08-03）: **(J-3-e) を採用** — `game_type = 0` + 「原作が母集団に不在のリメイクのみ」許可
>
> #### 決定内容
>
> 名作枠の母集団は次の 2 条件の **OR** で構成する（論点B で決着した条件に追加）:
>
> ```
> ① game_type = 0                                    （従来どおり Main Game）
> ② game_type ∈ {8, 9} かつ parent_game が ①の集合に含まれない
> ```
>
> 実装は、論点B で書き換える名作枠のクエリ内で完結する。`game_type = (0,8,9)` で 1 回取得し、`game_type=0` の ID 集合を作り、`t8/t9` は `parent_game` がその集合に無いものだけを残す。**`GameData` への `igdbId` 追加も `HistoryEntry` の拡張も不要**（判定はプール構築時のメモリ内照合で完結し、履歴に持ち越す必要がない）。
>
> #### 実測に基づく判断根拠（`out-j3.txt` / `out-j3-parents.txt` / `out-j3-collide.txt`）
>
> **1. `game_type = 0` のみ（J-3-a）だと、11 作品が名作枠で構造的に扱えなくなる。**
> リメイク 22 件の `parent_game` を ID 引きして原作の実データを確認した結果、**原作が新条件を満たすのは 11 件だけで、残り 11 件は原作もプール外**だった:
>
> | リメイク | n | 原作がプールに入らない理由 |
> |---|---|---|
> | Resident Evil 2 (2019) | 1416 | 1998年版 `total_rating=69` |
> | Tetris (1989) | 941 | 1985年版 `total=75, n=15` |
> | Resident Evil 4 (2023) | 668 | 2005年版 `total=84`（あと1点） |
> | XCOM: Enemy Unknown | 570 | X-COM: UFO Defense `n=136` |
> | Pokémon FireRed | 556 | Red Version `total=80` |
> | The Binding of Isaac: Rebirth | 549 | 原作 `total=81` |
> | Black Mesa | 548 | Half-Life `total=84`（あと1点） |
> | Final Fantasy VII Remake | 502 | FF VII (1997) が `game_type=10` |
> | Metroid: Zero Mission | 297 | Metroid (1987) `total=66, game_type=10` |
> | Ni no Kuni | 216 | DS版 `n=5` |
> | Resident Evil 4 (2011 リマスター) | 214 | 親が `RE4: Wii Edition`(t11) |
>
> J-3-a を採ると **`Resident Evil` シリーズと `Half-Life` は名作枠に一度も登場できない。**
>
> **2. これは偶然ではなく構造的な偏りと考えられる。** `Resident Evil 2`=69 / `Pokémon Red`=80 / `The Binding of Isaac`=81 / `Half-Life`=84 / `Resident Evil 4`(2005)=84 と、**2010年以前の原作は `total_rating` が 85 を下回りやすい**（推論: 操作性・グラフィックが現代基準で評価されるため）。つまり `total_rating >= 85` は古い名作の原作を systematically に落とし、リメイク版だけが基準を満たす方向に働く。J-3-a はこの偏りを増幅する。
>
> **3. 全面許可（J-3-b）だと混線 11 件が発生し、うち 7 件は `normalizeTitle` の強化では直せない。** `parent_game` で厳密に数えた内訳:
>
> ```
> 原作もプールに在る 11 件 → 現行 normalizeTitle で防げる 4 件 / 防げない 7 件
> ```
>
> 防げない 7 件のうち 4 件は版名除去ルールでは直せない（実測データに反例がある）:
>
> | 防げない組 | 版名除去で直るか |
> |---|---|
> | The Last of Us / Remastered | 直る |
> | Dark Souls / Remastered | 直る |
> | Wind Waker / HD | 直る |
> | The Last of Us / **Part I** | `part i` 除去は **`Part II`(n=1750, プール内) を原作と誤同一視する** ✗ |
> | Ocarina of Time / **3D** | `3d` 除去は **`Super Mario 3D World`(プール内) を `Super Mario World` と誤同一視する** ✗ |
> | Pokémon **SoulSilver** / Silver | サフィックスでないので除去ルールでは直せない ✗ |
> | Pokémon **HeartGold** / Gold | 同上 ✗ |
>
> したがって J-3-b は `parent_game` を `GameData`（`scripts/types.ts:84` に **`igdbId` フィールドが存在しない**）と `HistoryEntry`（`scripts/game-history.ts:28`）まで持ち回る実装が必須で、**既存 105 エントリに親情報が無い**ため移行か「導入後 52 週は履歴側が効かない」ことの受容が必要になる。
>
> **4. (J-3-e) は J-3-b の便益をすべて得たまま、混線を定義上ゼロにする。**
>
> | 案 | 供給 | 混線 | 追加実装 | RE2/RE4/Half-Life/FF7R |
> |---|---|---|---|---|
> | J-3-a (`0` のみ) | 255 件 = 4.9 年分 | 0 | なし | **扱えない** |
> | **J-3-e (採用)** | **266 件 = 5.1 年分** | **0** | プール構築時に `parent_game` を参照 | 扱える |
> | J-3-b (`0\|8\|9` 全部) | 277 件 = 5.3 年分 | 11（7 件は要実装） | `igdbId` + `HistoryEntry` 拡張 + 105 件移行 | 扱える |
>
> J-3-b が J-3-e より多い 11 件は「原作もプールに在るリメイク」＝**原作で代替可能なもの**であり、その 11 件のために移行コストと 7 件の混線対策を負う価値は薄い。
>
> **5. 編集ルールとしても自然に読める**: 「原作が母集団に在るならリメイクは不要。原作が入っていない作品だけ、リメイク版をその作品の代表として採用する」
>
> **6. E の残存リスクは実測で 0 件。** 同一作品のリメイクが 2 つあり両方の親がプール外というケースは、現データでは `Resident Evil 4` の 2023年版(t8) / 2011年版(t9) の 1 組のみ。両方 `normalizeTitle` が `resident evil 4` になるため**現行クールダウンで防げる**。
>
> #### 前セッションの報告の訂正（2 件）
>
> - **訂正1**: 「`FF VII REMAKE` と `INTERGRADE` はどちらも `game_type=0` なので `0` のみでも再発する」と報告したが**誤り**。実測では `Remake` は `t8`、`Intergrade` は `t3`(Bundle, n=127)、`Rebirth` は `t8`。**どちらも `game_type=0` ではない。** vol.6/vol.11 で掲載されたのは当時のクエリに `game_type` 条件が無かったためである。なお (J-3-e) では `FF VII Remake` は「原作 FF VII が `game_type=10` でプール外」なので**意図的に許可される**（`Intergrade` は `t3` なので入らない）。
> - **訂正2**: 「原作が新条件を満たせば原作側で拾える」と述べたが、これは未測定の推測だった。実測すると **22 件のうち 11 件は原作もプール外**で、半分は拾えない。この事実が (J-3-a) → (J-3-e) の判断変更の決定的根拠になった。
>
> #### 測定手法についての注記
>
> 初回測定では `seriesKey`（版名を削る自作ヒューリスティック）で混線を数えたため、`Pokémon SoulSilver` vs `Silver` や `The Last of Us Part I` vs `The Last of Us` を取りこぼし、逆に `Super Mario World` vs `Super Mario 3D World`（別作品）を誤検出した。**`parent_game` は 22/22 = 100% 存在するため、混線判定はこれを唯一の基準とすべきである。** 混線数「11 組」は `parent_game` ベースの再測定値であり、初回の「11 組（seriesKey ベース）」とは偶然一致しているだけで内訳が異なる。
>
> #### 棄却した案
>
> - **(J-3-a)** — 上記 1, 2 のとおり `Resident Evil` / `Half-Life` を構造的に排除する
> - **(J-3-b)** — 上記 3, 4 のとおり便益 11 件のために移行コストを負うことになる
> - **(J-3-c) 無条件許可** — 同一作品が複数回載る前提を受容する案。編集品質上採らない
> - **`normalizeTitle` の版名除去強化による解決** — 上記 3 の表のとおり 4 件は原理的に直せず、かつ `Super Mario 3D World` 等に誤同一視の副作用が出る
> - **`collections` 単位のクールダウン** — 実測で 1 collection に大量のタイトルが含まれる（`collection=240` に Super Mario 16 件、`collection=106` に Zelda 10 件、`collection=847` に GTA 5 件）。52 週ブロックすると「マリオ 1 作を載せたら 1 年間マリオ 16 作すべて禁止」になり供給を著しく損なう
>
> #### 引き継ぎ事項
>
> - **`normalizeTitle` の版名サフィックス問題は名作枠の外に残る。** `normalizeTitle` は全枠共通のクールダウンキーであり、新作枠・インディー枠で `Dark Souls` と `Dark Souls: Remastered` が別作品として扱われる問題は (J-3-e) を採っても解消しない。ただし §3.3 で既知の課題として整理済みであり、上記のとおり除去ルールでは原理的に解けないため、別途方針が必要（未着手）
> - **`Black Mesa` は `isFanGame()`（`game-filter.ts`）の判定と重なる可能性がある。** (J-3-e) では「原作 Half-Life が `total=84` でプール外」なので**母集団に入る**。ファンメイド・リメイクを名作枠で扱うかは `isFanGame()` の挙動次第であり、PR-B（`isFanGame()` の keywords 修正）と併せて実装時に確認が必要
> - **名作枠のソート軸は未決**。本測定では `total_rating_count desc` を仮定したが、これは測定上の便宜であり決定事項ではない

#### J-4: 特集での扱い

特集は**独自の母集団クエリを持たない**。候補は 2 経路から来る:
1. `relatedGames`（aggregated.json 由来 = 他枠のプールの残り）→ **他枠で採る `game_type` 方針をそのまま継承する**
2. `proposeThemeGamesFromKnowledge`（LLM 提案）→ `verifyProposedGames` で IGDB 実在検証

**経路 2 には `where` 句が無い**（`searchGameByName`、Issue #208 として起票済み）。したがって `game_type` に関わらず DLC・リメイク・成人向けが通る。J-1〜J-3 でどの方針を採っても、Issue #208 を修正しない限り**特集だけは実質「無制限」のまま**である。

- (J-4-a) Issue #208 で `searchGameByName` に共通フィルタを追加し、特集も他枠と同じ方針に揃える
- (J-4-b) 特集は意図的に緩めたまま許容する — 「復刻・リメイク特集」のようなテーマを組める余地が残る（LLM がテーマを選ぶ以上、そうしたテーマが選ばれる可能性はある）
- (J-4-c) 成人向け（`themes != (42)`）だけは必ず塞ぎ、`game_type` は緩めたままにする

**なお Issue #208 で確認済みのとおり、`searchGameBySteamAppId` にはフィルタを追加してはならない**（§10.3(d)）。appId 経由のメタデータ補完が壊れる。

> ✅ **決着（2026-08-01。ユーザー判断）: (J-4-a) を採る。`searchGameByName` のクエリに `where game_type = 0 & themes != (42)` を追加する。** 実装は仕様議論と独立に先行させる（§8 #7）。すり替わり対策（下記 4 点目）は本 PR に含めず、既存バグとして別途扱う。
>
> **判断根拠（2026-08-01 実測。`.claude-scratch/measure-208-fix.ts` → `out-208-fix.txt`）**
>
> 1. **`search` と `where` は同一クエリに併用できる**（HTTP 200 で 0 件が返る）。IGDB 側の構文制約は存在しなかった。
> 2. **`themes != (42)` は `themes` フィールドを持たないゲームを巻き込まない**。`Balatro` / `Need for Speed: Underground` / `Pokémon Colosseum`（いずれも `themes=undefined`）はフィルタ適用後も通る。当初懸念していた「themes 無しのタイトルが消える」事故は起きない。
> 3. **修正の効果**: 現行と同形のクエリで通ってしまう Erotic 7 件のうち **6 件が 0 件になる**。DLC 2 件（`Grim Dawn: Fangs of Asterkarn` = `game_type=2` / `Cyberpunk 2077: Phantom Liberty` = `game_type=2`）は **2/2 で塞がる**。
> 4. **副作用（限定的）**: `limit 1` のため、フィルタで 1 位が落ちると 2 位が繰り上がる。`"Fate/Stay Night"` は Erotic 本体が落ちた結果 `Run! Run! Lancer: Fate/Stay Night - Heaven's Feel`（`themes=[1]`）にすり替わった。ただし **これは本修正が生む新たな害ではない**。`search` + `limit 1` の精度問題は修正前から存在し（`"Portal 2"` → `Portal Maze 2` / `"Elden Ring"` → `Elden Ring Nightreign` / `"The Last of Us"` → `The Last of Us Part II` はいずれも**修正前から**すり替わっている）、本修正の適用可否とは独立した既存バグである。
> 5. **正常タイトルへの影響なし**: 過去号で実際に使われた 12 タイトルのうち **11 件が修正前と同一結果**。変化した 1 件は改善だった（`"The Witcher 3: Wild Hunt"`: 修正前は `The Witcher 3: Wild Hunt + Dark Souls III` = バンドル商品にヒット → 修正後は本体に正しくヒット）。
> 6. **バンドル 1 件は塞がらない**: `Elden Ring: Shadow of the Erdtree - Premium Bundle` は IGDB 上 `game_type=0` 登録のため通る。これは §10.4（エディション・バンドル問題）の課題であり J とは独立。
>
> **棄却した案**: `limit 5` に広げて `isRelevantSearchResult` で最良を選ぶ案（`where` で落ちた 1 位はそもそも返らないため、2 位以降から選ぶこと自体は変わらず効果が同じ）。`game_type`/`themes` を `IGDB_GAME_FIELDS` に足して呼び出し側で再検査する案（`searchGameBySteamAppId` と `mapRawGameToIGDBGame` と型定義に波及して PR が肥大する。すり替わり対策として後続で検討する価値はある）。ブロックリストの拡充（`adult-blocklist.ts` の `BLOCKED_TITLES` は現在 `'my ghost roommate'` の 1 件のみ。対象が無限に増えるため破綻する）。
>
> **未検証**: すり替わり結果（`Run! Run! Lancer: Fate/Stay Night - Heaven's Feel`）が `isRelevantSearchResult` を通過するかは測っていない。通過する可能性があると考えられるが、上記 4 のとおり既存バグの範囲なので本決定には影響しない。

#### J-5: 実装上の前提

J-1〜J-4 で枠ごとに異なる許可集合を採る場合、`buildIgdbCommonFilters()` を**枠ごとにパラメータ化する**必要がある（例: 許可する `game_type` の配列を引数で受ける。§6.1 参照）。PR #209 の共有ヘルパー構造を変更することになる。

> ✅ **決着（2026-08-01。ユーザー判断）: 許可する `game_type` の配列を引数で受け、デフォルトを `[0]` とする。** 枠別に関数を分割する案は採らない。
>
> ```ts
> // 変更後のシグネチャ（デフォルト引数により既存 3 クエリの生成文字列は変わらない）
> function buildIgdbCommonFilters(options?: { gameTypes?: number[] }): string {
>   const gameTypes = options?.gameTypes ?? [IGDB_GAME_TYPE_MAIN];
>   // gameTypes.length === 1 のときは従来と同じ `game_type = 0` を生成すること
>   // （`game_type = (0)` 形式に変えると差分が生じ「挙動不変」が崩れる）
> }
> ```
>
> **実装順序: これを独立した PR（PR-0.5）として ①（Issue #208）の直後・PR-A / PR-B / 名作枠 PR より前に入れる。**
>
> **判断根拠**
>
> 1. **デフォルト引数にすることで「挙動が一切変わらない純リファクタ PR」として出せる**。既存 3 呼び出し（`fetch-igdb.ts:651` 新作 / `:746` 名作 / `:844` インディー）は呼び出し形を変えずに済み、生成される where 句も同一文字列になる。リグレッションのリスクが構造的にゼロで、テストは「引数なしで従来と同一の文字列を生成する」「`gameTypes` を渡すと生成が変わる」の 2 本で足りる。
> 2. **先に入れないと 3 PR 跨ぎの手戻りになる**。PR-A（Steam DLC 除外）・PR-B（N-6 スコア実装＝新作クエリに `aggregated_rating` 系フィールドを追加）・名作枠 PR（論点B / J-3 の実装）がいずれもこのヘルパー周辺を触る。
> 3. **枠別関数分割（案 B）は Issue #207 の設計意図に逆行する**。PR #209 は「`themes != (37)` が 3 箇所にコピーされていたため 37→42 の誤りが 3 箇所同時に存在した」ことへの対処として生成を 1 箇所に集約した。分割すると同じ事故の再発条件を作る。
> 4. **配列で足りる**。`Port(11)` は J-1 の実測で 71 件中 `aggregated_rating` あり 1 件・`rating_count >= 15` は 0 件であり、どの枠でも品質条件を通らない。実質的な選択肢は `[0]` か `[0,8,9]` の二択なので、枠名を渡す設計まで一般化する必要はない。
> 5. **枠ごとに要求が逆向きであるため「全枠統一」は成立しない**。新作枠は大手リメイク（`Halo: Campaign Evolved` agg=81 / `Star Fox` agg=82 / `AC Black Flag Resynced` agg=84）を拾いたい一方、名作枠は同一性混線（J-3）を避けるためリメイクを入れたくない。
>
> **①（Issue #208）と同梱しない理由**: ①は `searchGameByName` に `where` を新設する挙動変更であり、②は挙動不変のリファクタである。混ぜると「①の 1 行が安全か」のレビューがリファクタ差分に埋もれる。

J-1-c（記事中でリメイクであることを明記）を採る場合は、`game_type` を IGDB のレスポンスから `GameData` まで持ち回り、プロンプトに渡す必要がある（§6.1）。

また `game_type = 0` は **Deluxe Edition 系を除外できていない**（§10.4）。IGDB では `Elden Ring: Collector's Edition` 等が `game_type = 0` 登録であり、`game_type` だけではエディション違いの除外は完結しない。この点は J とは独立の課題として残る。

**Port(11) はどの枠でも除外したままでよいと考えられる**（J-1 の実測: 71 件中 `aggregated_rating` あり 1 件、`rating_count >= 15` は 0 件）。したがって実質的な選択肢は「`0` のみ」か「`0, 8, 9`」の二択である。

---

## 8. 先行して修正できるもの（仕様議論と独立）

以下は §7 の論点の結論に依存せず、単独でバグとして修正できる。

| # | 内容 | 参照 | 影響 | 状態 |
|---|---|---|---|---|
| 1 | `themes != (37)` → `themes != (42)` | §3.1 | 成人向けフィルタが実際に機能するようになる。**優先度最高** | ✅ **完了**（Issue #207 / PR #209、§10） |
| 2 | `game_type = 0` の追加（DLC / エディション除外） | §3.2 | vol.14 の ARK DLC・vol.17 の「Standard Edition」混入が止まる | ✅ **完了**（Issue #207 / PR #209、§10） |
| 3 | `fetchRecentPopularGames` に `first_release_date < now` を追加、`limit` を引き上げ | §2.2 | 未発売作が新作枠の候補を食い潰す問題が止まる（論点C で未発売作を扱う場合は別枠として実装） | 未着手（§11.1 で発売済み/未発売の 2 クエリ分離が確定したため、その実装に統合する） |
| 4 | `isQualifiedGame()` の `metascore` 経路が死んでいる事実の解消 | §2.3 | 論点D の結論待ちだが、「死んだ経路を残したまま運用する」状態は解消すべき | 未着手（論点 D の結論待ち） |
| 5 | **Steam 経路で DLC が除外されていない**（`fetch-steam.ts` の `getAppDetails` が `appData.type` を読んでいない） | §8.1 | vol.13 の DJMAX DLC・vol.15 の GRANBLUE アップグレードキット・vol.17 の Grim Dawn 拡張の混入が止まる。**現に Top Sellers 10 件中 2 件が DLC** | ✅ **完了**（2026-08-08。PR #226 = PR-A。実装時に**サウンドトラック `type=music` の混入も新たに発見**し同時に塞いだ） |
| 6 | 未発売作の `first_release_date` が確定日でない（`date_format != 0`） | §8.2 | 「Q3 2026」のような曖昧日付を「発売日」として記事に書く事故を防ぐ | §11.1 の未発売クエリに `date_format = 0` 条件として組み込む |
| 7 | **Issue #208: `searchGameByName` に `where` 句が無い**（特集の LLM 提案検証経路が全フィルタを迂回） | §7 論点J-4 | 成人向けが記事に載る状態が止まる。**実測で Erotic 7/10 が通り、DLC も `game_type=2` が 2/2 通った。この経路の唯一の防御は 1 件しかないブロックリスト** | ✅ **方針決定**（2026-08-01。(J-4-a) を採用）・**単独 PR で最優先** |

### 8.1 【新規・重大】Steam 経路で DLC が除外されていない

> ✅ **解消済み（2026-08-08。PR #226 = PR-A、マージコミット `2011619`）。** 以下は発見時点の記録。
> 実装内容と実装時の追加実測は本節末尾の「実施結果」を参照。
> **本節中の `fetch-steam.ts` の行番号は発見時点のもので、PR #226 で大きくずれている**
> （`getAppDetails` は `:182` → **`:199`**）。

**PR #209 の `game_type = 0` は IGDB 経路にしか効かない。** 候補プールへのもう一方の入口である Steam Top Sellers / Top Played 経路には、DLC を除外する処理が存在しない。

`scripts/fetch-steam.ts:182-200` の `getAppDetails()` は Steam Store API の `appdetails` を叩いているが、**レスポンスの `type` フィールド（`game` / `dlc` / `demo` / `music`）を読んでいない**。読んでいるのは `name` と `content_descriptors.ids`（成人向け判定）だけである。

```ts
// scripts/fetch-steam.ts:182-200（現状）
async function getAppDetails(appId: number): Promise<{ name: string | null; isAdultContent: boolean }> {
  // ... appdetails?appids=${appId}&cc=jp&l=japanese
  const descriptorIds: number[] = appData.content_descriptors?.ids ?? [];
  const isAdultContent = descriptorIds.some((id) => ADULT_CONTENT_DESCRIPTOR_IDS.includes(id));
  return { name: appData.name || null, isAdultContent };  // ← appData.type を一切見ていない
}
```

**実 API での確認（2026-07-29）**:

```
appId 2699230  type=dlc  fullgame={219990, "Grim Dawn"}
               「Grim Dawn - Fangs of Asterkarn」 ← vol.17 でインディー枠に混入した実例

現在の Top Sellers（10件中 2件が DLC）:
appId 4893760  type=dlc  fullgame=2111630  JR東日本トレインシミュレータ（追加車両）
appId 2138330  type=dlc  fullgame=1091500  サイバーパンク2077：仮初めの自由
```

**これが過去の DLC 混入事故の真の原因と考えられる**（vol.13 DJMAX DLC / vol.15 GRANBLUE アップグレードキット / vol.17 Grim Dawn 拡張）。IGDB 側のエディション混入（§10.4）は運用条件下では 0.6% と定量的に小さい（§8.3）のに対し、Steam 経路は **現時点の実データで 20%** が DLC である。

**修正方針（案）**: `getAppDetails()` の戻り値に `type` と `fullgame` を含め、`type !== 'game'` を候補から除外する。`fullgame` があれば親 appId が取れるので、DLC を親ゲームに読み替えるという選択肢もある（要決定）。カテゴリ横断で効くため、新作紹介・インディー両方に影響する。

#### 8.1.1 実施結果（2026-08-08。PR #226 = PR-A）

**採用した方針**: `getAppDetails()` の戻り値に `type: string | null` のみを追加し、4 つのループ（`fetchTopSellers` / `fetchTopPlayed` / `fetchNewReleases` の `new_releases` と `coming_soon`）で `type !== 'game'` を除外する。**`fullgame` は読まず、親ゲームへの読み替えは行わない**（上記「要決定」の決着。親ゲームは発売から年数が経っており 60 日窓で落ちるため、読み替えても除外と同じ結果になる）。

**実装時のライブ実測（2026-08-08）で、本節に記載の無い混入経路を発見した**:

```
top_sellers（10 件中 2 件。発見時点の記録を再現）:
appId 4412690  type=dlc    fullgame={1364780, "Street Fighter 6"}  Year 4 アルティメットパス
appId 4412680  type=dlc    fullgame={1364780, "Street Fighter 6"}  Year 4 キャラクターパス

coming_soon（10 件中 2 件。★本節に記載が無かった）:
appId 4713630  type=music  fullgame={2682270, "Pight"}             Pight Soundtrack
appId 4990990  type=music                                          Lord of Kensai Soundtrack
```

**サウンドトラック（`type=music`）が `coming_soon` 経由で混入していた。** `fetchNewReleases` の結果は `fetchSteamData` 内で `topSellers` にマージされるため DLC と同じ穴である。判定を「dlc の除外」ではなく「**game 以外の除外**」としたため同時に塞がった。

**混入が現に起きていたことの確認**: vol.18 の記事 1 本目が appId 4412690 のこの DLC そのものだった（`src/content/issues/issue-018.md:7` で実物確認）。

**判定順序**: 成人向け → name 不一致（`isSameSteamApp`）→ type。当初 type を name 不一致より前に置いていたが、appId 取り違え（Issue #102 型）でその appId の実体がたまたま `dlc` / `music` だった場合に、より診断価値の高い `appId/name mismatch` 警告が出なくなるためレビューで後ろに移した。候補の採否は変わらない（観測性のみ）。

**残った課題（別 Issue に分離）**:

- **#227**: `getAppDetails` はリトライ無しの生 `fetch` で `response.ok` も見ないため、**取得失敗が候補の欠落に直結する**（実装前は Featured 側の name で採用されていた）。fail-closed 自体は §6.1 の決定どおりなので覆さない。実装前の fail-open にも「`appdetails` が取れないと `isAdultContent` が `false` になり成人向けが素通りする」別の穴があった
- **#228**: スクリーニング処理が 4 ループに重複している（重複自体は本 PR 以前から存在）。**許可する種別を広げる場合や `fullgame` 読み替えを入れる場合は先に片付けたほうがよい**

### 8.2 未発売作の `first_release_date` が確定日でない

`release_dates.date_format` は 0=正確な日、1=月のみ、2=年のみ、5=四半期、7=TBD。`first_release_date` は全 `release_dates` の最小値なので、**曖昧な日付もそのまま `first_release_date` として入ってくる**。

実測（未発売 90 日窓 973 件、2026-07-29）: **435 件 / 44.7% が非 exact**。`hypes > 20` の層に絞ると 4/35 件。

```
Grave Seasons  Q3 2026 (fmt=5)
Acts of Blood  Q3 2026 (fmt=5)
Aniimo         Q3 2026 (fmt=5)
Neverway       Oct 2026 (fmt=1)
```

未発売記事は「📅発売情報」で日付を明示する構成なので、曖昧日付をそのまま出すと事実性の誤りになる。§11.1 の未発売クエリに `date_format = 0` を含めることで解決する（実存判定の一部として機能する。§11.2 論点 N-1）。

### 8.3 【訂正】IGDB 側のエディション混入は運用条件下では軽微

§10.4 で「`game_type = 0` はエディション違いを完全に除外しない」と記録したが、**運用条件下での混入率を実測した結果、定量的には軽微である**ことが判明した（2026-07-29）。

| プール | エディション混入 |
|---|---|
| 発売済み 60 日窓 生件数 3,034 件 | 17 件（0.6%） |
| 未発売 90 日窓 生件数 973 件 | 10 件（1.0%） |
| 名作枠クエリ（`hypes > 100`, limit 30） | **0 件** |
| **発売済み 60 日窓 × 品質条件（`agg_count >= 2` or `rc >= 15`）12 件** | **0 件** |

品質条件を通した層では 0 件である。エディション違いは批評スコアもユーザー評価も本体側に付くため、品質フロアが実質的にエディションを落としている。

→ **エディション除去の専用ロジックは優先度が低い**。DLC 混入対策のリソースは §8.1（Steam 経路）に向けるべきである。

---

## 9. 次のアクション

1. ~~**§8 の 1・2 を先行修正**（Issue 化 → `fix/` ブランチ → PR）~~ ✅ **完了**（§10）
2. **論点を議論して決定**
   - ✅ 新作紹介・インディーの主要論点は決着（§11.1）
   - ✅ 論点 I-1（インディー枠の規模判定）は決着（2026-07-30。§11.4.1〜11.4.4）
   - ✅ 論点 N-6（発売済み側のソート軸）は決着（2026-08-01。§11.4.5〜11.4.11）
   - ✅ 論点 N-5（未発売記事の情報ソース・構成）は決着（2026-08-01。§11.3.1〜11.3.5）
   - ⏸ **保留**: `VALIDATION_AUTO_REGENERATE` の適用範囲（§11.3.6）と high 警告 96 件の重大性の再定義（§11.3.7）。ユーザー判断により「high は記事を公開してはいけないほどのものか」の検討を先に行う
   - ✅ 論点J-4（特集の LLM 提案検証経路）は決着（2026-08-01）
   - ✅ 論点J-5（共通フィルタのパラメータ化）は決着（2026-08-01）
   - ✅ 論点B（名作枠の母集団条件）は決着（2026-08-03）
   - ✅ 論点J-3（名作枠のリメイク・リマスター）は決着（2026-08-03）
   - ✅ 論点I（移行時の履歴の扱い）は決着（2026-08-04。(I-1) = 履歴に手を加えない。移行作業ゼロ）
   - ✅ 論点D（`metascore` / OpenCritic）は決着（2026-08-04。(D-1') = 取得経路・型・プロンプト参照を削除、表示層は残す。**`metascore` は全 17 号で 0 件＝そもそも動作していなかった**）
   - ✅ 論点G（名作枠の歴史セクション）は決着（2026-08-04。(G-4) = 📜 を維持し、禁止リストの重複項目を削除、プロンプト抜粋を 300 → 1500 字に拡大、クエリに発売年を追加。**律速は検索ではなく抜粋長だった**）
   - ✅ 論点F（特集の構造化テーマ）は決着（2026-08-05。**(F-2')** = 暦イベントを主軸に維持し、**イベント 0 件週（年 5 週）のみ**「発行日から後方向に最大 7 日遡って直近の記念日」を採用する。**IGDB の構造化テーマは使わない**（ユーザー判断）。暦イベント起点は 14/17 号で機能しており、壊れているのは 0 件週だけ）
   - ✅ 論点H（供給不足時の挙動）は決着（2026-08-06。**(e)** = 公開は止めず、`validate-article.ts` に本数不足の警告タイプを追加して `computeReportStatus()` に算入し `status: error` → Issue 自動起票に乗せる。`launch.astro` の「毎号6本」3 箇所も実態に合う表現に直す。**生成層は変えない**。決定的事実は「`totalArticles` は記録されているが status 判定に入っていない＝本数不足が運用者に一切届かない」こと。実測で期待 6 本を満たしたのは 14/17 号で、**vol.13 の classic 欠落は本調査で初めて判明した**）
   - ✅ 論点J-1（新作紹介のリメイク・リマスター）は決着（2026-08-06。**(J-1-c)** = `game_type = 0, 8, 9` を許可し、`game_type` を `GameData` まで持ち回って【ゲーム情報】欄に提示することで、`newReleaseSystem` にリメイク／リマスターであることの明記ルールを 1 行足す。Port(11) は除外のまま。**決定的根拠は「名作枠 J-3 で混線を起こした構造が新作枠には存在しない」こと**＝新作枠の窓は 60 日なので原作とリメイクが同一プールに入り得ない。また既存禁止リストの「続編・関連作の存在」は「提供データに明示的に書かれていない限り」が前提なので、提供データに種別を載せれば**禁止リストを緩めずに**書けるようになる）
   - 🎉 **§7 の全論点が決着した**（A〜J のうち議論対象としたものすべて）。⏸保留は §11.3.6（`VALIDATION_AUTO_REGENERATE` の適用範囲）と §11.3.7（high 警告 96 件の重大性の再定義）の 2 件のみ
3. ✅ 決定内容を本ドキュメントに反映（新作紹介・インディーの全論点。2026-08-01 時点で仕様として確定）
4. **実装計画（PR 分割）を策定** ← **次はここから**
5. `DEV_MODE=true` で実データ検証 → 本番反映

**次セッションの着手順（依存関係順）**:

1. ~~**§11.4 論点 I-1（`developed` の数え方 → 閾値）**~~ ✅ **決着**（2026-07-30。生件数 + `developed > 20`。§11.4.1〜11.4.4）
2. ~~**§11.4 論点 N-6（発売済み側のソート軸）**~~ ✅ **決着**（2026-08-01。4 軸・絶対尺度・重み付き最大値。§11.4.5〜11.4.11）
3. ~~**§11.3 論点 N-5（未発売記事の情報ソース・構成）**~~ ✅ **決着**（2026-08-01。indie 枠は発売済み限定 / 6 セクション維持 / OR なしクエリ / 評価断定バリデータ high / judge は user 1 行追記。§11.3.1〜11.3.5）
4. ~~**§7 論点J-4（特集の LLM 提案検証経路）**~~ ✅ **決着**（2026-08-01。(J-4-a) = `searchGameByName` に共通フィルタを追加。§7 J-4 の決着ブロック）→ **PR-0 として最優先で単独実装**
5. ~~**§7 論点J-5（共通フィルタのパラメータ化）**~~ ✅ **決着**（2026-08-01。`gameTypes` 配列を引数で受けデフォルト `[0]`。§7 J-5 の決着ブロック）→ **PR-0.5 として PR-A / PR-B / 名作枠 PR より前に単独実装（挙動不変の純リファクタ）**
6. ~~**§7 論点B（名作枠の条件）**~~ ✅ **決着**（2026-08-03。**経過年数の下限は設けず** `total_rating >= 85 & total_rating_count >= 200`、`sort total_rating_count desc`、`limit 200`。年代分散ロジックも入れない。§7 論点B の決着ブロック）→ 名作枠 PR。**残る未決はソート軸**（`total_rating_count` 降順が最終案かは未定。N-6 の 4 軸スコア流用を検討）
7. ~~**§7 論点J-3（名作枠のリメイク・リマスター）**~~ ✅ **決着**（2026-08-03。(J-3-e) = `game_type = 0` + 「`parent_game` が `game_type=0` プールに不在の `t8`/`t9` のみ」。母集団 266 件・混線 0 件・`HistoryEntry` 拡張不要。§7 論点J-3 の決着ブロック）→ **論点B と同じ名作枠 PR で実装する**
8. ~~**§7 論点I（移行時の履歴の扱い）**~~ ✅ **決着**（2026-08-04。(I-1) = `history.json` に一切手を加えない。**移行作業ゼロ**。実測でブロックされるのは既に掲載済みの正当な名作 6 件のみ＝仕様どおりの動作。§7 論点I の決着ブロック）→ **名作枠 PR に履歴関連の変更は含まれない**
9. ~~**§7 論点D（`metascore` / OpenCritic）**~~ ✅ **決着**（2026-08-04。(D-1') = 取得経路・型・選定条件・プロンプト参照・バリデータ参照を削除し、表示層 5 ファイルと `content.config.ts` は残す。**実測で `metascore` は全 17 号 0 件＝動作していなかった**ため「置き換え」ではなく「削除」。§7 論点D の決着ブロック）→ **PR-D として単独実装できる（削除のみ・挙動不変）。ただし `fetch-data.ts` の名作枠選定部を触るため名作枠 PR と直列に並べる**
9.5. ~~**§7 論点G（名作枠の歴史セクション）**~~ ✅ **決着**（2026-08-04。(G-4) = ①`classicSystem` の禁止リストから重複項目 `:342` を削除し 📜 の指示を「材料が無ければ省略」に強める ②`fetch-web-search.ts` のプロンプト抜粋を `slice(0, 300)` → `slice(0, SNIPPET_MAX_LENGTH)`(1500) に統一 ③`searchGameHistory()` のクエリに発売年を追加。§7 論点G の決着ブロック）→ **①③は名作枠 PR に含める。②は全カテゴリに影響するため PR-E として単独実装**
10. **PR-A: §8.1（Steam 経路の DLC 除外）** — 他の論点と独立。単独 PR として先行できる。下位判断（DLC を捨てるか `fullgame` で親に解決するか）は実装時に決める
    → ✅ **完了**（2026-08-08。PR #226）。下位判断は「**捨てる**（`fullgame` 読み替えはしない）」で決着。§8.1.1 参照
11. **PR-B: N-6 のスコア実装 + ファンゲーム検出の修正 + J-1-c の実装**（下記のユーザー指示により同一 PR。J-1-c を含める理由は `IGDB_GAME_FIELDS` / `IGDBGame` / `GameData` / `buildUserMessage` の同一 4 箇所を触るため。§7 論点J-1 の決着ブロック「実装上の位置づけ」）
12. **PR-C 以降: N-5 の実装** — 未発売記事のプロンプト分岐 / Tavily 検索セット分岐 / 評価断定バリデータ / judge の 1 行追記 / インディー枠の発売状態フィルタ（確定事項 #17）
13. **PR-E: プロンプト抜粋長の 300 → 1500 統一**（論点G の (2)）— 4 カテゴリすべてに影響する。`DEV_MODE=true` で全カテゴリの出力品質を確認してからマージする。**PR-C（N-5 のプロンプト分岐）と同じ箇所を触るため、どちらか一方を先に入れて他方をリベースする**
14. **PR-F: 特集のイベント 0 件週フォールバック**（論点F の **(F-2')**）— 他の論点と独立。`bedrock-client.ts:615-617`（固定文言 `'今週の注目ゲーム特集'`）と `generate-articles.ts:714-715`（`gameThemeHint`）の 2 箇所 + 後方探索の実装（`fetch-japanese-events.ts` に「後方向に遡って直近の記念日を返す」関数を追加）。**着手前に「発行日が金曜になっている」原因（実測 11/17 号）を確認する**。記念日の使用履歴の保存先と除外対象号数 N も実装時に決める。**IGDB の構造化テーマは実装しない**
15. **PR-G: 本数不足の検出**（論点H の (e)）— `validate-article.ts` に本数不足の警告タイプ追加 / `format-validation-report.ts` の `computeReportStatus()` に 1 条件追加 / `launch.astro:1100,1163,1202` の「毎号6本」を修正。**生成層（`fetch-data.ts` / `generate-articles.ts` / `completeness-gate.ts`）には手を入れない**。他の論点と独立だが、**PR-B・名作枠 PR より後に置く**（不足が実際に減ったかを Issue 起票で観測できる）

**N-6 の実装で同時に対応するもの**（ユーザー指示により同一 PR）:

- **ファンゲーム検出の修正**（§3 系のバグ）。`scripts/game-filter.ts` の `isFanGame()` はタイトル文字列とジャンルしか見ていないため、`Pokémon Infinite Fusion`（IGDB id=143761、`rating=98(rc=22)`、`game_type=0`、`involved_companies` 空、keywords に `unofficial` / `fangame` / `fanmade`）が通過し、旧ソートでは 1 位になっていた。IGDB の `keywords` を判定に追加する（`involved_companies` が空であることを併用するかは実装時に判断）
- **J-1-c の実装**（2026-08-06 決着）。新作枠クエリの `gameTypes` に `[0, 8, 9]` を渡し、`game_type` を `IGDB_GAME_FIELDS` → `IGDBGame` → `GameData` → `buildUserMessage` の【ゲーム情報】欄まで持ち回り、`newReleaseSystem` に明記ルールを 1 行足す。**受け入れ条件**: `DEV_MODE=true` で、リメイク種別を渡したときに LLM が原作のストーリー・内容（禁止項目）に踏み込まないことを確認する

**I-1 / N-6 決着に伴って残った小論点**（いずれも本体の決定は変えない）:

- **インディー枠のソート軸が §11 で明示されていない**。`hypes` は禁止（§4.1.3）なので現行の `sort hypes desc` は変更必須。N-6 のスコア式（11.4.5）を流用できる可能性があるが、インディー枠では「国内販売」軸が機能しにくい（大手タイトルが Amazon 上位を占める）ため未検証
- **`developer` 不明な候補の扱い**（実測 11 件中 1 件）。件数による規模判定が不能
- **`companies.parent` を第 3 のシグナルとして併用するか**（保有率 15%、多段構造あり）
- **N-6 スコアのパラメータ再調整**（Issue #210）。重み・満点基準・写像・保有条件しきい値を運用実績で校正する

**論点D 決着に伴って残った課題**（本体の決定には影響しない）:

- **`issue-002.md:11` の「Metacriticで89点」が数値ハルシネーション検出をすり抜けている可能性**。`metascore` は常に undefined なので、この記述は提供データに基づかない。vol.2 当時に当該バリデータがあったかは未確認。現行 `validate-article.ts` が「提供データに無い出典付き数値」を捕まえられるかは別途検証が必要（`issue-004.md:142` も同型だが数値なし）
- **`validate-article.test.ts:346-356` は削除対象**。`metascore: 90` を渡して「警告しない」ことを検証しているテストで、`metascore` フィールド廃止と同時に成立しなくなる

**論点G 決着に伴って残った課題**（本体の決定には影響しない）:

- **受賞歴・ランキング順位を検出するバリデータが存在しない**。`validate-article.ts:438-457` の `NUMERIC_PATTERNS` に「受賞」「Game of the Year」「第N位」のパターンは 1 つもなく（grep で 0 件）、`validatePersonAttribution()`（`:544-587`）は `〜氏によると` / `CEOの〜` 形式しか見ないため `Eric Barone` のような裸の人名を検出しない。実測で 📜 に漏れているのはまさにこのカテゴリ（受賞歴 3/16 号・個人名 2/16 号）。📜 に限らず全カテゴリに効く問題なので、⏸保留中の「high 警告の重大性の再定義」（§11.3.7）と同じ束で扱う
- **validation レポートが 17 号中 8 号分しか存在しない**（1, 3, 4, 5, 7, 8, 9, 17）。残り 9 号についてバリデータがすり抜けたのか未検証なのかを**確認できない**。レポートの生成が全号に対して行われるようになったのがいつからかは未調査
- **抜粋 300 → 1500 の副作用は未測定**。プロンプトが長くなることで出力の焦点がぼやける可能性がある。`DEV_MODE=true` で 4 カテゴリすべての出力を確認して判断する（PR-E の受け入れ条件）

**論点F 決着に伴って残った課題**（本体の決定には影響しない）:

- **発行日が土曜でなく金曜になっている**。実測で 17 号中 **11 号が金曜**（土=6）。CLAUDE.md および GitHub Actions の「毎週土曜日 AM 6:00 (JST)」と実際の `publishDate` が一致していない。原因**未調査**。イベント窓（`getEventsInRange(publishDate, 7)`）の当たり方に直接影響するため、PR-F の着手前に確認する
- **`history.json` に特集で使った記念日が記録されていない**（実読で確認。記録しているのはゲームタイトルのみ）。(F-2') の「直近 N 号がテーマとして使った記念日を除外する」に必要。保存先（`history.json` の拡張 / 過去号 frontmatter の走査 / 別ファイル）と N の値は実装時に決める
- **フォールバックが発火したことを出力から追えない**。実際に発火した 2 号（vol.2 / vol.8）は特集タイトルの傾向から推測したもので、ログ・frontmatter に記録が無い。PR-F では発火を記録する（実装時に決める）
- **`data/japanese-events.json` の穴を埋める案は採らなかった**。(F-2') はフォールバックで対処する決定。イベント定義そのものを追加して 0 件週を無くす案は**本論点では扱わなかった**（127 件・月ごと 10〜12 件でほぼ均等なので、穴は定義の不足ではなく「発行日 + 7 日窓」の切り取り方に起因すると考えられる）。なお (F-2') の後方探索は既存定義だけで 5 週すべてを -1〜-5 日で埋められる（実測）ため、定義追加の必要性は下がった

**論点H 決着に伴って残った課題**（本体の決定には影響しない）:

- **vol.13 の classic 記事が 0 本になった原因が不明**。本調査で初めて判明した事実で、これまでの議論には一度も出ていない。`generate-articles.ts:1346` の `console.warn('No classic game selected, skipping')` の経路と**考えられる**が、当時のログが残っていないため**確認できない**。(e) を入れれば今後は同型の事象が Issue として上がるので、原因はそのとき調査する
- **過去号の生成ログ・`data/aggregated.json` が残っていない**ため、「不足」と「そもそも生成しようとしなかった」を事後に区別できない。§2.3 で挙げた「aggregated.json をアーティファクトとして保存する仕組み」と同じ課題
- **本番 validation レポートが `data/validation/` に 1 件（vol.17）しかない**（実測。`data/validation-manual/` に 7 件、`data/validation-dev/` に 21 件）。本番レポートの継続保存が始まったのは Issue #202（`weekly-build.yml:102-103` の `git add data/validation/`）以降であることを実読で確認した。§7 論点G で切り出した「17 号中 8 号分しかない」の原因がこれで判明した

なお §8 の 4 は論点 D の結論に依存する（→ (D-1') 決着により、OpenCritic 経路は復活させず削除する方針が確定）。論点J（`game_type` の枠別化）は PR #209 で入れた共有ヘルパーの構造変更を伴うため、他の論点より先に方針を決めておくと後戻りが少ない。

---

## 10. 対応済みバグの記録（Issue #207 / PR #209）

対応日: 2026-07-26
実装: Sonnet / レビュー: Opus 5（独立検証を含む）
ブランチ: `fix/issue-207-igdb-query-filters`

### 10.1 修正内容

`scripts/fetch-igdb.ts` の 3 つの母集団クエリ（`fetchRecentPopularGames` / `fetchClassicGames` / `fetchIndieGames`）に共通フィルタを適用した。

```ts
const IGDB_THEME_EROTIC = 42;     // 成人向けコンテンツ（Erotic theme）
const IGDB_GAME_TYPE_MAIN = 0;    // Main Game（DLC・エディション違い・バンドルを除外）

function buildIgdbCommonFilters(): string {
  return `game_type = ${IGDB_GAME_TYPE_MAIN} & themes != (${IGDB_THEME_EROTIC})`;
}
```

3 クエリすべてで `& themes != (37)` を `& ${buildIgdbCommonFilters()}` に置換。マジックナンバーの再発を防ぐため定数化し、フィルタ文字列の生成を 1 箇所に集約した。

### 10.2 検証結果（実測）

**IGDB API 実測での効果確認**（新作枠クエリ、90 日窓）:

| 条件 | 件数 |
|---|---|
| 旧クエリ `first_release_date > 90日前 & hypes > 5 & themes != (37)` | 419 |
| 新クエリ `... & game_type = 0 & themes != (42)` | 375 |
| 新プール内に残る Erotic 作品 | **0** |

除外された 44 件の内訳を全件確認した結果、**すべてが正当な非 Main Game または Erotic 作品**だった。

- Erotic 2 件: `Haunted by Femboy`（hypes=26）、`My Femboy Roommate: Special Weekend`（hypes=7）— §3.1 で挙げた実例がそのまま除外された
- 非 Main Game: Remake（`Assassin's Creed Black Flag Resynced`, `Gothic 1 Remake`, `Persona 4 Revival`）、Expansion（`Monster Hunter Wilds: Ascendance`, `Diablo IV: Lord of Hatred`）、Bundle（`Elden Ring: Tarnished Edition`, `MGS Master Collection Vol.2`）、Expanded Game、Port、Mod（`Skyblivion`）、DLC

**`game_type = 0` による意図しないデータ欠落がないことを確認**（レビュー時に最大のリスクとして検証。IGDB は where 句で null 値の行を落とすため、`game_type` が未設定の行が silent に除外される懸念があった）:

| プローブ | 件数 |
|---|---|
| 全ゲーム（`id > 0`） | 370,449 |
| `game_type != null` | **370,449**（＝全件） |
| `game_type = null` | **0** |

`game_type` は IGDB の全行に設定されているため、**null 行の silent な欠落は発生しない**。直近 90 日発売の 500 件を実取得しても `game_type` が欠落した行は 0 件だった。

**`themes != (42)` がテーマ未設定のゲームを落とさないことも確認**: 新作窓に `themes = null` のゲームは 39 件あり、その全件が `themes != (42)` を通過する（配列の否定形では null-drop が起きない）。

### 10.3 レビューで判明した事項

Opus によるレビューで以下を検出し、対応した。

**(a) テスト配線の欠落 → 修正済み**

当初のテストは `buildIgdbCommonFilters()` を単体で検証するだけで、**3 つの母集団クエリが実際にヘルパーを使っていることを検証していなかった**。将来の編集で 1 クエリからフィルタが外れても全テストが green のまま通り、同じバグが再発し得る状態だった。

`fetchIGDBData()` を呼び出して `global.fetch` のリクエストボディを捕捉し、3 クエリすべてが `game_type = 0` と `themes != (42)` を含むことを検証する統合テストを追加した。クエリを識別子（`hypes > 5` / `hypes > 100` / `rating_count > 5`）で区別して個別にアサートしており、失敗時にどのクエリが漏れたか特定できる。

Red-Green を実測で確認済み（実装者は新作クエリ、レビュー側は別のインディークエリでそれぞれフィルタを一時削除し、いずれもテストが正しく失敗することを確認）。

**(b) tautological assertion → 修正済み**

`expect(filters).toContain(\`game_type = ${IGDB_GAME_TYPE_MAIN}\`)` のように**実装と同じ定数を埋め込むアサーション**が含まれていた。定数値をどう変えても常に pass するため、`IGDB_THEME_EROTIC = 37` に戻されても検出できない。プロジェクト規約が禁じる「意味のないアサーション」に該当する。

リテラル値（`'game_type = 0'` / `'themes != (42)'`）での検証に置き換え、不成立になり得ないアサーションを削除した。テストで不要になった定数は `__test` エクスポートからも外し、テストシームを最小化した。

**(c) 別経路の同種リーク → Issue #208 として分離起票**

特集記事の候補には LLM 提案経路（`generate-articles.ts:556` `verifyProposedGames()` → `searchGameByName`）があり、この IGDB クエリには `where` 句が一切ないため本修正のフィルタを通らない。実 API で以下を確認した。

```
search "Haunted by Femboy"  → themes=[19,42,44], game_type=0   ← Erotic
search "Granblue Fantasy: Relink - Endless Ragnarok" → game_type=10 (Expanded Game)
```

さらに `isAdultContentByAI` は newReleases / indies / classic には適用されているが **feature には適用されていない**（`generate-articles.ts` :1229 / :1250 / :1330）。特集枠の成人向け防御は登録 1 件の手動ブロックリストのみという状態。

→ **Issue #208** として起票。#207 のスコープ外のため分離した。

**(d) 単一ゲーム照合経路にフィルタを追加してはいけない（設計判断）**

`searchGameBySteamAppId`（`fetch-igdb.ts:586`）には `game_type = 0` を**追加しない**。appId は同一性シグナルとして最も強く、DLC の appId 逆引きによるメタデータ補完が壊れるため。候補プールへの注入経路と、単一ゲームのメタデータ補完経路は区別して扱う。

### 10.4 本修正の限界（既知・仕様議論に持ち越し）

**`game_type = 0` はエディション違いを完全に除外しない。** IGDB では多くの `: Deluxe Edition` 系が `game_type = 0` として登録されている（実測確認: `Demon's Souls: Deluxe Edition`, `God of War: Digital Deluxe Edition`, `Grid Legends: Deluxe Edition`, `Elden Ring: Collector's Edition` はいずれも `game_type = 0`）。`プライムステータスアップグレード` 型の行は除外できたが、Deluxe Edition 型は残る。下流の `game-identity.ts` の重複排除が引き続きこの負荷を負う。

> **【2026-07-29 追記・定量的訂正】** この限界は**運用条件下では軽微**であることを実測で確認した。生プールでの混入率は発売済み 60 日窓 17/3,034 件（0.6%）・未発売 90 日窓 10/973 件（1.0%）・名作枠クエリ 0/30 件であり、**品質条件（`agg_count >= 2` or `rc >= 15`）を通した 12 件では 0 件**だった。エディション違いには批評スコア・ユーザー評価が付かないため、品質フロアが実質的に排除している。
>
> **一方で、DLC 混入の真の経路は Steam 側だった**（`fetch-steam.ts` が `appData.type` を読んでいない。**現時点の Top Sellers 10 件中 2 件が DLC**）。詳細と実測は **§8.1 / §8.3**。エディション除去の専用ロジックより §8.1 の修正を優先すべきである。

**リメイク・リマスター・移植が全カテゴリで categorically 除外される。** `game_type = 0` は Remake(8) / Remaster(9) / Port(11) も落とす。フィルタは `buildIgdbCommonFilters()` として 3 クエリで共有されているため、**新作紹介・インディー・名作深掘りのすべてに一律で効く**。旧クエリの hypes 上位からは 4 件（`FF VII Remake` 228、`MGS Delta: Snake Eater` 185、`AC Black Flag Resynced` 123、`Tomb Raider: Legacy of Atlantis` 120）が消える。Issue #207 では「まず Main Game のみに絞り、必要になれば後続で緩める」というスコープ判断として明示的に受容した。

カテゴリごとに扱いを分けるべきかは **§7 論点J** で議論する（枠別の実測値・失われるタイトル・同一性混線のリスクを整理済み）。なお `ACBF Resynced` は §2.3 で vol.17 の候補に無かった理由を「不明」としていた作品だが、本修正後は「Remake なので構造的に除外」に確定する。

### 10.5 併せて修正したもの

`TODO.md:864`（Phase 19「成人向けゲーム除外フィルタ」）に `& themes != (37)` の追加が完了タスクとして記録されていた。実際には無効だった事実を注記として追記した。履歴としての記録は残しつつ、後続の読者が 37 を正しい id と誤認しないようにする趣旨。

---

## 11. 議論の到達点（2026-07-29 / 07-30 / 08-01） — 新作紹介・インディー

> **本節が最新である。** §7 の論点整理より後の議論結果であり、矛盾する場合は本節を採る。
> **対象カテゴリは新作紹介（newRelease）とインディー（indie）のみ。** 名作深掘り・特集は未着手。
>
> **2026-08-01 時点で、この 2 カテゴリの論点はすべて決着した**（残る 2 件 = `VALIDATION_AUTO_REGENERATE` の適用範囲と high 警告の重大性再定義は、ユーザー判断により**保留**）。次は実装（PR 分割）に入る。→ §9
>
> 本節の数値は、特記のない限り 2026-07-29 の実測に基づく。測定基準時刻: `now = 2026-07-29T09:23:39Z` / `JST 当日 0 時 = 2026-07-28T15:00:00Z`。
> **11.3.1〜11.3.7（論点 N-5）と 11.4.5〜11.4.11（論点 N-6）は 2026-08-01 の実測に基づく。** N-6 の母集団: 発売済み 60 日窓の候補 16 件 / 180 日窓の候補 90 件。Amazon ランキングは同日取得（ゲームソフト掲載枠 50 件・うち発売済み 23 件）、Steam Top Sellers は同日取得（9 件）。N-5 の母集団: 未発売 90 日窓の候補 30 件のうち発売日昇順で上位 5 件（Tavily 21 クエリ）、および `src/content/issues/*.md` 全 17 号と `data/validation*/validation-report-*.json` 全 28 件。
> 母集団: 発売済み 60 日窓（2026-05-29〜07-28）**3,034 件** / 未発売 90 日窓（07-28〜10-26）**973 件**（いずれも `game_type = 0 & themes != (42)`）。

### 11.1 確定事項

| # | 項目 | 決定内容 | 根拠 |
|---|---|---|---|
| 1 | 新作紹介の企業規模条件 | **撤廃する**（論点A = A-1）。`select-newreleases-with-fallback.ts:56-68` の `isLargeStudio` AND ゲートを削除 | Palworld のような大型インディーが落とされる。規模はインディー枠の除外条件としてのみ使う（§5.1） |
| 2 | 未発売作の扱い | **扱う**（論点C）。独立枠にはせず、新作紹介 2 枠の中で扱う | 要件.md の「もうすぐ発売」を満たす。供給も成立（11.2 N-2） |
| 3 | 枠の配分 | **発売済み優先の可変配分**。発売済み候補で 2 枠埋まればそれで確定し、不足分だけ未発売作で埋める | 発売済みの方が記事の情報量が多い（レビュー・ユーザーの声が存在する） |
| 4 | 発売済み窓 | **60 日** | 90 日は「新作」として古い。60 日でも供給は足りる（11.2 N-4） |
| 5 | 未発売窓 | **90 日** | 90 日で `hypes > 20` が 35 件 = 週 2.7 本 |
| 6 | 発売済み／未発売の境界 | **JST 当日 0 時**（`Math.floor((now + 9*3600) / 86400) * 86400 - 9*3600`）。JST 当日発売のタイトルは未発売側に落ちる | **ユーザー判断**: 発売当日はまだユーザー評価・ユーザーの声が存在しない可能性が高いため、未発売と同じ扱いでよい |
| 7 | 未発売作の並び順 | **発売日の昇順**（近い順）。`hypes` はソート軸に使わず品質フロアとしてのみ使う | `hypes` 降順だと 48 日後の Marvel's Wolverine が当日発売の作品より先に来る（11.2 N-2 の比較実測） |
| 8 | 同一タイトルの発売前／発売後の二重掲載 | **許可する**（論点 N-3 = (a)）。未発売時に「もうすぐ発売」で扱ったタイトルを、発売後に改めて扱ってよい | **ユーザー判断**。記事内容が別物（発売前は期待、発売後は評価）なので読者価値がある |
| 9 | 号内でのカテゴリ間重複 | **禁止する**（論点 I-2）。同じ号で同一タイトルが新作紹介とインディーの両方に出ることは避ける | **ユーザー判断**。実装は既に存在する（`fetch-data.ts:971`）が改善が必要（11.2 I-2） |
| 10 | 未発売作の情報ソース・記事構成 | **発売済みと分ける**（論点 N-5） | **ユーザー判断**。未発売作には批評スコアもユーザー評価も 0 件であることを実測で確認（§4.1.4） |
| 11 | インディー枠の規模判定 | **維持する**。静的リスト（`indie-classifier.ts`）+ `companies.developed` の OR 併用 | 規模はインディー枠の本質的な軸（§5.1） |
| 13 | インディー枠の規模判定の数え方 | **`developed` の生件数を使う**（Main 換算しない） | **2026-07-30 決定**。Main 換算はエディション汚染で精度が上がらず、かつ DLC 主体の大手をインディー側に落とす。詳細は 11.4.1 |
| 14 | インディー枠の規模閾値 | **`developed > 20` を「大手」としてインディー枠から除外する** | **2026-07-30 決定**。Yacht Club Games(12) / SUKEBAN(11) をインディー側に残し、Frozenbyte(27) 以上を大手側に落とす。詳細は 11.4.2 |
| 12 | `metascore` 相当の取得 | **IGDB の `aggregated_rating` を使う。OpenCritic / Metacritic の別途取得は不要** | §4.6 / §4.1.8。ただし実装形態は論点 D で未決 |
| 15 | 発売済み側のソート軸 | **4 軸（批評 / ユーザー票数 / Steam / 国内販売）を絶対尺度で 0〜100 に写し、重み付き最大値を採る** | **2026-08-01 決定**（論点 N-6）。percentile は同点 1 位を量産するため棄却。詳細は 11.4.5〜11.4.9 |
| 16 | 国内販売軸のデータ源と扱い | **ファミ通経由の Amazon ゲームソフトランキングを使う。順位は選定内部のみで使用し記事に出力しない** | **ユーザー判断**（2026-08-01）。IGDB 以外で機械可読なランキングを持つ媒体はファミ通のみだった。Amazon 系ライセンスとファミ通 `/copyright` の保存制限を回避するため出力しない。詳細は 11.4.11 |
| 17 | **インディー枠の発売状態** | **発売済みタイトルのみを扱う**（未発売作は新作紹介枠のみ）。`fetch-data.ts:964` の `indieRanked` に `releaseDate <= jstToday0` フィルタを追加する | **ユーザー判断**（2026-08-01）。過去 17 号の未発売記事 2 件はどちらも `indie` であり、`indieSystem` の `## 💬 プレイヤーの声` は未発売作には原理的に存在し得ない。詳細は 11.3.2 |
| 18 | 未発売記事のセクション構成 | **6 セクション維持**。✨ゲームの特徴 → **🔥なぜ注目されているか**、🎯Creator's Eye は「どこに**挑戦している**のか」に差し替え | **ユーザー判断**（2026-08-01）。6 セクションすべてに材料が存在することを実測で確認（11.3.3(4)） |
| 19 | 未発売記事の Tavily 検索セット | **`searchReviews` を実行しない**。`searchDeveloperInfo` + 新規 `"{title}" ゲーム 発売日 最新情報`（**OR 演算子を使わない**）。クエリ数は ±0 | **2026-08-01 実測**。`searchReviews` は前作レビュー・中身が空の集計ページを score 0.79〜0.91 で返す。OR 入りクエリは 2/5 で完全失敗し、OR を落とすと両方救済された（11.3.3(1)(3)） |
| 20 | 未発売記事の評価断定の検出 | **新規バリデータ `validateUpcomingEvaluationClaims` を severity `high` で追加**。本文と summary の両方を検査 | **ユーザー判断**（2026-08-01）。既存 `validateReleasedTitleExpression` は発売済み側だけの片側チェックで、未発売側の対称チェックが存在しない。judge は「主観的表現」を判定対象外にしているため単独では不足（11.3.4 / 11.3.5） |
| 21 | 未発売記事の judge 分岐 | **system プロンプトは共通のまま、user メッセージに 1 行追記する最小分岐** | **ユーザー判断**（2026-08-01）。system を 2 本に分けると共通ルールの同期メンテ漏れリスクが生じる（11.3.5） |

**確定した新作紹介の選定フロー（擬似コード）**:

```
jstToday0 = JST 当日 0 時の UNIX 秒

# 発売済み側（優先）
releasedPool = IGDB games
  where first_release_date >= jstToday0 - 60d
    and first_release_date <  jstToday0
    and game_type = 0 and themes != (42)
  品質条件: aggregated_rating_count >= 2 or rating_count >= 15
           or steamRank 掲載 or Amazon 国内ランキング掲載   # 第4軸を品質フロアにも使う
  sort: score 降順（論点 N-6 で決着。11.4.5）
        score = max( w_c × agg × min(1, n/4),
                     w_u × 100 × log10(rc)/log10(500),
                     w_s × 100 × (1 - (steam順位-1)/枠数),
                     w_j × 100 × (1 - (amazon順位-1)/50) )   # 保有しない軸は棄権
        初期重みはすべて 1.0（運用しながら再調整: Issue #210）
  → クールダウン除去（newRelease 17週）
  → 実測 11 件（2026-07-29 時点 / 第4軸込みでは 16 件・2026-08-01 時点）

# 未発売側（不足分のみ）
upcomingPool = IGDB games
  where first_release_date >= jstToday0
    and first_release_date <  jstToday0 + 90d
    and game_type = 0 and themes != (42)
    and hypes > 20                       # 品質フロア
    and date_format = 0                  # 確定日のみ（§8.2）
    and cover あり and developer 判明     # 実存判定（11.2 N-1）
  sort: first_release_date 昇順
  → 実測 31 件（2026-07-29 時点、週 2.4 件相当）

selected = releasedPool.take(2)
if selected.length < 2: selected += upcomingPool.take(2 - selected.length)
```

**確定したインディー枠の発売状態フィルタ（確定事項 #17）**:

```
# fetch-data.ts:964 indieRanked に追加する
indieRanked = games
  .filter(isIndieGame 系 …)                     # 既存
  .filter(g => !isFanGame(g))                   # 既存（keywords 追加は PR-B）
  .filter(g => new Date(g.releaseDate) <= jstToday0)   # ★追加: 未発売作を除外
  .filter(…)                                    # 既存
```

境界は確定事項 #6 と同じ **JST 当日 0 時**。JST 当日発売のタイトルは未発売側に落ちるため、インディー枠からも除外される（当日はまだプレイヤーの声が存在しない）。

### 11.2 測定で決着した論点

#### N-1: 未発売作の実存判定 — 「Steam ストアページの有無」は使えない

**ユーザーの問い**: 「対象は Steam タイトルだけではないが、実存判定は提示の方式で問題ないか？」
**回答: ユーザーの懸念は正しく、当初案（Steam or websites）は誤りだった。**

未発売 90 日窓 973 件で、hypes 帯ごとのシグナル保有率を実測:

```
帯          件数  Steam  websites  exact日  cover  summary  dev判明
hypes = 0    626   92%    99%      52%     98%     97%     45%
hypes 1-5    266   95%   100%      56%    100%    100%     73%
hypes 6-20    46   96%   100%      67%    100%    100%     96%
hypes 21+     35   89%   100%      89%    100%    100%    100%
```

- **`websites` は全帯で 99〜100%。判別力ゼロ**。`cover` も 98〜100% で同様
- **判別力があるのは `date_format=0`（52→89%）と `developer 判明`（45→100%）**
- **Steam 保有率は hypes が高い帯の方が低い（96%→89%）**。これは「Steam に無い = 実体が無い」ではなく、**Switch 2 / PS5 独占の注目作が Steam に無い**ためである

Steam 外部 ID を持たない `hypes > 20` の未発売作 4 件（すべて実在する注目作）:
```
hypes=250  Marvel's Wolverine            [PlayStation 5]
hypes= 85  End of Abyss                  [Xbox Series X|S, PC, PlayStation 5]
hypes= 57  Orbitals                      [Nintendo Switch 2]
hypes= 32  Fire Emblem: Fortune's Weave  [Nintendo Switch 2]
```

**→ 実存判定に Steam を必須にしてはならない。** 採用する条件は `date_format = 0` + `cover` あり + `developer` 判明 + `hypes` フロア。

複合条件の通過数（未発売 90 日窓）:
```
exact日 のみ                      538件 / 週41.8件
exact日 + (Steam or websites)     534件 / 週41.5件   ← Steam/websites を足しても 4 件しか減らない = 無意味
exact日 + cover + dev             310件 / 週24.1件
上記 + hypes>20                    31件 / 週2.4件
上記 + hypes>10                    46件 / 週3.6件
```

#### N-2: 未発売作の `hypes` フロアは `> 20`

未発売 90 日窓の `hypes` 分布（エディション除去後）:

| フロア | 件数 | 週換算 | `aggregated_rating` あり |
|---|---|---|---|
| `> 0` | 346 | 26.9 | **0** |
| `> 5` | 81 | 6.3 | **0** |
| `> 10` | 58 | 4.5 | **0** |
| **`> 20`** | **35** | **2.7** | **0** |
| `> 30` | 30 | 2.3 | **0** |
| `> 50` | 17 | 1.3 | **0** |
| `> 100` | 6 | 0.5 | **0** |

**`aggregated_rating` を持つ未発売作はどのフロアでも 0 件である**（`games/count` への直接プローブでも `{"count": 0}` を確認）。未発売枠で使える指標は `hypes` のみ（§4.1.4）。

`> 20` を採る理由: 週 2.7 件で 2 枠に対する余裕がある一方、`> 10`（週 4.5 件）まで下げると `developer 判明` 率が 96% に落ちる（N-1 の表）。`> 30` 以上は供給が 2 枠を割り込む恐れがある。

**発売日昇順（採用）と hypes 降順（不採用）の比較実測**:

```
[発売日昇順 = 採用]                      [hypes 降順 = 不採用]
+ 0d hypes= 36  Mistfall Hunter          hypes=250 +48d  Marvel's Wolverine
+ 2d hypes= 35  The Relic: First Guardian hypes=228 +36d  The Blood of Dawnwalker
+ 6d hypes= 33  Big Walk                 hypes=186 +57d  Control Resonant
+ 6d hypes=110  Beast of Reincarnation   hypes=174 +37d  Onimusha: Way of the Sword
+ 8d hypes= 51  Marvel Tokon             hypes=115 +29d  Resonance: A Plague Tale Legacy
```

「もうすぐ発売」の趣旨からは昇順が正しい。hypes 降順では 1 か月半先の作品が「もうすぐ」として先頭に来る。

#### N-4: クールダウンを込みにしても発売済みだけで 2 枠埋まる

`newRelease` は 17 週クールダウン。現在 31 件がクールダウン中（`indie` は 34 件）。

```
発売済み 60 日窓 × 品質条件（agg_count>=2 or rc>=15）× エディション除去 : 12件
  → newRelease クールダウン除去後                                    : 11件
     クールダウンで落ちたもの: Echoes of Aincrad（1件のみ）

未発売 90 日窓 × hypes>20 × エディション除去                          : 35件
  → newRelease クールダウン除去後                                    : 35件（0件も落ちない）
```

**結論: 発売済み 11 件で 2 枠は充足する。** 未発売作は実際にはあまり使われない（発売済みが枯れた週のみ）。

**ただし並び順に重大な問題がある** → 論点 N-6（11.4）へ。

#### I-2: 号内重複は既に防がれているが、比較が完全一致

新作紹介候補 11 件とインディー候補 11 件の重複を実測: **6 件が重複していた**。

```
Scrap Mechanic [Axolot Games developed=1]      agg=--  rc=32
Denshattack!   [Undercoders developed=14]      agg=83  rc=6
Palworld       [PocketPair developed=7]        agg=--  rc=257
Pokémon Infinite Fusion [developer 不明]        agg=--  rc=22
Backrooms: Escape Together [Triiodide developed=1] agg=--  rc=18
Meccha Chameleon [LEMORION developed=5]        agg=82  rc=57
```

**除外処理は既に存在する**（`fetch-data.ts:971`）:
```ts
.filter((g) => !newReleases.some((nr) => nr.title === g.title))
```

**現時点の実データでは取りこぼし 0 件**。ただし 2 点の改善が必要:

1. **比較が `title` の完全一致であり `normalizedTitle` でない**。履歴には表記揺れの実例がある — `Slay the Spire II`（newRelease）と `Slay the Spire 2`（indie）は別号だが、同一号で起きれば現行実装では重複を許してしまう。`normalizedTitle` に揃えるべき
2. **新作紹介が先に選ぶ構造なので、インディーは残りから選ぶことになる**。候補 11 件のうち 6 件が共通なので、新作紹介が 2 件取ると インディーの実効候補は 9 件になる。供給上は問題ないが、質の高いインディー作品が新作紹介側に吸われる可能性がある（新作紹介の規模条件を撤廃した副作用）。→ **配分順序を決める必要がある**（インディー枠を先に確定させる案もあり得る）。11.4 の残論点に含める

なお履歴には `Forza Horizon 6` と `007 First Light` が別号で newRelease / indie の両カテゴリに登場した実例がある（カテゴリ判定の一貫性の問題として別途認識）。

#### ④ エディション混入 — 質問への回答とバグの所在の訂正

**ユーザーの問い**: 「エディションが `game_type=0` を素通りする件は、新作紹介・インディーなど、どのカテゴリに対しての言及か？」

**回答: 全カテゴリ共通の母集団クエリの話だが、運用条件下では定量的に軽微であり、DLC 混入の真の原因は別（Steam 経路）だった。** 詳細は **§8.1 / §8.3**。要点:

- IGDB 側のエディション混入: 発売済み 60 日 0.6% / 未発売 90 日 1.0% / 名作枠 0% / **品質条件通過層 0/12 件**
- **Steam 経路には DLC 除外が存在しない**。`fetch-steam.ts:182-200` の `getAppDetails` が `appData.type` を読んでいない。**現在の Top Sellers 10 件中 2 件が DLC**。vol.13 / vol.15 / vol.17 の DLC 混入事故はこの経路と考えられる
  → ✅ **解消済み**（2026-08-08。PR #226。実装時に `coming_soon` のサウンドトラック混入も発見し同時に塞いだ。§8.1.1）
- Steam 経路は新作紹介・インディーの両方に効く（カテゴリ横断）

### 11.3 論点 N-5（未発売記事の情報ソースと構成） — ✅ 決着（2026-08-01）

> ✅ **決定（2026-08-01・ユーザー判断）**
> 1. **スコープ**: **インディー枠は未発売タイトルを扱わない**（発売済み限定にする）。未発売作は新作紹介枠のみで扱う
> 2. **記事構成**: §11.3 の設計案の表を**そのまま採用**（6 セクション維持）。ただし Tavily の新規クエリは実測に基づき **OR 演算子なしの定式化**に変更する
> 3. **評価断定の検出**: 新規バリデータを **high** で追加する
> 4. **自動再生成（`VALIDATION_AUTO_REGENERATE`）**: **保留**。「high 判定は記事を公開してはいけないほどのものなのか」を先に検討する必要があるため（→ 11.3.6）
> 5. **judge**: system プロンプトは共通のまま、user メッセージに 1 行追記する最小分岐

**ユーザーの問い**: 「未発売の記事内容について検討したい。発売済みの情報ソースと、未発売の情報ソース、記事の内容はそもそも分けたほうが良いのではないか？」

**回答: 分けるべきである。コードを実読して、現行の共通構成が未発売作に対して構造的に破綻していることを確認した。**

#### 現行コードの実読結果

| 経路 | 現状 | 未発売作での妥当性 |
|---|---|---|
| `fetch-web-search.ts` `searchReviews()` クエリ `"{title}" ゲーム レビュー 評価 感想` | newRelease に無条件で実行 | **有害**。存在しないレビューを探し、無関係な情報や他作品の評価を拾う（→ 2026-08-01 の実測でより具体的に悪いことが判明。11.3.3(1)） |
| `fetch-web-search.ts` `searchDeveloperInfo()` クエリ `... 開発者 インタビュー OR 開発秘話 OR 開発ブログ` | newRelease に無条件で実行 | **妥当**。発表時インタビューは未発売でも存在する |
| `searchSteamReviews()` | indie のみ | 未発売では該当なし |
| `aggregated_rating` / `rating_count` / `steamRank` | — | **構造的に null**（§4.1.4 で 973 件中 0〜1 件を実測） |
| `bedrock-client.ts` `getReleaseStatus()` | 発売済み／発売予定を判定して `buildUserMessage` に渡している | 判定自体は機能している |
| `newReleaseSystem` の構成 | 導入 / **✨ゲームの特徴（※提供されたレビュー情報を参考に）** / 🎨開発ストーリー / 👥こんな人におすすめ / 📅発売情報 / **🎯Creator's Eye（「どこが評価されているのか」）** | **✨と🎯が書けない**。レビューが存在しないため |
| `bedrock-client.ts:385-389` | 発売状況によって文言を切り替えている | **切り替わるのは文言のみで、セクション構成は同一** |

**現行の問題の核心**: プロンプトが「レビュー情報を参考に特徴を書け」「どこが評価されているのかを書け」と指示しているのに、未発売作には材料が一切ない。LLM は指示を満たそうとして推測を書くことになる（Issue #206 の HIGH 警告と同種の構造）。

なお `VALIDATION_AUTO_REGENERATE` はデフォルト OFF なので、バリデータが警告を出しても記事はそのまま公開される。**プロンプト側で構成を分けることが唯一の実効的な対策と考えられる**（この判断は 2026-08-01 に維持された。自動再生成の有効化は 11.3.6 のとおり保留）。

なお上表は `newRelease` のみを想定して書かれていたが、**実際に起きた未発売記事の事故 2 件はどちらも `indie` だった**（11.3.2）。そのためスコープの見直しが決定事項 ① として加わっている。

#### 11.3.1 採用する設計（★決定 2026-08-01）

| 項目 | 発売済み | 未発売 |
|---|---|---|
| Tavily 検索セット | `searchReviews` + `searchDeveloperInfo` | **`searchDeveloperInfo` のみ** + 新規「発売日・最新情報」検索（`searchReviews` は実行しない） |
| 評価データ | `aggregated_rating`（+ `agg_count`）を提示 | **提示しない**（存在しない） |
| セクション 2 | ✨ゲームの特徴（レビュー根拠） | **🔥なぜ注目されているか**（公式発表・開発者コメント・シリーズ文脈が根拠） |
| セクション 3 | 🎨開発ストーリー | 🎨開発ストーリー（同じ） |
| セクション 4 | 👥こんな人におすすめ | 👥こんな人におすすめ（同じ） |
| セクション 5 | 📅発売情報（発売済み・価格・プラットフォーム） | 📅発売情報（**発売日と対応プラットフォームを明示**。`date_format=0` 保証済み） |
| セクション 6 | 🎯Creator's Eye「どこが**評価されている**のか」 | 🎯Creator's Eye「どこに**挑戦している**のか」 |
| judge | 現状維持 | user メッセージに 1 行追記（system は共通。→ 11.3.5） |
| validator | 現状維持 | **評価断定を検出したら high 警告**（→ 11.3.4） |

**セクション数は減らさない**。6 セクションすべてについて材料の存在を実測で確認したため（→ 11.3.3）。また 800〜1200 文字の指定（`bedrock-client.ts:180`）を満たすには 6 セクションが必要。

新見出し 🔥 の追加コストはゼロ。Astro 側は `.generated-content :global(h2)` の汎用スタイルのみで絵文字ごとの結合はない（`src/pages/issue/[issueNumber]/article/[slug].astro:358`）。同ファイル 182-264 行の絵文字付き見出しは `articleContent` が空のときだけのフォールバックテンプレートで、生成記事には無関係（実読で確認）。

#### 11.3.2 スコープ: インディー枠は未発売タイトルを扱わない（★決定 2026-08-01）

> ✅ **決定: インディー枠は発売済みタイトルのみを扱う。未発売作は新作紹介枠でのみ扱う。**
> 決定日: 2026-08-01 / **ユーザー判断**

この決定は、当初 `newRelease` のみを想定していた §11.3 の設計案のスコープを、**実測で判明した事実を受けて見直した**結果である。

**発見: 過去 17 号で発生した未発売記事は 2 件で、どちらも `newRelease` ではなく `indie` だった。**

`src/content/issues/*.md` 全 17 号を `releaseDate > publishDate` で走査した実測:

| 号 | カテゴリ | タイトル | 実害 |
|---|---|---|---|
| vol.3 | **indie** | 『Forza Horizon 6』（rel 2026-05-19 / pub 2026-04-17） | 未発売なのに `## 💬 プレイヤーの声` が立ち「先行プレイしたユーザーからは…**高く評価されています**」「**好評です**」＋鉤括弧付き引用 2 つ。summary にも「高く評価されている」 |
| vol.9 | **indie** | BrokenLore: FOLLOW（rel 2026-06-01 / pub 2026-05-30） | 評価断定語なし |

`newRelease` の未発売記事は 17 号中 **0 件**だった。つまり `newReleaseSystem` だけを分岐させても、**実際に起きた事故は 1 件も塞げない**。

インディー枠が未発売作を選べてしまう原因（実読で確認）:

- `fetch-data.ts:964-972` の `indieRanked` に**発売日の下限・上限フィルタが存在しない**
- `fetch-web-search.ts:162-169` の `case 'indie'` は `searchReviews` + `searchDeveloperInfo` + `searchSteamReviews` を**発売状態に関係なく 3 本すべて実行する**
- `indieSystem:205-207` の `## 💬 プレイヤーの声` は「Steam レビューでの評判」を書くセクションで、**未発売作には原理的に存在し得ない**。「情報がない場合はこのセクションを省略してください」と指示されているが vol.3 では省略されなかった

**採った対策は「indie 側にも発売状態分岐を入れる」ではなく「indie 枠から未発売作を除外する」。** 理由（ユーザー判断）: インディー記事の編集意図は「Steam / YouTube で話題になっている作品の魅力とプレイヤーの声を伝える」ことであり、プレイヤーの声が存在しない未発売作はそもそも枠の趣旨に合わない。分岐で対処するより枠の定義を明確にするほうが構造が単純になる。

**実装タスク**: `fetch-data.ts:964` の `indieRanked` に `releaseDate <= JST当日0時` のフィルタを追加する（境界は確定事項 #6 と同じ JST 当日 0 時。当日発売は未発売扱い = indie 枠から除外）。

#### 11.3.3 実測: 未発売候補への Tavily 検索の実効性（2026-08-01）

測定スクリプト: `.claude-scratch/measure-n5-search.ts` / `measure-n5-query-variants.ts`
出力: `.claude-scratch/out-n5-search.txt` / `out-n5-query-variants.txt`

対象は確定フロー（§11.1）どおりの未発売候補 = 90 日窓 × `hypes>20` × `date_format=0` × cover × developer 判明 × エディション除去（**30 件**）を発売日昇順で上位 5 件。実運用で実際に選ばれる候補そのもの。

**(1) 現行 `searchReviews` は「空振り」ではなく「汚染」だった**

§11.3 冒頭の表では「有害（存在しないレビューを探す）」と記述していたが、実測はより具体的に悪い。**5 件すべてで score 0.79〜0.91 の結果が返っている**。内訳は 3 種類:

| 返ってきたもの | 実例 | 危険性 |
|---|---|---|
| **中身が空のレビュー集計ページ** | `famitsu.com/game/title/69692/reviews`（Big Walk, score 0.835）。本文は「レビューの点数は公式・ユーザーレビューともに、1人あたり10点満点の全合計から平均値を求め表示しています」という**計算方式の説明のみ**。4Gamer 読者レビュー index も同様（Duskfade, 0.637） | **最悪**。「レビュー」「点数」「評価」の語だけが LLM に渡り、裏付けはゼロ |
| **別作品（前作）のレビュー** | The Sinking City 2 の 1 位ヒットが**1 作目**『The Sinking City Remastered』のレビュー（0.849）、3 位も 1 作目についての Reddit（0.436） | **最悪**。前作の評価を新作の評価として書ける |
| 先行プレイ・試遊レポート | AUTOMATON 先行プレイ感想（Beast of Reincarnation, 0.834）、PS.Blog 試遊レビュー（0.770）、電撃オンライン先行レビュー（Marvel Tokon, 0.808） | 有用。ただし「レビュー情報」枠で渡ると発売後レビューと区別されない |

**→ 問題の本質は「材料が無いのに書けと指示している」ことに加えて、「レビューらしき語が並んだ無内容テキストと前作の評価が渡されている」ことである。** vol.3 の「高く評価されています」はこの構造の産物と考えられる。

**(2) `searchDeveloperInfo` は未発売でも 5/5 で機能する**

GamesIndustry.biz インタビュー（Big Walk, 0.746）、4Gamer インタビュー（Marvel Tokon, 0.824）、prtimes プレスリリース（Beast of Reincarnation, 0.710）、gamereactor インタビュー（Duskfade, 0.823）、Frogwares Developer Deep Dive（The Sinking City 2, 0.780）。**§11.3 冒頭の「妥当」判断は実測で裏付けられた。**

**(3) 新規クエリは OR 演算子を使うと 2/5 で完全に失敗する — OR なしにすれば救済できる**

設計案の想定に近い `"{title}" ゲーム 発表 公開 トレーラー OR ゲームプレイ OR 新情報 発売日`:

| タイトル | 結果 |
|---|---|
| Beast of Reincarnation | 0.872 GAME Watch 先行プレイ / 0.855 prtimes 商品概要 ✅ |
| Marvel Tokon | 0.847 game8 / 0.801 公式オープンベータトレーラー ✅ |
| The Sinking City 2 | 0.855 ファミ通ゲームプレイ映像 / 0.849 Release Date Trailer ✅ |
| **Big Walk** | **0.097 映画『Big』(Rotten Tomatoes) / 0.040 IMDb / 0.036 Amazon DVD** ❌ |
| **Duskfade** | **0.173 PS5 新作一覧 / 0.169 State of Play まとめ / 0.148 Yahoo 検索ページ** ❌ |

OR を落として `"{title}" ゲーム 発売日 最新情報` にすると**両方救済された**:

- Big Walk: 0.889 ファミ通「8月4日配信決定」/ 0.862 公式 Release Date Announcement / 0.856 Wikipedia
- Duskfade: 0.911 game8 / 0.894 Game*Spark「8月13日リリース決定」/ 0.824 gamebiz

開発元名を足す形 `"{title}" "{dev}" ゲーム 発表 トレーラー 発売日` も有効（Big Walk: 0.891 doope! / 0.848 IGN トレーラー / 0.826 Games Press プレスリリース）。

**→ 採用するクエリは OR なしの `"{title}" ゲーム 発売日 最新情報`。** Tavily のクエリ数は reviews −1 / 新規 +1 で ±0（コスト増なし）。

**副産物（未検証の仮説）**: 成功 score の最低 0.763 と失敗 score の最高 0.173 の間が大きく開いており、**関連度スコアによる機械的な足切り（例 0.4 未満は捨てる）が引ける可能性がある**。ただし 5 件の観測のみであり確証ではない。

**(4) 6 セクションすべてに材料が存在する**

| セクション | 未発売 5 件での材料 |
|---|---|
| 🔥 なぜ注目されているか | **5/5**（OR なしクエリ） |
| 🎨 開発ストーリー | **5/5**（`searchDeveloperInfo`） |
| 📅 発売情報 | IGDB `date_format=0` で確定日保証 |
| 👥 こんな人におすすめ | ジャンル・概要から導出 |
| 🎯 Creator's Eye（挑戦） | 発表情報が根拠になる |

**材料が存在しないセクションは 1 つも無かった** → セクション数を減らす必要はない。

#### 11.3.4 評価断定の検出ルール（★決定 2026-08-01）

> ✅ **決定: 新規 `validateUpcomingEvaluationClaims` を追加する。severity は high。**

**現状の欠陥（実読で確認）**: 既存の `validateReleasedTitleExpression`（`validate-article.ts:784-813`）は**片側だけのチェック**である。

```ts
if (getReleaseStatus(releaseDate, publishDate) !== '発売済み') return warnings;  // :796
```

発売済み記事のタイトルに「発売予定」等が混じるケースは high で検出するのに、**未発売記事が「好評」「高く評価されている」と書くケースの対称チェックが存在しない**。vol.3 はそのまま公開された。

設計:

- 発火条件: `getReleaseStatus(releaseDate, publishDate) === '発売予定'` かつ `category === 'newRelease'`（11.3.2 により indie 枠に未発売作は来ないが、防御的に `indie` も対象にしてよい）
- **検査対象は本文 + summary の両方**（vol.3 は summary にも「高く評価されている」が入っていた）
- 語彙候補: `評価が高|高く評価|高評価|好評|絶賛|支持を得`
- ⚠️ **「発売前の先行プレイで好評」は正当な文脈**であり、これを潰さない除外設計が必要。誤検知の境界ケースを Red から書くこと
- `buildFixInstruction`（`:865-868`）は未知 type を汎用文にフォールバックするため、専用の修正指示文を 1 本足す

**severity を high にする理由**: low だと `VALIDATION_AUTO_REGENERATE` の対象にならない（`generate-articles.ts:1355` は high のみ抽出）。ただし自動再生成自体は 11.3.6 のとおり保留であり、当面は「レポートに high として記録される」効果にとどまる。

#### 11.3.5 judge の分岐（★決定 2026-08-01）

> ✅ **決定: system プロンプトは共通のまま、user メッセージに 1 行追記する最小分岐にする。**

**judge 単独では足りない理由（実読で確認）**: `judgeSystemPrompt:55-58` が判定対象外を明示している。

```
## 判定対象としない主張
- 主観的表現・感想・期待感（「美しい」「楽しめる」など）
```

vol.3 の「高く評価されています」はまさにこの分類に入りうる。**judge に任せきりにはできない** → 11.3.4 の正規表現バリデータが必要な理由。

実装: `buildJudgeUserMessage(article)` に `publishDate` を渡し、`getReleaseStatus === '発売予定'` のときのみ以下を追記する。

> この記事は発売前のタイトルを扱っている。「評価が高い」「好評」「絶賛」等の受容に関する記述は、検索結果に**発売前の先行プレイ評として明示されている**場合を除き `contradicted` または `unverifiable` と判定すること。

**system ごと分岐させない理由**: system プロンプト 2 本の同期メンテナンスが必要になり、共通ルール（内部知識禁止・同定情報禁止・セキュリティ注意）の変更漏れリスクが生じる。追記 1 行で同じ効果が得られる。

なお judge のスキップ条件（`webSearchSources` が空 → `judge-article.ts:319`）は、`searchDeveloperInfo` が未発売 5/5 でヒットしている以上**未発売でも発火しないと考えられる**（実測は 5 件のみ）。

#### 11.3.6 `VALIDATION_AUTO_REGENERATE` — ⏸ 保留（2026-08-01）

> ⏸ **保留。「high 判定は記事を公開してはいけないほどのものなのか」を先に検討する必要がある。**
> 保留判断日: 2026-08-01 / **ユーザー判断**

当初は「未発売記事 × 該当 high に限って ON」を推奨していたが、**その前提として「検証結果が high にならないよう記事作成時点で工夫できているか」を確認したところ、前提が成立していなかった**（→ 11.3.7）。high 警告の重大性そのものの再検討が先であるため保留する。

保留中の当面の挙動: `VALIDATION_AUTO_REGENERATE` はデフォルト OFF のまま。11.3.4 の警告はレポートに記録されるが記事は修正されずに公開される。

再開時に判断すべき選択肢と、そのときに参照すべき材料:

| 案 | 内容 | コスト |
|---|---|---|
| A | 未発売 × 該当 high に限って ON | 未発売枠が使われた週のみ +1 本 |
| B | 全体を ON | 毎週 +4〜6 本（実データ: high=0 の号は 4/28 のみ）≈ 生成コスト約 2 倍 |
| C | OFF のまま | 0。ただし 11.3.4 の投資が回収できない |

実装上の注意（A を採る場合）:

- 判定条件をハードコードせず env で分離する。`VALIDATION_AUTO_REGENERATE_UPCOMING` を新設し、既存の `VALIDATION_AUTO_REGENERATE`（全記事対象）はそのまま残す
- **再生成 1 回のコストは本文の作り直しだけではない**。`generate-articles.ts:1236` の `regenerate` は `cachedSearch` を渡していないため、`generateNewReleaseArticle:308` の条件が真になり **Tavily 検索と公式ページ extract がやり直される**。未発売記事の再生成は「書き方の問題であって材料の問題ではない」ため、`cachedSearch` を渡す改善を同時に入れるべき
- fail 閾値との相互作用: `writeAndCheckReport` は high > 5（= 6 件以上）で fail（`validate-article.ts:1023`）。既存レポート 28 件の high 分布は `0,0,0,0,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,5,5,6,8,8,8,9,9` で、**ちょうど 5（あと 1 件で fail）が 2 件ある**。11.3.4 で type を追加すると、C ではこの 2 件が fail に転落する余地がある

#### 11.3.7 前提の検証: 「生成時点で high を出さない工夫」は実装済みだが効いていない

**ユーザーの問い**: 「まずは検証結果が high にならないように記事作成時点で工夫することが先決だと考えるが、それは出来ている前提か？」
**回答: 前提にできない。工夫は広範に実装済みだが、実測では効いていない。**

`bedrock-client.ts` の各カテゴリプロンプトには、high 警告の各 type に**1 対 1 で対応する禁止ルールが既に存在する**（実読で確認）:

| high の type | 対応する既存プロンプトルール |
|---|---|
| `platform-mismatch` | `buildUserMessage:427`「※対応機種・発売日はこのゲーム情報欄の表記を使用すること。Web 検索結果や公式ページの表記（例: "Steam"、"PC Game Pass"）で置き換えてはならない」 |
| `numeric-*` | `QUANTITATIVE_TO_QUALITATIVE_RULE`（`:113`）「出典が必要な定量値は提供データに明示的に記載されていない限り**絶対に**書かない」＋各プロンプトの禁止リスト |
| `body-title-mismatch` | `newReleaseSystem:177`「記事本文（特に導入部）で、紹介するゲームの正式タイトルを最低 1 回、提供データのとおり正確に記載すること」 |
| `title-mismatch` | 同 `:176`「提供された英語タイトルを記事内で勝手に短縮・翻訳・改変しないこと」 |

**つまり「工夫が無い」のではなく「工夫があるのに守られていない」。**

レポート 28 件（`data/validation*/validation-report-*.json`）の high 警告 96 件の内訳:

| type | 件数 | 出現レポート数 |
|---|---|---|
| `platform-mismatch` | 31 | 15 |
| `numeric-vehicle-count` | 19 | 10 |
| `numeric-large-count` | 15 | 10 |
| `body-title-mismatch` | 11 | 9 |
| `title-vs-igdb-slug` | 7 | 5 |
| `numeric-review-count` | 6 | 5 |
| `title-mismatch` | 4 | 2 |
| `numeric-user-count` | 2 | 1 |
| `person-quote` | 1 | 1 |

**high=0 の号は 4/28 のみ。** プロンプトで明示的に禁止済み（しかも「例: "Steam"」と例示済み）の `platform-mismatch` が最多で、`PC (Steam)` と書く違反が繰り返し出ている（vol.6 / vol.11 ×2 ほか）。

**ただし 96 件の性質は一様ではない。** `sourcedFrom`（検索結果に数値の根拠が見つかったか）で切ると:

| type | high | うち `sourcedFrom` あり |
|---|---|---|
| `numeric-review-count` | 6 | **6（100%）** |
| `numeric-user-count` | 2 | **2（100%）** |
| `numeric-large-count` | 15 | **9（60%）** |
| `platform-mismatch` | 31 | 0 |
| `numeric-vehicle-count` | 19 | 0 |
| `body-title-mismatch` | 11 | 0 |

`sourcedFrom` があるものは「捏造ではなく、検索結果に書いてあった数値を転記した」ケースである。**これは記事側の欠陥ではなく、バリデータが「提供データ = ゲーム情報欄」しか正解と認めていないことによる false positive の可能性がある**（生成時プロンプトは検索結果の使用を許可しているのに、バリデータは検索結果由来の数値を high にしている）。少なくとも 8〜17 件はこの性質。

一方 `platform-mismatch` 31 件・`body-title-mismatch` 11 件は `sourcedFrom` が 0 で、**プロンプト遵守の失敗そのもの**である。

**→ 残論点（11.4 に登録）**: high 96 件を (a) プロンプト遵守失敗（`platform-mismatch` / `body-title-mismatch` = 42 件）(b) バリデータの false positive 疑い（`sourcedFrom` あり = 最大 17 件）(c) 真の捏造 に分類し、high の重大性そのものを再定義する。**この論点もユーザー判断により現時点では保留**。

### 11.4 論点の決着状況と残論点

| 論点 | 状態 |
|---|---|
| I-1（インディー枠の `developed` 閾値） | ✅ **決着**（2026-07-30。生件数 + `> 20`）→ 11.4.1〜11.4.4 |
| N-6（発売済み側のソート軸） | ✅ **決着**（2026-08-01。4 軸・絶対尺度・重み付き最大値）→ 11.4.5〜11.4.11。パラメータ再調整は Issue #210 |
| N-5（未発売記事の情報ソース・構成） | ✅ **決着**（2026-08-01。indie 枠は発売済み限定・6 セクション維持・OR なしクエリ・評価断定バリデータ high・judge は user 1 行追記）→ 11.3.1〜11.3.5 |
| `VALIDATION_AUTO_REGENERATE` の適用範囲 | ⏸ **保留**（2026-08-01・ユーザー判断）→ 11.3.6 |
| high 警告の重大性の再定義（96 件の分類） | ⏸ **保留**（2026-08-01・ユーザー判断）→ 11.3.7。「high は記事を公開してはいけないほどのものか」を先に検討する |
| インディー枠のソート軸 | ⏳ **未決**（`hypes` 禁止により現行 `sort hypes desc` は変更必須。N-6 のスコア式を流用できるか要検討）。**PR-B の実装時に決める下位判断**として §9 に登録済み |
| §8.1（Steam 経路の DLC 除外） | ⏳ **未決**（独立して修正可能。DLC を除外するか `fullgame` で親に解決するかの下位判断あり）。**PR-A の実装時に決める下位判断**として §9 に登録済み |

2026-08-06 時点で、**§7 の意思決定論点（A〜J）はすべて決着した**（最後に決着したのは論点H と論点J-1）。残っているのは上記 ⏸保留 2 件と、実装時に決める下位判断（上記 ⏳ 2 件ほか §9 の各 PR に記載）のみである。

#### 論点 I-1: インディー枠の `developed` 閾値 — ✅ 決着（2026-07-30）

> ✅ **決定: (a) 生件数を使う。閾値は `developed > 20` を「大手」とし、インディー枠から除外する。静的リストとの OR 併用は維持する。**
> 決定日: 2026-07-30 / 根拠: 同日の実測（`.claude-scratch/out-main-converted.txt`, `out-edition-pollution.txt`、プール 85 社）
> **当初の推奨 (c) ハイブリッドは実測により棄却した。** 経緯は下記 11.4.1。

##### 11.4.1 決定の経緯 — Main 換算を棄却した 3 つの実測

2026-07-29 時点の記述は「`developed` は DLC・Bundle・Pack を含むため生件数では小規模スタジオが大手側に落ちる」ことを根拠に (c) ハイブリッド（境界帯のみ Main 換算）を推奨していた。2026-07-30 にプール全 85 社を Main 換算して再測定した結果、**Main 換算を採る根拠が 3 点で否定された。**

**(1) Main 換算しても正確にならない — `game_type = 0` にエディション違いが混入している**

§10.4 で「`game_type = 0` はエディション違いを完全に除外しない」と記録した既知の限界が、そのまま Main 換算値を汚染していた。実測:

```
企業名               raw  main  main-ed   除外されたエディション行
Mad Head Games        15    15      7    Rite of Passage: Child of the Forest - Collector's Edition ほか計8本
Infinity Ward         71    23     11    CoD: MW3 - Hardened / Ghosts - Prestige / MW - Operator /
                                          MWII - Vault / CoD4 - Limited Collector's Edition ほか計12本
Bitmap Bureau         13    10      7    Final Vendetta: Collector's / Super Limited / Day One Edition
Playground Games      79    11      7    Forza Horizon 4/6: Deluxe / 6: Premium / Fable: Premium Edition
Asobo Studio          47    28     21    MSFS: Premium Deluxe / Deluxe / 40th Anniversary ほか計7本
Cold Symmetry          9     5      3    Mortal Shell: Enhanced GOTY / Digital Deluxe Edition
Remedy Entertainment  39    14     11    Alan Wake: Limited Collector's ほか計3本
IO Interactive        98    22     17    Hitman: GOTY / Absolution: Elite / 2: Silver ほか計5本
Wargaming.net         34    19     15    World of Tanks: Roll Out Collector's ほか計4本
```

（`main-ed` = Main のうちタイトルにエディション語を含む行を除いた数）

**`Mad Head Games` は「Main 15 本」ではなく実質 7 本である。** 2026-07-29 の記述はこの企業を「生件数と Main 換算が一致する = 信頼できる例」として挙げていたが、実際はプール内で最も汚染が激しい企業だった。**Main 換算は「正確な値」ではなく、別の不正確な値である。**

閾値判定への影響（非静的リスト企業のうち `main` と `main-ed` で判定が変わるもの）:

| 閾値 | 判定が変わる企業 |
|---|---|
| `> 8` | Mad Head Games 15→7, Bitmap Bureau 10→7 |
| `> 10` | Mad Head Games 15→7 |
| `> 12` | Mad Head Games 15→7, Undercoders 13→12 |
| `> 15` | Wargaming.net 19→15 |
| `> 20` | **なし** |

**採用した閾値 `> 20` では、エディション汚染は判定に影響しない**（Main 換算しても結論が変わらない）。

**(2) Main 換算は誤判定の向きが悪い — DLC 主体の大手をインディー側に落とす**

```
Milestone S.r.l.    raw= 66 → Main  2   内訳: DLC:48 Pack:15 Main:2 Port:1
                                        （MotoGP / RIDE シリーズのレースゲーム大手）
Playground Games    raw= 79 → Main 11   内訳: DLC:42 Main:11 Pack:11 Expansion:7 ...
Infinity Ward       raw= 71 → Main 23   内訳: Main:23 Bundle:18 DLC:12 Season:11 ...
Mojang Studios      raw= 86 → Main 14   内訳: Update:37 Main:14 Port:14 Pack:10 ...
IO Interactive      raw= 98 → Main 22   内訳: DLC:30 Main:22 Bundle:20 Pack:9 ...
```

**`Milestone S.r.l.` は Main 換算 2 本となり、どの閾値でもインディー判定される。** 生件数の誤判定（小規模スタジオを大手側に落とす）は「インディー枠に載らない」だけで済むが、**Main 換算の誤判定は「大手がインディー枠に載る」＝ vol.13 / vol.14 / vol.15 で実際に起きた事故そのものである**。この枠の規模判定は「大手を排除するゲート」であり、誤判定の許容度は非対称である。

**(3) 数え方の選択が効く範囲は 6 社 / 85 社（7%）**

閾値 `> 20` において「生件数なら大手 / Main 換算ならインディー」となる企業は 4 社（Frogwares 44→20, Wargaming.net 34→19, Frozenbyte 27→14, Milestone 66→2）。うち Milestone は上記 (2) のとおり Main 換算のほうが誤りである。残りの 85 社は数え方を変えても判定が同じ。

→ **追加 API リクエスト（(c) で週 10〜16 回、(b) で週 85 回超）と、エディション除去用の正規表現ロジックを規模判定の中核に持ち込むコストに対し、改善効果が小さい。** なお §8.3 でエディション除去の専用ロジックは「優先度が低い」と結論している。

##### 11.4.2 採用した閾値 `> 20` の根拠

静的リスト外の企業を生件数順に並べた実測（2026-07-30、プール 85 社）:

```
241  Arc System Works        ギルティギア / BlazBlue
136  Intelligent Systems     ファイアーエムブレム（任天堂内製級）
127  Traveller's Tales       LEGO シリーズ（親: TT Games）
 66  Milestone S.r.l.        MotoGP / RIDE
 44  Frogwares               シャーロック・ホームズ シリーズ
 39  Supermassive Games      Until Dawn / The Dark Pictures（親: Nordisk Film）
 34  Wargaming.net           World of Tanks
 27  Frozenbyte              Trine シリーズ
──────────────────────────────── ★閾値 > 20 のライン
 20  One More Level          Ghostrunner
 19  Illfonic                Friday the 13th / Predator: Hunting Grounds
 15  Mad Head Games          Scars Above
 14  Undercoders             Koa and the Five Pirates of Mara
 14  Evil Empire             Dead Cells の後継開発
 13  KING Art                Iron Harvest
 13  Bitmap Bureau           Xeno Crisis / Final Vendetta
 12  Yacht Club Games        Shovel Knight
 11  SUKEBAN                 VA-11 HALL-A
  9  Kwalee / Serafini Productions / Cold Symmetry
  7  PocketPair              Palworld
  6  Tiny Roar / ZA/UM       Disco Elysium
  5  LEMORION / Chuhai Labs / Mandragora
1-4  その他 30 社超
```

1. **`> 20` は Yacht Club Games(12) / SUKEBAN(11) / Undercoders(14) をインディー側に残す。** Shovel Knight・VA-11 HALL-A は「小さなチームがどうやってこれを作ったのか」を語る枠（§5.1 の読者への約束）に最も合う対象である。`> 10` はこれらを全部大手側に落とす
2. **20 と 27 の間に自然な切れ目がある。** Frozenbyte(27) 以上は Trine シリーズ・World of Tanks・Until Dawn 級で「話題のインディーゲーム」としては規模が大きい。20 以下の最大は One More Level（Ghostrunner）・Illfonic であり、インディーと呼んで違和感がない範囲
3. **エディション汚染の影響を受けない**（上記 (1) の表: `> 20` では判定が変わる企業が 0）
4. **取りこぼしは静的リストが補う。** 閾値を下げてインディー側を犠牲にする必要はない

**残る判断の余地**: `> 20` は Illfonic(19) と One More Level(20) をインディー側に残す。Illfonic は Predator / Friday the 13th のライセンス作を手がける受託寄りのスタジオであり、ここは判断が分かれ得る（現時点では許容する）。

##### 11.4.3 静的リストとの併用（変更なし）

**閾値単独では拾えない大手専属スタジオが実在するため、静的リストとの OR 併用は必須である**（§6.3 / §4.1.6）。実測:

```
Unknown Worlds Entertainment  developed=9  → 親: Krafton      （静的リストに登録済み）
The Coalition                 developed=8  → 親: Microsoft    （静的リストに登録済み）
```

逆に、**閾値 `> 20` があれば静的リスト外の大量出力企業は自動的に救済される**。今回のプールで該当したのは Arc System Works(241) / Intelligent Systems(136) / Traveller's Tales(127) / Milestone(66) / Frogwares(44) / Supermassive Games(39) / Wargaming.net(34) / Frozenbyte(27) の 8 社で、**いずれも静的リストに未登録だが閾値で大手判定される**。

→ 静的リストへの明示的な追加は必須ではないが、**Arc System Works / Intelligent Systems / Traveller's Tales は「インディー」と呼ぶには無理がある規模なので、リストにも追加して二重に塞ぐ選択肢がある**（未決・優先度低）。

##### 11.4.4 実装時の注意

- **`developed` 件数は IGDB のデータ更新で漂動する**（§4.1 の注記。実測: Nintendo は 07-26 時点 676 → 07-29 時点 675、Remedy は 07-29 時点 36 → 07-30 時点 39）。閾値 `> 20` は 1 件単位の精度に依存しない位置にあるが、**閾値ちょうど（20 / 21）の境界値テストを含めること**
- 閾値は環境変数化する（例 `INDIE_MAX_DEVELOPED_COUNT`、デフォルト 20）。本番コードにテスト用分岐を入れない（~/.claude/CLAUDE.md の規定）
- `companies` エンドポイントへの追加リクエストが必要（`developed` は `games` から辿れない）。**候補ごとに毎回引くのではなく、候補確定後の対象のみに引く**（§6.3）
- `developer` が不明な候補（実測 11 件中 1 件: `Pokémon Infinite Fusion`）は規模判定が不能。扱いは未決（11.4 その他の残課題 #1）
- **`published` は使わない**（§4.1.5 で規模指標として使用不可を確定）
- `companies.parent` の併用は未決（保有率 15%、多段構造あり。§4.1.6）

#### 論点 N-6【新規】: 発売済み側のソート軸 — ✅ 決着（2026-08-01）

> ✅ **決定: 4 軸（批評 / ユーザー票数 / Steam / 国内販売）を絶対尺度で 0〜100 に写し、重み付き最大値をスコアとする。**
> 決定日: 2026-08-01 / 根拠: 同日の実測（`out-tiebreak.txt`, `out-weighted.txt`, `out-weighted2.txt`, `out-rankmap.txt`）
> **当初推奨していた (b) 複合スコアの percentile 版は実測により棄却した。** 経緯は 11.4.5〜11.4.9。
> パラメータの運用後再調整は **Issue #210** で追跡する。

##### 11.4.5 採用したスコア式

```
score(g) = max over axes a of ( w_a × f_a(g) )     ※保有しない軸は棄権（0 点ではない）
```

| 軸 | 保有条件 | 写像 `f` | 満点の意味 | 初期重み |
|---|---|---|---|---|
| 批評 | `aggregated_rating_count >= 2` | `aggregated_rating × min(1, n/4)` | 4 媒体以上のレビュー平均 100 点 | 1.0 |
| ユーザー票数 | `rating_count >= 15` | `100 × log10(rc)/log10(500)` | IGDB 500 票 | 1.0 |
| Steam | Top Sellers 掲載 | `100 × (1 - (順位-1)/枠数)` | Top Sellers 1 位 | 1.0 |
| 国内販売 | Amazon ランキング掲載 | `100 × (1 - (順位-1)/50)` | Amazon ゲームソフト 1 位 | 1.0 |

**国内販売軸は選定内部でのみ使用し、順位を記事に出力しない**（**ユーザー判断**。Amazon 系ライセンスの保存期間制限とファミ通 `/copyright` の蓄積禁止条項を回避するため。11.4.9 参照）。

実測での並び（60 日窓・候補 16 件・w=1.0、`out-rankmap.txt` ②）:

```
 1. 100.0  Splatoon Raiders                  j=100 (Amazon 1位)
 2.  96.0  Rhythm Heaven Groove              j= 96 (Amazon 3位)
 3.  89.3  Palworld                          u= 89 (rc=257)
 4.  88.9  Mistfall Hunter                   s= 89 (Steam 2位)
 5.  83.5  Denshattack!                      c= 84 (agg=84 n=4)
```

**同点は発生しない**（重み 81 通りで 1-2 位同点 0/81）。したがって tie-break 規則は不要になった（実装上は安定ソートを保険として残す）。

##### 11.4.6 percentile（相対）を棄却した理由 — 重み付けでは直らない

当初案は各軸を候補プール内の percentile に写して最大値を採る形だった。**軸内 1 位に必ず 100 を返すため、同点 1 位が軸の数だけ発生する。**

実測（`out-tiebreak.txt`）: score=100 の 4 件が**それぞれ別の単一軸**で 100 に達していた。

| 候補 | 批評 | ユーザー票数 | Steam | 国内販売 |
|---|---|---|---|---|
| Gurei | **100** | -- | -- | -- |
| Palworld | -- | **100** | -- | -- |
| Mistfall Hunter | -- | -- | **100** | -- |
| Splatoon Raiders | -- | -- | -- | **100** |

**ユーザーの問い**: 「各軸で 1 位になったもの全て同じスコアにするのではなく、それぞれ重み付けをすることで適正な比較を行うことはできないか？」
**回答: 重み付けの方向は正しいが、percentile のままでは解消しない。絶対尺度への置換が必要だった。**

重みグリッド `w∈{0.6,0.8,1.0}` 81 通りでの比較（`out-weighted.txt` ②）:

| 設計 | 採用ペアの種類 | 1-2 位が同点になった重み |
|---|---|---|
| percentile-max + 重み | 13 | **45/81** |
| 絶対尺度 + 重み | 6 | **0/81** |

percentile を掛け算しても `w×100` が最大値のまま並ぶだけで、同点が w の比だけずれる。

percentile 固有の欠陥は他に 2 点（いずれも重み付けでは直らない）:

1. **保有候補が 1 件の軸は分母 0 で強制 100 点になる。** 実測時 Steam は保有 1/16 件。該当した `Mistfall Hunter` は `agg=0(n=0) rc=0` で評価材料が一切ないのに 100 点だった
2. **プール依存のため号をまたぐと同一ゲームの点が変わる。** プールを 60 日→30 日に狭めると `Denshattack!` 批評 83→67、`Echoes of Aincrad` 17→0、`Avatar Legends` 67→33。絶対尺度なら不変

##### 11.4.7 「軸ごとの優先順位で tie-break」を採らなかった理由

ユーザーは一度この方式を採用する判断をしたが、**「優先順位の妥当性は検証する必要がある」**との条件付きだった。検証した結果、この方式は成立しないことが分かった。

4 軸の優先順位 24 通りすべてを実測（`out-tiebreak.txt` ②）:

- **12 種類の採用ペアが出て、すべて 2/24 で均等**。頑健性がゼロ
- 結果は**最優先 2 軸だけで完全に決まる**。第 1 優先軸の保有者が必ず 1 位を取る
- 例: `批評>国内販売>…` → `Gurei + Splatoon Raiders` / `国内販売>批評>…` → `Splatoon Raiders + Gurei` / `批評>ユーザー票数>…` → `Gurei + Palworld`

つまり優先順位は tie-break ではなく**出力を 100% 決定する規則**であり、そう決めた時点で percentile-max を採る意味が失われる。

対照として測った他の tie-break 3 方式（第 2 位スコア / 保有軸数 / スコア合計）は**すべて機能しなかった**。60 日窓の全候補が軸 1 本のため比較子が差を作れず、配列順で決まる（3 方式とも同一結果）。

##### 11.4.8 順位系軸の写像に線形を選んだ理由

「線形 `1-(r-1)/N` だと 3 位=96 点となり、批評 `agg=84(n=4)`=84 点を上回るのは寛容すぎるのではないか」という懸念を検証した（`out-rankmap.txt`）。

カーブの比較（N=50）:

| 写像 | 1 位 | 2 位 | 3 位 | 5 位 | 10 位 | 32 位 |
|---|---|---|---|---|---|---|
| **線形** | 100 | 98 | 96 | 92 | 82 | 38 |
| 対数 | 100 | 82 | 72 | 59 | 41 | 12 |
| 逆数 | 100 | 50 | 33 | 20 | 10 | 3 |
| 平方根 | 100 | 86 | 80 | 72 | 58 | 21 |

重みグリッド `w∈{0.5,0.75,1.0}` 81 通りでの頑健性:

| 写像 | 最頻ペア占有率 | ペア種類 |
|---|---|---|
| **線形** | **36/81** | 9 |
| 逆数 | 27/81 | 9 |
| 平方根 | 16/81 | 11 |
| 対数 | 14/81 | 12 |

**対数は最頻が 14/81 しかなく、3 ペアが 14/14/14 で三つ巴になる。** 重みの微差で結果が入れ替わり、11.4.7 の優先順位方式に近い脆さを持つ。線形が最も安定していた。

**懸念自体も実データ上は妥当でなかった。** Amazon ゲームソフトランキング（発売済み 23 件）の上位は実際の話題作で占められ、10 位以下は IGDB 60 日窓にほぼ残らない（該当 4 件のうち 2 件は 32 位 / 36 位のマイナー作）。「3 位に 96 点」は「発売直後の話題作が 3 位にいる」状態であり、過大評価ではないと考えられる。

##### 11.4.9 集約に `max` を選んだ理由 / 実装時の注意

60 日窓では全 16 件が軸 1 本のため `max` / `Σ` / 平均 を区別できない。**180 日窓（候補 90 件）では軸 2 本が 14 件・軸 3 本が 2 件存在した**ので、集約方式の選択は無意味ではない（`out-weighted2.txt` ①）。

180 日窓での比較（`out-rankmap.txt` ④）:

- `Σ`（軸を足す）は**軸を多く持つだけの凡庸なタイトルを押し上げる**。`Tomodachi Life`（c=41 u=58 j=59 — どの軸も凡庸）が 6 位に来る
- `max` では `Resident Evil Requiem`（c=91 u=92）が 2 位で妥当

→ **`max` を採用。**

**実装時の注意**:

- **Amazon ゲームソフトカテゴリに 2 種類のノイズがある**（実測で発見。写像の議論とは独立）。現在は `normalizeTitle` による best-rank 集約で偶然吸収されているが、明示的なフィルタが必要
  - `|オンラインコード版` が同一ゲームの別エントリとして重複（3 位『リズム天国』と 6 位が同一、5 位『トモダチコレクション』と 13 位が同一）
  - ゲームではない商品の混入（15 位 PS ストアチケット 1,100 円、16 位 Nintendo Switch Online 利用券、21 位 PS ストアチケット 3,000 円）
- **Steam 軸の分母は `fetchTopSellers()` の取得件数に依存する**（実測時 9 件）。ハードコードせず実際の取得件数から算出すること
- 各軸の重み・満点基準は環境変数化し、**運用しながら再調整する**（Issue #210）。本番コードにテスト用分岐を入れない
- 国内販売軸のデータ源はファミ通経由の Amazon ランキング。**順位を記事本文・frontmatter に出力しないこと**

##### 11.4.10 決着前の記録（当初の問題提起）

N-4 の測定で判明した問題。`sort aggregated_rating desc` で並べた実際の採用順:

```
agg= 86(n=2) rc=  0  -6d   Gurei [Lobo Sagaz Studio]                            ← 批評 2 社のみ
agg= 83(n=3) rc=  6 -14d   Denshattack! [Undercoders]
agg= 82(n=1) rc= 57 -50d   Meccha Chameleon [LEMORION]                          ← 批評 1 社のみ
agg= 80(n=2) rc=  0  -6d   Avatar Legends: The Fighting Game
agg= 79(n=4) rc=  0 -41d   The Adventures of Elliot [Square Enix CS5]
agg= 78(n=2) rc=  0 -40d   EA Sports UFC 6 [EA Vancouver]
agg= 64(n=3) rc=  0 -29d   Monopoly: Star Wars Heroes vs. Villains
agg=  0(n=0) rc= 32  -5d   Scrap Mechanic [Axolot Games]
agg=  0(n=0) rc=257 -19d   Palworld [PocketPair]                                ← 最も注目されている作品が下位
agg=  0(n=0) rc= 22 -19d   Pokémon Infinite Fusion
agg=  0(n=0) rc= 18 -41d   Backrooms: Escape Together
```

**問題**: 上位が批評媒体 1〜2 社のスコアで占められ、`rating_count=257` の Palworld が下位に沈む。§5.2 素案 A-1 は「企業規模はスコアの一要素に格下げする」と書いているが、**そのスコア式が定義されていない**。

**当時の選択肢**（→ (b) の方向で決着。11.4.5）:

| 案 | 内容 | 評価 |
|---|---|---|
| (a) 信頼度重み付き `aggregated_rating` | `agg_count >= 3` を満たすものを優先し、その中で `aggregated_rating` 降順。満たさないものは後段 | 実装が単純。ただし Palworld（`agg_count=0`）は依然として最後 |
| (b) 複合スコア | `aggregated_rating`（信頼度重み付き）と `rating_count`（対数スケール）と `steamRank` を合成した単一スコア | 「注目されているから紹介する」という編集意図（§5.2）に最も忠実。式の設計と検証が必要 |
| (c) 規模をランキング重みとして復活 | 論点A で必須条件から外した企業規模を、スコアの加点要素として使う | §5.2 の記述に忠実。ただし「大手優遇」が復活するので論点A の趣旨と緊張関係にある |

**当時の暫定見解**: (b) が編集意図に最も合うが、`indieScore`（`fetch-data.ts`）が既に `youtubePopularity + (1000 - steamRank) + igdbRating*10` という素朴な合成をしている前例があるため、その設計品質も併せて見直すべきと考えられる。

**→ 決着**: (b) の方向を採ったが、当初想定していた percentile による正規化は 11.4.6 のとおり棄却し、絶対尺度に置き換えた。また当初の 3 軸（批評 / ユーザー票数 / Steam）では `Splatoon Raiders` が候補に入らないため、**国内販売軸（第 4 軸）を追加した**（経緯は 11.4.11）。

##### 11.4.11 第 4 軸（国内販売）を追加した経緯 — 3 ルートを実測して 1 つだけが残った

**ユーザーの問い**: 「先日発売した『スプラトゥーン レイダース』は注目作品として候補に入るか？　このタイトルは注目度および評価が高く、紹介されるべきゲームだと考えている」

**IGDB 由来の 3 軸だけでは入らない。** `Splatoon Raiders` は `aggregated_rating_count=0` / `rating_count=0` / Steam 非掲載（Switch 2 専用）で、**IGDB 上に評価シグナルが存在しない**。3 ルートを実測し、国内販売軸だけが残った。

**(A) YouTube 注目度軸 — 実装上成立しない**

2 つの障害を実読・実測で確認した:

1. **マージ順序**: `fetch-data.ts` は YouTube（232 行）を IGDB enrich（267 行）より**先**に処理し、264 行の `// パターンBを廃止: 未確認タイトルは追加しない` で未マッチのタイトルを捨てる。`Splatoon Raiders` にはマッチ対象が存在しない
2. **略称の分裂**: 1 つのゲームが 3 つのキーに分かれた — `スプラレイダース` 1,454,596 再生 / `スプラトゥーン レイダース` 1,027,440 / `スプラレイダーズ` 75,302。マッチしたのは中央の 1 つだけ。抽出ノイズにも `マイクラ`(7.7M) / `にじさんじ` / `VCT Pacific 2026` が混入

なお IGDB は `game_localizations`（region=Japan）に日本語名を保持しているので、**将来 YouTube 軸を使う場合はこれを名寄せに使える**（未実装）。

**(B) 高評価タイトルの救済ルート — 効果ゼロ**

「`rating >= T` かつ `rating_count >= floor` なら救済する」案を 8 通り（T ∈ {80,85,88,90} × 信頼度補正 on/off）実測したが、**全パターンで採用 2 件が変わらなかった**。`Splatoon Raiders` は最良でも 4 位。副作用として T=85 では無名の `Thank You For Your Application`（agg=90, n=1）が上位に入り、T=80 では主に無名の 13 件が救済された。

**(C) IGDB 以外の媒体での注目度 — ランキングを機械可読で持つのはファミ通のみ**

**ユーザーの問い**: 「IGDB 以外の媒体（たとえばファミ通など）での注目度を参考にすることも含めて詳細に検討して」

ランキング系エンドポイントを網羅的に叩いた結果（`out-media-rank.txt`, `out-media-rank2.txt`, `out-famitsu-articlerank.txt`）:

| 媒体 | 結果 |
|---|---|
| 4Gamer `/ranking/`, `/ranking/access/` | **404** |
| Game*Spark / GAME Watch / インサイド / 電撃オンライン `/ranking/` | **404** |
| ファミ通 `/ranking/software` | **404** |
| AUTOMATON `/ranking/` | 200 だがトップページとの記事重複 36%、`<ol>` 0 個、「N 位」表記 0 箇所 → **順位が機械可読でない** |
| 電ファミ `/ranking` | 200 だがトップページとの重複 **91%**（『』タイトル・記事 URL とも）→ **実質トップページ** |
| PS Store `ja-jp` | robots 許可・`__NEXT_DATA__` あり。だが「ランキング」「売れ筋」「人気」「ベストセラー」の出現が**すべて 0**、カテゴリリンクは latest/collections/deals/subscriptions/browse の 5 件のみ → **ランキングページが存在しない** |
| Xbox JP `/ja-JP/games/browse` | robots 許可・`window.__PRELOADED_STATE__` あり（472,105 字）。**JSON.parse に失敗し未確認**（`position 389545` で中断。抽出正規表現の境界が原因と考えられる） |
| Nintendo ストア | Akamai bot management により取得不能（前セッション実測） |

**ファミ通が持つ 2 種類のランキング**:

1. `/ranking/amazon` → `amazonRankingData`（50 件）。**これはファミ通自身の指標ではなく Amazon の売れ筋**。集計窓は 1 時間（23:00→00:00）→ **これを国内販売軸として採用した**
2. トップページ `articleRankingData.{current,daily,weekly,monthly,retweet}Article` — 媒体自身のアクセス指標と考えられるが、**各 5 件のみ・順位フィールドなし**。`/ranking/{daily,weekly,monthly,retweet}` は全て 404 で件数を増やせない。内容もアニメ・マンガ・グッズ寄り（`weeklyArticle` の 5 件は フェアリーテイル / 銀河鉄道999 / Apex / どうぶつの森グッズ / ゴエモンサントラ で**新作ゲーム 0 件**）→ **新作の注目度指標として機能しない**
3. `/ranking/article` は 54 件取れるが `publishedAt` 降順率 58%（＝純粋な新着順ではなくアクセス順の可能性がある）で順位フィールドなし

**ファミ通の週間販売本数は記事本文に存在する**（例: 「【ソフト＆ハード週間販売数】『スプラトゥーン レイダース』が47万本を売り上げ首位スタート！」）が、**散文としてのみ**であり、ファミ通 `/copyright`（株式会社 KADOKAWA Game Linkage）が「転載・複写・**蓄積**・転送・引用・改変」を明示的に禁じている。→ 数値を保存する形では使えない。

**Amazon を API で取れるか（ユーザーの問い: 「Amazon の情報を API などで取得することはできないのか？　また、Creators API とは何か？」）**

一次ソースを実読した結果（`out-creators-api.txt`, `out-creators-api2.txt`）:

| 項目 | 確認内容 |
|---|---|
| PA-API 5 | **完全廃止**。全ドキュメント URL が `paapiv5-deprecation` に 302。旧エンドポイント呼び出しは `AccessDeniedException` |
| 後継 | **Creators API**。`https://creatorsapi.amazon/catalog/v1/*`、OAuth 2.0（`scope: creatorsapi::default`）、`x-marketplace` ヘッダ、リクエスト body に `partnerTag` 必須 |
| operation | `GetItems` / `SearchItems` / `GetVariations` / `GetBrowseNodes` の **4 つのみ** |
| 順位の取得 | **可能**。resource `browseNodeInfo.browseNodes.salesRank` および `browseNodeInfo.websiteSalesRank`（後者が「Amazon Best Sellers Rank」に対応）。`GetBrowseNodes` は SalesRank をデフォルトで返す |
| 利用資格 | Amazon アソシエイト登録（無料）＋ Creators API 登録。**API 側の売上実績要件は該当記述を見つけられず（不明）** |

> ⚠️ 前セッションで「SalesRank に関する記述は 9 文書すべてに存在しない」と記録したが**誤りだった**。PA-API 5 の全 URL が単一の deprecation 通知にリダイレクトされるため、その 1 ページしか読めていなかった。`/creatorsapi/docs/en-us/api-reference` 配下のリンクを実際に辿って訂正した。

**それでも用途に合わない理由が 2 つある**:

1. **ランキング上位 N 件を列挙する operation が存在しない。** `salesRank` は「指定した ASIN の順位」を返す resource であり、4 つの operation に「売れ筋 1〜50 位を取る」ものはない（`SearchItems` は最大 10 件）。使うなら「候補タイトル → ASIN 特定 → 順位取得」の 2 段になり、**ランキングを見て候補を発見する使い方ができない**
2. **日本ロケールのライセンスが 24 時間を超える保存を禁じている。** `affiliate.amazon.co.jp/help/operating/paapilicenseagreement` (n) 項: 「乙は、画像で構成されていない他の商品関連コンテンツを、データキャッシュの目的で、**最長24時間保存することができます**が、その場合、乙は、その後直ちに Product Advertising API にリクエスト送信を行い…商品関連コンテンツを直ちに刷新し、再表示しなければなりません」。**期間無制限に保存できるのは ASIN のみ**。(g) 項は Amazon 上で表示されなくなったコンテンツの速やかな削除を要求し、(i) 項は「統合、分析、抽出もしくは再利用する目的で」のアクセスを事前の書面同意なしに禁じている

Game Wire はバックナンバーが恒久的に残る構成なので、**順位を記事に残す形は上記条項と衝突すると考えられる**（法的解釈は確定できない）。ファミ通経由も `/copyright` の蓄積禁止で同じ壁に当たる。

**→ ユーザー判断: 国内販売軸は採用するが、順位を記事に残さず選定内部でのみ使う。**

**確認できていないこと（明示）**:

- Xbox JP のランキングデータの有無（`__PRELOADED_STATE__` の parse 失敗により未確認）
- Amazon ランキングの 1 時間集計窓が週次で安定しているか（1 時点のスナップショットしか測っていない）
- Creators API の登録がトラフィック実績なしで承認されるか

#### その他の残課題

| # | 課題 | 内容 |
|---|---|---|
| 1 | `developer` / `publisher` が不明な候補の扱い | 実測 11 件中 1 件（`Pokémon Infinite Fusion`）。インディー枠の規模判定が不能。除外するか、インディー扱いにするか未決 |
| 2 | **N-3=(a) 採用に伴う履歴スキーマ変更** | 同一タイトルの発売前／発売後の二重掲載を許すには、`HistoryEntry`（`game-history.ts`）に **phase（`upcoming` / `released`）フィールドを追加**し、`getCooldownTitles()` を category + phase で絞る必要がある。既存 **105 件のマイグレーション**が必要（既存エントリはすべて `released` として扱うのが妥当と考えられる） |
| 3 | 号内配分の順序（I-2 起因） | 新作紹介とインディーで候補が 6/11 重複する。どちらを先に確定させるか未決 |
| 4 | `normalizedTitle` への統一 | `fetch-data.ts:971` の号内重複除外を `title` 完全一致から `normalizedTitle` 比較に変更する |
| 5 | 新規に取得経路が必要なフィールド | `aggregated_rating` / `agg_count` は**どのクエリでも取得していない**（§4.1.2）。`developed` / `parent` は `companies` エンドポイントへの追加リクエストが必要。`hypes` は取得済みだが `GameData` にマップされていない |

### 11.5 この議論で使った測定スクリプト

すべて `.claude-scratch/`（gitignore 対象・使い捨て）に配置。再測定が必要な場合はこれらを参照・再実行する。

| スクリプト | 目的 | 出力 |
|---|---|---|
| `measure-decisions.ts` | ④ エディション混入率 / N-2 hypes 分布 / N-1 実存シグナル / ⑤ date_format / N-4 クールダウン供給 / I-1 閾値 / I-2 号内重複 | `out-decisions.txt`（174 行） |
| `measure-threshold.ts` | I-1 境界帯 89 社の洗い出し、静的リストとの突き合わせ、`companies.parent` 在庫 | `out-threshold.txt`（115 行） |
| `measure-existence.ts` | N-1 hypes 帯ごとのシグナル判別力（`websites` に判別力がないことの確認） | `out-existence.txt` |
| `verify-fields.ts` | 7 指標フィールドの実体確認（`rating_count` のドキュメント誤記の確認） | 標準出力 |
| `verify-parent.ts` | `companies.parent` の多段構造、親の規模は `published` で測る必要性の確認 | 標準出力 |
| `verify-developed-composition.ts` | `developed` の `game_type` 内訳（I-1 の前提を崩した測定） | `out-composition.txt` |
| `measure-main-converted.ts` | **I-1 の決着根拠**。プール全 85 社の生件数 vs Main 換算、閾値 3〜30 での影響差、数え方で判定が反転する社の特定、ハイブリッド案のリクエストコスト | `out-main-converted.txt`（327 行） |
| `measure-edition-pollution.ts` | **I-1 の決着根拠**。Main 換算値そのものへのエディション行混入量（境界帯 32 社）、閾値 8/10/12/15/20 での判定反転有無 | `out-edition-pollution.txt`（81 行） |
| `measure-n6-sort.ts` / `check-n6-outliers.ts` / `measure-n6-percentile.ts` / `measure-n6-floor.ts` | N-6 の初期検討。ソート軸候補の比較、`aggregated_rating` 上位の外れ値確認、percentile 案の初回測定、品質フロアの感度 | 各 `out-*.txt` |
| `check-splatoon.ts` / `measure-n6-rescue.ts` | N-6(B) 高評価救済ルート。`Splatoon Raiders` の IGDB シグナル欠如の確認、救済 8 パターンの効果測定（全パターンで結果不変） | 各 `out-*.txt` |
| `check-youtube-splatoon.ts` / `check-youtube-match.ts` | N-6(A) YouTube 注目度軸。略称分裂（3 キー）とマージ順序による未マッチの確認 | 各 `out-*.txt` |
| `check-famitsu.ts` / `check-famitsu-ranking.ts` / `check-famitsu-amazon.ts` / `check-famitsu-articlerank.ts` | N-6(C) ファミ通の各ランキング経路の探索。`amazonRankingData` の発見、`articleRankingData` が各 5 件で拡張不能なことの確認 | `out-famitsu-articlerank.txt` ほか |
| `check-jp-media-signal.ts` / `check-tavily-jp-attention.ts` / `check-jp-rank-alternatives.ts` / `check-media-rankings.ts` / `check-media-rank2.ts` | N-6(C) 他媒体ランキングの網羅探索。12 媒体 + ストア 3 種の `/ranking/` 系エンドポイント、robots.txt のパス判定、「ランキングを騙る通常ページ」の反証（トップページとの重複率・`<ol>` 数の測定） | `out-media-rank.txt`, `out-media-rank2.txt` |
| `check-amazon-direct.ts` / `check-amazon-api.ts` / `check-creators-api.ts` / `check-creators-api2.ts` | Amazon の取得可否。PA-API 5 の廃止確認、Creators API の operation / resource / ライセンス条項の実読（`salesRank` の存在確認と前回報告の訂正） | `out-creators-api.txt`, `out-creators-api2.txt` |
| `measure-n6-with-jp.ts` | 第 4 軸（国内販売）を加えた場合の並び順 | `out-*.txt` |
| `measure-tiebreak.ts` | **N-6 の決着根拠 (1)**。軸の優先順位 24 通り全列挙、各軸の信号の厚さ、同点グループの列挙、優先順位以外の tie-break 3 方式の対照 | `out-tiebreak.txt`（173 行） |
| `measure-weighted.ts` | **N-6 の決着根拠 (2)**。percentile-max / absolute-max / absolute-sum / absolute-mean × 重み 81 通り。percentile の同点発生率 45/81 と絶対尺度の 0/81 を対比。プール依存性の実測 | `out-weighted.txt`（128 行） |
| `measure-weighted2.ts` | **N-6 の決着根拠 (3)**。軸数の分布（60 日窓は全件が軸 1 本 / 180 日窓は軸 2 本 14 件・軸 3 本 2 件）、mapping 12 通りの感度 | `out-weighted2.txt`（80 行） |
| `measure-rankmap.ts` | **N-6 の決着根拠 (4)**。順位系軸の写像 4 種（線形 / 対数 / 逆数 / 平方根）× 重み 81 通りの頑健性、180 日窓での max/Σ/平均 の差、Amazon ランキング実データのノイズ検出 | `out-rankmap.txt`（155 行） |
| `measure-n5-search.ts` | **N-5 の決着根拠 (1)**。未発売候補上位 5 件 × 3 クエリ（現行 `searchReviews` / 現行 `searchDeveloperInfo` / 新規「発表情報」）の実効性。`searchReviews` が前作レビュー・中身が空の集計ページを返すこと、`searchDeveloperInfo` が 5/5 で機能すること、OR 入り新規クエリが 2/5 で失敗すること | `out-n5-search.txt`（225 行） |
| `measure-n5-query-variants.ts` | **N-5 の決着根拠 (2)**。失敗した 2 件（Big Walk / Duskfade）に対するクエリ変種 3 種（開発元名あり / OR なし短文 / 日本語ローカライズ名）。**OR を落とすと両方救済された**ことと、成功 score 最低 0.763 / 失敗 score 最高 0.173 のスコア分離 | `out-n5-query-variants.txt`（76 行） |
| `measure-classic.ts` | **論点B / J-3 の判断材料**。経過年数下限 0/3/5/10/15/20 年ごとの母集団件数（`game_type=0` vs `0\|8\|9`）、名作枠での `aggregated_rating_count` カバレッジ、リメイク側の `parent_game` / `franchises` / `collections` 保有率、原作とリメイクが両方入る「混線グループ」の 3/10/15 年下限での列挙 | `out-classic.txt`（47 行） |
| `measure-classic2.ts` | **論点B の判断材料**。10 年下限 241 件の年代分布、`total_rating_count` 降順で 52 件（クールダウン 1 年分）消費したときの年代分布と上位 12 件、Issue #208 の DLC / バンドル漏れの確認 | `out-classic2.txt`（31 行） |
| `measure-208-erotic.ts` | **Issue #208 の実害確認**。`themes=42`(Erotic) 保有・評価数上位 15 件の列挙と、うち 10 件を `searchGameByName` と同形（`where` 句なし・`limit 1`）で引いた結果。**10 件中 7 件で Erotic がそのまま通った** | `out-208-erotic.txt`（31 行） |
| `measure-208-fix.ts` | **Issue #208 の決着根拠**。(A) `search` と `where` の併用可否 (B) `themes != (42)` が themes 無しのゲームを巻き込むか (C) 修正後に Erotic / DLC が塞がるか (D) 過去号で使われた 12 タイトルが壊れないか。**併用可・themes 無しは無影響・Erotic 6/7 と DLC 2/2 が塞がる・正常 11/12 が同一結果** | `out-208-fix.txt`（68 行） |
| `measure-classic-floor.ts` | **論点B の検討（結果的に棄却された枠組み）**。経過年数下限 3/4/5/6/7/10 年の件数・注目タイトルの在否・混線グループ数・上位 52 件の内容・帯ごとの具体タイトル。Elden Ring は 4 年下限が境界であることの確認 | `out-classic-floor.txt`（268 行） |
| `measure-classic-def.ts` | **論点B の決着根拠**。年数下限を使わず評価母数で定義できるかの検証。母数閾値 100〜1000 での母集団・3年以内の混入・**上位52件に入る3年以内はどの閾値でも BG3 の 1 件のみ**・傑作 18 件の在否・発売年ごとの母数中央値（新作は母数が薄い）・`aggregated_rating` 併用時の影響・`history.json` 掲載 16 件の新条件での扱い（9 件が年数条件なしで母集団外） | `out-classic-def.txt`（142 行） |
| `extract-classic-history.mjs` | **論点G の前提検証**。`src/content/issues/*.md` 全 17 号から 📜 セクションを抽出。**16/17 号で出力済み**（issue-013 のみ欠落）であり「構造的に書けない」という前提が誤りだったことの確認 | `out-classic-history.txt`（83 行） |
| `measure-j3.ts` | **論点J-3 の初回測定**。③決着条件下での母集団（`0`=255 / `0\|8\|9`=277）、入るリメイク 22 件の全列挙、混線グループと現行 `normalizeTitle` で防げるかの判定、`parent_game`/`collections`/`franchises` の保有率、`collections` 単位クールダウンの影響（マリオ 16 件 / ゼルダ 10 件 / GTA 5 件）、`FF VII Remake`(t8)/`Intergrade`(t3) が新条件を通らないことの確認 | `out-j3.txt`（118 行） |
| `measure-j3-parents.ts` | **論点J-3 の決着根拠（1)**。落ちるリメイク 22 件の `parent_game` を ID 引きし、原作が新条件を満たすかを判定。**11 件は原作もプール外**（`Resident Evil 2`/`Half-Life`/`FF VII` など）であり「原作側で拾える」という推測が半分しか成り立たないことを確認。2010年以前の原作が `total_rating < 85` に落ちる傾向も判明 | `out-j3-parents.txt`（113 行） |
| `measure-j3-collide.ts` | **論点J-3 の決着根拠（2)**。混線を `seriesKey`（自作ヒューリスティック）ではなく `parent_game` で厳密に再測定。**原作もプールに在る 11 件のうち `normalizeTitle` で防げるのは 4 件のみ**、残り 7 件のうち 4 件は版名除去ルールでは原理的に直せないこと、および案E（原作不在のリメイクのみ許可）での母集団 266 件・混線 0 件を確認 | `out-j3-collide.txt`（79 行） |
| `measure-i.ts` | **論点I の決着根拠**。次号（2026-08-08）時点のカテゴリ別クールダウン中エントリ全列挙、classic 履歴 16 件の新母集団（③＋④適用の 266 件）での在否（**内 6 件 / 外 10 件**）、I-1 で実際にブロックされる作品と母集団順位（**Red Dead Redemption 2 = 5 位** ほか 6 件）、カテゴリ横断の重複掲載 6 件、同一カテゴリ内重複 0 件、日本語タイトル記録 20/105 件の列挙 | `out-i.txt`（172 行） |
| `out-history-dump.txt` | **論点I の一次データ**。`src/content/history.json` 105 件をカテゴリ別・号順に整形出力（newRelease 31 / indie 34 / classic 16 / feature 24） | 同ファイル（109 行） |
| `out-metascore-refs.txt` | **論点D の一次データ**。`scripts/` と `src/` 全体の `metascore` / `metacritic` / `userScore` 参照 143 箇所を grep で網羅列挙。削除対象（取得・型・選定・プロンプト・バリデータ）と残す対象（表示層 5 ファイル・`content.config.ts`）の切り分けに使用 | 同ファイル（143 行） |
| `measure-g.ts` | **論点G の初回測定**。名作枠 8 タイトルに現行 `searchGameHistory()` のクエリをそのまま実行。`Ocarina of Time` が英単語 `the` の辞書ページ（Wiktionary / dictionary.com、score 0.037）を引くことを確認。**production と同じ `@tavily/core` SDK 経由で実行**（初回は生 `fetch` で書いてしまい、`fetch-web-search.ts:1-100` を実読して SDK 呼び出しに修正した） | `out-g.txt`（144 行） |
| `measure-g2.ts` | **論点G の第 2 測定**。16 タイトル + 失敗した 10 件へのクエリ変種 4 種（v0 現行 / v1 発売年追加 / v2 短文 / v3 wiki指定）。**有効 0/3 が 10/16 件**。年代別内訳 ~1999: 2/4 / 2000s: 4/4 / 2010s: 2/4 / 2020s: 2/4。v1 が 10 件中 6 件を救済、**`GTA: San Andreas` は 4 変種すべてで 0/3** | `out-g2.txt`（268 行） |
| `measure-g3.ts` | **論点G の決着根拠（1）**。「正しいページを引けたか」と「渡る 300 字が使えるか」を分離。**A) 専用ページ 11/16 / B) 使える 300 字 7/16 → 差 4 件が「ページ○抜粋✕」**（内訳表では 8 件）。300 字への禁止カテゴリ混入も計測（受賞歴 4/16・ランキング順位 6/16・売上本数 2/16・個人名 1/16）。**律速が検索ではなく抜粋長であることを示した測定** | `out-g3.txt`（85 行） |
| `measure-g4.ts` | **論点G の決着根拠（2）**。出力側。全 17 号の 📜 セクション本文を `classicSystem` の禁止カテゴリ 6 種と正規表現照合。**クリーンな 📜 は 7/16 号のみ**（業界影響 5 / 続編 4 / 売上 3 / 受賞歴 3 / 個人名 2 / 開発期間 1）。あわせて validation レポートとの照合で issue-003/004/005 のすり抜けと issue-007「1500万本」の検出（high・`sourcedFrom=なし`）を確認 | `out-g4.txt`（70 行） |
| `measure-g5.ts` | **論点G の決着根拠（3）**。プロンプト 300 字とバリデータ snippet 1500 字の非対称を定量化。48 件 / content 平均 1591 字 / 300 字超 42 件 / 1500 字超 31 件。**プロンプト内の定量値 10 個 vs 300〜1500 字にのみ存在する定量値 31 個**。実例としてウィッチャー3 Wikipedia の「2800万本/5000万本/6000万本/6500万本」、スーパーマリオワールドの「2061万本/第2位」を列挙 | `out-g5.txt`（50 行） |
| `measure-f.ts` | **論点F の初回測定**。`data/japanese-events.json` の実体（**127 件 / version 1.2 / 月ごと 10〜12 件でほぼ均等**）と、2026 年の全 52 土曜に対する窓 7 日の実測（**0 件 5 週 / 1 件 9 週 / 4 件以上 16 週 / 平均 2.6 件**）。あわせて IGDB の `themes` 22 種・`game_modes` 6 種それぞれの供給量 | `out-f.txt`（128 行） |
| `measure-f2.ts` | **論点F の第 2 測定**。実 17 号の `publishDate` に対する窓 7 日のイベント件数と特集タイトルの対応。**0 件は issue-002(04-11) と issue-008(05-22) の 2 号**、**14/17 号は特集タイトルがイベント名に紐づいている**（＝暦イベント起点は機能している）。副産物として**発行曜日が 土=6 / 金=11** であることを検出 | `out-f2.txt`（95 行） |
| `measure-f3.ts` | **論点F の第 3 測定（空振り）**。0 件週の特集ゲームが同一号の他カテゴリと重複していないかを測定 → **0 件**。測る指標を誤っており、実害は号横断で現れることが分かったため `measure-f4.ts` を作り直した | `out-f3.txt`（92 行） |
| `measure-f4.ts` | **論点F の決着根拠（1）**。号横断の特集ゲーム重複。**0 件週の号 5/10 = 50% が他号と重複** vs **イベントあり号 3/29 = 10%**。`Forza Horizon 6` と `Slay the Spire II` が vol.2 と vol.8 の両方に登場。feature 履歴 24 件はすべて vol.12 以降で、vol.2/8 当時は履歴による抑止が効いていなかった | `out-f4.txt`（56 行） |
| `measure-f5.ts` | **論点F の決着根拠（2）**。ユーザー指示「直近のイベントに限定したい」を受けた再測定。0 件週の最近イベントは**後方向 -1〜-5 日 vs 前方向 +8〜+11 日**（後方が圧倒的に近い）。窓を常時広げる案の副作用は**隣接週の重複が 7日=1/51 → 10日=38/51(61件) → 14日=46/51(126件)**。後方 5 日まで遡れば土曜基準・金曜基準ともに 0 件週が消える | `out-f5.txt`（92 行） |
| `measure-h.ts` | **論点H の決着根拠**。全 17 号の frontmatter からカテゴリ別記事本数を数え、期待値（newRelease 2 / indie 2 / feature 1 / classic 1）との差を集計。**期待 6 本を満たしたのは 14/17 号**、欠けたのは newRelease 2 号（015=1本 / 017=0本）と **classic 1 号（013=0本。本調査で初めて判明）**。indie / feature は 17/17 号で充足。特集の `recommendedGames` は 17/17 号で 3 件以上（`FEATURE_MIN_GAMES` を満たす）。あわせて validation レポートの探索で `data/validation/`（1 件）/ `data/validation-manual/`（7 件）/ `data/validation-dev/`（21 件）の実体と、レポートに `shortfall` 系フィールドが存在しないことを確認 | `out-h.txt`（59 行） |
| `measure-f6.ts` | **論点F の決着根拠（3）＝ (F-2') の設計を決めた測定**。各号が**実際にテーマとして使った**イベントを特集タイトルから同定（**使用 14 種 / 窓に入ったが未使用 26 種**）。除外を「使った」に限れば issue-002 は **-1日 駅弁の日**、issue-008 は **-5日 世界電気通信の日** が採用できる。一方「直前号の窓に入った」まで除外すると **-8〜-12 日**に後退する | `out-f6.txt`（122 行） |

**注意**: 出力をパイプで `head` / `tail` に渡すと SIGPIPE でスクリプトが途中終了し、**測定結果が欠落したまま気づかない**事故が起きた。必ず `> .claude-scratch/out-*.txt 2>&1` でファイルにリダイレクトしてから読むこと。

**注意（測定手法）**: 論点J-3 では、版名を削る自作正規化（`seriesKey`）で混線を数えたところ `Pokémon SoulSilver` vs `Silver` を取りこぼし、`Super Mario World` vs `Super Mario 3D World`（別作品）を誤検出した。**同一作品の判定には `parent_game`（リメイク側で保有率 100%）を使うこと。** タイトル文字列の正規化では原理的に解けない。

**注意（測定手法）**: 論点G では 2 つの限界があった。①`measure-g3.ts` の `isDedicatedPage()` は URL とタイトルの表層一致による判定で、`Elden Ring, a Masterpiece of Modern Gaming`（tamug.edu）を URL に `eldenring` を含むため専用ページに誤分類した。よって「専用ページ 11/16」は**上限寄りの値**である。②`measure-g4.ts` の禁止カテゴリ検出は正規表現の表層一致であり、意味的な判定ではない。「9/16 号」は**禁止カテゴリの語を含む号数**であって、実際にハルシネーションした号数ではない。また validation レポートが 8/17 号しか存在しないため「すり抜け 3 件」は**下限値**である。

**注意（測定手法）**: 論点H の `measure-h.ts` は frontmatter の `category` 行と `recommendedGames` のインデントをインデント依存の正規表現で数えており、YAML パーサを通していない。ネスト構造が異なる号があれば数え落とす可能性がある（全 17 号で 3〜5 件という妥当な範囲に収まっているため大きな取りこぼしは無いと考えられる）。また**「不足」と「そもそも生成しようとしなかった」は frontmatter からは区別できない**（生成ログが残っていないため）。

**注意（測定手法）**: 論点F では 2 つの限界があった。①`measure-f4.ts` の特集ゲーム抽出は本文の `『』` からの正規表現抽出であり、frontmatter の `recommendedGames` フィールドを見ていない。ノイズ語 18 件の手作りリストと日本語/英語の別名 8 組の対応表を必要とした。よって「50% / 10%」は**下限寄りの値**である。②`measure-f6.ts` の「実際に使ったイベント」の同定も特集タイトルとの表層一致であり、`issue-013`（窓に 露天風呂の日 / 海開き → 特集は「夏の海を満喫できるゲーム3選」）は**同定できなかった**。「使用 14 種 / 未使用 26 種」の切り分けには取りこぼしがある。

**注意（測定手法）**: 論点G の Tavily 測定では、当初 `https://api.tavily.com/search` への生 `fetch`（`api_key` を JSON body に入れる形）で書いてしまった。production（`scripts/fetch-web-search.ts`）は `@tavily/core` の `tavily({apiKey})` → `client.search(query, {maxResults, searchDepth, topic})` を使っている。**外部 API の測定は必ず production の呼び出し形を実読してから合わせること。**

---

## 付録: 参照した一次ソース

- IGDB API ドキュメント: https://api-docs.igdb.com/ （Game / Company / Theme / Game Type エンドポイントのフィールド定義）
- IGDB API 実行結果
  - **2026-07-26 実施**（§1〜§10。`IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` を使用）
  - **2026-07-29 実施**（§4.1 用語集・§8.1〜8.3・§11 のすべての数値。基準時刻 `now = 2026-07-29T09:23:39Z`）
  - **2026-08-01 実施**（§11.4.5〜11.4.11 のすべての数値。発売済み 60 日窓 / 180 日窓）
- **Steam Store API**（2026-07-29 実施）
  - `https://store.steampowered.com/api/appdetails?appids={id}` — `type` / `fullgame` / `content_descriptors.ids` の実体確認（§8.1）
  - `https://store.steampowered.com/api/featuredcategories` — Top Sellers の DLC 混入率確認（§8.1）
  - `.../featuredcategories/?cc=jp&l=japanese` — Steam 軸の順位取得（2026-08-01。取得枠 9 件。§11.4.5）
- **ファミ通**（2026-08-01 実施。§11.4.11）
  - `https://www.famitsu.com/ranking/amazon` — `__NEXT_DATA__` の `amazonRankingData`（50 件）。国内販売軸のデータ源
  - `https://www.famitsu.com/` — `articleRankingData.{current,daily,weekly,monthly,retweet}Article`（各 5 件）
  - `/ranking/article`（54 件）/ `/ranking/software`・`/ranking/{daily,weekly,monthly,retweet}`（すべて 404）
  - `https://www.famitsu.com/copyright` — 「転載・複写・蓄積・転送・引用・改変」の禁止条項（株式会社 KADOKAWA Game Linkage）
- **他媒体のランキング探索**（2026-08-01 実施。§11.4.11）— 4Gamer / Game*Spark / GAME Watch / 電撃オンライン / インサイド / AUTOMATON / 電ファミニコゲーマー の `/ranking/` 系エンドポイントと各 `robots.txt`
- **プラットフォームストア**（2026-08-01 実施。§11.4.11）
  - `https://store.playstation.com/ja-jp/pages/browse` ほか — `__NEXT_DATA__` / apolloState（ランキング関連語の出現 0）
  - `https://www.xbox.com/ja-JP/games/browse` — `window.__PRELOADED_STATE__`（**JSON.parse 失敗により未確認**）
- **Amazon Product Advertising / Creators API ドキュメント**（2026-08-01 実施。§11.4.11）
  - `https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation` — PA-API 5 廃止の告知
  - `https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/**`（27 ページ）— operation 一覧・resource 一覧・`browseNodeInfo.browseNodes.salesRank` / `websiteSalesRank` の定義
  - `https://affiliate.amazon.co.jp/help/operating/paapilicenseagreement` — 日本ロケールのライセンス条項 (g) (i) (n) (o)
- GitHub Actions 実行ログ: run 30129193266（vol.17, schedule, 2026-07-24T21:52:45Z, conclusion=success）
- `src/content/issues/issue-001.md` 〜 `issue-017.md`
- `src/content/history.json`（105 件）
- `要件.md`
- `scripts/fetch-igdb.ts`, `scripts/game-filter.ts`, `scripts/fetch-data.ts`, `scripts/bedrock-client.ts`,
  `scripts/select-newreleases-with-fallback.ts`, `scripts/select-indie-with-fallback.ts`,
  `scripts/indie-classifier.ts`, `scripts/game-history.ts`, `scripts/generate-articles.ts`,
  `scripts/fetch-metacritic.ts`, `scripts/adult-blocklist.ts`, `.github/workflows/weekly-build.yml`
- **2026-07-29 に追加で実読したもの**: `scripts/fetch-steam.ts`（§8.1 の DLC 未除外を検出）,
  `scripts/normalize.ts`（`normalizeTitle` の実装 — §11.2 I-2）,
  `scripts/fetch-web-search.ts`（Tavily 検索クエリの実文言 — §11.3）,
  `scripts/completeness-gate.ts`（`usedTitles` の構築経路 — §11.2 I-2）
