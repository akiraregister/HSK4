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
3. Stripeをサンドボックス（テスト）から**本番モードへ切り替える**。`sk_live_...`の
   APIキーと本番のWebhook署名シークレットを`wrangler secret put`で入れ直し、
   本番の価格IDを`wrangler.toml`に設定して再配置する（`worker-paywall/README.md`）
4. `legal/tokushoho.html` の事業者情報（会社名・所在地・電話番号・メール）を確定させる
5. `node tests/run.mjs` を通してから配置・マージする

Cloudflare／Stripeの**設定と通し動作確認は2026年9月に完了済み**（下記
「paywallの設計」参照）。残っているのは上の①②③④だけ。

①をやらないまま②だけ実行しても、切り出した`content-bundle.js`自体が公開リポジトリに
残るので実質的な保護にはならない。①が先。

## デザイン刷新（進行中）

見た目と画面構成を作り直す作業が進行中。方向は**案X（辞書・新聞）＝明朝＋宋体・罫線で組む・
角丸と影はゼロ**、アクセントは柿 `#DC6011`、アイコンはO7「二段の炎」。
**フェーズ0（粗取り）・1（アイコン一式）・2（デザイントークン）・3（下タブ化と細いヘッダー）・
4（今日画面）・5（Day学習の4ステップ化）まで実装済み。**残りは完了画面の新設・設定の整理。
再開するときは **`design/HANDOFF.md` を最初に読むこと。**決まったこと・次にやること・
実装時の落とし穴がまとまっている。分析と案の全記録は `design/README.md`。

## 作業環境

利用者の環境は **MacBook Air（macOS / zsh）・iPhone・iPad**。ブラウザは **Safari**。
手順を案内するときは次を守ること。実際にどれも事故を起こした。

- **キーボードショートカットではなくメニュー操作で書く。** 「⌘+Shift+N」等は通じにくい。
  「ファイル → 新規プライベートウインドウ」のようにメニューの階層で示す
- **Safariのショートカットは Chrome とは違う。** 強制リロードは ⌘+Option+R
  （⌘+Shift+R ではない）。コンソールは「開発 → JavaScriptコンソールを表示」
- **コマンドを `&&` で長く繋がない。** 貼り付けが途中で切れて別のコマンドに化ける事故が
  複数回起きた（`build-content.mjs` が `build-content.mjscd` になる等）。短い1コマンドずつ渡す

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
| `worker-paywall/` | 購入・権限管理Worker（Cloudflare）。Stripe決済とFirebase uidごとの購入済み判定、Day8-90本体（`GET /content`）の配信を担当。作文採点Workerとはあえて別Workerにしてある（理由は `worker-paywall/README.md`）。**配置済み・稼働中**（`hsk4-paywall.hsk4test.workers.dev`。いまはStripeサンドボックス＝テストモード）。`build-content.mjs`（Day8-90を切り出してindex.htmlから外す）と`restore-full-content.mjs`（その逆＝index.htmlへ全90日を書き戻す）の両方がある |

### index.html の中の地図（現在は全90日入り。行番号は目安）

| 位置の目安 | 何があるか |
|---|---|
| 551行目 | `const LESSONS` — 現在90日分。販売開始前にDay8-90を切り出すと7日分に減る |
| 560行目 | `const BANK` — ミニテスト。毎日ここから5問が選ばれる。**画面に出るのはこちらで、`LESSONS[].test` は使われていない** |
| 22459行目 | `const LISTENING` — リスニング問題 |
| 25900行目付近 | 有料コンテンツ機構（Day8-90を切り出したときだけ効く）。`TOTAL_DAYS`（固定90。`LESSONS.length`とは別物）、`mergePaidContent()`／`restorePaidContentCache()`（起動時にlocalStorageキャッシュを復元）、`fetchPaidContent()`（`hsk4-paywall`の`/content`を取得）、`startCheckout()`（`/checkout`を呼んでStripeへ）、`lockedDayHTML()`（Day8以降が未取得のときの画面）。**いまはLESSONSに全90日あるのでこの経路は使われず休眠中** |
| `initFirebase()`内の`onAuthStateChanged` | ログイン確認後の処理。`?purchase=success`なら`session_id`を`confirmPurchase()`へ渡して購入を確定させ、`fetchPaidContent()`を呼びトースト表示（9秒）、`?purchase=cancel`はURLだけ掃除。**ログイン成功時は必ず`render()`する**（購入ボタンの文言などログインの有無で変わる表示があるため。呼び忘れて「ログインしても画面が変わらない」不具合を出した） |
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

**描き直しは学習の途中経過を壊す。** `toggleBookmark()` と `setLevel()` と `toggleComplete()` は
以前 `render()` を呼んでおり、Day学習の途中で★・難易度・完了を押すとミニテストとリスニングが
最初からやり直しになっていた。いまはどれも**その場の要素だけ**を更新する
（`data-bm` / `data-lv` を手がかりにする。見つからない画面では従来どおり `render()`）。
同じ理由で、Day学習の**ステップ移動も描き直さず表示だけ切り替える**（`.dstep.on`）。

**書体は明朝と宋体。** デザイン刷新（案X＝辞書・新聞）で丸ゴシック（Zen Maru Gothic）・
角ゴシック（Zen Kaku Gothic New）・手書き（Yomogi）はすべて外した。和文は Noto Serif JP
（`--font-brand` `--font-display` `--font-body` `--font-hand` すべて同じ明朝）、
中文は `--zh-font` ＝ Noto Serif SC（宋体）。
- `--font-hand` は呼び出しが3か所残っているので、名前だけ生かして明朝に寄せてある
- **拼音だけは別扱い。** 声調記号を持たない書体にフォールバックすると記号が不揃いに
  なるので、ラテン字を持つ system font のまま（`.pinyin,.expinyin,.vrow-py`）。
  字間を広げて漢字に従属させている

**色は `:root` のトークンだけで変わる。** 案Xへの差し替えのときに直書きの色を
100か所ほど掃除してトークンへ寄せた（前は「掃除済み」と書いてあったが、実際には残っていた）。
- **罫は2階層だけ。** `--hair`（細罫＝区切り）と `--rule`（太罫＝塊の境目）。
  旧名の `--line` `--stroke` `--bw` はこの2つを指す。
  **`--stroke` は「枠線」の意味**なので、塗りつぶしには `--ink` を直に使うこと
  （混ざっていたのを5か所直した）
- **角丸は4段とも0**（`--r-sm` `--r-md` `--r-lg` `--r-pill`）。案Xは罫だけで組む。
  丸みを戻したくなったらこの4つだけ触ればよい
- **影は1系統**（`--sh`、案Xでは `none`）。地との明度差と罫で階層を作る
- **アクセントは柿 `--brand:#DC6011` の1色**。山吹はクリーム地との明度差が小さく、
  罫囲みのボタンや文字に使うと読めない
- `--sage` `--apricot` `--blush` は背面シェイプ用だったが、案Xは地に色を敷かないので
  `#bgShapes` は `display:none` にしてある（`renderBgShapes()` 側は手つかず）

## 検証

```bash
node tests/run.mjs        # 全138項目＋Service Workerチェック
```

**変更したら必ず通すこと。** ビルドもCIも無いので、これが唯一の安全網。
過去にこの網で拾ったバグは `tests/README.md` に列挙してある。

## まだ手を付けていないこと

有料化に進む場合の前提。詳細はマネタイズ提案書（下記）に。

- **リポジトリがPublicのまま** — 上記「⚠️ 販売開始前に必ず確認」参照。これが最優先
- **Day8-90が`index.html`に戻っている** — `restore-full-content.mjs`で一時的に戻した状態。
  販売開始前に`build-content.mjs`で切り出し直すこと
- **Stripeがまだサンドボックス（テストモード）** — 配置と通し確認は済んでいる。
  販売開始前に本番モードのAPIキー・Webhook・価格IDへ差し替えて再配置すること
- **Webhookが届かない（原因未特定）** — 決済も`checkout.session.completed`の発生も
  成功しているのに、`POST /webhook`にStripeからの配信が来ない。Worker自体は生きている
  （署名なしのリクエストは400で拒否する）。サンドボックスではv1の`webhook_endpoints`が
  実際には配信されず、v2の`event_destinations`が要る可能性がある（未検証）。
  **`/confirm`（下記）が代わりに機能しているため購入は反映される**が、返金や
  チャージバックを扱うようになったらWebhookが要る
- **クーポンの動作未確認** — `FRIEND2024`（100%オフ）と`EARLYBIRD`（50%オフ）を
  Stripeサンドボックスに作成済みだが、実際に適用した決済はまだ試していない
- **Firestoreルールは確認済み・健全** — `users/{uid}/hsk4/{docId}` のみ、本人以外は読み書き不可、期限切れも無し。entitlementはFirestoreではなくCloudflare KVに持たせる方針にした（実装済み）ので、この境界は既に守られている
- **特商法ページの事業者情報が未定** — `legal/tokushoho.html` の会社名・所在地・電話番号・メール・決済方法が仮のまま。販売開始前に確定させること

## 決まっていること

- **対象** 一般学習者。ただしビジネスと生活の場面をバランスさせる（例文がその方針）
- **価格** **¥4,800の買い切り**（税込）。90日という終わりのある商品に月額は合わない。
  当初は¥7,800前後を想定していたが、最初は反応と感想を集めることを優先して下げた。
  値上げは後からでもできる（既存購入者に影響しない買い切りだから）
- **paywall位置** Day 8。間隔反復が効き目を体感させるのに最低1週間かかるため
- **HSK5以上の人** 正直に「易しすぎる」と伝え、関心の人数だけ数える（メールは取らない）

## paywallの設計（配置済み・テストモードで通し確認済み）

2026年9月、Cloudflareへの配置とStripeの設定を終え、**購入→解放まで通しで動作を確認した**。
いまはStripeサンドボックス（テストモード）。本番切り替えは未実施。

### 実際の設定値

| 項目 | 値 |
|---|---|
| Worker | `https://hsk4-paywall.hsk4test.workers.dev` |
| KV名前空間（`ENTITLEMENTS`） | `1373b4b05d194c43bef4dffefe1b1bdf`（`worker/`と`worker-paywall/`の両方に同じidを設定済み） |
| 価格ID（サンドボックス） | `price_1UCeb2RrROjIBSdfzvdom33y`（加油 HSK4 90日プラン／¥4,800） |
| クーポン（サンドボックス） | `FRIEND2024`（100%オフ・無期限）、`EARLYBIRD`（50%オフ） |

`STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` はsecretとして設定済み（値はここに書かない）。

### 仕組み

- **決済** Stripe Checkout（買い切り、1回払い）
- **権限管理** Firebaseのuidをキーに、Cloudflare KVに購入済みフラグを保存
- **Worker構成** `hsk4-grader`（作文採点）とは別に `worker-paywall/`（`hsk4-paywall`）
  を作った。役目を混ぜない方針（`worker-paywall/README.md` 参照）
- **Day8-90の切り出し** `worker-paywall/build-content.mjs` が `index.html` の
  `LESSONS`/`BANK`/`LISTENING` からDay8-90を `worker-paywall/src/content-bundle.js`
  に分離し、`index.html` にはDay1-7だけを残す。**二重実行すると有料分0件で
  content-bundle.jsを上書きしてDay8-90を消す**事故を起こしたので、いまは
  有料分が0件なら何もせず終了するガードが入っている
- **`hsk4-grader`側の認証も実装済み** Day1-7は誰でも採点できるまま、Day8以降は
  Firebase IDトークン＋`worker-paywall`と同じKV（`ENTITLEMENTS`）で購入済み判定。
  未接続時は安全側でDay8以降を常に403にする（詳細は`worker/README.md`）

### 購入確定は二重化してある（Webhookが単一障害点にならないように）

`POST /webhook`（Stripeからの通知）に加えて、`POST /confirm` がある。

決済後の`success_url`には`session_id={CHECKOUT_SESSION_ID}`が付いており、戻ってきた
アプリが`confirmPurchase()`でそれをWorkerへ渡す。Workerは**Stripeへ直接照会して**
`payment_status === 'paid'` かつ `client_reference_id` がFirebaseで検証済みのuidと
一致する場合だけKVに書く。他人のsession_idを持ち込まれてもuid不一致で弾かれる。

**この経路を足した理由**：決済もイベント発生も成功しているのにWebhookだけ届かず、
購入が永久に反映されない状態になったため。Stripe公式も推奨する二重化で、
どちらか一方でも通れば購入が反映される。

### クーポン

`lockedDayHTML()`の入力欄→`startCheckout()`→`POST /checkout`のbodyの`coupon`→
Stripeの`discounts[0][coupon]`。存在しないコードを入れた場合は400と
「クーポンコードが正しくありません」を返し、アプリはその文言をそのまま表示する
（「決済ページの作成に失敗しました」だと利用者が自分の入力ミスに気づけない）。

### ローカルで決済を試すとき

`/checkout`は、呼び出し元が`localhost`のときだけ戻り先をそのlocalhostにする
（本番の`APP_ORIGIN`はパス`/HSK4`を含むためOriginヘッダーからは復元できない）。
これが無いと、手元で決済しても本番URLへ飛ばされて手元のコードを検証できない。

### KVの確認で引っかかった点

`npx wrangler kv key list` は**結果整合性**で、書き込み直後は空に見える。
一方Workerからの`get`は即座に反映される。listが空なのを見て「購入できていない」と
誤診しかけた。**アプリでDay8が解放されたなら、KVには確実に書かれている**
（`/content`はKVを読んで無ければ403を返すため）。

## 関連

- マネタイズ提案書 https://claude.ai/code/artifact/e520a372-d71f-4e02-9279-b625c8df79b9
- デザイン検討キャンバス https://claude.ai/code/artifact/2ae30fc2-ab00-4dcb-969f-e668beca3ae3
