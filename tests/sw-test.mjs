import { launch } from './browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';

const browser = await launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE, { waitUntil: 'load' });

// wait for the SW to activate
await page.waitForFunction(
  () => navigator.serviceWorker.controller !== null ||
        (navigator.serviceWorker.ready && true),
  null, { timeout: 20000 }
);
await page.evaluate(() => navigator.serviceWorker.ready);

// give install/precache a moment to settle
await page.waitForFunction(async () => {
  const keys = await caches.keys();
  if (!keys.length) return false;
  const c = await caches.open(keys[0]);
  return (await c.keys()).length > 0;
}, null, { timeout: 20000 }).catch(() => {});

const report = await page.evaluate(async () => {
  const keys = await caches.keys();
  const out = {};
  for (const k of keys) {
    const c = await caches.open(k);
    out[k] = (await c.keys()).map(r => new URL(r.url).pathname).sort();
  }
  return out;
});

console.log('--- Cache Storage ---');
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}  (${v.length} entries)`);
  v.forEach(p => console.log('   ' + p));
}

// offline reload
await ctx.setOffline(true);
let offlineOK = false, title = '';
try {
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  title = await page.title();
  offlineOK = await page.evaluate(() => !!document.querySelector('.nav-tabs'));
} catch (e) {
  console.log('offline reload threw: ' + e.message.split('\n')[0]);
}
console.log('--- Offline reload ---');
console.log('title   :', title);
console.log('nav rendered:', offlineOK);
console.log('console errors:', errs.length ? errs.slice(0, 5) : 'none');

await browser.close();
