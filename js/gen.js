// AI item generation, grading, and validation. Every AI output is validated
// mechanically before it reaches the item bank; anything that fails is dropped.

import { callJSON, callText } from './claude.js';
import { S, uid } from './store.js';
import { TAGS, TAG_KEYS, FUNCTION_KEYS, FUNCTIONS, ROLE_KEYS, QKINDS, DOMAINS } from './taxonomy.js';

// ---------- text utilities ----------

export function norm(s) {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, m => (m === '—' ? '—' : '–'))
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const squash = s => norm(s).replace(/\s+/g, '').toLowerCase();
export const wordCount = s => (norm(s).match(/\S+/g) || []).length;

// Locate an answer inside text, preferring whole-word matches ("or" must not match inside "detector").
export function findSpan(text, answer) {
  if (!answer) return null;
  const esc = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'u').exec(text);
  const i = m ? m.index : text.indexOf(answer);
  return i < 0 ? null : [i, i + answer.length];
}

function shuffleChoices(choices, answer) {
  const idx = choices.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { choices: idx.map(i => choices[i]), answer: idx.indexOf(answer) };
}

const clampLevel = l => Math.max(1, Math.min(7, Math.round(Number(l) || 3)));
const cleanTags = tags => (Array.isArray(tags) ? tags : []).filter(t => TAG_KEYS.includes(t)).slice(0, 3);

// ---------- validation ----------

export function validateParse(raw, meta = {}) {
  const sentence = norm(raw?.sentence);
  if (wordCount(sentence) < 12) return null;
  const tasks = [];
  for (const t of raw.tasks || []) {
    const prompt = norm(t.prompt);
    if (!prompt) continue;
    if (t.kind === 'tap') {
      const answer = norm(t.answer_text ?? t.answer);
      if (!answer || !findSpan(sentence, answer)) continue;
      tasks.push({ kind: 'tap', prompt, answer, explain: norm(t.explain) });
    } else if (t.kind === 'mc') {
      const choices = (t.choices || []).map(norm).filter(Boolean);
      const a = Number(t.answer_index ?? t.answer);
      if (choices.length < 2 || choices.length > 5 || !(a >= 0 && a < choices.length)) continue;
      tasks.push({ kind: 'mc', prompt, ...shuffleChoices(choices, a), explain: norm(t.explain) });
    }
  }
  if (tasks.length < 2) return null;
  let segments = (raw.segments || []).map(s => ({ text: norm(s.text), role: ROLE_KEYS.includes(s.role) ? s.role : 'aside' })).filter(s => s.text);
  if (squash(segments.map(s => s.text).join(' ')) !== squash(sentence)) segments = null;
  return {
    id: uid('p'), type: 'parse', level: clampLevel(meta.level ?? raw.level),
    domain: meta.domain || raw.domain || 'legal', tags: cleanTags(raw.tags),
    sentence, tasks: tasks.slice(0, 4), segments, explain: norm(raw.explain),
    source: meta.source || 'ai', createdAt: Date.now(),
  };
}

export function validateFunction(raw, meta = {}) {
  const paragraph = norm(raw?.paragraph);
  if (wordCount(paragraph) < 40) return null;
  if (!FUNCTION_KEYS.includes(raw.answer)) return null;
  let lead = norm(raw.lead);
  if (!lead || !paragraph.startsWith(lead)) {
    const m = paragraph.match(/^.+?[.?!](?=\s|$)/);
    lead = m ? m[0] : paragraph.split(' ').slice(0, 20).join(' ');
  }
  const rest = paragraph.slice(lead.length).toLowerCase();
  const signals = [...new Set((raw.signals || []).map(norm).filter(s => s && rest.includes(s.toLowerCase())))].slice(0, 6);
  return {
    id: uid('f'), type: 'function', level: clampLevel(meta.level ?? raw.level),
    domain: meta.domain || 'legal', tags: cleanTags(raw.tags),
    paragraph, lead, signals, answer: raw.answer,
    trap: FUNCTION_KEYS.includes(raw.trap) && raw.trap !== raw.answer ? raw.trap : null,
    explain: norm(raw.explain), source: meta.source || 'ai', createdAt: Date.now(),
  };
}

export function validateRead(raw, meta = {}) {
  const passage = String(raw?.passage ?? '').replace(/\r/g, '').split(/\n\s*\n/).map(norm).filter(Boolean).join('\n\n');
  if (wordCount(passage) < 110) return null;
  const questions = [];
  for (const q of raw.questions || []) {
    const choices = (q.choices || []).map(norm).filter(Boolean);
    const a = Number(q.answer);
    if (choices.length < 3 || choices.length > 5 || !(a >= 0 && a < choices.length) || !norm(q.prompt)) continue;
    questions.push({
      kind: QKINDS[q.kind] ? q.kind : 'inferential',
      prompt: norm(q.prompt), ...shuffleChoices(choices, a), explain: norm(q.explain),
    });
  }
  if (questions.length < 3) return null;
  return {
    id: uid('r'), type: 'read', level: clampLevel(meta.level ?? raw.level),
    domain: meta.domain || 'legal', tags: cleanTags(raw.tags),
    title: norm(raw.title) || 'Untitled passage', passage, words: wordCount(passage),
    questions: questions.slice(0, 5), gist: norm(raw.gist),
    easy: !!meta.easy, benchmark: !!meta.benchmark,
    source: meta.source || 'ai', createdAt: Date.now(),
  };
}

// ---------- prompts ----------

const LEVEL_GUIDE = `Difficulty levels (1–7):
1: plain but formal; one main clause with one qualifier or condition. Sentences 25–35 words.
2: a condition plus a short exception or list. 35–45 words.
3: two interacting structures (condition + exception, or a list whose scope matters). 45–60 words.
4: a nested exception or proviso, plus a definition or cross-reference. 55–70 words.
5: three interacting modifiers; an antecedent or modifier-attachment trap that a careless reader gets wrong. 65–85 words.
6: stacked exceptions with provisos, negation, and list scope that changes the outcome. 75–95 words.
7: drafting at the edge of readability — nested provisos, negated conditions, multiple cross-references — yet with exactly one defensible reading. 90–120 words.`;

const ORIGINAL = `- Write ORIGINAL text. Never reproduce or closely paraphrase real statutes, opinions, patents, articles, or books. Invent plausible provisions, parties, statutes ("Section 14(b) of the Model Records Act"), courts, and technologies. Fictional authority is fine; it must read like the real register.`;
const SOURCED = '- The reader supplied their own assigned reading. Quote sentences, paragraphs, and excerpts from it EXACTLY; do not write new passages. Questions, choices, and explanations are your own words.';

const system = (rule = ORIGINAL) => `You write training items for Dense, a daily drill app that trains an expert reader to read complex text faster without losing comprehension.${S().settings.profile?.trim() ? `\n\nAbout the reader (pitch items accordingly): ${S().settings.profile.trim()}` : ''}

Non-negotiable rules:
${rule}
- Every item must have exactly one defensible correct answer. Distractors must be the specific misreadings a fast, careless expert would make (wrong scope, wrong antecedent, dropped negation, exception read as rule), not obviously silly options.
- Difficulty must come from STRUCTURE (scope, nesting, attachment, negation, sequencing), not from obscure vocabulary or trivia.
- Any field described as an exact substring must be copied character-for-character from the text you wrote.
- Explanations are terse and technical: name the structural move that decides the answer.

${LEVEL_GUIDE}

Structure tags you may use: ${TAG_KEYS.map(k => `${k} (${TAGS[k].hint})`).join('; ')}.`;

function domainPick() {
  const on = Object.entries(S().settings.domains).filter(([, v]) => v).map(([k]) => k);
  const keys = on.length ? on : ['legal'];
  return keys[Math.floor(Math.random() * keys.length)];
}

// ---------- output schemas (made strict by claude.js) ----------

const str = { type: 'string' };
const tagList = { type: 'array', items: { type: 'string', enum: TAG_KEYS }, description: '1–3 structure tags.' };

const parseItem = {
  type: 'object',
  properties: {
    level: { type: 'integer' },
    tags: tagList,
    sentence: { type: 'string', description: 'One dense sentence.' },
    tasks: {
      type: 'array',
      description: 'Exactly 3 tasks, mixing "tap" and "mc", ordered as a reader would resolve the sentence.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['tap', 'mc'] },
          prompt: { type: 'string', description: 'tap: e.g. "Tap the main verb", "Tap the word the exception modifies", "Tap who bears the obligation". mc: a scope or consequence question.' },
          answer_text: { type: 'string', description: 'tap: exact 1–5 word substring of the sentence that occurs only once in it. mc: "".' },
          choices: { type: 'array', items: str, description: 'mc: 3–4 choices. tap: [].' },
          answer_index: { type: 'integer', description: 'mc: index of the correct choice. tap: -1.' },
          explain: str,
        },
      },
    },
    segments: {
      type: 'array',
      description: 'Partition of the ENTIRE sentence, in order, into contiguous exact substrings that together reproduce the sentence. Label each by structural role.',
      items: { type: 'object', properties: { text: str, role: { type: 'string', enum: ROLE_KEYS } } },
    },
    explain: { type: 'string', description: 'One or two sentences: the correct reading, stated plainly.' },
  },
};

const functionItem = {
  type: 'object',
  properties: {
    level: { type: 'integer' },
    tags: tagList,
    paragraph: { type: 'string', description: '90–170 words, one paragraph, as if lifted from the middle of a longer document.' },
    lead: { type: 'string', description: 'The paragraph’s first sentence, copied exactly.' },
    signals: { type: 'array', items: str, description: '3–6 signal words/phrases that appear exactly in the REST of the paragraph (e.g. "however", "only where", "it follows that", "to be sure").' },
    answer: { type: 'string', enum: FUNCTION_KEYS, description: FUNCTION_KEYS.map(k => `${k}: ${FUNCTIONS[k].hint}`).join('; ') },
    trap: { type: 'string', enum: FUNCTION_KEYS, description: 'The function a reader who only skims the lead would wrongly pick; must differ from answer.' },
    explain: str,
  },
};

const readItem = {
  type: 'object',
  properties: {
    level: { type: 'integer' },
    tags: tagList,
    title: str,
    passage: { type: 'string', description: 'Separate paragraphs with a blank line.' },
    questions: {
      type: 'array',
      description: 'Exactly 4: one structural, one inferential, one application, one precision.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: Object.keys(QKINDS) },
          prompt: str,
          choices: { type: 'array', items: str, description: '4 choices of similar length.' },
          answer: { type: 'integer', description: 'Index of the correct choice.' },
          explain: str,
        },
      },
    },
    gist: { type: 'string', description: 'Reference one-sentence gist, ≤ 30 words: what the passage establishes, including its key limit.' },
  },
};

const listOf = item => ({ type: 'object', properties: { items: { type: 'array', items: item } } });

// Generation runs at medium effort: thinking is what keeps answer keys consistent.
const GEN = { maxTokens: 24000, effort: 'medium' };

// ---------- generators ----------

export async function generateParse({ level, tags = [], n = 4, domain = domainPick() }) {
  const user = `Write ${n} parse items at level ${level}, domain: ${DOMAINS[domain].prompt}.
Focus structures: ${tags.length ? tags.join(', ') : 'your choice — vary them'}. Each item: 1–3 tags.
Tasks: 3 per item, at least one "tap" and at least one "mc". Good tap targets: the head noun of the subject, the main verb, the party who bears a duty, the word an exception or modifier attaches to, the trigger of a condition. Good mc targets: what a qualifier scopes over, whether a list is conjunctive, what result follows on given facts.
Vary sentence architecture across items; do not start two sentences the same way.`;
  const out = await callJSON({ model: S().settings.genModel, system: system(), user, schema: listOf(parseItem), ...GEN, job: 'writing parse items' });
  return verify((out.items || []).map(r => validateParse(r, { level, domain })).filter(Boolean));
}

export async function generateFunction({ level, tags = [], n = 4, domain = domainPick() }) {
  const used = [...FUNCTION_KEYS].sort(() => Math.random() - 0.5).slice(0, n);
  const user = `Write ${n} paragraph-function items at level ${level}, domain: ${DOMAINS[domain].prompt}.
Use these correct answers, one per item, in any order: ${used.join(', ')}.
At higher levels the lead sentence should invite the trap (e.g. a rebuttal that opens by conceding, a limit that opens by restating the rule, an application that opens with doctrine). At level 1–2 the lead may be fairly telling.
${tags.length ? `Where natural, build in these structures: ${tags.join(', ')}.` : ''}`;
  const out = await callJSON({ model: S().settings.genModel, system: system(), user, schema: listOf(functionItem), ...GEN, job: 'writing function items' });
  return verify((out.items || []).map(r => validateFunction(r, { level, domain })).filter(Boolean));
}

export async function generateRead({ level, tags = [], domain = domainPick(), easy = false, benchmark = false }) {
  const words = easy ? '220–320' : benchmark ? '280' : `${170 + level * 25}–${220 + level * 30}`;
  const user = easy
    ? `Write one reading passage for a pacing/speed drill: clear, well-organized expository prose at level ${level}, ${words} words, domain: ${DOMAINS[domain].prompt}. Linear argument, no tricks; the questions should test whether the reader actually followed the argument at speed.`
    : `Write one dense reading passage at level ${level}, ${words} words${benchmark ? ' (as close to 280 as possible — this is a calibrated weekly benchmark, so keep difficulty squarely at level 4 regardless of anything else)' : ''}, domain: ${DOMAINS[domain].prompt}.
It must make a real argument with at least one limit or exception that changes outcomes. ${tags.length ? `Build in: ${tags.join(', ')}.` : ''}
Questions: structural (how the passage is built or what a clause governs), inferential (what follows but is unstated), application (a NEW short fact pattern the passage's rule must decide), precision (which statement goes one step beyond what the passage supports).`;
  const out = await callJSON({ model: S().settings.genModel, system: system(), user, schema: readItem, ...GEN, job: 'writing a passage' });
  const item = validateRead(out, { level, domain, easy, benchmark });
  return item ? (await verify([item]))[0] || null : null;
}

// ---------- blind answer-key check ----------
// A second pass answers every multiple-choice question without seeing the key.
// Questions where it disagrees are dropped (an ambiguous key is worse than no item).

const verifySchema = {
  type: 'object',
  properties: {
    answers: { type: 'array', items: { type: 'object', properties: { id: str, choice: { type: 'integer' } } } },
  },
};

export async function verify(items) {
  if (!items.length || !S().settings.verifyItems) return items;
  const qs = [];
  items.forEach((it, i) => {
    const ctx = it.type === 'parse' ? `ITEM ${i} — SENTENCE: ${it.sentence}` : it.type === 'function' ? `ITEM ${i} — PARAGRAPH: ${it.paragraph}` : `ITEM ${i} — PASSAGE:\n${it.passage}`;
    const mine = [];
    if (it.type === 'parse') it.tasks.forEach((t, j) => { if (t.kind === 'mc') mine.push({ id: `${i}.${j}`, prompt: t.prompt, choices: t.choices }); });
    if (it.type === 'function') mine.push({ id: `${i}.f`, prompt: 'What is this paragraph mainly doing?', choices: FUNCTION_KEYS.map(k => `${FUNCTIONS[k].name} — ${FUNCTIONS[k].hint}`) });
    if (it.type === 'read') it.questions.forEach((q, j) => mine.push({ id: `${i}.${j}`, prompt: q.prompt, choices: q.choices }));
    mine.forEach((q, k) => qs.push({ ...q, ctx: k === 0 ? ctx : '' }));
  });
  if (!qs.length) return items;
  let out;
  try {
    out = await callJSON({
      model: S().settings.gradeModel,
      system: 'You are a meticulous reader checking a drill bank. Answer each question from the text alone. Pick the single best choice by zero-based index.',
      user: qs.map(q => `${q.ctx ? q.ctx + '\n' : ''}[${q.id}] ${q.prompt}\n${q.choices.map((c, k) => `  ${k}. ${c}`).join('\n')}`).join('\n\n'),
      schema: verifySchema, maxTokens: 16000, effort: 'medium', job: 'checking answer keys',
    });
  } catch (e) {
    console.warn('verification skipped:', e.message);
    return items; // never block generation on the checker
  }
  const got = new Map((out.answers || []).map(a => [String(a.id), a.choice]));
  const agree = (id, key) => !got.has(id) || got.get(id) === key;
  const kept = [];
  items.forEach((it, i) => {
    if (it.type === 'parse') {
      it.tasks = it.tasks.filter((t, j) => t.kind !== 'mc' || agree(`${i}.${j}`, t.answer));
      if (it.tasks.length >= 2) kept.push({ ...it, verified: true });
    } else if (it.type === 'function') {
      if (agree(`${i}.f`, FUNCTION_KEYS.indexOf(it.answer))) kept.push({ ...it, verified: true });
    } else if (it.type === 'read') {
      it.questions = it.questions.filter((q, j) => agree(`${i}.${j}`, q.answer));
      if (it.questions.length >= 3) kept.push({ ...it, verified: true });
    }
  });
  S().quality = S().quality || { checked: 0, dropped: 0, disputes: 0, upheld: 0 };
  S().quality.checked += items.length;
  S().quality.dropped += items.length - kept.length;
  return kept;
}

// ---------- grading ----------

const gistSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: '0 = wrong or empty; 1 = topic only; 2 = main point but misses or distorts the key limit; 3 = main point and key limit, accurately.' },
    feedback: { type: 'string', description: 'One sentence, direct, addressed to the reader ("You…").' },
    missing: { type: 'string', description: 'The single most important thing missing or wrong, or "" if none.' },
  },
};

export async function gradeGist(item, gist) {
  const out = await callJSON({
    model: S().settings.gradeModel,
    system: 'You grade one-sentence summaries strictly and briefly. Reward precision about scope and limits; ignore style. Never inflate.',
    user: `PASSAGE:\n${item.passage}\n\nREFERENCE GIST:\n${item.gist}\n\nREADER'S GIST:\n${gist}`,
    schema: gistSchema, maxTokens: 6000, effort: 'low', job: 'grading your gist',
  });
  return { score: Math.max(0, Math.min(3, Math.round(out.score))), feedback: norm(out.feedback), missing: norm(out.missing) };
}

// ---------- disputes ----------

const disputeSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['key_correct', 'item_flawed'], description: 'item_flawed if the keyed answer is wrong, or if the reader’s answer is equally defensible on the text.' },
    explanation: { type: 'string', description: '2–4 sentences addressed to the reader. If the key stands, show precisely why their reading fails on the text.' },
  },
};

export function describeItem(item) {
  if (item.type === 'parse') return `SENTENCE: ${item.sentence}\n` + item.tasks.map((t, j) =>
    `Task ${j + 1}: ${t.prompt}\n${t.kind === 'tap' ? `Keyed answer: "${t.answer}"` : t.choices.map((c, k) => `  ${k}. ${c}${k === t.answer ? '   ← keyed' : ''}`).join('\n')}`).join('\n');
  if (item.type === 'function') return `PARAGRAPH: ${item.paragraph}\nQuestion: What is this paragraph mainly doing?\nKeyed answer: ${FUNCTIONS[item.answer].name}`;
  return `PASSAGE:\n${item.passage}\n\n` + item.questions.map((q, j) =>
    `Q${j + 1}: ${q.prompt}\n${q.choices.map((c, k) => `  ${k}. ${c}${k === q.answer ? '   ← keyed' : ''}`).join('\n')}`).join('\n');
}

export async function adjudicate(item, responses, note) {
  return callJSON({
    model: S().settings.genModel,
    system: 'You adjudicate disputes about answer keys in a reading-comprehension drill for an expert legal reader. Decide on the text alone. Be rigorous and fair in both directions: concede a flawed key plainly, and defend a correct one precisely.',
    user: `${describeItem(item)}\n\nREADER'S ANSWERS:\n${responses.join('\n')}\n\nREADER'S ARGUMENT:\n${note || '(none given — they believe the key is wrong)'}`,
    schema: disputeSchema, maxTokens: 12000, effort: 'medium', job: 'reviewing your dispute',
  });
}

// ---------- packs from the user's own reading ----------

const packSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for this reading (e.g. case name + section).' },
    level: { type: 'integer', description: 'Overall difficulty 1–7.' },
    parse: { type: 'array', items: parseItem, description: 'Up to 5 of the hardest sentences, each copied EXACTLY from the text.' },
    functions: { type: 'array', items: functionItem, description: 'Up to 4 paragraphs copied EXACTLY from the text ([] if the text has no real paragraphs).' },
    read: { ...readItem, description: 'One excerpt of 200–400 consecutive words copied EXACTLY from the text, with questions.' },
  },
};

export async function buildPack(text) {
  const src = norm(text.replace(/\n\s*\n/g, ' ¶ ')).replace(/ ¶ /g, '\n\n');
  const out = await callJSON({
    model: S().settings.packModel,
    system: system(SOURCED),
    user: `Build a drill pack from this reading. Pick the sentences and paragraphs that are genuinely hardest to parse.\n\n<reading>\n${src.slice(0, 40000)}\n</reading>`,
    schema: packSchema, maxTokens: 32000, effort: 'medium', job: 'building your pack',
  });
  const meta = { source: 'pack' };
  const hay = squash(src);
  const inText = s => hay.includes(squash(s));
  const level = clampLevel(out.level);
  const parse = (out.parse || []).filter(p => inText(p.sentence)).map(p => validateParse({ ...p, level: p.level ?? level }, meta)).filter(Boolean);
  const functions = (out.functions || []).filter(f => inText(f.paragraph)).map(f => validateFunction({ ...f, level: f.level ?? level }, meta)).filter(Boolean);
  const read = out.read && inText(out.read.passage) ? validateRead({ ...out.read, level: out.read.level ?? level }, meta) : null;
  const items = await verify([...parse, ...functions, ...(read ? [read] : [])]);
  return { title: norm(out.title) || 'My reading', level, items };
}

// ---------- coach ----------

export async function coach(summary) {
  return callText({
    model: S().settings.gradeModel,
    system: 'You are a blunt, technically precise reading coach. The user is training to read dense legal and technical text faster. Use only the statistics given. No pep talk, no hedging, no generic study advice.',
    user: `Here are my training statistics as JSON:\n${JSON.stringify(summary)}\n\nGive me: (1) the one bottleneck the data points to, with the numbers that show it; (2) three concrete changes to how I drill this week (which drills, which structures, what speed/accuracy behavior to change); (3) one thing I should stop doing. Under 170 words. Plain text, short numbered lines.`,
    maxTokens: 6000, effort: 'medium', job: 'coaching',
  });
}
