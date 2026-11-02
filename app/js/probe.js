/* Check whether a live channel actually streams: playlist loads, has segments, and a segment
 * contains real video. One check at a time (the account allows a single connection).
 * Plain ES5 + Promises. Exposed as window.Probe; also loadable in Node (pass a fetch with a UA). */
(function (global) {
  'use strict';

  // Dead channels can take ~16s to answer "404", so wait long enough to get a real answer.
  var TIMEOUT_MS = 20000;
  var BUSY_RETRIES = 3, BUSY_WAIT_MS = 4000;
  var MIN_SEGMENT_BYTES = 2048;

  function withTimeout(p, ms, what) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout:' + what)); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function resolveUrl(u, base) {
    try { return new URL(u, base).href; } catch (e) { return u; }
  }

  // Read just the first bytes of a response (don't download the whole segment).
  function firstBytes(res, n) {
    if (res.body && res.body.getReader) {
      var reader = res.body.getReader(), chunks = [], got = 0;
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done || got >= n) { try { reader.cancel(); } catch (e) { /* ignore */ } return; }
          chunks.push(r.value); got += r.value.length;
          return pump();
        });
      };
      return pump().then(function () {
        var out = new Uint8Array(got), off = 0;
        chunks.forEach(function (c) { out.set(c, off); off += c.length; });
        return out;
      });
    }
    return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function looksLikeVideo(b) {
    if (b.length >= 189 && b[0] === 0x47 && b[188] === 0x47) return true;          // MPEG-TS
    if (b.length >= 8) {
      var box = String.fromCharCode(b[4], b[5], b[6], b[7]);
      if (/ftyp|moof|styp|sidx/.test(box)) return true;                              // fMP4
    }
    if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // ID3 + TS/AAC
    return false;
  }

  /* -> Promise<{ ok, definitive, reason, ms }>
   * `definitive` is false when the provider was just busy (503: the account's single connection
   * is in use) or the network failed; such results should not hide a channel.
   * reasons: ok | http-<code> | not-a-stream | no-segments | segment-http-<code> | no-video | timeout | busy | network */
  function check(url, fetchFn, attempt) {
    attempt = attempt || 0;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var raw = fetchFn || global.fetch.bind(global);
    // Abort on timeout so the provider releases the connection before the next check.
    var f = function (u) { return raw(u, ctrl ? { signal: ctrl.signal } : undefined); };
    var t0 = Date.now();
    var done = function (ok, reason) {
      var busy = /http-(503|429|509)$/.test(reason);
      return { ok: ok, reason: busy ? 'busy' : reason, definitive: ok || !(busy || reason === 'network'), ms: Date.now() - t0 };
    };

    function playlist(u, depth) {
      return withTimeout(f(u), TIMEOUT_MS, 'playlist').then(function (r) {
        if (!r.ok) return { fail: 'http-' + r.status };
        var base = r.url || u;
        return withTimeout(r.text(), TIMEOUT_MS, 'playlist').then(function (txt) {
          if (txt.indexOf('#EXTM3U') !== 0) return { fail: 'not-a-stream' };
          var lines = txt.split(/\r?\n/).map(function (l) { return l.trim(); });
          var uris = lines.filter(function (l) { return l && l.charAt(0) !== '#'; });
          if (/#EXT-X-STREAM-INF/.test(txt)) {               // master playlist -> first variant
            if (!uris.length || depth > 1) return { fail: 'no-segments' };
            return playlist(resolveUrl(uris[0], base), depth + 1);
          }
          if (!uris.length) return { fail: 'no-segments' };
          return { segment: resolveUrl(uris[uris.length - 1], base) };
        });
      });
    }

    return playlist(url, 0).then(function (p) {
      if (p.fail) return done(false, p.fail);
      return withTimeout(f(p.segment), TIMEOUT_MS, 'segment').then(function (r) {
        if (!r.ok) return done(false, 'segment-http-' + r.status);
        return withTimeout(firstBytes(r, 4096), TIMEOUT_MS, 'segment').then(function (b) {
          if (b.length < Math.min(MIN_SEGMENT_BYTES, 189) || !looksLikeVideo(b)) return done(false, 'no-video');
          return done(true, 'ok');
        });
      });
    }).catch(function (e) {
      if (ctrl) { try { ctrl.abort(); } catch (x) { /* ignore */ } }
      return done(false, /timeout/.test(String(e && e.message)) ? 'timeout' : 'network');
    }).then(function (r) {
      if (r.reason !== 'busy' || attempt >= BUSY_RETRIES) return r;
      return new Promise(function (res) { setTimeout(res, BUSY_WAIT_MS); })
        .then(function () { return check(url, fetchFn, attempt + 1); });
    });
  }

  global.Probe = { check: check, looksLikeVideo: looksLikeVideo };
})(typeof window !== 'undefined' ? window : globalThis);
