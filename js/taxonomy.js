// Shared vocabularies: structure tags, paragraph functions, segment roles, domains.

export const TAGS = {
  'nested-exception':   { name: 'Nested exceptions',        hint: '"except… unless… provided that" stacked inside each other' },
  'proviso':            { name: 'Provisos',                 hint: '"provided that", "so long as" carve-outs' },
  'and-or-scope':       { name: 'And / or scope',           hint: 'whether a list is conjunctive or disjunctive, and what it groups' },
  'modifier-attachment':{ name: 'Modifier attachment',      hint: 'last-antecedent vs. series-qualifier problems' },
  'antecedent':         { name: 'Antecedents',              hint: 'what "it", "such", "the foregoing", "said" point back to' },
  'double-negation':    { name: 'Negation stacking',        hint: '"not… unless… fails to" chains' },
  'passive-agent':      { name: 'Hidden actors',            hint: 'passive voice and nominalizations that bury who acts' },
  'cross-reference':    { name: 'Cross-references',         hint: '"subject to paragraph (b)", "as defined in"' },
  'definitional':       { name: 'Definitions',              hint: 'means / includes / does not include clauses' },
  'conditional-chain':  { name: 'Condition chains',         hint: 'multi-step if/then triggers and their order' },
  'burden-standard':    { name: 'Burdens & standards',      hint: 'who must prove what, and how strongly' },
  'limiting-words':     { name: 'Limiting words',           hint: '"only", "solely", "at least", "no more than" placement' },
  'temporal-sequence':  { name: 'Timing & sequence',        hint: 'before / after / within / upon conditions' },
  'comparative':        { name: 'Comparatives',             hint: 'more/less, greater-of, to the extent that' },
};
export const TAG_KEYS = Object.keys(TAGS);

export const FUNCTIONS = {
  rule:        { name: 'Rule / claim',         hint: 'States the governing rule or thesis' },
  limit:       { name: 'Exception / limit',    hint: 'Narrows, qualifies, or carves out' },
  application: { name: 'Application',          hint: 'Applies a rule to facts or an example' },
  counter:     { name: 'Counterargument',      hint: 'Presents the opposing view on its own terms' },
  rebuttal:    { name: 'Rebuttal / distinction', hint: 'Answers an objection or distinguishes authority' },
  rationale:   { name: 'Rationale / policy',   hint: 'Explains why the rule exists' },
  background:  { name: 'Background',           hint: 'Facts, history, or procedural posture' },
};
export const FUNCTION_KEYS = Object.keys(FUNCTIONS);

export const ROLES = {
  core:       { name: 'Core',       color: 'var(--role-core)' },
  condition:  { name: 'Condition',  color: 'var(--role-condition)' },
  exception:  { name: 'Exception',  color: 'var(--role-exception)' },
  qualifier:  { name: 'Qualifier',  color: 'var(--role-qualifier)' },
  definition: { name: 'Definition', color: 'var(--role-definition)' },
  reference:  { name: 'Reference',  color: 'var(--role-reference)' },
  aside:      { name: 'Aside',      color: 'var(--role-aside)' },
};
export const ROLE_KEYS = Object.keys(ROLES);

export const QKINDS = {
  structural:  'Structure',
  inferential: 'Inference',
  application: 'Application',
  precision:   'Precision',
};

export const DOMAINS = {
  legal:      { name: 'Statutes & opinions', prompt: 'U.S.-style statutory text, regulations, contract provisions, and appellate judicial opinions' },
  patent:     { name: 'Patent law',          prompt: 'patent claims, examination-guideline prose in the register of the MPEP, and Federal Circuit-style reasoning on validity and infringement' },
  science:    { name: 'Science & engineering', prompt: 'dense research prose from physics, materials science, and engineering (methods, results, and argument sections)' },
  philosophy: { name: 'Philosophy',          prompt: 'analytic philosophy and jurisprudence arguments with premises, objections, and replies' },
  policy:     { name: 'Policy & economics',  prompt: 'regulatory analysis, economic argument, and policy memoranda' },
};
