const CACHE_VERSION = 'hsk4-v5';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 全リクエストをネットワーク優先（キャッシュなし）
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
