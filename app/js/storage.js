/* Durable key/value storage.
 *
 * On the TV, data is kept in a JSON file in the TV's shared storage (Documents, else Downloads),
 * which survives reinstalling/updating the app — localStorage lives in the app's private data
 * and can be wiped by an install. localStorage is still written as a fast local copy, and is the
 * only store in a desktop browser.
 *
 *   Store.init().then(...)   // once at start-up: loads the file (or migrates from localStorage)
 *   Store.get(key, fallback) // synchronous, from memory
 *   Store.set(key, value)    // memory + localStorage now, file shortly after (batched)
 *   Store.remove(key)
 *   Store.where()            // human-readable location, for Settings
 */
(function (global) {
  'use strict';

  var PREFIX = 'simple-iptv.';
  var FILE_NAME = 'simple-iptv-data.json';
  var ROOTS = ['documents', 'downloads'];
  var FLUSH_MS = 1500;

  var data = {};
  var file = null;          // { root, path } once a writable file location is known
  var flushTimer = null;
  var lastError = '';

  function hasTizenFs() {
    return typeof global.tizen !== 'undefined' && global.tizen.filesystem;
  }

  // ---------- localStorage ----------
  function lsKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  function lsGet(k) {
    try { var v = localStorage.getItem(PREFIX + k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; }
  }
  function lsSet(k, v) {
    try {
      if (v === undefined) localStorage.removeItem(PREFIX + k);
      else localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch (e) { /* ignore */ }
  }

  // ---------- Tizen files (Tizen 5+ openFile API, older resolve/openStream API as fallback) ----------
  function readFile(path) {
    return new Promise(function (resolve, reject) {
      var fs = global.tizen.filesystem;
      if (fs.openFile) {
        try {
          var fh = fs.openFile(path, 'r');
          var text = fh.readString();
          fh.close();
          return resolve(text);
        } catch (e) { return reject(e); }
      }
      var parts = path.split('/');
      fs.resolve(parts[0], function (dir) {
        try {
          var f = dir.resolve(parts[1]);
          f.openStream('r', function (s) { var t = s.read(f.fileSize); s.close(); resolve(t); }, reject, 'UTF-8');
        } catch (e) { reject(e); }
      }, reject, 'r');
    });
  }

  function writeFile(path, text) {
    return new Promise(function (resolve, reject) {
      var fs = global.tizen.filesystem;
      if (fs.openFile) {
        try {
          var fh = fs.openFile(path, 'w');
          fh.writeString(text);
          fh.close();
          return resolve();
        } catch (e) { return reject(e); }
      }
      var parts = path.split('/');
      fs.resolve(parts[0], function (dir) {
        var f;
        try { f = dir.resolve(parts[1]); } catch (e) { try { f = dir.createFile(parts[1]); } catch (e2) { return reject(e2); } }
        f.openStream('w', function (s) { s.write(text); s.close(); resolve(); }, reject, 'UTF-8');
      }, reject, 'rw');
    });
  }

  // Shared storage is a privacy privilege on newer Tizen; ask once if needed (TV usually allows it).
  function permission() {
    return new Promise(function (resolve) {
      var ppm = global.tizen && global.tizen.ppm;
      var priv = 'http://tizen.org/privilege/mediastorage';
      if (!ppm || !ppm.checkPermission) return resolve();
      try {
        var st = ppm.checkPermission(priv);
        if (st === 'PPM_ALLOW') return resolve();
        ppm.requestPermission(priv, function () { resolve(); }, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  // Find (and load) the data file: the first root that has one, else the first writable root.
  function openDurable() {
    var i = 0;
    var tryRead = function () {
      if (i >= ROOTS.length) return Promise.resolve(null);
      var path = ROOTS[i++] + '/' + FILE_NAME;
      return readFile(path).then(function (text) {
        return { path: path, json: JSON.parse(text || '{}') };
      }, function () { return tryRead(); });
    };
    return tryRead().then(function (found) {
      if (found) return found;
      var j = 0;
      var tryWrite = function () {
        if (j >= ROOTS.length) return Promise.resolve(null);
        var path = ROOTS[j++] + '/' + FILE_NAME;
        return writeFile(path, '{}').then(function () { return { path: path, json: {} }; },
          function (e) { lastError = String(e && (e.message || e.name) || e); return tryWrite(); });
      };
      return tryWrite();
    });
  }

  function flush() {
    flushTimer = null;
    if (!file) return;
    writeFile(file.path, JSON.stringify(data)).then(null, function (e) { lastError = String(e && (e.message || e.name) || e); });
  }
  function scheduleFlush() {
    if (!file || flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function init() {
    // Start from the local copy so the app works even if the file can't be used.
    lsKeys().forEach(function (k) { data[k] = lsGet(k); });
    if (!hasTizenFs()) return Promise.resolve();
    return permission().then(openDurable).then(function (found) {
      if (!found) return;
      file = { path: found.path };
      var fromFile = found.json || {};
      if (Object.keys(fromFile).length) {
        // The file is the source of truth (it survives reinstalls); refresh the local copy.
        data = fromFile;
        Object.keys(data).forEach(function (k) { lsSet(k, data[k]); });
      } else {
        flush(); // first run with a file: migrate what localStorage had
      }
    }).then(null, function (e) { lastError = String(e && (e.message || e.name) || e); });
  }

  global.Store = {
    init: init,
    get: function (k, fallback) { return data[k] === undefined || data[k] === null ? fallback : data[k]; },
    set: function (k, v) { data[k] = v; lsSet(k, v); scheduleFlush(); },
    remove: function (k) { delete data[k]; lsSet(k, undefined); scheduleFlush(); },
    flush: function () { if (flushTimer) { clearTimeout(flushTimer); flush(); } },
    where: function () {
      if (file) return 'TV storage · ' + file.path.split('/')[0];
      return hasTizenFs() ? 'app storage only (' + (lastError || 'no shared storage') + ')' : 'browser storage';
    },
  };
})(window);
