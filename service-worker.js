/**
 * 观心录 Service Worker
 * 网络优先 + 缓存回退策略，确保用户始终拿到最新版本
 */

const CACHE_NAME = 'guanxinlu-v35';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/quotes.json'
];

// 安装事件 - 预缓存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存并立即接管
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截 - 网络优先，缓存回退
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 网络成功，更新缓存
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败，返回缓存
        return caches.match(event.request);
      })
  );
});
