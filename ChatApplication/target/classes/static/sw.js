// StealthChat Enterprise Service Worker
// Handles Offline Shell Caching & Background Sync for Queued Messages

const CACHE_NAME = 'stealthchat-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    'https://cdnjs.cloudflare.com/ajax/libs/sockjs-client/1.5.1/sockjs.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/stomp.js/2.3.3/stomp.min.js'
];

// Install: Cache critical static assets for full offline capability
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline application shell');
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('[ServiceWorker] Some assets could not be cached immediately:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate: Purge old cache versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[ServiceWorker] Purging stale cache:', name);
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network-First strategy with Cache Fallback for offline resilience
self.addEventListener('fetch', (event) => {
    // Only intercept HTTP GET requests (skip WebSockets and REST POSTs)
    if (event.request.method !== 'GET' || event.request.url.includes('/ws-chat')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // If network fails, serve cached shell
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// Background Sync API: triggered when device re-establishes network connectivity
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-queued-messages') {
        console.log('[ServiceWorker] Background Sync event triggered: Flushing queued messages');
        event.waitUntil(notifyClientsToFlush());
    }
});

async function notifyClientsToFlush() {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
        client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGERED' });
    }
}
