// アプリ本体の実画面を撮る。App Store用・LP用の素材はすべてここから作る。
//   node marketing/capture-app.mjs
// 出力: marketing/shots/*.png（390x844・deviceScaleFactor 3 ＝ 1170x2532）
//
// 画面の中身は作り物ではなく、実際に index.html を操作した結果。
// 学習状況だけを「12日完了・復習18問」に固定して撮っている（seedState）。
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { extname, join, normalize } from 'path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'marketing', 'shots');
const PORT = Number(process.env.PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}/`;
const GRADE = process.env.GRADE === '1';   // 作文のAI採点を実際に呼ぶか（既定では呼ばない）

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

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

// ---- index.html から BANK を取り出す。模試に「正しく答える」ために要る ----
function bracketEnd(s, from) {
  let d = 0;
  for (let k = from; k < s.length; k++) {
    const c = s[k];
    if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') { d--; if (d === 0) return k; }
  }
  return -1;
}
function loadBank() {
  const s = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const i = s.indexOf('const BANK = {');
  const b = s.indexOf('{', i);
  return JSON.parse(s.slice(b, bracketEnd(s, b) + 1));
}
// 突き合わせ用の正規化。タグ・空白・約物・空欄の下線を落とす
const strip = t => String(t).replace(/<\/?[a-z]>/g, '').replace(/[\s，,。、？?！!_＿]/g, '');

// 選択問題： 問題文 → 正解の選択肢テキスト
// 語順問題： 語句を並べ替えたキー → 正しい順に並べた語句
function buildKeys(bank) {
  const mc = {}, drag = {};
  Object.values(bank).forEach(day => {
    (day.mc || []).forEach(q => {
      const ok = (q.opts || []).find(o => o.ok);
      if (ok) mc[strip(q.q)] = strip(ok.t);
    });
    const d = day.drag;
    if (d && d.words) {
      let rest = strip(d.answer);
      const order = [];
      const pool = d.words.slice();
      while (pool.length) {
        const i = pool.findIndex(w => rest.startsWith(strip(w)));
        if (i < 0) break;
        order.push(pool[i]);
        rest = rest.slice(strip(pool[i]).length);
        pool.splice(i, 1);
      }
      if (!pool.length) drag[d.words.slice().sort().join('|')] = order;
    }
  });
  return { mc, drag };
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

// 撮影用の学習状況。12日完了・期限切れ13枚・新規5枚＝復習18問。
// LPのモックと同じ数字にしてあるので、素材を差し替えても説明文がずれない。
function seedState() {
  const completed = {};
  for (let d = 1; d <= 12; d++) completed[d] = true;
  const srs = {};
  const now = Date.now();
  let n = 0;
  outer:
  for (let d = 1; d <= 12; d++) {
    for (let v = 0; v < 5; v++) {
      if (n >= 13) break outer;
      srs[`d${d}-v${v}`] = { ef: 2.5, interval: 6, reps: 2, lapses: 0, last: now - 7 * 86400000, due: now - 86400000 };
      n++;
    }
  }
  return { completed, answers: {}, scores: {}, bookmarks: {}, dragOrders: {}, levels: {},
    srs, srsNewLimit: 5, srsDueLimit: 30, srsDir: 'zh2ja', density: 'standard', fontScale: 'md',
    customWords: [], mockHistory: [], bmSort: 'recommend', revScope: 'all', examDate: '' };
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'ja-JP', reducedMotion: 'reduce', ...opts,
  });
  const page = await ctx.newPage();
  await page.addInitScript(st => {
    try {
      localStorage.setItem('hsk4-90-v4-state', JSON.stringify(st));
      localStorage.setItem('hsk4-onboarded', 'done');
      localStorage.setItem('hsk4-hl-migrated-v1', '1');
    } catch (e) {}
    // リスニングは1回しか再生できず、聞き終わるまで設問が出ない。
    // 撮影のあいだだけ早送りして、設問・答え合わせの画面まで進める。
    try {
      const A = window.Audio;
      window.Audio = function (src) { const a = new A(src); a.playbackRate = 16; a.muted = true; return a; };
    } catch (e) {}
  }, seedState());
  return { ctx, page };
}

await mkdir(OUT, { recursive: true });
const BANK = loadBank();
const KEYS = buildKeys(BANK);

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const done = [];
  // 要素をヘッダーのすぐ下に寄せてから、画面まるごとを撮る。
  // App Store用の5枚は端末の見た目をそろえたいので、要素の切り出しではなく全画面で撮る。
  const scrollUnderHeader = async (page, sel) => {
    // 一度で合わないことがある（sticky ヘッダーの高さが描画後に変わる）ので、
    // 測って寄せるのを数回くり返す。
    for (let i = 0; i < 4; i++) {
      const gap = await page.evaluate(s => {
        const el = document.querySelector(s);
        const top = document.querySelector('.top');
        if (!el) return 0;
        const pad = (top ? top.offsetHeight : 0) + 8;
        const d = el.getBoundingClientRect().top - pad;
        const prev = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollBy(0, d);
        document.documentElement.style.scrollBehavior = prev;
        return d;
      }, sel);
      await page.waitForTimeout(160);
      if (Math.abs(gap) < 2) break;
    }
    await page.waitForTimeout(250);
  };
  // カード1枚を、ヘッダーに被られずに切り出す。
  // 要素スクショはヘッダーの下へスクロールした位置で撮られるので上端が隠れる。
  // いったんヘッダー直下へ寄せてから、座標で切り取る。
  const cardShot = async (page, sel, name) => {
    await scrollUnderHeader(page, sel);
    const box = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // 下部の固定ナビが写り込まないよう、使える高さから差し引く
      const nav = document.getElementById('bottomNav');
      const navH = (nav && getComputedStyle(nav).display !== 'none') ? nav.offsetHeight : 0;
      return { x: r.x, y: r.y, width: r.width, height: r.height, vh: window.innerHeight - navH };
    }, sel);
    if (!box) { console.log('  ! 見つからない', sel); return; }
    const height = Math.min(box.height, box.vh - box.y);
    await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: box.x, y: box.y, width: box.width, height } });
    console.log('  ✓', name + '.png' + (height < box.height - 1 ? '（下端が入りきらず切れている）' : ''));
  };
  // 全画面スクショの中で、その要素がどこにあったかを記録する。
  // App Store版下の「丸で囲む位置」はこの座標から自動で出す（手で数えると必ずずれる）。
  const REGIONS = {};
  const mark = async (page, shotName, sel, key) => {
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, dpr: 3 };
    }, sel);
    if (!r) return;
    REGIONS[shotName] = REGIONS[shotName] || {};
    REGIONS[shotName][key] = { x: Math.round(r.x * 3), y: Math.round(r.y * 3), w: Math.round(r.w * 3), h: Math.round(r.h * 3) };
  };
  const shot = async (page, name, opts = {}) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
    done.push(name);
    console.log('  ✓', name + '.png');
  };

  // ============ ① 今日やること・復習・Day・リスニング・語順・単語 ============
  {
    const { page } = await newPage(browser);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(900);

    console.log('撮影:');
    await shot(page, 'home');

    // 復習カード（答えを見た状態＝4段階ボタンが出ている）
    await page.click('#content .tcard.rev button');
    await page.waitForTimeout(400);
    await page.click('#content button:has-text("復習を始める")');
    await page.waitForTimeout(400);
    await cardShot(page, '.flashcard', 'card-flashcard-front');   // 答えを見る前
    await page.evaluate(() => window.revReveal());
    await page.waitForTimeout(300);
    // 手応えの4段階ボタンがこの画面の要なので、必ず写る位置まで送る
    await page.evaluate(() => {
      const g = document.querySelector('.fc-actions.g4');
      if (g) window.scrollTo(0, Math.max(0, g.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 24));
    });
    await shot(page, 'review');
    await cardShot(page, '.flashcard', 'card-flashcard');

    // Day学習画面
    await page.evaluate(() => window.showDay(13));
    await page.waitForTimeout(800);
    await shot(page, 'day');
    await mark(page, 'day', '#content .card', 'summary');
    await cardShot(page, '#content .card', 'card-day');
    await cardShot(page, '#lsCard', 'listening-ready');
    await page.click('#lsPlayBtn');
    await page.waitForSelector('#lsRoot .ls-opts, #lsRoot .ls-tf', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(400);
    await cardShot(page, '#lsCard', 'card-listening');
    await scrollUnderHeader(page, '#lsCard');
    await shot(page, 'screen-listening');
    await mark(page, 'screen-listening', '#lsCard', 'card');
    const opt0 = await page.$('#lsRoot .ls-opt');
    if (opt0) {
      await opt0.click();
      await page.waitForTimeout(500);
      await cardShot(page, '#lsCard', 'listening-answer');
    }
    await page.evaluate(() => window.showDay(13));
    await page.waitForTimeout(700);

    // ミニテスト：語順の問題まで進め、途中まで組み立てた状態にする
    for (let t = 0; t < 10; t++) {
      await page.evaluate(() => window.mtInit(13));
      await page.waitForTimeout(250);
      for (let i = 0; i < 4; i++) {
        const opt = await page.$('#mtRoot .mt-opt');
        if (opt) { await opt.click(); await page.waitForTimeout(160); }
        const nx = await page.$('#mtNx button');
        if (nx) { await nx.click(); await page.waitForTimeout(200); }
      }
      if (await page.$('#mtBank')) break;
    }
    const chips = await page.$$('#mtBank .mt-chip');
    const order = await page.evaluate(k => {
      const ws = [...document.querySelectorAll('#mtBank .mt-chip')].map(b => b.dataset.w);
      return k[ws.slice().sort().join('|')] || null;
    }, KEYS.drag);
    if (order) {
      for (const w of order.slice(0, 2)) {
        const b = await page.$(`#mtBank .mt-chip[data-w="${w}"]`);
        if (b) { await b.click(); await page.waitForTimeout(150); }
      }
    } else if (chips[0]) { await chips[0].click(); }
    await page.waitForTimeout(250);
    await cardShot(page, '#testCard', 'card-minitest');
    await scrollUnderHeader(page, '#testCard');
    await shot(page, 'screen-minitest');

    // 文法カード：Day1の1つ目を、詳しい解説（日本人が間違えやすい点）を開いた状態で
    await page.evaluate(() => window.showDay(1));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const d = document.querySelector('.gitem .g-details');
      if (d) d.open = true;
    });
    await page.waitForTimeout(400);
    await cardShot(page, '.gitem', 'card-grammar');
    await scrollUnderHeader(page, '.gitem');
    await shot(page, 'screen-grammar');

    // 単語一覧
    await page.evaluate(() => window.showVocab());
    await page.waitForTimeout(600);
    await shot(page, 'vocab');
    await page.context().close();
  }

  // ============ ② 作文（AI採点）============
  {
    const { page } = await newPage(browser);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.showDay(5));   // Day1-7は採点にログイン不要
    await page.waitForTimeout(700);
    // 「彼は話すのが速いです。」の回に当たるまで引き直す。
    // わざと 得 を落とした解答を入れて、AIが直すところまで見せる。
    let found = false;
    for (let t = 0; t < 20; t++) {
      await page.evaluate(() => window.mtInit(5));
      await page.waitForTimeout(250);
      for (let i = 0; i < 4; i++) {
        const opt = await page.$('#mtRoot .mt-opt');
        if (opt) { await opt.click(); await page.waitForTimeout(160); }
        const nx = await page.$('#mtNx button');
        if (nx) { await nx.click(); await page.waitForTimeout(200); }
      }
      if (await page.$('#mtTa')) {
        const prompt = (await page.textContent('#mtRoot .mt-q')) || '';
        if (prompt.includes('話すのが速い')) { found = true; break; }
      }
    }
    if (found) {
      await page.fill('#mtTa', '他说很快。');   // 得 が抜けた、よくある間違い
      await page.waitForTimeout(200);
      await cardShot(page, '#testCard', 'card-writing');
      await scrollUnderHeader(page, '#testCard');
      await shot(page, 'screen-writing');
      if (GRADE) {
        await page.click('#mtGrade');
        await page.waitForSelector('#mtExp .mt-exp', { timeout: 40000 }).catch(() => {});
        await page.waitForTimeout(800);
        await cardShot(page, '#testCard', 'card-writing-graded');
      }
    } else {
      console.log('  ! 狙った作文問題に当たらなかった');
    }
    await page.context().close();
  }

  // ============ ③ 模試（40問・結果まで）============
  {
    const { page } = await newPage(browser);
    await page.clock.install();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.clock.runFor(2000);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.showMock());
    await page.waitForTimeout(400);
    await page.click('#content button:has-text("模試を始める")');
    await page.waitForTimeout(500);
    const head = await page.textContent('#content .section-title h2');
    const total = Number((head.match(/\/\s*(\d+)/) || [])[1] || 0);
    console.log('  模試', total, '問');
    for (let i = 0; i < total; i++) {
      // 6問に1問はわざと外す。満点の画面はかえって嘘っぽく見える
      const wrong = i % 6 === 2;
      const isMc = !!(await page.$('#content .mt-opt'));
      if (isMc) {
        await page.evaluate(({ mc, wrong }) => {
          const st = t => String(t).replace(/<\/?[a-z]>/g, '').replace(/[\s，,。、？?！!_＿]/g, '');
          const q = st(document.querySelector('#content .mt-q')?.textContent || '');
          const opts = [...document.querySelectorAll('#content .mt-opt')];
          let idx = opts.findIndex(o => st(o.querySelector('span')?.textContent || '') === mc[q]);
          if (idx < 0) idx = 0;
          if (wrong) idx = (idx + 1) % opts.length;
          opts[idx].click();
        }, { mc: KEYS.mc, wrong });
      } else {
        // 模試の語順チップは data-w を持たないので、表示テキストで突き合わせる
        const seq = await page.evaluate(k => {
          const ws = [...document.querySelectorAll('#content .mt-chip')].map(b => b.textContent.trim());
          return k[ws.slice().sort().join('|')] || ws;
        }, KEYS.drag);
        const use = wrong ? [seq[seq.length - 1], ...seq.slice(0, -1)] : seq;
        for (const w of use) {
          const clicked = await page.evaluate(w => {
            const b = [...document.querySelectorAll('#content .mt-chip')]
              .find(x => !x.disabled && x.textContent.trim() === w);
            if (b) { b.click(); return true; }
            return false;
          }, w);
          if (clicked) await page.waitForTimeout(30);
        }
        for (let g = 0; g < 12; g++) {
          const c2 = await page.$('#content .mt-chip:not([disabled])');
          if (!c2) break;
          await c2.click(); await page.waitForTimeout(30);
        }
      }
      await page.waitForTimeout(50);
      await page.clock.runFor(26000);     // 1問26秒ぶん時計を進める（所要時間を現実的に）
      const next = await page.$('#content button:has-text("次の問題")');
      if (next) await next.click();
      else await page.click('#content button:has-text("採点する")');
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'mock-result');
    await mark(page, 'mock-result', '.lc-bands', 'bands');
    // 得点と「分野ごと」の帯までを、座標で切り取る（DOMは変えない）
    const clip = await page.evaluate(() => {
      const card = document.querySelector('#content .card');
      const bands = document.querySelector('.lc-bands');
      if (!card || !bands) return null;
      const a = card.getBoundingClientRect(), b = bands.getBoundingClientRect();
      return { x: a.x, y: a.y, width: a.width, height: Math.min(b.bottom, window.innerHeight) - a.y };
    });
    if (clip) {
      await page.screenshot({ path: join(OUT, 'card-mock.png'), clip });
      console.log('  ✓ card-mock.png');
    }
    await page.context().close();
  }

  await writeFile(join(OUT, 'regions.json'), JSON.stringify(REGIONS, null, 2));
  console.log('  ✓ regions.json');
  await browser.close();
  server.close();
  console.log('\n出力先:', OUT);
});
