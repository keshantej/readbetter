// Minimal Claude Messages API client for direct browser use with the user's own key.
// The key lives only in this device's storage and is sent only to api.anthropic.com.
//
// API contract for the Claude 5.5 models (Sonnet / Opus / Haiku):
//  - Structured output goes through `output_config.format` (JSON schema); the JSON arrives
//    in a text block. Forced `tool_choice` ("tool"/"any") is rejected on Sonnet and Opus 5.5.
//  - `temperature`, `top_p`, `top_k` are rejected; never send them.
//  - Adaptive thinking is on by default and its tokens count toward `max_tokens`, so budgets
//    are sized for thinking + output and `output_config.effort` controls depth.
//  - Responses can lead with `thinking` blocks: always select blocks by type.

import { S, save } from './store.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// USD per million tokens (input, output). Approximate; used only for the spend meter.
export const MODELS = {
  'claude-haiku-5-5':  { name: 'Haiku 5.5',  in: 0.10, out: 0.50, note: 'Cheapest. Fine for grading and checking, weaker at writing hard items.' },
  'claude-sonnet-5-5': { name: 'Sonnet 5.5', in: 2,    out: 10,   note: 'Recommended. Strong item writer at low cost.' },
  'claude-opus-5-5':   { name: 'Opus 5.5',   in: 4,    out: 20,   note: 'Best judgment. Worth it for your own readings.' },
};

export class ClaudeError extends Error {
  constructor(msg, status, kind = 'api') { super(msg); this.status = status; this.kind = kind; }
}

export const hasKey = () => !!S().settings.apiKey?.trim();

function track(model, usage) {
  if (!usage) return;
  const m = MODELS[model] || MODELS['claude-sonnet-5-5'];
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  const outTok = usage.output_tokens || 0; // includes thinking tokens
  const cost = (inTok * m.in + outTok * m.out) / 1e6;
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const u = S().usage[key] || (S().usage[key] = { in: 0, out: 0, cost: 0, calls: 0 });
  u.in += Math.round(inTok); u.out += outTok; u.cost += cost; u.calls += 1;
}

// Last-call health, shown in the UI so background failures are never silent.
function setStatus(ok, msg = '', job = '') {
  const prev = S().apiStatus || {};
  S().apiStatus = ok
    ? { ok: true, t: Date.now(), lastError: prev.lastError || null }
    : { ok: false, t: Date.now(), msg, job, lastError: { t: Date.now(), msg, job } };
  save('state');
}
export const apiStatus = () => S().apiStatus || null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(body, { timeoutMs = 180000, retries = 2, job = '' } = {}) {
  const key = S().settings.apiKey?.trim();
  if (!key) throw new ClaudeError('Add your Claude API key in Settings to generate new material.', 0, 'nokey');
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      const msg = e.name === 'AbortError' ? 'Claude took too long to respond.' : 'Network error — are you offline?';
      setStatus(false, msg, job);
      throw new ClaudeError(msg, 0, 'network');
    }
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      track(body.model, data.usage);
      setStatus(true);
      return data;
    }
    let msg = `API error ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < retries) {
      await sleep(2500 * (attempt + 1));
      continue;
    }
    if (res.status === 401) msg = 'Your API key was rejected. Check it in Settings.';
    else if (res.status === 403) msg = `Your key isn't allowed to do this: ${msg}`;
    else if (res.status === 404 && /model/i.test(msg)) msg = `Model not available on your account: ${body.model}. Pick another in Settings.`;
    else if (res.status === 429) msg = 'Rate limited by the API. Try again in a minute.';
    else if (res.status === 400 && /credit|billing|balance/i.test(msg)) msg = `Billing: ${msg}`;
    setStatus(false, msg, job);
    throw new ClaudeError(msg, res.status, res.status === 400 ? 'invalid' : 'api');
  }
}

// Make a schema strict-compatible: every object closed and every property required.
// (Structured outputs require additionalProperties:false; requiring all fields keeps
// us far under the optional-parameter limit and makes the output shape predictable.)
export function strict(schema) {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, strict(s)]));
    else if (k === 'items') out.items = strict(v);
    else out[k] = v;
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties || {});
  }
  return out;
}

const textOf = data => (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

function stopError(data, job) {
  if (data.stop_reason === 'refusal') {
    const msg = 'Claude declined this request (safety filter).';
    setStatus(false, msg, job);
    return new ClaudeError(msg, 200, 'refusal');
  }
  return null;
}

// Structured JSON output. Retries once with a bigger budget if thinking ate the limit.
export async function callJSON({ model, system, user, schema, maxTokens = 16000, effort = 'medium', job = '' }) {
  let budget = maxTokens;
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await post({
      model,
      max_tokens: budget,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: { type: 'json_schema', schema: strict(schema) } },
    }, { job });
    const refusal = stopError(data, job);
    if (refusal) throw refusal;
    if (data.stop_reason === 'max_tokens') { budget = Math.min(64000, budget * 2); continue; }
    const text = textOf(data);
    try { return JSON.parse(text); }
    catch {
      const msg = 'Claude returned malformed output.';
      setStatus(false, msg, job);
      throw new ClaudeError(msg, 200, 'parse');
    }
  }
  const msg = 'Claude ran out of room before finishing. Try again.';
  setStatus(false, msg, job);
  throw new ClaudeError(msg, 200, 'max_tokens');
}

export async function callText({ model, system, user, maxTokens = 4000, effort = 'low', job = '' }) {
  const data = await post({
    model, max_tokens: maxTokens, system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort },
  }, { job });
  const refusal = stopError(data, job);
  if (refusal) throw refusal;
  const text = textOf(data).trim();
  if (!text) throw new ClaudeError('Claude returned an empty response. Try again.', 200, 'empty');
  return text;
}

// Exercise the exact request shape the app uses, on every distinct model selected,
// so incompatibilities surface here instead of mid-drill.
export async function testKey() {
  const st = S().settings;
  const models = [...new Set([st.genModel, st.gradeModel, st.packModel])];
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
  const results = await Promise.allSettled(models.map(model => callJSON({
    model, system: 'Connectivity check.', user: 'Return {"ok": true}.', schema, maxTokens: 2000, effort: 'low', job: 'testing your key',
  })));
  const failed = results.map((r, i) => [models[i], r]).filter(([, r]) => r.status === 'rejected');
  if (failed.length) {
    const [model, r] = failed[0];
    throw new ClaudeError(`${MODELS[model]?.name || model}: ${r.reason.message}`, r.reason.status, r.reason.kind);
  }
  return models.map(m => MODELS[m]?.name || m);
}

export function monthSpend() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return S().usage[key] || { in: 0, out: 0, cost: 0, calls: 0 };
}
