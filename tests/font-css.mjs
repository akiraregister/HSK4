// 撮影のとき、落としておいた書体をページへ流し込むための道具。
// 使う前に `node tests/fetch-fonts.mjs` を通しておくこと（tests/fonts/ に置かれる）。
//
// このコンテナの Chromium は fonts.googleapis.com を読めないので、
// これを使わずに撮ると**書体がフォールバックになり、明朝の出来が判断できない**。
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const DIR = new URL('fonts/', import.meta.url).pathname;

export function haveFonts() { return existsSync(DIR + 'fonts.css'); }

// woff2 を data: に埋め込んだ CSS を返す。ページに <style> で差し込めばそれだけで効く
export async function fontCss() {
  let css = await readFile(DIR + 'fonts.css', 'utf8');
  const names = [...new Set(css.match(/\.\/[A-Za-z0-9_-]+\.woff2/g) || [])];
  for (const n of names) {
    const buf = await readFile(DIR + n.slice(2));
    css = css.split(n).join(`data:font/woff2;base64,${buf.toString('base64')}`);
  }
  return css;
}

// ページを開いたあとに呼ぶ。書体が実際に使われる状態まで待つ
export async function useLocalFonts(page) {
  if (!haveFonts()) throw new Error('tests/fonts/ がありません。node tests/fetch-fonts.mjs を先に');
  await page.addStyleTag({ content: await fontCss() });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}
