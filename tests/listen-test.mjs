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
  // 以前は単語ステップに「消音スイッチを切って」の注意書きがあったが、全部録音に替えて
  // 消音でも鳴るようになったので外した（事実と合わない案内を出さない）
  ok('消音スイッチの注意書きはもう出さない', !(await p2.$('#content .spk-note')));
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
  // 例文（文）は単語より少しだけ遅く鳴らす（実機で頼まれた）。単語はそのまま
  const rates = await p4.evaluate(() => { localStorage.removeItem('hsk4-ls-rate'); window.__played.length = 0;
    window.speakZh('水平'); window.speakZh('我的中文水平还不够高。'); return window.__played.map(a => a.playbackRate); });
  ok('例文は単語より少し遅く鳴らす（単語1倍・例文0.85倍）', rates[0] === 1 && Math.abs(rates[1] - 0.85) < 0.001, JSON.stringify(rates));

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

// --- ブックマーク：案3-3「その場で開く」（design/bookmarks.html） ---
// 一覧は語・拼音・意味の1行だけ。押すとその行の下に読み上げ・例文・難易度・外すが開く
{
  await p.evaluate(() => {
    window.toggleBookmark('d1-v0', '単語', '水平', 'レベル、能力水準', 'shuǐpíng');
    window.toggleBookmark('d1-v1', '単語', '提高', '高める、向上させる', 'tígāo');
  });
  await p.evaluate(() => window.showBookmarks()); await p.waitForTimeout(250);
  const bm = await p.evaluate(() => {
    const panel = document.getElementById('bookmarkPanel');
    const ent = panel.querySelector('.bm-ent');
    return {
      ents: panel.querySelectorAll('.bm-ent').length,
      heading: !!panel.querySelector('.section-title'),
      tab: panel.querySelector('.w-chips button.on').textContent,
      row: ent ? ['.bm-row .zh', '.bm-row .pinyin', '.bm-row .bm-ja'].filter(q => !ent.querySelector(q)) : ['no entry'],
      // 閉じている行には、例文・難易度・読み上げ・外すを出さない（出すと羅列に戻る）
      closedExtras: ent ? ['.ex', '.lvc', '.speak-btn', '.w-bm', 'button.bookmark'].filter(q => ent.querySelector(q)) : [],
      exSwitch: !!panel.querySelector('.bm-exsw'),
      sortRows: new Set([...panel.querySelectorAll('.bm-sort button')].map(b => Math.round(b.getBoundingClientRect().top))).size,
    };
  });
  ok('ブックマークは1語1行で並ぶ', bm.ents === 2 && bm.row.length === 0, JSON.stringify(bm));
  ok('閉じた行には語・拼音・意味だけ（例文・難易度・読み上げは出さない）', bm.closedExtras.length === 0, JSON.stringify(bm.closedExtras));
  ok('見出し・「例文」切替は出さない', !bm.heading && !bm.exSwitch, JSON.stringify(bm));
  ok('件数は切り替えの中に入る', /★\s*2/.test(bm.tab), bm.tab);
  ok('並び替え4つが1行に収まる', bm.sortRows === 1, 'rows=' + bm.sortRows);
  // 行を押すと、その場で詳しい中身が開く（中身は減らしていない）
  const y0 = await p.evaluate(() => window.scrollY);
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d1-v1"] .bm-row'); await p.waitForTimeout(200);
  const opened = await p.evaluate(() => {
    const e = document.querySelector('#bookmarkPanel .bm-ent[data-bmid="d1-v1"]');
    return { open: e.classList.contains('open'), aria: e.querySelector('.bm-row').getAttribute('aria-expanded'),
      missing: ['.speak-btn', '.ex', '.w-bm', '.w-go'].filter(q => !e.querySelector(q)),
      ex: (e.querySelector('.ex') || {}).textContent || '',
      others: document.querySelectorAll('#bookmarkPanel .bm-ent.open').length };
  });
  ok('行を押すとその場で開き、読み上げ・例文・★・Dayへが出る',
    opened.open && opened.aria === 'true' && opened.missing.length === 0 && opened.ex.includes('我想提高'), JSON.stringify(opened));
  ok('開くのは押した行だけ', opened.others === 1, JSON.stringify(opened));
  // 手で付ける難易度はやめた。開いた中にも出さない
  ok('開いた中に難易度ボタンを出さない', !(await p.$('#bookmarkPanel .lvc')));
  // 並び替えで描き直しても、開いた項目は開いたまま
  await p.click('#bookmarkPanel .bm-sort button[data-id="added"]'); await p.waitForTimeout(200);
  const kept = await p.evaluate(() => !!document.querySelector('#bookmarkPanel .bm-ent.open[data-bmid="d1-v1"]'));
  ok('並び替えても開いた項目は開いたまま', kept);
  // もう一度押すと閉じる
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d1-v1"] .bm-row'); await p.waitForTimeout(200);
  const closed = await p.evaluate(() => !document.querySelector('#bookmarkPanel .bm-ent.open'));
  ok('もう一度押すと閉じる', closed);
  await p.click('#bookmarkPanel .bm-sort button[data-id="recommend"]'); await p.waitForTimeout(150);
  // 開いた中の「ブックマークを外す」で一覧から消える
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d1-v0"] .bm-row'); await p.waitForTimeout(150);
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d1-v0"] .w-bm'); await p.waitForTimeout(200);
  const gone = await p.evaluate(() => ({ v0: !!document.querySelector('#bookmarkPanel .bm-ent[data-bmid="d1-v0"]'), n: document.querySelectorAll('#bookmarkPanel .bm-ent').length }));
  ok('開いた中の「★ ブックマーク済み」を押すと★の一覧から消える', !gone.v0 && gone.n === 1, JSON.stringify(gone));
  await p.evaluate(() => { window.toggleBookmark('d1-v1'); });
  // 古いブックマーク（例文を持たず、idの形も今と違う）でも、見出し語から例文を引く
  await p.evaluate(() => window.toggleBookmark('old-shuiping', '単語', '水平', 'レベル'));
  await p.waitForTimeout(200);
  await p.click('#bookmarkPanel .bm-ent[data-bmid="old-shuiping"] .bm-row'); await p.waitForTimeout(200);
  const oldEx = await p.evaluate(() => {
    const e = document.querySelector('#bookmarkPanel .bm-ent .ex');
    return e ? e.textContent : '';
  });
  ok('古いブックマークでも見出し語から例文を引く', oldEx.includes('我的中文水平'), oldEx.slice(0, 30));
  await p.evaluate(() => window.toggleBookmark('old-shuiping'));
  // 教材を組み直す前の文法ブックマーク：見出しに後ろ書きが付き、Dayも今とずれている（実機のデータ）
  await p.evaluate(() => window.toggleBookmark('d81-g0', '文法', 'V起来：印象：自然会話での使い方', '〜してみると、〜な感じ'));
  await p.waitForTimeout(200);
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d81-g0"] .bm-row'); await p.waitForTimeout(200);
  const oldG = await p.evaluate(() => {
    const e = document.querySelector('#bookmarkPanel .bm-ent.bm-g');
    return e ? { zh: e.querySelector('.bm-row .zh').textContent.trim(), meta: e.querySelector('.bm-dfoot .w-go').textContent,
      ex: (e.querySelector('.ex') || {}).textContent || '', size: getComputedStyle(e.querySelector('.bm-row .zh')).fontSize } : null;
  });
  ok('古い文法ブックマークは今の名前・Day・例文で出す',
    oldG && oldG.zh === 'V起来：印象' && /Day 23/.test(oldG.meta) && oldG.ex.includes('听起来'), JSON.stringify(oldG));
  await p.evaluate(() => window.toggleBookmark('d81-g0'));
  // 「〜」の抜けた古い見出し（今は「对〜来说」）でも今の項目として出す（実機のデータ）
  await p.evaluate(() => window.toggleBookmark('d76-g9', '文法', '对来说：自然会話での使い方', '〜にとって'));
  await p.waitForTimeout(200);
  const oldD = await p.evaluate(() => {
    const e = document.querySelector('#bookmarkPanel .bm-ent[data-bmid="d76-g9"]');
    return e ? { zh: e.querySelector('.bm-row .zh').textContent, py: (e.querySelector('.bm-row .pinyin') || {}).textContent || '' } : null;
  });
  ok('「〜」の抜けた古い見出しも今の名前と拼音で出す', oldD && oldD.zh === '对〜来说' && oldD.py.includes('duì'), JSON.stringify(oldD));
  await p.evaluate(() => window.toggleBookmark('d76-g9'));
  // 字の大きさは語も文法も同じ。文字サイズ「大」でも拼音が見出しより大きくならない（実機で指摘された）
  await p.evaluate(() => {
    window.toggleBookmark('d1-v0', '単語', '水平', 'レベル、能力水準', 'shuǐpíng');
    window.toggleBookmark('d23-g0', '文法', 'V起来：印象', '〜してみると、〜な感じ');
  });
  await p.waitForTimeout(150);
  const sizes = [];
  for (const fs of ['', 'fs-sm', 'fs-lg']) {
    sizes.push(await p.evaluate((fs) => {
      document.body.classList.remove('fs-sm', 'fs-lg'); if (fs) document.body.classList.add(fs);
      const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      const r = { fs, v: px('#bookmarkPanel .bm-ent[data-bmid="d1-v0"] .bm-row .zh'), g: px('#bookmarkPanel .bm-ent[data-bmid="d23-g0"] .bm-row .zh'),
        py: px('#bookmarkPanel .bm-ent[data-bmid="d1-v0"] .bm-row .pinyin') };
      document.body.classList.remove('fs-sm', 'fs-lg');
      return r;
    }, fs));
  }
  ok('語と文法の見出しは同じ大きさ（文字サイズの設定3段とも）', sizes.every(r => r.v === r.g), JSON.stringify(sizes));
  ok('拼音は見出しの7割以下（文字サイズ「大」でもふくらまない）', sizes.every(r => r.py <= r.v * 0.7), JSON.stringify(sizes));
  ok('文字サイズの設定で大きさが変わる', sizes[1].v < sizes[0].v && sizes[0].v < sizes[2].v, JSON.stringify(sizes));
  await p.evaluate(() => { window.toggleBookmark('d1-v0'); window.toggleBookmark('d23-g0'); });
}

// --- 点検で見つけた崩れ（2026年9月25日）。戻さないこと ---
{
  // ブックマークの行を開いても、回した「›」で右端がはみ出さない
  await p.evaluate(() => { window.toggleBookmark('d1-v0', '単語', '水平', 'レベル、能力水準', 'shuǐpíng'); window.showBookmarks(); });
  await p.waitForTimeout(200);
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d1-v0"] .bm-row'); await p.waitForTimeout(250);
  const ov = await p.evaluate(() => { const r = document.querySelector('#bookmarkPanel .bm-ent.open .bm-row'); return [r.scrollWidth, r.clientWidth]; });
  ok('ブックマークの行を開いても右端がはみ出さない', ov[0] <= ov[1], JSON.stringify(ov));
  // マイ単語タブ：ブックマーク側と揃える（見出し・件数の札・「学習画面に戻る」を出さない）
  await p.click('#bookmarkPanel [data-action="wf"][data-id="cw"]'); await p.waitForTimeout(200);
  const cw = await p.evaluate(() => { const panel = document.getElementById('bookmarkPanel');
    return { h2: !!panel.querySelector('.section-title'), back: panel.textContent.includes('学習画面に戻る'), add: !!panel.querySelector('[data-cw-action="new"]') }; });
  ok('マイ単語タブに見出し・「学習画面に戻る」を出さない（追加ボタンは残す）', !cw.h2 && !cw.back && cw.add, JSON.stringify(cw));
  await p.click('#bookmarkPanel [data-action="wf"][data-id="bm"]'); await p.waitForTimeout(150);
  await p.evaluate(() => window.toggleBookmark('d1-v0'));
  // Day学習の単語カード：例文の中国語・拼音・和訳を同じ揃えにする（拼音と和訳だけ中央寄せになっていた）
  await p.evaluate(() => window.showDay(1)); await p.waitForTimeout(250);
  const al = await p.evaluate(() => { const c = document.querySelector('.wcard .wex'); if (!c) return null;
    return [...c.children].filter(e => e.offsetParent).map(e => getComputedStyle(e).textAlign); });
  ok('単語カードの例文は3行とも同じ揃え', al && al.length >= 2 && new Set(al.map(a => a === 'start' ? 'left' : a)).size === 1, JSON.stringify(al));
  // 模試の「ここまでで採点する」はブラウザ既定の青にしない
  const link = await p.evaluate(() => { const a = document.createElement('a'); a.className = 'mt-finish'; a.href = '#'; a.textContent = 'x';
    document.body.appendChild(a); const c = getComputedStyle(a).color; a.remove(); return c; });
  ok('模試の「ここまでで採点する」は既定の青いリンク色にしない', link !== 'rgb(0, 0, 238)', link);
  await p.evaluate(() => window.showToday()); await p.waitForTimeout(150);
}

// --- 字の大きさの上下関係（文字サイズ3段とも）。全体向けの body.fs-lg .zh 等に負けて逆転していた ---
{
  const res = [];
  for (const fs of ['fs-sm', '', 'fs-lg']) {
    await p.evaluate(() => window.showDay(1)); await p.waitForTimeout(200);
    res.push(await p.evaluate((fs) => {
      document.body.classList.remove('fs-sm', 'fs-lg'); if (fs) document.body.classList.add(fs);
      document.querySelectorAll('.dstep').forEach(d => d.classList.add('on'));
      const px = (sel) => { const e = [...document.querySelectorAll(sel)].find(x => x.offsetParent); return e ? parseFloat(getComputedStyle(e).fontSize) : NaN; };
      const r = { fs, zh: px('.wcard.on>.zh'), py: px('.wcard.on>.pinyin'), ja: px('.wcard.on>.ja'), ex: px('.wcard.on .wex .cw-ex'), expy: px('.wcard.on .wex .expinyin'), exja: px('.wcard.on .wex .exja'),
        gh: px('.gitem h3'), gpy: px('.gitem .item-head .pinyin'), gex: px('.gitem .ex .cw-ex'), gexpy: px('.gitem .expinyin'), gexja: px('.gitem .exja') };
      document.body.classList.remove('fs-sm', 'fs-lg');
      return r;
    }, fs));
  }
  ok('単語カード：見出し語＞意味、例文の中国語＞和訳、拼音＜意味（文字サイズ3段とも）',
    res.every(r => r.zh > r.ja && r.ex > r.exja && r.py < r.ja && r.expy < r.exja), JSON.stringify(res));
  ok('単語カード：文字サイズ「大」で見出し語が縮まない（小＜中＜大）', res[0].zh < res[1].zh && res[1].zh < res[2].zh, JSON.stringify(res.map(r => r.zh)));
  ok('文法の項目：見出し＞拼音、例文の中国語＞例文の拼音・和訳（3段とも）',
    res.every(r => r.gh > r.gpy && r.gex > r.gexpy && r.gex > r.gexja), JSON.stringify(res));
  await p.evaluate(() => window.showToday()); await p.waitForTimeout(150);
}

// --- ブックマークの意味は必ず1行（長い文法でも折れない。入り切らなければ「…」、開くと全文） ---
{
  await p.evaluate(() => {
    window.toggleBookmark('d1-g0', '文法', '了：状態変化', '状況が新しく変わったことを表す');
    window.toggleBookmark('d24-g0', '文法', '是〜的：強調', 'すでに起きたことの時・場所・方法を強調する');
    window.showBookmarks();
  });
  const sizes = [[440, 'fs-lg'], [390, ''], [375, 'fs-lg']];
  const out = [];
  for (const [w, fs] of sizes) {
    await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(150);
    out.push(await p.evaluate((fs) => {
      document.body.classList.remove('fs-sm', 'fs-lg'); if (fs) document.body.classList.add(fs);
      // 1行に収まる・見出しと意味が重ならない
      const r = [...document.querySelectorAll('#bookmarkPanel .bm-row')].map(row => {
        const j = row.querySelector('.bm-ja'), z = row.querySelector('.zh');
        const lh = parseFloat(getComputedStyle(j).lineHeight);
        return j.getBoundingClientRect().height <= lh * 1.3 && z.getBoundingClientRect().right <= j.getBoundingClientRect().left + 1; });
      document.body.classList.remove('fs-sm', 'fs-lg');
      return r.every(Boolean);
    }, fs));
  }
  ok('ブックマークの意味は1行に収まり、見出しと重ならない（440/390/375・文字サイズ「大」含む）', out.every(Boolean), JSON.stringify(out));
  await p.click('#bookmarkPanel .bm-row'); await p.waitForTimeout(150);
  const full = await p.evaluate(() => { const j = document.querySelector('#bookmarkPanel .bm-ent.open .bm-ja');
    return { ws: getComputedStyle(j).whiteSpace, fits: j.scrollWidth <= j.clientWidth + 1 && j.getBoundingClientRect().right <= document.querySelector('#bookmarkPanel .bm-ent.open .bm-row').getBoundingClientRect().right + 1 }; });
  ok('開いた行では意味を省かず全文を、枠からはみ出さずに出す', full.ws === 'normal' && full.fits, JSON.stringify(full));
  await p.evaluate(() => { window.toggleBookmark('d1-g0'); window.toggleBookmark('d24-g0'); });
  // スマホ向けの調整は幅440（利用者の大型機）でも390でも同じ
  const pads = [];
  for (const w of [390, 440]) { await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(100);
    pads.push(await p.evaluate(() => { const b = document.createElement('button'); document.body.appendChild(b); const v = getComputedStyle(b).padding; b.remove(); return v; })); }
  ok('スマホ向けの見た目は機種の幅で変わらない（390と440で同じ）', pads[0] === pads[1], JSON.stringify(pads));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => window.showToday()); await p.waitForTimeout(150);
}

// --- 苦手は復習の最後の手応えで決まる（手で付ける難易度をやめた。2026年9月） ---
{
  const weak = await p.evaluate(() => {
    const S = window.state; const now = Date.now();
    S.srs['d1-v0'] = { ef: 2.3, interval: 1, reps: 0, due: now, last: now - 1000, lapses: 1, q: 2 };   // もう一度
    S.srs['d1-v1'] = { ef: 2.4, interval: 6, reps: 2, due: now, last: now, lapses: 0, q: 3 };           // 難しい
    S.srs['d1-v2'] = { ef: 2.6, interval: 6, reps: 2, due: now, last: now, lapses: 1, q: 4 };           // 普通＝外れる
    S.srs['d1-v3'] = { ef: 2.3, interval: 1, reps: 0, due: now, last: now, lapses: 1 };                 // 手応えを記録する前の「もう一度」
    localStorage.setItem('hsk4-word-filter', 'hard'); window.showToday(); window.showVocab();
    const ids = [...document.querySelectorAll('#bookmarkPanel .bm-ent')].map(e => e.dataset.bmid);
    const cls = id => { const e = document.querySelector('#bookmarkPanel .bm-ent[data-bmid="' + id + '"]'); return e ? e.className : ''; };
    return { ids, n: document.querySelector('#bookmarkPanel [data-id="hard"] small').textContent, c0: cls('d1-v0'), c1: cls('d1-v1') };
  });
  ok('苦手に「もう一度」「難しい」と、記録前の「もう一度」が入り、「普通」は入らない',
    weak.ids.includes('d1-v0') && weak.ids.includes('d1-v1') && weak.ids.includes('d1-v3') && !weak.ids.includes('d1-v2') && weak.n === '3', JSON.stringify(weak));
  ok('つまずき順：もう一度が難しいより上', weak.ids.indexOf('d1-v0') < weak.ids.indexOf('d1-v1'), weak.ids.join(','));
  ok('左の色罫：もう一度＝lv-2、難しい＝lv-1', /lv-2/.test(weak.c0) && /lv-1/.test(weak.c1), JSON.stringify(weak));
  await p.evaluate(() => { ['d1-v0', 'd1-v1', 'd1-v2', 'd1-v3'].forEach(id => delete window.state.srs[id]); localStorage.setItem('hsk4-word-filter', 'all'); window.showToday(); });
}

// --- 単語タブから語を開いたら、単語一覧へ戻れる（出口が「今日へ」「次へ」しかなかった） ---
{
  await p.evaluate(() => window.showVocab()); await p.waitForTimeout(300);
  await p.click('#bookmarkPanel [data-action="wf"][data-id="all"]'); await p.waitForTimeout(300);
  // 少し下の語（Day 2 の2語目）を開いて「Day 2 で学ぶ →」を押す。押した語のカードが開き、出口は「単語一覧へ」
  const target = await p.evaluate(() => { const r = document.querySelector('#bookmarkPanel .bm-ent[data-bmid="d2-v1"]');
    r.scrollIntoView({ block: 'center' }); return r.querySelector('.bm-row .zh').textContent; });
  await p.click('#bookmarkPanel .bm-ent[data-bmid="d2-v1"] .bm-row'); await p.waitForTimeout(200);
  const star = await p.evaluate(() => { const e = document.querySelector('#bookmarkPanel .bm-ent.open'); return { bm: e.querySelector('.w-bm').textContent, go: e.querySelector('.w-go').textContent }; });
  ok('「すべて」で開くと ☆ と「Day N で学ぶ」が出る', /☆/.test(star.bm) && /Day 2 で学ぶ/.test(star.go), JSON.stringify(star));
  // ☆を押すと、その語のDayで★に入る（開いているDayではなく）
  await p.click('#bookmarkPanel .bm-ent.open .w-bm'); await p.waitForTimeout(200);
  const added = await p.evaluate(() => ({ txt: document.querySelector('#bookmarkPanel .bm-ent.open .w-bm').textContent,
    rowStar: !!document.querySelector('#bookmarkPanel .bm-ent.open .bm-row .bm-star'), cnt: document.querySelector('#bookmarkPanel [data-id="bm"] small').textContent }));
  ok('開いた中の ☆ で★が付き、行と件数にも出る', /★/.test(added.txt) && added.rowStar && added.cnt === '1', JSON.stringify(added));
  await p.click('#bookmarkPanel .bm-ent.open .w-bm'); await p.waitForTimeout(200);
  const y0 = await p.evaluate(() => window.scrollY);
  await p.click('#bookmarkPanel .bm-ent.open .w-go');
  await p.waitForTimeout(400);
  const inDay = await p.evaluate(() => ({ back: document.getElementById('topBack').textContent, card: (document.querySelector('.wcard.on>.zh') || {}).textContent || '' }));
  ok('単語タブから開くと、押した語のカードが出る', inDay.card.trim().startsWith(target), JSON.stringify({ target, card: inDay.card.trim() }));
  ok('単語タブから開いたDayの出口は「単語一覧へ」', /単語一覧/.test(inDay.back), inDay.back);
  await p.click('#topBack'); await p.waitForTimeout(500);
  const back = await p.evaluate(() => ({ list: document.querySelectorAll('#bookmarkPanel .bm-ent').length, y: window.scrollY }));
  ok('「単語一覧へ」で単語一覧の元の位置へ戻る', back.list > 0 && Math.abs(back.y - y0) < 40, JSON.stringify({ y0, back }));
  // 今日画面から開いたDayでは、出口は従来どおり「今日へ」
  await p.evaluate(() => { window.showToday(); window.showDay(1); }); await p.waitForTimeout(250);
  const tb = await p.evaluate(() => document.getElementById('topBack').textContent);
  ok('今日画面から開いたDayの出口は「今日へ」のまま', /今日へ/.test(tb), tb);
  await p.evaluate(() => window.showToday()); await p.waitForTimeout(150);
}

// --- 同期：画面を描くだけでは「更新した」扱いにしない（Day 89 の完了が戻った件） ---
{
  await p.evaluate(() => localStorage.setItem('hsk4-90-v4-state-updatedAtMs', '1000'));
  await p.evaluate(() => { window.showToday(); window.showVocab(); window.showSettings(); window.showToday(); });
  await p.waitForTimeout(200);
  const ts1 = await p.evaluate(() => localStorage.getItem('hsk4-90-v4-state-updatedAtMs'));
  ok('画面を開くだけでは最終更新が進まない（古い端末がクラウドを上書きしない）', ts1 === '1000', ts1);
  await p.evaluate(() => { window.toggleBookmark('d1-v0', '単語', '水平', 'レベル'); window.toggleBookmark('d1-v0'); });
  const ts2 = await p.evaluate(() => Number(localStorage.getItem('hsk4-90-v4-state-updatedAtMs')));
  ok('学習の操作をしたら最終更新が進む', ts2 > 1000, String(ts2));
}

// --- 聞きとりの答え合わせ：「もう一度聞く」は本文の前に、押すたびに再生／一時停止 ---
{
  await p.evaluate(() => window.showDay(1)); await p.waitForTimeout(250);
  for (let i = 0; i < 20; i++) {
    if ((await p.textContent('#content .dstep-label') || '').includes('聞きとる')) break;
    await p.click('#bottomNext'); await p.waitForTimeout(100);
  }
  if (await p.$('#lsPlayBtn')) { await p.click('#lsPlayBtn'); await p.waitForTimeout(150); }
  await p.evaluate(() => { const a = window.__audios.at(-1); a.paused = true; a.onended && a.onended(); });
  await p.waitForTimeout(150);
  await p.evaluate(() => { const b = document.querySelector('#lsRoot .ls-opt, #lsTfOk'); b && b.click(); });
  await p.waitForTimeout(200);
  const lay = await p.evaluate(() => {
    const r = document.getElementById('lsReplayBtn'), t = document.querySelector('#lsRoot .ls-transcript'), n = document.querySelector('#lsRoot .note');
    return { r: !!r, beforeTranscript: !!(r && t && (r.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)),
      afterNote: !!(r && n && (n.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)), label: r ? r.textContent : '' };
  });
  ok('答え合わせの「もう一度聞く」は解説のあと・本文の前にある', lay.r && lay.beforeTranscript && lay.afterNote, JSON.stringify(lay));
  await p.click('#lsReplayBtn'); await p.waitForTimeout(150);
  const playing = await p.evaluate(() => ({ paused: window.__audios.at(-1).paused, label: document.getElementById('lsReplayBtn').textContent }));
  await p.evaluate(() => { window.__audios.at(-1).currentTime = 3; });   // 少し聞いたところで止める
  await p.click('#lsReplayBtn'); await p.waitForTimeout(150);
  const paused = await p.evaluate(() => ({ paused: window.__audios.at(-1).paused, label: document.getElementById('lsReplayBtn').textContent }));
  ok('「もう一度聞く」は押すたびに再生と一時停止が切り替わる',
    !playing.paused && /一時停止/.test(playing.label) && paused.paused && /続きから/.test(paused.label), JSON.stringify({ playing, paused }));
  await p.evaluate(() => window.showToday()); await p.waitForTimeout(150);
}

// --- ホーム画面から起動したときは、ロゴを iOS のぼかし（安全域＋約34pt）の外へ下げる ---
{
  const r = await p.evaluate(() => {
    const t = document.querySelector('.top');
    const before = parseFloat(getComputedStyle(t).paddingTop);
    document.documentElement.classList.add('standalone');
    const after = parseFloat(getComputedStyle(t).paddingTop);
    document.documentElement.classList.remove('standalone');
    // 幅の条件（@media）の中に書くと、幅440ptの大型機で効かなかった（実機で一度も効いていなかった）
    let inMedia = null, top = false;
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const ru of rules) {
        if (ru.selectorText === 'html.standalone .top') top = true;
        if (ru.media && [...ru.cssRules].some(x => x.selectorText === 'html.standalone .top')) inMedia = ru.media.mediaText;
      }
    }
    return { before, after, top, inMedia };
  });
  ok('ホーム画面起動ではロゴを下げる（上余白が安全域＋44px）', r.after === 44 && r.after > r.before, JSON.stringify(r));
  ok('その規則は画面幅で絞らない', r.top && !r.inMedia, JSON.stringify(r));
}

// --- 起動画面の「加油」は炎と中心が揃う（字間と字下げを同じだけ動かす） ---
{
  const kf = await p.evaluate(() => {
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const ru of rules) if (ru.name === 'splash-word')
        return [...ru.cssRules].map(k => [k.style.letterSpacing, k.style.textIndent]);
    }
    return null;
  });
  ok('起動画面の字間と字下げがどの瞬間も同じ（中心がずれない）',
    kf && kf.every(([a, b]) => a && a === b), JSON.stringify(kf));
}

// --- 手で付けていた曖昧・苦手は、一度だけ★へ移す（黙って消さない） ---
{
  const KEY = 'hsk4-90-v4-state';
  await p.evaluate((KEY) => { const st = JSON.parse(localStorage.getItem(KEY));
    st.levels = { 'd3-v0': 2, 'd3-v1': 1, 'd3-v2': 0 }; st.lvMigrated = false;
    ['d3-v0', 'd3-v1', 'd3-v2'].forEach(id => delete st.bookmarks[id]);
    localStorage.setItem(KEY, JSON.stringify(st)); }, KEY);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600);
  const m = await p.evaluate(() => { const S = window.state, b = S.bookmarks;
    return { v0: b['d3-v0'] && b['d3-v0'].day, v1: !!b['d3-v1'], v2: !!b['d3-v2'], flag: S.lvMigrated, kept: S.levels['d3-v0'] }; });
  ok('曖昧・苦手の印は★へ移る（その語のDayで。普通は移さない。levels は残す）',
    m.v0 === 3 && m.v1 && !m.v2 && m.flag === true && m.kept === 2, JSON.stringify(m));
  await p.evaluate(() => window.toggleBookmark('d3-v0'));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600);
  ok('移したあとで★を外しても、次の起動で戻ってこない', await p.evaluate(() => !window.state.bookmarks['d3-v0']));
}

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
