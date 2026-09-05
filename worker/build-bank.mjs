// Day1-7分は index.html の BANK から、Day8-90分は worker-paywall/src/content-bundle.js
// （有料コンテンツ、hsk4-paywall Workerが購入済みユーザーにだけ配るもの）から読み、
// 両方をマージしてWorkerが持つ作文データを生成する。
// 手で写すとアプリ側とずれるので、必ずこれで作り直すこと。
//   node worker/build-bank.mjs
import { readFile, writeFile } from 'fs/promises';
import { PAID_CONTENT } from '../worker-paywall/src/content-bundle.js';

const ROOT = new URL('..', import.meta.url).pathname;
const src = await readFile(ROOT + 'index.html', 'utf8');

const start = src.indexOf('const BANK = {');
if (start < 0) throw new Error('index.html に BANK が見つからない');
const open = src.indexOf('{', start);
let depth = 0, i = open, q = null;
for (; i < src.length; i++) {
  const c = src[i];
  if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
  if (c === '"' || c === "'" || c === '`') { q = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const BANK = { ...eval('(' + src.slice(open, i) + ')'), ...PAID_CONTENT.bank };

const out = {};
for (const day of Object.keys(BANK).map(Number).sort((a, b) => a - b)) {
  const b = BANK[day];
  out[day] = {
    vocab: b.vocab,
    grammar: b.grammar,
    writing: b.writing.map(w => ({ prompt: w.prompt, answer: w.answer })),
  };
}
const n = Object.values(out).reduce((s, d) => s + d.writing.length, 0);

await writeFile(ROOT + 'worker/src/writing-bank.js',
  '// 自動生成。手で編集しないこと。作り直しは `node worker/build-bank.mjs`。\n' +
  '// 出典: index.html の BANK（' + Object.keys(out).length + '日 / 作文' + n + '問）\n' +
  'export const WRITING = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(`worker/src/writing-bank.js を生成: ${Object.keys(out).length}日 / 作文${n}問`);
