// Service Worker for FieldAR PWA
const CACHE_NAME = 'fieldar-cache-v1';

// Files relative to /demos/
const urlsToCache = [
  './fieldar.html',
  './manifest.json',
  '../dist/fab-annotator.js',
  '../dist/fab-annotator.css',
  '../icons/Blue_GCPA-removebg-preview.png',
  '../icons/Blue_He_Comp.png'
];

// Install SW + cache files
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app files');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Cache addAll error:', err))
  );
});

// Activate SW + remove old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
});

// Intercept requests
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Serve from cache OR network
        return response || fetch(event.request);
      })
      .catch(err => {
        console.error('[SW] Fetch failed:', err);
        return fetch(event.request);
      })
  );
});