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
  const txt = await p.textContent('#content');
  ok('初回起動で級診断が出る', txt.includes('あなたに合う級'));
  ok('スキップできる', !!(await p.$('[data-lc-action="skip"]')));
  await p.click('[data-lc-action="skip"]'); await p.waitForTimeout(400);
  ok('スキップで今日画面へ', (await p.textContent('#content')).includes('今日やること'));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600);
  ok('2回目は診断が出ない', (await p.textContent('#content')).includes('今日やること'));
  await c.close();
}

// --- リスニング問題（各級5問目） ---
{
  const { c, p } = await fresh();
  await p.click('[data-lc-action="start"]'); await p.waitForTimeout(300);
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
  await p.click('[data-lc-action="start"]'); await p.waitForTimeout(300);
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
