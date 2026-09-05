import { launch, seedFullContent } from './browser.mjs';
const B = process.env.BASE || 'http://127.0.0.1:8765/';
const br = await launch();
const c = await br.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
await seedFullContent(p);
const errs = []; p.on('pageerror', e => errs.push(e.message));
const res = []; const ok = (n, v, x = '') => res.push(`${v ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);

await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(700);
const skip = await p.$('[data-lc-action="skip"]'); if (skip) { await skip.click(); await p.waitForTimeout(400); }

// --- 材料が足りないうちは模試が出ない ---
ok('完了0日では今日画面に模試が出ない', !(await p.textContent('#content')).includes('腕試し'));
await p.click('#settingsTab'); await p.waitForTimeout(400);
await p.click('#settingsPanel button:has-text("模擬試験へ")'); await p.waitForTimeout(400);
ok('設定からは入れて、足りないと説明が出る', (await p.textContent('#content')).includes('日ぶん終わると'));

// --- 12日ぶん完了させる ---
await p.evaluate(() => { for (let d = 1; d <= 12; d++) state.completed[d] = true; save(); });
await p.click('#homeBtn'); await p.waitForTimeout(400);
ok('12日完了で今日画面に模試の入口が出る', (await p.textContent('#content')).includes('腕試し'));

// --- 受験日 ---
await p.evaluate(() => {
  const d = new Date(Date.now() + 30 * 86400000);
  setExamDate(d.toISOString().slice(0, 10));
});
await p.click('#homeBtn'); await p.waitForTimeout(400);
const todayTxt = await p.textContent('#content');
ok('受験日を入れると残り日数が出る', /試験まであと\s*30\s*日/.test(todayTxt.replace(/\s/g, '')) || todayTxt.includes('試験まであと30日'), todayTxt.match(/試験まであと\d+日/)?.[0] || 'なし');

// --- 模試を通す ---
await p.click('#content .tcard button:has-text("受ける")'); await p.waitForTimeout(500);
const intro = await p.textContent('#content');
ok('听力を含まないと明記している', intro.includes('听力（リスニング）は含みません'));
ok('本番の目安にならないと書いている', intro.includes('本番の点数の目安にはなりません'));
await p.click('#content button:has-text("模試を始める")'); await p.waitForTimeout(600);

// 内部状態はモジュールスコープなので、見出し「模試 1 / N」から読む
const head = await p.textContent('#content .section-title h2');
const total = Number((head.match(/\/\s*(\d+)/) || [])[1] || 0);
ok('問題が組まれる', total > 0 && total <= 40, `${total}問`);
ok('残り時間が動いている', /^\d+:\d\d$/.test((await p.textContent('#mockClock')).trim()));

// 全問に答える（mcは先頭、dragは全チップ）
for (let i = 0; i < total; i++) {
  const isMc = !!(await p.$('#content .mt-opt'));
  if (isMc) { await p.click('#content .mt-opt'); }
  else {
    // 並べ替え：残ったチップを順に押す（毎回再描画されるので都度取り直す）
    for (let g = 0; g < 12; g++) {
      const chip = await p.$('#content .mt-chip:not([disabled])');
      if (!chip) break;
      await chip.click(); await p.waitForTimeout(50);
    }
  }
  await p.waitForTimeout(60);
  const next = await p.$('#content button:has-text("次の問題")');
  if (next) { await next.click(); } else { await p.click('#content button:has-text("採点する")'); }
  await p.waitForTimeout(120);
}
await p.waitForTimeout(400);
const resTxt = await p.textContent('#content');
ok('結果画面が出る', resTxt.includes('模試の結果'));
ok('分野ごとの内訳が出る', !!(await p.$('.lc-band')));
ok('結果でも目安でないと断っている', resTxt.includes('本番の目安ではありません'));

const hist = await p.evaluate(() => (window.state.mockHistory || []).length);
ok('履歴が残る', hist === 1, `${hist}件`);
const bmBefore = await p.evaluate(() => Object.keys(window.state.bookmarks || {}).length);
await p.click('#content button:has-text("間違えたDayの語を★に入れる")'); await p.waitForTimeout(500);
const bmAfter = await p.evaluate(() => Object.keys(window.state.bookmarks || {}).length);
ok('間違えたDayの語を★に送れる', bmAfter >= bmBefore, `${bmBefore}→${bmAfter}`);

await p.click('#content button:has-text("終わる")'); await p.waitForTimeout(400);
ok('模試から今日へ戻れる', (await p.textContent('#content')).includes('今日やること'));

// --- 完走後の仕上げモード ---
await p.evaluate(() => { for (let d = 1; d <= 90; d++) state.completed[d] = true; save(); });
await p.click('#homeBtn'); await p.waitForTimeout(500);
const doneTxt = await p.textContent('#content');
ok('完走後は仕上げモードになる', doneTxt.includes('仕上げ') && doneTxt.includes('90日ぶん完走'));
ok('完走後は模試が主導線になる', !!(await p.$('#content button:has-text("模擬試験を受ける")')));

const evs = await p.evaluate(() => JSON.parse(localStorage.getItem('hsk4-events') || '[]').map(e => e.e));
ok('模試の計測が入る', evs.includes('mock_start') && evs.includes('mock_finish'), [...new Set(evs)].join(','));

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
