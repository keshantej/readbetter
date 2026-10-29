// Daily session composer and runners (session, quick loop, pack, review).

import { h, clear, fmtTime, signed, pct } from './ui.js';
import { S, save, bank, uid, today } from './store.js';
import { runStep, LABELS } from './runner.js';
import { benchmarkDue, refill, streak } from './engine.js';

// Fixed recipes per length. Short bursts that each stand alone; reading comes last, after you're warm.
const RECIPES = {
  5:  { parse: 3, function: 3, read: false, pacer: false },
  8:  { parse: 3, function: 2, read: true,  pacer: false },
  12: { parse: 4, function: 3, read: true,  pacer: true },
  15: { parse: 6, function: 4, read: true,  pacer: true },
};

export function planSession(minutes = S().settings.sessionMinutes) {
  const r = RECIPES[minutes] || RECIPES[8];
  const steps = [];
  if (r.pacer && S().settings.pacerWarmup) steps.push({ type: 'read', mode: 'pacer', opts: { easy: true } });
  let p = r.parse, f = r.function;
  while (p || f) {
    if (p) { steps.push({ type: 'parse', mode: 'session' }); p--; }
    if (p && Math.random() < 0.5) { steps.push({ type: 'parse', mode: 'session' }); p--; }
    if (f) { steps.push({ type: 'function', mode: 'session' }); f--; }
  }
  if (r.read) steps.push(benchmarkDue() ? { type: 'read', mode: 'benchmark', opts: { benchmark: true } } : { type: 'read', mode: 'session' });
  return steps;
}

export function startSession() {
  const st = S();
  st.session = { id: uid('s'), date: today(), startedAt: Date.now(), idx: 0, steps: planSession(), results: [], ratingsAtStart: snapshot() };
  save('state');
}

const snapshot = () => Object.fromEntries(Object.entries(S().ratings).map(([k, v]) => [k, Math.round(v.r)]));

export function sessionInProgress() {
  const ss = S().session;
  if (!ss) return null;
  if (Date.now() - ss.startedAt > 20 * 3600e3 || ss.idx >= ss.steps.length) { S().session = null; save('state'); return null; }
  return ss;
}

export function runSession(host, nav) {
  const ss = sessionInProgress();
  if (!ss) return nav('#/');
  const step = ss.steps[ss.idx];
  runStep(host, {
    type: step.type, mode: step.mode, opts: step.opts || {},
    progress: { index: ss.idx, total: ss.steps.length },
    nextLabel: ss.idx === ss.steps.length - 1 ? 'Finish' : 'Next',
    onExit: () => nav('#/'),
    onNext: r => {
      ss.results.push({ type: step.type, mode: step.mode, acc: r.acc, ms: r.ms, err: r.err, wpm: r.wpm });
      ss.idx++;
      save('state');
      if (ss.idx >= ss.steps.length) summary(host, ss, nav);
      else runSession(host, nav);
      refill();
    },
  });
}

function summary(host, ss, nav) {
  S().session = null;
  save('state');
  const now = snapshot();
  const ms = ss.results.reduce((a, r) => a + (r.ms || 0), 0);
  const acc = ss.results.reduce((a, r) => a + r.acc, 0) / Math.max(1, ss.results.length);
  const read = ss.results.find(r => r.err);
  clear(host).append(h('div.page.summary', {},
    h('p.cap', {}, 'Session complete'),
    h('h1.hero', {}, `${streak()}`, h('small', {}, streak() === 1 ? ' day streak' : ' day streak')),
    h('div.stats-row', {},
      stat('Items', ss.results.length), stat('Accuracy', pct(acc)), stat('Active time', fmtTime(ms)),
      read ? stat('Effective rate', `${Math.round(read.err)} wpm`) : null),
    h('div.card', {}, h('h3', {}, 'Ratings'),
      ['parse', 'function', 'read'].map(k => {
        const d = now[k] - ss.ratingsAtStart[k];
        return h('div.kv', {}, h('span', {}, { parse: 'Parse', function: 'Function', read: 'Reading' }[k]),
          h('b', {}, now[k], ' ', h('small.' + (d >= 0 ? 'up' : 'down'), {}, signed(d))));
      })),
    h('button.btn.primary.wide', { onclick: () => nav('#/') }, 'Done')));
}

const stat = (label, v) => h('div.stat', {}, h('span.cap', {}, label), h('b', {}, v));

// Endless loop of one drill type until you exit.
export function runQuick(host, nav, type, mode = 'quick', opts = {}) {
  let n = 0;
  const go = () => runStep(host, {
    type, mode, opts,
    onExit: () => { refill(); nav('#/'); },
    onNext: () => { n++; if (n % 3 === 0) refill(); go(); },
  });
  go();
}

export function runPack(host, nav, packId) {
  const pack = S().packs.find(p => p.id === packId);
  if (!pack) return nav('#/library');
  const items = pack.itemIds.map(id => bank().find(i => i.id === id)).filter(Boolean);
  const order = [...items.filter(i => i.type === 'parse'), ...items.filter(i => i.type === 'function'), ...items.filter(i => i.type === 'read')];
  let i = 0;
  const go = () => {
    if (i >= order.length) { pack.lastRun = Date.now(); save('state'); return nav(`#/pack/${packId}`); }
    const item = order[i];
    runStep(host, {
      type: item.type, mode: 'pack', item,
      progress: { index: i, total: order.length },
      nextLabel: i === order.length - 1 ? 'Finish' : 'Next',
      onExit: () => nav(`#/pack/${packId}`),
      onNext: () => { i++; go(); },
    });
  };
  go();
}

export function runReview(host, nav, itemId) {
  const item = bank().find(i => i.id === itemId);
  if (!item) return nav('#/library');
  runStep(host, {
    type: item.type, mode: 'review', item,
    nextLabel: 'Back to review list',
    onExit: () => nav('#/library'),
    onNext: () => nav('#/library'),
  });
}

export { LABELS };
