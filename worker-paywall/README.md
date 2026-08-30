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
| `POST /checkout` | Firebase IDトークン（`Authorization: Bearer ...`） | Stripe Checkout Sessionを作り、決済ページのURLを返す |
| `POST /webhook` | Stripeの署名（`Stripe-Signature`） | 決済完了イベントを受け、KVに購入済みを記録する |
| `GET /entitlement` | Firebase IDトークン | ログイン中ユーザーが購入済みかを `{purchased: true/false}` で返す |
| `GET /content` | （未実装） | Day8-90本体の配信。下記「まだやっていないこと」参照 |

`/checkout` と `/entitlement` はFirebaseの署名付きIDトークンで本人確認する
（Admin SDK無しで、Googleの公開鍵と照合するだけ。詳しくは `src/firebase-verify.js`
の冒頭コメント参照）。uidを直接送らせる方式にはしていない。送らせると、
他人のuidを名乗って購入状態を聞いたり書き換えたりできてしまうため。

## まだやっていないこと（次のフェーズ）

- **`GET /content` の実装** — Day8-90の `LESSONS`/`BANK`/`LISTENING` を
  `index.html` から切り出し、購入済みユーザーにだけこのWorker経由で返す部分。
  現状は501を返すだけ。切り出し方（1本のJSONにまとめるか、Day単位にするか、
  既存のオフライン動作=Service Workerキャッシュとどう共存させるか）を
  詰めてから着手する。
- **`index.html` 側の統合** — ログイン→`/checkout`呼び出し→Stripe決済ページへ遷移
  →戻ってきたら`/entitlement`を確認、という一連の導線がまだ無い。
- **`hsk4-grader`（作文採点）側の認証追加** — 現状は誰でも呼べる。将来は
  こちらのFirebase検証の仕組みを流用し、有料ユーザーのみ・回数制限付きに
  する想定（別タスク）。

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

Stripeダッシュボードで商品（例：「加油 HSK4 90日プラン」）と、買い切り用の
価格（One time、¥7,800など）を作り、価格ID（`price_...`）を控える。
それを `wrangler.toml` の `STRIPE_PRICE_ID` に貼る。

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

`hsk4-paywall.<アカウント名>.workers.dev` のようなURLが出る。Stripeダッシュボードの
「Webhook」設定で、このURLの末尾に `/webhook` を付けたものを登録し、
イベントは `checkout.session.completed` を選ぶ。登録すると署名シークレットが
発行されるので、それを上のステップ3で設定する。

### 5. まずテストモードで確認する

Stripeのテストモード（`sk_test_...` のキー、テスト用カード番号 `4242 4242 4242 4242`）
で一連の流れ（`/checkout` → 決済 → Webhook → `/entitlement`）を確認してから、
本番キーに切り替えること。

## 動作確認（ローカル）

```bash
cd worker-paywall
npx wrangler dev --local --port 8788
```

```bash
# Originが正しくない場合は403
curl -i -X POST http://127.0.0.1:8788/checkout \
  -H "Origin: https://evil.example.com"

# 未ログイン（トークン無し）は401
curl -i -X POST http://127.0.0.1:8788/checkout \
  -H "Origin: https://akiraregister.github.io"
```

Firebase IDトークンを使った疎通確認は、実際にアプリでログインしてから
ブラウザのdevtoolsで `firebase.auth().currentUser.getIdToken()` 相当の値を
取得して試す。
