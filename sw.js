// 
//  Community Health Survey — Service Worker
//
//  ONLINE:  Auto-update, reload once with fresh files
//  OFFLINE: Serve from cache instantly — no disruption
//
//  Cache version is now read from version.json at install time,
//  so bumping version.json alone triggers a full cache refresh
//  on ALL installed PWAs — no need to edit this file.
// 

// Fallback version in case version.json fetch fails
const FALLBACK_VERSION  = 'chsa-v4.5.9';
let   CACHE_NAME        = FALLBACK_VERSION;

const APP_FILES = [
  './',
  './index.html',
  './survey-styles.css',
  './survey-core.js',
  './survey-auth.js',
  './survey-admin.js',
  './survey-sync.js',
  './survey-reports.js',
  
  './data-processor.js',
  './admin-institution.js',
  './admin-super.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

//  INSTALL: read version from version.json, then cache all files 
self.addEventListener('install', event => {
  event.waitUntil(
    fetch('./version.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        CACHE_NAME = data.version ? `chsa-${data.version}` : FALLBACK_VERSION;
      })
      .catch(() => { CACHE_NAME = FALLBACK_VERSION; })
      .then(() => caches.open(CACHE_NAME))
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

//  ACTIVATE: wipe old caches, claim all clients 
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open windows: new version is active
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
        });
      })
  );
});

//  FETCH: cache-first with background refresh 
// Online:  serve cache instantly + update in background
// Offline: serve cache only — no errors
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // version.json must always be fetched fresh — it drives cache busting
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        if (navigator.onLine) {
          const fresh = fetch(event.request)
            .then(res => {
              if (res && res.status === 200) cache.put(event.request, res.clone());
              return res;
            })
            .catch(() => cached);
          // Return cache immediately, refresh in background
          return cached || fresh;
        }
        // Offline — serve cache, fall back to index.html for navigation
        return cached || caches.match('./index.html');
      })
    )
  );
});

//  Handle SKIP_WAITING from page (for legacy installs) 
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

//  Push notification handler (Phase 5) 
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Health Survey Alert', {
      body:               data.body    || '',
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      tag:                data.tag     || 'health-alert',
      data:               data.data    || {},
      actions:            data.actions || [],
      requireInteraction: data.requireInteraction ?? false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
