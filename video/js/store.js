/* JZo Video AI – Speicher auf dem Gerät (IndexedDB).
   media: importierte Videos/Fotos/Musik (als Datei), projects: Schnitt-Projekte. */
(function (global) {
  'use strict';
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('jzo-video', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  global.Store = {
    put: function (store, obj) { return tx(store, 'readwrite', function (s) { s.put(obj); }); },
    get: function (store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); },
    all: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
    del: function (store, id) { return tx(store, 'readwrite', function (s) { s.delete(id); }); },
    uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})(this);
