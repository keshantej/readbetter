import { h, signed } from '../ui.js';
import { S, today } from '../store.js';
import { composite, streak, inventory, benchmarkDue, isRefilling, refill, targetLevel } from '../engine.js';
import { hasKey } from '../claude.js';
import { sessionInProgress, startSession, planSession } from '../session.js';
import { compositeAt } from './progress.js';
import { LABELS } from '../runner.js';

const TILES = [
  { route: '#/quick/parse', name: 'Parse sprint', sub: 'Resolve one dense sentence', glyph: '¶' },
  { route: '#/quick/function', name: 'Function call', sub: 'Predict what a paragraph does', glyph: '→' },
  { route: '#/quick/read', name: 'Dense read', sub: 'Timed read, closed-book Qs, gist', glyph: '§' },
  { route: '#/quick/read/pacer', name: 'Paced read', sub: 'Line pacer, adaptive speed', glyph: '≡' },
  { route: '#/quick/read/rsvp', name: 'RSVP', sub: 'Momentum on easy text', glyph: '•' },
  { route: '#/library', name: 'Your reading', sub: 'Drill your own assigned text', glyph: '✎' },
];

export function home(host, nav) {
  const st = S();
  const comp = composite();
  const week = comp - compositeAt(Date.now() - 7 * 864e5);
  const ss = sessionInProgress();
  const todayMin = Math.round((st.days[today()]?.ms || 0) / 60000);
  const inv = inventory();
  const plan = ss ? ss.steps : planSession();
  const counts = plan.reduce((a, s) => { const k = s.mode === 'pacer' ? 'pacer' : s.mode === 'benchmark' ? 'benchmark' : s.type; a[k] = (a[k] || 0) + 1; return a; }, {});
  const lvl = k => `L${targetLevel(k)}`;

  host.append(h('div.page.home', {},
    h('header.home-head', {},
      h('div', {}, h('p.cap', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
        h('h1.wordmark', {}, 'Dense')),
      h('div.streak', { title: 'Streak' }, h('b', {}, streak()), h('span', {}, 'day streak'))),

    h('section.card.rating-card', {},
      h('div.rating-main', {},
        h('span.cap', {}, 'Dense rating'),
        h('div.big-num', {}, comp, h('small.' + (week >= 0 ? 'up' : 'down'), {}, `${signed(week)} wk`))),
      h('div.skills', {}, [['parse', 'Parse'], ['function', 'Function'], ['read', 'Reading']].map(([k, name]) =>
        h('a.skill', { href: '#/progress' }, h('span', {}, name), h('b', {}, Math.round(st.ratings[k].r)), h('small', {}, lvl(k)))))),

    h('section.today', {},
      h('button.btn.primary.cta', { onclick: () => { if (!ss) startSession(); nav('#/session'); } },
        h('span', {}, ss ? `Resume session` : `Start today's session`),
        h('small', {}, ss ? `${ss.idx} of ${ss.steps.length} done` : `${st.settings.sessionMinutes} min · ${todayMin ? `${todayMin} min so far today` : 'not started today'}`)),
      h('div.plan', {}, Object.entries(counts).map(([k, n]) => h('span.chip', {}, `${n}× ${LABELS[k] || k}`)))),

    benchmarkDue() && !ss ? h('a.callout', { href: '#/quick/read/benchmark' },
      h('strong', {}, 'Weekly benchmark is due'),
      h('span', {}, 'A fixed-difficulty passage. Your cleanest measure of progress — it’s also folded into today’s session.')) : null,

    !hasKey() ? h('a.callout.warn', { href: '#/settings' },
      h('strong', {}, 'Add your Claude API key'),
      h('span', {}, `You're on the built-in starter set. A key unlocks unlimited fresh items at your level, gist grading, coaching, and drills built from your own reading.`)) : null,

    h('section', {},
      h('h2.section-title', {}, 'Drills'),
      h('div.tiles', {}, TILES.map(t => h('a.tile', { href: t.route },
        h('span.glyph', { 'aria-hidden': 'true' }, t.glyph), h('strong', {}, t.name), h('span', {}, t.sub))))),

    h('p.stock.muted', {},
      isRefilling() ? 'Writing fresh items in the background…' : `${inv.total} fresh items in stock`,
      hasKey() && !isRefilling() && inv.parse < 4 ? h('button.link', { onclick: () => { refill(); nav('#/'); } }, ' · top up') : null)));
}
