# 加油（HSK4学習アプリ）

HSK4級を90日で目指す、日本語話者向けの学習アプリ。GitHub Pages で公開している。

**このリポジトリでの会話は日本語で応答すること。**

- 本体 https://akiraregister.github.io/HSK4/
- LP　 https://akiraregister.github.io/HSK4/lp/

## 構成

ビルドもフレームワークも無い。全部が素のファイル。

| ファイル | 中身 |
|---|---|
| `index.html` | **アプリ全体（約900KB / 7,400行）**。CSS・JS・学習データすべて内包 |
| `lp/index.html` | 告知用ランディングページ。アプリと同じトークンを複製し、復習カードと並べ替えを実際に触れるデモとして載せている |
| `lp/og.png` | SNS共有用の画像。`lp/og-source.html` を1200×630で撮ったもの |
| `sw.js` | Service Worker。**更新したら `CACHE_VERSION` を1つ上げる**（ファイル冒頭の規約） |
| `audio/dayN.mp3` | リスニング問題の音声（Day 1〜70、Google Cloud TTS生成）。台本は `index.html` の `LISTENING` |
| `tests/` | 実ブラウザで画面を操作するテスト。`tests/README.md` 参照 |
| `worker/` | 作文のAI採点Worker（Cloudflare）。ソースはここが本体、`hsk4-grader.hsk4test.workers.dev` は配置先。作文の内容を変えたら `worker/README.md` の手順で作り直して配置し直すこと |

### index.html の中の地図

| 位置の目安 | 何があるか |
|---|---|
| 499行目 | `const LESSONS` — 90日分。語彙498（重複なし）・文法222（重複なし） |
| 508行目 | `const BANK` — 90日分のミニテスト986問。毎日ここから5問が選ばれる。**画面に出るのはこちらで、`LESSONS[].test` は使われていない** |
| 320-430行目 | Firebase（遅延読み込み。落ちてもアプリ本体は動く） |
| 中盤 | `track()` / 背面シェイプ / 各画面の `render*()` |
| 終盤 | SRS（SM-2）、模擬試験、級診断、マイ単語 |
| 最終行付近 | 初回起動の判定（**ここでないと動かない。理由は下記**） |

## 触るときの注意

**画面状態は `currentView` 1つ。** 以前は5つの真偽値を各遷移関数が手で書き換えており、
1つ書き忘れると二重表示になっていた。遷移は必ず `goView()` を通すこと。
値は `today` / `day` / `bookmark` / `vocab` / `settings` / `review` / `mock` / `levelcheck`。

**宣言順に注意。** モジュール1本なので `const` の一時的死角を踏みやすい。実際に2回踏んだ。
- 初回起動の判定は `PLACEMENT_QUESTIONS` などの定義後でないと動かないので**モジュール末尾**にある
- `try/catch` で囲った関数が定義前の `const` を読むと、例外が握りつぶされて**黙って誤動作する**

**`#settingsPanel` は常時DOMにある。** Firebase 側が `loginBtn` などのIDを直接引くため、
再描画で作り直さず、表示だけ切り替えている。セレクタを書くときは `#content` に限定しないと
別画面のボタンに当たる。

**ブックマークはオブジェクトで格納する。** `state.bookmarks[id] = true` ではなく
`toggleBookmark()` と同じ `{id, type, title, sub, day, pinyin, example, ...}` の形。
真偽値を入れると一覧が `b.id.match` で落ちる。

**書体は役割で分ける。** 丸ゴシック（Zen Maru Gothic）は表示用で、本文サイズだと
漢字の内側が潰れて読みづらい。見出し・ボタン・数字・ラベルだけに使い、
読ませる文章は Zen Kaku Gothic New（`--font-body`）。中文は `--zh-font`（PingFang SC系）。

**色は `:root` のトークンだけで変わる。** 直書きの色は掃除済み。
`--sage` `--apricot` `--blush` の3色が背面シェイプと意味色を兼ねており、
新しい色を足す前にこの3つで足りないか考えること。

## 検証

```bash
node tests/run.mjs        # 全103項目＋Service Workerチェック
```

**変更したら必ず通すこと。** ビルドもCIも無いので、これが唯一の安全網。
過去にこの網で拾ったバグは `tests/README.md` に列挙してある。

## まだ手を付けていないこと

有料化に進む場合の前提。詳細はマネタイズ提案書（下記）に。

- **コンテンツがクライアントに全部ある** — `LESSONS`/`BANK` が `index.html` 内にあるため、
  クライアント側のpaywallは原理的に成立しない。有料化するなら最初に解く問題
- **Firestoreルールは確認済み・健全** — `users/{uid}/hsk4/{docId}` のみ、本人以外は読み書き不可、期限切れも無し。ただし将来 entitlement を足すなら**同じドキュメントの中に置かない**こと（利用者が自分で書き換えられる）
- **法務3点セットが無い** — 利用規約・プライバシーポリシー・特商法表記
- **听力（リスニング）は Day 1〜70 まで実装済み・残り Day 71〜90 が未対応** — 台本は `LISTENING`（`index.html` 内）、音声は `audio/dayN.mp3`。Google Cloud TTS（Chirp3-HD Puck/Aoede）で生成。模試には未収録（`LISTENING` の問題はSRS復習・模試の対象外）

## 決まっていること

- **対象** 一般学習者。ただしビジネスと生活の場面をバランスさせる（例文がその方針）
- **価格** ¥7,800前後の**買い切り**が主軸。90日という終わりのある商品に月額は合わない
- **paywall位置** Day 8。間隔反復が効き目を体感させるのに最低1週間かかるため
- **HSK5以上の人** 正直に「易しすぎる」と伝え、関心の人数だけ数える（メールは取らない）

## 関連

- マネタイズ提案書 https://claude.ai/code/artifact/e520a372-d71f-4e02-9279-b625c8df79b9
- デザイン検討キャンバス https://claude.ai/code/artifact/2ae30fc2-ab00-4dcb-969f-e668beca3ae3
