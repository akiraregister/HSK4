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
// 単語タブに全498語を出して未購入分に🔒を付けるための目録（分析のA5）。
// 中文とDay番号だけを残す。拼音と和訳は入れない＝教材の厚みは見せるが中身は渡さない。
const lockedVocabBlock = extractBlock(src, 'const LOCKED_VOCAB = [', '[', ']');

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
// **必ずファイルの後ろのブロックから置換する。** 前を先に置換すると、後ろのブロックの
// blockStart/blockEnd がずれ、まったく別の場所へ書き込んでファイルを壊す（実際に壊した）。
// ファイル内の並びは LESSONS → BANK → LISTENING → LOCKED_VOCAB なので、この順の逆で置換する。
const lockedVocab = [];
for (const l of lessonsSplit.paid) for (const v of (l.vocab || [])) lockedVocab.push({ zh: v.zh, day: l.day });

const blocks = [
  [lockedVocabBlock, JSON.stringify(lockedVocab)],
  [listeningBlock, JSON.stringify(listeningSplit.free, null, 1)],
  [bankBlock, JSON.stringify(bankSplit.free, null, 1)],
  [lessonsBlock, JSON.stringify(lessonsSplit.free)],
].sort((a, b) => b[0].blockStart - a[0].blockStart);   // 後ろから順に
for (const [block, text] of blocks) out = replaceBlock(out, block, text);

// 書き出す前に、壊れていないことを確かめる。上の順番を間違えると黙って別の場所へ
// 書き込むので、目で気づけない。4つのブロックが読み直せて、中身が期待どおりかを見る。
function verify(text) {
  const problems = [];
  let l, b, ls, lv;
  try {
    l = eval('(' + extractBlock(text, 'const LESSONS=[', '[', ']').text + ')');
    b = eval('(' + extractBlock(text, 'const BANK = {', '{', '}').text + ')');
    ls = eval('(' + extractBlock(text, 'const LISTENING = {', '{', '}').text + ')');
    lv = eval('(' + extractBlock(text, 'const LOCKED_VOCAB = [', '[', ']').text + ')');
  } catch (e) {
    return ['置換後の index.html が読み直せない（別の場所へ書き込んで壊れている）: ' + e.message];
  }
  if (l.length !== lessonsSplit.free.length) problems.push(`LESSONS が ${l.length}日（期待 ${lessonsSplit.free.length}日）`);
  if (Object.keys(b).length !== Object.keys(bankSplit.free).length) problems.push('BANK の日数が合わない');
  if (Object.keys(ls).length !== Object.keys(listeningSplit.free).length) problems.push('LISTENING の日数が合わない');
  if (lv.length !== lockedVocab.length) problems.push(`LOCKED_VOCAB が ${lv.length}語（期待 ${lockedVocab.length}語）`);
  if (lv.some(v => v.pinyin || v.ja)) problems.push('LOCKED_VOCAB に拼音か和訳が混ざっている（中文とDayだけにすること）');
  return problems;
}
const problems = verify(out);
if (problems.length) {
  console.error('置換の結果がおかしいので書き出さなかった:\n  - ' + problems.join('\n  - '));
  console.error('index.html は元のまま。ブロックの置換順（後ろから）を確認すること。');
  process.exit(1);
}

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
console.log(`index.html: 未購入分の単語の目録を ${lockedVocab.length} 語ぶん残した（中文とDayだけ。拼音・和訳は入れていない）`);
console.log(`content-bundle.js: Day${FREE_DAYS + 1}-90を書き出した（LESSONS ${lessonsSplit.paid.length}日 / BANK ${Object.keys(bankSplit.paid).length}日 / LISTENING ${Object.keys(listeningSplit.paid).length}日）`);
