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
out = replaceBlock(out, listeningBlock, JSON.stringify(fullListening, null, 1));
out = replaceBlock(out, bankBlock, JSON.stringify(fullBank, null, 1));
out = replaceBlock(out, lessonsBlock, JSON.stringify(fullLessons));

await writeFile(ROOT + 'index.html', out);

console.log(`index.html を全90日分に戻した（LESSONS ${fullLessons.length}日 / BANK ${Object.keys(fullBank).length}日 / LISTENING ${Object.keys(fullListening).length}日）`);
console.log('content-bundle.js はそのまま残してある。販売開始時は node worker-paywall/build-content.mjs でDay8-90を切り出し直すこと。');
