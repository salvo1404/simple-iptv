// Run: node tests/storage.test.js — Store with a fake Tizen file system (data must survive a "reinstall").
const assert = require('assert');
const files = {};                       // shared storage: survives reinstalls
let local = {};                         // localStorage: wiped by a reinstall
global.localStorage = {
  get length() { return Object.keys(local).length; },
  key: (i) => Object.keys(local)[i], getItem: (k) => (k in local ? local[k] : null),
  setItem: (k, v) => { local[k] = String(v); }, removeItem: (k) => { delete local[k]; },
};
global.tizen = { filesystem: { openFile(path, mode) {
  if (mode === 'r' && !(path in files)) throw new Error('NotFoundError');
  let buf = mode === 'r' ? files[path] : '';
  return { readString: () => buf, writeString: (t) => { buf += t; }, close: () => { if (mode === 'w') files[path] = buf; } };
} } };
const load = () => { delete require.cache[require.resolve('../app/js/storage.js')]; global.window = global; require('../app/js/storage.js'); return global.Store; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let n = 0; const t = (l) => { n++; console.log('  ✓ ' + l); };
  // existing localStorage data (from before this change) is migrated into the file
  local['simple-iptv.favourites'] = JSON.stringify([{ stream_id: 1 }]);
  let S = load(); await S.init();
  assert.deepStrictEqual(S.get('favourites'), [{ stream_id: 1 }]); assert.ok(files['documents/simple-iptv-data.json']); t('migrates old localStorage into the TV file');
  S.set('health', { 42: { ok: false } }); S.flush(); await wait(5);
  assert.deepStrictEqual(JSON.parse(files['documents/simple-iptv-data.json']).health, { 42: { ok: false } }); t('writes changes to the file');
  // "reinstall": app data (localStorage) wiped, shared file kept
  local = {};
  S = load(); await S.init();
  assert.deepStrictEqual(S.get('health'), { 42: { ok: false } }); assert.deepStrictEqual(S.get('favourites'), [{ stream_id: 1 }]); t('data survives a reinstall that wipes localStorage');
  assert.ok(local['simple-iptv.health']); t('local copy is restored from the file');
  assert.strictEqual(S.where(), 'TV storage · documents'); t('reports where data lives');
  // documents not writable -> falls back to downloads
  for (const k in files) delete files[k]; local = {};
  const real = global.tizen.filesystem.openFile;
  global.tizen.filesystem.openFile = (p, m) => { if (p.startsWith('documents/')) throw new Error('SecurityError'); return real(p, m); };
  S = load(); await S.init(); assert.strictEqual(S.where(), 'TV storage · downloads'); t('falls back to Downloads');
  console.log(`\n${n} checks passed`);
})();
