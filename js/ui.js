// Tiny DOM helpers. No framework: fewer moving parts, instant load on a phone.

export function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, kind = '') {
  const t = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 4500 : 2600);
}

export function sheet(title, content, { actions = [] } = {}) {
  return new Promise(resolve => {
    const close = v => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); resolve(v); };
    const wrap = h('div.sheet-wrap', { onclick: e => { if (e.target === wrap) close(null); } },
      h('div.sheet', {},
        h('div.sheet-grip'),
        title && h('h3.sheet-title', {}, title),
        content,
        actions.length && h('div.sheet-actions', {}, actions.map(a =>
          h('button.btn' + (a.kind ? '.' + a.kind : ''), { onclick: () => close(a.value) }, a.label)))));
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
  });
}

export const confirmSheet = (title, msg, ok = 'Confirm', kind = 'danger') =>
  sheet(title, h('p.muted', {}, msg), { actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: ok, value: true, kind }] });

export function spinner(label) {
  return h('div.loading', {}, h('div.ink-dots', {}, h('i'), h('i'), h('i')), label && h('p.muted', {}, label));
}

export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const pct = x => `${Math.round(x * 100)}%`;
export const signed = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(Math.round(x));

// Stopwatch that can pause (explanations and feedback don't count against you).
export function stopwatch(onTick) {
  let acc = 0, start = null, raf = null;
  const tick = () => { onTick?.(elapsed()); raf = requestAnimationFrame(tick); };
  const elapsed = () => acc + (start != null ? performance.now() - start : 0);
  return {
    start() { if (start == null) { start = performance.now(); if (onTick) tick(); } },
    stop() { if (start != null) { acc += performance.now() - start; start = null; } cancelAnimationFrame(raf); onTick?.(acc); return acc; },
    elapsed,
    running: () => start != null,
    dispose() { cancelAnimationFrame(raf); },
  };
}

export function seg(options, value, onChange) {
  const el = h('div.seg', { role: 'radiogroup' });
  const render = () => {
    clear(el);
    for (const [v, label] of options) {
      el.append(h('button' + (v === value ? '.on' : ''), {
        role: 'radio', 'aria-checked': String(v === value),
        onclick: () => { value = v; render(); onChange(v); },
      }, label));
    }
  };
  render();
  return el;
}

export function toggle(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) });
  return h('label.switch', {}, h('span', {}, label), input, h('i'));
}
