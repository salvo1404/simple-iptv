/* Turns a provider's flat category list into Countries and Topics.
 * Category names usually look like "UK - SPORTS", "|IT| CINEMA" or just "NBA". */
(function (global) {
  'use strict';

  var COUNTRY_NAMES = {
    UK: 'United Kingdom', GB: 'United Kingdom', IE: 'Ireland', US: 'United States', CA: 'Canada',
    IT: 'Italy', FR: 'France', ES: 'Spain', DE: 'Germany', PT: 'Portugal', NL: 'Netherlands',
    BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', PL: 'Poland', TR: 'Turkey', GR: 'Greece',
    SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', RO: 'Romania', AL: 'Albania',
    AR: 'Arabic', AU: 'Australia', NZ: 'New Zealand', IN: 'India', PK: 'Pakistan', BR: 'Brazil',
    MX: 'Mexico', LAT: 'Latin America', ZA: 'South Africa', AE: 'UAE', SA: 'Saudi Arabia',
  };

  // Order here is the order of the shortcut tiles.
  var TOPICS = [
    { id: 'sports', name: 'Sports', match: /SPORT|DAZN|EPL|FORMULA|\bF1\b|TNT|LIGUE|SERIE [AB]|\bNBA\b|\bNFL\b|NI FL|\bMLB\b|\bMLS\b|\bNHL\b|RUGBY|SPFL|ESPN|PPV|SETANTA|\bLNP\b|TRILLER|EVENT|FOOTBALL|SOCCER|BOXING|UFC|GOLF|TENNIS|CRICKET/ },
    { id: 'news', name: 'News', match: /NEWS|\bINFO\b/ },
    { id: 'movies', name: 'Movies', match: /MOVIE|CINEMA|PRIMAFILA|SKY STORE|FILM/ },
    { id: 'entertainment', name: 'Entertainment', match: /ENTERTAINMENT|GENERAL|SERIES|ORIGINAL|PROGRAMMES/ },
    { id: 'kids', name: 'Kids', match: /KIDS|ENFANTS|CHILD|CARTOON/ },
    { id: 'docs', name: 'Documentaries', match: /DOCUMENTAR|FACTUAL|CULTURE|NATURE|HISTORY/ },
    { id: 'music', name: 'Music', match: /MUSIC|MUSIQUE/ },
  ];

  var PREFIX = /^\s*(?:\|([A-Z]{2,3})\||([A-Z]{2,3})\s*[-:|]\s+)\s*(.*)$/i;

  function parse(cat) {
    var raw = String(cat.category_name || '').trim();
    var m = raw.match(PREFIX);
    var code = m ? (m[1] || m[2]).toUpperCase() : null;
    if (code === 'GB') code = 'UK';
    return {
      id: String(cat.category_id),
      raw: raw,
      country: code && COUNTRY_NAMES[code] ? code : null,
      label: code && COUNTRY_NAMES[code] ? m[3] : raw,   // name without the country prefix
    };
  }

  var ACRONYMS = /^(DAZN|ESPN|HEVC|SPFL|PPV|LNP|AMC|HBO|EPL|NBA|NFL|MLB|MLS|NHL|UFC|TNT|BBC|ITV|RAI|TF1|M6|HD|FHD|UHD|4K|TV|UK|US|USA|F1|ESPN\+?|DSTV|BT|NI)\+?$/;

  function titleCase(s) {
    // "SKY SPORTS" -> "Sky Sports", but keep known acronyms like EPL, DAZN, TF1.
    return s.split(/(\s+)/).map(function (w) {
      var bare = w.replace(/[^A-Za-z0-9+]/g, '').toUpperCase();
      if (/^\s+$/.test(w) || ACRONYMS.test(bare)) return w.toUpperCase();
      if (w !== w.toUpperCase()) return w; // already mixed case, e.g. "DirecTV"
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join('');
  }

  function build(categories) {
    var parsed = (categories || []).map(parse);

    var countries = {};
    var order = [];
    parsed.forEach(function (c) {
      var key = c.country || 'OTHER';
      if (!countries[key]) {
        countries[key] = { id: 'country:' + key, kind: 'country', code: key === 'OTHER' ? '•••' : key,
          name: key === 'OTHER' ? 'Other' : COUNTRY_NAMES[key], cats: [] };
        order.push(key);
      }
      countries[key].cats.push({ id: c.id, name: titleCase(c.label) });
    });
    // Biggest first, "Other" always last.
    var countryList = order.filter(function (k) { return k !== 'OTHER'; })
      .map(function (k) { return countries[k]; })
      .sort(function (a, b) { return b.cats.length - a.cats.length; });
    if (countries.OTHER) countryList.push(countries.OTHER);

    var topics = TOPICS.map(function (t) {
      var cats = parsed.filter(function (c) { return t.match.test(c.raw.toUpperCase()); })
        .map(function (c) {
          return { id: c.id, name: titleCase(c.label), country: c.country, icon: global.Icons.forCategory(c.raw, t.id) };
        });
      return { id: 'topic:' + t.id, kind: 'topic', topic: t.id, name: t.name, icon: global.Icons.forCategory('', t.id), cats: cats };
    }).filter(function (t) { return t.cats.length > 0; });

    // Lookup for any category: display name + country code.
    var catInfo = {};
    parsed.forEach(function (c) { catInfo[c.id] = { raw: c.raw, name: titleCase(c.label), country: c.country }; });

    return { countries: countryList, topics: topics, catInfo: catInfo };
  }

  var SPORTS_TOPIC = TOPICS[0].match;
  function isSportsCategory(rawName) { return SPORTS_TOPIC.test(String(rawName || '').toUpperCase()); }

  global.Groups = { build: build, isSportsCategory: isSportsCategory };
})(window);
