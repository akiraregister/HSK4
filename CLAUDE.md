# 加油（HSK4学習アプリ）

HSK4級を90日で目指す、日本語話者向けの学習アプリ。GitHub Pages で公開している。

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
| `tests/` | 実ブラウザで画面を操作するテスト。`tests/README.md` 参照 |

### index.html の中の地図

| 位置の目安 | 何があるか |
|---|---|
| 451行目 | `const LESSONS` — 90日分。語彙450（重複なし）・文法270 |
| 459行目 | `const BANK` — 90日分のミニテスト（選択・並べ替え・作文） |
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
- **AI採点Workerが無認証** — `hsk4-grader.hsk4test.workers.dev` に誰でもPOSTできる
- **Firestoreのルールが未確認** — entitlement を置く前に必ず見る
- **法務3点セットが無い** — 利用規約・プライバシーポリシー・特商法表記
- **听力（リスニング）の音源が無い** — 試験の約1/3。模試でも正直にそう書いている
- ルート直下の `icon-192_1.png` `icon-512_2.png` 等は未参照（約60KB）

## 決まっていること

- **対象** 一般学習者。ただしビジネスと生活の場面をバランスさせる（例文がその方針）
- **価格** ¥7,800前後の**買い切り**が主軸。90日という終わりのある商品に月額は合わない
- **paywall位置** Day 8。間隔反復が効き目を体感させるのに最低1週間かかるため
- **HSK5以上の人** 正直に「易しすぎる」と伝え、関心の人数だけ数える（メールは取らない）

## 関連

- マネタイズ提案書 https://claude.ai/code/artifact/e520a372-d71f-4e02-9279-b625c8df79b9
- デザイン検討キャンバス https://claude.ai/code/artifact/2ae30fc2-ab00-4dcb-969f-e668beca3ae3
