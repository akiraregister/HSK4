// アプリアイコン（案X・O7「二段の炎」）を1か所から書き出す。
//   node assets/build-icons.mjs
// 出力: assets/icon.svg / icon-maskable.svg / icon-192.png / icon-512.png
//       icon-512-maskable.png / apple-touch-icon-180.png
//
// 形と色は design/icons-flame3.html の O7 と同じ。あちらは比較用のモックなので、
// 配布物はこちらを正とする。色や形を変えるときは下の定数だけ触ること。
//
// PNGはChromiumでSVGを撮って作る（ラスタライザを別途入れずに済ませるため。
// marketing/capture-sheets.mjs と同じ流儀）。
import { writeFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const OUT = new URL('.', import.meta.url).pathname;

// ── 案Xの色 ───────────────────────────────────────────────
const PAPER = '#F6F2E6';  // 生成り（地）
const INK   = '#15150F';  // 墨（下の罫）
const YAMA  = '#E5A500';  // 山吹（炎の上段）
const KAKI  = '#DC6011';  // 柿（炎の下段。UIのアクセント色と同じ）

// 炎の輪郭。viewBox 0 0 100 100
const FLAME = 'M52 8 C 62 31, 79 43, 79 64 A 29 29 0 1 1 21 64 '
            + 'C 21 46, 33 41, 41 29 C 44 41, 50 45, 50 37 C 50 27, 47 17, 52 8 Z';
// 上段と下段の境目。炎に沿わせた曲線（グラデーションは使わない＝印刷の体裁を保つ）
const SPLIT = 'M0 52 C 18 64, 34 48, 52 56 C 70 64, 84 50, 100 58 L100 100 L0 100 Z';

// maskable は中央80%（半径40の円）しか必ず見える保証がないので、
// 地はそのままに中身だけ縮める。0.8 なら罫の下端（y=90）も安全圏に入る。
const SAFE = 0.8;

function svg({ maskable = false } = {}) {
  const id = maskable ? 'fm' : 'f';
  const inner =
    `<g clip-path="url(#${id})">`
    + `<rect width="100" height="100" fill="${YAMA}"/>`
    + `<path d="${SPLIT}" fill="${KAKI}"/>`
    + `</g>`
    + `<rect x="28" y="88" width="44" height="2" fill="${INK}"/>`;
  const body = maskable
    ? `<g transform="translate(50 50) scale(${SAFE}) translate(-50 -50)">${inner}</g>`
    : inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" `
       + `role="img" aria-label="加油">\n`
       + `<defs><clipPath id="${id}"><path d="${FLAME}"/></clipPath></defs>\n`
       + `<rect width="100" height="100" fill="${PAPER}"/>\n`
       + body + `\n</svg>\n`;
}

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

const PNGS = [
  { file: 'icon-192.png',            size: 192, maskable: false },
  { file: 'icon-512.png',            size: 512, maskable: false },
  { file: 'apple-touch-icon-180.png', size: 180, maskable: false },
  { file: 'icon-512-maskable.png',   size: 512, maskable: true  },
];

const plain = svg();
const masked = svg({ maskable: true });
await writeFile(join(OUT, 'icon.svg'), plain);
await writeFile(join(OUT, 'icon-maskable.svg'), masked);
console.log('icon.svg / icon-maskable.svg');

const browser = await chromium.launch({ executablePath: findChromium() });
for (const { file, size, maskable } of PNGS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const markup = (maskable ? masked : plain).replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<!doctype html><meta charset="utf-8">`
    + `<style>html,body{margin:0;padding:0;background:${PAPER}}svg{display:block}</style>${markup}`);
  await page.screenshot({ path: join(OUT, file), type: 'png' });
  await page.close();
  console.log(`${file}  ${size}x${size}${maskable ? '  (maskable)' : ''}`);
}
await browser.close();
