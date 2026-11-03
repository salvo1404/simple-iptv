// Run: node tests/retry.test.js — provider requests retry through temporary 5xx errors.
const assert = require('assert');
global.window = global; global.location = { protocol: 'file:' };
let calls = 0, script = [];
global.fetch = () => { calls++; const s = script.shift(); return s === 'err' ? Promise.reject(new Error('net')) : Promise.resolve({ status: s, ok: s === 200 }); };
require('../app/js/api.js');
const { fetchRetry } = globalThis.Api;
(async () => {
  script = [502, 502, 200]; calls = 0;
  assert.strictEqual((await fetchRetry('x')).status, 200); assert.strictEqual(calls, 3); console.log('  ✓ recovers after two 502s');
  script = ['err', 503, 200]; calls = 0;
  assert.strictEqual((await fetchRetry('x')).status, 200); console.log('  ✓ recovers from network error + 503');
  script = [404]; calls = 0;
  assert.strictEqual((await fetchRetry('x')).status, 404); assert.strictEqual(calls, 1); console.log('  ✓ does not retry a real 404');
  script = [502, 502, 502, 502, 502]; calls = 0;
  assert.strictEqual((await fetchRetry('x')).status, 502); assert.strictEqual(calls, 5); console.log('  ✓ gives up after 5 tries');
  console.log('\n4 checks passed');
})();
