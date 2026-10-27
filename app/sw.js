/* JZo Jam Studio – Offline-Unterstützung.
   Holt immer zuerst die neueste Version aus dem Netz; nur wenn kein Netz
   da ist (z. B. im Proberaum), wird die gespeicherte Kopie verwendet. */
var CACHE = 'jzo-jam-v2';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/theory.js', 'js/dsp.js', 'js/storage.js', 'js/app.js',
  'js/analysis-worker.js', 'js/recorder-worklet.js',
  'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png',
  '../assets/img/logo-transparent.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
