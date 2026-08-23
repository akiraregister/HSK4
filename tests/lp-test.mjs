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
