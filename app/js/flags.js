/* Country flags as inline SVG (emoji flags don't render on most Tizen TVs).
 * All drawn in a 3:2 box; flags with other proportions are centre-cropped. */
(function (global) {
  'use strict';

  var uid = 0;

  function wrap(viewBox, body) {
    return '<svg class="flag" viewBox="' + viewBox + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + body + '</svg>';
  }

  function bands(colors, vertical) {
    var n = colors.length, size = (vertical ? 60 : 40) / n;
    return colors.map(function (c, i) {
      return vertical
        ? '<rect x="' + i * size + '" y="0" width="' + size + '" height="40" fill="' + c + '"/>'
        : '<rect x="0" y="' + i * size + '" width="60" height="' + size + '" fill="' + c + '"/>';
    }).join('');
  }

  // Union Jack in a 60x30 box (ids made unique so several can share a page).
  function unionJack() {
    var s = 'uj' + (++uid), t = 'ujt' + uid;
    return '<defs><clipPath id="' + s + '"><path d="M0,0v30h60V0z"/></clipPath>' +
      '<clipPath id="' + t + '"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath></defs>' +
      '<g clip-path="url(#' + s + ')">' +
      '<path d="M0,0v30h60V0z" fill="#012169"/>' +
      '<path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>' +
      '<path d="M0,0L60,30M60,0L0,30" clip-path="url(#' + t + ')" stroke="#C8102E" stroke-width="4"/>' +
      '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/>' +
      '<path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g>';
  }

  function star(cx, cy, r, fill, stroke) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.4 : r;
      pts.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width=".6"' : '') + '/>';
  }

  function usa() {
    var h = 40 / 13, body = '<rect width="60" height="40" fill="#fff"/>';
    for (var i = 0; i < 13; i += 2) body += '<rect y="' + (i * h).toFixed(3) + '" width="60" height="' + h.toFixed(3) + '" fill="#B22234"/>';
    var cw = 24, ch = h * 7;
    body += '<rect width="' + cw + '" height="' + ch.toFixed(3) + '" fill="#3C3B6E"/>';
    for (var r = 0; r < 9; r++) {
      var cols = r % 2 ? 5 : 6;
      for (var c = 0; c < cols; c++) {
        var x = cw / 12 * (2 * c + 1 + (r % 2)), y = ch / 10 * (r + 1);
        body += star(x, y, 0.95, '#fff');
      }
    }
    return wrap('0 0 60 40', body);
  }

  // Blue ensign with Union Jack canton (New Zealand, Australia).
  function ensign(stars) {
    return wrap('0 0 60 30', '<rect width="60" height="30" fill="#012169"/>' +
      '<svg x="0" y="0" width="30" height="15" viewBox="0 0 60 30">' + unionJack() + '</svg>' + stars);
  }

  var FLAGS = {
    IT: function () { return wrap('0 0 60 40', bands(['#009246', '#fff', '#CE2B37'], true)); },
    FR: function () { return wrap('0 0 60 40', bands(['#0055A4', '#fff', '#EF4135'], true)); },
    IE: function () { return wrap('0 0 60 40', bands(['#169B62', '#fff', '#FF883E'], true)); },
    BE: function () { return wrap('0 0 60 40', bands(['#000', '#FAE042', '#ED2939'], true)); },
    DE: function () { return wrap('0 0 60 40', bands(['#000', '#DD0000', '#FFCE00'])); },
    NL: function () { return wrap('0 0 60 40', bands(['#AE1C28', '#fff', '#21468B'])); },
    PL: function () { return wrap('0 0 60 40', bands(['#fff', '#DC143C'])); },
    ES: function () {
      return wrap('0 0 60 40', '<rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/>');
    },
    PT: function () {
      return wrap('0 0 60 40', '<rect width="60" height="40" fill="#DA291C"/><rect width="24" height="40" fill="#046A38"/>' +
        '<circle cx="24" cy="20" r="7" fill="#FFE900"/><circle cx="24" cy="20" r="4.5" fill="#DA291C"/>');
    },
    UK: function () { return wrap('0 0 60 30', unionJack()); },
    US: usa,
    NZ: function () {
      return ensign(star(45, 24, 2.6, '#C8102E', '#fff') + star(40, 13, 2.2, '#C8102E', '#fff') +
        star(50, 11, 2.2, '#C8102E', '#fff') + star(45, 5, 2.2, '#C8102E', '#fff'));
    },
    AU: function () {
      return ensign(star(15, 23, 3.2, '#fff') + star(45, 25, 1.8, '#fff') + star(39, 13, 1.8, '#fff') +
        star(51, 11, 1.8, '#fff') + star(45, 5, 1.8, '#fff') + star(48, 16, 1, '#fff'));
    },
  };
  FLAGS.GB = FLAGS.UK;

  global.Flags = {
    svg: function (code) { return FLAGS[code] ? FLAGS[code]() : ''; },
    has: function (code) { return !!FLAGS[code]; },
  };
})(window);
