import { launch, seedFullContent } from './browser.mjs';
const B = process.env.BASE || 'http://127.0.0.1:8765/';
const br = await launch();
const res = [];
const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const errs = [];

async function fresh() {
  const c = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await seedFullContent(p);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  return { c, p };
}
// 初回は「案内 → 級診断」の順に出る。案内を抜けて級診断を始めるところまで。
async function toLevelCheck(p) {
  await p.click('#content .intro button'); await p.waitForTimeout(400);
  await p.click('[data-lc-action="start"]'); await p.waitForTimeout(300);
}

// 診断を最後まで答える。levelは3..6、指定levelまで正解して以降は誤答させる。
async function answerAll(p, upTo) {
  for (let i = 0; i < 16; i++) {
    const lv = await p.evaluate(i => window.__q[i].level, i);
    const ans = await p.evaluate(i => window.__q[i].answer, i);
    const opts = await p.$$('.lc-opt:not(.unknown)');
    let idx = 0;
    if (lv <= upTo) {
      const texts = await Promise.all(opts.map(o => o.textContent()));
      idx = Math.max(0, texts.findIndex(t => t.trim() === ans.trim()));
    } else {
      const texts = await Promise.all(opts.map(o => o.textContent()));
      idx = Math.max(0, texts.findIndex(t => t.trim() !== ans.trim()));
    }
    await opts[idx].click(); await p.waitForTimeout(60);
    await p.click('[data-lc-action="next"]'); await p.waitForTimeout(120);
  }
  await p.waitForTimeout(300);
}

// --- 初回起動で診断が出るか ---
{
  const { c, p } = await fresh();
  let txt = await p.textContent('#content');
  // 初回はまず案内を出す（分析のB1：価値を見せる前に7分を要求していた）
  ok('初回起動でまず案内が出る', !!(await p.$('#content .intro')), txt.slice(0, 30).replace(/\s+/g, ' '));
  ok('案内に90日と1日15分が出る', txt.includes('90日') && txt.includes('15分'));
  // 3つの訴求は積み上げずに1つずつ。最初は1つ目だけが開いている
  // （1つ目が出るのは 720ms。fresh() の 600ms だけでは間に合わない）
  await p.waitForTimeout(500);
  const openAt0 = await p.$$eval('#content .intro-rows>div', es => es.map(e => e.className));
  ok('案内は最初は1つ目だけを見せる',
    openAt0.filter(x => x.includes('intro-on')).length === 1 && !openAt0[1].includes('intro-on'),
    JSON.stringify(openAt0));
  // 2つ目が来ると1つ目は見出しだけ残して畳まれる（消さない。3つあることが見えなくなるため）
  await p.waitForTimeout(2800);
  const at1 = await p.$$eval('#content .intro-rows>div', es => es.map(e => e.className));
  ok('次が来ると前のものは畳まれる', at1[0].includes('intro-done') && at1[1].includes('intro-on'),
    JSON.stringify(at1));
  ok('畳んでも見出しは残る',
    (await p.textContent('#content')).includes('90日で終わります'));
  ok('案内でも下タブを出さない',
    await p.$eval('#tabBar', e => getComputedStyle(e).display === 'none'));
  await p.click('#content .intro button'); await p.waitForTimeout(500);
  txt = await p.textContent('#content');
  ok('案内のあとに級診断が出る', txt.includes('あなたに合う級'));
  ok('スキップできる', !!(await p.$('[data-lc-action="skip"]')));
  // 初回のオンボーディングは全画面。タブを出すと、まだ何も見ていない人が離脱できてしまう
  // うえ、級診断は設定から入る画面なので「設定」タブが選択状態になってしまう（分析のB2）
  ok('初回の級診断では下タブを出さない',
    await p.$eval('#tabBar', e => getComputedStyle(e).display === 'none'));
  await p.click('[data-lc-action="skip"]'); await p.waitForTimeout(400);
  ok('スキップで今日画面へ', (await p.textContent('#content')).includes('今日やること'));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600);
  ok('2回目は診断が出ない', (await p.textContent('#content')).includes('今日やること'));
  // 2回目以降は設定から入る画面なので、タブを出してよい
  await p.evaluate(() => window.showLevelCheck()); await p.waitForTimeout(400);
  ok('2回目以降の級診断では下タブが戻る',
    await p.$eval('#tabBar', e => getComputedStyle(e).display === 'flex'));
  await c.close();
}

// --- 起動スプラッシュ ---
{
  const { c, p } = await fresh();
  // CSS は 1800ms から薄くなり、JS が 2300ms に DOM から外す。片方だけ変えると
  // 「まだ見えているのに消える」「消えたあとも居座る」のどちらかになる
  const t = await p.evaluate(() => performance.now());
  await p.waitForTimeout(Math.max(0, 2600 - t));
  ok('スプラッシュは2.6秒までに消える',
    await p.$eval('#splash', e => e.classList.contains('gone')));
  await c.close();
}
{
  const { c, p } = await fresh();
  // 毎日開くアプリなので、待たされる感じは作らない。操作は pointer-events:none で
  // 下へ通しているので、タップが失われることはない
  await p.mouse.move(195, 400); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(80);
  ok('タップすれば待たずに消える',
    await p.$eval('#splash', e => e.classList.contains('gone')));
  ok('スプラッシュは操作を邪魔しない',
    await p.$eval('#splash', e => getComputedStyle(e).pointerEvents === 'none'));
  await c.close();
}
{
  // 動きを止めている人には動かさない。B-3の灯りは案Xの「影ゼロ」から外した例外なので、
  // 明滅しないただの影として残してはいけない
  const c = await br.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await c.newPage();
  await seedFullContent(p);
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(600);
  ok('動きを止めていれば灯りも出さない',
    await p.$eval('.splash-flame', e => getComputedStyle(e).filter === 'none'));
  ok('動きを止めていれば訴求は3つとも最初から開く',
    await p.$$eval('.intro-rows>div', es => es.every(e => e.classList.contains('intro-on'))));
  await c.close();
}
{
  // 灯りはスプラッシュの炎だけの例外。アプリ本体の影ゼロは保つ
  const { c, p } = await fresh();
  ok('アプリ本体の --sh は none のまま',
    (await p.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--sh').trim())) === 'none');
  await c.close();
}

// --- リスニング問題（各級5問目） ---
{
  const { c, p } = await fresh();
  await toLevelCheck(p);
  for (let i = 0; i < 4; i++) { // HSK3の最初の4問（テキスト）を飛ばす
    await p.click('.lc-opt.unknown'); await p.waitForTimeout(50);
    await p.click('[data-lc-action="next"]'); await p.waitForTimeout(90);
  }
  const listenTxt = await p.textContent('#content');
  ok('5問目はリスニング問題になる', listenTxt.includes('音声を再生'));
  ok('最初は中文が表示されない', !listenTxt.includes('我明天不去上班'));
  await p.click('[data-lc-action="listen"]'); await p.waitForTimeout(100);
  ok('再生ボタンを押してもエラーにならない', errs.length === 0, errs.join(','));
  await p.click('[data-lc-action="revealListen"]'); await p.waitForTimeout(200);
  ok('聞こえない場合は文字で確認できる', (await p.textContent('#content')).includes('我明天不去上班'));
  ok('選択肢はまだ選んでいない', (await p.$('.lc-opt.sel')) === null);
  await p.click('.lc-opt.unknown'); await p.waitForTimeout(50);
  await p.click('[data-lc-action="next"]'); await p.waitForTimeout(150);
  ok('リスニング問題の次は次の級（HSK4）へ進む', (await p.textContent('#content')).includes('估计'));
  await c.close();
}

// --- 3分岐 ---
// 判定アルゴリズムは既存で今回触っていないので、結果画面の「級を選ぶ」から
// 各級を直接選んで、分岐先だけを確かめる。
for (const [lv, label, expect] of [[3, 'HSK3', '少し背伸び'], [4, 'HSK4', '今日やること'], [5, 'HSK5', '易しすぎます']]) {
  const { c, p } = await fresh();
  await toLevelCheck(p);
  // 20問すべて「わからない」で流して結果画面へ
  for (let i = 0; i < 20; i++) {
    await p.click('.lc-opt.unknown'); await p.waitForTimeout(50);
    await p.click('[data-lc-action="next"]'); await p.waitForTimeout(90);
  }
  await p.waitForTimeout(300);
  ok(`${label}: 結果画面に到達`, (await p.textContent('#content')).includes('査定結果'));
  await p.click(`[data-lc-action="pick"][data-lv="${lv}"]`); await p.waitForTimeout(500);
  const after = await p.textContent('#content');
  ok(`${label} を選ぶと「${expect}」`, after.includes(expect), after.replace(/\s+/g, ' ').slice(0, 70));

  if (lv === 5) {
    ok('HSK5: 「おすすめしません」と正直に言う', after.includes('おすすめしません'));
    ok('HSK5: HSK4を続ける道も残す', !!(await p.$('[data-lc-action="startProgram"]')));
    await p.click('[data-lc-action="interest"]'); await p.waitForTimeout(400);
    ok('HSK5: 関心を送れる', (await p.textContent('#content')).includes('ありがとうございます'));
    const n = await p.evaluate(() => localStorage.getItem('hsk4-interest-hsk5'));
    ok('HSK5: 関心がカウントされる', n === '1', 'count=' + n);
    const evs = await p.evaluate(() => JSON.parse(localStorage.getItem('hsk4-events') || '[]').map(e => e.e));
    ok('計測イベントが溜まる', evs.includes('waitlist_interest') && evs.includes('level_check_done'), evs.join(','));
  }
  if (lv === 3) {
    await p.click('[data-lc-action="startProgram"]'); await p.waitForTimeout(400);
    ok('HSK3: Day1から始められる', (await p.textContent('#content')).includes('今日やること'));
  }
  await c.close();
}

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
