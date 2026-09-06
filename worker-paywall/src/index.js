// HSK4 有料化(paywall) Worker
//
// 役割は3つだけ（この境界を広げないこと。作文採点Workerを汎用プロキシに
// してしまった過去の反省と同じ理由）：
//   1. POST /checkout    ログイン中のユーザー用にStripeの決済ページを作る
//   2. POST /webhook     Stripeからの「支払い完了」通知を受け、KVに購入済みを記録する
//   3. GET  /entitlement ログイン中のユーザーが購入済みかどうかをアプリに返す
// Day8以降のコンテンツそのものを配る役目（GET /content）はまだ実装していない。
// index.html側でDay8-90をどう切り出すかは別途詰めてから着手する。
//
// 認証はFirebaseのIDトークン（Googleログイン済みの証明）で行う。ここでの
// uidは「Firebaseにログイン済みの本人」であることの証明であり、偽造できない
// （src/firebase-verify.js でGoogleの公開鍵と照合して検証する）。

import { verifyFirebaseIdToken } from './firebase-verify.js';
import { verifyStripeSignature, createCheckoutSession } from './stripe.js';
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      const uid = await requireUid(request);
      if (!uid) return json({ error: 'ログインしてください' }, 401, origin);
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
        return json({ error: 'サーバー側の決済設定が未完了です' }, 500, origin);
      }
      let coupon;
      try {
        const body = await request.json();
        coupon = body.coupon;
      } catch {}
      const session = await createCheckoutSession(env, uid, coupon);
      if (!session || !session.url) return json({ error: '決済ページの作成に失敗しました' }, 502, origin);
      return json({ url: session.url }, 200, origin);
    }

    if (url.pathname === '/entitlement' && request.method === 'GET') {
      const uid = await requireUid(request);
      if (!uid) return json({ error: 'ログインしてください' }, 401, origin);
      const rec = await env.ENTITLEMENTS.get(uid);
      let purchased = false;
      try { purchased = !!(rec && JSON.parse(rec).purchased); } catch { purchased = false; }
      return json({ purchased }, 200, origin);
    }

    if (url.pathname === '/content' && request.method === 'GET') {
      const uid = await requireUid(request);
      if (!uid) return json({ error: 'ログインしてください' }, 401, origin);
      const rec = await env.ENTITLEMENTS.get(uid);
      let purchased = false;
      try { purchased = !!(rec && JSON.parse(rec).purchased); } catch { purchased = false; }
      if (!purchased) return json({ error: '購入が確認できません' }, 403, origin);
      return json(PAID_CONTENT, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
