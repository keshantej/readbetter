// Minimal Claude Messages API client for direct browser use with the user's own key.
// The key lives only in this device's storage and is sent only to api.anthropic.com.

import { S, save } from './store.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// USD per million tokens (input, output). Approximate; used only for the spend meter.
export const MODELS = {
  'claude-haiku-5-5':  { name: 'Haiku 5.5',  in: 0.10, out: 0.50, note: 'Cheapest. Fine for grading, weaker at writing hard items.' },
  'claude-sonnet-5-5': { name: 'Sonnet 5.5', in: 2,    out: 10,   note: 'Recommended. Strong item writer at low cost.' },
  'claude-opus-5-5':   { name: 'Opus 5.5',   in: 4,    out: 20,   note: 'Best judgment. Worth it for your own readings.' },
};

export class ClaudeError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export const hasKey = () => !!S().settings.apiKey?.trim();

function track(model, usage) {
  if (!usage) return;
  const m = MODELS[model] || MODELS['claude-sonnet-5-5'];
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  const outTok = usage.output_tokens || 0;
  const cost = (inTok * m.in + outTok * m.out) / 1e6;
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const u = S().usage[key] || (S().usage[key] = { in: 0, out: 0, cost: 0, calls: 0 });
  u.in += Math.round(inTok); u.out += outTok; u.cost += cost; u.calls += 1;
  save('state');
}

async function post(body, { timeoutMs = 120000, retries = 2 } = {}) {
  const key = S().settings.apiKey?.trim();
  if (!key) throw new ClaudeError('Add your Claude API key in Settings to generate new material.', 0);
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
      throw new ClaudeError(e.name === 'AbortError' ? 'Claude took too long to respond.' : 'Network error — are you offline?', 0);
    }
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      track(body.model, data.usage);
      return data;
    }
    let msg = `API error ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < retries) {
      await sleep(2500 * (attempt + 1));
      continue;
    }
    if (res.status === 401) msg = 'Your API key was rejected. Check it in Settings.';
    if (res.status === 404 && /model/i.test(msg)) msg = `Model not available on your account: ${body.model}. Pick another in Settings.`;
    throw new ClaudeError(msg, res.status);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Force a single tool call so the response is schema-shaped JSON.
export async function callTool({ model, system, user, tool, maxTokens = 6000, temperature }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
  };
  if (temperature != null) body.temperature = temperature;
  const data = await post(body);
  const block = (data.content || []).find(b => b.type === 'tool_use');
  if (!block) throw new ClaudeError('Claude returned no structured output.', 0);
  if (data.stop_reason === 'max_tokens') console.warn('Output hit max_tokens; items may be truncated');
  return block.input;
}

export async function callText({ model, system, user, maxTokens = 1200 }) {
  const data = await post({
    model, max_tokens: maxTokens,
    system, messages: [{ role: 'user', content: user }],
  });
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

export async function testKey() {
  const data = await post({
    model: S().settings.gradeModel, max_tokens: 5,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  }, { retries: 0, timeoutMs: 30000 });
  return !!data;
}

export function monthSpend() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return S().usage[key] || { in: 0, out: 0, cost: 0, calls: 0 };
}
