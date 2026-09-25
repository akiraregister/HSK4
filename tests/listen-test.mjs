// 聞きとりステップの操作。止める／最初から／速さ／ステップを送ったら止まること。
//
// **音声そのものは偽物に差し替えている。** Playwright の Chromium は MP3 の
// デコーダを積んでいないことがあり、本物を鳴らそうとすると環境によって
// 落ちたり落ちなかったりする。ここで確かめたいのは再生の可否ではなく、
// ボタンと音声の状態が食い違わないことなので、偽の Audio で十分。
import { launch, seedFullContent, passOnboarding } from './browser.mjs';
import { audioKey as nodeAudioKey, sayText } from '../audio/build-word-audio.mjs';
import { readFile, readdir } from 'fs/promises';
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
  // **録音を「無い」ことにして、控えの経路だけを見る。**録音が入ってからは
  // そちらが鳴るので、索引を空に差し替えないとTTSまで到達しない。
  // Service Worker は止めること（止めないと fetch を横取りされて差し替えが効かない）
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p2 = await c2.newPage();
  await p2.route('**/audio/w/index.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
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
  // 1回目は索引が未取得で楽観的に録音を取りにいくので、先に1度呼んで読ませておく
  await p2.evaluate(() => window.speakZh('索引を読ませる'));
  await p2.waitForTimeout(600);
  await p2.evaluate(() => { window.__ss.spoke.length = 0; window.__ss.cancels = 0; });
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
  // 消音スイッチは内蔵スピーカーにしか効かない。イヤホンなら鳴るので、その場で試せる
  ok('イヤホンという逃げ道も書いてある', note.includes('イヤホン'), JSON.stringify(note));
  ok('注意書きは読み上げボタンと同じ画面にある',
    await p2.$eval('#content .spk-note',
      e => e.checkVisibility({ contentVisibilityAuto: true })));
  await c2.close();
}
{
  // 鳴らない端末では黙らない。押しても無反応が一番困る
  // ここも録音を「無い」ことにする（録音があるとそちらが鳴って、控えまで来ない）
  const c3 = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p3 = await c3.newPage();
  await p3.route('**/audio/w/index.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
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
  // 1回目は索引が未取得で楽観的に録音を取りにいくので、先に1度呼んで読ませておく
  await p3.evaluate(() => window.speakZh('索引を読ませる'));
  await p3.waitForTimeout(600);
  await p3.click('#content button:has-text("学習を始める")'); await p3.waitForTimeout(600);
  await p3.click('#content .wcard.on .speak-btn'); await p3.waitForTimeout(2000);
  const toast = await p3.textContent('.hsk-toast').catch(() => '');
  ok('鳴らなければそう伝える', (toast || '').includes('読み上げ'), JSON.stringify(toast));
  await c3.close();
}

// --- 録音の読み上げ（消音スイッチで黙らないほう） ---
// iPhoneの消音スイッチは内蔵スピーカーにしか効かず、録音は消音でも鳴るが
// 読み上げ（Web Speech）は黙る。ブラウザからは経路を選べないので、録音を本命にした。
{
  // 録音がある状態を作る。リポジトリの索引はまだ空（1本も作っていない）ので、
  // ここでは「作ったあと」を再現して差し替える。
  // **Service Worker は止めること。**止めないと fetch を横取りされて差し替えが効かない
  const HAVE = ['水平', '我的中文水平还不够高。', '你好', '因为 所以', '没有录音'].map(nodeAudioKey);
  const c4 = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p4 = await c4.newPage();
  await p4.route('**/audio/w/index.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HAVE) }));
  const errs4 = []; p4.on('pageerror', e => errs4.push(e.message));
  await p4.addInitScript(() => {
    window.__played = []; window.__spoke = []; window.__failNext = false;
    window.Audio = class {
      constructor(src) {
        this.src = src; this.paused = true; this.playbackRate = 1; this.preservesPitch = true;
        window.__played.push(this);
        if (window.__failNext) setTimeout(() => this.onerror && this.onerror(), 5);
      }
      play() { this.paused = false; return window.__failNext ? Promise.reject(new Error('404')) : Promise.resolve(); }
      pause() { this.paused = true; }
    };
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, cancel() {}, getVoices() { return []; },
      speak(u) { window.__spoke.push(u.text); if (u.onstart) u.onstart(); },
    }});
  });
  await seedFullContent(p4);
  await p4.goto(B, { waitUntil: 'load' }); await p4.waitForTimeout(600);
  await p4.mouse.move(195, 400); await p4.mouse.down(); await p4.mouse.up();
  await p4.waitForTimeout(300);
  await passOnboarding(p4);

  // **アプリと生成器でファイル名の計算がずれると、録音が見つからず黙って読み上げへ
  // 落ちる（＝消音で鳴らないまま）。**本番にテスト用のフックは足さない約束なので、
  // speakZh() が実際に取りにいくURLから確かめる。
  // 「因为〜所以〜」は、読み上げ前に「〜」を落とす処理の一致も兼ねる。
  const samples = ['水平', '我的中文水平还不够高。', '你好', '因为〜所以〜'];
  const urls = await p4.evaluate(ts => {
    window.__played.length = 0;
    return ts.map(t => { window.speakZh(t); return window.__played.at(-1).src; });
  }, samples);
  const want = samples.map(t => 'audio/w/' + nodeAudioKey(sayText(t)) + '.mp3');
  ok('ファイル名の計算がアプリと生成器で一致する',
    urls.every((u, i) => u.endsWith(want[i])), urls.join(' ') + ' / 期待 ' + want.join(' '));

  await p4.evaluate(() => { window.__played.length = 0; window.__spoke.length = 0; });
  await p4.evaluate(() => localStorage.setItem('hsk4-ls-rate', '0.75'));
  await p4.click('#content button:has-text("学習を始める")'); await p4.waitForTimeout(600);
  await p4.click('#content .wcard.on .speak-btn'); await p4.waitForTimeout(250);
  const rec = await p4.evaluate(() => ({ played: window.__played.map(a => ({ src: a.src, rate: a.playbackRate })),
                                         spoke: window.__spoke }));
  ok('録音を鳴らす', rec.played.length === 1 && /audio\/w\/[0-9a-f]{8}\.mp3$/.test(rec.played[0].src),
    JSON.stringify(rec.played));
  ok('録音があれば端末の読み上げは使わない', rec.spoke.length === 0, JSON.stringify(rec.spoke));
  ok('聞きとりの速さが録音にも効く', Math.abs(rec.played[0].rate - 0.75) < 0.001, 'rate=' + rec.played[0].rate);

  // 録音がまだ無い文字列は、従来どおり端末の読み上げへ落ちる（作った分から順に置き換わる）
  await p4.evaluate(() => { window.__played.length = 0; window.__spoke.length = 0; window.__failNext = true; });
  await p4.evaluate(() => window.speakZh('没有录音'));
  await p4.waitForTimeout(300);
  const fb = await p4.evaluate(() => ({ played: window.__played.length, spoke: window.__spoke }));
  ok('録音が無ければ端末の読み上げへ落ちる', fb.spoke.includes('没有录音'), JSON.stringify(fb));
  // onerror と play() の拒否が両方来るので、素直に書くと同じ語を二重に読み上げる
  ok('落ちるときに二重に読み上げない', fb.spoke.length === 1, JSON.stringify(fb.spoke));
  ok('読み上げでエラーを出さない', errs4.length === 0, errs4.join(','));
  await c4.close();
}
{
  // 索引（audio/w/index.json）があれば、無い文字列は取りにいかずに読み上げへ回す。
  // 取りにいくと、押してから404を待つぶん声が出るまで待たされる
  // **Service Worker を止めておくこと。**止めないと fetch を横取りされて、
  // Playwright の差し替えが効かない（素通りして本物の404が返ってくる）
  const c5 = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p5 = await c5.newPage();
  await p5.route('**/audio/w/index.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['deadbeef']) }));
  await p5.addInitScript(() => {
    window.__played = []; window.__spoke = [];
    window.Audio = class { constructor(s){ this.src=s; this.playbackRate=1; window.__played.push(this); }
      play(){ return Promise.resolve(); } pause(){} };
    window.SpeechSynthesisUtterance = class { constructor(t){ this.text=t; this.lang=''; this.rate=1; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, cancel() {}, getVoices() { return []; },
      speak(u) { window.__spoke.push(u.text); if (u.onstart) u.onstart(); } }});
  });
  await seedFullContent(p5);
  await p5.goto(B, { waitUntil: 'load' }); await p5.waitForTimeout(600);
  await p5.mouse.move(195, 400); await p5.mouse.down(); await p5.mouse.up();
  await p5.waitForTimeout(300);
  await passOnboarding(p5);
  await p5.evaluate(() => window.speakZh('索引を読ませる'));   // 1回目で索引を読みにいく
  await p5.waitForTimeout(600);
  await p5.evaluate(() => { window.__played.length = 0; window.__spoke.length = 0; });
  await p5.evaluate(() => window.speakZh('録音が無い語'));
  await p5.waitForTimeout(200);
  const idx = await p5.evaluate(() => ({ played: window.__played.length, spoke: window.__spoke.length }));
  ok('索引に無ければ取りにいかない', idx.played === 0, JSON.stringify(idx));
  ok('索引に無ければすぐ読み上げへ回す', idx.spoke === 1, JSON.stringify(idx));
  await c5.close();
}
{
  // 索引とmp3がずれると、**黙って読み上げへ落ちる**（＝消音で鳴らないまま気づけない）。
  // mp3を手で消したり足したりしたら、生成器を叩き直して索引を作り直すこと
  const dir = new URL('../audio/w/', import.meta.url);
  const real = JSON.parse(await readFile(new URL('index.json', dir), 'utf8'));
  const files = (await readdir(dir)).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4)).sort();
  ok('録音の索引が空でない', Array.isArray(real) && real.length > 0, 'n=' + (real || []).length);
  ok('索引とmp3の中身が一致する',
    JSON.stringify([...real].sort()) === JSON.stringify(files),
    `索引${real.length}件 / mp3 ${files.length}本`);
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
      topPos: g('.top', 'position'),
    };
  });
  ok('引っぱっても跳ね返らない（html）', chrome.htmlOver === 'none', chrome.htmlOver);
  ok('引っぱっても跳ね返らない（body）', chrome.bodyOver === 'none', chrome.bodyOver);
  // 半透明＋ぼかしだと、スクロール中に下の中身が透けてロゴがにじむ
  ok('ヘッダーにぼかしを掛けない', chrome.topFilter === 'none', chrome.topFilter);
  ok('ヘッダーの地は不透明', !/rgba\(.*0?\.\d+\)/.test(chrome.topBg), chrome.topBg);
  ok('下タブにもぼかしを掛けない', chrome.tabFilter === 'none', chrome.tabFilter);
  // ぼかしを外したあとも「上部がかすむ」と再度指摘された。原因は position:sticky で、
  // iPhone がその層だけ低い解像度で描いていた（画素を測って確認）。戻さないこと。
  ok('ヘッダーを貼り付けない（position:sticky を使わない）',
    chrome.topPos !== 'sticky' && chrome.topPos !== 'fixed', chrome.topPos);
}

// --- 押せるものの強さは3段。墨ベタ（主役）は1画面に1つだけ ---
{
  await p.evaluate(() => showToday());
  await p.waitForTimeout(250);
  const solids = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#content .xbtn')];
    const filled = (b) => {
      const bg = getComputedStyle(b).backgroundColor;
      return bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
    };
    return { total: btns.length, solid: btns.filter(filled).length };
  });
  ok('今日画面の墨ベタは1つだけ', solids.solid === 1, JSON.stringify(solids));
  // 重複していた3組。見出し「今日やること」・ヘッダーの「x / 90」・「あと○日」は外した
  const txt = await p.textContent('#content');
  ok('見出し「今日やること」は出さない', !txt.includes('今日やること'));
  ok('凡例は出さない', !txt.includes('これから'), txt.slice(0, 60));
  const meta = await p.textContent('#topMeta');
  ok('今日画面のヘッダーに進捗を重ねない', !/\d+\s*\/\s*90/.test(meta), JSON.stringify(meta));
}

// --- 今日画面の「復習する」「受ける」は同じ幅（縦に並ぶと右端がガタついていた） ---
{
  // 行は状態で出たり出なかったりするので、同じ部品を3つ並べて幅を測る
  const w = await p.evaluate(() => {
    const t = document.createElement('div'); t.className = 'trow';
    t.innerHTML = '<span class="go">復習する</span><span class="go">受ける</span><span class="go">完了</span>';
    document.getElementById('content').appendChild(t);
    const ws = [...t.querySelectorAll('.go')].map(e => Math.round(e.getBoundingClientRect().width));
    t.remove(); return ws;
  });
  ok('今日画面の副ボタンは文言によらず同じ幅', new Set(w).size === 1, JSON.stringify(w));
}

// --- ブックマーク：案2「辞書の項目」（design/bookmarks.html） ---
{
  await p.evaluate(() => {
    window.toggleBookmark('d1-v0', '単語', '水平', 'レベル、能力水準', 'shuǐpíng');
    window.toggleBookmark('d1-v1', '単語', '提高', '高める、向上させる', 'tígāo');
  });
  await p.click('#bookmarkViewBtn'); await p.waitForTimeout(250);
  const bm = await p.evaluate(() => {
    const panel = document.getElementById('bookmarkPanel');
    const ent = panel.querySelector('.bm-ent');
    return {
      ents: panel.querySelectorAll('.bm-ent').length,
      boxes: panel.querySelectorAll('.vitem').length,
      heading: !!panel.querySelector('.section-title'),
      help: panel.textContent.includes('各カードのボタンで切替'),
      tab: panel.querySelector('.cw-subtab.active').textContent,
      entBorder: ent ? getComputedStyle(ent).borderTopWidth + '/' + getComputedStyle(ent).borderRightWidth : '',
      parts: ent ? ['.zh', '.speak-btn', '.pinyin', '.bm-ja', '.ex', '.lvc', 'button.bookmark'].filter(q => !ent.querySelector(q)) : ['no entry'],
      sortRows: new Set([...panel.querySelectorAll('.bm-sort button')].map(b => Math.round(b.getBoundingClientRect().top))).size,
    };
  });
  ok('ブックマークは項目として並ぶ（箱を持たない）', bm.ents === 2 && bm.boxes === 0 && bm.entBorder === '0px/0px', JSON.stringify(bm));
  ok('見出し・説明文は出さない', !bm.heading && !bm.help, JSON.stringify(bm));
  ok('件数は切り替えの中に入る', /ブックマーク\s*2/.test(bm.tab), bm.tab);
  ok('中身は減らさない（語・読み上げ・拼音・意味・例文・難易度・★）', bm.parts.length === 0, JSON.stringify(bm.parts));
  ok('並び替え4つが1行に収まる', bm.sortRows === 1, 'rows=' + bm.sortRows);
  // 「例文」で例文だけが消える（state.density の compact）
  await p.click('.bm-exsw'); await p.waitForTimeout(200);
  const exVis = await p.evaluate(() => getComputedStyle(document.querySelector('#bookmarkPanel .bm-ent .ex')).display);
  ok('「例文」を切ると例文が隠れる', exVis === 'none', exVis);
  await p.click('.bm-exsw'); await p.waitForTimeout(200);
  // 難易度を押してもその場で反映され、項目の左に色罫が付く
  await p.click('#bookmarkPanel .lvc[data-lv="d1-v1"] button:nth-child(2)'); await p.waitForTimeout(200);
  const lvOn = await p.evaluate(() => {
    const box = document.querySelector('#bookmarkPanel .lvc[data-lv="d1-v1"]');
    return !!box.querySelector('.lvc-on-1') && box.closest('.bm-ent').classList.contains('lv-1');
  });
  ok('ブックマークで難易度を切り替えると、その場で左の色罫も変わる', lvOn);
  await p.evaluate(() => { window.toggleBookmark('d1-v0'); window.toggleBookmark('d1-v1'); });
}

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
