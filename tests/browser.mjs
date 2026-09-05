// Chromium の在り処を1か所に集める。
// 優先順： $CHROMIUM → この環境の /opt/pw-browsers → Playwright 自前のもの。
// これで「Playwright が自分で入れた環境」でも「用意済みの環境」でも同じテストが動く。
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PAID_CONTENT } from '../worker-paywall/src/content-bundle.js';

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;                       // Playwright に任せる
}

export const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
export const launch = (opts = {}) =>
  chromium.launch({ executablePath: findChromium(), ...opts });

// index.html はDay1-7しか持たない（Day8-90は購入済みユーザーにだけhsk4-paywall
// Workerが配る）。既存のテストは全90日分の内容を前提にしているので、ページ読み込み
// より前にDay8-90を「取得済みキャッシュ」としてlocalStorageへ仕込み、アプリ起動時の
// 復元処理（index.html内 restorePaidContentCache）に全90日分を復元させる。
export async function seedFullContent(page) {
  await page.addInitScript((data) => {
    try { localStorage.setItem('hsk4-paid-content-v1', JSON.stringify(data)); } catch (e) {}
  }, PAID_CONTENT);
}
