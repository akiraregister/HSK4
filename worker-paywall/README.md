# hsk4-paywall（購入・権限管理Worker）

Cloudflare Worker。加油アプリの買い切り購入（Stripe）と、「このFirebaseユーザーは
購入済みか」の判定を受け持つ。作文採点Worker（`worker/`）とは別の、独立した
Workerとして作った。

## なぜ `worker/`（作文採点）に足さなかったか

`worker/README.md` に書いてある通り、作文採点Workerは一度「出題文をクライアントから
送らせる」設計にしたせいで、無認証の汎用LLMプロキシになってしまった過去がある。
1つのWorkerに役目を増やすほど、影響範囲の見積もりと権限の見直しが難しくなり、
同じ失敗を繰り返しやすい。決済と採点は失敗したときの重大さも違う（決済は
お金が絡む）ので、最初から役目を分けておく。

## ファイル

| ファイル | 中身 |
|---|---|
| `src/index.js` | Worker本体。ルーティングとCORS/Origin制御 |
| `src/firebase-verify.js` | FirebaseのIDトークンをAdmin SDK無しで検証する |
| `src/stripe.js` | StripeのCheckout Session作成とWebhook署名検証 |
| `wrangler.toml` | Cloudflareへの配置設定 |

## エンドポイント

| エンドポイント | 認証 | 内容 |
|---|---|---|
| `POST /checkout` | Firebase IDトークン（`Authorization: Bearer ...`） | Stripe Checkout Sessionを作り、決済ページのURLを返す。bodyの`coupon`でクーポン適用 |
| `POST /webhook` | Stripeの署名（`Stripe-Signature`） | 決済完了イベントを受け、KVに購入済みを記録する |
| `POST /confirm` | Firebase IDトークン | bodyの`session_id`をStripeへ照会し、支払い済みかつ本人のものならKVに購入済みを記録する（Webhookが届かない場合の代替経路） |
| `GET /entitlement` | Firebase IDトークン | ログイン中ユーザーが購入済みかを `{purchased: true/false}` で返す |
| `GET /content` | Firebase IDトークン + 購入済み | Day8-90本体（`src/content-bundle.js`）をそのまま返す |

### なぜ `/confirm` があるか

Webhookだけに頼ると、届かなかったときに購入が永久に反映されない。実際に
「決済も`checkout.session.completed`の発生も成功しているのにWebhookだけ来ない」
状態に遭遇したため、Stripe公式も推奨する二重化を入れた。

`success_url`に`session_id={CHECKOUT_SESSION_ID}`を付けておき、戻ってきたアプリが
それを`/confirm`へ渡す。Workerは**Stripeへ直接問い合わせて**
`payment_status === 'paid'` かつ `client_reference_id` がFirebaseで検証済みのuidと
一致することを確かめてからKVに書く。session_idは推測不可能なうえ、他人のものを
持ち込んでもuidが一致せず弾かれる。

`/checkout` と `/entitlement` はFirebaseの署名付きIDトークンで本人確認する
（Admin SDK無しで、Googleの公開鍵と照合するだけ。詳しくは `src/firebase-verify.js`
の冒頭コメント参照）。uidを直接送らせる方式にはしていない。送らせると、
他人のuidを名乗って購入状態を聞いたり書き換えたりできてしまうため。

## Day8-90の切り出し方（実装済み）

`worker-paywall/build-content.mjs` が `index.html` の `LESSONS`/`BANK`/`LISTENING`
を読み、Day1-7だけを `index.html` に残し、Day8-90を `src/content-bundle.js`
（このWorkerが`GET /content`でそのまま返す）に書き出す。

```bash
node worker-paywall/build-content.mjs
```

`index.html` の学習データ（Day1-7分も含む）を変更したら、必ずこれを実行し直すこと。
実行後は `node tests/run.mjs` を通すこと（テストは `tests/browser.mjs` の
`seedFullContent()` で全90日分をlocalStorageに仕込んで動かしているので、
Workerを配置していなくてもテストは動く）。

`index.html`側は、起動時に `hsk4-paid-content-v1`（localStorage）のキャッシュを
`LESSONS`/`BANK`/`LISTENING` へ復元し（`restorePaidContentCache()`）、
ログイン中ユーザーは `fetchPaidContent()` でこのWorkerの `/content` を呼んで
補充・キャッシュする。購入導線は `startCheckout()`（`/checkout` を呼び、
返ってきたURLへ遷移）。Day8以降でコンテンツが無い場合は `lockedDayHTML()` の
ロック画面を表示する。

Stripeの`success_url`（`?purchase=success&session_id=...`）で戻ってきたときは、
ログイン確認後に`index.html`の`onAuthStateChanged`内で`confirmPurchase(session_id)`
→`fetchPaidContent()`の順に呼び、成功ならトースト表示（9秒。既定の3.6秒だと
決済直後の待ち時間中に出て消え、気づけなかった）のうえ再描画する
（`?purchase=cancel`はURLだけ掃除）。ログインのたびに未購入分が無いか一度だけ
確認もするので、別端末で購入した場合もログインすれば反映される。

## まだやっていないこと（次のフェーズ）

- **Stripeの本番モードへの切り替え** — いまはサンドボックス。`sk_live_...`の
  APIキー、本番のWebhook署名シークレット、本番の価格IDに差し替えて再配置する。
- **Webhookが届かない件の調査** — 上記「既知の問題」参照。`/confirm`があるので
  購入自体は反映されるが、返金・チャージバックを扱うなら必要になる。
- **クーポンの動作確認** — `FRIEND2024`／`EARLYBIRD`は作成済みだが、実際に
  適用した決済はまだ試していない。
- **`worker/build-bank.mjs`との連携** — 作文採点Workerの `writing-bank.js` は
  Day1-7（`index.html`）とDay8-90（`content-bundle.js`）の両方をマージして
  作るように更新済み。`content-bundle.js`を作り直したら、`worker/build-bank.mjs`
  も実行し直すこと。

## 現在の配置状況（2026年9月）

**配置済み・テストモードで通し動作確認済み。**

| 項目 | 値 |
|---|---|
| Worker | `https://hsk4-paywall.hsk4test.workers.dev` |
| KV名前空間 | `1373b4b05d194c43bef4dffefe1b1bdf` |
| 価格ID（サンドボックス） | `price_1UCeb2RrROjIBSdfzvdom33y`（¥4,800） |
| クーポン | `FRIEND2024`（100%オフ・無期限）、`EARLYBIRD`（50%オフ） |
| Stripe環境 | サンドボックス（テストモード）。**本番切り替えは未実施** |

### 既知の問題：Webhookが届かない

決済も`checkout.session.completed`の発生も成功しているのに、`POST /webhook`に
Stripeからの配信が来ない。Worker自体は生きている（署名なしのリクエストには400を返す）。
Stripe CLIで`webhook_endpoints`（v1 API）を使って登録したが、サンドボックスでは
v2の`event_destinations`でないと配信されない可能性がある（未検証）。

`/confirm`が代わりに機能しているため購入は反映される。返金やチャージバックを
扱うようになったらWebhookが要るので、そのときに調べ直すこと。

## 初めて配置するとき

Cloudflareのアカウントで、パソコンから以下を実行する（`worker-paywall/` フォルダの中で）。

```bash
npm install -g wrangler        # 初回のみ（worker/ で入れていれば不要）
wrangler login                 # ブラウザが開くのでCloudflareにログイン
```

### 1. KV名前空間を作る（購入済みフラグの保存先）

```bash
npx wrangler kv namespace create ENTITLEMENTS
```

出てきた `id` を `wrangler.toml` の `[[kv_namespaces]]` の行に貼る。

### 2. Stripeで商品・価格を作る

Stripeダッシュボードの「サンドボックス」環境は画面構成が通常のテストモードと違い、
商品カタログやクーポンのメニューが見つからないことがある。**ワークベンチの「Shell」
タブ**（ブラウザ上でStripe CLIが動く）でコマンドを打つのが確実。実際に使ったのは
これ。商品と価格が同時に作られ、`price_...`が返る。

```
stripe prices create --unit-amount=4800 --currency=jpy -d "product_data[name]=加油 HSK4 90日プラン"
```

返ってきた `"id": "price_..."` を `wrangler.toml` の `STRIPE_PRICE_ID` に貼る。

クーポンも同じくShellから作れる。

```
stripe coupons create -d "id=FRIEND2024" -d "percent_off=100" -d "duration=once"
```

`duration` は `once` / `repeating` / `forever` のいずれか（`limited`などは通らない）。
期限を付ける場合の `redeem_by` は**未来のUNIX時刻**でないと弾かれる。

### 3. StripeのAPIキーとWebhook署名シークレットを設定する

```bash
# Stripeダッシュボード → 開発者 → APIキー のシークレットキー（sk_live_... / sk_test_...）
npx wrangler secret put STRIPE_SECRET_KEY

# Webhookエンドポイントを登録した後に発行される署名シークレット（whsec_...）
# 手順は次のステップと合わせて行う
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

### 4. 配置してURLを確認し、StripeにWebhookを登録する

```bash
npx wrangler deploy
```

`hsk4-paywall.<アカウント名>.workers.dev` のようなURLが出る。Webhookの登録も
Shellから1コマンドでできる（画面のウィザードを辿るより速い）。

```
stripe webhook_endpoints create -d "url=https://hsk4-paywall.hsk4test.workers.dev/webhook" -d "enabled_events[]=checkout.session.completed"
```

返ってきたJSONの `"secret": "whsec_..."` を、ステップ3の `STRIPE_WEBHOOK_SECRET`
に設定する。**この値が返るのは作成時だけ**なので、その場でコピーすること。

### 5. まずテストモードで確認する

テスト用カードは `4242 4242 4242 4242`（有効期限は任意の未来、CVCは任意の3桁）。

購入画面を出すには `build-content.mjs` でDay8以降を切り出しておく必要がある。
確認が済んだら `git checkout -- index.html worker-paywall/src/content-bundle.js`
で元に戻せる。

`/checkout` は呼び出し元が `localhost` のときだけ戻り先をそのlocalhostにするので、
`python3 -m http.server 8000` で開いたページから決済すれば手元に戻ってくる。

**確認できたと判断してよいのは、`localStorage`を消した新しいセッション
（プライベートウインドウを開き直す）でログインしてDay8が解放されたとき。**
`/content` はKVを読んで購入済みでなければ403を返すので、解放されたなら
KVには確実に書かれている。

⚠️ `npx wrangler kv key list` は**結果整合性**で、書き込み直後は空に見える。
これを見て「購入できていない」と誤診しかけた。アプリ側の解放状況で判断すること。

## 動作確認（ローカル）

```bash
cd worker-paywall
npx wrangler dev --local --port 8788
```

```bash
# Originが正しくない場合は403
curl -i -X POST http://127.0.0.1:8788/checkout \
  -H "Origin: https://evil.example.com"

# 未ログイン（トークン無し）でも通る。引き換えコードが返る
curl -i -X POST http://127.0.0.1:8788/checkout \
  -H "Origin: https://akiraregister.github.io" \
  -H "Content-Type: application/json" -d '{}'
```

Firebase IDトークンを使った疎通確認は、実際にアプリでログインしてから
ブラウザのdevtoolsで `firebase.auth().currentUser.getIdToken()` 相当の値を
取得して試す。

---

## ⚠️ 引き換えコード（未配置。配置前に必ず読むこと）

**このコードはまだ配置していない。** Stripeの本物の決済を通した確認ができていないため。

### 何をする変更か

ログインを購入の前提にしないための仕組み（分析のA3）。
**Googleログインは中国からは到達しない**ので、必須にすると買えない人が出る。

- `POST /checkout` を未ログインでも通す。Workerが乱数で引き換えコードを作り、
  Stripeの `client_reference_id` に `claim:<コード>` として埋めて、コードを返す
- アプリは決済へ飛ぶ前にコードを端末（localStorage）へ保存する
- 決済後、アプリが `POST /claim` に `(session_id, コード)` を出す。
  **Stripeへ直接照会して**支払い済みかつ `client_reference_id` が一致したときだけ
  KVに `claim:<コード>` で購入済みを書く
- 以後アプリは `X-Claim` ヘッダーでコードを送れば `/content` を読める
- あとでログインしたら `POST /bind` でuidへ移し替える（端末をまたげるようになる）

**従来の経路（ログイン済み → Authorization → `/confirm`）はそのまま動く。**
アプリ側も、未ログインの `/checkout` が401（＝Workerが古い）なら、
従来どおりログインへ誘導するようになっている。**つまり配置しなくてもアプリは壊れない。**

### 分かっている弱点

- **コードは端末のlocalStorageにだけ入る。** 失うと、ログインして `/bind` するまで
  復元できない。ブラウザのデータを消すと消える
- コードを知っている人は誰でも中身を読める（＝bearerトークン）。
  64桁の乱数なので推測はできないが、人に見せない前提
- 返金・チャージバックでコード側の購入済みを消す処理は無い（uid側にも無い）

### 配置の手順

```bash
cd worker-paywall
npx wrangler deploy
```

配置したら、**Stripeのテストモードで必ず次を通すこと**（ここが未確認）。

1. ログアウトした状態でDay8を開き、価格画面から「購入して全90日を開く」
2. Stripeのテストカード `4242 4242 4242 4242` で決済する
3. アプリに戻って、**ログインしないまま**Day8以降が開けること
4. 設定 → 「購入を復元」が、ログインしていなくても効くこと
5. そのあとGoogleでログインして、**別の端末でもDay8以降が開けること**（`/bind` の確認）
6. 従来どおり「先にログインしてから購入」も通ること（`/confirm` の経路）

### 切り戻し

```bash
cd worker-paywall
npx wrangler rollback            # 直前の版へ戻す
npx wrangler deployments list    # 版の一覧
```

アプリ側は配置を戻すだけでよい（未ログインの `/checkout` が401になれば、
自動的に従来のログイン導線へ落ちる）。
ただし**その時点で引き換えコードだけで使っている人は読めなくなる**ので、
切り戻す前に `/bind` を済ませてもらう必要がある。実質、**利用者が出る前に
確認を終えること。**

### テスト

`node tests/run.mjs paywall` が、偽のStripeとメモリ上のKVでルートの判定を確かめる
（15項目）。**Stripeの本物の決済は通していない**ので、上の手順は省略できない。
