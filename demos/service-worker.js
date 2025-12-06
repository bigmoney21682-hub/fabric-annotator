const CACHE_NAME = 'fieldar-cache-v1';
const urlsToCache = [
  './fieldar.html',
  './manifest.json',
  './fab-annotator.js',
  './fab-annotator.css',
  './icons/Blue_GCPA-removebg-preview.png',
  './icons/Blue_He_Comp.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});