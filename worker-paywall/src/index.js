// HSK4 有料化(paywall) Worker
//
// 役割は3つだけ（この境界を広げないこと。作文採点Workerを汎用プロキシに
// してしまった過去の反省と同じ理由）：
//   1. POST /checkout    Stripeの決済ページを作る（ログインは前提にしない）
//   2. POST /webhook     Stripeからの「支払い完了」通知を受け、KVに購入済みを記録する
//   3. GET  /entitlement 購入済みかどうかをアプリに返す
//   4. GET  /content     購入済みの人にだけ Day8-90 の中身を返す
// 決済後の確定は /confirm（ログイン済み）と /claim（未ログイン）の2経路がある。
//
// 認証は2本立て。
//   ・FirebaseのIDトークン（Googleログイン済みの証明）。偽造できない
//     （src/firebase-verify.js でGoogleの公開鍵と照合して検証する）
//   ・引き換えコード（X-Claim）。ログインせずに買った人のための鍵。
//     Googleログインは中国からは到達しないので、必須にすると買えない人が出る。
//     コードはこのWorkerが乱数で作り、支払いがStripeで確認できるまで
//     purchased にならない（下の「引き換えコード」参照）。

import { verifyFirebaseIdToken } from './firebase-verify.js';
import { verifyStripeSignature, createCheckoutSession, isSessionPaidBy } from './stripe.js';
import { PAID_CONTENT } from './content-bundle.js';

const ALLOWED_ORIGINS = [
  'https://akiraregister.github.io',
  'null', // file:// で開いたローカルHTML
];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // X-Claim はログインせずに買った人の引き換えコード。無いとプリフライトで弾かれる。
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Claim',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

// Authorization: Bearer <FirebaseIDトークン> からuidを取り出す。無効ならnull。
async function requireUid(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return null;
  return verifyFirebaseIdToken(m[1]);
}

// ===== 引き換えコード（ログインせずに買った人のための鍵） =====
// ログインを購入の前提にしないための仕組み（分析のA3）。Googleログインは
// 中国からは到達しないので、それを必須にすると買えない人が出る。
//
// ・/checkout を未ログインで叩くと、サーバーがランダムな引き換えコードを作り、
//   Stripeの client_reference_id に "claim:<コード>" として埋める
// ・決済後、アプリが /claim へ (session_id, コード) を出す。Stripeへ直接照会して
//   支払い済みかつ client_reference_id が一致したときだけ KV に purchased を書く
// ・以後アプリは X-Claim ヘッダーでコードを送れば /content を読める
// ・あとでログインしたら /bind でuidへ移し替える（端末をまたげるようになる）
//
// コードは推測できない長さの乱数で、支払いが確認できるまで purchased にならない。
// 端末のlocalStorageにだけ入るので、失うとログインするまで復元できない（承知のうえ）。
const CLAIM_PREFIX = 'claim:';
function newClaimToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function claimKey(token) { return CLAIM_PREFIX + token; }
function isClaimToken(t) { return typeof t === 'string' && /^[0-9a-f]{64}$/.test(t); }

// 購入済みかどうかを、uid（ログイン済み）か引き換えコードのどちらかで確かめる。
// どちらの経路でも、最終的に見るのは KV に purchased が書かれているかだけ。
async function readEntitlement(request, env) {
  const uid = await requireUid(request);
  if (uid) return { key: uid, kind: 'uid' };
  const token = request.headers.get('X-Claim') || '';
  if (isClaimToken(token)) return { key: claimKey(token), kind: 'claim' };
  return null;
}
async function isPurchased(env, key) {
  const rec = await env.ENTITLEMENTS.get(key);
  try { return !!(rec && JSON.parse(rec).purchased); } catch { return false; }
}

async function handleWebhook(request, env) {
  // StripeはOriginヘッダーを送らないので、ここだけOriginチェックの対象外。
  // 代わりに署名（Stripe-Signature）で本物のStripeからの通知であることを確認する。
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  const okSig = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!okSig) return new Response('invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response('invalid json', { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data && event.data.object;
    const uid = session && session.client_reference_id;
    if (uid && session.payment_status === 'paid') {
      await env.ENTITLEMENTS.put(uid, JSON.stringify({
        purchased: true,
        purchasedAt: Date.now(),
        sessionId: session.id,
      }));
    }
  }
  return new Response('ok', { status: 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (!isAllowedOrigin(origin)) {
      return json({ error: 'このエンドポイントは加油アプリ専用です' }, 403, origin);
    }

    if (url.pathname === '/checkout' && request.method === 'POST') {
      // ログインは購入の前提にしない。未ログインなら引き換えコードを発行して、
      // Stripeの client_reference_id にそれを入れる。
      const uid = await requireUid(request);
      const claim = uid ? null : newClaimToken();
      const ref = uid || claimKey(claim);
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
        return json({ error: 'サーバー側の決済設定が未完了です' }, 500, origin);
      }
      let coupon;
      try {
        const body = await request.json();
        coupon = body.coupon;
      } catch {}
      // ローカルで動かしているときは決済後もそこへ戻す。本番のAPP_ORIGINは
      // パス（/HSK4）を含みOriginヘッダーからは復元できないので、そのまま使う。
      const backTo = LOCAL_ORIGIN.test(origin) ? origin : null;
      const session = await createCheckoutSession(env, ref, coupon, backTo);
      if (!session || !session.url) {
        if (session && session.failed === 'coupon') {
          return json({ error: 'クーポンコードが正しくありません。入力をご確認ください。' }, 400, origin);
        }
        return json({ error: '決済ページの作成に失敗しました' }, 502, origin);
      }
      // claim はこのときだけ返す。アプリは決済へ飛ぶ前に端末へ保存すること。
      return json(claim ? { url: session.url, claim } : { url: session.url }, 200, origin);
    }

    // 未ログインで買った人の購入確定。引き換えコードと session_id の両方が要る。
    // Stripeへ直接照会するので、他人の session_id を持ち込まれても
    // client_reference_id が一致せず弾かれる（/confirm と同じ考え方）。
    if (url.pathname === '/claim' && request.method === 'POST') {
      let sessionId = '', token = '';
      try { const b = await request.json(); sessionId = b.session_id || ''; token = b.claim || ''; } catch {}
      if (!sessionId || !isClaimToken(token)) return json({ error: 'session_idと引き換えコードが必要です' }, 400, origin);
      if (!(await isSessionPaidBy(env, sessionId, claimKey(token)))) {
        return json({ purchased: false }, 200, origin);
      }
      await env.ENTITLEMENTS.put(claimKey(token), JSON.stringify({
        purchased: true, purchasedAt: Date.now(), sessionId,
      }));
      return json({ purchased: true }, 200, origin);
    }

    // 引き換えコードで買ったあとにログインしたとき、uidへ移し替える。
    // これをやると端末をまたいで使えるようになる。
    if (url.pathname === '/bind' && request.method === 'POST') {
      const uid = await requireUid(request);
      if (!uid) return json({ error: 'ログインしてください' }, 401, origin);
      let token = '';
      try { token = (await request.json()).claim || ''; } catch {}
      if (!isClaimToken(token)) return json({ error: '引き換えコードが必要です' }, 400, origin);
      const rec = await env.ENTITLEMENTS.get(claimKey(token));
      let parsed = null;
      try { parsed = rec ? JSON.parse(rec) : null; } catch {}
      if (!parsed || !parsed.purchased) return json({ purchased: false }, 200, origin);
      await env.ENTITLEMENTS.put(uid, JSON.stringify({
        purchased: true, purchasedAt: parsed.purchasedAt || Date.now(),
        sessionId: parsed.sessionId, boundFromClaim: true,
      }));
      // コード側は残す。同じ端末でログアウトしても使えなくならないようにするため。
      await env.ENTITLEMENTS.put(claimKey(token), JSON.stringify({ ...parsed, boundUid: uid }));
      return json({ purchased: true }, 200, origin);
    }

    // 決済完了後にアプリが戻ってきたときの購入確定。Webhookが届かなかった場合の
    // second sourceであり、Webhookが先に通っていれば同じ内容を上書きするだけ。
    if (url.pathname === '/confirm' && request.method === 'POST') {
      const uid = await requireUid(request);
      if (!uid) return json({ error: 'ログインしてください' }, 401, origin);
      let sessionId = '';
      try { sessionId = (await request.json()).session_id || ''; } catch {}
      if (!sessionId) return json({ error: 'session_idが必要です' }, 400, origin);
      if (!(await isSessionPaidBy(env, sessionId, uid))) {
        return json({ purchased: false }, 200, origin);
      }
      await env.ENTITLEMENTS.put(uid, JSON.stringify({
        purchased: true,
        purchasedAt: Date.now(),
        sessionId,
      }));
      return json({ purchased: true }, 200, origin);
    }

    // ここから下は uid でも引き換えコードでも通す
    if (url.pathname === '/entitlement' && request.method === 'GET') {
      const ent = await readEntitlement(request, env);
      if (!ent) return json({ error: 'ログインまたは引き換えコードが必要です' }, 401, origin);
      return json({ purchased: await isPurchased(env, ent.key) }, 200, origin);
    }

    if (url.pathname === '/content' && request.method === 'GET') {
      const ent = await readEntitlement(request, env);
      if (!ent) return json({ error: 'ログインまたは引き換えコードが必要です' }, 401, origin);
      if (!(await isPurchased(env, ent.key))) return json({ error: '購入が確認できません' }, 403, origin);
      return json(PAID_CONTENT, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
