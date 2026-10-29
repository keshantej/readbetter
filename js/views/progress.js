import { h, clear, seg, spinner, toast } from '../ui.js';
import { S, attempts, save } from '../store.js';
import { lineChart, meters, activity } from '../charts.js';
import { TAGS, QKINDS } from '../taxonomy.js';
import { composite, streak } from '../engine.js';
import { hasKey } from '../claude.js';
import { coach } from '../gen.js';

const START = 1450;
const SKILLS = { parse: 'Parse', function: 'Function', read: 'Reading' };

export function ratingAt(skill, t) {
  let r = START;
  for (const e of S().ratingHistory) { if (e.t > t) break; if (e.s === skill) r = e.r; }
  return r;
}
export const compositeAt = t => Math.round((ratingAt('parse', t) + ratingAt('function', t) + 2 * ratingAt('read', t)) / 4);

const median = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const within = (a, from, to = Date.now()) => a.filter(x => x.t >= from && x.t < to);
const DAY = 864e5;

// Daily last-value series so the chart isn't dominated by sessions with many items.
function daily(entries, value) {
  const byDay = new Map();
  for (const e of entries) {
    const d = new Date(e.t); d.setHours(12, 0, 0, 0);
    byDay.set(d.getTime(), { x: d.getTime(), ...value(e) });
  }
  return [...byDay.values()];
}

function dailyMedian(list, f) {
  const byDay = new Map();
  for (const a of list) {
    const d = new Date(a.t); d.setHours(12, 0, 0, 0);
    if (!byDay.has(d.getTime())) byDay.set(d.getTime(), []);
    byDay.get(d.getTime()).push(f(a));
  }
  return [...byDay.entries()].map(([x, v]) => ({ x, y: median(v) }));
}

export function insights() {
  const A = attempts();
  const now = Date.now();
  const out = [];
  const cmp = (label, list, f, better, unit, fmt = v => Math.round(v)) => {
    const recent = within(list, now - 7 * DAY).map(f), prior = within(list, now - 35 * DAY, now - 7 * DAY).map(f);
    if (recent.length < 3 || prior.length < 3) return;
    const r = median(recent), p = median(prior);
    const ch = (r - p) / p;
    if (Math.abs(ch) < 0.04) { out.push(`${label} is flat (${fmt(r)}${unit}) versus the prior four weeks.`); return; }
    const good = better === 'up' ? ch > 0 : ch < 0;
    out.push(`${label} ${ch > 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch * 100))}% (${fmt(p)} → ${fmt(r)}${unit}) — ${good ? 'improving' : 'slipping'}.`);
  };
  const parse = A.filter(a => a.type === 'parse' && a.units && a.mode !== 'review');
  cmp('Parse time per task', parse, a => a.ms / 1000 / a.units, 'down', 's', v => v.toFixed(1));
  cmp('Parse accuracy', parse, a => a.acc, 'up', '', v => `${Math.round(v * 100)}%`);
  const reads = A.filter(a => a.type === 'read' && a.err && !['pacer', 'rsvp'].includes(a.mode));
  cmp('Self-paced reading speed', reads, a => a.wpm, 'up', ' wpm');
  cmp('Effective reading rate', reads, a => a.err, 'up', ' wpm');
  const fn = A.filter(a => a.type === 'function' && a.mode !== 'review');
  cmp('Function-call accuracy', fn, a => a.acc, 'up', '', v => `${Math.round(v * 100)}%`);
  const weak = Object.entries(S().tags).filter(([, t]) => t.n >= 4).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)[0];
  if (weak) out.push(`Weakest structure: ${TAGS[weak[0]]?.name || weak[0]} at ${Math.round((weak[1].c / weak[1].n) * 100)}% over ${weak[1].n} items. New items are weighted toward it automatically.`);
  const fast = reads.filter(a => a.t > now - 14 * DAY);
  const skim = fast.filter(a => a.comp < 0.6).length;
  if (fast.length >= 3 && skim / fast.length > 0.4) out.push(`${skim} of your last ${fast.length} reads fell below 60% comprehension. Speed isn't counting for much; slow down until accuracy holds.`);
  return out;
}

export function summaryForCoach() {
  const st = S();
  const A = attempts().filter(a => a.t > Date.now() - 30 * DAY);
  const by = type => A.filter(a => a.type === type && !['pacer', 'rsvp', 'review'].includes(a.mode));
  const avg = (l, f) => l.length ? +(l.reduce((x, a) => x + f(a), 0) / l.length).toFixed(3) : null;
  const parse = by('parse'), fn = by('function'), reads = by('read');
  return {
    ratings: Object.fromEntries(Object.entries(st.ratings).map(([k, v]) => [k, { rating: Math.round(v.r), uncertainty: Math.round(v.rd), items: v.n }])),
    last30d: {
      parse: { n: parse.length, accuracy: avg(parse, a => a.acc), secPerTask: avg(parse.filter(a => a.units), a => a.ms / 1000 / a.units), avgLevel: avg(parse, a => a.level) },
      function: { n: fn.length, accuracy: avg(fn, a => a.acc), sec: avg(fn, a => a.ms / 1000) },
      read: { n: reads.length, wpm: avg(reads, a => a.wpm || 0), comprehension: avg(reads, a => a.comp || 0), effectiveRate: avg(reads, a => a.err || 0), gistAvg0to3: avg(reads.filter(a => a.gist != null), a => a.gist) },
      pacerWpm: st.pacer.wpm,
      daysTrained: Object.keys(st.days).filter(d => new Date(d) > Date.now() - 30 * DAY).length,
    },
    questionTypes: Object.fromEntries(Object.entries(st.qtypes).map(([k, v]) => [k, { n: v.n, acc: +(v.c / v.n).toFixed(2) }])),
    structureTags: Object.fromEntries(Object.entries(st.tags).filter(([, v]) => v.n >= 2).map(([k, v]) => [k, { n: v.n, acc: +(v.c / v.n).toFixed(2) }])),
  };
}

export function progress(host) {
  const st = S();
  const A = attempts();
  let skill = 'read';

  const hist = st.ratingHistory;
  const compPts = daily(hist, e => ({ y: compositeAt(e.t) }));
  const skillBox = h('div');
  const drawSkill = () => {
    clear(skillBox).append(lineChart(daily(hist.filter(e => e.s === skill), e => ({ y: e.r, band: e.rd })), { band: true, emptyText: 'Train this skill on two different days to see a trend.' }),
      h('p.chart-note.muted', {}, `Shaded band = rating uncertainty. ${st.ratings[skill].n} rated items.`));
  };
  drawSkill();

  const reads = A.filter(a => a.type === 'read' && a.err && !['pacer', 'rsvp'].includes(a.mode));
  const errPts = reads.map(a => ({ x: a.t, y: a.err, mark: a.mode === 'benchmark', note: a.mode === 'benchmark' ? 'benchmark' : `${Math.round(a.wpm)} wpm × ${Math.round(a.comp * 100)}%` }));
  const bench = reads.filter(a => a.mode === 'benchmark');
  const parse = A.filter(a => a.type === 'parse' && a.units && a.mode !== 'review');
  const parseSpeed = dailyMedian(parse, a => a.ms / 1000 / a.units);

  const qRows = Object.entries(QKINDS).filter(([k]) => st.qtypes[k]?.n).map(([k, name]) => ({ label: name, value: st.qtypes[k].c / st.qtypes[k].n, detail: `${st.qtypes[k].n} question${st.qtypes[k].n === 1 ? '' : 's'}` }));
  const tagRows = Object.entries(st.tags).filter(([, t]) => t.n >= 1)
    .sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)
    .map(([k, t]) => ({ label: TAGS[k]?.name || k, value: t.c / t.n, detail: `${t.n} item${t.n === 1 ? '' : 's'} · ${TAGS[k]?.hint || ''}` }));

  const coachBox = h('div.coach');
  const drawCoach = () => {
    clear(coachBox);
    if (st.coach) coachBox.append(h('p.coach-text', {}, st.coach.text), h('small.muted', {}, `From ${new Date(st.coach.t).toLocaleDateString()}`));
    coachBox.append(h('button.btn' + (st.coach ? '.ghost' : '.primary') + '.wide', {
      disabled: !hasKey() || A.length < 8,
      onclick: async e => {
        e.currentTarget.disabled = true;
        coachBox.append(spinner('Reading your numbers…'));
        try { st.coach = { t: Date.now(), text: await coach(summaryForCoach()) }; save('state'); }
        catch (err) { toast(err.message, 'error'); }
        drawCoach();
      },
    }, !hasKey() ? 'Coaching needs an API key' : A.length < 8 ? 'Coaching unlocks after 8 items' : st.coach ? 'Refresh coaching' : 'Get coaching from my data'));
  };
  drawCoach();

  const tips = insights();
  host.append(h('div.page', {},
    h('h1.page-title', {}, 'Progress'),
    h('section.card', {},
      h('div.card-head', {}, h('h3', {}, 'Dense rating'), h('b.num', {}, composite())),
      lineChart(compPts, { emptyText: 'Train on two different days to see your trend.' })),
    tips.length ? h('section.card', {}, h('h3', {}, 'What changed'), h('ul.insights', {}, tips.map(t => h('li', {}, t)))) : null,
    h('section.card', {},
      h('h3', {}, 'By skill'),
      seg(Object.entries(SKILLS), skill, v => { skill = v; drawSkill(); }),
      skillBox),
    h('section.card', {},
      h('div.card-head', {}, h('h3', {}, 'Effective reading rate'), h('small.muted', {}, 'wpm × comprehension')),
      lineChart(errPts, { unit: ' wpm', emptyText: 'Complete two dense reads to see this.' }),
      h('p.chart-note.muted', {}, bench.length ? `Dots are weekly benchmarks (fixed difficulty). Latest: ${Math.round(bench[bench.length - 1].err)} wpm.` : 'Dots will mark weekly benchmarks — the cleanest comparison over time.')),
    h('section.card', {},
      h('div.card-head', {}, h('h3', {}, 'Parse speed'), h('small.muted', {}, 'median seconds per task')),
      lineChart(parseSpeed, { unit: 's', yFmt: v => v.toFixed(1), emptyText: 'Two days of parse sprints needed.' })),
    qRows.length ? h('section.card', {}, h('h3', {}, 'Comprehension by question type'), meters(qRows)) : null,
    tagRows.length ? h('section.card', {}, h('h3', {}, 'Structures, weakest first'), meters(tagRows)) : null,
    h('section.card', {},
      h('div.card-head', {}, h('h3', {}, 'Activity'), h('small.muted', {}, `${streak()}-day streak`)),
      activity(st.days)),
    h('section.card', {}, h('h3', {}, 'Coach'), coachBox)));
}
