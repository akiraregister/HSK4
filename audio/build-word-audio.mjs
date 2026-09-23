// 単語・例文・文法例文の読み上げを、端末まかせ（Web Speech）から**録音ファイル**へ移すための生成器。
//
// なぜ要るか：iPhoneで「リスニング問題（MP3）は鳴るのに、単語の読み上げだけ聞こえない」が
// 起きた。onstart も onend も来て、速さの指定どおりに尺まで変わるので**合成はできている**
// のに、音がスピーカーへ届かない。書き方を4通り試しても全滅だったので、アプリ側からは
// 手が出せない。端末の読み上げ設定に左右されないよう、こちらで録音を持つ。
//
//   node audio/build-word-audio.mjs --dry-run              何本作るかだけ見る（鍵は要らない）
//   GOOGLE_TTS_KEY=xxxx node audio/build-word-audio.mjs --words   単語498本だけ（約2〜3MB）
//   GOOGLE_TTS_KEY=xxxx node audio/build-word-audio.mjs           全部（1,207本・12〜16MB）
//
// ・**すでにあるファイルは作り直さない。**途中で止めても、もう一度叩けば続きから進む
// ・ファイル名は中文そのものから決まる（audioKey）。**一覧（manifest）は置かない。**
//   置くと、未購入のDay8-90の例文までURL一覧として公開されてしまう。
//   アプリは手元の中文からファイル名を組み立てて取りにいき、無ければ404で従来の読み上げへ落ちる
// ・**index.html 側の audioKey() と必ず同じ結果にすること。**ずれると全部404になる。
//   tests/listen-test.mjs が両者の一致を見張っている

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = ROOT + 'audio/w/';
const KEY = process.env.GOOGLE_TTS_KEY || '';
const VOICE = process.env.GOOGLE_TTS_VOICE || 'cmn-CN-Wavenet-A';
const DRY = process.argv.includes('--dry-run');
// 例文と文法例文で容量の8割を使うので、単語だけ先に作れるようにしてある。
// あとから足すときも、すでにあるファイルは作り直さないのでそのまま続けられる。
const WORDS_ONLY = process.argv.includes('--words');

// index.html / content-bundle.js と同じ方法でブロックを取り出す
function extractBlock(src, marker, openChar, closeChar) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const open = src.indexOf(openChar, start);
  let depth = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(open, i);
}

// ★ index.html の audioKey() と同じ計算（FNV-1a 32bit / UTF-8バイト列）。
//   片方だけ直すと全滅するので、直すときは必ず両方。
export function audioKey(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// 読み上げる前に落とす印。文法の型の「〜」は目で見るためのもので、音ではない
// （index.html の speakZh() と同じ扱いにすること）
export function sayText(text) {
  return String(text || '').replace(/[〜～／]/g, ' ').replace(/\s+/g, ' ').trim();
}

function collect(lessons) {
  const out = new Map();   // 読み上げる文字列 -> 由来（ログ用）
  const add = (raw, kind) => {
    const say = sayText(raw);
    if (say && !out.has(say)) out.set(say, kind);
  };
  for (const l of lessons) {
    for (const v of (l.vocab || [])) {
      add(v.zh, '単語');
      if (!WORDS_ONLY) add(v.example, '例文');
    }
    if (!WORDS_ONLY) for (const g of (l.grammar || [])) add(g.example, '文法例文');
  }
  return out;
}

// テストから audioKey / sayText だけを読みたいので、直接叩かれたときしか走らせない。
// （読み込むだけで生成が始まったり、鍵が無いと落ちたりすると import できない）
const isMain = process.argv[1] && process.argv[1].endsWith('build-word-audio.mjs');
if (!isMain) {
  // ここから下は生成の本体。import 時は何もしない
} else {

const html = await readFile(ROOT + 'index.html', 'utf8');
const lessons = eval('(' + extractBlock(html, 'const LESSONS=[', '[', ']') + ')');

// Day8-90を切り出したあとでも全部そろうように、あれば content-bundle.js も読む
let paid = [];
const bundlePath = ROOT + 'worker-paywall/src/content-bundle.js';
if (existsSync(bundlePath)) {
  const b = await readFile(bundlePath, 'utf8');
  const blk = extractBlock(b, 'LESSONS', '[', ']');
  if (blk) { try { paid = eval('(' + blk + ')'); } catch (e) { paid = []; } }
}
const all = [...lessons, ...paid];
console.log(`Day数 ${all.length}（index.html ${lessons.length} + content-bundle ${paid.length}）`);

const items = collect(all);
const counts = {};
for (const kind of items.values()) counts[kind] = (counts[kind] || 0) + 1;
console.log('読み上げる文字列', items.size, '本', JSON.stringify(counts));

// ファイル名がぶつかると片方が上書きされ、**別の語の音が鳴る**。必ず止める
const byKey = new Map();
for (const text of items.keys()) {
  const k = audioKey(text);
  if (byKey.has(k)) {
    console.error(`ファイル名が衝突しました: ${k}\n  ${byKey.get(k)}\n  ${text}`);
    console.error('audioKey の作りを変えるか、片方の文字列を変えてください。何も書かずに終わります。');
    process.exit(1);
  }
  byKey.set(k, text);
}
console.log('ファイル名の衝突なし');

await mkdir(OUT, { recursive: true });
const have = new Set((await readdir(OUT).catch(() => [])).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4)));
const todo = [...byKey.entries()].filter(([k]) => !have.has(k));
console.log(`すでにある ${have.size} 本 / これから作る ${todo.length} 本`);

const chars = todo.reduce((a, [, t]) => a + t.length, 0);
console.log(`合成する文字数 ${chars}（Google Cloud TTS の無料枠は WaveNet で月100万字）`);

if (DRY) { console.log('\n--dry-run なのでここで終わります。'); process.exit(0); }
if (!KEY) {
  console.error('\nGOOGLE_TTS_KEY が設定されていません。');
  console.error('  GOOGLE_TTS_KEY=あなたのAPIキー node audio/build-word-audio.mjs');
  process.exit(1);
}
// 案内文のプレースホルダをそのまま貼ってしまう事故が実際に起きた（「ここに鍵」）。
// Google の APIキーは "AIza" で始まる39文字の英数字なので、形だけ見て先に止める。
// 1本目を投げてから 400 が返るより、叩いた瞬間に分かるほうがいい。
if (!/^AIza[0-9A-Za-z_-]{35}$/.test(KEY)) {
  console.error('\nGOOGLE_TTS_KEY がAPIキーの形をしていません。');
  console.error(`  渡された値：${KEY.length}文字${/[^\x20-\x7e]/.test(KEY) ? '（日本語が混ざっています）' : ''}`);
  console.error('  Google の APIキーは "AIza" で始まる39文字です。');
  console.error('  案内文の「ここに鍵」のような置き場所を、実際のキーに置き換えてください。');
  process.exit(1);
}

// アプリが「その録音があるか」を押す前に知るための索引。**中身はハッシュだけ**なので、
// 未購入のDay8-90の中文が漏れることはない（一覧を置かない理由はファイル先頭に書いた）。
// これが無いとアプリは毎回とりあえず取りにいき、無い文字列では404を待ってから
// 読み上げへ落ちる＝押してから声が出るまで待たされる。
async function writeIndex() {
  const keys = (await readdir(OUT).catch(() => []))
    .filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4)).sort();
  await writeFile(OUT + 'index.json', JSON.stringify(keys));
  console.log(`索引を書き出した audio/w/index.json（${keys.length}本）`);
}

async function synth(text, tries = 0) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'cmn-CN', name: VOICE },
      // 速さはアプリ側（playbackRate）で変えるので、ここは等倍のまま作る
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, sampleRateHertz: 24000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 混み合っているときは待って入れ直す。それ以外は黙って進めない
    if ((res.status === 429 || res.status >= 500) && tries < 4) {
      const wait = 2000 * Math.pow(2, tries);
      console.log(`  ${res.status} のため ${wait / 1000}秒待って再試行`);
      await new Promise(r => setTimeout(r, wait));
      return synth(text, tries + 1);
    }
    if (res.status === 400 && /API_KEY_INVALID|API key not valid/.test(body)) {
      throw new Error('APIキーが正しくありません。Google Cloud の「認証情報」で作り直してください');
    }
    if (res.status === 403) {
      throw new Error('APIキーは通りましたが、拒否されました。'
        + 'Cloud Text-to-Speech API が有効になっているか、キーの「APIの制限」に'
        + 'このAPIが入っているかを確認してください');
    }
    throw new Error(`${res.status} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  if (!json.audioContent) throw new Error('audioContent が返ってこない');
  return Buffer.from(json.audioContent, 'base64');
}

let done = 0, bytes = 0;
for (const [key, text] of todo) {
  try {
    const buf = await synth(text);
    await writeFile(OUT + key + '.mp3', buf);
    done++; bytes += buf.length;
    if (done % 25 === 0 || done === todo.length) {
      console.log(`  ${done}/${todo.length}  (${Math.round(bytes / 1024)}KB)`);
    }
  } catch (e) {
    console.error(`失敗: 「${text}」 ${e.message}`);
    console.error(`${done} 本まで書き終えています。直したらもう一度叩けば続きから進みます。`);
    process.exit(1);
  }
}
await writeIndex();
console.log(`\n完了。${done} 本 / ${Math.round(bytes / 1024 / 1024 * 10) / 10}MB`);
console.log('このあと sw.js の CACHE_VERSION を1つ上げて、node tests/run.mjs を通してください。');

}   // isMain
