/* Channel logos: loaded a few at a time (image hosts rate-limit bursts),
 * remembered once loaded or failed, with an initials placeholder meanwhile. */
(function (global) {
  'use strict';

  var MAX_PARALLEL = 4;
  var TIMEOUT_MS = 8000;
  var ok = {};      // url -> true
  var failed = {};  // url -> true
  var queue = [];
  var active = 0;
  var generation = 0;

  function initials(name) {
    var clean = String(name || '')
      .replace(/^\s*(\|[A-Z]{2,3}\||[A-Z]{2,3}\s*[-:|])\s*/i, '') // country prefix
      .replace(/\b(FHD|UHD|HD|SD|4K|HEVC|H265|RAW)\b/gi, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ').trim();
    var words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return '·';
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return (words[0][0] + words[1][0] + (words[2] ? words[2][0] : '')).toUpperCase();
  }

  function show(el, url) {
    el.innerHTML = '';
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    el.appendChild(img);
    el.classList.add('has-logo');
  }

  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      var job = queue.shift();
      if (job.gen !== generation || !document.contains(job.el)) continue;
      if (ok[job.url]) { show(job.el, job.url); continue; }
      if (failed[job.url]) continue;
      active++;
      load(job);
    }
  }

  function load(job) {
    var img = new Image();
    var done = false;
    var timer = setTimeout(function () { finish(false); }, TIMEOUT_MS);
    function finish(success) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active--;
      if (success) {
        ok[job.url] = true;
        if (document.contains(job.el)) show(job.el, job.url);
      } else {
        failed[job.url] = true;
        img.src = '';
      }
      pump();
    }
    img.onload = function () { finish(img.naturalWidth > 0); };
    img.onerror = function () { finish(false); };
    img.src = job.url;
  }

  /* Render a placeholder into `el` and (eventually) swap in the logo.
   * `priority` jobs (details panel, player) jump the queue. */
  function set(el, url, name, priority) {
    el.classList.remove('has-logo');
    el.innerHTML = '<span class="initials">' + initials(name) + '</span>';
    if (!url || failed[url]) return;
    if (ok[url]) { show(el, url); return; }
    var job = { el: el, url: url, gen: generation };
    if (priority) queue.unshift(job); else queue.push(job);
    pump();
  }

  /* Drop pending jobs (e.g. when a new channel list replaces the old one). */
  function reset() {
    generation++;
    queue = [];
  }

  global.Logos = { set: set, reset: reset, initials: initials };
})(window);
