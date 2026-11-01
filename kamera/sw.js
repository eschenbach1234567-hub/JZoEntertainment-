/* M1993 – Offline-Unterstützung.
   App-Dateien: erst Netz (neueste Version), ohne Netz die gespeicherte Kopie.
   KI-Dateien (vendor/, models/): einmal laden, dann aus dem Speicher (groß, ändern sich nicht).
   Bei Änderungen an App-Dateien CACHE hochzählen. */
var CACHE = 'jzo-kamera-v3';
var AI_CACHE = 'jzo-kamera-ki-v1';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/kamera.css',
  'js/looks.js', 'js/jpeg.js', 'js/gl.js', 'js/store.js', 'js/ai.js', 'js/app.js',
  'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return (k.indexOf('jzo-kamera-v') === 0 && k !== CACHE) || (k.indexOf('jzo-kamera-ki-') === 0 && k !== AI_CACHE);
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/kamera\/(vendor|models)\//.test(url.pathname)) {
    e.respondWith(caches.open(AI_CACHE).then(function (c) {
      return c.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) { if (res.ok) c.put(e.request, res.clone()); return res; });
      });
    }));
    return;
  }
  e.respondWith(fetch(e.request).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
