/* ==========================================================================
   JZo Jam – Speicher (IndexedDB, bleibt auf dem iPhone)
   "ideas": Infos zu jeder Idee (Name, Tonart, Akkorde, ...)
   "audio": die eigentliche Tonaufnahme (WAV), getrennt, damit die
            Liste schnell lädt.
   ========================================================================== */
(function (root) {
  'use strict';
  var DB_NAME = 'jzo-jam', VERSION = 1, dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('ideas')) db.createObjectStore('ideas', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var result;
        var r = fn(t.objectStore(store));
        if (r) r.onsuccess = function () { result = r.result; };
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('abgebrochen')); };
      });
    });
  }

  var api = {
    allIdeas: function () {
      return tx('ideas', 'readonly', function (s) { return s.getAll(); }).then(function (list) {
        return (list || []).sort(function (a, b) { return b.created - a.created; });
      });
    },
    getIdea: function (id) { return tx('ideas', 'readonly', function (s) { return s.get(id); }); },
    putIdea: function (idea) {
      idea.updated = Date.now();
      return tx('ideas', 'readwrite', function (s) { return s.put(idea); }).then(function () { return idea; });
    },
    deleteIdea: function (id) {
      return tx('ideas', 'readwrite', function (s) { return s.delete(id); }).then(function () {
        return tx('audio', 'readwrite', function (s) { return s.delete(id); });
      });
    },
    putAudio: function (id, buffer) { return tx('audio', 'readwrite', function (s) { return s.put(buffer, id); }); },
    getAudio: function (id) { return tx('audio', 'readonly', function (s) { return s.get(id); }); },
    // Bittet den Browser, die Daten nicht automatisch zu löschen
    persist: function () {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
      return Promise.resolve(false);
    },
    estimate: function () {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().catch(function () { return null; });
      return Promise.resolve(null);
    }
  };
  root.JZoStore = api;
})(self);
