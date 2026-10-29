// Function call: predict what a paragraph is doing from its lead and signal words.

import { h, clear, put } from '../ui.js';
import { scoreFunction } from '../rating.js';
import { FUNCTIONS, FUNCTION_KEYS } from '../taxonomy.js';

function highlight(text, phrases) {
  // Mark each signal phrase once, in reading order.
  const marks = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (const p of phrases) {
    const i = lower.indexOf(p.toLowerCase(), from);
    if (i < 0) continue;
    marks.push([i, i + p.length]);
    from = i + p.length;
  }
  const out = [];
  let pos = 0;
  for (const [a, b] of marks) {
    out.push(text.slice(pos, a), h('mark.signal', {}, text.slice(a, b)));
    pos = b;
  }
  out.push(text.slice(pos));
  return out;
}

export function runFunction(ctx) {
  const { item, body, foot, clock } = ctx;
  const restWords = Math.max(0, item.paragraph.split(/\s+/).length - item.lead.split(/\s+/).length);
  const ghost = h('div.ghost', { 'aria-hidden': 'true' },
    Array.from({ length: Math.max(2, Math.min(7, Math.round(restWords / 14))) }, (_, i) =>
      h('i', { style: { width: `${70 + ((i * 37) % 30)}%` } })));
  const para = h('p.reading', {}, item.lead);
  put(body,
    para,
    item.signals.length ? h('div.signals', {}, h('span.cap', {}, 'Ahead'), item.signals.map(s => h('span.chip', {}, s))) : null,
    ghost);

  const grid = h('div.fn-grid', {}, FUNCTION_KEYS.map(k =>
    h('button.fn', { 'data-k': k, onclick: () => pick(k) }, h('strong', {}, FUNCTIONS[k].name), h('span', {}, FUNCTIONS[k].hint))));
  foot.append(h('p.task-prompt', {}, 'What is this paragraph doing?'), grid);
  clock.start();

  let done = false;
  function pick(k) {
    if (done) return;
    done = true;
    const ms = clock.stop();
    const ok = k === item.answer;
    grid.querySelectorAll('.fn').forEach(b => {
      b.disabled = true;
      if (b.dataset.k === item.answer) b.classList.add('right');
      else if (b.dataset.k === k) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    ghost.remove();
    body.querySelector('.signals')?.remove();
    clear(para).append(...highlight(item.paragraph, item.signals));
    const bait = !ok && item.trap && k === item.trap;
    body.append(h('div.verdict' + (ok ? '.ok' : '.no'), {},
      h('strong', {}, ok ? 'Correct' : `It’s ${FUNCTIONS[item.answer].name.toLowerCase()}`),
      bait ? h('p', {}, 'You took the bait the lead sentence set. Weigh the signal words over the opening.') : null,
      item.explain && h('p.explain', {}, item.explain)));
    const s = scoreFunction(ok, ms, item.level);
    ctx.done({ skill: 'function', score: s.score, acc: s.acc, ms, units: 1, correct: ok ? 1 : 0, bait, responses: [`Chose: ${FUNCTIONS[k].name}`] });
    grid.scrollIntoView({ block: 'nearest' });
  }
}
