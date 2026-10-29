// Runs one drill item inside a standard frame: header, timer, body, footer, result.

import { h, clear, spinner, stopwatch, fmtTime, signed } from './ui.js';
import { S, save } from './store.js';
import { obtain, record } from './engine.js';
import { TAGS } from './taxonomy.js';
import { runParse } from './drills/parse.js';
import { runFunction } from './drills/function.js';
import { runRead } from './drills/read.js';

export const LABELS = {
  parse: 'Parse sprint', function: 'Function call', read: 'Dense read',
  benchmark: 'Benchmark', pacer: 'Paced read', rsvp: 'RSVP', review: 'Review',
};
const SKILL_NAMES = { parse: 'Parse', function: 'Function', read: 'Reading' };

const LOADING = {
  parse: 'Drafting fresh sentences…', function: 'Writing paragraphs…', read: 'Writing a passage…',
};

export function frame(host, { title, onExit, progress }) {
  clear(host);
  const timeEl = h('span.timer');
  const meta = h('div.drill-meta');
  const head = h('header.drill-head', {},
    h('button.icon-btn', { onclick: onExit, 'aria-label': 'Exit' }, '✕'),
    h('div.drill-title', {}, h('strong', {}, title), meta),
    timeEl);
  const bar = progress ? h('div.seg-progress', {}, Array.from({ length: progress.total }, (_, i) =>
    h('i' + (i < progress.index ? '.done' : i === progress.index ? '.now' : '')))) : null;
  const body = h('main.drill-body');
  const foot = h('footer.drill-foot');
  host.append(h('div.drill', {}, head, bar, body, foot));
  return { head, meta, timeEl, body, foot };
}

export async function runStep(host, { type, mode = 'quick', opts = {}, item = null, onNext, onExit, nextLabel = 'Next', progress, beforeRecord }) {
  const label = LABELS[mode] && mode !== 'quick' && mode !== 'session' ? LABELS[mode] : LABELS[type];
  const f = frame(host, { title: label, onExit: () => { cleanup(); onExit(); }, progress });
  const cleanups = [];
  const cleanup = () => { cleanups.splice(0).forEach(fn => { try { fn(); } catch {} }); };

  if (!item) {
    f.body.append(spinner(LOADING[type]));
    try {
      const got = await obtain(type, opts);
      item = got.item;
      if (got.repeat) f.body.prepend(h('p.note-box', {}, 'No fresh material in stock — this one is a repeat. Add an API key (or reconnect) to generate new items.'));
      if (got.warning) f.body.prepend(h('p.note-box', {}, `Couldn't generate (${got.warning}). Using a stored item.`));
    } catch (e) {
      clear(f.body).append(h('div.empty', {}, h('p', {}, e.message),
        h('button.btn.primary', { onclick: () => runStep(host, arguments[1]) }, 'Try again')));
      return;
    }
    f.body.querySelector('.loading')?.remove();
  }

  f.meta.append(h('span.chip.level', {}, `L${item.level}`),
    ...(item.tags || []).slice(0, 2).map(t => h('span.chip', {}, TAGS[t]?.name || t)));

  const showTimer = S().settings.showTimer;
  const clock = stopwatch(ms => { if (showTimer) f.timeEl.textContent = fmtTime(ms); });
  cleanups.push(() => clock.dispose());

  const ctx = {
    item, mode, body: f.body, foot: f.foot, clock,
    onCleanup: fn => cleanups.push(fn),
    clockStatic: ms => { clock.dispose(); if (showTimer) f.timeEl.textContent = fmtTime(ms); },
    done: result => {
      clock.dispose();
      result.item = item;
      result.mode = mode;
      beforeRecord?.(result);
      const { delta, rating } = record(result);
      if (mode === 'review' && result.acc >= 0.67) {
        S().missed = S().missed.filter(id => id !== item.id);
        save('state');
      }
      f.foot.append(h('div.result-bar', {},
        rating ? h('div.delta' + (delta >= 0 ? '.up' : '.down'), {},
          h('span', {}, SKILL_NAMES[result.skill]), h('b', {}, Math.round(rating.r)), h('small', {}, signed(delta)))
          : h('div.delta', {}, h('span', {}, mode === 'review' ? 'Review' : 'Unrated'), h('b', {}, `${Math.round(result.acc * 100)}%`)),
        h('button.btn.primary', { onclick: () => { cleanup(); onNext(result); } }, nextLabel)));
      f.foot.querySelector('.result-bar button')?.focus({ preventScroll: true });
    },
  };

  if (type === 'parse') runParse(ctx);
  else if (type === 'function') runFunction(ctx);
  else runRead(ctx);
}
