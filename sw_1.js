// HSK4 90日アプリ — Service Worker
// キャッシュバージョン: 更新時はここを変える
const CACHE_VERSION = 'hsk4-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// インストール: 必要ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // ファイルが見つからなくてもインストールを続行
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ: キャッシュ優先 + ネットワーク更新
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Firebase / 外部APIはキャッシュしない（通常通りネット通信）
  if (
    url.includes('firebase') ||
    url.includes('firestore') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('chrome-extension')
  ) {
    return;
  }

  // GETリクエストのみキャッシュ
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // ネットワークから最新を取得してキャッシュも更新
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return response;
        })
        .catch(() => null);

      // キャッシュがあればすぐ返す（オフライン対応）、なければネット待ち
      return cached || networkFetch;
    })
  );
});
