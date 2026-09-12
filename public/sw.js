/**
 * Service Worker: hält die Oberfläche offline verfügbar.
 *
 * Spieldaten werden bewusst nie zwischengespeichert -- eine veraltete
 * Weltkarte wäre schlimmer als gar keine.
 */

const CACHE = 'forest-v1';

const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/js/api.js',
  '/js/ar.js',
  '/js/map.js',
  '/js/sensors.js',
  '/js/ui.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // immer frisch vom Server

  event.respondWith(
    caches.match(event.request).then((treffer) => {
      // Im Hintergrund erneuern, damit Updates ankommen, ohne zu blockieren.
      const netz = fetch(event.request)
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, kopie));
          }
          return antwort;
        })
        .catch(() => treffer ?? caches.match('/index.html'));

      return treffer ?? netz;
    }),
  );
});
