/* Dev-only on-screen key/focus log. Enabled by window.DEV_DEBUG (set in the git-ignored app/dev.local.js). */
(function () {
  'use strict';
  if (!window.DEV_DEBUG) return;
  var box = document.createElement('div');
  box.id = 'dbg';
  box.style.cssText = 'position:fixed;left:1rem;bottom:1rem;z-index:9999;width:58rem;max-height:22rem;overflow:hidden;' +
    'background:rgba(0,0,0,.85);color:#9f9;font:1rem/1.35 monospace;padding:.8rem 1rem;border-radius:.6rem;white-space:pre-wrap;pointer-events:none';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
  var lines = [];
  function desc(el) {
    if (!el) return 'null';
    if (!document.contains(el)) return 'DETACHED ' + (el.id || el.className);
    var name = el.querySelector && el.querySelector('.tile-name');
    return (el.id ? '#' + el.id : '') + '.' + String(el.className).replace(/\s+/g, '.') + (name ? ' "' + name.textContent + '"' : '');
  }
  function screenName() {
    var s = ['home', 'browse', 'player', 'settings', 'diag', 'login', 'splash'].filter(function (id) {
      var e = document.getElementById(id); return e && !e.classList.contains('hidden');
    });
    return s.join(',');
  }
  function log(t) { lines.unshift(t); lines = lines.slice(0, 7); box.textContent = lines.join('\n'); }
  document.addEventListener('keydown', function (e) {
    var before = window.Nav && Nav.current();
    var row = before && before.closest && before.closest('#home-rows .row');
    var vis = document.querySelector('.focused');
    setTimeout(function () {
      var after = window.Nav && Nav.current();
      log('key ' + e.keyCode + ' [' + screenName() + '] style=' + document.documentElement.className +
        '\n  before: ' + desc(before) + '\n  row: ' + (row ? row.getAttribute('data-zone') : 'none') +
        ' | visible .focused: ' + desc(vis) + '\n  after:  ' + desc(after));
    }, 0);
  }, true);
  window.addEventListener('error', function (e) { log('ERROR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });
})();
