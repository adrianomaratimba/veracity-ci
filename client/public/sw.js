const CACHE_NAME = 'veracity-v1';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

const API_CACHE_NAME = 'veracity-api-v1';
const PENDING_SYNC_STORE = 'pending-sync';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiPost(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiGet(request));
    return;
  }

  event.respondWith(handleStaticRequest(request));
});

async function handleStaticRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function handleApiGet(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving cached API response');
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleApiPost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    console.log('[SW] Offline - queueing POST request for sync');
    const body = await request.clone().text();
    await saveForSync({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    });
    
    if ('sync' in self.registration) {
      try {
        await self.registration.sync.register('sync-pending');
        console.log('[SW] Background sync registered');
      } catch (syncError) {
        console.log('[SW] Background sync not supported:', syncError);
      }
    }
    
    return new Response(JSON.stringify({ 
      queued: true, 
      message: 'Dados salvos localmente. Serão enviados quando a conexão for restaurada.' 
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function saveForSync(data) {
  const db = await openDB();
  const tx = db.transaction(PENDING_SYNC_STORE, 'readwrite');
  const store = tx.objectStore(PENDING_SYNC_STORE);
  await store.add(data);
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VeracityOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
        db.createObjectStore(PENDING_SYNC_STORE, { keyPath: 'timestamp' });
      }
    };
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  const db = await openDB();
  const tx = db.transaction(PENDING_SYNC_STORE, 'readwrite');
  const store = tx.objectStore(PENDING_SYNC_STORE);
  const requests = await store.getAll();
  
  for (const req of requests) {
    try {
      await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body
      });
      await store.delete(req.timestamp);
      console.log('[SW] Synced pending request:', req.url);
    } catch (error) {
      console.error('[SW] Failed to sync request:', error);
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// --- WEB PUSH NOTIFICATIONS ---
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'Veracity';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192.svg',
      badge: data.badge || '/icon-192.svg',
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
