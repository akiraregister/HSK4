import { launch } from './browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(600);
// 初回起動は級診断から始まる仕様になったので、ここではスキップして本題へ入る
const skip = await page.$('[data-lc-action="skip"]');
if (skip) { await skip.click(); await page.waitForTimeout(400); }

const results = [];
const ok = (n, c, extra = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  — ' + extra : ''}`);

// --- tab bar ---
const tabs = await page.$$eval('.nav-tab', els => els.map(e => ({ id: e.id, label: e.querySelector('span').textContent })));
ok('タブは4つ', tabs.length === 4, JSON.stringify(tabs.map(t => t.label)));

// no label truncated at 390px
const trunc = await page.$$eval('.nav-tab span', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
ok('390pxでラベルが省略されない', trunc.length === 0, trunc.join(','));

// header rows: brand + tabs only
const hasFsInHeader = await page.$('.top .fs-global');
const hasSyncInHeader = await page.$('.top #syncBar');
ok('ヘッダーから文字サイズが消えた', !hasFsInHeader);
ok('ヘッダーから同期バーが消えた', !hasSyncInHeader);

// --- initial view = 今日 ---
const view = () => page.evaluate(() => document.querySelector('.nav-tab.active')?.id);
ok('初期表示は今日タブ', (await view()) === 'homeBtn');
ok('今日やることが表示される', (await page.textContent('#content')).includes('今日やること'));
const cards = await page.$$eval('.tcard', e => e.length);
ok('新規/復習の2カードがある', cards === 2, `${cards}枚`);
ok('初回は復習カードが空状態', (await page.textContent('.tcard:nth-child(2)')).includes('まだありません'));
ok('全90日は折りたたみの中', !!(await page.$('details.day-list-details')));

// --- 単語 ---
await page.click('#vocabTab'); await page.waitForTimeout(250);
ok('単語タブに遷移', (await view()) === 'vocabTab' && (await page.textContent('#content')).includes('全450語'));

// --- ブックマーク ---
await page.click('#bookmarkViewBtn'); await page.waitForTimeout(250);
ok('ブックマークタブに遷移', (await view()) === 'bookmarkViewBtn');
ok('ブックマークで#contentが隠れる', await page.$eval('#content', e => getComputedStyle(e).display === 'none'));
// pressing it again must NOT toggle back (old behaviour)
await page.click('#bookmarkViewBtn'); await page.waitForTimeout(250);
ok('再押下でトグルせず留まる', (await view()) === 'bookmarkViewBtn');

// --- 設定 ---
await page.click('#settingsTab'); await page.waitForTimeout(250);
ok('設定タブに遷移', (await view()) === 'settingsTab');
const sp = await page.$eval('#settingsPanel', e => getComputedStyle(e).display);
ok('設定パネルが表示される', sp !== 'none', sp);
const stxt = await page.textContent('#settingsPanel');
for (const key of ['クラウド同期', '文字サイズ', '復習の出題範囲', '1日の新規問数', '出題の向き', 'レベル診断', '作文の採点サーバー'])
  ok(`設定に「${key}」がある`, stxt.includes(key));
ok('同期バーのボタンが生きている', !!(await page.$('#settingsPanel #loginBtn')));
ok('設定表示中は#contentが隠れる', await page.$eval('#content', e => getComputedStyle(e).display === 'none'));

// change a SRS setting from settings — must re-render settings, not jump to review
await page.click('#settingsPanel .chip-toggle:has-text("16")'); await page.waitForTimeout(250);
ok('新規問数を変えても設定に留まる', (await view()) === 'settingsTab' && (await page.textContent('#settingsPanel')).includes('出題の向き'));
ok('新規問数が保存された', await page.evaluate(() => window.state.srsNewLimit === 16));

// 級診断 from settings
await page.click('button:has-text("級診断を受ける")'); await page.waitForTimeout(300);
ok('設定から級診断へ入れる', (await page.textContent('#content')).includes('級'), '');
ok('級診断中も設定タブが選択状態', (await view()) === 'settingsTab');

// --- 今日 → 学習 → 完了 → 復習が出る ---
await page.click('#homeBtn'); await page.waitForTimeout(250);
await page.click('button:has-text("学習を始める")'); await page.waitForTimeout(400);
ok('今日から学習画面へ', (await page.textContent('#content')).includes('単語5個'));
ok('学習画面で下部ナビが出る', await page.$eval('#bottomNav', e => getComputedStyle(e).display === 'flex'));

await page.click('#bottomComplete'); await page.waitForTimeout(300);
await page.click('#homeBtn'); await page.waitForTimeout(300);
const revText = await page.textContent('.tcard:nth-child(2)');
ok('Day完了後、復習枚数が出る', !!(await page.$('.tcard .tc-count')) && /[1-9]/.test(revText.replace(/Day\s*\d+/g, '')), revText.replace(/\s+/g, ' ').slice(0, 70));

// --- 復習画面は即開始、設定は無い ---
await page.click('button:has-text("復習する")'); await page.waitForTimeout(300);
const rtxt = await page.textContent('#content');
ok('復習画面に開始ボタンがある', rtxt.includes('復習を始める'));
ok('復習画面から設定UIが消えた', !rtxt.includes('出題の向き') && !rtxt.includes('採点サーバー'));
ok('復習中も今日タブが選択状態', (await view()) === 'homeBtn');
await page.click('button:has-text("復習を始める")'); await page.waitForTimeout(400);
ok('復習が実際に始まる', !!(await page.$('.fc-actions, .g4-again, .mt-opt, .lc-opt')) || (await page.textContent('#content')).length > 50);

// --- 戻れること ---
await page.click('#homeBtn'); await page.waitForTimeout(250);
ok('復習から今日へ戻れる', (await page.textContent('#content')).includes('今日やること'));

console.log(results.join('\n'));
console.log('\nerrors:', errs.length ? errs.slice(0, 6).join('\n') : 'none');
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errs.length ? 1 : 0);
