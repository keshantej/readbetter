import './node-shim.mjs';
globalThis.indexedDB = { open() { throw new Error('no idb'); } };
const store = await import('../js/store.js');
await store.load();
const { record, voidAttempt } = await import('../js/engine.js');
const S = store.S;
const item = { id: 'x1', type: 'parse', level: 1, tags: ['proviso'], tasks: [1, 2, 3] };
S().ratings.parse = { r: 1286, rd: 120, vol: 0.06, n: 10 };
const res = record({ item, skill: 'parse', score: 0.31, acc: 1 / 3, ms: 9000, units: 3, mode: 'quick' });
console.log('after record', Math.round(S().ratings.parse.r), 'delta', res.delta.toFixed(1));
const undo = voidAttempt(res.attemptId);
const ok = Math.round(S().ratings.parse.r) === 1286; console.log('after void', Math.round(S().ratings.parse.r), ok ? 'OK (restored)' : 'FAIL'); if (!ok) process.exit(1);
// later-attempt path: void an earlier attempt after another rated one
S().ratings.parse = { r: 1500, rd: 120, vol: 0.06, n: 10 };
const a1 = record({ item: { ...item, id: 'y1' }, skill: 'parse', score: 0.2, acc: 0.33, ms: 9000, units: 3 });
const mid = S().ratings.parse.r;
await new Promise(r => setTimeout(r, 5));
const a2 = record({ item: { ...item, id: 'y2' }, skill: 'parse', score: 1, acc: 1, ms: 9000, units: 3 });
const end = S().ratings.parse.r;
voidAttempt(a1.attemptId);
const want = end - a1.delta;
console.log('later path:', Math.round(S().ratings.parse.r), 'expected', Math.round(want));
if (Math.abs(S().ratings.parse.r - want) > 0.01) { console.log('FAIL'); process.exit(1); }
