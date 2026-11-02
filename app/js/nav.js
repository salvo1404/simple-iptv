/* Remote-control navigation.
 * Geometric spatial navigation between `.focusable` elements, with "zones":
 * moving into another zone returns to the element you last focused there
 * (so Left from a channel goes back to its category, not to whatever is nearest). */
(function (global) {
  'use strict';

  var KEYS = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27, BACKSPACE: 8,
    CH_UP: 427, CH_DOWN: 428,
    PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413,
    FF: 417, RW: 412,
  };

  var current = null;
  var zoneMemory = {};

  function zoneOf(el) {
    var z = el && el.closest('[data-zone]');
    return z ? z.getAttribute('data-zone') : '';
  }

  function isVisible(el) {
    return el && el.offsetParent !== null && !el.closest('.hidden');
  }

  function focus(el, opts) {
    if (!el) return;
    if (current) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    var z = zoneOf(el);
    if (z) zoneMemory[z] = el;
    if (el.tagName === 'INPUT') el.focus();
    else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    if (!opts || opts.scroll !== false) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
  }

  function candidates() {
    return Array.prototype.filter.call(document.querySelectorAll('.focusable'), isVisible);
  }

  function inDirection(el, r, dir) {
    var o = el.getBoundingClientRect();
    if (dir === 'left') return o.right <= r.left + 1;
    if (dir === 'right') return o.left >= r.right - 1;
    if (dir === 'up') return o.bottom <= r.top + 1;
    return o.top >= r.bottom - 1;
  }

  function move(dir) {
    if (!current || !isVisible(current)) {
      var first = candidates()[0];
      if (first) focus(first);
      return;
    }
    var r = current.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;

    candidates().forEach(function (el) {
      if (el === current) return;
      var o = el.getBoundingClientRect();
      var ox = o.left + o.width / 2, oy = o.top + o.height / 2;
      var primary, secondary;
      if (dir === 'left') { if (o.right > r.left + 1) return; primary = r.left - o.right; secondary = Math.abs(oy - cy); }
      if (dir === 'right') { if (o.left < r.right - 1) return; primary = o.left - r.right; secondary = Math.abs(oy - cy); }
      if (dir === 'up') { if (o.bottom > r.top + 1) return; primary = r.top - o.bottom; secondary = Math.abs(ox - cx); }
      if (dir === 'down') { if (o.top < r.bottom - 1) return; primary = o.top - r.bottom; secondary = Math.abs(ox - cx); }
      var score = primary + secondary * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    });

    if (!best) return;
    var fromZone = zoneOf(current), toZone = zoneOf(best);
    if (toZone && toZone !== fromZone) {
      var remembered = zoneMemory[toZone];
      // Return to where you were in that zone, but only if it lies in the direction you pressed
      // (otherwise ▼ out of a nested group could jump back up to the top of its parent).
      if (remembered && document.contains(remembered) && isVisible(remembered) && inDirection(remembered, r, dir)) best = remembered;
    }
    focus(best);
  }

  var handlers = [];

  // Handlers are a stack: the topmost (e.g. player) gets keys first and may return true to consume.
  function pushHandler(fn) { handlers.push(fn); }
  function popHandler(fn) {
    var i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    // Let text inputs handle Backspace / Left / Right themselves.
    if (inInput && (k === KEYS.BACKSPACE || ((k === KEYS.LEFT || k === KEYS.RIGHT) && document.activeElement.value))) return;

    for (var i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i](k, e) === true) { e.preventDefault(); return; }
    }

    var dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[k];
    if (dir) { e.preventDefault(); move(dir); return; }
    if (k === KEYS.ENTER && current) { e.preventDefault(); current.click(); }
  });

  // Mouse support for desktop testing.
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== current) focus(el, { scroll: false });
  });

  global.Nav = {
    KEYS: KEYS,
    focus: focus,
    move: move,
    current: function () { return current; },
    remembered: function (zone) { return zoneMemory[zone]; },
    remember: function (zone, el) { zoneMemory[zone] = el; },   // where focus lands when entering `zone`
    forget: function (zone) { delete zoneMemory[zone]; },
    pushHandler: pushHandler,
    popHandler: popHandler,
    isBack: function (k) { return k === KEYS.BACK || k === KEYS.ESC || k === KEYS.BACKSPACE; },
  };
})(window);
