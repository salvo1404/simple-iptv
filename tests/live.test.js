// Run: node tests/live.test.js — checks live detection against real channel names / guide titles.
const assert = require('assert');
require('../app/js/live.js');
const { eventsFromName, isStale, scoreProgramme, eventKey } = globalThis.Live;

const at = (iso) => Date.parse(iso);
const liveAt = (name, sport, iso) => eventsFromName(name, sport, at(iso)).filter((e) => e.start - 10 * 60e3 <= at(iso) && e.stop > at(iso));
let n = 0;
const t = (label, fn) => { fn(); n++; console.log('  ✓ ' + label); };

console.log('Event names');
t('bare UK time, live during the match (GMT)', () => {
  const l = liveAt('Rugby Events 06 | Zebre v Dragons 15:15', 'rugby', '2026-11-01T15:30:00Z');
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].title, 'Zebre v Dragons');
});
t('bare UK time, not live hours later, and not stale (repeats daily)', () => {
  assert.strictEqual(liveAt('Rugby Events 06 | Zebre v Dragons 15:15', 'rugby', '2026-11-02T22:00:00Z').length, 0);
  assert.strictEqual(isStale('Rugby Events 06 | Zebre v Dragons 15:15', at('2026-11-02T22:00:00Z')), false);
});
t('British Summer Time: 15:00 UK = 14:00 UTC in August', () => {
  assert.strictEqual(liveAt('Champ01: 15:00 Airdrieonians vs Dunfermline Athletic', 'football', '2026-08-15T14:30:00Z').length, 1);
  assert.strictEqual(liveAt('Champ01: 15:00 Airdrieonians vs Dunfermline Athletic', 'football', '2026-08-15T13:00:00Z').length, 0);
});
t('several matches in one name; only the one in progress is live', () => {
  const name = 'Rugby Events 01 | Lyon v Connacht 13:00 -- Toulon v Munster 15:15 -- Ulster v Toulouse 20:00';
  assert.strictEqual(eventsFromName(name, 'rugby', at('2026-11-01T16:00:00Z')).length, 3);
  const l = liveAt(name, 'rugby', '2026-11-01T16:00:00Z');
  assert.deepStrictEqual(l.map((e) => e.title), ['Toulon v Munster']);
});
t('NBA "UK Fri 12/04 11:50pm" is April 2024 (weekday picks the year) → stale', () => {
  const name = 'NBA 01: Wizards (WAS) @ Bulls (CHI) // UK Fri 12/04 11:50pm // ET Fri 12/04 6:50pm';
  assert.strictEqual(isStale(name, at('2026-11-02T22:00:00Z')), true);
  assert.strictEqual(eventsFromName(name, 'basketball', at('2026-11-02T22:00:00Z'))[0].title, 'Wizards (WAS) @ Bulls (CHI)');
});
t('EPL "Brighton 20:00 Southampton 29/11" weeks ahead → last year\'s → stale; title rebuilt', () => {
  const name = 'EPL01: Brighton 20:00 Southampton 29/11';
  assert.strictEqual(isStale(name, at('2026-11-02T22:00:00Z')), true);
  assert.strictEqual(eventsFromName(name, 'football', at('2026-11-02T22:00:00Z'))[0].title, 'Brighton v Southampton');
});
t('EPL dated this week, live at kick-off', () => {
  assert.strictEqual(liveAt('EPL01: Brighton 20:00 Southampton 04/11', 'football', '2026-11-04T20:30:00Z').length, 1);
  assert.strictEqual(isStale('EPL01: Brighton 20:00 Southampton 04/11', at('2026-11-04T20:30:00Z')), false);
});
t('explicit start:/stop: — old one stale, current one live', () => {
  assert.strictEqual(isStale('MLB 2 | Angels x Rangers start:2025-04-18 01:05:00 stop:2025-04-18 08:18:20', at('2026-11-02T22:00:00Z')), true);
  assert.strictEqual(liveAt('MLB 01 |  Brewers x Rays start:2026-10-28 00:00:00 stop:2026-10-28 07:13:20', 'baseball', '2026-10-28T03:00:00Z').length, 1);
});
t('"Sat 30th 6:30PM" resolves to a past Saturday the 30th → stale', () => {
  assert.strictEqual(isStale('NI FL 00 | Dungannon Swifts FC vs Ballymena United FC Sat 30th 6:30PM', at('2026-11-02T22:00:00Z')), true);
});
t('old year in the title → stale', () => {
  assert.strictEqual(isStale('EVENTS 01: 2024 PFL Regular Season: Light Heavyweights & Lightweights 23:30', at('2026-11-02T22:00:00Z')), true);
});
t('weekday-only time is not stale and is live on that day', () => {
  const name = 'PPV Events 05: UFC Yan vs Figueiredo Prelims 08:00 SAT';
  assert.strictEqual(isStale(name, at('2026-11-02T22:00:00Z')), false);
  assert.strictEqual(liveAt(name, 'fight', '2026-11-07T09:00:00Z').length, 1);   // Saturday
  assert.strictEqual(liveAt(name, 'fight', '2026-11-05T09:00:00Z').length, 0);   // Thursday
});
t('" - " separated name (DAZN Eventos)', () => {
  const e = eventsFromName('DAZN Eventos 59 - Vilnius Rytas vs NBA G League United - 12:30', 'basketball', at('2026-11-02T12:45:00Z'));
  assert.strictEqual(e.length, 1); assert.strictEqual(e[0].title, 'Vilnius Rytas vs NBA G League United');
});
t('regular channels have no named events and are never stale', () => {
  for (const nm of ['|GB| EUROSPORT 1 FHD', 'ESPN+ Soccer 8', 'Amazon UK Event 6', 'Sky Sports Main Event FHD']) {
    assert.strictEqual(eventsFromName(nm, 'more', at('2026-11-02T22:00:00Z')).length, 0, nm);
    assert.strictEqual(isStale(nm, at('2026-11-02T22:00:00Z')), false, nm);
  }
});

console.log('Guide programmes');
const live = (title, desc) => scoreProgramme(title, desc || '', at('2026-11-02T22:00:00Z')).live;
t('live markers', () => {
  assert.ok(live('(EN DIRECTO) RC Deportivo - CA Osasuna - LALIGA EA SPORTS'));
  assert.ok(live('Live Premier League: Arsenal v Chelsea'));
});
t('matches', () => {
  assert.ok(live('Football : Bundesliga | Bayern Munich / Borussia Dortmund'));
  assert.ok(live('NFL: Commanders @ Eagles'));
  assert.ok(live('UFC 333: Volkanovski vs Evloev T2026 · Main Card'));
});
t('French "Sport : competition" coverage', () => { assert.ok(live('Tennis : Masters 1000 de Paris')); });
t('replays, highlights, archive', () => {
  assert.ok(!live('Athletic Club - Real Sociedad - Resúmenes LALIGA EA Sports'));
  assert.ok(!live('2001 Ronald "Winky" Wright vs Robert Frazier - ESPN Combates históricos'));
  assert.ok(!live('Premier League Highlights'));
  assert.ok(!live('1999 Micky Ward vs Jermal Corbin'));
});
t('pre/post-match and studio shows', () => {
  assert.ok(!live('(EN DIRECTO) RC Deportivo - CA Osasuna - La Casa del Fútbol Previa'));
  assert.ok(!live('(EN DIRECTO) Elche CF - Valencia CF - La Casa del Fútbol Post'));
  assert.ok(!live('Club 360'));
});
t('no signal', () => {
  assert.ok(!live('beIN SPORTS, le plus grand des spectacles'));
  assert.ok(!live('A bientôt sur Eurosport 360'));
});
t('FHD/HD/SD copies and LIVE prefixes collapse to one event', () => {
  assert.strictEqual(eventKey('football', 'LIVE: Arsenal v Chelsea'), eventKey('football', 'Arsenal vs Chelsea'));
  assert.strictEqual(eventKey('football', '(EN DIRECTO) RC Deportivo - CA Osasuna'), eventKey('football', 'RC Deportivo - CA Osasuna'));
});


console.log('Full guide');
const { parseGuide, nowOnGuide } = globalThis.Live;
const xml = `<?xml version="1.0"?><tv>
<programme start="20261101201300 +0000" stop="20261101220000 +0000" channel="CanalPlusPremierLeague.fr"><title>Liverpool / Arsenal</title><desc>x</desc></programme>
<programme start="20261102181200 +0000" stop="20261102195400 +0000" channel="CanalPlusPremierLeague.fr"><title>Liverpool / Arsenal</title><desc>Les Reds…</desc></programme>
<programme start="20261102173000 +0000" stop="20261102193500 +0000" channel="DAZN.fr"><title>Levante / Atlético Madrid</title><desc>Diffusion d&apos;un match de LaLiga</desc></programme>
<programme start="20261103080000 +0000" stop="20261103100000 +0000" channel="DAZN.fr"><title>Levante / Atlético Madrid</title><desc>…</desc></programme>
<programme start="20261102170000 +0000" stop="20261102200000 +0000" channel="Eurosport1.fr"><title>Tennis : Masters 1000 de Paris</title><desc></desc></programme>
<programme start="20261102100000 +0000" stop="20261102160000 +0000" channel="Eurosport1.fr"><title>Tennis : Masters 1000 de Paris</title><desc></desc></programme>
<programme start="20261102180000 +0000" stop="20261102200000 +0000" channel="Ignored.fr"><title>A v B</title><desc></desc></programme>
</tv>`;
const g = parseGuide(xml, { 'CanalPlusPremierLeague.fr': true, 'DAZN.fr': true, 'Eurosport1.fr': true });
const nowG = at('2026-11-02T18:48:00Z');
t('only wanted channels are kept', () => { assert.strictEqual(Object.keys(g.byChannel).length, 3); });
t('a match that already aired earlier is a replay', () => {
  const r = nowOnGuide(g, 'CanalPlusPremierLeague.fr', nowG); assert.strictEqual(r.live, false); assert.strictEqual(r.reason, 'repeat');
});
t('first airing of a match is live (a later repeat doesn\'t matter)', () => {
  const r = nowOnGuide(g, 'DAZN.fr', nowG); assert.strictEqual(r.live, true);
});
t('generic competition titles are not treated as repeats', () => {
  assert.strictEqual(nowOnGuide(g, 'Eurosport1.fr', nowG).live, true);
});
t('bare-time names are not "certain"; dated/weekday names are', () => {
  assert.strictEqual(eventsFromName('Rugby Events 06 | Zebre v Dragons 15:15', 'rugby', nowG)[0].certain, false);
  assert.strictEqual(eventsFromName('PPV Events 05: UFC Yan vs Figueiredo Prelims 08:00 SAT', 'fight', nowG)[0].certain, true);
  assert.strictEqual(eventsFromName('EPL01: Brighton 20:00 Southampton 04/11', 'football', nowG)[0].certain, true);
});

console.log('Per-channel guide tables (real data, Mon 2 Nov 18:50 UTC)');
const { buildGuide } = globalThis.Live;
const P = (s, e, title) => ({ start: at(s), stop: at(e), title, desc: '' });
const g2 = buildGuide({
  'DAZN.fr': [P('2026-10-31T12:55:00Z', '2026-10-31T15:00:00Z', 'Levante / Atlético Madrid'), P('2026-11-02T17:30:00Z', '2026-11-02T19:35:00Z', 'Levante / Atlético Madrid')],
  'CanalPlusPremierLeague.fr': [P('2026-11-01T16:30:00Z', '2026-11-01T18:30:00Z', 'Liverpool / Arsenal'), P('2026-11-02T18:12:00Z', '2026-11-02T19:54:00Z', 'Liverpool / Arsenal')],
  'Eurosport1.fr': [P('2026-11-02T14:00:00Z', '2026-11-02T16:00:00Z', 'Tennis : Masters 1000 de Paris'), P('2026-11-02T18:00:00Z', '2026-11-02T20:00:00Z', 'Tennis : Masters 1000 de Paris')],
});
t('Levante / Atlético aired Saturday → Monday airing is a replay', () => { assert.strictEqual(nowOnGuide(g2, 'DAZN.fr', nowG).reason, 'repeat'); });
t('Liverpool / Arsenal live on Sunday was live then', () => { assert.strictEqual(nowOnGuide(g2, 'CanalPlusPremierLeague.fr', at('2026-11-01T17:00:00Z')).live, true); });
t('Tennis sessions stay live', () => { assert.strictEqual(nowOnGuide(g2, 'Eurosport1.fr', nowG).live, true); });
console.log(`\n${n} checks passed`);
