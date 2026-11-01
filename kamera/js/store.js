/* M1993 – Fotos auf dem Gerät speichern (IndexedDB „jzo-kamera“).
   photos: { id, t, w, h, src:'kamera'|'import', set:{look,adj,wb,ev,iso,time,seed},
             orig: Blob (ohne Look), out: Blob (fertiges JPEG), thumb: Blob, big?: Blob, bigW, bigH } */
(function (global) {
  'use strict';
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('jzo-kamera', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('photos', mode), s = t.objectStore('photos'), out = fn(s);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error || new Error('Speichern abgebrochen (Speicher voll?)')); };
      });
    });
  }
  global.Store = {
    put: function (o) { return tx('readwrite', function (s) { s.put(o); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    all: function () { return tx('readonly', function (s) { return s.getAll(); }).then(function (a) { return a.sort(function (x, y) { return y.t - x.t; }); }); },
    del: function (id) { return tx('readwrite', function (s) { s.delete(id); }); },
    uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})(this);
