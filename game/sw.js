/* JZo World – Offline-Unterstützung.
   Holt immer zuerst die neueste Version aus dem Netz; ohne Netz die gespeicherte Kopie.
   Bei Änderungen an Spiel-Dateien CACHE hochzählen. */
var CACHE = 'jzo-world-v2';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/game.css',
  'js/main.js', 'js/input.js', 'js/models.js', 'js/vehicles.js', 'js/world.js', 'js/env.js', 'js/fx.js', 'js/util.js',
  'js/vendor/three.module.min.js', 'js/vendor/objects/Sky.js', 'js/vendor/utils/BufferGeometryUtils.js',
  'js/vendor/postprocessing/EffectComposer.js', 'js/vendor/postprocessing/RenderPass.js', 'js/vendor/postprocessing/UnrealBloomPass.js',
  'js/vendor/postprocessing/OutputPass.js', 'js/vendor/postprocessing/ShaderPass.js', 'js/vendor/postprocessing/Pass.js', 'js/vendor/postprocessing/MaskPass.js',
  'js/vendor/shaders/CopyShader.js', 'js/vendor/shaders/LuminosityHighPassShader.js', 'js/vendor/shaders/OutputShader.js',
  'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png', 'img/jan-avatar.jpg'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('jzo-world-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
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
