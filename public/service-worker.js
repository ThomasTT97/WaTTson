
const CACHE_NAME = 'wattson-v3';

// External assets that must be cached for the UI to look good offline
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6b4.png'
];

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache core local files and critical external styles/icons
      return cache.addAll([...CORE_ASSETS, ...EXTERNAL_ASSETS]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. Ignore API calls to Intervals.icu or Google GenAI (Network Only)
  if (event.request.url.includes('intervals.icu/api') || event.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // 2. Handle External Assets (Fonts, Tailwind, Images) -> Cache First
  if (EXTERNAL_ASSETS.some(url => event.request.url.startsWith(url)) || event.request.url.includes('gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          // Cache new external assets (like woff2 font files) dynamically
          // Allow opaque responses for CDN assets
          if (!response || (response.status !== 200 && response.type !== 'opaque')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // 3. Handle App Shell (HTML, JS, CSS) -> Stale-While-Revalidate
  // This ensures the user sees the cached version immediately, but gets the update next time.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed
        return null; 
      });

      return cachedResponse || fetchPromise;
    })
  );
});
