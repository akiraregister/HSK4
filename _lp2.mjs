import { launch } from './tests/browser.mjs';
import { createServer } from 'http'; import { readFileSync, statSync } from 'fs'; import { extname } from 'path';
const T={'.html':'text/html; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript'};
const srv=createServer((q,r)=>{let f='.'+q.url.split('?')[0];if(f.endsWith('/'))f+='index.html';
 try{statSync(f);r.writeHead(200,{'Content-Type':T[extname(f)]||'application/octet-stream'});r.end(readFileSync(f));}catch(e){r.writeHead(404);r.end();}}).listen(8783);
const D='/tmp/claude-0/-home-user-HSK4/3ee7a2e0-0b54-5c4c-b9ef-70ab0ff8af5b/scratchpad/';
const br=await launch(); const c=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p=await c.newPage();
await p.goto('http://127.0.0.1:8783/lp/',{waitUntil:'load'}); await p.waitForTimeout(900);
const H=await p.evaluate(()=>document.body.scrollHeight);
for(let i=0;i<5;i++){
  await p.evaluate(y=>window.scrollTo(0,y), i*1500);
  await p.waitForTimeout(250);
  await p.screenshot({path:D+`lp-${i}.png`});
}
console.log('高さ',H);
await br.close(); srv.close();
