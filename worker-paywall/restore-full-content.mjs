// build-content.mjs の逆操作。まだ告知・販売開始前で「誰が見られてもよい」間だけ、
// Day8-90（worker-paywall/src/content-bundle.js）をindex.htmlへ書き戻し、
// 全90日をその場でまた無料で見られる状態に戻す。
//
// content-bundle.js 自体は消さない。販売を始めるときは、もう一度
// `node worker-paywall/build-content.mjs` を実行すればDay8-90を切り出し直せる
// （このスクリプトはその「巻き戻し」を可能にするためだけに存在する）。
//
//   node worker-paywall/restore-full-content.mjs

import { readFile, writeFile } from 'fs/promises';
import { PAID_CONTENT } from './src/content-bundle.js';

const ROOT = new URL('..', import.meta.url).pathname;

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
// 全90日が入っているあいだは「未購入の単語」が無いので、目録は空に戻す。
const lockedVocabBlock = extractBlock(src, 'const LOCKED_VOCAB = [', '[', ']');

const freeLessons = eval('(' + lessonsBlock.text + ')');
const freeBank = eval('(' + bankBlock.text + ')');
const freeListening = eval('(' + listeningBlock.text + ')');

if (freeLessons.length >= 90) {
  console.log('index.html にはすでに90日分ある。何もしなかった。');
  process.exit(0);
}

const fullLessons = freeLessons.concat(PAID_CONTENT.lessons).sort((a, b) => a.day - b.day);
const fullBank = { ...freeBank, ...PAID_CONTENT.bank };
const fullListening = { ...freeListening, ...PAID_CONTENT.listening };

let out = src;
function replaceBlock(s, block, replacement) {
  return s.slice(0, block.blockStart) + replacement + s.slice(block.blockEnd);
}
// **必ずファイルの後ろのブロックから置換する。** 前を先に置換すると後ろのブロックの
// blockStart/blockEnd がずれ、別の場所へ書き込んでファイルを壊す（build-content.mjs で実際に壊した）。
const blocks = [
  [lockedVocabBlock, '[]'],
  [listeningBlock, JSON.stringify(fullListening, null, 1)],
  [bankBlock, JSON.stringify(fullBank, null, 1)],
  [lessonsBlock, JSON.stringify(fullLessons)],
].sort((a, b) => b[0].blockStart - a[0].blockStart);
for (const [block, text] of blocks) out = replaceBlock(out, block, text);

// 書き出す前に読み直して確かめる。置換順を間違えても目では気づけないため。
const problems = [];
try {
  const l = eval('(' + extractBlock(out, 'const LESSONS=[', '[', ']').text + ')');
  const b2 = eval('(' + extractBlock(out, 'const BANK = {', '{', '}').text + ')');
  const ls = eval('(' + extractBlock(out, 'const LISTENING = {', '{', '}').text + ')');
  const lv = eval('(' + extractBlock(out, 'const LOCKED_VOCAB = [', '[', ']').text + ')');
  if (l.length !== fullLessons.length) problems.push(`LESSONS が ${l.length}日（期待 ${fullLessons.length}日）`);
  if (Object.keys(b2).length !== Object.keys(fullBank).length) problems.push('BANK の日数が合わない');
  if (Object.keys(ls).length !== Object.keys(fullListening).length) problems.push('LISTENING の日数が合わない');
  if (lv.length !== 0) problems.push(`LOCKED_VOCAB が空になっていない（${lv.length}語）`);
} catch (e) { problems.push('置換後の index.html が読み直せない: ' + e.message); }
if (problems.length) {
  console.error('置換の結果がおかしいので書き出さなかった:\n  - ' + problems.join('\n  - '));
  console.error('index.html は元のまま。ブロックの置換順（後ろから）を確認すること。');
  process.exit(1);
}

await writeFile(ROOT + 'index.html', out);

console.log(`index.html を全90日分に戻した（LESSONS ${fullLessons.length}日 / BANK ${Object.keys(fullBank).length}日 / LISTENING ${Object.keys(fullListening).length}日）`);
console.log('未購入の単語の目録（LOCKED_VOCAB）は空に戻した。');
console.log('content-bundle.js はそのまま残してある。販売開始時は node worker-paywall/build-content.mjs でDay8-90を切り出し直すこと。');
