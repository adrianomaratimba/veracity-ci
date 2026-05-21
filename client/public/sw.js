// VotoAudit Service Worker v4
// Strategy:
//   - App shell (HTML): network-first, cache fallback
//   - JS/CSS assets (hashed): cache-first (immutable content)
//   - API GET: network-first, short-term cache fallback
//   - API POST: try network, queue offline if unavailable
//   - Fonts/images: cache-first
//
// vite-plugin-pwa (injectManifest mode) replaces the WB_MANIFEST assignment
// below at build time with the full list of all hashed Vite assets, enabling
// complete pre-caching on first install instead of lazy caching.

const SHELL_CACHE = 'votoaudit-shell-v4';
const ASSETS_CACHE = 'votoaudit-assets-v4';
const API_CACHE = 'votoaudit-api-v4';
const OFFLINE_URL = '/offline.html';

// Static shell URLs always pre-cached on install
const SHELL_PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

// Replaced by vite-plugin-pwa at build time with all hashed Vite asset URLs.
// Evaluates to undefined in dev mode — handled gracefully in the install handler.
const _wbManifest = self.__WB_MANIFEST;
const ASSET_PRECACHE_URLS = _wbManifest
  ? _wbManifest.map(e => (typeof e === 'string' ? e : e.url))
  : [];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Pre-cache the app shell (HTML, icons, manifest)
      const shellCache = await caches.open(SHELL_CACHE);
      await shellCache.addAll(SHELL_PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Shell precache partial failure (OK):', err);
      });

      // Pre-cache all Vite-generated hashed assets from the build manifest
      if (ASSET_PRECACHE_URLS.length > 0) {
        const assetsCache = await caches.open(ASSETS_CACHE);
        await assetsCache.addAll(ASSET_PRECACHE_URLS).catch((err) => {
          console.warn('[SW] Assets precache partial failure (OK):', err);
        });
        console.log('[SW] Pre-cached', ASSET_PRECACHE_URLS.length, 'build assets');
      } else {
        console.log('[SW] No build manifest (dev mode) — assets cached lazily');
      }

      await self.skipWaiting();
    })()
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const KEEP = [SHELL_CACHE, ASSETS_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !KEEP.includes(k)).map((k) => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin or our own requests
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.g')) {
    return; // let browser handle cross-origin (except Google Fonts)
  }

  // API POST — offline queue
  if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiPost(request));
    return;
  }

  // API GET — network-first, short cache fallback (60 s)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60));
    return;
  }

  // Vite-hashed assets (/assets/…) — cache-first (immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstWithNetwork(request, ASSETS_CACHE));
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.g')) {
    event.respondWith(cacheFirstWithNetwork(request, ASSETS_CACHE));
    return;
  }

  // App shell (HTML navigation + static files) — network-first
  event.respondWith(networkFirstShell(request));
});

// ─── STRATEGIES ───────────────────────────────────────────────────────────────

async function networkFirstShell(request) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation requests, serve the app shell root
    if (request.mode === 'navigate') {
      const appShell = await caches.match('/');
      if (appShell) return appShell;
      return caches.match(OFFLINE_URL);
    }
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName, maxAgeSeconds) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline', cached: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleApiPost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Queue for background sync
    const body = await request.clone().text();
    const entry = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    };
    try {
      await saveForSync(entry);
      if ('sync' in self.registration) {
        await self.registration.sync.register('sync-pending').catch(() => {});
      }
    } catch (e) {
      console.warn('[SW] Could not queue:', e);
    }
    return new Response(
      JSON.stringify({
        queued: true,
        message: 'Dados salvos localmente. Serão enviados quando a conexão for restaurada.',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── OFFLINE SYNC ─────────────────────────────────────────────────────────────
const PENDING_STORE = 'pending-sync';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('VotoAuditOffline', 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'timestamp' });
      }
    };
  });
}

async function saveForSync(data) {
  const db = await openDB();
  const tx = db.transaction(PENDING_STORE, 'readwrite');
  tx.objectStore(PENDING_STORE).add(data);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') event.waitUntil(syncPending());
});

async function syncPending() {
  const db = await openDB();
  const tx = db.transaction(PENDING_STORE, 'readwrite');
  const store = tx.objectStore(PENDING_STORE);
  const all = await new Promise((res, rej) => {
    const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = rej;
  });
  for (const req of all) {
    try {
      await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      store.delete(req.timestamp);
    } catch { /* keep for next sync */ }
  }
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearApiCache') {
    caches.delete(API_CACHE).then(() => console.log('[SW] API cache cleared'));
  }
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'VotoAudit';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: data.data || {},
      requireInteraction: true,
      vibrate: [200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if (c.url.includes(url) && 'focus' in c) return c.focus();
        }
        return clients.openWindow(url);
      })
  );
});
