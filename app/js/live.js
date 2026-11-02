/* What's live right now: live sport and events only.
 *
 * Two sources:
 *  1. Event channel NAMES with a time, e.g. "Rugby Events 06 | Zebre v Dragons 15:15",
 *     "NBA 01: Wizards @ Bulls // UK Fri 12/04 11:50pm // ET ...", "MLB 2 | Angels x Rangers start:2025-04-18 01:05:00".
 *     Times are UK time unless marked otherwise. Live = from 10 min before start for a typical match length.
 *  2. The programme GUIDE for channels that have one: the programme airing now is live if it has a live marker
 *     or is a match, and is not a replay/highlights/archive/studio show.
 * Results are grouped into EVENTS (FHD/HD/SD copies of one match count once).
 * Plain ES5 for older Tizen. Exposed as window.Live; also loadable in Node for tests. */
(function (global) {
  'use strict';

  var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  // Typical length of a live event, from scheduled start.
  var DURATION = {
    football: 2.25 * HOUR, basketball: 2.75 * HOUR, americanFootball: 3.75 * HOUR, baseball: 3.5 * HOUR,
    rugby: 2 * HOUR, tennis: 3 * HOUR, motorsport: 2.5 * HOUR, fight: 5 * HOUR, cricket: 8 * HOUR,
    golf: 6 * HOUR, hockey: 3 * HOUR, more: 3 * HOUR,
  };
  var LEAD = 10 * MIN; // count as live a little before the start

  // ---------- time zones (no Intl on old Tizen) ----------
  function lastSunday(year, month) { // month 0-based, returns day of month
    var d = new Date(Date.UTC(year, month + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  }
  function nthSunday(year, month, n) {
    var first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  }
  // Offset from UTC in minutes for a wall-clock time in the given zone.
  function zoneOffset(zone, y, mo, d, h) {
    if (zone === 'ET') {
      var start = Date.UTC(y, 2, nthSunday(y, 2, 2), 2), end = Date.UTC(y, 10, nthSunday(y, 10, 1), 2);
      var t = Date.UTC(y, mo, d, h);
      return t >= start && t < end ? -240 : -300;
    }
    if (zone === 'UTC') return 0;
    // UK: BST from last Sunday of March 01:00 to last Sunday of October 01:00 (UTC).
    var bs = Date.UTC(y, 2, lastSunday(y, 2), 1), be = Date.UTC(y, 9, lastSunday(y, 9), 1);
    var u = Date.UTC(y, mo, d, h);
    return u >= bs && u < be ? 60 : 0;
  }
  function wallToUtc(zone, y, mo, d, h, mi) {
    return Date.UTC(y, mo, d, h, mi) - zoneOffset(zone, y, mo, d, h) * MIN;
  }
  function wallDate(zone, ms) { // the calendar date in `zone` for an instant
    var guess = new Date(ms);
    var off = zoneOffset(zone, guess.getUTCFullYear(), guess.getUTCMonth(), guess.getUTCDate(), guess.getUTCHours());
    var w = new Date(ms + off * MIN);
    return { y: w.getUTCFullYear(), mo: w.getUTCMonth(), d: w.getUTCDate() };
  }

  // ---------- parsing event names ----------
  var DAYS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  var TIME = /(\d{1,2})[:.](\d{2})\s*(am|pm)?|\b(\d{1,2})\s*(am|pm)\b/i;

  function parseTime(s) {
    var m = s.match(TIME);
    if (!m) return null;
    var h = Number(m[1] || m[4]), mi = Number(m[2] || 0), ap = (m[3] || m[5] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return { h: h, mi: mi, index: m.index, length: m[0].length };
  }

  /* Candidate start instants for a segment of a channel name; returns
   * { start: ms, dated: bool } or null. `now` is ms. */
  function resolveStart(seg, now, zone) {
    var t, m;
    // 1. "start:2025-04-18 01:05:00"
    m = seg.match(/start:\s*(20\d\d)-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/i);
    if (m) return { start: wallToUtc(zone, +m[1], +m[2] - 1, +m[3], +m[4], +m[5]), dated: true };

    t = parseTime(seg);
    if (!t) return null;

    // 2. Full date dd-mm-yyyy / dd/mm/yyyy
    m = seg.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d\d)\b/);
    if (m) return { start: wallToUtc(zone, +m[3], +m[2] - 1, +m[1], t.h, t.mi), dated: true };

    var dayName = seg.match(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\b/i);
    var wd = dayName ? DAYS[dayName[1].toUpperCase()] : null;

    // 3. dd/mm without a year: the weekday (if any) picks the year; otherwise a date more
    //    than a week ahead is taken to be last year's (stale), else the nearest occurrence.
    m = seg.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\s*[:.]\d)/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
      var nowY = new Date(now).getUTCFullYear(), best = null;
      for (var y = nowY + 1; y >= nowY - 3; y--) {
        var s = wallToUtc(zone, y, +m[2] - 1, +m[1], t.h, t.mi);
        if (wd !== null) {
          if (new Date(Date.UTC(y, +m[2] - 1, +m[1])).getUTCDay() === wd && s <= now + 7 * DAY) { best = s; break; }
        } else if (s <= now + 7 * DAY) { best = s; break; }
      }
      if (best === null) best = wallToUtc(zone, nowY - 1, +m[2] - 1, +m[1], t.h, t.mi);
      return { start: best, dated: true };
    }

    // 4. Day of month like "Sat 30th": nearest such date (weekday must match if given).
    m = seg.match(/\b(\d{1,2})(st|nd|rd|th)\b/i);
    var today = wallDate(zone, now);
    var bestStart = null, bestDist = Infinity;
    if (m) {
      for (var k = -400; k <= 7; k++) {
        var dt = new Date(Date.UTC(today.y, today.mo, today.d + k));
        if (dt.getUTCDate() !== +m[1]) continue;
        if (wd !== null && dt.getUTCDay() !== wd) continue;
        var st = wallToUtc(zone, dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), t.h, t.mi);
        var dist = Math.abs(st - now);
        if (dist < bestDist) { bestDist = dist; bestStart = st; }
      }
      if (bestStart !== null) return { start: bestStart, dated: true };
    }

    // 5. Weekday only, or bare time: the occurrence closest to now (this repeats daily/weekly).
    for (var j = -6; j <= 6; j++) {
      var d2 = new Date(Date.UTC(today.y, today.mo, today.d + j));
      if (wd !== null ? d2.getUTCDay() !== wd : Math.abs(j) > 1) continue;
      var s2 = wallToUtc(zone, d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate(), t.h, t.mi);
      var dist2 = Math.abs(s2 - now);
      if (dist2 < bestDist) { bestDist = dist2; bestStart = s2; }
    }
    return { start: bestStart, dated: false, weekday: wd !== null };
  }

  // "EPL01: Brighton 20:00 Southampton 29/11" -> "Brighton v Southampton"; strips times, dates, zones.
  function cleanTitle(seg) {
    var s = seg
      .replace(/start:.*$/i, '')
      .replace(/\/\/.*$/, '')                                   // "// UK Fri ..." tails
      .replace(/^\s*\d+\s*[|:]\s*/, '');
    var m = s.match(/^(.+?)\s+\d{1,2}[:.]\d{2}\s+(.+?)$/);       // time between two teams
    if (m && !/\s(v|vs|x|@)\s/i.test(s)) s = m[1] + ' v ' + m[2];
    return s
      .replace(/\b\d{1,2}[-\/.]\d{1,2}([-\/.]20\d\d)?\b/g, '')
      .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm)?\b|\b\d{1,2}\s*(am|pm)\b/gi, '')
      .replace(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*(\/(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*)?\b/gi, '')
      .replace(/\b\d{1,2}(st|nd|rd|th)\b/gi, '')
      .replace(/\b(UK|ET|BST|GMT|CET)\b/g, '')
      .replace(/\s+-\s*$/, '').replace(/[\s|:\-–]+$/, '').replace(/^[\s|:\-–]+/, '').replace(/\s{2,}/g, ' ').trim();
  }

  // Part of the name after the channel label: "NBA 01: X @ Y" -> "X @ Y".
  function afterLabel(name) {
    // A ":" followed by two digits is part of a time ("12:30"), not the label separator.
    var m = String(name).match(/^[^|]*?\d+\s*(?:\||:(?!\d\d))\s*(.*)$/) || String(name).match(/^[^|]+?(?:\||:(?!\d\d))\s*(.*)$/) ||
      String(name).match(/^[^-|:]*?\d+\s+-\s+(.*)$/);   // "DAZN Eventos 59 - A vs B - 12:30"
    return m ? m[1] : '';
  }

  /* Events encoded in a channel name. Returns [{ title, start, stop, dated }] (possibly empty). */
  function eventsFromName(name, sportId, now) {
    var rest = afterLabel(name);
    if (!rest || !TIME.test(rest) && !/start:/i.test(rest)) return [];
    var zone = /\bET\b/.test(rest) && !/\bUK\b/.test(rest) ? 'ET' : 'UK';
    var segs = rest.split(/\s+--\s+/);
    var out = [];
    segs.forEach(function (seg) {
      var uk = seg.split(/\/\/\s*/);
      var timePart = seg;
      for (var i = 0; i < uk.length; i++) if (/^\s*UK\b/.test(uk[i])) timePart = uk[i];
      var r = resolveStart(timePart, now, zone);
      if (!r || r.start === null) return;
      var stopM = seg.match(/stop:\s*(20\d\d)-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/i);
      var stop = stopM ? wallToUtc(zone, +stopM[1], +stopM[2] - 1, +stopM[3], +stopM[4], +stopM[5])
        : r.start + (DURATION[sportId] || DURATION.more);
      // `certain`: the day is pinned down by a date or weekday. Bare times ("15:15") repeat
      // daily in the name long after the match, so they are not trusted for "live".
      out.push({ title: cleanTitle(seg), start: r.start, stop: stop, dated: r.dated, certain: !!(r.dated || r.weekday) });
    });
    // An old year in the name ("2024 PFL Regular Season") marks the whole entry as dated.
    var yr = rest.match(/\b(20\d\d)\b/);
    if (yr && +yr[1] < new Date(now).getUTCFullYear()) out.forEach(function (e) { e.dated = true; if (e.stop > now) { e.start -= 400 * DAY; e.stop -= 400 * DAY; } });
    return out;
  }

  /* A channel whose named event is clearly over (dated and finished > 6h ago). */
  function isStale(name, now) {
    var evs = eventsFromName(name, 'more', now || Date.now());
    if (!evs.length) return false;
    return evs.every(function (e) { return e.dated && e.stop < (now || Date.now()) - 6 * HOUR; });
  }

  // ---------- scoring guide programmes ----------
  var LIVE_WORDS = /\bLIVE\b|^\s*LIVE[:\s]|\(L\)|EN DIRECT|\bDIRECTO?\b|IN DIRETTA|\bDIRETTA\b|EN VIVO|AO VIVO|\bLIVE:/i;
  var REPLAY_WORDS = /HIGHLIGHT|REPLAY|REDIFF|BEST OF|R[ÉE]SUM[ÉE]|RES[ÚU]MEN|SINTESI|CLASSIC|REPLICA|REPETICI|HIST[OÓ]RIC|ARCHIV|MAGAZINE|DOCUMENTAR|REWIND|RERUN|\bENCORE\b|\bREVIEW\b|GREATEST|FLASHBACK|\bD[ÉE]BRIEF/i;
  var STUDIO_WORDS = /\bPREVIA\b|\bPOST\b|PRE[- ]?GAME|POST[- ]?GAME|PRE[- ]?MATCH|POST[- ]?MATCH|PRE[- ]?SHOW|AVANT[- ]MATCH|APR[ÈE]S[- ]MATCH|\bSTUDIO\b|\bTALK\b|TERTULIA|\bNEWS\b|\bINFO\b|\bJOURNAL\b|\bCLUB\b|\bMAG\b|\bWEEKLY\b|\bPODCAST\b|\bQUIZ\b|\bDRAW\b|\bPRESS CONFERENCE\b|CONF[ÉE]RENCE/i;
  // French/Spanish guides announce live coverage as "Tennis : Masters 1000 de Paris".
  var EVENT_PREFIX = /^\s*(TENNIS|FOOTBALL|RUGBY|BASKET(-?BALL)?|CYCLISME|SNOOKER|GOLF|BOXE|FORMULE 1|F1|MOTOGP|HANDBALL|VOLLEY(-?BALL)?|F[ÚU]TBOL|BALONCESTO|CALCIO)\s*:/i;
  var MATCH_STRONG = /\S\s+(v|vs\.?|@|x)\s+\S/i;
  var MATCH_WEAK = /[A-Za-zÀ-ÿ]{3,}\s+[\/–-]\s+[A-Za-zÀ-ÿ]{3,}/;

  /* Is this guide programme a live event? Returns { live, reason }. */
  function scoreProgramme(title, desc, now) {
    var t = String(title || ''), d = String(desc || '');
    if (REPLAY_WORDS.test(t)) return { live: false, reason: 'replay' };
    var yr = t.match(/^\s*((19|20)\d\d)\b/);
    if (yr && +yr[1] < new Date(now || Date.now()).getUTCFullYear()) return { live: false, reason: 'archive' };
    if (STUDIO_WORDS.test(t)) return { live: false, reason: 'studio' };
    if (LIVE_WORDS.test(t)) return { live: true, reason: 'marker' };
    if (MATCH_STRONG.test(t)) return { live: true, reason: 'match' };
    if (EVENT_PREFIX.test(t)) return { live: true, reason: 'event' };
    if (MATCH_WEAK.test(t) && !REPLAY_WORDS.test(d)) return { live: true, reason: 'match' };
    if (LIVE_WORDS.test(d) && !REPLAY_WORDS.test(d)) return { live: true, reason: 'marker-desc' };
    return { live: false, reason: 'no-signal' };
  }

  // Same event on FHD/HD/SD (or with "LIVE:" prefixes) -> one key.
  function eventKey(sportId, title) {
    var k = String(title || '').toUpperCase()
      .replace(/\((EN )?DIRECTO?\)/g, ' ')
      .replace(/\bLIVE\b:?|\(L\)|EN DIRECTO?|\bDIRECTO?\b|IN DIRETTA|\bDIRETTA\b|EN VIVO|AO VIVO/g, ' ')
      .replace(/\b(FHD|UHD|HD|SD|4K|HEVC)\b/g, ' ')
      .replace(/\s(VS\.?|V|X|@|\/|-|–)\s/g, ' V ')
      .replace(/[^A-Z0-9À-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return sportId + '|' + k;
  }

  // ---------- full guide (XMLTV) ----------
  function xmlText(s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&').trim();
  }
  function xmltvTime(t, z) {
    var ms = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14) || 0);
    if (z) ms -= (z.charAt(0) === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)) * MIN;
    return ms;
  }

  /* Guide from per-channel programme lists ({id: [{start, stop, title, desc}]}), e.g. from the
   * provider's get_simple_data_table (about a week of history + a week ahead per channel).
   * Adds `firstAiring`: the earliest time each title aired on any of these channels. */
  function buildGuide(byChannel) {
    var firstAiring = {};
    Object.keys(byChannel).forEach(function (id) {
      byChannel[id].forEach(function (p) {
        var k = eventKey('', p.title);
        if (!(k in firstAiring) || p.start < firstAiring[k]) firstAiring[k] = p.start;
      });
    });
    return { byChannel: byChannel, firstAiring: firstAiring };
  }

  /* Parse an XMLTV document, keeping only channels in `wanted` ({id: true}).
   * Note: this provider's XMLTV varies in size over time and sometimes omits channels,
   * so the app uses per-channel tables (buildGuide); this stays for providers with a good XMLTV. */
  function parseGuide(xml, wanted) {
    var re = /<programme\b[^>]*?start="(\d{12,14})\s*([+-]\d{4})?"[^>]*?stop="(\d{12,14})\s*([+-]\d{4})?"[^>]*?channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
    var byChannel = {}, firstAiring = {}, m;
    while ((m = re.exec(xml))) {
      var ch = xmlText(m[5]);
      if (!wanted[ch]) continue;
      var tm = m[6].match(/<title[^>]*>([\s\S]*?)<\/title>/), dm = m[6].match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
      var p = { start: xmltvTime(m[1], m[2]), stop: xmltvTime(m[3], m[4]), title: tm ? xmlText(tm[1]) : '', desc: dm ? xmlText(dm[1]) : '' };
      (byChannel[ch] = byChannel[ch] || []).push(p);
      var k = eventKey('', p.title);
      if (!(k in firstAiring) || p.start < firstAiring[k]) firstAiring[k] = p.start;
    }
    return { byChannel: byChannel, firstAiring: firstAiring };
  }

  /* The programme on `channelId` at `now`, scored. A match that already aired earlier in the guide
   * (on any channel) is a replay. Returns { prog, live, reason } or null. */
  function nowOnGuide(guide, channelId, now) {
    var list = guide.byChannel[channelId] || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.start > now || p.stop <= now) continue;
      var sc = scoreProgramme(p.title, p.desc, now);
      if (sc.live && sc.reason === 'match' && guide.firstAiring[eventKey('', p.title)] < p.start) {
        sc = { live: false, reason: 'repeat' };
      }
      return { prog: p, live: sc.live, reason: sc.reason };
    }
    return null;
  }

  global.Live = {
    buildGuide: buildGuide,
    parseGuide: parseGuide,
    nowOnGuide: nowOnGuide,
    eventsFromName: eventsFromName,
    isStale: isStale,
    scoreProgramme: scoreProgramme,
    eventKey: eventKey,
    cleanTitle: cleanTitle,
    _wallToUtc: wallToUtc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
