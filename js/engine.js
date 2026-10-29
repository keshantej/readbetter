// Item bank, adaptive selection, background refill, and result recording.

import { S, bank, setBank, save, addAttempt, attempts, today, uid } from './store.js';
import { update, itemRating, pickLevel, levelFor } from './rating.js';
import { TAG_KEYS } from './taxonomy.js';
import { hasKey } from './claude.js';
import { generateParse, generateFunction, generateRead } from './gen.js';
import { SEED } from './seed.js';

const SKILL_OF = { parse: 'parse', function: 'function', read: 'read' };

export function mergeSeeds() {
  const have = new Set(bank().map(i => i.id));
  const add = SEED.filter(i => !have.has(i.id));
  if (add.length) setBank([...bank(), ...add]);
}

// ---------- weakness model ----------

// Bayesian accuracy per structure tag; unseen tags sit at a neutral prior.
export function tagAccuracy(tag) {
  const t = S().tags[tag] || { n: 0, c: 0 };
  return (t.c + 1.4) / (t.n + 2);
}

export function weakTags(k = 3) {
  return [...TAG_KEYS].sort((a, b) => tagAccuracy(a) - tagAccuracy(b)).slice(0, k);
}

// Sample tags for generation: two weighted toward weakness, one random for coverage.
export function sampleTags() {
  const w = TAG_KEYS.map(t => Math.pow(1.15 - tagAccuracy(t), 2));
  const pick = () => {
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return TAG_KEYS[i]; }
    return TAG_KEYS[0];
  };
  const set = new Set([pick(), pick(), TAG_KEYS[Math.floor(Math.random() * TAG_KEYS.length)]]);
  return [...set];
}

// ---------- selection ----------

export const targetLevel = type => levelFor(S().ratings[SKILL_OF[type]].r);

function eligible(i, type, { easy, benchmark, packId }) {
  if (i.type !== type) return false;
  if (packId) return i.packId === packId;
  if (i.packId) return false;
  if (type === 'read') {
    if (!!i.benchmark !== !!benchmark) return false;
    if (!benchmark && !!i.easy !== !!easy) return false;
  }
  return true;
}

export function pickItem(type, opts = {}) {
  const { level = pickLevel(S().ratings[SKILL_OF[type]].r), exclude = [] } = opts;
  const pool = bank().filter(i => eligible(i, type, opts) && !exclude.includes(i.id));
  if (opts.packId) {
    const fresh = pool.filter(i => !S().seen[i.id]);
    return (fresh.length ? fresh : pool).sort((a, b) => (S().seen[a.id] || 0) - (S().seen[b.id] || 0))[0] || null;
  }
  const fresh = pool.filter(i => !S().seen[i.id]);
  const weight = i => {
    const dl = Math.abs(i.level - level);
    if (!opts.easy && !opts.benchmark && dl > 1) return 0;
    const lv = opts.easy || opts.benchmark ? 1 : dl === 0 ? 3 : 1;
    const weak = (i.tags || []).reduce((a, t) => a + (1 - tagAccuracy(t)), 0);
    return lv * (1 + 2 * weak) * (i.source === 'seed' ? 0.6 : 1);
  };
  const scored = fresh.map(i => [i, weight(i)]).filter(([, w]) => w > 0);
  if (scored.length) {
    let x = Math.random() * scored.reduce((a, [, w]) => a + w, 0);
    for (const [i, w] of scored) { x -= w; if (x <= 0) return i; }
    return scored[0][0];
  }
  return null;
}

// Least-recently-seen fallback when nothing fresh fits (offline, no key).
export function pickStale(type, opts = {}) {
  const pool = bank().filter(i => eligible(i, type, opts));
  if (!pool.length) return null;
  const level = targetLevel(type);
  return pool.sort((a, b) =>
    (Math.abs(a.level - level) > 1) - (Math.abs(b.level - level) > 1) ||
    (S().seen[a.id] || 0) - (S().seen[b.id] || 0))[0];
}

export function inventory() {
  const fresh = bank().filter(i => !S().seen[i.id] && !i.packId);
  const count = (type, f = () => true) => fresh.filter(i => i.type === type && f(i)).length;
  const near = type => i => Math.abs(i.level - targetLevel(type)) <= 1;
  return {
    parse: count('parse', near('parse')),
    function: count('function', near('function')),
    read: count('read', i => !i.easy && !i.benchmark && near('read')(i)),
    easy: count('read', i => i.easy),
    benchmark: count('read', i => i.benchmark),
    total: fresh.length,
  };
}

// ---------- generation ----------

let refilling = null;
let cooldownUntil = 0;
const listeners = new Set();
export const onBankChange = fn => (listeners.add(fn), () => listeners.delete(fn));
const notify = () => listeners.forEach(fn => { try { fn(); } catch {} });
export const isRefilling = () => !!refilling;

function addItems(items) {
  if (!items.length) return;
  setBank([...bank(), ...items]);
  notify();
}

export async function generateOne(type, opts = {}) {
  const tags = sampleTags();
  if (type === 'parse') {
    const items = await generateParse({ level: opts.level ?? targetLevel('parse'), tags, n: 4 });
    addItems(items);
    return items[0] || null;
  }
  if (type === 'function') {
    const items = await generateFunction({ level: opts.level ?? targetLevel('function'), tags, n: 4 });
    addItems(items);
    return items[0] || null;
  }
  const level = opts.benchmark ? 4 : opts.easy ? Math.max(1, Math.min(3, targetLevel('read') - 2)) : (opts.level ?? targetLevel('read'));
  const item = await generateRead({ level, tags, easy: !!opts.easy, benchmark: !!opts.benchmark });
  if (item) addItems([item]);
  return item;
}

// Get an item now: fresh from bank, else generate, else stale fallback.
export async function obtain(type, opts = {}) {
  let item = pickItem(type, opts);
  if (item) return { item };
  if (!opts.packId && hasKey() && navigator.onLine) {
    try {
      item = await generateOne(type, opts);
      if (item) return { item };
    } catch (e) {
      const stale = pickStale(type, opts);
      if (stale) return { item: stale, warning: e.message };
      throw e;
    }
  }
  item = pickStale(type, opts);
  if (item) return { item, repeat: true };
  throw new Error(hasKey() ? 'Could not get an item. Try again.' : 'Out of fresh material. Add your API key in Settings to generate more.');
}

export function benchmarkDue() {
  return Date.now() - (S().lastBenchmark || 0) > 6 * 864e5;
}

// Keep a small stock of fresh items so sessions start instantly.
export function refill() {
  if (refilling || !hasKey() || !navigator.onLine || Date.now() < cooldownUntil) return refilling;
  refilling = (async () => {
    const plan = [];
    const inv = inventory();
    const before = inv.total;
    if (inv.parse < 8) plan.push(['parse']);
    if (inv.function < 6) plan.push(['function']);
    if (inv.read < 2) plan.push(['read']);
    if (inv.parse < 4) plan.push(['parse']);
    if (S().settings.pacerWarmup && inv.easy < 1) plan.push(['read', { easy: true }]);
    if (benchmarkDue() && inv.benchmark < 1) plan.push(['read', { benchmark: true }]);
    // Two workers in parallel: generation with thinking takes 20–60 s per call.
    let stop = false;
    const worker = async () => {
      while (!stop && plan.length) {
        const [type, opts] = plan.shift();
        try { await generateOne(type, opts || {}); }
        catch (e) {
          console.warn('refill failed', type, e.message);
          // Systematic failures (bad key, bad request, billing, offline) won't fix themselves on retry.
          if ([0, 400, 401, 403, 404].includes(e.status) || e.kind === 'nokey') stop = true;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    // If a run produced nothing usable, back off instead of burning calls.
    if (plan.length && inventory().total <= before) cooldownUntil = Date.now() + 10 * 60e3;
  })().finally(() => { refilling = null; notify(); });
  return refilling;
}

// ---------- recording ----------

export function record(r) {
  const st = S();
  const { item, mode = 'quick' } = r;
  const rated = ['parse', 'function', 'read'].includes(r.skill) && !['pacer', 'rsvp', 'review'].includes(mode);
  const now = Date.now();
  let delta = 0;
  let prev = null;
  if (rated) {
    const before = st.ratings[r.skill];
    prev = { ...before };
    const after = update(before, itemRating(item.level), r.score);
    delta = after.r - before.r;
    st.ratings[r.skill] = after;
    st.ratingHistory.push({ t: now, s: r.skill, r: Math.round(after.r), rd: Math.round(after.rd) });
  }
  if (mode !== 'review') for (const tag of item.tags || []) {
    const t = st.tags[tag] || (st.tags[tag] = { n: 0, c: 0 });
    t.n += 1; t.c += r.acc;
  }
  for (const q of r.qResults || []) {
    const t = st.qtypes[q.kind] || (st.qtypes[q.kind] = { n: 0, c: 0 });
    t.n += 1; t.c += q.ok ? 1 : 0;
  }
  const d = st.days[today()] || (st.days[today()] = { ms: 0, items: 0 });
  d.ms += Math.min(r.ms || 0, 15 * 60e3); d.items += 1;
  st.seen[item.id] = Date.now();
  if (r.acc < 0.67 && !st.missed.includes(item.id)) st.missed.unshift(item.id);
  st.missed = st.missed.slice(0, 80);
  if (mode === 'benchmark') st.lastBenchmark = Date.now();

  const attemptId = uid('a');
  addAttempt({
    id: attemptId, t: now, item: item.id, type: item.type, mode, level: item.level,
    domain: item.domain, tags: item.tags, score: +r.score.toFixed(3), acc: +r.acc.toFixed(3),
    ms: Math.round(r.ms || 0), wpm: r.wpm ? Math.round(r.wpm) : undefined,
    comp: r.comp != null ? +r.comp.toFixed(3) : undefined, err: r.err ? Math.round(r.err) : undefined,
    gist: r.gist, units: r.units, rated, skill: r.skill, prev, delta: rated ? +delta.toFixed(3) : 0,
    qkinds: (r.qResults || []).map(q => [q.kind, q.ok ? 1 : 0]),
  });
  prune();
  save('state');
  return { delta, rating: rated ? st.ratings[r.skill] : null, attemptId };
}

// Undo an attempt whose item was found flawed: restore the rating, back out tag and
// question-type stats, drop the item, and mark the attempt void so charts skip it.
export function voidAttempt(attemptId) {
  const st = S();
  const a = attempts().find(x => x.id === attemptId);
  if (!a || a.voided) return null;
  a.voided = true;
  let restored = null;
  if (a.rated && a.prev) {
    const hist = st.ratingHistory;
    const idx = hist.findIndex(e => e.t === a.t && e.s === a.skill);
    const later = attempts().some(x => x.t > a.t && x.rated && !x.voided && x.skill === a.skill);
    // Nothing rated in this skill since: restore exactly. Otherwise back out just this delta.
    if (!later) st.ratings[a.skill] = { ...a.prev };
    else st.ratings[a.skill].r -= a.delta || 0;
    if (idx >= 0) hist.splice(idx, 1);
    restored = Math.round(st.ratings[a.skill].r);
  }
  if (a.mode !== 'review') for (const tag of a.tags || []) {
    const t = st.tags[tag];
    if (t) { t.n = Math.max(0, t.n - 1); t.c = Math.max(0, +(t.c - a.acc).toFixed(6)); }
  }
  for (const [kind, ok] of a.qkinds || []) {
    const t = st.qtypes[kind];
    if (t) { t.n = Math.max(0, t.n - 1); t.c = Math.max(0, t.c - ok); }
  }
  st.missed = st.missed.filter(id => id !== a.item);
  st.flagged = [...(st.flagged || []), a.item].slice(-200);
  setBank(bank().filter(i => i.id !== a.item));
  for (const p of st.packs) p.itemIds = p.itemIds.filter(id => id !== a.item);
  save('state', 'attempts');
  return { restored, skill: a.skill };
}

// Drop served AI items from the bank unless they're worth reviewing or belong to a pack.
function prune() {
  const st = S();
  const keep = new Set(st.missed);
  const before = bank().length;
  const next = bank().filter(i => i.source === 'seed' || i.packId || !st.seen[i.id] || keep.has(i.id));
  if (next.length !== before) setBank(next);
}

export function streak() {
  const days = S().days;
  let n = 0;
  const d = new Date();
  if (!days[today(d)]) d.setDate(d.getDate() - 1);
  while (days[today(d)]?.items) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function composite() {
  const r = S().ratings;
  return Math.round((r.parse.r + r.function.r + r.read.r * 2) / 4);
}
