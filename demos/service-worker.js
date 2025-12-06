const CACHE_NAME = 'fieldar-cache-v1';
const urlsToCache = [
  '/fabric-annotator/fieldar.html',
  '/fabric-annotator/manifest.json',
  '/fabric-annotator/icons/icon-192.png',
  '/fabric-annotator/icons/icon-512.png',
  '/fabric-annotator/style.css',  // optional, if you have a separate CSS file
  '/fabric-annotator/fabric.min.js' // optional if you’re using local Fabric.js
];

// Install event: cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
});

// Fetch event: respond with cached files when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
