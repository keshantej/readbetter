// Persistent state. IndexedDB key-value (larger quota than localStorage, survives
// iOS home-screen app restarts), with an in-memory copy and debounced writes.

const DB_NAME = 'dense';
const STORE = 'kv';
const KEYS = ['state', 'attempts', 'bank'];

let db = null;
const mem = { state: null, attempts: [], bank: [] };
const dirty = new Set();
let flushTimer = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbSet(key, val) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const DEFAULT_SETTINGS = {
  apiKey: '',
  genModel: 'claude-sonnet-5-5',
  gradeModel: 'claude-sonnet-5-5',
  packModel: 'claude-sonnet-5-5',
  domains: { legal: true, patent: true, science: true, philosophy: false, policy: false },
  sessionMinutes: 8,
  closedBook: true,
  pacerWarmup: true,
  showTimer: true,
  theme: 'auto',
  rsvpWpm: 350,
  profile: '',
  verifyItems: true,
};

export function defaultState() {
  return {
    version: 1,
    createdAt: Date.now(),
    settings: structuredClone(DEFAULT_SETTINGS),
    ratings: {
      parse: { r: 1450, rd: 250, vol: 0.06, n: 0 },
      function: { r: 1450, rd: 250, vol: 0.06, n: 0 },
      read: { r: 1450, rd: 250, vol: 0.06, n: 0 },
    },
    ratingHistory: [], // {t, s(skill), r, rd}
    tags: {},          // tag -> {n, c}
    qtypes: {},        // read question kind -> {n, c}
    pacer: { wpm: 250, good: 0 },
    days: {},          // 'YYYY-MM-DD' -> {ms, items}
    seen: {},          // itemId -> last-served timestamp
    missed: [],        // itemIds worth reviewing (kept in bank)
    packs: [],         // {id, title, createdAt, itemIds:[]}
    session: null,     // in-progress session for resume
    lastBenchmark: 0,
    usage: {},         // 'YYYY-MM' -> {in, out, cost, calls}
    coach: null,       // {t, text}
    apiStatus: null,   // {ok, t, msg, job, lastError}
    quality: { checked: 0, dropped: 0, disputes: 0, upheld: 0 },
  };
}

export async function load() {
  try {
    db = await openDB();
    for (const k of KEYS) {
      const v = await idbGet(k);
      if (v !== undefined) mem[k] = v;
    }
  } catch (e) {
    console.warn('IndexedDB unavailable, using memory only', e);
  }
  if (!mem.state) mem.state = defaultState();
  // forward-fill any keys added in later versions
  const d = defaultState();
  for (const k of Object.keys(d)) if (mem.state[k] === undefined) mem.state[k] = d[k];
  mem.state.settings = { ...DEFAULT_SETTINGS, ...mem.state.settings,
    domains: { ...DEFAULT_SETTINGS.domains, ...(mem.state.settings?.domains || {}) } };
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  return mem;
}

export const S = () => mem.state;
export const attempts = () => mem.attempts;
export const bank = () => mem.bank;

export function save(...keys) {
  (keys.length ? keys : KEYS).forEach(k => dirty.add(k));
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

export async function flush() {
  if (!db) return;
  const ks = [...dirty];
  dirty.clear();
  for (const k of ks) {
    try { await idbSet(k, mem[k]); } catch (e) { console.error('save failed', k, e); }
  }
}

addEventListener('pagehide', () => { flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

export function setBank(items) { mem.bank = items; save('bank'); }
export function addAttempt(a) { mem.attempts.push(a); save('attempts'); }

export function exportAll() {
  const copy = structuredClone({ state: mem.state, attempts: mem.attempts, bank: mem.bank });
  copy.state.settings.apiKey = ''; // never put the key in a backup file
  return JSON.stringify({ app: 'dense', exportedAt: new Date().toISOString(), ...copy });
}

export async function importAll(json) {
  const data = JSON.parse(json);
  if (data.app !== 'dense' || !data.state) throw new Error('Not a Dense backup file');
  const key = mem.state.settings.apiKey;
  mem.state = data.state;
  mem.state.settings.apiKey = mem.state.settings.apiKey || key;
  mem.attempts = data.attempts || [];
  mem.bank = data.bank || [];
  save();
  await flush();
}

export async function resetAll() {
  const key = mem.state.settings.apiKey;
  const settings = mem.state.settings;
  mem.state = defaultState();
  mem.state.settings = { ...settings, apiKey: key };
  mem.attempts = [];
  mem.bank = [];
  save();
  await flush();
}

export function today(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function uid(prefix = 'i') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
