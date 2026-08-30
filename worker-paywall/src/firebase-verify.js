// Firebase IDトークンの検証（Admin SDKを使わず、公開鍵だけで行う）
//
// Firebase Admin SDKはNode.js向けで、Cloudflare WorkerのようなV8 isolate環境では
// そのまま動かない（サービスアカウント鍵の扱いも別途必要になる）。
// IDトークンはただのRS256署名付きJWTなので、Googleが公開している鍵（JWK）と
// 照合するだけで、Admin SDK無しでも正しく検証できる。手順はFirebase公式ドキュメントの
// 「サードパーティのJWTライブラリを使ってIDトークンを検証する」に準拠。
// https://firebase.google.com/docs/auth/admin/verify-id-tokens

const PROJECT_ID = 'hsk4-ee5c2'; // index.html の firebaseConfig.projectId と同じ（公開情報）
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function b64urlToBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}

async function fetchJwks() {
  // Googleの応答にはCache-Controlで有効期限が入っているので、Workers標準の
  // edgeキャッシュに乗せて、リクエストのたびに取りに行かないようにする。
  const cacheKey = new Request(JWKS_URL);
  const cache = caches.default;
  let res = await cache.match(cacheKey);
  if (!res) {
    res = await fetch(JWKS_URL);
    if (res.ok) await cache.put(cacheKey, res.clone());
  }
  return res.json();
}

// 検証に成功したらFirebaseのuid（トークンのsubクレーム）を返す。失敗したらnull。
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
  if (payload.aud !== PROJECT_ID) return null;
  if (payload.iss !== ISSUER) return null;
  if (!payload.sub || typeof payload.sub !== 'string') return null;

  let jwks;
  try { jwks = await fetchJwks(); } catch { return null; }
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key;
  try {
    key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
  } catch {
    return null;
  }

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBytes(sigB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  return valid ? payload.sub : null;
}
