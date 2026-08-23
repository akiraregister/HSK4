import { launch } from './browser.mjs';
const B=(process.env.BASE||'http://127.0.0.1:8765/')+'lp/';
const D = new URL('./__shots/', import.meta.url).pathname;
const br = await launch();
const res=[]; const ok=(n,v,x='')=>res.push(`${v?'PASS':'FAIL'}  ${n}${x?'  — '+x:''}`);
const errs=[];

for(const [name,w,h] of [['mobile',390,844],['desktop',1200,900]]){
  const c=await br.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});
  const p=await c.newPage();
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(B+'?src=test',{waitUntil:'load'}); await p.waitForTimeout(1800);

  // 横スクロールが出ていないこと
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  ok(`${name}: 横スクロールなし`, overflow<=1, `${overflow}px`);

  // ファーストビューにCTAが入っているか（広告流入で重要）
  const inFold=await p.evaluate(h=>{const a=document.querySelector('[data-ev="cta_hero"]');
    return a? a.getBoundingClientRect().top < h : false;}, h);
  ok(`${name}: CTAがファーストビュー内`, inFold);

  await p.screenshot({path:D+`lp-${name}.png`, fullPage:name==='mobile'});
  await c.close();
}

// 計測とボタン
const c=await br.newContext({viewport:{width:390,height:844}});
const p=await c.newPage(); p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'?src=x_post',{waitUntil:'load'}); await p.waitForTimeout(1200);
let evs=await p.evaluate(()=>JSON.parse(localStorage.getItem('hsk4-events')||'[]'));
ok('lp_view が記録される', evs.some(e=>e.e==='lp_view'&&e.p&&e.p.src==='x_post'), JSON.stringify(evs[0]?.p||{}));

await p.click('#priceBtn'); await p.waitForTimeout(400);
evs=await p.evaluate(()=>JSON.parse(localStorage.getItem('hsk4-events')||'[]'));
ok('価格の意向が記録される', evs.some(e=>e.e==='lp_price_interest'));
ok('押した後は無効化される', await p.$eval('#priceBtn',b=>b.disabled));
ok('お礼が出る', await p.$eval('#priceThanks',e=>getComputedStyle(e).display!=='none'));

// 復習デモ：手応えで次の出題日が変わることを、画面の文字から確かめる。
// 1回目=明日 / 2回目=6日後 / 3回目=15日後 は、本体の srsGrade（SM-2）と同じ値。
await p.click('#srsBody button:has-text("答えを見る")');
ok('デモ：答えを見ると意味が出る', (await p.$eval('#srsBody', e=>e.textContent)).includes('レベル、能力水準'));
await p.click('#srsBody button:has-text("普通")');

await p.click('#srsBody button:has-text("答えを見る")');
await p.click('#srsBody button:has-text("普通")');

await p.click('#srsBody button:has-text("答えを見る")');
await p.click('#srsBody button:has-text("簡単")');

const strip=await p.$eval('#srsStrip', e=>e.textContent);
ok('デモ：1回目は翌日に戻る', strip.includes('明日'), strip.replace(/\s+/g,' ').slice(0,90));
ok('デモ：2回目は6日後', strip.includes('6日後'));
ok('デモ：3回目は15日後', strip.includes('15日後'));
ok('デモ：3枚で終わる', (await p.$eval('#srsBody', e=>e.textContent)).includes('おつかれさま'));

// 並べ替えデモ：正解と不正解の両方を通す
const tap=async (i)=>{ await p.click(`#qBank .chip[data-i="${i}"]:not(.used)`); };
for(const i of [4,3,0,1,2]) await tap(i);          // 我 / 中文 / 说得 / 还不太 / 自然
ok('デモ：5語そろうと答え合わせが押せる', !(await p.$eval('#qCheck', b=>b.disabled)));
await p.click('#qCheck');
ok('デモ：正しい語順は正解になる', (await p.$eval('#qVerdict', e=>e.textContent)).includes('正解'));

await p.click('#qReset');
for(const i of [4,0,3,1,2]) await tap(i);          // 我 / 说得 / 中文 …（日本語の語順に引きずられた形）
await p.click('#qCheck');
ok('デモ：語順が違えば不正解になる', (await p.$eval('#qVerdict', e=>e.textContent)).includes('惜しい'));

evs=await p.evaluate(()=>JSON.parse(localStorage.getItem('hsk4-events')||'[]'));
ok('デモを触ったことが記録される',
   evs.some(e=>e.e==='lp_demo'&&e.p&&e.p.which==='srs') && evs.some(e=>e.e==='lp_demo'&&e.p&&e.p.which==='quiz'),
   evs.filter(e=>e.e==='lp_demo').map(e=>e.p.which).join(','));

// アプリへ実際に遷移できるか（相対パスの検証）
await p.click('[data-ev="cta_hero"]');
await p.waitForLoadState('load');
await p.waitForTimeout(3000);  // index.html は約900KB。起動を待つ
const url=p.url();
ok('CTAからアプリへ行ける', /\/HSK4\/?$|127\.0\.0\.1:8765\/$/.test(url), url);
evs=await p.evaluate(()=>JSON.parse(localStorage.getItem('hsk4-events')||'[]'));
ok('LPとアプリのログが1本に繋がる',
   evs.some(e=>e.e==='lp_view') && evs.some(e=>e.e==='lp_cta') && evs.some(e=>e.e==='first_visit'||e.e==='app_open'),
   [...new Set(evs.map(e=>e.e))].join(','));

console.log(res.join('\n'));
console.log('\npageerrors:', errs.length?errs.slice(0,3):'none');
const f=res.filter(r=>r.startsWith('FAIL')).length;
console.log(`\n${res.length-f}/${res.length} passed`);
await br.close();
