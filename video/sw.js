/* JZo Video AI – Offline-Unterstützung.
   Holt immer zuerst die neueste Version aus dem Netz; ohne Netz die gespeicherte Kopie.
   Bei Änderungen an App-Dateien CACHE hochzählen. */
var CACHE = 'jzo-video-v1';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/video.css',
  'js/library.js', 'js/store.js', 'js/render.js', 'js/ai.js', 'js/app.js', 'data/library.json',
  'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png',
  '../assets/img/logo-transparent.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('jzo-video-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
