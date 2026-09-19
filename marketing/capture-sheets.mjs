// 版下HTMLから画像を書き出す。
//   node marketing/capture-sheets.mjs            すべて
//   node marketing/capture-sheets.mjs appstore   App Storeの6枚だけ
//   node marketing/capture-sheets.mjs lp         LPモックアップだけ
// 先に marketing/capture-app.mjs でアプリ画面を撮っておくこと。
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { extname, join, normalize } from 'path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8801);
const BASE = `http://127.0.0.1:${PORT}/`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter(d => d.startsWith('chromium-')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});

const want = process.argv.slice(2);
const doAppStore = !want.length || want.includes('appstore');
const doLp = !want.length || want.includes('lp');

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await chromium.launch({ executablePath: findChromium() });

  if (doAppStore) {
    const out = join(ROOT, 'marketing', 'appstore', 'out');
    await mkdir(out, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(BASE + 'marketing/appstore/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const ids = await page.$$eval('.sheet', els => els.map(e => e.id));
    console.log('App Store:');
    for (const id of ids) {
      const el = await page.$('#' + id);
      const name = id.replace('sheet-', '');
      await el.screenshot({ path: join(out, `${name}.png`) });
      console.log('  ✓', `${name}.png`);
    }
    await ctx.close();
  }

  if (doLp) {
    const out = join(ROOT, 'marketing', 'lp-mockup', 'out');
    await mkdir(out, { recursive: true });
    // スマホ幅（実際の読まれ方）とデスクトップ幅の両方を残す
    for (const [name, width, height] of [['lp-mobile', 390, 844], ['lp-desktop', 1280, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(BASE + 'marketing/lp-mockup/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      console.log('  ✓', `${name}.png`);
      await ctx.close();
    }
  }

  await browser.close();
  server.close();
});
