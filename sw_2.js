const CACHE_VERSION = 'hsk4-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(['./manifest.json','./icon-192.png','./icon-512.png','./apple-touch-icon.png'])
      .catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

  // HTMLはネットワーク優先（常に最新コードを取得）
  if (url.endsWith('/') || url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE_VERSION).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // その他はキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        caches.open(CACHE_VERSION).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => null);
      return cached || net;
    })
  );
});
