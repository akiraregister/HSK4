// Chromium の在り処を1か所に集める。
// 優先順： $CHROMIUM → この環境の /opt/pw-browsers → Playwright 自前のもの。
// これで「Playwright が自分で入れた環境」でも「用意済みの環境」でも同じテストが動く。
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

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
