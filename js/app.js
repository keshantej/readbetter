import { load, S } from './store.js';
import { h, clear, $ } from './ui.js';
import { mergeSeeds, refill, onBankChange } from './engine.js';
import { runStep } from './runner.js';
import { runSession, runQuick, runPack, runReview } from './session.js';
import { home } from './views/home.js';
import { progress } from './views/progress.js';
import { library, packView } from './views/library.js';
import { settings } from './views/settings.js';

const view = () => $('#view');
const TABS = [['#/', 'Train', 'M4 6h16M4 12h10M4 18h13'], ['#/progress', 'Progress', 'M4 18l5-6 4 3 7-9'], ['#/library', 'Library', 'M5 4h4v16H5zM11 4h4v16h-4zM17 5l3 1-4 14-3-1z'], ['#/settings', 'Settings', 'M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2M18 12h2M12 4v2M12 18v2']];

export function applyTheme() {
  const t = S().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export function nav(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function tabbar(active) {
  const bar = $('#tabbar');
  clear(bar);
  for (const [href, label, d] of TABS) {
    bar.append(h('a' + (active === href ? '.on' : ''), { href, 'aria-current': active === href ? 'page' : null },
      h('span', { html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>` }),
      h('small', {}, label)));
  }
}

function route(scroll = true) {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const host = clear(view());
  const drilling = ['session', 'quick', 'packrun', 'review'].includes(parts[0]);
  document.body.classList.toggle('drilling', drilling);
  $('#tabbar').hidden = drilling;
  if (scroll) window.scrollTo({ top: 0 });

  switch (parts[0]) {
    case undefined: tabbar('#/'); return home(host, nav);
    case 'progress': tabbar('#/progress'); return progress(host, nav);
    case 'library': tabbar('#/library'); return library(host, nav);
    case 'settings': tabbar('#/settings'); settings(host, nav); return fixRepoLink();
    case 'pack': tabbar('#/library'); return packView(host, nav, parts[1]);
    case 'session': return runSession(host, nav);
    case 'packrun': return runPack(host, nav, parts[1]);
    case 'review': return runReview(host, nav, parts[1]);
    case 'quick': {
      const [, type, mode] = parts;
      if (!['parse', 'function', 'read'].includes(type)) return nav('#/');
      if (mode === 'benchmark') {
        return runStep(host, { type: 'read', mode: 'benchmark', opts: { benchmark: true }, nextLabel: 'Done', onExit: () => nav('#/'), onNext: () => { refill(); nav('#/progress'); } });
      }
      const opts = mode === 'pacer' || mode === 'rsvp' ? { easy: true } : {};
      return runQuick(host, nav, type, mode || 'quick', opts);
    }
    default: return nav('#/');
  }
}

function fixRepoLink() {
  const a = document.getElementById('repo-link');
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (a && m) a.href = `https://github.com/${m[1]}/${location.pathname.split('/').filter(Boolean)[0] || ''}`;
}

async function boot() {
  await load();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  mergeSeeds();
  addEventListener('hashchange', () => route());
  route();
  onBankChange(() => { if (['', '#/', '#/library'].includes(location.hash) && !document.querySelector('.sheet-wrap')) route(false); });
  setTimeout(() => refill(), 800);
  addEventListener('online', () => refill());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => refill(), 1500); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
  }
}

boot().catch(e => {
  console.error(e);
  view().append(h('div.page', {}, h('h2', {}, 'Something broke on startup'), h('pre', {}, String(e?.stack || e))));
});
