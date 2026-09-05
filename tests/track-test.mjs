import { launch, seedFullContent } from './browser.mjs';
const B = process.env.BASE || 'http://127.0.0.1:8765/';
const br = await launch();
const c = await br.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await c.newPage();
await seedFullContent(p);
const errs = []; p.on('pageerror', e => errs.push(e.message));
const res = []; const ok = (n, v, x = '') => res.push(`${v ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const evs = () => p.evaluate(() => JSON.parse(localStorage.getItem('hsk4-events') || '[]'));

// 計測セクションと採点サーバー設定は開発者向けなので ?debug=1 で有効化する
await p.goto(B + '?debug=1', { waitUntil: 'load' }); await p.waitForTimeout(700);
const skip = await p.$('[data-lc-action="skip"]'); if (skip) { await skip.click(); await p.waitForTimeout(400); }

// --- 学習の一連の操作でイベントが積まれるか ---
await p.click('#content button:has-text("学習を始める")'); await p.waitForTimeout(500);
let log = await evs();
ok('Dayを開くと day_open が入る', log.some(e => e.e === 'day_open' && e.p && e.p.day === 1), JSON.stringify(log.filter(e => e.e === 'day_open')[0] || {}));

await p.click('#bottomComplete'); await p.waitForTimeout(400);
log = await evs();
ok('完了で day_complete が入る', log.some(e => e.e === 'day_complete' && e.p && e.p.day === 1));

await p.click('#homeBtn'); await p.waitForTimeout(300);
await p.click('#content button:has-text("復習する")'); await p.waitForTimeout(300);
await p.click('#content button:has-text("復習を始める")'); await p.waitForTimeout(500);
log = await evs();
ok('復習開始で srs_start が入る', log.some(e => e.e === 'srs_start' && e.p && e.p.n > 0), JSON.stringify(log.filter(e => e.e === 'srs_start')[0]?.p || {}));

// 1枚だけ採点して終える
const reveal = await p.$('#content button:has-text("答えを見る")');
if (reveal) { await reveal.click(); await p.waitForTimeout(300); await p.click('#content .g4-good'); await p.waitForTimeout(300); }
const end = await p.$('#content button:has-text("復習を終了")');
if (end) { await end.click(); await p.waitForTimeout(400); }
log = await evs();
ok('ボタンで終えると srs_end が入る', log.some(e => e.e === 'srs_end' && e.p && e.p.how === 'button'), JSON.stringify(log.filter(e => e.e === 'srs_end')[0]?.p || {}));

// タブで離脱した場合も取りこぼさないこと（実際はこちらが多数派）
await p.click('#homeBtn'); await p.waitForTimeout(300);
await p.click('#content button:has-text("復習する")'); await p.waitForTimeout(300);
await p.click('#content button:has-text("復習を始める")'); await p.waitForTimeout(500);
await p.click('#vocabTab'); await p.waitForTimeout(400);
log = await evs();
ok('タブで離脱しても srs_end が入る', log.some(e => e.e === 'srs_end' && e.p && e.p.how === 'leave'), JSON.stringify(log.filter(e => e.e === 'srs_end').map(e=>e.p.how)));

// --- イベント名がプロパティに潰されていないこと（先に踏んだバグ） ---
ok('イベント名がすべて文字列', log.every(e => typeof e.e === 'string' && e.e.length > 0), [...new Set(log.map(e => e.e))].join(','));

// --- 設定の計測セクション ---
await p.click('#settingsTab'); await p.waitForTimeout(500);
const st = await p.textContent('#settingsPanel');
for (const k of ['計測', '記録', '開いたDay', '完了', '送信先URL'])
  ok(`設定に「${k}」がある`, st.includes(k));
ok('端末内のみと明記している', st.includes('この端末の中だけ'));

const shown = Number((st.match(/記録\s*(\d+)件/) || [])[1] || 0);
ok('件数が実際のログ数と一致', shown === log.length, `表示${shown} / 実際${log.length}`);

// --- 送信先URLの保存 ---
await p.fill('#sinkUrlInput', 'https://example.invalid/collect');
await p.click('#settingsPanel button:has-text("保存")'); await p.waitForTimeout(400);
const sink = await p.evaluate(() => localStorage.getItem('hsk4-sink-url'));
ok('送信先URLが保存される', sink === 'https://example.invalid/collect', String(sink));

// --- ログの消去 ---
await p.click('#settingsPanel button:has-text("消す")'); await p.waitForTimeout(400);
ok('ログを消せる', (await evs()).length === 0);

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length ? errs.slice(0, 3) : 'none');
const f = res.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${res.length - f}/${res.length} passed`);
await br.close();
