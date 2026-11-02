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

  function normalizeHost(host) {
    host = String(host || '').trim().replace(/\/+$/, '');
    if (host && !/^https?:\/\//i.test(host)) host = 'http://' + host;
    return host;
  }

  function Api(creds) {
    this.host = normalizeHost(creds.host);
    this.username = creds.username;
    this.password = creds.password;
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
    return fetch(proxify(this.url(params)))
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
    return fetch(proxify(this.url({ action: 'get_short_epg', stream_id: streamId, limit: 2 })))
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.epg_listings) || []; })
      .catch(function () { return []; });
  };

  // Full guide for one channel: about a week of past programmes and a week ahead.
  Api.prototype.epgTable = function (streamId) {
    return fetch(proxify(this.url({ action: 'get_simple_data_table', stream_id: streamId })))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        return ((d && d.epg_listings) || []).map(function (p) {
          return { start: Number(p.start_timestamp) * 1000, stop: Number(p.stop_timestamp) * 1000,
            title: Api.decode(p.title), desc: Api.decode(p.description) };
        });
      });
  };

  Api.prototype.liveUrl = function (streamId) {
    return proxify(this.host + '/live/' + encodeURIComponent(this.username) + '/' + encodeURIComponent(this.password) + '/' + streamId + '.m3u8');
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

  Api.IS_TV = IS_TV;
  global.Api = Api;
})(window);
