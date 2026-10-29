import { h, clear, spinner, toast, confirmSheet, sheet } from '../ui.js';
import { S, save, bank, setBank, uid } from '../store.js';
import { inventory, refill, isRefilling } from '../engine.js';
import { hasKey, monthSpend } from '../claude.js';
import { buildPack, wordCount } from '../gen.js';
import { LABELS } from '../runner.js';

const preview = i => (i.type === 'parse' ? i.sentence : i.type === 'function' ? i.paragraph : `${i.title} — ${i.passage}`);
const clip = (s, n = 120) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

export function library(host, nav) {
  const st = S();
  const inv = inventory();
  const missed = st.missed.map(id => bank().find(i => i.id === id)).filter(Boolean);
  const spend = monthSpend();

  host.append(h('div.page', {},
    h('h1.page-title', {}, 'Library'),

    h('section.card', {},
      h('h3', {}, 'Drill your own reading'),
      h('p.muted', {}, 'Paste a case section, statute, or article you have to read anyway. Claude pulls its hardest sentences and paragraphs verbatim and writes questions on them.'),
      h('button.btn.primary.wide', { onclick: () => newPack(nav), disabled: !hasKey() }, hasKey() ? 'New pack from pasted text' : 'Needs an API key'),
      st.packs.length ? h('div.list', {}, st.packs.slice().reverse().map(p =>
        h('a.list-row', { href: `#/pack/${p.id}` },
          h('div', {}, h('strong', {}, p.title), h('small.muted', {}, `${p.itemIds.length} items · ${new Date(p.createdAt).toLocaleDateString()}${p.lastRun ? ' · drilled' : ''}`)),
          h('span.chev', {}, '›')))) : null),

    h('section.card', {},
      h('div.card-head', {}, h('h3', {}, 'Review missed items'), h('small.muted', {}, `${missed.length}`)),
      missed.length
        ? h('div.list', {}, missed.slice(0, 30).map(i => h('a.list-row', { href: `#/review/${i.id}` },
            h('div', {}, h('small.cap', {}, `${LABELS[i.type]} · L${i.level}`), h('span.snip', {}, clip(preview(i)))), h('span.chev', {}, '›'))))
        : h('p.muted', {}, 'Items you get mostly wrong land here. Review attempts are unrated; clear one by getting it right.')),

    h('section.card', {},
      h('h3', {}, 'Item stock'),
      h('div.kv', {}, h('span', {}, 'Parse sprints at your level'), h('b', {}, inv.parse)),
      h('div.kv', {}, h('span', {}, 'Function calls at your level'), h('b', {}, inv.function)),
      h('div.kv', {}, h('span', {}, 'Dense reads at your level'), h('b', {}, inv.read)),
      h('div.kv', {}, h('span', {}, 'Easy reads (pacer / RSVP)'), h('b', {}, inv.easy)),
      h('div.kv', {}, h('span', {}, 'This month’s API spend'), h('b', {}, `$${spend.cost.toFixed(2)}`, h('small.muted', {}, ` · ${spend.calls} calls`))),
      h('button.btn.wide', {
        disabled: !hasKey() || isRefilling(),
        onclick: async e => {
          e.currentTarget.disabled = true; e.currentTarget.textContent = 'Generating…';
          await refill(); toast('Stock topped up'); nav('#/library');
        },
      }, isRefilling() ? 'Generating in background…' : 'Top up now'))));

}

async function newPack(nav) {
  const ta = h('textarea.paste', { rows: 10, placeholder: 'Paste the text here (up to ~6,000 words).' });
  const count = h('small.muted', {}, '0 words');
  ta.addEventListener('input', () => { count.textContent = `${wordCount(ta.value)} words`; });
  const ok = await sheet('New pack', h('div', {}, ta, count,
    h('p.hint', {}, 'Uses your “own reading” model setting. A long opinion section costs a few cents.')), {
    actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Build pack', value: true, kind: 'primary' }],
  });
  if (!ok) return;
  const text = ta.value.trim();
  if (wordCount(text) < 80) return toast('Paste at least a few paragraphs.', 'error');
  const host = document.querySelector('#view');
  clear(host).append(h('div.page', {}, spinner('Reading your text and building drills… (30–60 s)')));
  try {
    const pack = await buildPack(text);
    if (!pack.items.length) throw new Error('Nothing usable came back. Try a denser excerpt.');
    const id = uid('pk');
    pack.items.forEach(i => { i.packId = id; });
    setBank([...bank(), ...pack.items]);
    S().packs.push({ id, title: pack.title, createdAt: Date.now(), itemIds: pack.items.map(i => i.id) });
    save('state');
    nav(`#/pack/${id}`);
  } catch (e) {
    toast(e.message, 'error');
    nav('#/library');
  }
}

export function packView(host, nav, id) {
  const pack = S().packs.find(p => p.id === id);
  if (!pack) return nav('#/library');
  const items = pack.itemIds.map(i => bank().find(b => b.id === i)).filter(Boolean);
  const n = t => items.filter(i => i.type === t).length;
  host.append(h('div.page', {},
    h('a.back', { href: '#/library' }, '‹ Library'),
    h('h1.page-title', {}, pack.title),
    h('p.muted', {}, `${n('parse')} parse · ${n('function')} function · ${n('read')} read`),
    h('button.btn.primary.wide', { onclick: () => nav(`#/packrun/${id}`) }, 'Drill this pack'),
    h('div.list', {}, items.map(i => h('div.list-row.static', {},
      h('div', {}, h('small.cap', {}, `${LABELS[i.type]} · L${i.level}`), h('span.snip', {}, clip(preview(i), 160)))))),
    h('button.btn.ghost.danger-text.wide', { onclick: async () => {
      if (!(await confirmSheet('Delete pack?', 'Its items and their history links are removed. Your ratings are kept.', 'Delete'))) return;
      const ids = new Set(pack.itemIds);
      setBank(bank().filter(i => !ids.has(i.id)));
      S().packs = S().packs.filter(p => p.id !== id);
      S().missed = S().missed.filter(m => !ids.has(m));
      save('state');
      nav('#/library');
    } }, 'Delete pack')));
}
