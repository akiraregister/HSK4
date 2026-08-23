// 全スイートを順に実行する。使い方は tests/README.md を参照。
//   node tests/run.mjs            すべて
//   node tests/run.mjs nav track  指定したものだけ
import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8765);
const SUITES = ['nav', 'onboard', 'mock', 'track', 'lp', 'sw'];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// index.html を配るだけの静的サーバー。Service Worker を試すので file:// は使えない。
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});

const run = (name) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(ROOT, 'tests', `${name}-test.mjs`)], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BASE: `http://127.0.0.1:${PORT}/` },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    const passed = (out.match(/^(\d+)\/(\d+) passed/m) || [])[0] || '';
    const fails = out.split('\n').filter((l) => l.startsWith('FAIL'));
    console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 40 - name.length))}`);
    console.log(passed || out.trim().split('\n').slice(-3).join('\n'));
    fails.forEach((l) => console.log('  ' + l));
    resolve(code === 0 && fails.length === 0);
  });
});

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
server.listen(PORT, '127.0.0.1', async () => {
  const results = [];
  for (const s of wanted) {
    if (!SUITES.includes(s)) { console.log(`skip: 不明なスイート ${s}`); continue; }
    results.push([s, await run(s)]);
  }
  server.close();
  const bad = results.filter(([, ok]) => !ok);
  console.log('\n' + '═'.repeat(46));
  console.log(bad.length ? `失敗: ${bad.map(([s]) => s).join(', ')}` : `すべて通過 (${results.length}スイート)`);
  process.exit(bad.length ? 1 : 0);
});
