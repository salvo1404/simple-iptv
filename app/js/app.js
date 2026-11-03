/* Simple IPTV — app controller.
 * Screens: login → home (shortcuts + countries) → browse (categories + channels) → player. */
(function () {
  'use strict';

  var K = Nav.KEYS;

  var $ = function (id) { return document.getElementById(id); };
  var api = null;

  var state = {
    groups: null,       // { topics: [], countries: [] }
    group: null,        // the country/topic being browsed
    catId: null,
    items: [],          // channels in the current category
    playList: [],       // channel list we were in when playback started (for zapping)
    playIndex: -1,
  };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hhmm(ts) {
    var d = new Date(ts * 1000);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function each(selector, fn) { Array.prototype.forEach.call(document.querySelectorAll(selector), fn); }

  function showScreen(id) {
    ['splash', 'login', 'home', 'browse', 'player', 'diag', 'settings'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
  }
  function isShown(id) { return !$(id).classList.contains('hidden'); }

  function exitApp() {
    if (Api.IS_TV) { try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* ignore */ } }
  }

  // ---------- playlists ----------
  // Store 'playlists': [{ id, name, type: 'xtream'|'m3u', host, username, password, format, url }],
  // 'activePlaylist': id. Favourites and channel checks are stored per playlist (see ns()).
  var playlists = [], activeId = null;

  function ns(key) { return 'pl:' + activeId + ':' + key; }
  function activePlaylist() { return playlists.filter(function (p) { return p.id === activeId; })[0] || null; }
  function savePlaylists() { Store.set('playlists', playlists); Store.set('activePlaylist', activeId); }
  function newId() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function plLabel(p) {
    var where = p.type === 'm3u' ? p.url : p.host;
    return p.name || String(where || '').replace(/^https?:\/\//, '').split('/')[0] || 'Playlist';
  }

  // First run after the playlists update: turn the old single login (or the dev file in the browser)
  // into a playlist and move its favourites / checks under it.
  function migratePlaylists() {
    playlists = Store.get('playlists', []);
    activeId = Store.get('activePlaylist', null);
    if (playlists.length) {
      if (!activePlaylist()) activeId = playlists[0].id;
      applySeeds();
      return;
    }
    var c = Store.get('creds', null), dev = window.DEV_CREDS;
    if (!c && dev && dev.host && dev.username && dev.password) c = dev;
    if (!c) return;
    var pl = { id: newId(), type: 'xtream', name: '', host: c.host, username: c.username, password: c.password, format: 'm3u8' };
    pl.name = plLabel(pl);
    playlists = [pl];
    activeId = pl.id;
    ['favourites', 'health', 'scans', 'scanlog'].forEach(function (k) {
      var v = Store.get(k);
      if (v !== undefined && v !== null) Store.set(ns(k), v);
      Store.remove(k);
    });
    Store.remove('creds');
    savePlaylists();
    applySeeds();
  }

  // Dev/one-off: app/seed.local.js (git-ignored) may set window.DEV_SEED_PLAYLISTS = [{...}] to add
  // playlists without the on-screen form. Each is added once (matched by URL, or server + username).
  function applySeeds() {
    var seeds = window.DEV_SEED_PLAYLISTS || [];
    seeds.forEach(function (sd) {
      var exists = playlists.filter(function (p) {
        return sd.type === 'm3u' ? p.url === sd.url : (p.host === sd.host && p.username === sd.username);
      })[0];
      if (exists) return;
      var pl = { id: newId(), type: sd.type || 'xtream', name: sd.name || '', host: sd.host, username: sd.username,
        password: sd.password, url: sd.url, format: sd.format || 'm3u8' };
      if (!pl.name) pl.name = plLabel(pl);
      playlists.push(pl);
      if (sd.active || !activeId) activeId = pl.id;
    });
    if (seeds.length) savePlaylists();
  }

  function switchPlaylist(id) {
    activeId = id;
    savePlaylists();
    Store.flush();
    setTimeout(function () { location.reload(); }, 150);
  }

  function deletePlaylist(id) {
    ['favourites', 'health', 'scans', 'scanlog'].forEach(function (k) { Store.remove('pl:' + id + ':' + k); });
    playlists = playlists.filter(function (p) { return p.id !== id; });
    if (activeId === id) {
      switchPlaylist(playlists.length ? playlists[0].id : null);
      return;
    }
    savePlaylists();
    renderPlaylists();
    Nav.focus(document.querySelector('#pl-list .chip'));
  }

  function renderPlaylists() {
    var html = playlists.map(function (p) {
      var on = p.id === activeId;
      return '<div class="chip-line">' +
        '<button class="chip focusable pl-use' + (on ? ' on' : '') + '" data-use="' + esc(p.id) + '">' + (on ? '✓ ' : '') + esc(plLabel(p)) +
          '<span class="chip-res">' + (p.type === 'm3u' ? 'M3U' : 'Xtream') + '</span></button>' +
        '<button class="chip focusable" data-edit="' + esc(p.id) + '">Edit</button>' +
        '<button class="chip focusable" data-del="' + esc(p.id) + '">Delete</button></div>';
    }).join('');
    html += '<div class="chip-line"><button class="chip focusable" data-add="1">+ Add playlist</button></div>';
    $('pl-list').innerHTML = html;
  }

  // ---------- add / edit playlist form ----------
  var form = { editId: null, from: 'boot', type: 'xtream', format: 'm3u8' };

  function setFormType(t) {
    form.type = t;
    each('#pl-type .chip', function (c) { c.classList.toggle('on', c.getAttribute('data-type') === t); });
    $('pl-xtream').classList.toggle('hidden', t !== 'xtream');
    $('pl-m3u').classList.toggle('hidden', t !== 'm3u');
  }
  function setFormFormat(f) {
    form.format = f;
    each('#pl-format .chip', function (c) { c.classList.toggle('on', c.getAttribute('data-format') === f); });
  }

  function showPlaylistForm(pl, error, from) {
    pl = pl || {};
    form.editId = pl.id || null;
    form.from = from || (playlists.length ? 'settings' : 'boot');
    $('pl-heading').textContent = pl.id ? 'Edit playlist' : (playlists.length ? 'Add a playlist' : 'Add your first playlist');
    $('f-name').value = pl.name || '';
    $('f-host').value = pl.host || '';
    $('f-user').value = pl.username || '';
    $('f-pass').value = pl.password || '';
    $('f-url').value = pl.url || '';
    setFormType(pl.type || 'xtream');
    setFormFormat(pl.format || 'm3u8');
    $('f-cancel').classList.toggle('hidden', form.from === 'boot');
    $('login-error').textContent = error || '';
    // If this playlist failed at start-up, offer the others so you're never stuck here.
    var others = playlists.filter(function (p) { return p.id !== pl.id; });
    $('pl-others').innerHTML = error && others.length ? '<span class="chip-label">Or switch to</span>' + others.map(function (p) {
      return '<button class="chip focusable" data-use="' + esc(p.id) + '">' + esc(plLabel(p)) + '</button>';
    }).join('') : '';
    showScreen('login');
    Nav.focus(document.querySelector('#pl-type .chip.on'));
  }

  function connect() {
    var pl = { id: form.editId || newId(), type: form.type, name: $('f-name').value.trim(), format: form.format };
    if (pl.type === 'm3u') {
      pl.url = $('f-url').value.trim();
      if (!pl.url) { $('login-error').textContent = 'Please enter the M3U URL'; return; }
    } else {
      pl.host = $('f-host').value.trim(); pl.username = $('f-user').value.trim(); pl.password = $('f-pass').value;
      if (!pl.host || !pl.username || !pl.password) { $('login-error').textContent = 'Please fill in server, username and password'; return; }
    }
    if (!pl.name) pl.name = plLabel(pl);
    var btn = $('f-connect');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    $('login-error').textContent = '';
    Api.forPlaylist(pl).login().then(function () {
      var i = -1;
      playlists.forEach(function (p, k) { if (p.id === pl.id) i = k; });
      if (i >= 0) playlists[i] = pl; else playlists.push(pl);
      switchPlaylist(pl.id);   // saves and restarts on this playlist
    }).catch(function (err) {
      $('login-error').textContent = (err && err.message) || 'Could not connect';
      btn.disabled = false;
      btn.textContent = 'Save and connect';
    });
  }

  function cancelForm() {
    if (form.from === 'settings') openSettings();
  }

  function start(pl) {
    var candidate = Api.forPlaylist(pl);
    return candidate.login().then(function () {
      if (!isShown('login')) showScreen('splash');
      return Promise.all([candidate.liveCategories(), candidate.allStreams()]);
    }).then(function (res) {
      var cats = res[0] || [], streams = res[1] || [];
      api = candidate;
      state.cats = cats;
      state.groups = buildGroups();
      state.catName = {};
      cats.forEach(function (c) { state.catName[c.category_id] = c.category_name; });
      state.rawStreams = streams;
      state.live = {};
      rebuildChannels();
      renderSettings();
      renderHome();
      showHome();
      refreshLiveNow();
      clearInterval(state.liveTimer);
      state.liveTimer = setInterval(refreshLiveNow, LIVE_REFRESH_MS);
    });
  }

  // ---------- favourites ----------
  // Stored locally as small snapshots so the Favourites row renders without extra requests.
  var FAV_KEY = 'favourites';
  var favs = [];   // loaded from Store in init()

  function isFav(ch) {
    return favs.some(function (f) { return String(f.stream_id) === String(ch.stream_id); });
  }

  function toggleFav(ch) {
    if (isFav(ch)) {
      favs = favs.filter(function (f) { return String(f.stream_id) !== String(ch.stream_id); });
    } else {
      favs.push({ stream_id: ch.stream_id, name: ch.name, stream_icon: ch.stream_icon, num: ch.num, category_id: ch.category_id });
    }
    Store.set(ns(FAV_KEY), favs);
    state.homeDirty = true;
    // Refresh every place that shows favourite state.
    each('#channel-list li[data-i]', function (li) {
      li.classList.toggle('fav', isFav(state.items[Number(li.getAttribute('data-i'))]));
    });
    if (state.detailsItem) updateFavButton(state.detailsItem);
    return isFav(ch);
  }

  function updateFavButton(ch) {
    var on = isFav(ch);
    $('d-fav').classList.toggle('on', on);
    $('d-fav').innerHTML = Icons.svg('star', 'fav-icon') + '<span>' + (on ? 'In favourites' : 'Add to favourites') + '</span>';
  }

  // ---------- home ----------
  // Rows: Favourites · Countries · Sports · Other (News, Entertainment, Documentaries, Music). Nothing else.
  var COUNTRY_FIRST = ['IT', 'US', 'UK', 'FR', 'ES'];   // shown as countries, in this order
  var OTHER_TOPICS = ['news', 'docs', 'music', 'adult'];   // Entertainment has its own row

  // Modern look: the page glows softly in the colour of the focused tile.
  var AMBIENT = {
    country: { IT: '#1d7a45', US: '#2b3f8f', UK: '#2a3f8f', GB: '#2a3f8f', FR: '#2450a8', ES: '#a8321f', NZ: '#22357f', DE: '#8a6a10' },
    sport: { basketball: '#c0601f', football: '#2a8a52', tennis: '#3a78c0', motorsport: '#5a606a', americanFootball: '#2e7d32',
      rugby: '#33874a', fight: '#a0283a', baseball: '#a8683f', cricket: '#4f8f45', golf: '#4f9fd0', hockey: '#7fb7dc', more: '#5a4796' },
    ent: { disney: '#1d3fa0', apple: '#555a63', hbo: '#6d2ae0', hulu: '#1aa866', US: '#2b3f8f', UK: '#2a3f8f', prime: '#1f78b0',
      amc: '#a8861f', peacock: '#4a4f58', skystore: '#4a35b0' },
    topic: { news: '#8e3b3b', docs: '#378183', music: '#9c4084', entertainment: '#3a6db0', adult: '#6a2436' },
  };
  function ambient(kind, id) { return (AMBIENT[kind] && AMBIENT[kind][id]) || '#3a4a7a'; }

  // Looks: 'modern' (default), 'cinema' (streaming-app style with a photo spotlight), 'classic'.
  function currentStyle() { return settings.style === 'classic' || settings.style === 'cinema' ? settings.style : 'modern'; }
  // Background glow: one cheap gradient, updated only after you stop moving (no per-key repaint/fade).
  var ambientTimer = null, ambientColor = null;
  function setAmbient(color) {
    if (!color || color === ambientColor) return;
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(function () {
      ambientColor = color;
      $('ambient').style.backgroundImage = 'radial-gradient(ellipse 75% 65% at 18% 0%, ' + color + ' 0%, transparent 70%)';
    }, 220);
  }

  function applyStyle() {
    var st = currentStyle();
    document.documentElement.classList.toggle('modern', st === 'modern' || st === 'cinema');
    document.documentElement.classList.toggle('cinema', st === 'cinema');
    document.documentElement.classList.toggle('cinema-thumbs', st === 'cinema');   // 16:9 thumbnails in the rows
  }

  // ---------- spotlight (Cinema look): big preview of the focused home tile ----------
  var KIND_LABEL = { c: 'Country', s: 'Sport', e: 'Entertainment', t: 'Collection', f: 'Favourite' };
  function heroText(tile) {
    var g = tile.getAttribute('data-g'), k = g.charAt(0), n = Number(g.slice(1));
    var name = tile.querySelector('.tile-name').textContent;
    if (k === 'c') {
      var c = state.groups.countries[n];
      return { desc: c.name === 'Other' ? 'Leagues, events and channels that don’t belong to one country.' :
        'Every ' + c.name + ' category in one place: ' + c.cats.slice(0, 4).map(function (x) { return x.name; }).join(', ') + (c.cats.length > 4 ? ' and more.' : '.') };
    }
    if (k === 's') {
      var sp = state.sports[n], live = liveEvents(sp.id);
      return { desc: live.length ? 'Live now: ' + live.slice(0, 2).map(function (e) { return e.title; }).join(' · ') :
        name + ' channels from every country, gathered in one place.' };
    }
    if (k === 'e') return { desc: 'Channels from ' + name + '.' };
    if (k === 't') return { desc: 'All ' + name.toLowerCase() + ' channels from every country.' };
    if (k === 'f') return { desc: 'One of your favourites. Press OK to watch.' };
    return { desc: '' };
  }

  function updateHero(tile) {
    if (currentStyle() !== 'cinema' || !tile || !tile.getAttribute('data-g')) return;
    var k = tile.getAttribute('data-g').charAt(0);
    $('hero-kicker').textContent = KIND_LABEL[k] || '';
    $('hero-title').textContent = tile.querySelector('.tile-name').textContent;
    var sub = tile.querySelector('.tile-sub');
    $('hero-meta').innerHTML = sub ? sub.innerHTML : '';
    $('hero-desc').textContent = heroText(tile).desc;
    // A real photo when we have one (countries, sports, topics); otherwise the tile's own picture.
    var key = heroPhotoKey(tile);
    var credit = key && window.HERO_CREDITS && window.HERO_CREDITS[key];
    if (credit) {
      if ($('hero-art').getAttribute('data-photo') !== key) {
        $('hero-art').innerHTML = '<img class="hero-photo" alt="" src="img/hero/' + key + '.jpg" onload="this.classList.add(\'in\')">' +
          '<span class="hero-credit">Photo: ' + esc(credit.artist) + ' · ' + esc(credit.license) + '</span>';
        $('hero-art').setAttribute('data-photo', key);
      }
    } else {
      var art = tile.querySelector('.flag-box, .art, .fav-logo');
      $('hero-art').innerHTML = art ? art.outerHTML : '';
      $('hero-art').removeAttribute('data-photo');
    }
    $('hero-art').setAttribute('data-kind', k);
  }

  function heroPhotoKey(tile) {
    var g = tile.getAttribute('data-g'), k = g.charAt(0), n = Number(g.slice(1));
    if (k === 'c') { var c = state.groups.countries[n]; return 'country-' + (c.name === 'Other' ? 'OTHER' : c.code); }
    if (k === 's') return 'sport-' + state.sports[n].id;
    if (k === 't') return 'topic-' + state.groups.topics[n].topic;
    return null;
  }

  function row(zone, icon, title, tiles) {
    return '<section class="row" data-zone="row-' + zone + '">' +
      '<h3 class="row-title">' + Icons.svg(icon, 'row-icon') + title + '</h3>' +
      '<div class="tile-row">' + tiles + '</div></section>';
  }

  // Flag if we have one, a globe for "Other", the country code otherwise.
  function countryMark(c) {
    if (Flags.has(c.code)) return '<span class="flag-box">' + Flags.svg(c.code) + '</span>';
    if (c.name === 'Other') return '<span class="art" data-art="world">' + Icons.svg('globe', 'art-icon') + '</span>';
    return '<span class="art" data-art="world"><span class="art-code">' + esc(c.code) + '</span></span>';
  }

  // Entertainment row: streaming services and country entertainment, in this order.
  // `match` is tested against the provider's category names; services with no category are skipped.
  var ENT_SERVICES = [
    { id: 'disney',  name: 'Disney+',          match: /DISNEY/ },
    { id: 'apple',   name: 'Apple TV+',        match: /APPLE/ },
    { id: 'hbo',     name: 'HBO Max',          match: /HBO/ },
    { id: 'hulu',    name: 'Hulu',             match: /HULU/ },
    { id: 'ent-us',  name: 'Entertainment US', match: /^US\s*-\s*ENTERTAINMENT/, flag: 'US' },
    { id: 'prime',   name: 'Prime Video',      match: /AMAZON\s*PRIME|PRIME\s*VIDEO/ },
    { id: 'amc',     name: 'AMC+',             match: /AMC/ },
    { id: 'peacock', name: 'Peacock',          match: /PEACOCK/ },
    { id: 'ent-uk',  name: 'Entertainment UK', match: /^UK\s*-\s*ENTERTAINMENT/, flag: 'UK' },
    { id: 'skystore', name: 'Sky Store',       match: /SKY STORE/ },
    { id: 'mov-us',  name: 'Movies US',        match: /^US\s*-\s*MOVIES/, flag: 'US' },
    { id: 'mov-uk',  name: 'Movies UK',        match: /^UK\s*-\s*MOVIES/, flag: 'UK' },
  ];

  function entertainmentServices() {
    var info = state.groups.catInfo;
    return ENT_SERVICES.map(function (sv) {
      var cats = Object.keys(info).filter(function (id) { return sv.match.test(String(info[id].raw).toUpperCase()); });
      return { sv: sv, cats: cats };
    }).filter(function (x) { return x.cats.length; });
  }

  // A service tile opens just that service (its provider categories in the left column).
  function serviceGroup(x) {
    var info = state.groups.catInfo;
    return {
      kind: 'ent', name: x.sv.name, service: x.sv,
      cats: x.cats.map(function (id) { return { id: id, name: x.cats.length > 1 ? info[id].name : 'All ' + x.sv.name }; }),
    };
  }

  function entArt(sv) {
    if (sv.flag && Flags.has(sv.flag)) return '<span class="flag-box">' + Flags.svg(sv.flag) + '</span>';
    return '<span class="art svc" data-brand="' + esc(sv.id) + '"><span class="wordmark">' + esc(sv.name) + '</span></span>';
  }

  // Sport tiles show a real photo (img/tile/sport-<id>.jpg), cropped to the tile; icon as fallback.
  var SPORT_PHOTOS = { basketball: 1, football: 1, tennis: 1, motorsport: 1, americanFootball: 1, rugby: 1,
    fight: 1, baseball: 1, cricket: 1, golf: 1, hockey: 1, more: 1 };
  function sportArt(sp) {
    if (SPORT_PHOTOS[sp.id]) {
      return '<span class="art has-photo" data-art="' + esc(sp.id) + '"><img class="art-photo" alt="" src="img/tile/sport-' + esc(sp.id) + '.jpg"></span>';
    }
    return '<span class="art" data-art="' + esc(sp.id) + '">' + Icons.color(sp.icon) + '</span>';
  }

  function categoriesLabel(n) { return n + (n === 1 ? ' category' : ' categories'); }

  function renderHome() {
    var html = '';

    if (favs.length && settings.homeFavourites !== false) {
      html += row('favs', 'star', 'Favourites', favs.map(function (f, i) {
        return '<button class="tile fav-tile focusable" data-g="f' + i + '" data-amb="#8a6d1e">' +
          '<span class="fav-logo"></span>' +
          '<span class="tile-name">' + esc(f.name) + '</span></button>';
      }).join(''));
    }

    // Italy, US, UK first; then the rest by size (already sorted), "Other" stays last.
    var countries = state.groups.countries.map(function (c, i) { return { c: c, i: i }; });
    var rank = function (x) { var r = COUNTRY_FIRST.indexOf(x.c.code); return r < 0 ? COUNTRY_FIRST.length : r; };
    countries.sort(function (a, b) { return rank(a) - rank(b) || a.i - b.i; });
    html += row('countries', 'globe', 'Countries', countries.map(function (x) {
      return '<button class="tile compact focusable" data-g="c' + x.i + '" data-amb="' + ambient('country', x.c.code) + '">' +
        countryMark(x.c) +
        '<span class="tile-name">' + esc(x.c.name) + '</span>' +
        '<span class="tile-sub">' + categoriesLabel(x.c.cats.length) + '</span></button>';
    }).join(''));

    html += row('sports', 'soccer', 'Sports', state.sports.map(function (sp, i) {
      return '<button class="tile compact focusable" data-g="s' + i + '" data-amb="' + ambient('sport', sp.id) + '">' +
        sportArt(sp) +
        '<span class="tile-name">' + esc(sp.name) + '</span>' +
        '<span class="tile-sub">' + sportSub(sp) + '</span></button>';
    }).join(''));

    state.entServices = entertainmentServices();
    if (state.entServices.length) {
      html += row('entertainment', 'entertainment', 'Entertainment', state.entServices.map(function (x, i) {
        var n = 0;
        x.cats.forEach(function (id) { n += (state.streams || []).filter(function (ch) { return String(ch.category_id) === id; }).length; });
        return '<button class="tile compact focusable" data-g="e' + i + '" data-amb="' + ambient('ent', x.sv.flag || x.sv.id) + '">' + entArt(x.sv) +
          '<span class="tile-name">' + esc(x.sv.name) + '</span>' +
          '<span class="tile-sub">' + n + ' channels</span></button>';
      }).join(''));
    }

    // One tile per topic, gathering that topic's categories from every country.
    html += row('other', 'tv', 'Other categories', OTHER_TOPICS.map(function (id) {
      var ti = -1;
      state.groups.topics.forEach(function (t, k) { if (t.topic === id) ti = k; });
      if (ti < 0) return '';
      var t = state.groups.topics[ti];
      return '<button class="tile compact focusable" data-g="t' + ti + '" data-amb="' + ambient('topic', t.topic) + '">' +
        '<span class="art" data-art="' + esc(t.topic) + '">' + Icons.svg(t.icon, 'art-icon') + '</span>' +
        '<span class="tile-name">' + esc(t.name) + '</span>' +
        '<span class="tile-sub">' + categoriesLabel(t.cats.length) + '</span></button>';
    }).join(''));

    $('home-rows').innerHTML = html;
    each('#home-rows .fav-tile', function (tile) {
      var f = favs[Number(tile.getAttribute('data-g').slice(1))];
      Logos.set(tile.querySelector('.fav-logo'), api.image(f.stream_icon), f.name, true);
    });
    // Keep focus on the same tile if the home screen is redrawn while it's showing.
    var was = Nav.current();
    if (was && !document.contains(was) && isShown('home')) {
      var g = was.getAttribute && was.getAttribute('data-g');
      var same = g && document.querySelector('#home-rows [data-g="' + g + '"]');
      if (same) Nav.focus(same, { scroll: false });
    }
    state.homeFocus = null;
    state.homeDirty = false;
  }

  function showHome() {
    stopPreview();
    if (state.homeDirty) {
      // Favourites changed: re-render, then return to the same tile if it still exists.
      var key = state.homeFocus && state.homeFocus.getAttribute('data-g');
      var c = state.homeFocus && state.homeFocus.getAttribute('data-c');
      renderHome();
      if (key && key.charAt(0) !== 'f') {
        state.homeFocus = document.querySelector('#home-rows [data-g="' + key + '"]' + (c ? '[data-c="' + c + '"]' : ''));
      }
    }
    showScreen('home');
    var target = state.homeFocus && document.contains(state.homeFocus) ? state.homeFocus : document.querySelector('#home-rows .tile');
    if (target) Nav.focus(target);
  }

  function openTile(tile) {
    var g = tile.getAttribute('data-g');
    if (g.charAt(0) === 'e') return openGroup(serviceGroup(state.entServices[Number(g.slice(1))]));
    if (g.charAt(0) === 'f') return openPlayer(Number(g.slice(1)), favs.slice(), 'home');
    if (g.charAt(0) === 's') return openSport(state.sports[Number(g.slice(1))]);
    if (g.charAt(0) === 'c') return openGroup(state.groups.countries[Number(g.slice(1))]);
    openGroup(state.groups.topics[Number(g.slice(1))]);
  }

  // ---------- Live now: live sport and events (see live.js) ----------
  // Two sources, merged into EVENTS per sport (FHD/HD/SD copies of a match count once):
  //  1. event channel names with a time ("Zebre v Dragons 15:15"), checked locally every refresh;
  //  2. the guide's current programme for every sports channel that has guide data.
  var LIVE_REFRESH_MS = 10 * 60 * 1000;

  // Placeholders ("NBA | Event 42") and events that are long over are never shown.
  function isHidden(ch) {
    return isEmptyEvent(ch) || (isUnavailable(ch) && !settings.showUnavailable) || (!settings.showAdult && isAdult(ch));
  }

  // Adult content: the provider's adult flag, or a category named like "ADULTS", "XXX", "18+".
  var ADULT_CAT = /ADULT|XXX|\b18\s*\+|\+\s*18\b|PORN/i;
  function isAdultCategory(name) { return ADULT_CAT.test(String(name || '')); }
  function isAdult(ch) {
    return String(ch.is_adult) === '1' || isAdultCategory(state.catName && state.catName[ch.category_id]);
  }
  // Groups (countries/topics) from the playlist's categories. Adult categories never sit in a country;
  // when allowed, they get their own "Adults" tile under Other categories.
  function buildGroups() {
    var cats = state.cats || [];
    var g = Groups.build(cats.filter(function (c) { return !isAdultCategory(c.category_name); }));
    // Countries: Italy, US, UK, France, Spain; every other country joins "Other" (name · code).
    var main = [], other = null, rest = [];
    g.countries.forEach(function (c) {
      if (c.name === 'Other') other = c;
      else if (COUNTRY_FIRST.indexOf(c.code) >= 0) main.push(c);
      else rest.push(c);
    });
    main.sort(function (a, b) { return COUNTRY_FIRST.indexOf(a.code) - COUNTRY_FIRST.indexOf(b.code); });
    if (rest.length && !other) other = { id: 'country:OTHER', kind: 'country', code: '•••', name: 'Other', cats: [] };
    rest.forEach(function (c) {
      c.cats.forEach(function (x) { other.cats.push({ id: x.id, name: x.name + '  ·  ' + c.code }); });
    });
    g.countries = other ? main.concat([other]) : main;
    var adult = cats.filter(function (c) { return isAdultCategory(c.category_name); });
    if (settings.showAdult && adult.length) {
      g.topics.push({ id: 'topic:adult', kind: 'topic', topic: 'adult', name: 'Adults', icon: 'tv',
        cats: adult.map(function (c) { return { id: String(c.category_id), name: c.category_name }; }) });
      adult.forEach(function (c) { g.catInfo[c.category_id] = { raw: c.category_name, name: c.category_name, country: null }; });
    }
    return g;
  }
  function isEmptyEvent(ch) {
    return Sports.isPlaceholder(ch.name) || Live.isStale(ch.name, Date.now());
  }

  // Visible channels and sport lists, recomputed when check results or settings change.
  function rebuildChannels() {
    state.streams = state.rawStreams.filter(function (ch) { return !isHidden(ch); });
    state.sports = Sports.build(state.streams, state.catName, Groups.isSportsCategory);
    state.homeDirty = true;
  }

  function sportSub(sp) {
    var live = liveEvents(sp.id).length;
    return sp.count + ' channels' + (live ? '  ·  <b class="live">' + live + ' live now</b>' : '');
  }

  function liveEvents(sportId) {
    var now = Date.now();
    return ((state.live && state.live[sportId]) || []).filter(function (e) { return e.stop > now; });
  }

  function liveTitle(ch) {
    var t = state.liveTitles && state.liveTitles[ch.stream_id];
    return t && t.stop > Date.now() ? t.title : '';
  }

  // Channels showing a live event in this sport, grouped by event.
  function liveFor(sportId) {
    var out = [];
    liveEvents(sportId).forEach(function (e) {
      e.channels.forEach(function (ch) { if (out.indexOf(ch) < 0) out.push(ch); });
    });
    return out;
  }

  function sportChannels() {
    var list = [];
    (state.sports || []).forEach(function (sp) {
      sp.order.forEach(function (cid) {
        sp.subs[cid].forEach(function (ch) { list.push({ ch: ch, sport: sp.id }); });
      });
    });
    return list;
  }

  function addEvent(events, sport, title, stop, ch) {
    var key = Live.eventKey(sport, title);
    var e = events[key] || (events[key] = { sport: sport, title: title, stop: stop, channels: [] });
    if (e.channels.indexOf(ch) < 0) e.channels.push(ch);
    e.stop = Math.max(e.stop, stop);
  }

  function publishLive(events) {
    var bySport = {}, titles = {};
    Object.keys(events).forEach(function (k) {
      var e = events[k];
      (bySport[e.sport] = bySport[e.sport] || []).push(e);
      e.channels.forEach(function (ch) { titles[ch.stream_id] = { title: e.title, stop: e.stop }; });
    });
    state.live = bySport;
    state.liveTitles = titles;
    each('#home-rows [data-g^="s"]', function (tile) {
      var sp = state.sports[Number(tile.getAttribute('data-g').slice(1))];
      tile.querySelector('.tile-sub').innerHTML = sportSub(sp);
    });
  }

  var GUIDE_MAX_AGE_MS = 60 * 60 * 1000;

  // Guide for every sports channel (one table per guide id, 4 requests at a time), refreshed hourly.
  // Each table has ~a week of history, which is how replays are recognised.
  function sportsGuide(byEpg) {
    if (state.guide && Date.now() - state.guide.at < GUIDE_MAX_AGE_MS) return Promise.resolve(state.guide);
    var ids = Object.keys(byEpg), tables = {};
    function next() {
      var id = ids.shift();
      if (!id) return Promise.resolve();
      return api.epgTable(byEpg[id][0].ch.stream_id)
        .then(function (list) { if (list.length) tables[id] = list; }, function () {})
        .then(next);
    }
    return Promise.all([next(), next(), next(), next()]).then(function () {
      if (!Object.keys(tables).length) return null;
      var g = Live.buildGuide(tables);
      g.at = Date.now();
      state.guide = g;
      return g;
    });
  }

  function refreshLiveNow() {
    if (!api || !state.sports) return;
    var now = Date.now();
    var token = state.liveToken = (state.liveToken || 0) + 1;
    var events = {};
    var channels = sportChannels();

    // 1. Event names (instant). Only names whose day is known (date/weekday) count as live.
    channels.forEach(function (x) {
      Live.eventsFromName(x.ch.name, x.sport, now).forEach(function (e) {
        if (e.certain && e.title && e.start - 10 * 60 * 1000 <= now && e.stop > now) addEvent(events, x.sport, e.title, e.stop, x.ch);
      });
    });
    publishLive(events);

    // 2. Guide: programme on now for every sports channel with guide data.
    var byEpg = {};
    channels.forEach(function (x) {
      if (x.ch.epg_channel_id) (byEpg[x.ch.epg_channel_id] = byEpg[x.ch.epg_channel_id] || []).push(x);
    });

    function add(id, title, desc, stopMs) {
      byEpg[id].forEach(function (x) {
        // Sport from the programme itself, else the channel's own sport.
        var found = Sports.sportOfProgramme(title + ' ' + desc);
        addEvent(events, found ? found.id : x.sport, title, stopMs, x.ch);
      });
    }

    sportsGuide(byEpg).then(function (guide) {
      if (token !== state.liveToken) return;
      if (guide) {
        // Guide with history: also lets us spot replays (a match that already aired earlier).
        Object.keys(byEpg).forEach(function (id) {
          var r = Live.nowOnGuide(guide, id, Date.now());
          if (r && r.live) add(id, r.prog.title, r.prog.desc, r.prog.stop);
        });
        publishLive(events);
        return;
      }
      // Fallback: per-channel "now/next", 4 at a time (no replay detection).
      var ids = Object.keys(byEpg);
      var next = function () {
        var id = ids.shift();
        if (!id || token !== state.liveToken) return Promise.resolve();
        return api.shortEpg(byEpg[id][0].ch.stream_id).then(function (list) {
          var t = Date.now() / 1000;
          var p = list.filter(function (x) { return x.start_timestamp <= t && x.stop_timestamp > t; })[0];
          if (!p) return;
          var title = Api.decode(p.title), desc = Api.decode(p.description);
          if (Live.scoreProgramme(title, desc, Date.now()).live) add(id, title, desc, Number(p.stop_timestamp) * 1000);
        }).then(next, next);
      };
      return Promise.all([next(), next(), next(), next()]).then(function () {
        if (token === state.liveToken) publishLive(events);
      });
    });
  }

  // A sport opens like a topic: left column = where its channels come from, plus "All".
  function openSport(sport) {
    var info = state.groups.catInfo;
    var subs = sport.order.map(function (cid) {
      var ci = info[cid] || { name: 'Uncategorised', country: null };
      return { id: String(cid), name: ci.name, country: ci.country, items: sport.subs[cid] };
    }).sort(function (a, b) { return b.items.length - a.items.length; });
    var all = [];
    subs.forEach(function (s) { all = all.concat(s.items); });
    var cats = [{ id: 'all', name: 'All ' + sport.name, items: all }];
    var live = liveFor(sport.id);
    if (live.length) {
      // Live matches found in the guide come first, also at the top of "All".
      cats[0].items = live.concat(all.filter(function (ch) { return live.indexOf(ch) < 0; }));
      cats.push({ id: 'live', name: 'On now', items: live });
    }
    cats = cats.concat(subs);
    openGroup({ kind: 'sport', name: sport.name, sport: sport, cats: cats }, live.length ? 'live' : 'all');
  }

  // ---------- browse ----------
  function catLabel(group, c) {
    return group.kind !== 'country' && c.country ? c.name + '  ·  ' + c.country : c.name;
  }

  // Small picture next to the title, same as the group's home tile: flag, colour sport icon, topic icon.
  function headerMark(group) {
    if (group.kind === 'country') {
      if (Flags.has(group.code)) return '<span class="flag-box">' + Flags.svg(group.code) + '</span>';
      return '<span class="art" data-art="world">' + (group.name === 'Other' ? Icons.svg('globe', 'art-icon') : '<span class="art-code">' + esc(group.code) + '</span>') + '</span>';
    }
    if (group.kind === 'sport' && group.sport) return sportArt(group.sport);
    if (group.kind === 'ent' && group.service) return entArt(group.service);
    if (group.kind === 'topic') {
      return '<span class="art" data-art="' + esc(group.topic) + '">' + Icons.svg(group.icon, 'art-icon') + '</span>';
    }
    return '';
  }

  // Open a country/topic; with `catId`, jump straight into that category's channels.
  // Your favourites among this country/sport/topic's channels (current channel data, not the saved snapshot).
  function favouritesIn(group) {
    if (!favs.length) return [];
    var pool;
    if (group.kind === 'sport') {
      pool = group.cats[0].items;   // "All <sport>"
    } else {
      var ids = {};
      group.cats.forEach(function (c) { ids[c.id] = true; });
      pool = (state.streams || []).filter(function (ch) { return ids[String(ch.category_id)]; });
    }
    var seen = {};
    return pool.filter(function (ch) {
      if (seen[ch.stream_id] || !isFav(ch)) return false;
      seen[ch.stream_id] = true;
      return true;
    });
  }

  function openGroup(group, catId) {
    // ★ Favourites goes first, and is where the screen opens, when you have some here.
    var mine = favouritesIn(group);
    if (mine.length) {
      var orig = group;
      group = {};
      Object.keys(orig).forEach(function (k) { group[k] = orig[k]; });
      group.cats = [{ id: 'favs', name: 'Favourites', items: mine }].concat(orig.cats);
      catId = 'favs';
    }
    state.group = group;
    state.catId = null;
    Nav.forget('cats');
    Nav.forget('items');
    $('browse-title').textContent = group.name;
    $('browse-mark').innerHTML = headerMark(group);
    $('cat-list').innerHTML = group.cats.map(function (c) {
      return '<li class="cat focusable' + (c.id === 'favs' ? ' cat-favs' : '') + '" data-id="' + esc(c.id) + '">' +
        (c.id === 'favs' ? Icons.svg('star', 'cat-star') : '') + esc(catLabel(group, c)) + '</li>';
    }).join('');
    showScreen('browse');
    $('cat-list').parentNode.scrollTop = 0;
    var cat = (catId && document.querySelector('#cat-list .cat[data-id="' + catId + '"]')) || document.querySelector('#cat-list .cat');
    if (!cat) return clearItems('Nothing here');
    Nav.focus(cat);
    selectCategory(cat).then(function () {
      if (!catId || !isShown('browse') || state.catId !== cat.getAttribute('data-id')) return;
      var first = document.querySelector('#channel-list li[data-i]');
      if (first) Nav.focus(first);
    });
  }

  function selectCategory(el) {
    var id = el.getAttribute('data-id');
    if (id === state.catId) return Promise.resolve();
    state.catId = id;
    each('#cat-list .cat', function (c) { c.classList.toggle('active', c === el); });
    Nav.forget('items');
    clearItems('Loading…');
    var preset = state.group && state.group.cats.filter(function (c) { return String(c.id) === id; })[0];
    var req = preset && preset.items ? Promise.resolve(preset.items) : api.liveStreams(id);
    return req.then(function (items) {
      if (state.catId !== id) return;
      state.items = (items || []).filter(function (ch) { return !isHidden(ch); });
      if (!state.items.length) return clearItems('No channels in this category');
      renderChannels(state.items);
    }).catch(function (err) {
      if (state.catId === id) clearItems('Could not load: ' + err.message);
    });
  }

  var previewCategory = debounce(function (el) {
    if (el && el.classList.contains('focused')) selectCategory(el);
  }, 300);

  function clearItems(msg) {
    state.items = [];
    $('channel-list').innerHTML = '';
    $('items-empty').textContent = msg || '';
    $('items-empty').classList.toggle('hidden', !msg);
    showDetails(null);
  }

  function isPlaying(ch) {
    var p = state.playList[state.playIndex];
    return p && p.stream_id === ch.stream_id;
  }

  // Providers often insert fake "channels" as section dividers, e.g. "•●| ★ SKY ITALIA ★ |●•".
  function isDivider(ch) {
    return /[★☆●•■◆▶═─]|#{3,}|={3,}|-{3,}|\*{3,}|!{2,}/.test(ch.name || '');
  }
  function dividerLabel(ch) {
    return String(ch.name).replace(/[★☆●•■◆▶═─#=*|~!-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function currentCategoryName() {
    var c = state.group && state.group.cats.filter(function (x) { return String(x.id) === String(state.catId); })[0];
    return c ? c.name : '';
  }

  function renderChannels(items) {
    $('items-empty').classList.add('hidden');
    var list = $('channel-list');
    Logos.reset();
    // Provider "divider" channels become headings, except useless ones: before the first channel,
    // repeating the category's own name, or with no channels under them.
    var catName = currentCategoryName().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    var keepHeading = function (i) {
      var label = dividerLabel(items[i]).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      if (!label || label === catName) return false;
      var before = false, after = false, j;
      for (j = i - 1; j >= 0 && !before; j--) before = !isDivider(items[j]);
      for (j = i + 1; j < items.length && !isDivider(items[j]); j++) { after = true; break; }
      return before && after;
    };
    list.innerHTML = items.map(function (ch, i) {
      if (isDivider(ch)) return keepHeading(i) ? '<li class="divider">' + esc(dividerLabel(ch)) + '</li>' : '';
      return '<li class="focusable' + (isPlaying(ch) ? ' playing' : '') + (isFav(ch) ? ' fav' : '') + (isUnavailable(ch) ? ' dead' : '') + '" data-i="' + i + '">' +
        '<span class="logo"></span>' +
        '<span class="name">' + esc(ch.name) +
          (liveTitle(ch) ? '<span class="now-on">' + esc(liveTitle(ch)) + '</span>' : '') + '</span>' +
        Icons.svg('star', 'fav-mark') + '</li>';
    }).join('');
    each('#channel-list li[data-i]', function (li) {
      var ch = items[Number(li.getAttribute('data-i'))];
      Logos.set(li.querySelector('.logo'), api.image(ch.stream_icon), ch.name);
    });
    list.parentNode.scrollTop = 0;
  }

  // ---------- preview (right panel) ----------
  // A live preview (with sound) of the selected channel. It starts when you press OK on a channel,
  // and is always stopped before anything else opens a stream (the account allows one connection).
  var preview = Player.create();   // with sound
  var previewItem = null;

  function previewState(name, msg) {
    $('pv-hint').textContent = previewItem ? 'OK again for full screen' : 'Press OK to preview';
    $('pv-spinner').classList.toggle('hidden', name !== 'loading');
    $('pv-logo').classList.toggle('hidden', name === 'playing');
    $('pv-video').classList.toggle('on', name === 'playing');
    $('pv-msg').classList.toggle('hidden', name !== 'error');
    $('pv-msg').textContent = msg || '';
  }

  function stopPreview() {
    previewItem = null;
    if (preview.isActive()) preview.stop();
    previewState('idle');
  }

  function startPreview(item) {
    if (!isShown('browse')) return;
    previewItem = item;
    preview.play(api.liveUrl(item.stream_id));
  }

  function showDetails(item) {
    state.detailsItem = item;
    if (!item) {
      stopPreview();
      $('details').style.visibility = 'hidden';
      return;
    }
    $('details').style.visibility = 'visible';
    updateFavButton(item);
    Logos.set($('pv-logo'), api.image(item.stream_icon), item.name, true);
    $('d-title').textContent = item.name;
    var live = liveTitle(item);
    $('d-now').innerHTML = live ? '<span class="label live-label">Live now</span>' + esc(live) : '';
    // Moving to another channel shows its logo; the preview plays only after OK.
    if (previewItem !== item) stopPreview();
  }

  function epgProgress(p) {
    var start = Number(p.start_timestamp), stop = Number(p.stop_timestamp);
    return Math.max(0, Math.min(100, ((Date.now() / 1000 - start) / (stop - start)) * 100));
  }

  // ---------- player ----------
  var overlayTimer, epgTimer, zapTimer, slowTimer;
  var SLOW_MS = 12000;   // spinner longer than this = provider too slow for this channel
  var ZAP_DELAY_MS = 700; // wait for the user to stop pressing ▲▼ before opening a stream

  function showOverlay(stay) {
    $('p-overlay').classList.remove('off');
    clearTimeout(overlayTimer);
    if (!stay) overlayTimer = setTimeout(function () { $('p-overlay').classList.add('off'); }, 4000);
  }

  // `from` is where Back returns to: 'browse' (channel list) or 'home' (Favourites row).
  function openPlayer(index, list, from) {
    stopPreview();
    state.playList = list || state.items;
    state.playFrom = from || 'browse';
    showScreen('player');
    Nav.pushHandler(playerKeys);
    playIndex(index, true);
  }

  // Same channel in another quality, e.g. "|IT| SKY CINEMA COMEDY FHD" -> "... HD".
  var QUALITY = /\b(FHD|UHD|HD|SD|4K|HEVC|H265|RAW|50FPS)\b/gi;
  function baseName(name) {
    return String(name || '').replace(QUALITY, '').replace(/[^A-Za-z0-9+]+/g, ' ').trim().toUpperCase();
  }
  function quality(name) {
    var m = String(name || '').match(QUALITY);
    return m ? m.join(' ').toUpperCase() : '';
  }
  function alternativeFor(item) {
    var base = baseName(item.name);
    var rank = { SD: 0, HD: 1, '': 1, FHD: 2, HEVC: 2, H265: 2, '4K': 3, UHD: 3 };
    var mine = rank[quality(item.name)] == null ? 1 : rank[quality(item.name)];
    var best = null;
    state.playList.forEach(function (ch) {
      if (ch === item || baseName(ch.name) !== base) return;
      var r = rank[quality(ch.name)] == null ? 1 : rank[quality(ch.name)];
      if (r < mine && (!best || r > best.r)) best = { ch: ch, r: r };  // next lower quality
    });
    return best ? best.ch : null;
  }

  function showStreamProblem(msg) {
    var item = state.playList[state.playIndex];
    var alt = item && alternativeFor(item);
    $('p-spinner').classList.add('hidden');
    $('p-error').innerHTML = esc(msg) + (alt
      ? '<div class="p-alt">Press <b>OK</b> to try <b>' + esc(alt.name) + '</b></div>'
      : '<div class="p-alt muted">Try another channel with ▲ ▼</div>');
    $('p-error').classList.remove('hidden');
    state.altIndex = alt ? state.playList.indexOf(alt) : -1;
    showOverlay(true);
  }

  function playIndex(index, immediate) {
    var list = state.playList;
    if (!list.some(function (ch) { return !isDivider(ch); })) return;
    var step = index < state.playIndex ? -1 : 1;
    index = (index + list.length) % list.length;
    while (isDivider(list[index])) index = (index + step + list.length) % list.length;
    state.playIndex = index;
    var item = list[index];

    $('p-error').classList.add('hidden');
    state.altIndex = -1;
    $('p-title').innerHTML = (isFav(item) ? Icons.svg('star', 'p-star') : '') + esc((item.num ? item.num + '   ' : '') + item.name);
    $('p-sub').textContent = '';
    $('p-bar').style.width = '0';
    Logos.set($('p-logo'), api.image(item.stream_icon), item.name, true);
    setPlayerHint(item);
    showOverlay();

    clearInterval(epgTimer);
    clearTimeout(zapTimer);
    clearTimeout(slowTimer);
    // Stop the old stream right away (the account allows a single connection),
    // but only open the new one once the user stops zapping.
    Player.stop();
    $('p-spinner').classList.remove('hidden');
    zapTimer = setTimeout(function () {
      Player.play(api.liveUrl(item.stream_id));
    }, immediate ? 0 : ZAP_DELAY_MS);
    refreshPlayerEpg(item);
    epgTimer = setInterval(function () { refreshPlayerEpg(item); }, 30000);
  }

  function setPlayerHint(item, msg) {
    $('p-hint').textContent = msg || ('▲ ▼  Change channel     ▶  ' + (isFav(item) ? 'Remove from favourites' : 'Add to favourites') + '     Back  Exit');
  }

  function refreshPlayerEpg(item) {
    api.shortEpg(item.stream_id).then(function (list) {
      if (state.playList[state.playIndex] !== item) return;
      var now = list[0];
      if (!now) { $('p-sub').textContent = ''; return; }
      $('p-sub').textContent = hhmm(now.start_timestamp) + ' – ' + hhmm(now.stop_timestamp) + '   ' + Api.decode(now.title) +
        (list[1] ? '      Next: ' + Api.decode(list[1].title) : '');
      $('p-bar').style.width = epgProgress(now).toFixed(1) + '%';
    });
  }

  function closePlayer() {
    clearTimeout(zapTimer);
    clearTimeout(slowTimer);
    Player.stop();
    clearInterval(epgTimer);
    clearTimeout(overlayTimer);
    Nav.popHandler(playerKeys);
    if (state.playFrom === 'home') { showHome(); return; }
    showScreen('browse');

    // Return focus to the channel we ended on (if it's in the visible list).
    var idx = state.items.indexOf(state.playList[state.playIndex]);
    each('#channel-list li', function (li) {
      li.classList.toggle('playing', Number(li.getAttribute('data-i')) === idx);
    });
    var target = idx >= 0 && document.querySelector('#channel-list [data-i="' + idx + '"]');
    if (target) Nav.focus(target);
  }

  function playerKeys(k) {
    if (Nav.isBack(k) || k === K.STOP) { closePlayer(); return true; }
    if (k === K.UP || k === K.CH_DOWN) { playIndex(state.playIndex - 1); return true; }
    if (k === K.DOWN || k === K.CH_UP) { playIndex(state.playIndex + 1); return true; }
    if (k === K.ENTER && state.altIndex >= 0) { playIndex(state.altIndex, true); return true; }
    if (k === K.RIGHT) {
      var item = state.playList[state.playIndex];
      var on = toggleFav(item);
      $('p-title').innerHTML = (on ? Icons.svg('star', 'p-star') : '') + esc((item.num ? item.num + '   ' : '') + item.name);
      setPlayerHint(item, on ? '★  Added to favourites' : 'Removed from favourites');
      showOverlay();
      setTimeout(function () { if (state.playList[state.playIndex] === item) setPlayerHint(item); }, 2500);
      return true;
    }
    if (k === K.ENTER) {
      if ($('p-overlay').classList.contains('off')) showOverlay(); else $('p-overlay').classList.add('off');
      return true;
    }
    showOverlay();
    return true; // swallow everything else while playing
  }

  Player.on('loading', function () {
    $('p-spinner').classList.remove('hidden');
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () {
      showStreamProblem('This channel is loading too slowly right now');
    }, SLOW_MS);
  });
  Player.on('playing', function () {
    clearTimeout(slowTimer);
    state.altIndex = -1;
    $('p-spinner').classList.add('hidden');
    $('p-error').classList.add('hidden');
  });
  Player.on('error', function (msg) {
    clearTimeout(slowTimer);
    showStreamProblem(msg === 'Stream unavailable' ? 'This channel is not available right now' : msg);
  });

  // ---------- settings ----------
  var SETTINGS_KEY = 'settings';
  var settings = {};   // loaded from Store in init()
  function saveSettings() {
    Store.set(SETTINGS_KEY, settings);
  }

  // ---------- background colour ----------
  // Each theme sets the page background and the two panel shades used by tiles, rows and lists.
  var THEMES = [
    { id: 'midnight', name: 'Midnight', bg: '#0c0e12', surface: '#151820', surface2: '#1d212b' },
    { id: 'navy',     name: 'Navy',     bg: '#0a1020', surface: '#121b31', surface2: '#1a2540' },
    { id: 'forest',   name: 'Forest',   bg: '#0a1410', surface: '#12211b', surface2: '#1a2d25' },
    { id: 'plum',     name: 'Plum',     bg: '#140c18', surface: '#211628', surface2: '#2c1e35' },
    { id: 'espresso', name: 'Espresso', bg: '#15100c', surface: '#221a14', surface2: '#2e241c' },
    { id: 'graphite', name: 'Graphite', bg: '#121212', surface: '#1c1c1e', surface2: '#262628' },
    // Lighter, still with white text
    { id: 'slate',    name: 'Slate',    bg: '#2a303c', surface: '#353c4a', surface2: '#414959' },
    { id: 'steel',    name: 'Steel',    bg: '#26384f', surface: '#30455f', surface2: '#3b5270' },
    { id: 'sage',     name: 'Sage',     bg: '#2c3f37', surface: '#374c43', surface2: '#43594f' },
    // Light, with dark text
    { id: 'cloud',    name: 'Cloud',    light: true, bg: '#eef1f5', surface: '#ffffff', surface2: '#e2e6ec' },
    { id: 'sand',     name: 'Sand',     light: true, bg: '#f4eee5', surface: '#fffaf3', surface2: '#e9e0d3' },
    { id: 'mist',     name: 'Mist',     light: true, bg: '#e6eef0', surface: '#f7fbfc', surface2: '#d6e2e5' },
  ];

  function themeById(id) {
    return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0];
  }

  function applyTheme(id) {
    var t = themeById(id), root = document.documentElement.style;
    root.setProperty('--bg', t.bg);
    root.setProperty('--surface', t.surface);
    root.setProperty('--surface-2', t.surface2);
    // Light themes flip text and the focus highlight (dark pill on a light page).
    root.setProperty('--text', t.light ? '#1b1f27' : '#eef1f6');
    root.setProperty('--muted', t.light ? '#5d6675' : '#8b93a3');
    root.setProperty('--focus-bg', t.light ? '#1b1f27' : '#eef1f6');
    root.setProperty('--focus-text', t.light ? '#ffffff' : '#0c0e12');
    document.documentElement.classList.toggle('light', !!t.light);
  }

  function renderLook() {
    var st = currentStyle();
    $('look-chips').innerHTML = [['modern', 'Modern'], ['cinema', 'Cinema'], ['classic', 'Classic']].map(function (x) {
      return '<button class="chip focusable' + (st === x[0] ? ' on' : '') + '" data-style="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
  }

  function renderSwatches() {
    var current = themeById(settings.theme).id;
    var swatch = function (t) {
      return '<button class="swatch focusable' + (t.id === current ? ' on' : '') + '" data-theme="' + t.id + '">' +
        '<span class="swatch-color" style="background:' + t.bg + ';box-shadow:inset 0 0 0 1.4rem ' + t.surface2 + '"></span>' +
        '<span class="swatch-name">' + esc(t.name) + '</span></button>';
    };
    var line = function (label, from, to) {
      return '<div class="swatch-line"><span class="swatch-group">' + label + '</span>' + THEMES.slice(from, to).map(swatch).join('') + '</div>';
    };
    $('theme-swatches').innerHTML = line('Dark', 0, 6) + line('Lighter', 6, 9) + line('Light', 9, 12);
    Nav.remember('swatches', document.querySelector('#theme-swatches .swatch.on'));
  }

  function openSettings() {
    renderSettings();
    showScreen('settings');
    Nav.focus($('set-show-dead'));
  }

  function renderSettings() {
    $('set-show-dead').classList.toggle('on', !!settings.showUnavailable);
    $('set-home-favs').classList.toggle('on', settings.homeFavourites !== false);
    $('set-adult').classList.toggle('on', !!settings.showAdult);
    renderSwatches();
    renderLook();
    renderPlaylists();
    var chips;
    if (check.running) {
      chips = '<button class="chip focusable stop" data-stop="1">Stop</button>';
    } else {
      var chip = function (kind, id, name) {
        return '<button class="chip focusable" data-kind="' + kind + '" data-id="' + esc(id) + '">' + esc(name) + scanBadge(kind, id) + '</button>';
      };
      chips = '<div class="chip-line"><span class="chip-label">Sports</span>' + (state.sports || []).map(function (sp) {
        return chip('sport', sp.id, sp.name);
      }).join('') + '</div>' +
      '<div class="chip-line"><span class="chip-label">Countries</span>' + ((state.groups && state.groups.countries) || []).filter(function (c) {
        return c.name !== 'Other';
      }).sort(function (a, b) {
        var ra = COUNTRY_FIRST.indexOf(a.code), rb = COUNTRY_FIRST.indexOf(b.code);
        return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
      }).map(function (c) { return chip('country', c.code, c.name); }).join('') + '</div>';
    }
    var focusedChip = document.activeElement && Nav.current() && Nav.current().classList.contains('chip');
    $('check-sports').innerHTML = chips;
    Nav.remember('chips', document.querySelector('#check-sports .chip'));   // enter the chips at the first one
    if (focusedChip && isShown('settings')) Nav.focus(document.querySelector('#check-sports .chip'));
    $('check-status').textContent = check.status || $('check-status').textContent;
    $('scan-history').textContent = check.running ? '' : scanHistory();
    if (!check.running) renderLog();
  }

  // ---------- channel health (results of "Check channels") ----------
  // {stream_id: {ok, reason, at}}. Saved on the TV after every channel, so results survive restarts.
  // A failed channel stays hidden until it is checked again (and passes) or results are reset.
  var HEALTH_KEY = 'health';
  var SCANS_KEY = 'scans';     // per target: { name, at, total, ok, dead, unknown, skipped, finished }
  var LOG_KEY = 'scanlog';     // the last scan's log, shown again after a restart
  function store(key, value) { key = ns(key); if (value === null) Store.remove(key); else Store.set(key, value); }
  // Loaded from Store in init().
  var scans = {};
  var scanLog = null;
  var health = {};
  function saveHealth() { store(HEALTH_KEY, health); }
  function isUnavailable(ch) {
    var h = health[ch.stream_id];
    return !!(h && !h.ok);
  }

  var check = { running: false, token: 0, status: '' };

  function dayTime(ms) {
    var d = new Date(ms);
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + hhmm(ms / 1000);
  }

  function logLine(l) {
    var li = document.createElement('li');
    li.className = l.cls;
    li.innerHTML = '<span class="mark">' + esc(l.mark) + '</span><span class="lname">' + esc(l.name) + '</span><span class="lwhy">' + esc(l.why) + '</span>';
    return li;
  }

  // Show the current or last saved scan log (survives restarts).
  function renderLog() {
    if (!scanLog) { $('check-log-panel').classList.add('hidden'); return; }
    $('check-log-panel').classList.remove('hidden');
    $('log-title').textContent = scanLog.title;
    $('log-counts').textContent = scanLog.counts || '';
    var list = $('check-log');
    list.innerHTML = '';
    scanLog.lines.forEach(function (l) { list.appendChild(logLine(l)); });
  }

  // Result shown on each scan button, e.g. "✓ 18 ✗ 138", counted from the saved per-channel results
  // (so it is right even for scans made before scan history existed). "· 40%" if not all were checked.
  function scanBadge(kind, id) {
    var t = checkTarget(kind, id);
    if (!t) return '';
    var ok = 0, dead = 0;
    t.list.forEach(function (ch) {
      var h = health[ch.stream_id];
      if (h) { if (h.ok) ok++; else dead++; }
    });
    if (!ok && !dead) return '';
    var pct = Math.round((ok + dead) / t.list.length * 100);
    return '<span class="chip-res">✓ ' + ok + ' ✗ ' + dead + (pct < 95 ? ' · ' + pct + '%' : '') + '</span>';
  }

  function scanHistory() {
    var keys = Object.keys(scans).sort(function (a, b) { return scans[b].at - scans[a].at; });
    if (!keys.length) return '';
    return keys.map(function (k) {
      var sc = scans[k];
      return sc.name + ' ' + (sc.finished ? 'scanned ' : 'scan interrupted ') + dayTime(sc.at) + ': ' + sc.ok + ' working, ' + sc.dead + ' unavailable' +
        (sc.finished ? '' : ' (press it again to continue)');
    }).join('\n');
  }

  function resetChecks() {
    stopCheck();
    health = {}; scans = {}; scanLog = null;
    store(HEALTH_KEY, health); store(SCANS_KEY, scans); store(LOG_KEY, null);
    check.status = 'Results cleared. All channels are shown again.';
    rebuildChannels();
    renderSettings();
  }

  function stopCheck() {
    if (!check.running) return;
    check.token++;
    check.running = false;
    check.status = check.label + ' stopped · ' + check.done + ' of ' + check.total + ' checked · ' + check.dead + ' unavailable';
    if (scanLog) { scanLog.title = check.label + ' scan stopped'; store(LOG_KEY, scanLog); $('log-title').textContent = scanLog.title; }
    rebuildChannels();
    renderSettings();
  }

  // Dev only: app/dev.local.js can set window.DEV_AUTOCHECK = { sport: 'basketball', id: '<unique>' }
  // to open Settings and start a scan once per id (so relaunching doesn't rescan).
  function devAutostart() {
    var d = window.DEV_AUTOCHECK;
    if (!d || !(d.sport || d.country)) return;
    var key = 'devcheck';
    if (Store.get(key) === String(d.id)) return;
    Store.set(key, String(d.id));
    openSettings();
    if (d.country) runCheck('country', d.country); else runCheck('sport', d.sport);
  }

  var RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;   // channels checked more recently than this are skipped

  /* Channels of a sport ('sport', 'basketball') or country ('country', 'IT'), including ones hidden
   * by an earlier check. -> { name, list } or null */
  function checkTarget(kind, id) {
    var base = state.rawStreams.filter(function (ch) { return !isEmptyEvent(ch); });
    var list = [];
    if (kind === 'country') {
      var c = state.groups.countries.filter(function (x) { return x.code === id; })[0];
      if (!c) return null;
      var ids = {};
      c.cats.forEach(function (x) { ids[x.id] = true; });
      return { name: c.name, list: base.filter(function (ch) { return ids[String(ch.category_id)]; }) };
    }
    if (!state.allSports || state.allSportsFor !== state.rawStreams) {
      state.allSports = Sports.build(base, state.catName, Groups.isSportsCategory);
      state.allSportsFor = state.rawStreams;
    }
    var sp = state.allSports.filter(function (x) { return x.id === id; })[0];
    if (!sp) return null;
    sp.order.forEach(function (cid) { list = list.concat(sp.subs[cid]); });
    return { name: sp.name, list: list };
  }

  function runCheck(kind, id) {
    if (check.running || !api) return;
    var sp = checkTarget(kind, id);
    if (!sp) return;
    // Skip channels checked recently (e.g. LNP & NBA, already covered by the Basketball scan).
    var now = Date.now();
    var all = sp.list;
    var list = all.filter(function (ch) { var h = health[ch.stream_id]; return !h || now - h.at > RECHECK_AFTER_MS; });
    var skipped = all.length - list.length;
    var token = ++check.token;
    check.running = true;
    check.label = sp.name;
    check.total = list.length; check.done = 0; check.dead = 0;
    var progress = function () {
      check.status = sp.name + ': ' + check.done + ' / ' + check.total + ' checked · ' + check.dead + ' unavailable' +
        (isShown('player') ? ' · paused while you watch' : '');
      $('check-status').textContent = check.status;
    };
    progress();
    renderSettings();

    // Live scan log on screen.
    var counts = { ok: 0, dead: 0, unknown: 0 };
    var key = kind + ':' + id;
    scanLog = { title: 'Scanning ' + sp.name + (skipped ? '  (' + skipped + ' checked recently, skipped)' : ''), counts: '', lines: [] };
    var saveScan = function (finished) {
      scans[key] = { name: sp.name, at: Date.now(), total: all.length, checked: check.done, ok: counts.ok, dead: counts.dead,
        unknown: counts.unknown, skipped: skipped, finished: finished };
      store(SCANS_KEY, scans);
      store(LOG_KEY, scanLog);
    };
    var logCounts = function () {
      scanLog.counts = check.done + ' / ' + check.total + '  ·  ✓ ' + counts.ok + '  ✗ ' + counts.dead + (counts.unknown ? '  ? ' + counts.unknown : '');
      $('log-counts').textContent = scanLog.counts;
    };
    var log = function (cls, mark, ch, r) {
      var line = { cls: cls, mark: mark, name: ch.name, why: r.reason + ' · ' + (r.ms / 1000).toFixed(1) + 's' };
      scanLog.lines.unshift(line);
      if (scanLog.lines.length > 300) scanLog.lines.length = 300;
      var list = $('check-log');
      list.insertBefore(logLine(line), list.firstChild);
      while (list.children.length > 300) list.removeChild(list.lastChild);
    };
    renderLog();
    logCounts();
    saveScan(false);

    var i = 0;
    function next() {
      if (token !== check.token) return;
      if (i >= list.length) {
        check.running = false;
        scanLog.title = sp.name + ' scan finished · ' + dayTime(Date.now());
        $('log-title').textContent = scanLog.title;
        saveScan(true);
        check.status = sp.name + ': ' + check.total + ' checked · ' + check.dead + ' unavailable' +
          (settings.showUnavailable ? ' (shown dimmed)' : ' (hidden)') + ' · ' + hhmm(Date.now() / 1000);
        rebuildChannels();
        renderSettings();
        return;
      }
      // One stream at a time: never probe while something is playing.
      if (isShown('player') || preview.isActive()) { progress(); setTimeout(next, 3000); return; }
      var ch = list[i++];
      Probe.check(api.liveUrl(ch.stream_id)).then(function (r) {
        if (token !== check.token) return;
        // Only clear answers count; "busy"/network errors leave the channel as it was.
        if (r.definitive) { health[ch.stream_id] = { ok: r.ok, reason: r.reason, at: Date.now() }; saveHealth(); }
        check.done++;
        if (r.definitive && !r.ok) check.dead++;
        if (r.ok) { counts.ok++; log('ok', '✓', ch, r); }
        else if (r.definitive) { counts.dead++; log('dead', '✗', ch, r); }
        else { counts.unknown++; log('unknown', '?', ch, r); }
        logCounts();
        progress();
        saveScan(false);
        setTimeout(next, 400);   // give the provider time to release the connection
      });
    }
    next();
  }

  // ---------- connection test ----------
  // Measures, on this device, how fast the provider delivers video vs. what each channel needs.
  state.diagToken = 0;

  function measureChannel(ch) {
    var t0 = Date.now();
    return fetch(api.liveUrl(ch.stream_id)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var base = r.url;
      return r.text().then(function (txt) {
        if (txt.indexOf('#EXTM3U') !== 0) throw new Error('not a playlist');
        var lines = txt.split(/\r?\n/), dur = 0, seg = null;
        for (var i = lines.length - 1; i >= 0; i--) {
          var l = lines[i].trim();
          if (!seg && l && l.charAt(0) !== '#') seg = l;
          else if (seg && l.indexOf('#EXTINF:') === 0) { dur = parseFloat(l.slice(8)); break; }
        }
        if (!seg || !dur) throw new Error('no video segments');
        var startMs = Date.now() - t0;
        var t1 = Date.now();
        return fetch(new URL(seg, base).href).then(function (sr) {
          if (!sr.ok) throw new Error('segment HTTP ' + sr.status);
          return sr.arrayBuffer();
        }).then(function (buf) {
          var secs = Math.max(0.001, (Date.now() - t1) / 1000);
          return { startMs: startMs, got: buf.byteLength * 8 / secs / 1e6, need: buf.byteLength * 8 / dur / 1e6 };
        });
      });
    });
  }

  function pickTestChannels() {
    return api.allStreams().then(function (all) {
      var info = state.groups.catInfo;
      var sports = all.filter(function (ch) {
        var ci = info[ch.category_id];
        return ci && Groups.isSportsCategory(ci.raw) && !isDivider(ch) && !/EVENT|\|\s*$|PPV/i.test(ch.name);
      });
      var picks = [];
      var last = state.playList[state.playIndex];
      if (last) picks.push({ ch: last, why: 'last watched' });
      var fhd = sports.filter(function (c) { return /\bFHD\b/i.test(c.name); })[0];
      var hd = sports.filter(function (c) { return /\bHD\b/i.test(c.name) && !/\bFHD\b/i.test(c.name); })[0];
      if (fhd && (!last || fhd.stream_id !== last.stream_id)) picks.push({ ch: fhd, why: 'Full HD' });
      if (hd && (!last || hd.stream_id !== last.stream_id)) picks.push({ ch: hd, why: 'HD' });
      return picks;
    });
  }

  function runConnectionTest() {
    var token = ++state.diagToken;
    showScreen('diag');
    Nav.focus(null);
    var list = $('diag-list');
    $('diag-summary').textContent = '';
    list.innerHTML = '<li><span class="d-name">Provider</span><span class="d-res muted">testing…</span></li>';
    var t0 = Date.now();
    var verdicts = [];
    // Bypass the API cache so this is a real round trip.
    fetch(Api.IS_TV ? api.url({}) : '/proxy?url=' + encodeURIComponent(api.url({}))).then(function (r) {
      if (token !== state.diagToken) return;
      list.firstChild.querySelector('.d-res').textContent = r.ok ? 'reachable · ' + (Date.now() - t0) + ' ms' : 'error ' + r.status;
      return pickTestChannels();
    }).then(function (picks) {
      if (!picks || token !== state.diagToken) return;
      var chain = Promise.resolve();
      picks.forEach(function (p) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="d-name">' + esc(p.ch.name) + ' <span class="muted">· ' + esc(p.why) + '</span></span><span class="d-res muted">waiting…</span>';
        list.appendChild(li);
        chain = chain.then(function () {
          if (token !== state.diagToken) return;
          li.querySelector('.d-res').textContent = 'testing…';
          return measureChannel(p.ch).then(function (m) {
            var ok = m.got >= m.need * 1.3;
            var tight = !ok && m.got >= m.need;
            verdicts.push(ok ? 'ok' : tight ? 'tight' : 'slow');
            li.querySelector('.d-res').innerHTML =
              '<b class="' + (ok ? 'good' : tight ? 'warn' : 'bad') + '">' + m.got.toFixed(1) + ' Mbps</b>' +
              ' <span class="muted">received · needs ' + m.need.toFixed(1) + ' Mbps · ' + (ok ? 'smooth' : tight ? 'borderline' : 'too slow') + '</span>';
          }, function (err) {
            verdicts.push('fail');
            li.querySelector('.d-res').innerHTML = '<b class="bad">failed</b> <span class="muted">' + esc(err.message) + '</span>';
          });
        });
      });
      return chain;
    }).then(function () {
      if (token !== state.diagToken) return;
      var slow = verdicts.filter(function (v) { return v !== 'ok'; }).length;
      $('diag-summary').textContent = !verdicts.length ? '' : slow === 0
        ? 'All good: the provider delivers these channels faster than they play.'
        : 'Some channels arrive slower than they play. That is a provider limit, not your network, if your internet speed is fine.';
    }).catch(function (err) {
      if (token === state.diagToken) $('diag-summary').textContent = 'Test failed: ' + err.message;
    });
  }

  // ---------- keys per screen ----------
  function zoneOfCurrent() {
    var cur = Nav.current();
    var z = cur && cur.closest('[data-zone]');
    return z ? z.getAttribute('data-zone') : '';
  }

  function browseKeys(k) {
    if (!isShown('browse') || !Nav.isBack(k)) return false;
    if (zoneOfCurrent() === 'details') {
      Nav.focus(Nav.remembered('items') || document.querySelector('#channel-list li[data-i]'));
    } else if (zoneOfCurrent() === 'items') {
      Nav.focus(Nav.remembered('cats') || document.querySelector('#cat-list .cat'));
    } else {
      showHome();
    }
    return true;
  }

  function diagKeys(k) {
    if (!isShown('diag')) return false;
    if (Nav.isBack(k)) { state.diagToken++; openSettings(); }
    return true;
  }

  // Settings moves line by line: each checkbox/button row is a line, and so is each line of
  // Look, colour and scan buttons. ▲▼ go to the previous/next line (onto the selected or nearest
  // item), ◀▶ move within a line.
  function settingsLines() {
    var lines = [];
    Array.prototype.forEach.call(document.querySelectorAll('#settings .settings-list > *'), function (row) {
      if (row.classList.contains('focusable')) { lines.push([row]); return; }
      Array.prototype.forEach.call(row.querySelectorAll('.chip-line, .swatch-line'), function (ln) {
        var items = Array.prototype.slice.call(ln.querySelectorAll('.focusable'));
        if (items.length) lines.push(items);
      });
    });
    return lines;
  }

  function settingsNav(k) {
    var lines = settingsLines();
    var cur = Nav.current();
    var li = -1, ii = -1;
    lines.forEach(function (ln, i) { var j = ln.indexOf(cur); if (j >= 0) { li = i; ii = j; } });
    if (li < 0) { if (lines.length) Nav.focus(lines[0][0]); return true; }
    if (k === K.LEFT || k === K.RIGHT) {
      var t = lines[li][ii + (k === K.LEFT ? -1 : 1)];
      if (t) Nav.focus(t);
      return true;
    }
    var next = lines[li + (k === K.UP ? -1 : 1)];
    if (!next) return true;
    var pick = next.filter(function (el) { return el.classList.contains('on'); })[0];
    if (!pick) {
      var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, bestD = Infinity;
      next.forEach(function (el) {
        var o = el.getBoundingClientRect(), d = Math.abs(o.left + o.width / 2 - cx);
        if (d < bestD) { bestD = d; pick = el; }
      });
    }
    if (next.length > 1 && lines[li].length === 1) {
      // coming from a full-width row: prefer the selected item, else the first one
      pick = next.filter(function (el) { return el.classList.contains('on'); })[0] || next[0];
    }
    Nav.focus(pick);
    return true;
  }

  function settingsKeys(k) {
    if (!isShown('settings')) return false;
    if (Nav.isBack(k)) { showHome(); return true; }
    if (k === K.UP || k === K.DOWN || k === K.LEFT || k === K.RIGHT) return settingsNav(k);
    return false;
  }

  // Home screen moves by rows (like streaming apps): ▲▼ one row at a time, landing where you were
  // in that row (or the nearest tile); ▲ on the first row goes to Settings; ◀▶ stay inside the row.
  // Purely geometric moves misbehave here because the spotlight covers rows that scrolled away.
  function homeRowNav(k) {
    // If the home screen was re-rendered, the remembered element may be gone: use what is highlighted.
    var cur = Nav.current();
    if (!cur || !document.contains(cur) || !cur.closest('#home')) cur = document.querySelector('#home .focused');
    if (!cur) {
      var first = document.querySelector('#home-rows .tile');
      if (first) Nav.focus(first);
      return true;
    }
    var rows = Array.prototype.slice.call(document.querySelectorAll('#home-rows .row'));
    var btn = $('settings-btn');
    if (cur === btn) {
      if (k !== K.DOWN || !rows.length) return false;
      focusInRow(rows[0], btn);
      return true;
    }
    var row = cur.closest('#home-rows .row');
    if (!row) return false;
    var i = rows.indexOf(row);
    if (k === K.UP || k === K.DOWN) {
      var next = rows[i + (k === K.UP ? -1 : 1)];
      if (next) focusInRow(next, cur);
      else if (k === K.UP) Nav.focus(btn);
      return true;
    }
    if (k === K.LEFT || k === K.RIGHT) {
      var tiles = Array.prototype.slice.call(row.querySelectorAll('.tile'));
      var t = tiles[tiles.indexOf(cur) + (k === K.LEFT ? -1 : 1)];
      if (t) Nav.focus(t);
      return true;
    }
    return false;
  }

  function focusInRow(row, from) {
    var zone = row.getAttribute('data-zone');
    var remembered = Nav.remembered(zone);
    if (remembered && document.contains(remembered)) return Nav.focus(remembered);
    var x = from.getBoundingClientRect(), cx = x.left + x.width / 2, best = null, bestD = Infinity;
    Array.prototype.forEach.call(row.querySelectorAll('.tile'), function (t) {
      var r = t.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bestD) { bestD = d; best = t; }
    });
    if (best) Nav.focus(best);
  }

  function homeKeys(k) {
    if (!isShown('home')) return false;
    if (Nav.isBack(k)) { exitApp(); return true; }
    if (k === K.UP || k === K.DOWN || k === K.LEFT || k === K.RIGHT) return homeRowNav(k);
    return false;
  }

  function loginKeys(k) {
    if (!isShown('login')) return false;
    var cur = Nav.current();
    if (k === K.ENTER && cur && cur.classList.contains('field')) { Nav.move('down'); return true; }
    if (Nav.isBack(k)) { if (form.from === 'settings') openSettings(); else exitApp(); return true; }
    return false;
  }

  // ---------- wiring ----------
  function bind() {
    $('f-connect').addEventListener('click', connect);
    $('f-cancel').addEventListener('click', cancelForm);
    $('pl-others').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) switchPlaylist(c.getAttribute('data-use')); });
    $('pl-type').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) setFormType(c.getAttribute('data-type')); });
    $('pl-format').addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (c) setFormFormat(c.getAttribute('data-format')); });
    $('pl-list').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      if (c.getAttribute('data-add')) return showPlaylistForm(null, '', 'settings');
      var use = c.getAttribute('data-use'), edit = c.getAttribute('data-edit'), del = c.getAttribute('data-del');
      if (use && use !== activeId) return switchPlaylist(use);
      if (edit) return showPlaylistForm(playlists.filter(function (p) { return p.id === edit; })[0], '', 'settings');
      if (del) {
        if (c.getAttribute('data-confirm')) return deletePlaylist(del);
        c.setAttribute('data-confirm', '1');
        c.textContent = 'Press OK again to delete';
      }
    });
    $('settings-btn').addEventListener('click', openSettings);
    $('set-conntest').addEventListener('click', runConnectionTest);
    $('set-reset').addEventListener('click', resetChecks);
    $('look-chips').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      settings.style = c.getAttribute('data-style');
      saveSettings();
      applyStyle();
      renderLook();
      Nav.focus(document.querySelector('#look-chips .chip[data-style="' + settings.style + '"]'));
    });
    $('theme-swatches').addEventListener('click', function (e) {
      var sw = e.target.closest('.swatch');
      if (!sw) return;
      settings.theme = sw.getAttribute('data-theme');
      saveSettings();
      applyTheme(settings.theme);
      each('#theme-swatches .swatch', function (x) { x.classList.toggle('on', x === sw); });
      Nav.remember('swatches', sw);
    });
    $('set-adult').addEventListener('click', function () {
      settings.showAdult = !settings.showAdult;
      saveSettings();
      state.groups = buildGroups();
      rebuildChannels();
      renderSettings();
    });
    $('set-home-favs').addEventListener('click', function () {
      settings.homeFavourites = settings.homeFavourites === false;   // default on
      saveSettings();
      renderSettings();
      state.homeDirty = true;
    });
    $('set-show-dead').addEventListener('click', function () {
      settings.showUnavailable = !settings.showUnavailable;
      saveSettings();
      renderSettings();
      rebuildChannels();
    });
    $('check-sports').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      if (chip.getAttribute('data-stop')) stopCheck(); else runCheck(chip.getAttribute('data-kind'), chip.getAttribute('data-id'));
    });
    $('gear').innerHTML = Icons.svg('gear', 'gear-icon');
    $('settings-mark').innerHTML = Icons.svg('gear', 'art-icon');
    $('diag-mark').innerHTML = Icons.svg('tv', 'art-icon');

    $('home-rows').addEventListener('click', function (e) {
      var tile = e.target.closest('.tile');
      if (tile) openTile(tile);
    });
    $('home-rows').addEventListener('navfocus', function (e) {
      state.homeFocus = e.target;
      setAmbient(e.target.getAttribute('data-amb'));
      updateHero(e.target);
      // Keep the focused row's title in view too. In the Cinema look the focused row always sits
      // first, right under the spotlight (rows move one at a time, nothing half-hidden).
      var row = e.target.closest('.row');
      if (row && currentStyle() === 'cinema') {
        var sc = $('home-rows');
        var top = row.offsetParent === sc ? row.offsetTop : row.offsetTop - sc.offsetTop;
        sc.scrollTop = top;   // instant: a smooth scroll gets cancelled by the next ◀▶ move
      } else if (row) row.scrollIntoView({ block: 'nearest' });
    });

    $('cat-list').addEventListener('click', function (e) {
      var c = e.target.closest('.cat');
      if (!c) return;
      selectCategory(c).then(function () {
        var first = document.querySelector('#channel-list li');
        if (first) Nav.focus(first);
      });
    });
    $('cat-list').addEventListener('navfocus', function (e) { previewCategory(e.target); });

    $('d-fav').addEventListener('click', function () {
      if (state.detailsItem) toggleFav(state.detailsItem);
    });

    // OK on a channel starts its preview; OK again on the same channel opens full screen.
    $('channel-list').addEventListener('click', function (e) {
      var el = e.target.closest('[data-i]');
      if (!el) return;
      var i = Number(el.getAttribute('data-i'));
      var item = state.items[i];
      if (previewItem === item) { openPlayer(i); return; }
      if (state.detailsItem !== item) showDetails(item);
      startPreview(item);
    });
    $('channel-list').addEventListener('navfocus', function (e) {
      var el = e.target.closest('[data-i]');
      if (el) showDetails(state.items[Number(el.getAttribute('data-i'))]);
    });

    Nav.pushHandler(homeKeys);
    Nav.pushHandler(diagKeys);
    Nav.pushHandler(settingsKeys);
    Nav.pushHandler(browseKeys);
    Nav.pushHandler(loginKeys);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Store.flush();
      if (document.hidden && isShown('player')) closePlayer();
    });
  }

  function registerTvKeys() {
    if (!Api.IS_TV) return;
    ['ChannelUp', 'ChannelDown', 'MediaStop']
      .forEach(function (key) { try { tizen.tvinputdevice.registerKey(key); } catch (e) { /* ignore */ } });
  }

  function tickClock() {
    var d = new Date();
    var t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    each('.clock', function (el) { el.textContent = t; });
  }

  function loadSaved() {
    migratePlaylists();
    settings = Store.get(SETTINGS_KEY, {});
    favs = Store.get(ns(FAV_KEY), []);
    health = Store.get(ns(HEALTH_KEY), {});
    scans = Store.get(ns(SCANS_KEY), {});
    scanLog = Store.get(ns(LOG_KEY), null);
  }

  function init() {
    Store.init().then(function () {
      loadSaved();
      boot();
    });
  }

  function boot() {
    applyTheme(settings.theme);
    applyStyle();
    $('storage-where').textContent = 'Playlists, favourites, settings and scan results are saved in: ' + Store.where() +
      '. Photos: Wikimedia Commons (credits in the app files).';
    Player.init($('video'));
    preview.init($('pv-video'));
    preview.on('loading', function () { if (previewItem) previewState('loading'); });
    preview.on('playing', function () { if (previewItem) previewState('playing'); });
    preview.on('error', function () { if (previewItem) previewState('error', 'Not available right now'); });
    bind();
    registerTvKeys();
    tickClock();
    setInterval(tickClock, 10000);

    var pl = activePlaylist();
    if (pl) {
      start(pl).then(devAutostart).catch(function (err) {
        showPlaylistForm(pl, 'Could not connect: ' + ((err && err.message) || 'unknown error'), 'boot');
      });
    } else {
      showPlaylistForm(null, '', 'boot');
    }
  }

  init();
})();
