import './node-shim.mjs';
import { SEED, SEED_COUNTS } from '../js/seed.js';
import { update, itemRating, levelFor, scoreParse } from '../js/rating.js';
import { findSpan, validateParse } from '../js/gen.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const want = SEED_COUNTS.parse + SEED_COUNTS.function + SEED_COUNTS.read;
ok(SEED.length === want, `seeds validated ${SEED.length}/${want}`);
for (const i of SEED) {
  if (i.type === 'parse') {
    ok(i.segments, `${i.id} segments cover sentence`);
    ok(i.tasks.length === 3, `${i.id} has 3 tasks (${i.tasks.length})`);
    for (const t of i.tasks) if (t.kind === 'tap') ok(findSpan(i.sentence, t.answer), `${i.id} tap ${t.answer}`);
  }
  if (i.type === 'function') ok(i.signals.length >= 3, `${i.id} signals ${i.signals.length}`);
  if (i.type === 'read') ok(i.questions.length === 4 && i.words > 200, `${i.id} q=${i.questions.length} words=${i.words}`);
}
// "or" must not match inside "detector"
const p2 = SEED.find(i => i.id === 'seed_p02');
const [s] = findSpan(p2.sentence, 'or');
ok(p2.sentence.slice(s - 10, s + 12).includes('radiation or that'), 'or word-boundary');
// glicko sanity
let r = { r: 1450, rd: 350, vol: 0.06 };
const a = update(r, itemRating(3), 1); ok(a.r > r.r, 'win raises');
const b = update(r, itemRating(3), 0); ok(b.r < r.r, 'loss lowers');
let x = r; for (let k = 0; k < 40; k++) x = update(x, itemRating(5), 0.8);
ok(x.r > 1700 && x.rd >= 60, `converges toward strong perf ${x.r.toFixed(0)} rd ${x.rd.toFixed(0)}`);
ok(levelFor(1450) === 3 && levelFor(2100) === 7 && levelFor(900) === 1, 'levelFor');
ok(Math.abs(scoreParse(3, 3, 1000, 3).score - 1) < 1e-9, 'fast perfect parse = 1');
ok(validateParse({ sentence: 'x '.repeat(20), tasks: [] }) === null, 'reject empty tasks');
console.log(fail ? `${fail} failures` : `all unit checks passed (${SEED.length} seeds; rating after 40 strong L5 games: ${x.r.toFixed(0)})`);
process.exit(fail ? 1 : 0);
