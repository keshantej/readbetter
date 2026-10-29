// Small, dependency-free SVG charts tuned for a phone: one series per chart,
// 2px line, recessive grid, touch crosshair + tooltip.

import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
};

const shortDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function niceTicks(lo, hi, n = 3) {
  const minSpan = Math.max(1, Math.abs(hi) * 0.08);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const step0 = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= step0) || step0;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; ; v += step) { ticks.push(+v.toFixed(6)); if (v >= hi - 1e-9 || ticks.length > 8) break; }
  return ticks;
}

// points: [{x: timestamp, y: number, mark?: boolean}]
export function lineChart(points, { height = 150, yFmt = v => Math.round(v), unit = '', band = null, emptyText = 'Not enough data yet.' } = {}) {
  const wrap = h('div.chart');
  if (points.length < 2) { wrap.append(h('p.chart-empty', {}, emptyText)); return wrap; }
  const W = 340, H = height, L = 40, R = 10, T = 10, B = 22;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const bandLo = band ? points.map(p => p.y - p.band) : ys, bandHi = band ? points.map(p => p.y + p.band) : ys;
  const ticks = niceTicks(Math.min(...bandLo, ...ys), Math.max(...bandHi, ...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = x => L + ((x - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = y => T + (1 - (y - y0) / Math.max(1e-9, y1 - y0)) * (H - T - B);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `Trend from ${yFmt(ys[0])} to ${yFmt(ys[ys.length - 1])}${unit}` });
  for (const t of ticks) {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: 'grid' }));
    const lab = s('text', { x: L - 6, y: Y(t) + 3.5, class: 'axis', 'text-anchor': 'end' }); lab.textContent = yFmt(t); svg.append(lab);
  }
  [x0, x1].forEach((x, i) => {
    const lab = s('text', { x: X(x), y: H - 6, class: 'axis', 'text-anchor': i ? 'end' : 'start' }); lab.textContent = shortDate(x); svg.append(lab);
  });
  if (band) {
    const top = points.map(p => `${X(p.x)},${Y(p.y + p.band)}`);
    const bot = points.slice().reverse().map(p => `${X(p.x)},${Y(p.y - p.band)}`);
    svg.append(s('polygon', { points: [...top, ...bot].join(' '), class: 'band' }));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  svg.append(s('path', { d, class: 'line' }));
  points.forEach(p => { if (p.mark) svg.append(s('circle', { cx: X(p.x), cy: Y(p.y), r: 4.5, class: 'mark' })); });
  const last = points[points.length - 1];
  svg.append(s('circle', { cx: X(last.x), cy: Y(last.y), r: 4, class: 'end' }));

  // hover / touch crosshair
  const cross = s('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' });
  const dot = s('circle', { r: 4.5, class: 'end', visibility: 'hidden' });
  svg.append(cross, dot);
  const tip = h('div.tip', { hidden: true });
  const move = e => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(X(p.x) - px) < Math.abs(X(best.x) - px)) best = p;
    cross.setAttribute('x1', X(best.x)); cross.setAttribute('x2', X(best.x));
    dot.setAttribute('cx', X(best.x)); dot.setAttribute('cy', Y(best.y));
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${shortDate(best.x)} · ${yFmt(best.y)}${unit}${best.note ? ` · ${best.note}` : ''}`;
    const left = (X(best.x) / W) * rect.width;
    tip.style.left = `${Math.max(0, Math.min(rect.width - 150, left - 75))}px`;
  };
  const leave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
  wrap.append(svg, tip);
  return wrap;
}

// Horizontal meter rows: [{label, value (0..1), detail}]
export function meters(rows, { fmt = v => `${Math.round(v * 100)}%` } = {}) {
  return h('div.meters', {}, rows.map(r =>
    h('div.meter-row', {},
      h('div.meter-label', {}, h('span', {}, r.label), h('b', {}, fmt(r.value))),
      h('div.meter', {}, h('i', { style: { width: `${Math.max(2, Math.min(100, r.value * 100))}%` } })),
      r.detail && h('small.muted', {}, r.detail))));
}

// Activity strip: last N weeks, one cell per day, shaded by minutes trained.
export function activity(days, weeks = 12) {
  const grid = h('div.activity', { role: 'img', 'aria-label': `Training activity over the last ${weeks} weeks` });
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay());
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const v = days[key(d)];
    const min = v ? v.ms / 60000 : 0;
    const lvl = !v ? 0 : min < 3 ? 1 : min < 7 ? 2 : min < 12 ? 3 : 4;
    grid.append(h('i.l' + lvl, { title: `${key(d)}: ${v ? `${Math.round(min)} min, ${v.items} items` : 'no training'}` }));
  }
  return grid;
}
