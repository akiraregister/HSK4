// 聞きとりステップの操作。止める／最初から／速さ／ステップを送ったら止まること。
//
// **音声そのものは偽物に差し替えている。** Playwright の Chromium は MP3 の
// デコーダを積んでいないことがあり、本物を鳴らそうとすると環境によって
// 落ちたり落ちなかったりする。ここで確かめたいのは再生の可否ではなく、
// ボタンと音声の状態が食い違わないことなので、偽の Audio で十分。
import { launch, seedFullContent, passOnboarding } from './browser.mjs';
const B = process.env.BASE || 'http://127.0.0.1:8765/';
const br = await launch();
const c = await br.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const res = []; const ok = (n, v, x = '') => res.push(`${v ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);

await p.addInitScript(() => {
  window.__audios = [];
  window.Audio = class {
    constructor(src) {
      this.src = src; this.paused = true; this.ended = false;
      this.currentTime = 0; this.duration = 12; this.playbackRate = 1;
      window.__audios.push(this);
    }
    play() { this.paused = false; if (this.onplay) this.onplay(); return Promise.resolve(); }
    pause() { this.paused = true; if (this.onpause) this.onpause(); }
  };
});
await seedFullContent(p);
await p.goto(B, { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.mouse.move(195, 400); await p.mouse.down(); await p.mouse.up();   // スプラッシュを飛ばす
await p.waitForTimeout(300);
await passOnboarding(p);

// --- 聞きとりステップまで進む ---
await p.click('#content button:has-text("学習を始める")');
await p.waitForTimeout(500);
let reached = false;
for (let i = 0; i < 40; i++) {
  if ((await p.textContent('#content .dstep-label') || '').includes('聞きとる')) { reached = true; break; }
  const next = await p.$('#bottomNext');
  if (!next || !(await next.isVisible())) break;
  await next.click(); await p.waitForTimeout(120);
}
ok('聞きとるステップに着く', reached);

const cur = () => p.evaluate(() => {
  const a = window.__audios[window.__audios.length - 1];
  return a ? { paused: a.paused, t: a.currentTime, rate: a.playbackRate } : null;
});

await p.click('#lsPlayBtn'); await p.waitForTimeout(200);
ok('再生すると操作ボタンが出る', !!(await p.$('#lsToggle')) && !!(await p.$('#lsRestart')));
ok('速さを選べる', (await p.$$('[data-ls-rate]')).length === 3);
ok('再生中になっている', (await cur()).paused === false);

// --- 一時停止と再開 ---
await p.click('#lsToggle'); await p.waitForTimeout(150);
ok('一時停止できる', (await cur()).paused === true);
ok('止めたら「再開する」に変わる', (await p.textContent('#lsToggle')).includes('再開'));
ok('止めたら波も止まる',
  await p.$eval('#lsRoot .ls-wave', e => e.classList.contains('paused')));
await p.click('#lsToggle'); await p.waitForTimeout(150);
ok('再開できる', (await cur()).paused === false);
ok('再開したら「一時停止」に戻る', (await p.textContent('#lsToggle')).includes('一時停止'));

// --- 最初から ---
await p.evaluate(() => { window.__audios[window.__audios.length - 1].currentTime = 7; });
await p.click('#lsRestart'); await p.waitForTimeout(150);
const after = await cur();
ok('最初から聞き直せる', after.t === 0 && after.paused === false, JSON.stringify(after));

// --- 速さ ---
await p.click('[data-ls-rate="0.75"]'); await p.waitForTimeout(150);
ok('速さが音声に反映される', (await cur()).rate === 0.75);
ok('選んだ速さに印が付く',
  await p.$eval('[data-ls-rate="0.75"]', e => e.classList.contains('on')));
ok('速さを覚えている',
  (await p.evaluate(() => localStorage.getItem('hsk4-ls-rate'))) === '0.75');

// --- ステップを送ったら止まる（実機で指摘された不具合） ---
await p.click('#bottomNext'); await p.waitForTimeout(300);
ok('次のステップへ行くと音声が止まる', (await cur()).paused === true);
await p.click('#bottomPrev'); await p.waitForTimeout(300);
ok('戻ると続きから再開できる', (await p.textContent('#lsToggle')).includes('再開'));

// --- 今日画面へ抜けても止まる ---
await p.click('#lsToggle'); await p.waitForTimeout(150);
ok('もう一度再生できる', (await cur()).paused === false);
await p.click('#topBack'); await p.waitForTimeout(400);
ok('今日画面へ戻っても音声が止まる', (await cur()).paused === true);

// --- 覚えた速さは次のDayにも効く ---
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
ok('読み込み直しても速さを覚えている',
  (await p.evaluate(() => localStorage.getItem('hsk4-ls-rate'))) === '0.75');

// --- 単語・例文の読み上げ（端末のTTS。リスニングのMP3とは別のしくみ） ---
// iOSで鳴らなかったという指摘への手当てを見張る。読み上げそのものは
// ヘッドレスに無いので、speechSynthesis を偽物に差し替えて呼び方だけ確かめる。
{
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
  await p2.addInitScript(() => {
    window.__ss = { spoke: [], cancels: 0, speaking: false, pending: false };
    window.SpeechSynthesisUtterance = class {
      constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.voice = null; }
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      get speaking() { return window.__ss.speaking; },
      get pending() { return window.__ss.pending; },
      cancel() { window.__ss.cancels++; },
      getVoices() { return [
        { name: 'Ting-Ting', lang: 'zh-CN' },
        { name: 'Mei-Jia', lang: 'zh-TW' },
        { name: 'Kyoko', lang: 'ja-JP' },
      ]; },
      speak(u) { window.__ss.spoke.push({ text: u.text, lang: u.lang, rate: u.rate,
                                          voice: u.voice && u.voice.name });
                 if (u.onstart) u.onstart(); },
    }});
  });
  await seedFullContent(p2);
  await p2.goto(B, { waitUntil: 'load' }); await p2.waitForTimeout(600);
  await p2.mouse.move(195, 400); await p2.mouse.down(); await p2.mouse.up();
  await p2.waitForTimeout(300);
  await passOnboarding(p2);
  await p2.evaluate(() => localStorage.setItem('hsk4-ls-rate', '0.75'));
  await p2.click('#content button:has-text("学習を始める")'); await p2.waitForTimeout(600);

  const btns = await p2.$$('#content .wcard.on .speak-btn');
  ok('単語カードに読み上げボタンがある', btns.length >= 1, 'n=' + btns.length);
  // 溶けて見つけられなかったので、罫で囲って本文寄りの色にした
  const look = await p2.$eval('#content .speak-btn',
    e => ({ border: getComputedStyle(e).borderTopWidth, color: getComputedStyle(e).color,
            w: getComputedStyle(e.querySelector('.spk-ic')).width }));
  ok('読み上げボタンは罫で囲ってある', parseFloat(look.border) > 0, look.border);
  ok('薄すぎる色にしない', look.color !== 'rgb(143, 140, 130)', look.color);

  await btns[0].click(); await p2.waitForTimeout(250);
  const said = await p2.evaluate(() => window.__ss);
  ok('押すと読み上げる', said.spoke.length === 1, JSON.stringify(said.spoke));
  // **この2つは実機で決まった形。理屈で変えないこと。**
  // 2026年9月に「声を明示して選ぶ」「鳴っている最中だけ cancel する」へ変えたら、
  // それまで消音モードでも聞こえていたものが鳴らなくなった。元の形に戻してある。
  ok('毎回 cancel してから喋る', said.cancels === 1, 'cancels=' + said.cancels);
  ok('声のオブジェクトは渡さない（lang だけ）',
    said.spoke[0].voice == null && said.spoke[0].lang === 'zh-CN', JSON.stringify(said.spoke[0]));
  ok('聞きとりで選んだ速さが効く',
    Math.abs(said.spoke[0].rate - 0.9 * 0.75) < 0.001, 'rate=' + said.spoke[0].rate);
  ok('読み上げでエラーを出さない', errs2.length === 0, errs2.join(','));
  // iPhoneは消音スイッチで読み上げだけが黙る。リスニングのMP3は消音でも鳴るので、
  // 「リスニングは鳴るのに単語だけ鳴らない」に見えて不具合と区別がつかない。
  // 消音かどうかはwebからは分からないので、押す人の目に入る所に置いておく
  const note = await p2.textContent('#content .spk-note').catch(() => '');
  ok('消音スイッチの注意書きが単語ステップに出る',
    note.includes('消音スイッチ') && note.includes('別のしくみ'), JSON.stringify(note));
  ok('注意書きは読み上げボタンと同じ画面にある',
    await p2.$eval('#content .spk-note',
      e => e.checkVisibility({ contentVisibilityAuto: true })));
  await c2.close();
}
{
  // 鳴らない端末では黙らない。押しても無反応が一番困る
  const c3 = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await c3.newPage();
  await p3.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, cancel() {}, getVoices() { return []; },
      speak() { /* iOSの壊れ方：何も起きず、onstart も onerror も来ない */ },
    }});
  });
  await seedFullContent(p3);
  await p3.goto(B, { waitUntil: 'load' }); await p3.waitForTimeout(600);
  await p3.mouse.move(195, 400); await p3.mouse.down(); await p3.mouse.up();
  await p3.waitForTimeout(300);
  await passOnboarding(p3);
  await p3.click('#content button:has-text("学習を始める")'); await p3.waitForTimeout(600);
  await p3.click('#content .wcard.on .speak-btn'); await p3.waitForTimeout(2000);
  const toast = await p3.textContent('.hsk-toast').catch(() => '');
  ok('鳴らなければそう伝える', (toast || '').includes('読み上げ'), JSON.stringify(toast));
  await c3.close();
}

// --- スクロールの跳ね返りとヘッダーのにじみ（実機で指摘された） ---
{
  const chrome = await p.evaluate(() => {
    const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return {
      htmlOver: getComputedStyle(document.documentElement).overscrollBehaviorY,
      bodyOver: getComputedStyle(document.body).overscrollBehaviorY,
      topFilter: g('.top', 'backdropFilter') || g('.top', 'webkitBackdropFilter'),
      topBg: g('.top', 'backgroundColor'),
      tabFilter: g('.tabbar', 'backdropFilter') || g('.tabbar', 'webkitBackdropFilter'),
    };
  });
  ok('引っぱっても跳ね返らない（html）', chrome.htmlOver === 'none', chrome.htmlOver);
  ok('引っぱっても跳ね返らない（body）', chrome.bodyOver === 'none', chrome.bodyOver);
  // 半透明＋ぼかしだと、スクロール中に下の中身が透けてロゴがにじむ
  ok('ヘッダーにぼかしを掛けない', chrome.topFilter === 'none', chrome.topFilter);
  ok('ヘッダーの地は不透明', !/rgba\(.*0?\.\d+\)/.test(chrome.topBg), chrome.topBg);
  ok('下タブにもぼかしを掛けない', chrome.tabFilter === 'none', chrome.tabFilter);
}

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
