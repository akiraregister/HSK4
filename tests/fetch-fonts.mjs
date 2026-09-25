// Google Fonts を手元に落として、撮影のときだけローカルから読ませる。
//
// なぜ要るか：このコンテナの Chromium は、プロキシのCAを信用しないので
// fonts.googleapis.com を読めない（ERR_CERT_AUTHORITY_INVALID）。そのまま撮ると
// **書体がフォールバックになり、明朝の出来が確認できない**。長くそう諦めていたが、
// curl はCAを信用するので、落としてから配れば本物の明朝で撮れる。
//
//   node tests/fetch-fonts.mjs        落とす（tests/fonts/ に置く。gitには入れない）
//
// 撮影側は tests/font-css.mjs の LOCAL_FONT_CSS を <style> で差し込む。
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const OUT = new URL('fonts/', import.meta.url).pathname;
const FAMILIES = [
  'Noto+Serif+JP:wght@400;500;600;700',
  'Noto+Serif+SC:wght@400;500;600',
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

await mkdir(OUT, { recursive: true });

let css = '';
for (const fam of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  css += await res.text() + '\n';
}

// 各 woff2 を落として、CSSの参照をローカルの相対パスへ書き換える
const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) || [])];
console.log(`woff2 ${urls.length} 本を落とします`);
let n = 0, bytes = 0;
for (const u of urls) {
  const name = u.split('/').pop();
  const path = OUT + name;
  if (!existsSync(path)) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${u} → ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(path, buf);
    bytes += buf.length;
    n++;
  }
  css = css.split(u).join('./' + name);
}
await writeFile(OUT + 'fonts.css', css);
console.log(`新たに ${n} 本 / ${Math.round(bytes / 1024)}KB。tests/fonts/fonts.css に書き出しました`);
