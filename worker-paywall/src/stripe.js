// Stripe連携。SDKは使わずfetchだけで呼ぶ（このリポジトリはビルドステップを持たない
// 方針なので、worker/ の作文採点Workerと同じくnpm依存を増やさない）。

// StripeのWebhook署名検証。
// 署名ヘッダーは "t=<timestamp>,v1=<hex署名>" の形。
// 署名対象は "<timestamp>.<生のリクエストボディ>" のHMAC-SHA256。
// https://stripe.com/docs/webhooks/signatures#verify-manually
export async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = {};
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i === -1) continue;
    parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // 5分より古い/未来のタイムスタンプはリプレイの可能性があるため拒否する
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// Checkout Session（買い切り、1回払い）を作成する。
// client_reference_id にFirebaseのuidを入れておき、Webhookで受け取ったときに
// 「誰が買ったか」をここから復元する。
// coupon が指定されていれば、クーポンコードを discounts に追加する。
export async function createCheckoutSession(env, uid, coupon) {
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('client_reference_id', uid);
  body.set('line_items[0][price]', env.STRIPE_PRICE_ID);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', `${env.APP_ORIGIN}/?purchase=success`);
  body.set('cancel_url', `${env.APP_ORIGIN}/?purchase=cancel`);

  // クーポンコードが指定されていれば適用
  if (coupon) {
    body.set('discounts[0][coupon]', coupon);
  }

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!resp.ok) {
    console.error('stripe checkout create error', resp.status, (await resp.text().catch(() => '')).slice(0, 500));
    return null;
  }
  return resp.json();
}
