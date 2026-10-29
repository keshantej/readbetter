// Parse sprint: resolve one dense sentence's structure under the clock.

import { h, clear } from '../ui.js';
import { findSpan } from '../gen.js';
import { scoreParse } from '../rating.js';
import { ROLES } from '../taxonomy.js';

export function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ text: m[0], s: m.index, e: m.index + m[0].length });
  return out;
}

export function runParse(ctx) {
  const { item, body, foot, clock } = ctx;
  const words = tokenize(item.sentence);
  const spans = words.map((w, i) => h('span.w', { 'data-i': i }, w.text));
  const sentenceEl = h('p.reading.sentence', {}, spans.flatMap((s, i) => (i ? [' ', s] : [s])));
  const log = h('div.task-log');
  body.append(sentenceEl, log);

  let idx = 0, correct = 0, answering = false;

  function markSpan(span, cls) {
    words.forEach((w, i) => { if (w.s < span[1] && w.e > span[0]) spans[i].classList.add(cls); });
  }
  const resetMarks = () => spans.forEach(s => s.classList.remove('ans', 'wrong', 'picked'));

  function showTask() {
    const t = item.tasks[idx];
    resetMarks();
    answering = true;
    sentenceEl.classList.toggle('tappable', t.kind === 'tap');
    clear(foot).append(
      h('div.task', {},
        h('div.task-count', {}, `${idx + 1} / ${item.tasks.length}`),
        h('p.task-prompt', {}, t.prompt),
        t.kind === 'tap'
          ? h('p.hint', {}, 'Tap a word in the sentence.')
          : h('div.choices', {}, t.choices.map((c, i) => h('button.choice', { onclick: e => answerMc(i, e.currentTarget) }, c)))));
    clock.start();
  }

  function finishTask(ok, note) {
    answering = false;
    clock.stop();
    if (ok) correct++;
    const t = item.tasks[idx];
    log.append(h('div.log-row' + (ok ? '.ok' : '.no'), {},
      h('span.mark', {}, ok ? '✓' : '✗'),
      h('div', {}, h('strong', {}, t.prompt), note && h('span.note', {}, note), t.explain && h('p.explain', {}, t.explain))));
    const last = idx === item.tasks.length - 1;
    const btn = h('button.btn.primary.wide', { onclick: () => { if (last) finish(); else { idx++; showTask(); } } }, last ? 'See the breakdown' : 'Next');
    foot.querySelector('.task')?.append(btn);
    btn.focus({ preventScroll: true });
  }

  sentenceEl.addEventListener('click', e => {
    const w = e.target.closest('.w');
    const t = item.tasks[idx];
    if (!w || !answering || t.kind !== 'tap') return;
    const i = +w.dataset.i;
    const span = findSpan(item.sentence, t.answer);
    const ok = words[i].s < span[1] && words[i].e > span[0];
    markSpan(span, 'ans');
    if (!ok) spans[i].classList.add('wrong');
    finishTask(ok, ok ? null : `Answer: “${t.answer}”`);
  });

  function answerMc(i, btn) {
    if (!answering) return;
    const t = item.tasks[idx];
    const ok = i === t.answer;
    foot.querySelectorAll('.choice').forEach((b, j) => {
      b.disabled = true;
      if (j === t.answer) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');
    finishTask(ok, ok ? null : `Answer: ${t.choices[t.answer]}`);
  }

  function finish() {
    resetMarks();
    sentenceEl.classList.remove('tappable');
    const ms = clock.elapsed();
    const s = scoreParse(correct, item.tasks.length, ms, item.level);
    if (item.segments) {
      sentenceEl.replaceWith(breakdown(item.segments));
    }
    if (item.explain) log.prepend(h('p.reading-note', {}, item.explain));
    clear(foot);
    ctx.done({ skill: 'parse', score: s.score, acc: s.acc, ms, units: item.tasks.length, correct });
  }

  showTask();
}

export function breakdown(segments) {
  const used = [...new Set(segments.map(s => s.role))];
  return h('div.breakdown', {},
    h('p.reading.sentence.segmented', {}, segments.flatMap((s, i) => [
      i ? ' ' : '',
      h('span.seg-' + s.role, { title: ROLES[s.role].name }, s.text),
    ])),
    h('div.legend', {}, used.map(r => h('span.leg.seg-' + r, {}, ROLES[r].name))));
}
