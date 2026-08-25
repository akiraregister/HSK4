/* HSK4 90日ミニアプリ — Service Worker
   ・アプリ本体(index.html)+manifest+iconsを事前キャッシュ → オフラインでも起動可
   ・HTML/ナビゲーションはネット優先（更新を即反映、ネットが無いときだけキャッシュ）
   ・アイコン等の静的ファイルはキャッシュ優先＋裏で更新（stale-while-revalidate）
   ・Firebase / Google 系の通信は常にネット直結（キャッシュしない＝同期・ログインに影響なし）
   ※ アプリを更新したら下の CACHE_VERSION の数字を1つ上げてコミットしてください。 */

const CACHE_VERSION = 'hsk4-cache-v18';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon-180.png'
];

self.addEventListener('install', (event) => {
  // cache.addAll は1件でも404すると全体が失敗するため、1件ずつ追加して
  // allSettled で束ねる。ファイルを1つ消してもプリキャッシュが全滅しない。
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Firebase / Google 系は常にネット直結（キャッシュしない）
  if (/firebase|firestore|googleapis|gstatic|google\.com/.test(url.href)) return;

  // 別オリジン（CDN等）は素通し
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // HTML：ネット優先 → 取れたらキャッシュ更新、ダメならキャッシュ（最後はindex.html）
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // その他（アイコン・manifest等）：キャッシュ優先＋裏でネット更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
