// Dense read (self-paced), paced read, RSVP, and the weekly benchmark.
// All share the same flow: read → closed-book questions → one-line gist → score.

import { h, clear, put, spinner, fmtTime, toast, stopwatch } from '../ui.js';
import { S, save } from '../store.js';
import { comprehension, scoreRead, readTargetWpm } from '../rating.js';
import { QKINDS } from '../taxonomy.js';
import { hasKey } from '../claude.js';
import { gradeGist } from '../gen.js';

const paragraphs = text => text.split(/\n\n+/);

export function runRead(ctx) {
  const { item, body, foot, mode } = ctx;
  const st = S();
  const paced = mode === 'pacer', rsvp = mode === 'rsvp';
  const useGist = !paced && !rsvp;
  let readMs = 0, wpm = 0, lookbacks = 0;
  const qResults = [];
  const responses = [];

  // ---- intro ----
  const estMin = item.words / (paced ? st.pacer.wpm : rsvp ? st.settings.rsvpWpm : readTargetWpm(item.level));
  body.append(h('div.intro', {},
    h('h2.passage-title', {}, item.title),
    h('p.meta', {}, `${item.words} words · about ${Math.max(1, Math.round(estMin))} min${paced ? ` · paced at ${Math.round(st.pacer.wpm)} wpm` : rsvp ? ` · RSVP at ${st.settings.rsvpWpm} wpm` : ''}`),
    h('p.muted', {}, mode === 'benchmark'
      ? 'Weekly benchmark: fixed difficulty, so this number is comparable week to week. Read at your natural pace.'
      : paced ? 'Keep your eyes on the highlighted line and let it pull you forward. No going back.'
      : rsvp ? 'Words flash at a fixed point; the red letter marks where to focus. Tap to pause.'
      : st.settings.closedBook ? 'Read once at your natural pace. Questions are closed-book.' : 'Read at your natural pace, then answer.')));
  foot.append(h('button.btn.primary.wide', { onclick: start }, 'Start reading'));

  function start() {
    clear(body); clear(foot);
    if (paced) return pacer();
    if (rsvp) return rsvpView();
    const text = h('div.reading.passage', {}, paragraphs(item.passage).map(p => h('p', {}, p)));
    body.append(text);
    const sw = stopwatch();
    ctx.onCleanup(() => sw.dispose());
    sw.start();
    foot.append(h('button.btn.primary.wide', { onclick: () => {
      readMs = sw.stop(); sw.dispose();
      wpm = item.words / (readMs / 60000);
      questions();
    } }, 'Done reading'));
    window.scrollTo({ top: 0 });
  }

  // ---- pacer: line-by-line highlight at a fixed speed ----
  function pacer() {
    let speed = st.pacer.wpm;
    const text = h('div.reading.passage.pacing');
    const spans = [];
    for (const p of paragraphs(item.passage)) {
      const pe = h('p');
      p.split(/\s+/).forEach((w, i) => { if (i) pe.append(' '); const s = h('span', {}, w); spans.push(s); pe.append(s); });
      text.append(pe);
    }
    body.append(text);
    let lines = [], li = 0, timer = null, paused = false, startT = performance.now();
    const layout = () => {
      lines = [];
      let top = null;
      for (const s of spans) {
        const t = s.offsetTop;
        if (top === null || Math.abs(t - top) > 4) { lines.push([]); top = t; }
        lines[lines.length - 1].push(s);
      }
    };
    const paint = () => {
      lines.forEach((ln, i) => ln.forEach(s => {
        s.classList.toggle('on', i === li);
        s.classList.toggle('past', i < li);
      }));
      const cur = lines[li]?.[0];
      if (cur) {
        const y = cur.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    };
    const step = () => {
      if (paused) return;
      if (li >= lines.length) return end();
      paint();
      const n = lines[li].length;
      const tail = lines[li][n - 1]?.textContent || '';
      const extra = /[.;:?!]$/.test(tail) ? 120 : 0;
      timer = setTimeout(() => { li++; step(); }, (n / speed) * 60000 + extra);
    };
    const speedLabel = h('span.speed', {}, `${Math.round(speed)} wpm`);
    const pauseBtn = h('button.btn', { onclick: () => {
      paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      if (!paused) step(); else clearTimeout(timer);
    } }, 'Pause');
    const adj = d => { speed = Math.max(120, Math.min(900, speed + d)); st.pacer.wpm = speed; speedLabel.textContent = `${Math.round(speed)} wpm`; save('state'); };
    foot.append(h('div.row.controls', {},
      h('button.btn.ghost', { onclick: () => adj(-10), 'aria-label': 'Slower' }, '−'),
      speedLabel,
      h('button.btn.ghost', { onclick: () => adj(10), 'aria-label': 'Faster' }, '+'),
      pauseBtn));
    const onResize = () => { layout(); paint(); };
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden && !paused) { hiddenAt = performance.now(); pauseBtn.click(); }
      else if (!document.hidden && hiddenAt) { startT += performance.now() - hiddenAt; hiddenAt = 0; }
    };
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    ctx.onCleanup(() => { clearTimeout(timer); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); });
    requestAnimationFrame(() => { layout(); step(); });
    function end() {
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      readMs = performance.now() - startT;
      wpm = speed;
      questions();
    }
  }

  // ---- RSVP with optimal recognition point ----
  function rsvpView() {
    const tokens = [];
    paragraphs(item.passage).forEach((p, pi, arr) => p.split(/\s+/).forEach((w, i, ws) =>
      tokens.push({ w, para: i === ws.length - 1 && pi < arr.length - 1 })));
    let speed = st.settings.rsvpWpm, i = 0, timer = null, paused = false, activeMs = 0, t0 = null;
    const left = h('span.l'), piv = h('span.p'), right = h('span.r');
    const bar = h('div.progress-fill');
    const stage = h('div.rsvp', { onclick: () => toggle() },
      h('div.rsvp-guide.top'), h('div.rsvp-word', {}, left, piv, right), h('div.rsvp-guide.bottom'),
      h('p.hint.center', {}, 'Tap to pause'));
    body.append(stage, h('div.progress', {}, bar));
    const show = tok => {
      const [a, b, c] = orpSplit(tok.w);
      left.textContent = a; piv.textContent = b; right.textContent = c;
    };
    const tick = () => {
      if (paused) return;
      if (i >= tokens.length) return end();
      const tok = tokens[i];
      show(tok);
      bar.style.width = `${(i / tokens.length) * 100}%`;
      i++;
      timer = setTimeout(tick, (60000 / speed) * delayFactor(tok.w, tok.para));
    };
    const toggle = () => {
      paused = !paused;
      if (paused) { clearTimeout(timer); activeMs += performance.now() - t0; stage.classList.add('paused'); }
      else { t0 = performance.now(); stage.classList.remove('paused'); tick(); }
    };
    const speedLabel = h('span.speed', {}, `${speed} wpm`);
    const adj = d => { speed = Math.max(150, Math.min(1000, speed + d)); st.settings.rsvpWpm = speed; speedLabel.textContent = `${speed} wpm`; save('state'); };
    foot.append(h('div.row.controls', {},
      h('button.btn.ghost', { onclick: () => adj(-25) }, '−'), speedLabel, h('button.btn.ghost', { onclick: () => adj(25) }, '+'),
      h('button.btn', { onclick: () => { clearTimeout(timer); end(); } }, 'Stop')));
    const onVis = () => { if (document.hidden && !paused && t0) toggle(); };
    document.addEventListener('visibilitychange', onVis);
    ctx.onCleanup(() => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); });
    show({ w: 'Ready' });
    setTimeout(() => { t0 = performance.now(); tick(); }, 700);
    function end() {
      if (!paused && t0) activeMs += performance.now() - t0;
      readMs = activeMs;
      wpm = Math.min(i, tokens.length) / (Math.max(activeMs, 1) / 60000);
      questions();
    }
  }

  // ---- closed-book questions ----
  function questions() {
    ctx.clockStatic(readMs);
    let qi = 0;
    const qs = paced || rsvp ? item.questions.slice(0, 3) : item.questions;
    const next = () => {
      clear(body); clear(foot);
      window.scrollTo({ top: 0 });
      if (qi >= qs.length) return useGist ? gist() : finish(null);
      const q = qs[qi];
      body.append(
        h('div.q-head', {}, h('span.cap', {}, QKINDS[q.kind] || 'Question'), h('span.task-count', {}, `${qi + 1} / ${qs.length}`)),
        h('p.task-prompt.big', {}, q.prompt));
      const choices = h('div.choices', {}, q.choices.map((c, j) => h('button.choice', { onclick: e => answer(j, e.currentTarget) }, c)));
      body.append(choices);
      if (!st.settings.closedBook && !paced && !rsvp) {
        foot.append(h('button.btn.ghost.wide', { onclick: lookBack }, 'Look back at the passage'));
      }
      function answer(j, btn) {
        const ok = j === q.answer;
        qResults.push({ kind: q.kind, ok });
        responses.push(`Q${qi + 1}: chose ${j}. ${q.choices[j]}`);
        choices.querySelectorAll('.choice').forEach((b, k) => { b.disabled = true; if (k === q.answer) b.classList.add('right'); });
        if (!ok) btn.classList.add('wrong');
        if (q.explain) body.append(h('p.explain.boxed', {}, q.explain));
        clear(foot).append(h('button.btn.primary.wide', { onclick: () => { qi++; next(); } }, qi === qs.length - 1 ? (useGist ? 'Write the gist' : 'Finish') : 'Next'));
      }
    };
    next();
  }

  function lookBack() {
    lookbacks++;
    const view = h('div.sheet-wrap.show', { onclick: () => view.remove() },
      h('div.sheet.tall', {}, h('div.sheet-grip'), h('div.reading.passage', {}, paragraphs(item.passage).map(p => h('p', {}, p))),
        h('button.btn.wide', {}, 'Close')));
    document.body.append(view);
  }

  // ---- gist ----
  function gist() {
    clear(body); clear(foot);
    const ta = h('textarea.gist', { rows: 4, placeholder: 'One sentence: what does the passage establish, including its key limit?', maxlength: 400 });
    body.append(h('p.task-prompt.big', {}, 'Gist, from memory'), ta,
      h('p.hint', {}, 'Precision about scope and limits is what scores, not style.'));
    foot.append(
      h('button.btn.ghost', { onclick: () => finish(null) }, 'Skip'),
      h('button.btn.primary', { onclick: submit }, 'Submit'));
    setTimeout(() => ta.focus(), 50);
    async function submit() {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      clear(foot);
      if (hasKey() && navigator.onLine) {
        const load = spinner('Grading…');
        body.append(load);
        try {
          const g = await gradeGist(item, text);
          load.remove();
          body.append(gistResult(g.score, g.feedback, g.missing));
          return finish(g.score, text);
        } catch (e) {
          load.remove();
          toast(`Grading failed: ${e.message}. Grade yourself.`, 'error');
        }
      }
      selfGrade(text);
    }
    function selfGrade(text) {
      const prompt = h('p.task-prompt', {}, 'Compared with the reference, your gist…');
      body.append(h('div.ref', {}, h('span.cap', {}, 'Reference'), h('p', {}, item.gist)), prompt);
      foot.append(h('div.choices.row3', {},
        [['Missed it', 0], ['Main point only', 2], ['Point + key limit', 3]].map(([l, v]) =>
          h('button.choice', { onclick: () => { clear(foot); prompt.textContent = `You graded your gist: ${l.toLowerCase()} (${v}/3).`; finish(v, text); } }, l))));
    }
  }

  function gistResult(score, feedback, missing) {
    return h('div.gist-result', {},
      h('div.dots', { 'aria-label': `${score} of 3` }, [0, 1, 2].map(i => h('i' + (i < score ? '.on' : '')))),
      h('p', {}, feedback),
      missing && h('p.muted', {}, h('strong', {}, 'Missing: '), missing),
      h('div.ref', {}, h('span.cap', {}, 'Reference'), h('p', {}, item.gist)));
  }

  // ---- score ----
  function finish(gistScore, gistText) {
    const tooFast = wpm > 1200;
    wpm = Math.min(wpm, 1200); // nobody reads dense prose faster; keeps charts honest if Done is tapped early
    const mcOk = qResults.filter(q => q.ok).length;
    const comp = comprehension(mcOk, qResults.length, gistScore);
    const s = scoreRead(comp, wpm, item.level);
    const err = wpm * comp;
    let note = null;
    if (paced) {
      const p = st.pacer;
      if (comp >= 0.8) { p.good++; if (p.good >= 2) { p.wpm = Math.round(p.wpm * 1.05); p.good = 0; note = `Comprehension held — pacer raised to ${p.wpm} wpm.`; } }
      else if (comp < 0.6) { p.wpm = Math.max(150, Math.round(p.wpm * 0.95)); p.good = 0; note = `Comprehension slipped — pacer eased to ${p.wpm} wpm.`; }
      else p.good = 0;
      save('state');
    } else if (tooFast) {
      note = 'That was too fast to be reading. Speed is capped at 1,200 wpm for scoring.';
    } else if (!rsvp && wpm > 1.6 * readTargetWpm(item.level) && comp < 0.6) {
      note = 'You were skimming, not reading. Slow down until comprehension holds.';
    }
    put(body, h('div.stats-row', {},
      stat('Speed', `${Math.round(wpm)}`, 'wpm'),
      stat('Comprehension', `${Math.round(comp * 100)}`, '%'),
      stat('Effective rate', `${Math.round(err)}`, 'wpm'),
      stat('Time', fmtTime(readMs), '')),
      note && h('p.note-box', {}, note));
    ctx.done({ skill: 'read', score: s.score, acc: comp, comp, wpm, err, ms: readMs, qResults, gist: gistScore, lookbacks, units: qResults.length, responses });
  }
}

const stat = (label, value, unit) => h('div.stat', {}, h('span.cap', {}, label), h('b', {}, value, unit && h('small', {}, unit)));

// ORP: the letter slightly left of center that the eye locks onto (Spritz-style).
export function orpIndex(word) {
  const core = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const lead = word.indexOf(core[0] ?? '');
  const n = core.length;
  const k = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return Math.max(0, lead) + k;
}

export function orpSplit(word) {
  const i = Math.min(orpIndex(word), Math.max(0, word.length - 1));
  return [word.slice(0, i), word[i] || '', word.slice(i + 1)];
}

export function delayFactor(word, paraEnd) {
  let f = 1;
  if (word.length > 8) f += 0.3;
  if (word.length > 12) f += 0.2;
  if (/[,;:—–)]$/.test(word)) f += 0.5;
  if (/[.?!]["”’)]?$/.test(word)) f += 1.0;
  if (paraEnd) f += 1.2;
  return f;
}
