// Offline shell. Bump VERSION whenever you change app files so phones pick up the update.
const VERSION = 'dense-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/claude.js', './js/gen.js', './js/engine.js',
  './js/rating.js', './js/taxonomy.js', './js/seed.js', './js/runner.js', './js/session.js', './js/charts.js',
  './js/drills/parse.js', './js/drills/function.js', './js/drills/read.js',
  './js/views/home.js', './js/views/progress.js', './js/views/library.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network-first for the app shell (so updates land), cache fallback offline.
// API calls to api.anthropic.com are never intercepted.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
