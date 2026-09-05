# hsk4-grader（作文採点Worker）

Cloudflare Worker。加油アプリのミニテスト・作文問題を、Claude（`claude-sonnet-4-6`）で採点する。

## 直した理由

以前の版は、出題文・模範解答をクライアントから送らせていた。誰でも好きな文章を
`prompt_ja` / `answer_zh` に入れて送れたので、採点サーバーの皮をかぶった無認証の
汎用LLMプロキシになっていた。いまはクライアントから送るのは「何日目の何問目か」
（`day` / `idx`）と「利用者が書いた中文」（`user_zh`）の3つだけ。出題文と模範解答は
`src/writing-bank.js` にこのWorker自身が持っていて、`day`/`idx` から引く。
送りつけられるのは、あらかじめ用意した180問への解答だけになる。

あわせて、許可外のOriginを実際に403で拒否するようにし（前は拒否せずヘッダーを
付け替えるだけだった）、上流のエラー本文をそのまま利用者に返さないようにした。

## ファイル

| ファイル | 中身 |
|---|---|
| `src/index.js` | Worker本体 |
| `src/firebase-verify.js` | FirebaseのIDトークン検証。`worker-paywall/src/firebase-verify.js` と同一内容（各Workerを自己完結させるためコピーしてある） |
| `src/writing-bank.js` | 180問の出題文・模範解答。**自動生成、手で編集しない** |
| `build-bank.mjs` | `../index.html`（Day1-7）と`../worker-paywall/src/content-bundle.js`（Day8-90）から `writing-bank.js` を作り直すスクリプト |
| `wrangler.toml` | Cloudflareへの配置設定 |

## index.html の作文問題を変えたら

`writing-bank.js` を必ず作り直してから配置すること。忘れると、アプリが出す問題と
このWorkerが答え合わせに使う問題がずれる。

```bash
cd worker
node build-bank.mjs     # ../index.html を読んで writing-bank.js を上書きする
npx wrangler deploy
```

## 初めて配置するとき

Cloudflareのアカウントで、パソコンから以下を実行する（`worker/` フォルダの中で）。

```bash
npm install -g wrangler        # 初回のみ
wrangler login                 # ブラウザが開くのでCloudflareにログイン

# APIキーを設定する（このファイル群のどこにも書かれていないので、必ず自分で入力する）
wrangler secret put ANTHROPIC_API_KEY
# → プロンプトが出たらキーを貼ってEnter

wrangler deploy
```

これで `hsk4-grader.hsk4test.workers.dev` が新しいコードに置き換わる。
既存のWorkerと同じ名前（`wrangler.toml` の `name = "hsk4-grader"`）なので、
URLは変わらず、アプリ側の設定も変更不要。

## 回数制限（任意・推奨）

いまは何回でも呼べる。1日あたりの回数を絞りたい場合は、KV（Cloudflareの
小さなデータ保存機能）を1つ作って繋ぐ。

```bash
npx wrangler kv namespace create RATE_LIMIT
```

出てきた `id` を `wrangler.toml` の該当行に貼り、コメントを外す。

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "ここに貼る"
```

そのあと `npx wrangler deploy` すれば、IPごとに1日30回（`src/index.js` の
`DAILY_LIMIT`）を超えると429で断るようになる。KVを繋がなければ、このガードは
素通しになるだけで、他の動作には影響しない。

## Day8以降は購入済みユーザーのみ（実装済み・KV接続が必要）

Day1-7（無料お試し分）はこれまで通り誰でも採点できる。Day8以降は
FirebaseのIDトークン（`Authorization: Bearer ...`）を検証し、`worker-paywall`
が管理する購入済みフラグ（Cloudflare KV）を確認したうえで通す。

`worker-paywall`と**同じKV名前空間**を読むだけなので、新しく作る必要はない。
`worker-paywall/README.md`の手順でKVを作ってあれば、そのidをここにも貼るだけでよい。

```toml
[[kv_namespaces]]
binding = "ENTITLEMENTS"
id = "worker-paywallのwrangler.tomlに書いたのと同じid"
```

このKVを繋がないと、Day8以降の採点は常に403（購入済みユーザーのみと案内）になる
（安全側のデフォルト）。Day1-7の採点には影響しない。

## 動作確認

```bash
cd worker
npx wrangler dev --local --port 8787
```

別ターミナルから：

```bash
# 正しいOriginなら通る（キー未設定だと最後の一歩で500になる。正常）
curl -i -X POST http://127.0.0.1:8787/ \
  -H "Origin: https://akiraregister.github.io" -H "Content-Type: application/json" \
  -d '{"day":3,"idx":0,"user_zh":"我今天很忙。"}'

# 許可外のOriginは403で拒否されるはず
curl -i -X POST http://127.0.0.1:8787/ \
  -H "Origin: https://evil.example.com" -H "Content-Type: application/json" \
  -d '{"day":3,"idx":0,"user_zh":"我今天很忙。"}'

# Day8以降はトークン無しだと403（購入済みユーザーのみと案内）になるはず
curl -i -X POST http://127.0.0.1:8787/ \
  -H "Origin: https://akiraregister.github.io" -H "Content-Type: application/json" \
  -d '{"day":8,"idx":0,"user_zh":"我今天很忙。"}'
```
