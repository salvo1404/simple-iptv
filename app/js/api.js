/* Xtream Codes API client.
 * Plain ES2017 (no modules, no optional chaining) so it runs on older Tizen Chromium. */
(function (global) {
  'use strict';

  var IS_TV = typeof global.tizen !== 'undefined';
  // In a desktop browser, route everything through the dev server's proxy (CORS).
  var USE_PROXY = !IS_TV && /^https?:$/.test(global.location.protocol);

  function proxify(url) {
    return USE_PROXY ? '/proxy?url=' + encodeURIComponent(url) : url;
  }

  // The provider's front door (Cloudflare) often answers 502/503/504 for a moment when its server
  // hiccups (~40% of requests at bad times). Retry those, and network errors, before giving up.
  var RETRY_STATUS = { 500: 1, 502: 1, 503: 1, 504: 1, 520: 1, 521: 1, 522: 1, 524: 1 };
  function fetchRetry(url, opts, tries) {
    tries = tries || 5;
    var attempt = 0;
    function go() {
      attempt++;
      return fetch(url, opts).then(function (r) {
        if (RETRY_STATUS[r.status] && attempt < tries) return wait(attempt).then(go);
        return r;
      }, function (err) {
        if (attempt < tries) return wait(attempt).then(go);
        throw err;
      });
    }
    return go();
  }
  function wait(n) { return new Promise(function (res) { setTimeout(res, 400 * n + Math.random() * 300); }); }

  function normalizeHost(host) {
    host = String(host || '').trim().replace(/\/+$/, '');
    if (host && !/^https?:\/\//i.test(host)) host = 'http://' + host;
    return host;
  }

  function Api(creds) {
    this.host = normalizeHost(creds.host);
    this.username = creds.username;
    this.password = creds.password;
    this.format = creds.format === 'ts' ? 'ts' : 'm3u8';   // stream output format
    this.cache = {};
  }

  Api.prototype.url = function (params) {
    var q = 'username=' + encodeURIComponent(this.username) + '&password=' + encodeURIComponent(this.password);
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) q += '&' + k + '=' + encodeURIComponent(params[k]);
    });
    return this.host + '/player_api.php?' + q;
  };

  Api.prototype.get = function (params) {
    var key = JSON.stringify(params || {});
    if (this.cache[key]) return Promise.resolve(this.cache[key]);
    var self = this;
    return fetchRetry(proxify(this.url(params)))
      .then(function (r) {
        if (!r.ok) throw new Error('Server responded ' + r.status);
        return r.json();
      })
      .then(function (data) {
        self.cache[key] = data;
        return data;
      });
  };

  Api.prototype.login = function () {
    return this.get().then(function (data) {
      if (!data || !data.user_info || Number(data.user_info.auth) !== 1) {
        throw new Error('Invalid username or password');
      }
      return data;
    });
  };

  Api.prototype.liveCategories = function () { return this.get({ action: 'get_live_categories' }); };
  // One request for every live channel (~6k for a typical provider, ~2s); categories are filtered locally.
  Api.prototype.allStreams = function () { return this.get({ action: 'get_live_streams' }); };
  Api.prototype.liveStreams = function (categoryId) {
    return this.allStreams().then(function (all) {
      return (all || []).filter(function (s) { return String(s.category_id) === String(categoryId); });
    });
  };

  Api.prototype.shortEpg = function (streamId) {
    // EPG changes over time, so bypass the cache.
    return fetchRetry(proxify(this.url({ action: 'get_short_epg', stream_id: streamId, limit: 2 })))
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.epg_listings) || []; })
      .catch(function () { return []; });
  };

  // Full guide for one channel: about a week of past programmes and a week ahead.
  Api.prototype.epgTable = function (streamId) {
    return fetchRetry(proxify(this.url({ action: 'get_simple_data_table', stream_id: streamId })))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        return ((d && d.epg_listings) || []).map(function (p) {
          return { start: Number(p.start_timestamp) * 1000, stop: Number(p.stop_timestamp) * 1000,
            title: Api.decode(p.title), desc: Api.decode(p.description) };
        });
      });
  };

  Api.prototype.liveUrl = function (streamId) {
    return proxify(this.host + '/live/' + encodeURIComponent(this.username) + '/' + encodeURIComponent(this.password) + '/' + streamId + '.' + this.format);
  };

  Api.prototype.image = function (url) {
    if (!url) return '';
    // Logos are often plain http; proxy them in the browser to avoid mixed-content / hotlink issues.
    return /^https?:\/\//i.test(url) ? proxify(url) : '';
  };

  // EPG titles/descriptions are base64-encoded by Xtream servers.
  Api.decode = function (s) {
    if (!s) return '';
    try {
      return decodeURIComponent(escape(atob(s)));
    } catch (e) {
      return s;
    }
  };

  // ---------- M3U playlist (URL) ----------
  // Same interface as Api, built from an #EXTM3U file: group-title -> category, tvg-logo -> logo,
  // tvg-id -> guide id. There is no programme guide in an M3U, so EPG calls return nothing.
  function attr(line, name) {
    var m = line.match(new RegExp(name + '="([^"]*)"', 'i'));
    return m ? m[1] : '';
  }

  function parseM3U(text) {
    var lines = String(text || '').split(/\r?\n/);
    if (!/^\s*#EXTM3U/.test(lines[0] || '')) throw new Error('This is not an M3U playlist');
    var cats = [], catId = {}, streams = [], info = null;
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^#EXTINF/i.test(line)) { info = line; return; }
      if (line.charAt(0) === '#' || !info) return;
      var group = attr(info, 'group-title') || 'Channels';
      if (!(group in catId)) { catId[group] = 'm' + cats.length; cats.push({ category_id: catId[group], category_name: group }); }
      var comma = info.lastIndexOf(',');
      streams.push({
        stream_id: streams.length + 1, num: streams.length + 1,
        name: (comma >= 0 ? info.slice(comma + 1) : attr(info, 'tvg-name')).trim() || attr(info, 'tvg-name') || 'Channel',
        stream_icon: attr(info, 'tvg-logo'), epg_channel_id: attr(info, 'tvg-id'),
        category_id: catId[group], url: line,
      });
      info = null;
    });
    return { cats: cats, streams: streams };
  }

  function M3UApi(pl) {
    this.m3uUrl = String(pl.url || '').trim();
    this.data = null;
  }
  M3UApi.prototype.load = function () {
    var self = this;
    if (this.data) return Promise.resolve(this.data);
    return fetchRetry(proxify(this.m3uUrl)).then(function (r) {
      if (!r.ok) throw new Error('Playlist responded ' + r.status);
      return r.text();
    }).then(function (t) { self.data = parseM3U(t); return self.data; });
  };
  M3UApi.prototype.login = function () {
    return this.load().then(function (d) { if (!d.streams.length) throw new Error('No channels found in this playlist'); return d; });
  };
  M3UApi.prototype.liveCategories = function () { return this.load().then(function (d) { return d.cats; }); };
  M3UApi.prototype.allStreams = function () { return this.load().then(function (d) { return d.streams; }); };
  M3UApi.prototype.liveStreams = function (id) {
    return this.allStreams().then(function (all) { return all.filter(function (s) { return String(s.category_id) === String(id); }); });
  };
  M3UApi.prototype.shortEpg = function () { return Promise.resolve([]); };
  M3UApi.prototype.epgTable = function () { return Promise.resolve([]); };
  M3UApi.prototype.url = function () { return this.m3uUrl; };
  M3UApi.prototype.image = Api.prototype.image;
  M3UApi.prototype.liveUrl = function (streamId) {
    var s = this.data && this.data.streams[Number(streamId) - 1];
    return s ? proxify(s.url) : '';
  };

  // A playlist is { id, name, type: 'xtream' | 'm3u', host, username, password, format, url }.
  Api.forPlaylist = function (pl) { return pl.type === 'm3u' ? new M3UApi(pl) : new Api(pl); };
  Api.parseM3U = parseM3U;

  Api.fetchRetry = fetchRetry;
  Api.IS_TV = IS_TV;
  global.Api = Api;
})(window);
