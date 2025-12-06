const CACHE_NAME = 'fieldar-cache-v1';
const urlsToCache = [
  '/fabric-annotator/fieldar.html',
  '/fabric-annotator/manifest.json',
  '/fabric-annotator/icons/icon-192.png',
  '/fabric-annotator/icons/icon-512.png',
  '/fabric-annotator/fabric.min.js'
];

// Install event: cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      )
    )
  );
});

// Fetch event: respond with cache first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});