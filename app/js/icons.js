/* Line icons (48x48, stroke = currentColor). Inline SVG: no emoji, since Tizen fonts often lack them. */
(function (global) {
  'use strict';

  var P = {
    soccer:
      '<circle cx="24" cy="24" r="20"/>' +
      '<path class="fill" d="M24 16.5l7.1 5.2-2.7 8.3h-8.8l-2.7-8.3z"/>' +
      '<path d="M24 16.5V4M31.1 21.7l11.9-3.9M28.4 30l7.4 10.2M19.6 30l-7.4 10.2M16.9 21.7L5 17.8"/>',
    basketball:
      '<circle cx="24" cy="24" r="20"/>' +
      '<path d="M24 4v40M4 24h40M10.5 9.5c6 7.5 6 21.5 0 29M37.5 9.5c-6 7.5-6 21.5 0 29"/>',
    americanFootball:
      '<path d="M7 41C7 23 23 7 41 7c0 18-16 34-34 34z"/>' +
      '<path d="M17 31l14-14M20 25l3 3M23 22l3 3M26 19l3 3M12 36l-3-3M36 12l3-3"/>',
    rugby:
      '<path d="M7 41C7 23 23 7 41 7c0 18-16 34-34 34z"/>' +
      '<path d="M12 36L36 12M14 22c4 0 8 4 12 12M22 14c4 4 8 8 12 12"/>',
    baseball:
      '<circle cx="24" cy="24" r="20"/>' +
      '<path d="M13 8c6 9 6 23 0 32M35 8c-6 9-6 23 0 32"/>' +
      '<path d="M14 15l3-1M15.5 21h3M15.5 27h3M14 33l3 1M34 15l-3-1M32.5 21h-3M32.5 27h-3M34 33l-3 1"/>',
    flag:
      '<path d="M10 44V6"/>' +
      '<path d="M10 8h30v20H10z"/>' +
      '<path class="fill" d="M10 8h7.5v6.7H10zM25 8h7.5v6.7H25zM17.5 14.7H25v6.6h-7.5zM32.5 14.7H40v6.6h-7.5zM10 21.3h7.5V28H10zM25 21.3h7.5V28H25z"/>',
    trophy:
      '<path d="M15 6h18v12a9 9 0 0 1-18 0z"/>' +
      '<path d="M15 10H9a6 6 0 0 0 6 9M33 10h6a6 6 0 0 1-6 9M24 27v7M17 42h14M19 34h10l1 8H18z"/>',
    tennis:
      '<circle cx="24" cy="24" r="20"/>' +
      '<path d="M8 11c8 4 10 22 0 26M40 11c-8 4-10 22 0 26"/>',
    glove:
      '<path d="M13 21c0-8 6-13 13-13h3c7 0 11 5 11 12v6c0 6-4 10-10 10H20c-4 0-7-3-7-7z"/>' +
      '<path d="M13 23c-4 0-6 3-5 6 1 4 5 5 9 3M18 36v6h16v-6M22 17h11"/>',
    cricket:
      '<path d="M13 27L31 9l8 8-18 18z"/>' +
      '<path d="M35 13l7-7"/>' +
      '<circle class="fill" cx="12" cy="39" r="4"/>',
    golf:
      '<path d="M20 38V5"/>' +
      '<path class="fill" d="M20 5l15 6-15 6z"/>' +
      '<path d="M6 42c3-3 9-4.5 15-4.5s12 1.5 15 4.5"/>' +
      '<circle class="fill" cx="36" cy="34" r="2.8"/>',
    hockey:
      '<path d="M14 5l11 27c1 3 3 5 7 5h9"/>' +
      '<path d="M24 31h17v6"/>' +
      '<ellipse cx="13" cy="40" rx="7" ry="3"/>',
    star:
      '<path d="M24 5l5.9 12 13.1 1.9-9.5 9.3 2.2 13.1L24 35.1l-11.7 6.2 2.2-13.1L5 18.9 18.1 17z"/>',
    gear:
      '<circle cx="24" cy="24" r="6"/>' +
      '<path d="M24 4l3 5 5.6-1.6 1.4 5.7 5.7 1.4L38 20.1l5 3-5 3 1.6 5.6-5.7 1.4-1.4 5.7L27 37.2 24 43l-3-5.8-5.6 1.6-1.4-5.7-5.7-1.4L10 26.1 5 23l5-3-1.6-5.6 5.7-1.4 1.4-5.7L21 9z"/>',
    news:
      '<path d="M8 9h26v29H13a5 5 0 0 1-5-5z"/>' +
      '<path d="M34 17h6v16a5 5 0 0 1-5 5h-1"/>' +
      '<path d="M14 16h14M14 23h14M14 30h9"/>',
    movies:
      '<rect x="6" y="19" width="36" height="22" rx="3"/>' +
      '<path d="M6 19l-1.2-6 33-7 1.2 6"/>' +
      '<path d="M13 10.6l4.5 6.2M21 8.9l4.5 6.2M29 7.2l4.5 6.2"/>' +
      '<path class="fill" d="M20 25v10l9-5z"/>',
    entertainment:
      '<rect x="5" y="12" width="38" height="25" rx="3"/>' +
      '<path d="M17 5l7 7 7-7M16 43h16"/>',
    kids:
      '<ellipse cx="24" cy="18" rx="11" ry="13"/>' +
      '<path d="M24 31l-2.5 3h5zM24 34c-3 4 3 6 0 10"/>' +
      '<path d="M18 13a6 6 0 0 1 4-4"/>',
    docs:
      '<path d="M3 39l13-17 8 10 6-7 15 14z"/>' +
      '<circle cx="34" cy="13" r="4"/>',
    music:
      '<path d="M18 36V11l20-5v25"/>' +
      '<circle cx="13" cy="36" r="5"/><circle cx="33" cy="31" r="5"/>',
    globe:
      '<circle cx="24" cy="24" r="20"/>' +
      '<ellipse cx="24" cy="24" rx="8.5" ry="20"/>' +
      '<path d="M4 24h40M7.5 14h33M7.5 34h33"/>',
    tv:
      '<rect x="5" y="10" width="38" height="26" rx="3"/>' +
      '<path d="M16 42h16M24 36v6"/>',
  };

  // Full-colour versions for the big sport panels.
  var C = {
    soccer:
      '<circle cx="24" cy="24" r="20" fill="#fff" stroke="#1a1a1a" stroke-width="2"/>' +
      '<path d="M24 16.5l7.1 5.2-2.7 8.3h-8.8l-2.7-8.3z" fill="#1a1a1a"/>' +
      '<path d="M24 16.5V4M31.1 21.7l11.9-3.9M28.4 30l7.4 10.2M19.6 30l-7.4 10.2M16.9 21.7L5 17.8" stroke="#1a1a1a" stroke-width="2" fill="none"/>',
    basketball:
      '<circle cx="24" cy="24" r="20" fill="#EE7A2F" stroke="#4a2408" stroke-width="2"/>' +
      '<path d="M24 4v40M4 24h40M10.5 9.5c6 7.5 6 21.5 0 29M37.5 9.5c-6 7.5-6 21.5 0 29" stroke="#4a2408" stroke-width="2" fill="none"/>',
    tennis:
      '<circle cx="24" cy="24" r="20" fill="#D7EA3B"/>' +
      '<path d="M8 11c8 4 10 22 0 26M40 11c-8 4-10 22 0 26" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    americanFootball:
      '<path d="M7 41C7 23 23 7 41 7c0 18-16 34-34 34z" fill="#8B4A2B" stroke="#4a230f" stroke-width="1.5"/>' +
      '<path d="M17 31l14-14M20 25l3 3M23 22l3 3M26 19l3 3M12 36l-3-3M36 12l3-3" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>',
    rugby:
      '<path d="M7 41C7 23 23 7 41 7c0 18-16 34-34 34z" fill="#F3EEE2" stroke="#8a7a5a" stroke-width="1.5"/>' +
      '<path d="M12 36L36 12M14 22c4 0 8 4 12 12M22 14c4 4 8 8 12 12" stroke="#B23A3A" stroke-width="2" fill="none" stroke-linecap="round"/>',
    baseball:
      '<circle cx="24" cy="24" r="20" fill="#fff" stroke="#d0d0d0" stroke-width="1.5"/>' +
      '<path d="M13 8c6 9 6 23 0 32M35 8c-6 9-6 23 0 32" stroke="#D7263D" stroke-width="2" fill="none"/>' +
      '<path d="M14 15l3-1M15.5 21h3M15.5 27h3M14 33l3 1M34 15l-3-1M32.5 21h-3M32.5 27h-3M34 33l-3 1" stroke="#D7263D" stroke-width="1.6" fill="none"/>',
    flag:
      '<path d="M10 44V6" stroke="#d6d6d6" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M10 8h30v20H10z" fill="#fff" stroke="#111" stroke-width="1.2"/>' +
      '<path d="M10 8h7.5v6.7H10zM25 8h7.5v6.7H25zM17.5 14.7H25v6.6h-7.5zM32.5 14.7H40v6.6h-7.5zM10 21.3h7.5V28H10zM25 21.3h7.5V28H25z" fill="#111"/>',
    trophy:
      '<path d="M15 10H9a6 6 0 0 0 6 9M33 10h6a6 6 0 0 1-6 9" stroke="#F2C230" stroke-width="2.6" fill="none"/>' +
      '<path d="M15 6h18v12a9 9 0 0 1-18 0z" fill="#F2C230" stroke="#B8860B" stroke-width="1.2"/>' +
      '<path d="M22 27h4v7h-4z" fill="#D4A017"/><path d="M18 34h12l1 8H17z" fill="#B8860B"/>',
    glove:
      '<path d="M13 23c-4 0-6 3-5 6 1 4 5 5 9 3z" fill="#C81E33" stroke="#7d1020" stroke-width="1.2"/>' +
      '<path d="M13 21c0-8 6-13 13-13h3c7 0 11 5 11 12v6c0 6-4 10-10 10H20c-4 0-7-3-7-7z" fill="#E0283F" stroke="#7d1020" stroke-width="1.2"/>' +
      '<path d="M18 36h16v6H18z" fill="#fff" stroke="#bbb" stroke-width="1"/><path d="M22 17h11" stroke="#7d1020" stroke-width="1.6"/>',
    cricket:
      '<path d="M13 27L31 9l8 8-18 18z" fill="#E3B778" stroke="#9c6b32" stroke-width="1.2"/>' +
      '<path d="M35 13l7-7" stroke="#333" stroke-width="3.2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="39" r="4.5" fill="#C62828"/><path d="M8.5 37.5c2.3 1.4 4.7 1.4 7 0" stroke="#fff" stroke-width=".8" fill="none"/>',
    golf:
      '<ellipse cx="22" cy="41" rx="17" ry="4" fill="#3FA34D"/>' +
      '<path d="M20 40V5" stroke="#f0f0f0" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M20 5l15 6-15 6z" fill="#E53935"/>' +
      '<circle cx="34" cy="38" r="2.8" fill="#fff"/>',
    hockey:
      '<path d="M14 5l11 27c1 3 3 5 7 5h9v-6H24" stroke="#C99A6B" stroke-width="3.2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<ellipse cx="13" cy="40" rx="7" ry="3" fill="#111"/><ellipse cx="13" cy="38.6" rx="7" ry="2.4" fill="#333"/>',
  };

  function color(name) {
    if (!C[name]) return svg(name, 'art-icon');
    return '<svg class="art-icon" viewBox="0 0 48 48" aria-hidden="true">' + C[name] + '</svg>';
  }

  function svg(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 48 48" aria-hidden="true">' + (P[name] || P.tv) + '</svg>';
  }

  // Pick an icon for a category based on its (raw, upper-cased) name and topic.
  function forCategory(raw, topic) {
    var n = String(raw || '').toUpperCase();
    if (topic === 'sports') {
      if (/NBA|BASKET|LNP/.test(n)) return 'basketball';
      if (/\bNFL\b|NI FL|AMERICAN FOOTBALL/.test(n)) return 'americanFootball';
      if (/RUGBY/.test(n)) return 'rugby';
      if (/\bMLB\b|BASEBALL/.test(n)) return 'baseball';
      if (/FORMULA|\bF1\b|MOTOR|RACING|NASCAR|MOTOGP/.test(n)) return 'flag';
      if (/TENNIS/.test(n)) return 'tennis';
      if (/PPV|EVENT|BOXING|UFC|WWE|TRILLER/.test(n)) return 'trophy';
      return 'soccer';
    }
    return { news: 'news', movies: 'movies', entertainment: 'entertainment', kids: 'kids', docs: 'docs', music: 'music' }[topic] || 'tv';
  }

  global.Icons = { svg: svg, color: color, forCategory: forCategory };
})(window);
