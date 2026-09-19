// 改修案と見比べるための「いまの画面」を撮る。
//   node design/capture-current.mjs
// 出力: design/current/*.png（390x844・deviceScaleFactor 2）
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { extname, join, normalize } from 'path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'design', 'current');
const PORT = Number(process.env.PORT || 8833);
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.mp3': 'audio/mpeg' };

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
    const p = join(root, d, 'chrome-linux/chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404).end('not found'); }
});

// 12日完了・復習18問。モック側の数字とそろえてある
function seed() {
  const completed = {}; for (let d = 1; d <= 12; d++) completed[d] = true;
  const srs = {}; const now = Date.now(); let n = 0;
  outer: for (let d = 1; d <= 12; d++) for (let v = 0; v < 5; v++) {
    if (n >= 13) break outer;
    srs[`d${d}-v${v}`] = { ef: 2.5, interval: 6, reps: 2, lapses: 0, last: now - 7 * 864e5, due: now - 864e5 }; n++;
  }
  const bookmarks = {
    'd1-v0': { id:'d1-v0', type:'単語', title:'水平', sub:'shuǐpíng｜レベル、能力水準', day:1, hl:0 },
    'd2-v1': { id:'d2-v1', type:'単語', title:'只好', sub:'zhǐhǎo｜仕方なく〜する', day:2, hl:0 },
  };
  return { completed, answers:{}, scores:{}, bookmarks, dragOrders:{}, levels:{}, srs,
    srsNewLimit:5, srsDueLimit:30, srsDir:'zh2ja', density:'standard', fontScale:'md',
    customWords:[], mockHistory:[], bmSort:'recommend', revScope:'all', examDate:'' };
}

await mkdir(OUT, { recursive: true });
srv.listen(PORT, '127.0.0.1', async () => {
  const b = await chromium.launch({ executablePath: findChromium() });
  const c = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, locale:'ja-JP', reducedMotion:'reduce' });
  const p = await c.newPage();
  await p.addInitScript(st => { try {
    localStorage.setItem('hsk4-90-v4-state', JSON.stringify(st));
    localStorage.setItem('hsk4-onboarded','done');
    localStorage.setItem('hsk4-hl-migrated-v1','1');
  } catch(e){} }, seed());
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await p.waitForTimeout(900);

  const shot = async n => { await p.waitForTimeout(350); await p.screenshot({ path: join(OUT, n + '.png') }); console.log('  ✓', n); };
  await shot('today');
  await p.evaluate(() => window.showDay(13)); await p.waitForTimeout(800); await shot('day');
  await p.evaluate(() => window.showSettings()); await p.waitForTimeout(700); await shot('settings');
  await p.evaluate(() => window.showBookmarks()); await p.waitForTimeout(700); await shot('bookmark');

  // 初回起動（級診断）は別コンテキストで
  const c2 = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'ja-JP' });
  const p2 = await c2.newPage();
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' }); await p2.waitForTimeout(1000);
  await p2.screenshot({ path: join(OUT, 'first-run.png') }); console.log('  ✓ first-run');

  await b.close(); srv.close();
  console.log('出力先:', OUT);
});
