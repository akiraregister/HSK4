# 加油（HSK4学習アプリ）

HSK4級を90日で目指す、日本語話者向けの学習アプリ。GitHub Pages で公開している。

**このリポジトリでの会話は日本語で応答すること。**

- 本体 https://akiraregister.github.io/HSK4/
- LP　 https://akiraregister.github.io/HSK4/lp/

## ⚠️ 販売開始前に必ず確認（今の状態）

このリポジトリは**公開（Public）**。公開リポジトリに入っているファイルは、GitHub Pagesの
設定に関係なく`github.com`から誰でも読める（`worker-paywall/src/content-bundle.js`に
Day8-90を分離しても、リポジトリ自体が公開なら閲覧を防げない）。この問題が見つかった時点で
「まだ告知・販売開始前だから誰が見てもよい」との判断により、**Day8-90の制限は一時的に解除中**
（`node worker-paywall/restore-full-content.mjs`で`index.html`に全90日を書き戻し済み）。

**販売を始める前に、この順番で対応すること：**
1. リポジトリをPrivateにする（`github.com/akiraregister/HSK4/settings` の Danger Zone。
   GitHub Pagesを維持するにはGitHub Pro等への加入が必要になる場合がある）
2. `node worker-paywall/build-content.mjs` を実行してDay8-90を`index.html`から切り出す
3. `worker-paywall/README.md`／`worker/README.md`の手順でCloudflare/Stripeを設定する
4. `node tests/run.mjs` を通してから配置・マージする

①をやらないまま②だけ実行しても、切り出した`content-bundle.js`自体が公開リポジトリに
残るので実質的な保護にはならない。①が先。

## 構成

ビルドもフレームワークも無い。全部が素のファイル。

| ファイル | 中身 |
|---|---|
| `index.html` | **アプリ全体**。CSS・JS・学習データを内包。**いまは全90日分が入っている**（未告知・未販売のあいだ、Day8-90の制限を一時解除中。下記「⚠️ 販売開始前に必ず確認」参照） |
| `lp/index.html` | 告知用ランディングページ。アプリと同じトークンを複製し、復習カードと並べ替えを実際に触れるデモとして載せている |
| `lp/og.png` | SNS共有用の画像。`lp/og-source.html` を1200×630で撮ったもの |
| `sw.js` | Service Worker。**更新したら `CACHE_VERSION` を1つ上げる**（ファイル冒頭の規約） |
| `audio/dayN.mp3` | リスニング問題の音声（Day 1〜90、全日実装済み。Google Cloud TTS生成）。台本はDay1-7が `index.html` の `LISTENING`、Day8-90が `worker-paywall/src/content-bundle.js`。模試には未収録（SRS復習・模試の対象外） |
| `tests/` | 実ブラウザで画面を操作するテスト。`tests/README.md` 参照 |
| `worker/` | 作文のAI採点Worker（Cloudflare）。ソースはここが本体、`hsk4-grader.hsk4test.workers.dev` は配置先。作文の内容を変えたら `worker/README.md` の手順で作り直して配置し直すこと。`writing-bank.js` はDay1-7（`index.html`）とDay8-90（`worker-paywall/src/content-bundle.js`）をマージして作る。Day8以降の採点はFirebaseログイン＋購入済み（`worker-paywall`と同じKVを読む）が必要 |
| `legal/` | 利用規約・プライバシーポリシー・特定商取引法に基づく表記。設定画面とLPのフッターからリンク。特商法ページの事業者情報は**未定のまま**なので、販売開始前に確定させること |
| `worker-paywall/` | 購入・権限管理Worker（Cloudflare）。Stripe決済とFirebase uidごとの購入済み判定、Day8-90本体（`GET /content`）の配信を担当。作文採点Workerとはあえて別Workerにしてある（理由は `worker-paywall/README.md`）。**まだCloudflareに配置していない**（コードとしては完成、アカウント側の作業＝KV/Stripe設定が未了）。`build-content.mjs`（Day8-90を切り出してindex.htmlから外す）と`restore-full-content.mjs`（その逆＝index.htmlへ全90日を書き戻す）の両方がある |

### index.html の中の地図（現在は全90日入り。行番号は目安）

| 位置の目安 | 何があるか |
|---|---|
| 551行目 | `const LESSONS` — 現在90日分。販売開始前にDay8-90を切り出すと7日分に減る |
| 560行目 | `const BANK` — ミニテスト。毎日ここから5問が選ばれる。**画面に出るのはこちらで、`LESSONS[].test` は使われていない** |
| 22459行目 | `const LISTENING` — リスニング問題 |
| 25900行目付近 | 有料コンテンツ機構（Day8-90を切り出したときだけ効く）。`TOTAL_DAYS`（固定90。`LESSONS.length`とは別物）、`mergePaidContent()`／`restorePaidContentCache()`（起動時にlocalStorageキャッシュを復元）、`fetchPaidContent()`（`hsk4-paywall`の`/content`を取得）、`startCheckout()`（`/checkout`を呼んでStripeへ）、`lockedDayHTML()`（Day8以降が未取得のときの画面）。**いまはLESSONSに全90日あるのでこの経路は使われず休眠中** |
| `initFirebase()`内の`onAuthStateChanged` | ログイン確認後の処理。`?purchase=success`ならここで`fetchPaidContent()`を自動で呼びトースト表示、`?purchase=cancel`はURLだけ掃除（それぞれのタイミングは`restorePaidContentCache()`の直後／`onAuthStateChanged`内） |
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

**`LESSONS.length` は「今読み込めている日数」であって「全90日」ではない。** Day8-90は
未購入だと存在しないので、カリキュラム全体の日数が要る場所（進捗%、Day一覧、
`setDay()`のクランプ等）は必ず`TOTAL_DAYS`（固定90）を使うこと。`LESSONS.length`を
使っていいのは「今読み込めている中から探す」場面（`cwLookupApp`等）だけ。

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
node tests/run.mjs        # 全109項目＋Service Workerチェック
```

**変更したら必ず通すこと。** ビルドもCIも無いので、これが唯一の安全網。
過去にこの網で拾ったバグは `tests/README.md` に列挙してある。

## まだ手を付けていないこと

有料化に進む場合の前提。詳細はマネタイズ提案書（下記）に。

- **リポジトリがPublicのまま** — 上記「⚠️ 販売開始前に必ず確認」参照。これが最優先
- **Day8-90が`index.html`に戻っている** — `restore-full-content.mjs`で一時的に戻した状態。
  販売開始前に`build-content.mjs`で切り出し直すこと
- **Cloudflareへの配置がまだ** — `worker-paywall/`はコードとしては完成（Day8-90の切り出し・
  `/checkout`・`/webhook`・`/entitlement`・`/content`すべて実装済み）だが、実際にCloudflareへ
  配置してURLを得るところ、KV名前空間の作成、Stripeでの商品・価格作成、Webhook登録が未了。
  手順は`worker-paywall/README.md`参照。配置するまでは`startCheckout()`は失敗する
- **Firestoreルールは確認済み・健全** — `users/{uid}/hsk4/{docId}` のみ、本人以外は読み書き不可、期限切れも無し。entitlementはFirestoreではなくCloudflare KVに持たせる方針にした（実装済み）ので、この境界は既に守られている
- **特商法ページの事業者情報が未定** — `legal/tokushoho.html` の会社名・所在地・電話番号・メール・決済方法が仮のまま。販売開始前に確定させること

## 決まっていること

- **対象** 一般学習者。ただしビジネスと生活の場面をバランスさせる（例文がその方針）
- **価格** ¥7,800前後の**買い切り**が主軸。90日という終わりのある商品に月額は合わない
- **paywall位置** Day 8。間隔反復が効き目を体感させるのに最低1週間かかるため
- **HSK5以上の人** 正直に「易しすぎる」と伝え、関心の人数だけ数える（メールは取らない）

## paywallの設計（コードは実装済み・配置は未了）

- **決済** Stripe Checkout（買い切り、1回払い）
- **権限管理** Firebaseのuidをキーに、Cloudflare KVに購入済みフラグを保存
- **Worker構成** `hsk4-grader`（作文採点）とは別に `worker-paywall/`（`hsk4-paywall`）
  を作った。役目を混ぜない方針（`worker-paywall/README.md` 参照）
- **Day8-90の切り出し** `worker-paywall/build-content.mjs` が `index.html` の
  `LESSONS`/`BANK`/`LISTENING` からDay8-90を `worker-paywall/src/content-bundle.js`
  に分離し、`index.html` にはDay1-7だけを残す（実装済み。詳細は`worker-paywall/README.md`）
- **index.html側の導線** `startCheckout()`（購入）、`fetchPaidContent()`（取得・
  localStorageへキャッシュ）、`lockedDayHTML()`（未購入時のDay8以降の画面）まで実装済み。
  Stripeの`success_url`（`?purchase=success`）で戻ってきたときは、ログイン確認後に
  `onAuthStateChanged`内で自動的に`fetchPaidContent()`を呼んでトースト表示・再描画する
  （`?purchase=cancel`はURLだけ掃除）。ログインのたびに未購入分が無いか一度だけ確認もする
- **`hsk4-grader`側の認証も実装済み** Day1-7は誰でも採点できるまま、Day8以降は
  Firebase IDトークン＋`worker-paywall`と同じKV（`ENTITLEMENTS`）で購入済み判定。
  未接続時は安全側でDay8以降を常に403にする（詳細は`worker/README.md`）
- **未着手（アカウント側の作業）** Cloudflareへの配置、KV名前空間の作成（`worker/`と
  `worker-paywall/`の両方に**同じid**を設定）、Stripeでの商品・価格作成、Webhook登録
  とシークレット設定 — いずれも実際のアカウントが必要なため、`worker-paywall/README.md`
  ／`worker/README.md`の手順を見ながら利用者自身が行うこと

## 関連

- マネタイズ提案書 https://claude.ai/code/artifact/e520a372-d71f-4e02-9279-b625c8df79b9
- デザイン検討キャンバス https://claude.ai/code/artifact/2ae30fc2-ab00-4dcb-969f-e668beca3ae3
