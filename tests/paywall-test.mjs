// 引き換えコード（ログインせずに買う経路）のテスト。
// Stripeは本物を叩かず、偽のfetchで返事を差し替える。KVはメモリ上の置き換え。
// Firebaseを使う経路（Authorization）はここでは試さない（ネットワークが要るため）。
//
//   node tests/run.mjs paywall
import worker from '../worker-paywall/src/index.js';

const ORIGIN = 'https://akiraregister.github.io';
const res = [];
const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);

function makeEnv() {
  const kv = new Map();
  return {
    _kv: kv,
    ENTITLEMENTS: {
      async get(k) { return kv.has(k) ? kv.get(k) : null; },
      async put(k, v) { kv.set(k, v); },
    },
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_PRICE_ID: 'price_dummy',
    APP_ORIGIN: 'https://akiraregister.github.io/HSK4',
  };
}

// 偽のStripe。作ったセッションを覚えておき、照会にはそれを返す。
const sessions = new Map();
let nextSessionId = 1;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
    const body = new URLSearchParams(init.body);
    const id = 'cs_test_' + (nextSessionId++);
    sessions.set(id, { payment_status: 'paid', client_reference_id: body.get('client_reference_id') });
    return new Response(JSON.stringify({ id, url: 'https://checkout.stripe.com/' + id }), { status: 200 });
  }
  const m = u.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(.+)$/);
  if (m) {
    const s = sessions.get(decodeURIComponent(m[1]));
    if (!s) return new Response('no such session', { status: 404 });
    return new Response(JSON.stringify(s), { status: 200 });
  }
  throw new Error('想定外のfetch: ' + u);
};

const call = (env, path, init = {}) => worker.fetch(
  new Request('https://hsk4-paywall.example.dev' + path, {
    ...init, headers: { Origin: ORIGIN, ...(init.headers || {}) },
  }), env);

const env = makeEnv();

// --- 1. ログインしなくても決済ページを作れる ---
let r = await call(env, '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
let d = await r.json();
ok('未ログインでも /checkout が通る（以前は401）', r.status === 200, 'status=' + r.status);
ok('決済ページのURLが返る', typeof d.url === 'string' && d.url.length > 0);
ok('引き換えコードが返る', /^[0-9a-f]{64}$/.test(d.claim || ''), String(d.claim).slice(0, 12) + '…');
const claim = d.claim;
const sessionId = d.url.split('/').pop();

// --- 2. 支払い前・別のコードでは確定しない ---
r = await call(env, '/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: sessionId, claim: 'f'.repeat(64) }) });
d = await r.json();
ok('他人のコードでは確定しない', d.purchased === false);

r = await call(env, '/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: sessionId, claim: 'not-a-token' }) });
ok('形式が違うコードは400で弾く', r.status === 400, 'status=' + r.status);

// --- 3. 正しいコードなら確定する ---
r = await call(env, '/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: sessionId, claim }) });
d = await r.json();
ok('正しいコードで購入が確定する', d.purchased === true);
ok('KVに購入済みが書かれる', JSON.parse(env._kv.get('claim:' + claim)).purchased === true);

// --- 4. コードで中身が読める ---
r = await call(env, '/content', { headers: { 'X-Claim': claim } });
ok('引き換えコードで /content が読める', r.status === 200, 'status=' + r.status);
const content = await r.json();
ok('中身がちゃんと返る', !!(content && content.lessons));

r = await call(env, '/content', { headers: { 'X-Claim': '0'.repeat(64) } });
ok('買っていないコードでは403', r.status === 403, 'status=' + r.status);

r = await call(env, '/content');
ok('コードもログインも無ければ401', r.status === 401, 'status=' + r.status);

r = await call(env, '/content', { headers: { 'X-Claim': 'short' } });
ok('形式が違うコードは401', r.status === 401, 'status=' + r.status);

// --- 5. CORS ---
ok('X-Claim がCORSで許可されている',
  (r.headers.get('Access-Control-Allow-Headers') || '').includes('X-Claim'));

// --- 6. /bind はログインが要る ---
r = await call(env, '/bind', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ claim }) });
ok('/bind は未ログインでは401', r.status === 401, 'status=' + r.status);

// --- 7. 呼び出し元のオリジンは従来どおり絞る ---
r = await worker.fetch(new Request('https://hsk4-paywall.example.dev/checkout',
  { method: 'POST', headers: { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' }, body: '{}' }), env);
ok('知らないオリジンからは403', r.status === 403, 'status=' + r.status);

console.log(res.join('\n'));
const failed = res.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${res.length - failed}/${res.length} passed`);
process.exit(failed ? 1 : 0);
