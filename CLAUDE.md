# 加油（HSK4学習アプリ）

HSK4級を90日で目指す、日本語話者向けの学習アプリ。GitHub Pages で公開している。

**このリポジトリでの会話は日本語で応答すること。**

- 本体 https://akiraregister.github.io/HSK4/
- LP　 https://akiraregister.github.io/HSK4/lp/

## Day8以降を自分で試したいとき

**いまは何もしなくても全90日使えます。** 未告知のあいだ `restore-full-content.mjs` で
Day8-90を`index.html`に書き戻してあるので、paywallのコードは休眠中。ログインも購入も不要。

そのぶん**価格画面と無料の区切りは普段は一度も出ない**ので、確認用のスイッチを用意してある。
- **見る**：URLに `?paywall=1` を付ける（設定 → その他 → 「paywallのプレビュー」でも切替）
- **戻す**：URLに `?paywall=0`、またはトグルを「切」に
- 学習データは消えない。切ればすぐ全90日に戻る

販売開始時に `build-content.mjs` でDay8-90を切り出せば、このスイッチに関係なく
本来の判定（`LESSONS`にその日があるか）が効く。

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
**案A（一画面一動作）はフェーズ0〜7まで全部実装済み。**
粗取り／アイコン一式／デザイントークン／下タブ化と細いヘッダー／今日画面／
Day学習の4ステップ化／完了画面／設定の4グループ化と「購入を復元」。
次に進むなら案C（価格画面・無料の区切り・全498語の開示）。
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
| `tools/speech-check.html` | **単語・例文の読み上げが鳴らないときの調査ページ**。端末の状態（standalone起動か・中国語の声があるか）を出し、`audio/day1.mp3` と `SpeechSynthesis` を並べて試して切り分ける。**MP3は鳴るのに読み上げだけ鳴らなければ、音量の問題ではなく読み上げ機能の問題**。`.../HSK4/tools/speech-check.html` で開く |
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
| 364-445行目付近 | **起動スプラッシュ**（`#splash`）。火が点く→フレア（ぐっと立ち上がる）→しなりながら明滅→退場。全体で約3.5秒。**長さの出どころは `--sp-life` の1か所**（`splash-out` の遅延＋長さと同じ値。JSはこれを読む） |
| 450-490行目付近 | **初回案内**（`.intro`）。3つの訴求を1つずつ順番に見せる。状態クラスは `intro-on`／`intro-done`（素の `.done` は完了画面のもので `text-align:center` が付くため、接頭辞が要る） |
| 320-430行目 | Firebase（遅延読み込み。落ちてもアプリ本体は動く） |
| 中盤 | `track()` / 背面シェイプ / 各画面の `render*()` |
| 終盤 | SRS（SM-2）、模擬試験、級診断、マイ単語 |
| 最終行付近 | 初回起動の判定（**ここでないと動かない。理由は下記**） |

## 触るときの注意

**画面状態は `currentView` 1つ。** 以前は5つの真偽値を各遷移関数が手で書き換えており、
1つ書き忘れると二重表示になっていた。遷移は必ず `goView()` を通すこと。
値は `today` / `day` / `done` / `bookmark` / `vocab` / `settings` / `review` / `mock` / `levelcheck`。

**宣言順に注意。** モジュール1本なので `const` の一時的死角を踏みやすい。実際に2回踏んだ。
- 初回起動の判定は `PLACEMENT_QUESTIONS` などの定義後でないと動かないので**モジュール末尾**にある
- `try/catch` で囲った関数が定義前の `const` を読むと、例外が握りつぶされて**黙って誤動作する**

**`#settingsPanel` は常時DOMにある。** Firebase 側が `loginBtn` などのIDを直接引くため、
再描画で作り直さず、表示だけ切り替えている。セレクタを書くときは `#content` に限定しないと
別画面のボタンに当たる。
- 設定は4グループ（アカウント／学習／表示／その他）。**アカウントだけは静的な markup 側**に
  ある（同期バーを動かせないため）。`renderSettings()` はそこへ `#setAccountExtra` 経由で
  「購入を復元」だけを足し、残り3グループを `#settingsBody` に描く

**`LESSONS.length` は「今読み込めている日数」であって「全90日」ではない。** Day8-90は
未購入だと存在しないので、カリキュラム全体の日数が要る場所（進捗%、Day一覧、
`setDay()`のクランプ等）は必ず`TOTAL_DAYS`（固定90）を使うこと。`LESSONS.length`を
使っていいのは「今読み込めている中から探す」場面（`cwLookupApp`等）だけ。

**ブックマークはオブジェクトで格納する。** `state.bookmarks[id] = true` ではなく
`toggleBookmark()` と同じ `{id, type, title, sub, day, pinyin, example, ...}` の形。
真偽値を入れると一覧が `b.id.match` で落ちる。

**連続日数は `state.completedAt` から出す。** `state.completed` は `{day:true}` しか持たず、
「いつ終えたか」を持っていなかったので、`completedAt`（Day番号 → 完了時刻ms）を足した。
- **記録を始める前に完了したDayは日時を持たない。** 過去の完了日は復元できないので、
  連続日数は実質「記録を入れた日からの数」になる（2026年9月にAの方針で決定）
- `state.srs[id].last` では代用できない。あれは「復習カードをめくった時刻」で、
  Dayを完了しただけで復習を開いていない人にはエントリ自体が無い
- **`state` に新しいフィールドを足したら `normalizeStateForCloud()` にも足すこと。**
  あそこは列挙式なので、書き忘れるとFirebase同期のたびに消える。
  `tests/nav-test.mjs` がこれを見張っている

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
- **使えるウェイトは決まっている。** 和文 Noto Serif JP は **400/500/600/700**、
  中文 Noto Serif SC は **400/500/600** しか読み込んでいない。これ以外（800・900）を
  指定すると**ブラウザが太らせて偽装し、明朝は横画が細いので字がつぶれる**。
  保険として `body` に `font-synthesis:none` を入れ、`tests/nav-test.mjs` でも
  「宣言されていないウェイトを使っていないか」を見張っている
- **中文の要素を和文の一覧に入れないこと。** `.zh` `.vrow-zh` `.ex` `.cw-ex` `.testq` `.lc-q` は
  `--zh-font`。和文書体（`--font-display` / `--font-body`）の一覧は**後ろにあって詳細度が同じ**
  なので、そこへ中文の要素を足すと後勝ちで上書きされる。和文書体には簡体字だけの字
  （请・说・这 等）が無いため、1つの文の中で字ごとに別の書体へ落ちて字面が崩れる
  （実際にこれで崩れた）。逆に「例文：」のような日本語ラベルが `.ex` の中に入る場合は
  `.label` のように和文側へ明示的に戻すこと

**聞きとりは止められる・戻せる・速さを変えられる。** 以前は「音声はこの1回のみ」で
一時停止も巻き戻しもできなかったが、実機で使って**練習では聞き直せたほうが身につく**
と判断して操作を付けた（2026年9月）。本番が1回きりであることは文言で伝えている。
- **画面やステップを離れるときは必ず `lsStopAudio()` を呼ぶ。** 呼び忘れると
  **聞くステップを抜けても音声だけ鳴り続ける**（実際にそうなっていた）。
  いまは `goView()` `setDay()` `dayNext()` `dayPrev()` から呼んでいる
- 止めるだけで捨てないので、聞くステップへ戻れば「再開する」で続きから聞ける。
  ボタンの文言と波の動きは `lsSyncToggle()` が音声の状態から作る（自前で持たない）
- **速さは `localStorage` の `hsk4-ls-rate`。** `state` に入れると
  `normalizeStateForCloud()` の列挙にも足す必要が出て、書き忘れると同期のたびに消える
- **`preservesPitch` を明示する。** 遅くしたときに声の高さが下がると別人の声に
  聞こえて練習にならない
- `tests/listen-test.mjs` が見張っている。**音声そのものは偽物に差し替えてある**
  （PlaywrightのChromiumはMP3デコーダを積んでいないことがあり、本物だと環境依存で
  落ちる。確かめたいのは再生の可否ではなく、ボタンと音声の状態が食い違わないこと）

**単語・例文の読み上げは「録音」ではない。** リスニング問題（`audio/dayN.mp3`）は
Google Cloud TTSで作った録音ファイルだが、**単語カード・例文・文法の例文・復習カード・
ブックマーク・マイ単語の読み上げは、端末の読み上げ機能（Web Speech）にその場で
喋らせている**（`speakZh()`）。しくみが違うので、片方だけ鳴らないことがある。
- **iPhoneの消音スイッチで黙る。**録音ファイル（MP3）は消音でも鳴るのに、
  **読み上げだけ消音スイッチに従う**。経路が違うため。2026年9月に実機で
  「MP3は鳴るが読み上げは聞こえない」が起き、これが原因だった
- **`onstart` も `onend` も、音が出た証拠にはならない。**消音で黙らされていても
  iOSは普通に両方返してくる。**機械には「鳴ったか」は分からない**ので、
  `tools/speech-check.html` は最後に人へ「聞こえましたか」と尋ねる作りにしてある
  （最初は onstart で判定していて、**聞こえていないのに「鳴っています」と誤判定した**）
- ホーム画面から起動したPWA（`manifest.json` は `display:standalone`）で鳴らない
  報告もある。鳴らなかったときは `tools/speech-check.html` をiPhoneで開いて切り分けること
- **speak() の直前に無条件で `cancel()` を呼ばない。**iOSでは cancel した直後の speak が
  声を出さないまま終わることがあり、**最初の1回でこれをやると以後ずっと鳴らない端末**に
  なる。いまは鳴っている最中だけ cancel し、80ms おいてから喋る
- **`getVoices()` はiOSでは最初は空。**押されるたびに引き直し、`zh-CN`／`Hans` を優先する
  （`zh-TW`・`zh-HK` は発音が別物）
- **鳴らなかったら黙らない。**`onstart` も `onerror` も来ないまま終わるのがiOSの壊れ方
  なので、1.4秒の時間切れで気づいて1度だけトーストを出す。押しても無反応が一番困る
- **速さは聞きとりと同じ設定（`hsk4-ls-rate`）を使う。**設定が2つあるように見せない
- **読み上げボタンは罫で囲ってある。**以前は `--muted` の18pxで明朝の紙面に溶けており、
  **実機で「単語の音声は無いのか」と聞かれた＝存在に気づかれていなかった**
- 単語タブの一覧には読み上げが無い（行そのものがDayへ飛ぶボタンなので、押し分けが要る）

**固定バーは不透明にする。ぼかしは掛けない。** 以前は `.top` `.tabbar` `.bottomnav` が
半透明＋`backdrop-filter:blur(14px)` で、**スクロール中に下の中身が透けて毎フレーム
引き直され、ロゴと文字がにじんでいた**（実機で指摘された）。案Xはもともと罫で階層を
作る方針なので、ガラス効果は要らない。あわせて `html` と `body` に
`overscroll-behavior-y:none` を入れ、iOSの「引っぱると跳ね返る」を止めた
（**`html` 側にも書くこと。**scrollingElement は html なので、body だけでは効かない）。
`tests/listen-test.mjs` の最後がこの2つを見張っている。

**起動アニメーションは2つある。** 毎回出る**スプラッシュ**（`#splash`）と、初回だけ出る
**案内**（`.intro` → `currentView==='intro'`）。案内のあとに級診断へ渡す。
- **長さの出どころは `--sp-life`（ミリ秒）の1か所だけ。** `#splash` に書いてあり、
  `splash-out` の「遅延＋長さ」と同じ値。`dismissSplash()` はこの変数を読んでDOMから外す。
  以前はCSSとJSに数字が2つあり、片方だけ動かすと「まだ見えているのに消える」
  「消えたあとも居座る」のどちらかになった。**JSに数字を戻さないこと**
- **炎まわりは「1つの要素に1つの transform」で組む。** 同じ要素に transform を使う
  アニメーションを2本並べると、`both` で埋めるぶん**後ろの1本が最初から勝って
  前の1本が効かない**。いまは svg＝点火とフレア、`<g>`＝しなり、`<path>`＝芯の上下、
  足元の罫は別要素（中に入れると地面まで一緒にしなって浮いて見える）
- **炎の灯り（`drop-shadow`）は案Xの「影ゼロ」から外した唯一の例外。**
  `--sh` は `none` のまま。灯りは `box-shadow` ではなく `filter:drop-shadow`。
  **`clip-path` と同じ要素に置いてはいけない。**SVGは「filter → clip」の順に適用するので、
  滲み出た光がそのまま切り落とされて**何も光らない**（最初これで、灯りがまったく
  出ていなかった）。いまは svg 側に掛けている。**必ず0へ戻して、止まった影を残さない**
- **案内はスプラッシュの裏では始めない。** スプラッシュが3.5秒あるので、そのまま流すと
  1つ目の訴求が裏で終わってしまう。`onSplashGone()` が消えた合図で `introSequence()` を
  呼び直す（タップで早く消した場合も同じ経路を通る）
- **`prefers-reduced-motion` では灯りも出さない。** 明滅しない影だけが残ると、
  案Xから外れる理由がなくなる。案内も3つとも開いた状態で出す
- **案内の状態クラスは `intro-on` / `intro-done`。** 素の `.done` は完了画面のもので
  `text-align:center` が付くため、そのまま使うと畳んだ見出しが中央寄せになる（実際になった）
- **案内から離れるときは `goView()` がタイマーを止める。** 順番に見せるのは `setTimeout` なので、
  止めないと外れた要素を触り続ける
- 画面のどこかをタップして先送りする仕掛けは**あえて付けていない**。出口は「はじめる」
  ひとつに絞ったほうが迷わない

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
node tests/run.mjs        # 全234項目＋Service Workerチェック（8スイート）
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
- **切り出しでは `LOCKED_VOCAB` も埋める。** 単語タブに全498語を出して未購入分に🔒を
  付けるための目録で、**中文とDay番号だけ**（拼音と和訳は入れない＝厚みは見せるが中身は渡さない）。
  `restore-full-content.mjs` は空に戻す
- **ブロックの置換は必ずファイルの後ろから。** `index.html` 内の並びは
  `LESSONS` → `BANK` → `LISTENING` → `LOCKED_VOCAB`。前から置換すると後ろのブロックの
  オフセットがずれ、**まったく別の場所へ書き込んでファイルを壊す**（実際に壊した）。
  いまは両スクリプトとも `blockStart` で降順に並べ替えてから置換し、
  **書き出す前に読み直して件数を検算する**（合わなければ書かずに終了コード1）
- **`hsk4-grader`側の認証も実装済み** Day1-7は誰でも採点できるまま、Day8以降は
  Firebase IDトークン＋`worker-paywall`と同じKV（`ENTITLEMENTS`）で購入済み判定。
  未接続時は安全側でDay8以降を常に403にする（詳細は`worker/README.md`）

### ⚠️ 引き換えコード（未配置）

**ログインを購入の前提にしない仕組みを実装したが、まだ配置していない。**
Stripeの本物の決済を通した確認ができていないため。詳細と配置手順・切り戻しは
`worker-paywall/README.md` の「引き換えコード」を読むこと。

- 未ログインで `/checkout` を叩くとWorkerが引き換えコードを発行し、`/claim` で確定、
  以後 `X-Claim` ヘッダーで `/content` を読める。ログインしたら `/bind` でuidへ移す
- **従来の経路（ログイン → `/confirm`）はそのまま動く。**アプリ側も、未ログインの
  `/checkout` が401（＝Workerが古い）なら従来のログイン導線へ落ちる。
  **配置しなくてもアプリは壊れない**
- `node tests/run.mjs paywall` が偽のStripeでルートの判定だけ確かめている（15項目）

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
