import { h, seg, toggle, toast, confirmSheet } from '../ui.js';
import { S, save, exportAll, importAll, resetAll, flush } from '../store.js';
import { MODELS, testKey, monthSpend } from '../claude.js';
import { DOMAINS } from '../taxonomy.js';
import { refill } from '../engine.js';
import { applyTheme } from '../app.js';

export function settings(host, nav) {
  const st = S();
  const set = st.settings;
  const commit = () => save('state');

  const key = h('input.input', { type: 'password', value: set.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
    onchange: e => { set.apiKey = e.target.value.trim(); commit(); } });
  const keyStatus = h('small.muted', {}, set.apiKey ? 'Key saved on this device.' : 'No key yet.');

  const modelSelect = (field, label, help) => h('label.field', {},
    h('span', {}, label),
    h('select.input', { onchange: e => { set[field] = e.target.value; commit(); } },
      Object.entries(MODELS).map(([id, m]) => h('option', { value: id, selected: set[field] === id }, `${m.name} — $${m.in}/$${m.out} per MTok`))),
    h('small.muted', {}, help));

  const spend = monthSpend();
  const allTime = Object.values(st.usage).reduce((a, u) => a + u.cost, 0);

  host.append(h('div.page.settings', {},
    h('h1.page-title', {}, 'Settings'),

    h('section.card', {},
      h('h3', {}, 'Claude API'),
      h('label.field', {}, h('span', {}, 'API key'), h('div.row', {}, key,
        h('button.btn', { onclick: e => { key.type = key.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = key.type === 'password' ? 'Show' : 'Hide'; } }, 'Show'))),
      keyStatus,
      h('div.row', {},
        h('button.btn', { onclick: async e => {
          set.apiKey = key.value.trim(); commit();
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Testing…';
          try { await testKey(); keyStatus.textContent = 'Key works.'; toast('Key works — generating your first items'); refill(); }
          catch (err) { keyStatus.textContent = err.message; toast(err.message, 'error'); }
          b.disabled = false; b.textContent = 'Test key';
        } }, 'Test key'),
        h('a.btn.ghost', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'Get a key')),
      h('p.hint', {}, 'Stored only in this app’s storage on this device and sent only to api.anthropic.com. It is never included in backups. Set a monthly spend limit in the Anthropic Console as a backstop.'),
      modelSelect('genModel', 'Item writer', 'Writes your sentences, paragraphs, and passages. Sonnet is the sweet spot; Haiku items are noticeably easier to see through.'),
      modelSelect('gradeModel', 'Grader & coach', 'Grades your gists and writes coaching. Haiku is fine here if you want to cut cost.'),
      modelSelect('packModel', 'Your-reading packs', 'Builds drills from text you paste. Opus picks the genuinely hard sentences best.'),
      h('div.kv', {}, h('span', {}, 'Spend this month'), h('b', {}, `$${spend.cost.toFixed(2)}`)),
      h('div.kv', {}, h('span', {}, 'All time'), h('b', {}, `$${allTime.toFixed(2)}`)),
      h('p.hint', {}, 'Estimated from token usage; the Console bill is authoritative.')),

    h('section.card', {},
      h('h3', {}, 'Training'),
      h('label.field', {}, h('span', {}, 'Session length')),
      seg([[5, '5 min'], [8, '8 min'], [12, '12 min'], [15, '15 min']], set.sessionMinutes, v => { set.sessionMinutes = v; commit(); }),
      h('p.hint', {}, '5: parse + function only. 8: adds a dense read. 12–15: adds a paced warm-up and more items.'),
      toggle(set.pacerWarmup, v => { set.pacerWarmup = v; commit(); }, 'Paced warm-up (12–15 min sessions)'),
      toggle(set.closedBook, v => { set.closedBook = v; commit(); }, 'Closed-book questions'),
      toggle(set.showTimer, v => { set.showTimer = v; commit(); }, 'Show the timer'),
      h('label.field', {}, h('span', {}, 'Domains to draw from')),
      h('div.chips-toggle', {}, Object.entries(DOMAINS).map(([k, d]) => {
        const b = h('button.chip-toggle' + (set.domains[k] ? '.on' : ''), { onclick: () => {
          set.domains[k] = !set.domains[k];
          if (!Object.values(set.domains).some(Boolean)) { set.domains[k] = true; return toast('Keep at least one domain.'); }
          b.classList.toggle('on', set.domains[k]); commit();
        } }, d.name);
        return b;
      })),
      h('label.field', {}, h('span', {}, 'About you (optional)'),
        h('textarea.input', { rows: 3, placeholder: 'e.g. 2L, patent prosecution track, physics background. Sent with generation requests so items fit you.', value: set.profile || '',
          onchange: e => { set.profile = e.target.value; commit(); } })),
      h('div.kv', {}, h('span', {}, 'Pacer speed (adapts automatically)'), h('b', {}, `${Math.round(st.pacer.wpm)} wpm`)),
      h('div.kv', {}, h('span', {}, 'RSVP speed'), h('b', {}, `${set.rsvpWpm} wpm`))),

    h('section.card', {},
      h('h3', {}, 'Appearance'),
      seg([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], set.theme, v => { set.theme = v; commit(); applyTheme(); })),

    h('section.card', {},
      h('h3', {}, 'Your data'),
      h('p.muted', {}, 'Everything lives on this device. Back it up now and then — iOS can clear website storage for apps that aren’t on the Home Screen.'),
      h('div.row', {},
        h('button.btn', { onclick: exportData }, 'Export backup'),
        h('label.btn', {}, 'Import backup', h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async e => {
          const file = e.target.files[0]; if (!file) return;
          try { await importAll(await file.text()); toast('Backup restored'); nav('#/'); }
          catch (err) { toast(err.message, 'error'); }
        } }))),
      h('button.btn.ghost.danger-text.wide', { onclick: async () => {
        if (!(await confirmSheet('Reset all progress?', 'Ratings, history, packs, and stored items are erased. Your API key and settings stay.', 'Reset'))) return;
        await resetAll(); toast('Progress reset'); nav('#/');
      } }, 'Reset progress')),

    h('p.about.muted', {}, 'Dense — open-source daily drills for reading complex text faster. ',
      h('a', { href: 'https://github.com/', target: '_blank', rel: 'noopener', id: 'repo-link' }, 'Source'))));
}

async function exportData() {
  await flush();
  const blob = new Blob([exportAll()], { type: 'application/json' });
  const name = `dense-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Dense backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
}
