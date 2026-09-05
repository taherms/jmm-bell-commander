/* ==========================================================================
   JMM Bell Commander — service-worker.js
   Caches the app shell so it still loads (and rings still play) with a
   flaky connection. Bump CACHE_VERSION whenever you change any cached
   file so devices pick up the update.
   ========================================================================== */

const CACHE_VERSION = 'jmm-bell-commander-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/utils.js',
  './js/db.js',
  './js/auth.js',
  './js/scheduler.js',
  './js/app.js',
  './rings/manifest.json',
  './rings/bell-classic.wav',
  './seed/jmm-bell-commander-backup-2026-09-05-2.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // let cross-origin (fonts) pass through normally

  // rings/manifest.json: prefer fresh network so newly-added rings show up,
  // fall back to cache when offline.
  if (url.pathname.endsWith('/rings/manifest.json')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // everything else in the app shell: cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
