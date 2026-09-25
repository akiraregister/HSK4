import { launch, seedFullContent, passOnboarding } from './browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await seedFullContent(page);

const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(600);
// 初回起動は級診断から始まる仕様になったので、ここではスキップして本題へ入る
await passOnboarding(page);

const results = [];
const ok = (n, c, extra = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  — ' + extra : ''}`);

// --- tab bar（案Aで下へ移した） ---
const tabs = await page.$$eval('.nav-tab', els => els.map(e => ({ id: e.id, label: e.querySelector('span').textContent })));
ok('タブは4つ', tabs.length === 4, JSON.stringify(tabs.map(t => t.label)));

// no label truncated at 390px
const trunc = await page.$$eval('.nav-tab span', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
ok('390pxでラベルが省略されない', trunc.length === 0, trunc.join(','));

ok('タブはヘッダーではなく下タブにある', !(await page.$('.top .nav-tab')) && !!(await page.$('#tabBar .nav-tab')));
ok('下タブが画面下に固定されている', await page.$eval('#tabBar', e => getComputedStyle(e).position === 'fixed'));

// ヘッダーは細いバー1本。4タブを抱えていたころは約300pxあった
const topH = await page.$eval('.top', e => e.getBoundingClientRect().height);
ok('ヘッダーが細い（100px未満）', topH < 100, Math.round(topH) + 'px');

// header rows: brand only
const hasFsInHeader = await page.$('.top .fs-global');
const hasSyncInHeader = await page.$('.top #syncBar');
ok('ヘッダーから文字サイズが消えた', !hasFsInHeader);
ok('ヘッダーから同期バーが消えた', !hasSyncInHeader);

// --- initial view = 今日 ---
const view = () => page.evaluate(() => document.querySelector('.nav-tab.active')?.id);
ok('初期表示は今日タブ', (await view()) === 'homeBtn');
ok('今日画面が表示される', !!(await page.$('#content .today')));
// 今日画面は「主役1枚（.hero）＋復習・模試は行（.trow）」という形に変えた
ok('主役の学習カードが1枚だけ', (await page.$$eval('.hero', e => e.length)) === 1);
ok('復習は行になっている', !!(await page.$('.trow-rev')));
ok('初回は復習行が空状態で押せない', (await page.textContent('.trow-rev')).includes('Dayを1つ完了すると')
  && (await page.$eval('.trow-rev', e => e.disabled)));
ok('進捗が90マスの格子になっている', (await page.$$eval('.prog-grid i', e => e.length)) === 90);
ok('進捗の「x / 90」が見出しの大きさ', await page.$eval('.prog-big', e => parseFloat(getComputedStyle(e).fontSize) >= 24));
ok('全90日は折りたたみの中', !!(await page.$('details.day-list-details')));

// --- 単語 ---
await page.click('#vocabTab'); await page.waitForTimeout(250);
ok('単語タブに遷移', (await view()) === 'vocabTab' && (await page.textContent('#content')).includes('全498語'));

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
for (const key of ['クラウド同期', '文字サイズ', '復習の出題範囲', '1日の新規問数', '出題の向き', 'レベル診断'])
  ok(`設定に「${key}」がある`, stxt.includes(key));
ok('通常表示では開発者向け設定（作文の採点サーバー）が隠れている', !stxt.includes('作文の採点サーバー'));
ok('同期バーのボタンが生きている', !!(await page.$('#settingsPanel #loginBtn')));
ok('設定表示中は#contentが隠れる', await page.$eval('#content', e => getComputedStyle(e).display === 'none'));

// --- 設定は4グループ（アカウント／学習／表示／その他） ---
const groups = await page.$$eval('#settingsPanel .set-group-h', e => e.map(x => x.textContent.trim()));
ok('設定が4グループに分かれている', groups.length === 4, groups.join('／'));
ok('グループの並びが アカウント／学習／表示／その他',
  groups.join(',') === 'アカウント,学習,表示,その他', groups.join(','));
ok('選択肢が1行のセグメントに畳まれている', !!(await page.$('#settingsPanel .seg')));
// A6：機種変・再インストールのときの復元導線が設定に無かった
ok('「購入を復元」が設定にある', !!(await page.$('#settingsPanel #restoreBtn')));
ok('復元はアカウントのグループにある',
  await page.$eval('#restoreBtn', e => e.closest('.set-group').querySelector('.set-group-h').textContent.trim() === 'アカウント'));

// --- 案C：価格画面（paywallのプレビューで確認する） ---
// 全90日が index.html に入っているあいだは価格画面が出ないので、
// プレビューを入れて未購入の状態を作る。
await page.evaluate(() => window.setPaywallPreview(true));
await page.waitForTimeout(300);
await page.evaluate(() => window.showDay(50));
await page.waitForTimeout(400);
const priceTxt = await page.textContent('#content');
ok('未購入のDayで価格画面が出る', !!(await page.$('#content .price')));
ok('値段がアプリ内に出る（以前は一度も出なかった）', priceTxt.includes('¥4,800'));
ok('買い切りだと価格の近くに書いてある', priceTxt.includes('買い切り'));
ok('無料と有料の比較表がある', (await page.$$eval('#content .cmp tbody tr', e => e.length)) === 6);
// 閉じた <details> の中身は offsetParent が残るので checkVisibility で見る
ok('クーポン欄は畳まれている',
  await page.$eval('#content .coupon', e => !e.open)
  && !(await page.$eval('#couponInput', e => e.checkVisibility({ contentVisibilityAuto: true, checkVisibilityCSS: true }))));
ok('価格画面から購入を復元できる', !!(await page.$('#content .fine button')));
// 未購入のDayは学習のステップではないので、下の「戻る／完了」を出してはいけない
ok('価格画面に学習用の下バーを出さない',
  await page.$eval('#bottomNav', e => getComputedStyle(e).display === 'none'));
// 単語タブは全498語を出し、未購入分には拼音も和訳も付けない（分析のA5）
await page.evaluate(() => window.showVocab()); await page.waitForTimeout(600);
const vRows = await page.$$eval('.vrow', e => e.length);
const vLocked = await page.$$eval('.vrow-locked', e => e.length);
ok('単語タブに全498語が出る', vRows === 498, `${vRows}行`);
ok('未購入分に🔒が付く', vLocked === 463, `${vLocked}行`);
ok('未購入分に拼音を出さない', !(await page.$('.vrow-locked .vrow-py')));
ok('未購入分に和訳を出さない',
  (await page.$$eval('.vrow-locked .vrow-ja', e => [...new Set(e.map(x => x.textContent.trim()))])).join('') === '購入すると読めます');
await page.click('.vrow-locked'); await page.waitForTimeout(500);
ok('🔒の語をタップすると価格画面へ行く', !!(await page.$('#content .price')));

await page.evaluate(() => window.setPaywallPreview(false));
await page.waitForTimeout(300);
ok('プレビューを切ると中身が戻る', !(await page.$('#content .price')));
await page.evaluate(() => window.showVocab()); await page.waitForTimeout(500);
ok('プレビューを切ると🔒が消える', (await page.$$eval('.vrow-locked', e => e.length)) === 0);
// Day画面から設定へ戻す（学習中はタブが隠れているのでタブは押せない）
await page.evaluate(() => window.showSettings()); await page.waitForTimeout(400);

// change a SRS setting from settings — must re-render settings, not jump to review
await page.click('#settingsPanel .seg button:has-text("16")'); await page.waitForTimeout(250);
ok('新規問数を変えても設定に留まる', (await view()) === 'settingsTab' && (await page.textContent('#settingsPanel')).includes('出題の向き'));
ok('新規問数が保存された', await page.evaluate(() => window.state.srsNewLimit === 16));

// 級診断 from settings
await page.click('button:has-text("級診断を受ける")'); await page.waitForTimeout(300);
ok('設定から級診断へ入れる', (await page.textContent('#content')).includes('級'), '');
ok('級診断中も設定タブが選択状態', (await view()) === 'settingsTab');

// --- 今日 → 学習 → 完了 → 復習が出る ---
await page.click('#homeBtn'); await page.waitForTimeout(250);
await page.click('button:has-text("学習を始める")'); await page.waitForTimeout(400);
ok('今日から学習画面へ', !!(await page.$('#content .wcard.on')));

// --- Day学習は4ステップ（単語→文法→聞く→解く） ---
const stepBars = await page.$$eval('.dsteps i', e => e.length);
ok('ステップの進捗バーが出る', stepBars >= 3 && stepBars <= 4, `${stepBars}本`);
ok('最初は単語のステップ', (await page.textContent('.dstep-label')).includes('単語をおぼえる'));
ok('単語は1語ずつ出る', (await page.$$eval('#content .wcard.on', e => e.length)) === 1
  && (await page.$$eval('#content .wcard', e => e.length)) === 5);
ok('最初は「戻る」が出ない', await page.$eval('#bottomPrev', e => getComputedStyle(e).display === 'none'));
ok('最初は「完了」が出ない', await page.$eval('#bottomComplete', e => getComputedStyle(e).display === 'none'));
ok('「次へ」が出る', (await page.textContent('#bottomNext')).includes('次へ'));

// 「次へ」で語が進み、5語めの次でステップが変わる
await page.click('#bottomNext'); await page.waitForTimeout(200);
ok('次へで2語めになる', (await page.textContent('.wcount')).startsWith('2 /'));
ok('2語めでは「戻る」が出る', await page.$eval('#bottomPrev', e => getComputedStyle(e).display !== 'none'));
await page.click('#bottomPrev'); await page.waitForTimeout(200);
ok('戻るで1語めに戻る', (await page.textContent('.wcount')).startsWith('1 /'));

// ★と難易度は描き直さずその場で更新する。以前は render() を呼んでいたので、
// 学習の途中でどちらかを押すとミニテストとリスニングが最初からやり直しになった。
await page.click('#bottomNext'); await page.waitForTimeout(150);
await page.click('#bottomNext'); await page.waitForTimeout(150);
await page.click('.wcard.on .bookmark'); await page.waitForTimeout(200);
ok('★を押しても語の位置が変わらない', (await page.textContent('.wcount')).startsWith('3 /'));
ok('★がその場で反映される', await page.$eval('.wcard.on .bookmark', e => e.classList.contains('active')));
await page.click('.wcard.on .lvc button:nth-child(3)'); await page.waitForTimeout(200);
ok('難易度を押しても語の位置が変わらない', (await page.textContent('.wcount')).startsWith('3 /'));
ok('難易度がその場で反映される', await page.$eval('.wcard.on .lvc button:nth-child(3)', e => e.className.includes('lvc-on-2')));

// 最後のステップ（解く）まで「次へ」を押し切る
for (let i = 0; i < 12; i++) {
  if (await page.$eval('#bottomNext', e => getComputedStyle(e).display === 'none')) break;
  await page.click('#bottomNext'); await page.waitForTimeout(160);
}
ok('最後のステップで「次へ」が消える', await page.$eval('#bottomNext', e => getComputedStyle(e).display === 'none'));
ok('最後のステップはミニテスト', !!(await page.$('#mtRoot .mt-counter')));
ok('最後のステップで「完了」が出る', await page.$eval('#bottomComplete', e => getComputedStyle(e).display !== 'none'));
ok('学習画面で下部ナビが出る', await page.$eval('#bottomNav', e => getComputedStyle(e).display === 'flex'));
// 学習中は下タブを隠し、抜け道はヘッダーの「✕ 今日へ」だけにする（ナビの三重化をやめた）
ok('学習中は下タブが隠れる', await page.$eval('#tabBar', e => getComputedStyle(e).display === 'none'));
ok('学習中のヘッダーに出口が出る', await page.$eval('#topBack', e => getComputedStyle(e).display !== 'none'));
ok('学習中のヘッダーにDay番号が出る', (await page.textContent('#topMeta')).includes('Day'));
ok('Day選択の重複バーが消えた', !(await page.$('.daybar')) && !(await page.$('#daySelect')));

await page.click('#bottomComplete'); await page.waitForTimeout(400);

// --- 完了画面（新設） ---
ok('完了すると完了画面が出る', !!(await page.$('#content .done')));
const doneTxt = await page.textContent('#content .done');
ok('完了画面にDay番号が出る', /Day\s*\d+\s*完了/.test(doneTxt.replace(/\s+/g, ' ')));
ok('その日の数字が3行出る', (await page.$$eval('#content .tally > div', e => e.length)) === 3);
ok('連続日数が出る', /つづきました|連続がはじまります/.test(doneTxt));
ok('完了画面では下タブが戻る', await page.$eval('#tabBar', e => getComputedStyle(e).display === 'flex'));
ok('完了画面では学習用の下バーが出ない', await page.$eval('#bottomNav', e => getComputedStyle(e).display === 'none'));
ok('次のDayへ進むボタンは置かない', !doneTxt.includes('次のDay') && !doneTxt.includes('次の日'));

await page.click('#content button:has-text("今日はここまで")'); await page.waitForTimeout(300);
ok('「今日はここまで」で今日画面に戻る', !!(await page.$('#content .today')));
// 完了日時（state.completedAt）が入り、ヘッダーが連続日数に変わる
ok('完了日時が記録される', await page.evaluate(() => {
  const at = window.state.completedAt || {};
  return Object.keys(at).length > 0 && Object.values(at).every(v => typeof v === 'number' && v > 0);
}));
ok('ヘッダーが連続日数になる', (await page.textContent('#topMeta')).includes('日連続'));
ok('完了日時はクラウド同期の対象', await page.evaluate(() =>
  'completedAt' in window.normalizeStateForCloud(window.state)));

// --- 書体（案X＝明朝＋宋体） ---
// 読み込んでいないウェイトを指定すると、ブラウザが太らせて偽装し、明朝は字がつぶれる。
const weights = await page.evaluate(() => {
  const out = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const r of rules) {
      const w = r.style && r.style.fontWeight;
      if (w && /^\d+$/.test(w)) out.add(w);
    }
  }
  return [...out].sort();
});
ok('使っているウェイトは読み込み済みのものだけ',
  weights.every(w => ['400', '500', '600', '700'].includes(w)), weights.join(','));

await page.click('#homeBtn'); await page.waitForTimeout(200);
await page.click('button:has-text("学習を始める")'); await page.waitForTimeout(400);
const zhFont = await page.$eval('.wcard.on .zh', e => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, ''));
const jaFont = await page.$eval('.wcard.on .ja', e => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, ''));
ok('中文は宋体（Noto Serif SC）', zhFont === 'Noto Serif SC', zhFont);
ok('和文は明朝（Noto Serif JP）', jaFont === 'Noto Serif JP', jaFont);
const zhW = await page.$eval('.wcard.on .zh', e => getComputedStyle(e).fontWeight);
ok('中文のウェイトは600以下（宋体は600までしか読んでいない）', Number(zhW) <= 600, zhW);
await page.click('#topBack'); await page.waitForTimeout(250);
const revText = await page.textContent('.trow-rev');
ok('Day完了後、復習枚数が出る', /[1-9]/.test(await page.textContent('.trow-rev .val')), revText.replace(/\s+/g, ' ').slice(0, 70));
ok('Day完了後、90マスの1つが埋まる', (await page.$$eval('.prog-grid i.on', e => e.length)) >= 1);

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
ok('復習から今日へ戻れる', !!(await page.$('#content .today')));

console.log(results.join('\n'));
console.log('\nerrors:', errs.length ? errs.slice(0, 6).join('\n') : 'none');
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed || errs.length ? 1 : 0);
