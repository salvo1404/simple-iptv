/* Classify live channels by sport.
 * 1. Keywords in the channel name ("SKY SPORTS CRICKET", "NBA: Dallas Mavericks", "Tennis Channel").
 * 2. Otherwise, the category it lives in ("NFL", "UK - RUGBY EVENTS", "IT - LNP & NBA").
 * Channels in sports categories that match nothing go to "More sports". */
(function (global) {
  'use strict';

  // Team nicknames that only mean one sport (ambiguous ones like Kings, Giants, Panthers, Rangers left out).
  // Event channels are often named after the match, e.g. "NFL 1 | Commanders @ Chiefs".
  var NBA_TEAMS = 'HAWKS|CELTICS|\\bNETS\\b|HORNETS|BULLS|CAVALIERS|MAVERICKS|NUGGETS|PISTONS|WARRIORS|ROCKETS|PACERS|CLIPPERS|LAKERS|GRIZZLIES|\\bHEAT\\b|BUCKS|TIMBERWOLVES|PELICANS|KNICKS|THUNDER|\\bMAGIC\\b|76ERS|SIXERS|\\bSUNS\\b|TRAIL BLAZERS|BLAZERS|SPURS SAN ANTONIO|RAPTORS|\\bJAZZ\\b|WIZARDS';
  var NFL_TEAMS = 'PACKERS|\\bLIONS\\b|CHIEFS|COMMANDERS|COWBOYS|EAGLES|STEELERS|RAVENS|BENGALS|BROWNS|PATRIOTS|DOLPHINS|\\bBILLS\\b|\\bJETS\\b|TEXANS|COLTS|TITANS|JAGUARS|BRONCOS|RAIDERS|CHARGERS|49ERS|SEAHAWKS|\\bRAMS\\b|VIKINGS|\\bBEARS\\b|BUCCANEERS|FALCONS|SAINTS';

  // Order matters: more specific sports first (Rugby, NFL and NBA before Football).
  var SPORTS = [
    { id: 'rugby', name: 'Rugby', icon: 'rugby',
      name_: /RUGBY|SIX NATIONS|SUPER LEAGUE/,
      cat: /RUGBY/ },
    { id: 'americanFootball', name: 'American Football', icon: 'americanFootball',
      name_: /\bNFL|NCAAF|COLLEGE FOOTBALL|REDZONE|RED ZONE|FOOTBALL AM[EÉ]RICAIN|FOOTBALL AMERICANO/,
      teams: new RegExp(NFL_TEAMS),
      cat: /\bNFL\b/ },
    { id: 'basketball', name: 'Basketball', icon: 'basketball',
      name_: /\bNBA\b|BASKET|\bLNP\b|EUROLEAGUE|\bWNBA\b|NCAAB/,
      teams: new RegExp(NBA_TEAMS),
      cat: /\bNBA\b|\bLNP\b/ },
    { id: 'football', name: 'Football', icon: 'soccer',
      name_: /SOCCER|PREMIER LEAGUE|\bEPL\b|LA ?LIGA|SERIE A\b|SERIE B\b|LIGUE ?1|BUNDESLIGA|EREDIVISIE|CHAMPIONS LEAGUE|EUROPA LEAGUE|\bUEFA\b|\bFIFA\b|\bMUTV\b|LFC ?TV|CHELSEA TV|BARCA|REAL MADRID TV|\bSPFL\b|\bMLS\b|FA CUP|CARABAO|\bEFL\b|CALCIO|INTER TV|MILAN TV|ROMA TV|JUVENTUS|FUTBOL|FÚTBOL|SPORTS FOOTBALL|PREMIER SPORTS|LALIGA|\bFOOTBALL\b/,
      cat: /\bEPL\b|SPFL|LIGUE 1|SERIE A|ESPN SOCCER|\bMLS\b|NI FL/ },
    { id: 'tennis', name: 'Tennis', icon: 'tennis',
      name_: /TENNIS|\bATP\b|\bWTA\b|WIMBLEDON|ROLAND GARROS|PARIS MASTERS|MASTERS 1000|DAVIS CUP|BILLIE JEAN KING/ },
    { id: 'motorsport', name: 'Motorsport', icon: 'flag',
      name_: /\bF1\b|FORMULA ?1|FORMULA ONE|MOTOGP|NASCAR|INDYCAR|MOTORSPORT|SUPERBIKE|MOTOR RACING|RACING AMERICA/,
      cat: /FORMULA/ },
    { id: 'fight', name: 'Fight Sports', icon: 'glove',
      name_: /\bUFC\b|BOXING|BOX ?NATION|\bWWE\b|\bAEW\b|\bMMA\b|CAGE WARRIORS|\bPFL\b|FIGHT|WRESTLING|BELLATOR/ },
    { id: 'baseball', name: 'Baseball', icon: 'baseball',
      name_: /\bMLB\b|BASEBALL/,
      cat: /\bMLB\b/ },
    { id: 'cricket', name: 'Cricket', icon: 'cricket',
      name_: /CRICKET|WILLOW|\bIPL\b/ },
    { id: 'golf', name: 'Golf', icon: 'golf',
      name_: /GOLF|\bPGA\b|RYDER CUP/ },
    { id: 'hockey', name: 'Ice Hockey', icon: 'hockey',
      name_: /\bNHL\b|HOCKEY/ },
  ];
  var MORE = { id: 'more', name: 'More Sports', icon: 'trophy' };

  // Order of the tiles on the home screen.
  var DISPLAY_ORDER = ['basketball', 'football', 'tennis', 'motorsport', 'americanFootball', 'rugby',
    'fight', 'baseball', 'cricket', 'golf', 'hockey', 'more'];

  // Categories we never classify (and the one we never show in Sports).
  var SKIP_CAT = /ADULT|XXX|\+18|18\+/;

  // Event feeds with nothing scheduled: "NBA | Event 42", "NFL08:", "Rugby 11 |", "NFL 3 | No Fixture Scheduled".
  var PLACEHOLDER = [
    /^[^|:]*\d+\s*[|:]\s*$/,                  // "...<number> |"  /  "...<number>:"
    /\|\s*(event\s*)?\d+\s*$/i,                 // "... | Event 53"  /  "Disc+ UK | 04"
    /\bno (fixture|event|game|match)e?s?\b/i
  ];
  var FULL_DATE = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/;

  function isPlaceholder(name) {
    var n = String(name || '').replace(/\b(FHD|UHD|HD|SD|4K|HEVC)\b/gi, '').trim();
    for (var i = 0; i < PLACEHOLDER.length; i++) if (PLACEHOLDER[i].test(n)) return true;
    // Event named with a full date (dd-mm-yyyy) that ended more than a day ago.
    var m = n.match(FULL_DATE);
    if (m && new Date(+m[3], +m[2] - 1, +m[1]).getTime() < Date.now() - 36 * 3600 * 1000) return true;
    return false;
  }

  /* Sport of a TV programme from its guide title/description, or null. */
  function sportOfProgramme(text) {
    var n = String(text || '').toUpperCase();
    for (var i = 0; i < SPORTS.length; i++) if (SPORTS[i].name_.test(n)) return SPORTS[i];
    return null;
  }

  function sportOf(channelName, categoryName, inSportsCategory) {
    var n = String(channelName || '').toUpperCase();
    var c = String(categoryName || '').toUpperCase();
    var i;
    for (i = 0; i < SPORTS.length; i++) if (SPORTS[i].name_.test(n)) return SPORTS[i];
    // Team names are only trusted inside sports categories ("Jazz" is also a music channel).
    if (inSportsCategory) for (i = 0; i < SPORTS.length; i++) if (SPORTS[i].teams && SPORTS[i].teams.test(n)) return SPORTS[i];
    // Category fallback, except for general networks ("Fox Sports 1") parked in a single-sport category.
    if (!/SPORT/.test(n)) for (i = 0; i < SPORTS.length; i++) if (SPORTS[i].cat && SPORTS[i].cat.test(c)) return SPORTS[i];
    return inSportsCategory ? MORE : null;
  }

  /* streams: all live streams; catName: {category_id: name}; isSportsCat: fn(name) -> bool.
   * Returns sports in DISPLAY_ORDER, each with `subs`:
   * the channels split by the category they came from. */
  function build(streams, catName, isSportsCat) {
    var by = {};
    (streams || []).forEach(function (s) {
      var cname = catName[s.category_id] || '';
      if (SKIP_CAT.test(cname.toUpperCase()) || isPlaceholder(s.name)) return;
      var sport = sportOf(s.name, cname, isSportsCat(cname));
      if (!sport) return;
      var g = by[sport.id] || (by[sport.id] = { id: sport.id, name: sport.name, icon: sport.icon, count: 0, subs: {}, order: [] });
      if (!g.subs[s.category_id]) { g.subs[s.category_id] = []; g.order.push(s.category_id); }
      g.subs[s.category_id].push(s);
      g.count++;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    list.sort(function (a, b) { return DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id); });
    return list;
  }

  global.Sports = { build: build, sportOf: sportOf, sportOfProgramme: sportOfProgramme, isPlaceholder: isPlaceholder, SPORTS: SPORTS };
})(window);
