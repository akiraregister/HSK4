// index.html の LESSONS/BANK/LISTENING を Day1-7（無料）とDay8-90（有料）に分割する。
//
// ・Day1-7はそのまま index.html に残す（無料お試し分）
// ・Day8-90は index.html から取り除き、worker-paywall/src/content-bundle.js に移す
//   （購入済みユーザーにだけ GET /content 経由で配る）
//
// 実行後は必ず `node tests/run.mjs` を通すこと。
//   node worker-paywall/build-content.mjs

import { readFile, writeFile } from 'fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const FREE_DAYS = 7;

function extractBlock(src, marker, openChar, closeChar) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('index.html に見つからない: ' + marker);
  const open = src.indexOf(openChar, start);
  let depth = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) { depth--; if (depth === 0) { i++; break; } }
  }
  return { text: src.slice(open, i), blockStart: open, blockEnd: i };
}

const src = await readFile(ROOT + 'index.html', 'utf8');

const lessonsBlock = extractBlock(src, 'const LESSONS=[', '[', ']');
const bankBlock = extractBlock(src, 'const BANK = {', '{', '}');
const listeningBlock = extractBlock(src, 'const LISTENING = {', '{', '}');

// BANKはJSオブジェクトリテラル（キー未クォート・シングルクォート混在）でJSONではないため、
// このファイル自身が信頼できるソースであることを前提にevalで読む（worker/build-bank.mjsと同じ手法）。
const LESSONS = eval('(' + lessonsBlock.text + ')');
const BANK = eval('(' + bankBlock.text + ')');
const LISTENING = eval('(' + listeningBlock.text + ')');

function splitByDay(obj, isArray) {
  const free = isArray ? [] : {};
  const paid = isArray ? [] : {};
  if (isArray) {
    for (const item of obj) (item.day <= FREE_DAYS ? free : paid).push(item);
  } else {
    for (const key of Object.keys(obj)) (Number(key) <= FREE_DAYS ? free : paid)[key] = obj[key];
  }
  return { free, paid };
}

const lessonsSplit = splitByDay(LESSONS, true);
const bankSplit = splitByDay(BANK, false);
const listeningSplit = splitByDay(LISTENING, false);

// 二重実行の防止。切り出し済みのindex.htmlをもう一度食わせると、有料分が
// 0件のままcontent-bundle.jsを上書きしてDay8-90を消してしまう（実際に起きた）。
if (lessonsSplit.paid.length === 0) {
  console.log(`index.html に Day${FREE_DAYS + 1} 以降が無い。すでに切り出し済みなので何もしなかった。`);
  console.log('全90日に戻すには node worker-paywall/restore-full-content.mjs');
  process.exit(0);
}

// index.html を書き換える。後ろのブロックから置換して、前のブロックのオフセットを壊さないようにする。
let out = src;
function replaceBlock(s, block, replacement) {
  return s.slice(0, block.blockStart) + replacement + s.slice(block.blockEnd);
}
out = replaceBlock(out, listeningBlock, JSON.stringify(listeningSplit.free, null, 1));
out = replaceBlock(out, bankBlock, JSON.stringify(bankSplit.free, null, 1));
out = replaceBlock(out, lessonsBlock, JSON.stringify(lessonsSplit.free));

await writeFile(ROOT + 'index.html', out);

const bundleOut = {
  lessons: lessonsSplit.paid,
  bank: bankSplit.paid,
  listening: listeningSplit.paid,
};
await writeFile(ROOT + 'worker-paywall/src/content-bundle.js',
  '// 自動生成。手で編集しないこと。作り直しは `node worker-paywall/build-content.mjs`。\n'
  + '// 出典: index.html の LESSONS/BANK/LISTENING（Day' + (FREE_DAYS + 1) + '-90ぶん）\n'
  + '// GET /content で購入済みユーザーにだけ返す。\n'
  + 'export const PAID_CONTENT = ' + JSON.stringify(bundleOut, null, 1) + ';\n');

console.log(`index.html: Day1-${FREE_DAYS}のみ残した（LESSONS ${lessonsSplit.free.length}日 / BANK ${Object.keys(bankSplit.free).length}日 / LISTENING ${Object.keys(listeningSplit.free).length}日）`);
console.log(`content-bundle.js: Day${FREE_DAYS + 1}-90を書き出した（LESSONS ${lessonsSplit.paid.length}日 / BANK ${Object.keys(bankSplit.paid).length}日 / LISTENING ${Object.keys(listeningSplit.paid).length}日）`);
