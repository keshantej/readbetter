// Hand-written starter items (all original, fictional authority) so the app works
// on first launch and offline. AI-generated material replaces these as you train.

import { validateParse, validateFunction, validateRead } from './gen.js';

const T = (prompt, answer, explain) => ({ kind: 'tap', prompt, answer, explain });
const M = (prompt, choices, explain, answer = 0) => ({ kind: 'mc', prompt, choices, answer, explain });
const g = (text, role) => ({ text, role });

const PARSE = [
  { id: 'seed_p01', level: 1, domain: 'legal', tags: ['limiting-words', 'temporal-sequence'],
    sentence: 'A tenant may withhold rent only after giving the landlord written notice of the defect and allowing fourteen days for repair.',
    tasks: [
      T('Tap the main verb.', 'may withhold', '"May withhold" is the permission the whole sentence grants and conditions.'),
      M('What does "only" restrict?', ['When the tenant may withhold rent', 'How much rent may be withheld', 'Which tenants may withhold rent', 'What kind of defect qualifies'], '"Only" sits in front of the "after" phrase, so it limits timing: withholding is permitted solely once both steps are done.'),
      M('Written notice went out ten days ago; no repair yet. May the tenant withhold?', ['No — the fourteen-day window has not run', 'Yes — notice is the only precondition', 'Yes — the defect is still unrepaired', 'No — notice must be given in person'], 'Both conjuncts must be satisfied; "and allowing fourteen days" is a second precondition.'),
    ],
    segments: [g('A tenant may withhold rent', 'core'), g('only after giving the landlord written notice of the defect', 'condition'), g('and allowing fourteen days for repair.', 'condition')],
    explain: 'Permission conditioned on two cumulative steps: notice, then fourteen days.' },

  { id: 'seed_p02', level: 2, domain: 'legal', tags: ['and-or-scope', 'definitional'],
    sentence: 'As used in this part, a "covered device" means any apparatus that emits ionizing radiation or that contains a sealed radioactive source, but does not include a smoke detector sold at retail.',
    tasks: [
      M('Which of these is a covered device?', ['A sealed-source gauge that emits no ionizing radiation', 'A retail smoke detector containing a sealed source', 'An apparatus that emits only microwaves', 'None of these'], 'The definition is disjunctive: containing a sealed source is enough on its own, and only retail smoke detectors are carved out.'),
      T('Tap the word that joins the two alternative definitions.', 'or', '"Or" makes either prong sufficient.'),
      M('What does the "but does not include" clause carve out?', ['Retail smoke detectors, even if they contain a sealed source', 'All smoke detectors', 'All devices sold at retail', 'Devices that emit ionizing radiation'], '"Sold at retail" narrows the exclusion to one channel; non-retail smoke detectors remain covered if they meet a prong.'),
    ],
    segments: [g('As used in this part,', 'reference'), g('a "covered device" means any apparatus that emits ionizing radiation or that contains a sealed radioactive source,', 'definition'), g('but does not include a smoke detector sold at retail.', 'exception')],
    explain: 'Two independent ways in, one narrow way out.' },

  { id: 'seed_p03', level: 3, domain: 'legal', tags: ['modifier-attachment', 'and-or-scope'],
    sentence: "The board shall reimburse reasonable travel and lodging expenses incurred by a member in attending a meeting held outside the member's county of residence.",
    tasks: [
      T('Tap who bears the obligation.', 'The board', '"Shall" binds the board; the member is the beneficiary.'),
      M('Does "reasonable" limit lodging expenses as well as travel?', ['Yes — it modifies the series "travel and lodging expenses"', 'No — it modifies only "travel"', 'No — lodging is reimbursed in full', 'It modifies neither; it is surplusage'], 'Both nouns share the head "expenses"; a modifier before a tight, parallel series reaches the whole series.'),
      M("A member who lives in the county attends a meeting held in that same county. Reimbursable?", ["No — the meeting must be outside the member's county of residence", 'Yes, if reasonable', 'Only lodging', 'Only travel'], 'The location condition is a trigger for the whole duty.'),
    ],
    segments: [g('The board shall reimburse reasonable travel and lodging expenses', 'core'), g('incurred by a member in attending a meeting', 'qualifier'), g("held outside the member's county of residence.", 'condition')],
    explain: 'Duty on the board; "reasonable" spans the series; reimbursement only for out-of-county meetings.' },

  { id: 'seed_p04', level: 3, domain: 'science', tags: ['comparative', 'conditional-chain'],
    sentence: 'Samples annealed above 450 °C showed a twofold increase in grain size relative to the as-deposited films, whereas samples annealed below that temperature showed no measurable change unless the anneal exceeded six hours.',
    tasks: [
      T('Tap what "that temperature" refers back to.', '450 °C', 'The only temperature stated earlier is 450 °C.'),
      T('Tap the baseline the twofold increase is measured against.', 'as-deposited films', '"Relative to" introduces the comparison baseline.'),
      M('A sample annealed at 400 °C for eight hours: what does the sentence establish?', ['Only that the "no change" finding does not cover it', 'It showed no measurable change', 'It showed a twofold increase', 'It showed a change smaller than twofold'], '"Unless" removes long anneals from the no-change finding but says nothing about what they did show.'),
    ],
    segments: [g('Samples annealed above 450 °C showed a twofold increase in grain size', 'core'), g('relative to the as-deposited films,', 'qualifier'), g('whereas samples annealed below that temperature showed no measurable change', 'core'), g('unless the anneal exceeded six hours.', 'exception')],
    explain: 'Above threshold: growth. Below threshold: no change, except that long anneals fall outside that finding.' },

  { id: 'seed_p05', level: 4, domain: 'legal', tags: ['nested-exception', 'cross-reference', 'burden-standard'],
    sentence: 'Except as provided in subsection (d), a party seeking to amend a pleading after the scheduling deadline must show good cause, unless the amendment merely corrects a clerical error, in which case leave shall be freely given.',
    tasks: [
      T('Tap the standard a late-moving party must meet by default.', 'good cause', 'Good cause is the default; the clerical-error branch is the exception.'),
      M('After the deadline, a party moves only to fix a misspelled party name (subsection (d) does not apply). Which standard governs?', ['Leave freely given', 'Good cause', "Subsection (d)'s standard", 'No amendment is allowed'], 'A pure clerical correction triggers the "unless… in which case" branch.'),
      T('Tap the phrase that could displace everything else in the sentence.', 'Except as provided in subsection (d)', 'An opening "except as provided" clause subordinates the whole rule to the cross-referenced provision.'),
    ],
    segments: [g('Except as provided in subsection (d),', 'reference'), g('a party seeking to amend a pleading', 'core'), g('after the scheduling deadline', 'condition'), g('must show good cause,', 'core'), g('unless the amendment merely corrects a clerical error,', 'exception'), g('in which case leave shall be freely given.', 'qualifier')],
    explain: 'Default: good cause for late amendments. Clerical fixes: freely given. All of it yields to (d).' },

  { id: 'seed_p06', level: 4, domain: 'patent', tags: ['antecedent', 'cross-reference'],
    sentence: 'A claim reciting a result without the steps for achieving it shall be examined under paragraph (4), and such a claim, if allowed, shall cover only the steps described in the specification and their equivalents, not every method that achieves the result.',
    tasks: [
      T('Tap the phrase "such a claim" points back to.', 'A claim reciting a result', '"Such" reaches back to the result-only claim defined at the start.'),
      M('What triggers examination under paragraph (4)?', ['The claim recites a result but not the steps to achieve it', 'The claim has been allowed', 'The specification describes the steps', 'The claim covers equivalents'], 'The participial phrase "reciting a result without the steps" defines the class.'),
      M('An allowed claim of this kind covers which methods?', ['The described steps and their equivalents', 'Every method that achieves the result', 'Only the literal described steps, no equivalents', 'Any method examined under paragraph (4)'], '"Only" limits coverage to described steps plus equivalents; the trailing "not every method" makes the exclusion explicit.'),
    ],
    segments: [g('A claim reciting a result without the steps for achieving it shall be examined', 'core'), g('under paragraph (4),', 'reference'), g('and such a claim,', 'core'), g('if allowed,', 'condition'), g('shall cover only the steps described in the specification and their equivalents,', 'core'), g('not every method that achieves the result.', 'exception')],
    explain: 'Result-only claims get special examination and, if allowed, are confined to disclosed steps plus equivalents.' },

  { id: 'seed_p07', level: 5, domain: 'legal', tags: ['double-negation', 'burden-standard', 'nested-exception'],
    sentence: 'No insurer shall deny a claim on the ground that the insured failed to give timely notice unless the insurer demonstrates that the delay prejudiced its ability to investigate, and no such showing is required where the policy itself makes notice a condition precedent to coverage.',
    tasks: [
      T('Tap who bears the burden of showing prejudice.', 'the insurer', '"Unless the insurer demonstrates" puts the burden on the insurer.'),
      M('Policy says nothing about conditions precedent; notice was late; no prejudice. May the insurer deny on late-notice grounds?', ['No', 'Yes', 'Only if the delay exceeded the policy period', 'Only after an investigation'], 'The prohibition applies and the prejudice escape hatch is not satisfied.'),
      M('Policy makes notice a condition precedent; notice was late; no prejudice. Under this sentence?', ['Denial is allowed — no prejudice showing is required', 'Denial barred — prejudice must still be shown', 'Denial barred — all late-notice denials are prohibited', 'Allowed only with the insured’s consent'], 'The second clause removes the prejudice requirement for condition-precedent policies.'),
    ],
    segments: [g('No insurer shall deny a claim', 'core'), g('on the ground that the insured failed to give timely notice', 'condition'), g('unless the insurer demonstrates that the delay prejudiced its ability to investigate,', 'exception'), g('and no such showing is required', 'exception'), g('where the policy itself makes notice a condition precedent to coverage.', 'condition')],
    explain: 'Late-notice denials need prejudice proved by the insurer — except under condition-precedent policies.' },

  { id: 'seed_p08', level: 5, domain: 'science', tags: ['antecedent', 'limiting-words'],
    sentence: 'Because the dopant segregates to grain boundaries only at concentrations exceeding its solubility limit, the conductivity enhancement reported for the 2 at.% films, which lie below that limit, cannot be attributed to boundary segregation and must instead reflect the reduced trap density measured in those films.',
    tasks: [
      T('Tap what "which" refers to.', 'the 2 at.% films', 'The nonrestrictive "which" clause modifies the films, telling you they sit below the limit.'),
      M('What work does "only" do?', ['Segregation happens solely above the limit, so it cannot explain effects below it', 'The dopant goes solely to grain boundaries and nowhere else', 'Only the 2 at.% films were measured', 'Conductivity rises solely above the limit'], '"Only" scopes over the concentration condition, which is what licenses the elimination argument.'),
      M('What does the sentence conclude causes the enhancement?', ['Reduced trap density', 'Boundary segregation', 'Exceeding the solubility limit', 'Increased grain size'], 'The "because" premise eliminates segregation; "must instead reflect" names the remaining cause.'),
    ],
    segments: [g('Because the dopant segregates to grain boundaries only at concentrations exceeding its solubility limit,', 'condition'), g('the conductivity enhancement reported for the 2 at.% films,', 'core'), g('which lie below that limit,', 'aside'), g('cannot be attributed to boundary segregation', 'core'), g('and must instead reflect the reduced trap density measured in those films.', 'core')],
    explain: 'Elimination argument: segregation needs supersaturation; these films are below it; so trap density explains the result.' },

  { id: 'seed_p09', level: 6, domain: 'legal', tags: ['nested-exception', 'proviso', 'modifier-attachment'],
    sentence: 'A covered entity shall not disclose protected records to any third party other than an affiliate or a contractor bound by a written confidentiality agreement, except that disclosure to a government agency is permitted pursuant to a subpoena, provided that the entity notifies the affected individual within ten days unless a court orders otherwise.',
    tasks: [
      M('Under the most natural reading, does "bound by a written confidentiality agreement" apply to affiliates?', ['No — it attaches to "a contractor" only', 'Yes — it modifies both affiliates and contractors', 'It applies to government agencies', 'It modifies "third party"'], 'The repeated determiner ("an affiliate or a contractor") separates the two nouns, so the trailing modifier most naturally reaches only the nearer one.'),
      M('Entity discloses to an agency under a subpoena and notifies the individual on day 14; no court order. Compliant?', ['No — the proviso required notice within ten days', 'Yes — subpoena disclosures are always permitted', 'Yes — the agency counts as an affiliate', 'No — agency disclosures are barred entirely'], 'The subpoena exception is itself conditioned by the proviso.'),
      T('Tap the phrase that can switch off the notice requirement.', 'unless a court orders otherwise', 'An exception nested inside the proviso, which is nested inside the exception.'),
    ],
    segments: [g('A covered entity shall not disclose protected records to any third party', 'core'), g('other than an affiliate or a contractor', 'exception'), g('bound by a written confidentiality agreement,', 'qualifier'), g('except that disclosure to a government agency is permitted pursuant to a subpoena,', 'exception'), g('provided that the entity notifies the affected individual within ten days', 'condition'), g('unless a court orders otherwise.', 'exception')],
    explain: 'Prohibition → two carve-outs → subpoena exception → notice proviso → court-order exception to the proviso.' },

  { id: 'seed_p10', level: 6, domain: 'patent', tags: ['temporal-sequence', 'conditional-chain'],
    sentence: "An applicant who files a continuing application before the parent application is abandoned or patented may claim the parent's filing date for any claim fully supported by the parent's disclosure, but a claim adding matter not disclosed in the parent is entitled only to the continuing application's actual filing date.",
    tasks: [
      M('The parent was abandoned March 1; the continuing application was filed March 5. Under this sentence, may it claim the parent’s date?', ['No — it must be filed before abandonment', 'Yes, for fully supported claims', 'Yes, for every claim', 'Only for claims adding new matter'], 'Filing before abandonment or issuance is the gateway condition.'),
      M('A timely continuing application has claim 1 (fully supported) and claim 2 (adds new matter). Which dates?', ["Claim 1: parent's date; claim 2: actual filing date", "Both: parent's date", 'Both: actual filing date', "Claim 1: actual date; claim 2: parent's date"], 'Priority is assessed claim by claim.'),
      T("Tap the condition each claim must meet to get the parent's date.", "fully supported by the parent's disclosure", 'The per-claim condition, distinct from the per-application timing condition.'),
    ],
    segments: [g('An applicant', 'core'), g('who files a continuing application before the parent application is abandoned or patented', 'condition'), g("may claim the parent's filing date", 'core'), g("for any claim fully supported by the parent's disclosure,", 'condition'), g("but a claim adding matter not disclosed in the parent is entitled only to the continuing application's actual filing date.", 'exception')],
    explain: 'Two layers: an application-level timing gate, then claim-by-claim support.' },

  { id: 'seed_p11', level: 7, domain: 'legal', tags: ['cross-reference', 'nested-exception', 'double-negation', 'limiting-words'],
    sentence: "Notwithstanding section 12, a lessee who has not cured a default within the period specified in subsection (b) shall not be entitled to the renewal option unless the default arose solely from a failure of the lessor to perform, in which case the period shall run only from the date the lessor's performance is complete, except where the lessee has waived renewal in writing.",
    tasks: [
      T('Tap the provision this sentence overrides.', 'section 12', '"Notwithstanding" means this sentence wins over section 12 where they conflict.'),
      M("The lessee missed the cure period; the default arose partly from the lessor's failure and partly from the lessee's own. Renewal?", ['Not entitled — "solely" is not met', 'Entitled — any lessor failure suffices', "The period restarts from the lessor's performance", 'Depends on section 12'], '"Solely" makes mixed causation fall back into the default rule.'),
      M("Default arose solely from the lessor's failure. The lessor finished performing June 1; the lessee cured within the subsection (b) period counted from June 1; no written waiver. Renewal?", ['Entitled — the cure is timely measured from June 1', 'Not entitled — the period ran from the original default', 'Not entitled — section 12 controls', 'Entitled only if section 12 allows'], 'The "in which case" clause re-anchors the cure period, so the lessee has cured "within the period."'),
    ],
    segments: [g('Notwithstanding section 12,', 'reference'), g('a lessee', 'core'), g('who has not cured a default within the period specified in subsection (b)', 'condition'), g('shall not be entitled to the renewal option', 'core'), g('unless the default arose solely from a failure of the lessor to perform,', 'exception'), g("in which case the period shall run only from the date the lessor's performance is complete,", 'qualifier'), g('except where the lessee has waived renewal in writing.', 'exception')],
    explain: 'Uncured default kills renewal, unless caused solely by the lessor (then the clock restarts) — and a written waiver defeats renewal regardless.' },

  { id: 'seed_p12', level: 2, domain: 'philosophy', tags: ['conditional-chain', 'antecedent'],
    sentence: 'If a theory predicts every possible observation, then no observation can count against it, and a theory that nothing can count against tells us nothing about the world.',
    tasks: [
      T('Tap what "it" refers to.', 'a theory', '"It" reaches back to the theory that predicts every observation.'),
      M('What is the argument’s structure?', ['A chain: predicts everything → unfalsifiable → uninformative', 'Two independent claims', 'A definition followed by an exception', 'A conditional whose consequent is denied'], 'The consequent of the first clause becomes the subject of the second.'),
      T('Tap the conclusion the sentence builds toward.', 'tells us nothing about the world', 'The final predicate is where the chain lands.'),
    ],
    segments: [g('If a theory predicts every possible observation,', 'condition'), g('then no observation can count against it,', 'core'), g('and a theory that nothing can count against tells us nothing about the world.', 'core')],
    explain: 'Hypothetical syllogism: universal prediction implies unfalsifiability implies emptiness.' },

  { id: 'seed_p13', level: 1, domain: 'science', tags: ['comparative'],
    sentence: 'Thin films deposited at room temperature were amorphous, but films deposited above 300 °C were polycrystalline.',
    tasks: [
      T('Tap the word that marks the contrast.', 'but', '"But" sets the two deposition regimes against each other.'),
      T('Tap what the high-temperature films were.', 'polycrystalline', 'The predicate of the second clause.'),
      M('A film deposited at 250 °C: what does the sentence establish?', ['Nothing directly — it covers only room temperature and above 300 °C', 'It is amorphous', 'It is polycrystalline', 'It is partly crystalline'], 'The sentence reports two regimes and is silent between them.'),
    ],
    segments: [g('Thin films deposited at room temperature were amorphous,', 'core'), g('but films deposited above 300 °C were polycrystalline.', 'core')],
    explain: 'Two data points, no claim about the interval between them.' },

  { id: 'seed_p14', level: 3, domain: 'policy', tags: ['comparative', 'limiting-words'],
    sentence: 'The penalty shall be the greater of $5,000 or twice the gain realized, but in no event more than the maximum fine authorized for the underlying offense.',
    tasks: [
      M('Gain realized: $1,000; maximum fine: $50,000. Penalty?', ['$5,000', '$2,000', '$50,000', '$7,000'], 'Greater of $5,000 and $2,000 is $5,000; under the cap.'),
      M('Gain realized: $40,000; maximum fine: $50,000. Penalty?', ['$50,000', '$80,000', '$40,000', '$5,000'], 'Twice the gain is $80,000, capped at $50,000.'),
      T('Tap the phrase that caps the penalty.', 'in no event more than', 'A ceiling applied after the "greater of" computation.'),
    ],
    segments: [g('The penalty shall be the greater of $5,000 or twice the gain realized,', 'core'), g('but in no event more than the maximum fine authorized for the underlying offense.', 'qualifier')],
    explain: 'Floor-style "greater of", then a hard cap.' },
];

const FUNCTION = [
  { id: 'seed_f01', level: 4, domain: 'legal', tags: ['antecedent'], answer: 'rebuttal', trap: 'counter',
    paragraph: 'The defendant is correct that the statute does not expressly mention electronic records. But the absence of an express reference proves less than the defendant supposes. The statute defines a "record" as any information fixed in a medium from which it can be retrieved, and nothing in that definition turns on whether the medium is paper. Indeed, the legislature amended a neighboring provision in 2009 to exclude certain digital logs, an amendment that would have been unnecessary if digital material fell outside the definition to begin with. The omission, therefore, does not carry the weight the defendant places on it.',
    signals: ['But', 'proves less than', 'Indeed', 'would have been unnecessary', 'therefore'],
    explain: 'Opens by conceding a premise, then dismantles the inference drawn from it: a classic concede-then-rebut.' },
  { id: 'seed_f02', level: 3, domain: 'legal', tags: ['nested-exception'], answer: 'limit', trap: 'rule',
    paragraph: 'Under the general rule, a landowner owes no duty to warn trespassers of dangerous conditions on the land. That rule yields, however, where the landowner knows that children are likely to trespass and the condition is one they cannot be expected to appreciate. In such cases, the burden of eliminating the danger is weighed against the risk to the child, and liability follows only if the burden is slight compared with the risk. The exception is deliberately narrow: it does not reach adult trespassers, and it does not reach dangers so obvious that a child of ordinary intelligence would avoid them.',
    signals: ['however', 'In such cases', 'only if', 'deliberately narrow', 'does not reach'],
    explain: 'The lead restates a rule only to carve an exception out of it; the rest of the paragraph defines the exception’s edges.' },
  { id: 'seed_f03', level: 4, domain: 'patent', tags: ['conditional-chain'], answer: 'application', trap: 'rule',
    paragraph: 'A claim is anticipated only if a single prior-art reference discloses every limitation, arranged as in the claim. The 2014 brochure discloses the housing, the sensor, and the wireless transmitter recited in claim 3. It also discloses a battery, though it places the battery outside the housing, whereas claim 3 requires a battery disposed within it. Because the brochure arranges that element differently, it does not disclose the limitations of claim 3 as arranged in the claim. Claim 3 is therefore not anticipated by the brochure, although the difference in arrangement may well be an obvious one.',
    signals: ['also', 'though', 'whereas', 'Because', 'therefore', 'although'],
    explain: 'The rule sentence is a launch pad; the paragraph’s work is applying it element by element to the brochure.' },
  { id: 'seed_f04', level: 3, domain: 'legal', tags: [], answer: 'rationale', trap: 'rule',
    paragraph: 'The requirement that a contract for the sale of land be in writing serves purposes that oral testimony cannot. Land transactions are typically large, infrequent, and consequential for third parties such as lenders and later purchasers, who must be able to rely on the record. A writing fixes the terms at the moment of agreement, before memories fade or interests diverge. It also forces the parties to pause before committing to an obligation of that size. These functions explain why courts have resisted invitations to dilute the requirement, even in cases where an oral agreement plainly occurred.',
    signals: ['typically', 'must be able to rely', 'also', 'These functions explain why', 'even in cases where'],
    explain: 'Everything after the lead answers "why": reliance, fixation, deliberation.' },
  { id: 'seed_f05', level: 2, domain: 'philosophy', tags: ['conditional-chain'], answer: 'counter', trap: 'rebuttal',
    paragraph: 'One might object that the argument proves too much. If unfalsifiable theories are uninformative, then so is the claim that every event has a cause, since no observation could refute it either; yet that claim seems to guide inquiry in a way that matters. On this view, a theory can be informative not by excluding observations but by directing which questions we ask. The objector concludes that falsifiability is at best a sufficient mark of empirical content, not a necessary one.',
    signals: ['If', 'then so is', 'yet', 'On this view', 'The objector concludes'],
    explain: 'The paragraph voices the objection on its own terms and never answers it.' },
  { id: 'seed_f06', level: 2, domain: 'legal', tags: ['temporal-sequence'], answer: 'background', trap: 'application',
    paragraph: 'The dispute arises from a 2019 supply agreement between Halvorsen Metals and the Crestline Water District. Under the agreement, Halvorsen was to deliver corrosion-resistant pipe in four installments over eighteen months. The first two deliveries were accepted without objection. After the third, the district’s engineer reported pitting in several segments and withheld payment pending testing. Halvorsen suspended the fourth delivery, and each party now contends that the other committed the first material breach.',
    signals: ['Under the agreement', 'After the third', 'pending', 'now contends'],
    explain: 'Pure facts and posture; no rule is stated or applied.' },
  { id: 'seed_f07', level: 4, domain: 'science', tags: ['comparative'], answer: 'rule', trap: 'background',
    paragraph: 'Across all twelve compositions, films thicker than about 80 nm cracked on cooling, while thinner films did not. The threshold scaled with the thermal-expansion mismatch between film and substrate, falling to roughly 40 nm for the largest mismatch. We therefore propose that cracking is governed by a critical thickness set by the stored elastic energy, which rises with both thickness and mismatch strain. Below that thickness, the energy released by forming a crack is insufficient to pay for the new surfaces created.',
    signals: ['while', 'scaled with', 'We therefore propose', 'Below that thickness'],
    explain: 'The data in the lead are evidence; the paragraph exists to state the governing principle.' },
  { id: 'seed_f08', level: 5, domain: 'patent', tags: ['limiting-words', 'temporal-sequence'], answer: 'limit', trap: 'rule',
    paragraph: 'An inventor’s own public disclosure ordinarily does not count as prior art against her application if she files within one year. That grace period protects the disclosure itself, but its protection is narrower than often assumed. It does not shield the application from a third party’s intervening disclosure of a different, independently developed variant, and it offers no protection in jurisdictions that require absolute novelty. An inventor who relies on the grace period abroad may thus find that her own publication bars her.',
    signals: ['but', 'narrower than often assumed', 'does not shield', 'no protection', 'thus'],
    explain: 'The rule is stipulated in the lead so the paragraph can mark what it does not cover.' },
  { id: 'seed_f09', level: 3, domain: 'policy', tags: ['comparative'], answer: 'application', trap: 'rule',
    paragraph: 'A tax creates deadweight loss when it discourages transactions that would otherwise have been mutually beneficial. Consider a $2 levy on each ride offered by a ride-hailing service. Riders who valued a trip at $12 and paid $11 before the tax now face a price above their valuation and stop riding. Those lost trips generate no revenue for the government and no surplus for anyone; that is the deadweight loss. Trips by riders who valued them far above the new price continue, and the levy on those trips is a transfer, not a loss.',
    signals: ['Consider', 'now face', 'that is', 'continue', 'not a loss'],
    explain: 'Definition up front, then a worked example that occupies the paragraph.' },
  { id: 'seed_f10', level: 6, domain: 'legal', tags: ['and-or-scope'], answer: 'rebuttal', trap: 'rule',
    paragraph: 'The rule that a later statute controls over an earlier one is well settled. It does not follow that the 2018 amendment displaced the earlier venue provision. The later-in-time canon resolves genuine conflicts; it says nothing about statutes that can be read together. Here the amendment governs where an action may be filed, while the earlier provision governs when a transfer may be ordered after filing. Read as addressing different stages of litigation, the two provisions do not conflict, and the canon on which the appellant relies never comes into play.',
    signals: ['It does not follow', 'says nothing about', 'Here', 'while', 'never comes into play'],
    explain: 'Accepts the canon the other side invokes, then shows its precondition (a real conflict) is missing.' },
];

const Q = (kind, prompt, choices, explain, answer = 0) => ({ kind, prompt, choices, answer, explain });

const READ = [
  { id: 'seed_r01', level: 2, domain: 'science', easy: true, title: 'Why Bridges Have Expansion Joints',
    passage: `Steel and concrete expand when heated and contract when cooled. Over a span of a few meters the change is small, but over a bridge hundreds of meters long it adds up. A steel deck 300 meters long can grow by more than ten centimeters between a cold winter night and a hot summer afternoon. If the deck were fixed rigidly at both ends, that growth would have nowhere to go. The structure would push against its own supports, building stresses large enough to buckle the deck or crack the abutments.

Engineers solve the problem by letting the bridge move. Expansion joints are deliberate gaps placed at intervals along the deck, often spanned by interlocking steel fingers or rubber seals that let vehicles pass smoothly while the gap opens and closes. Bearings beneath the deck do similar work: they carry the weight of the structure while allowing it to slide or rotate slightly.

The design involves trade-offs. Joints are expensive to maintain, because water, salt, and debris collect in them and attack the steel. For that reason, some shorter bridges are now built as integral structures with no joints at all; the deck is tied to the abutments, and the abutments themselves are designed to flex. This approach works only when the total movement is modest. For long spans, there is still no substitute for giving the structure room to breathe.`,
    questions: [
      Q('structural', 'What role does the third paragraph play?', ['It qualifies the solution by explaining its costs and when an alternative works', 'It introduces the basic problem of thermal expansion', 'It explains how bearings work', 'It argues that expansion joints should be abolished'], 'Paragraph 3 turns from solution to trade-offs and limits.'),
      Q('inferential', 'Why is a jointless design riskier on a long bridge than a short one?', ['Thermal movement grows with length, so there is more to absorb', 'Long bridges carry heavier traffic', 'Salt collects more on long bridges', 'Bearings cannot support long decks'], 'The 300-meter example and "works only when total movement is modest" together imply length drives movement.'),
      Q('application', 'An engineer designs a 25-meter footbridge in a mild climate and wants low maintenance. What does the passage suggest?', ['An integral, jointless design may suit it', 'It must have finger joints at both ends', 'It needs no flexibility of any kind', 'Thermal expansion is irrelevant for footbridges'], 'Short span plus mild climate means modest movement — the integral design’s condition.'),
      Q('precision', 'Which claim goes beyond what the passage says?', ['Integral bridges are cheaper to build than jointed ones', 'Joints collect water, salt, and debris', 'Bearings let the deck slide or rotate slightly', 'A 300-meter steel deck can grow by over ten centimeters'], 'The passage discusses maintenance cost, not construction cost.'),
    ],
    gist: 'Bridges must accommodate thermal expansion, usually with joints and bearings; jointless integral designs avoid joint upkeep but work only when total movement is modest.' },

  { id: 'seed_r02', level: 2, domain: 'legal', easy: true, title: 'Why Courts Follow Precedent',
    passage: `When a court decides a case, it does more than resolve the dispute in front of it. Its reasoning becomes a guide for later courts facing similar questions. This practice, known as following precedent, rests on a simple idea: like cases should be treated alike.

The benefits are practical. People can plan their affairs if they can predict how courts will rule. Lawyers can advise clients without guessing at each judge's personal views. And courts save effort, because they need not rethink every settled question from the beginning.

Precedent is not absolute, however. A court is bound mainly by decisions of higher courts in its own system; decisions from other systems may persuade but do not control. Even binding precedent applies only to cases that are genuinely similar. A later court may distinguish an earlier decision by pointing to a fact that made a real difference to the outcome, such as a written contract where the earlier case involved only an oral promise.

Highest courts can also overrule their own past decisions, but they do so reluctantly. Before abandoning a precedent, a court will usually ask whether the earlier reasoning has proved unworkable, whether later developments have undermined it, and how much people have relied on it. A rule that has shaped countless contracts or property titles is harder to discard than one that has guided little conduct, even if the court now doubts it was right.`,
    questions: [
      Q('structural', 'How is the passage organized?', ['Principle, its benefits, its limits, and how it can be abandoned', 'A case history followed by a holding', 'Two competing theories and a resolution', 'A list of landmark precedents'], 'Each paragraph does one of those four jobs, in order.'),
      Q('inferential', 'Why does reliance make a court more reluctant to overrule?', ['Overruling would unsettle arrangements made in trust of the old rule', 'Relied-upon precedents are always correct', 'Higher courts forbid it', 'Reliance makes a case factually different'], 'The contracts-and-titles example shows the cost of unsettling conduct built on the rule.'),
      Q('application', "A trial court faces its state supreme court's precedent on identical facts but thinks it is wrong. What should it do?", ['Follow it — it is bound by higher courts in its system', 'Overrule it', 'Distinguish it because it disagrees', 'Treat it as merely persuasive'], 'Only highest courts overrule; distinguishing requires a material factual difference.'),
      Q('precision', 'Which statement goes beyond the passage?', ['Courts never overrule precedents people have relied on', 'A court can distinguish a precedent on a material factual difference', 'Decisions from other systems may persuade', 'Precedent helps lawyers advise clients'], 'Reliance makes overruling harder, not impossible.'),
    ],
    gist: 'Courts follow precedent for predictability and efficiency, but it binds only within a hierarchy and for genuinely similar cases, and highest courts overrule reluctantly, weighing reliance.' },

  { id: 'seed_r03', level: 3, domain: 'legal', tags: ['temporal-sequence', 'cross-reference'], title: 'Two Retention Duties',
    passage: `Section 4 of the Model Records Retention Act requires a regulated firm to preserve any record that relates to a customer transaction for five years after the transaction closes. The duty is broad in subject matter but narrow in trigger. It reaches emails, chat messages, and voice recordings alike, so long as the record relates to a transaction; but it does not attach until a transaction exists. Preliminary discussions that never ripen into a transaction fall outside Section 4, however detailed they may be.

Section 6 adds a separate and more demanding duty. Once a firm reasonably anticipates litigation concerning a customer, it must preserve every record concerning that customer, whether or not the record relates to a transaction, until the litigation is finally resolved. The two duties can therefore overlap without coinciding. A record may be covered by Section 6 long after its Section 4 period has run, and a record that Section 4 never reached—a note from an abandoned negotiation, for example—may become subject to Section 6 the moment litigation is foreseeable.

Firms sometimes treat the five-year period as a safe harbor, routinely deleting records on the first day after it expires. That practice is lawful under Section 4 standing alone. But because Section 6 is triggered by anticipation rather than by the filing of a complaint, a firm that deletes on schedule while a dispute is brewing risks violating the second duty while honoring the first.`,
    questions: [
      Q('structural', 'How do Section 4 and Section 6 relate?', ['Independent duties with different triggers and scopes that can overlap', 'Section 6 is an exception to Section 4', 'Section 6 extends the Section 4 period', 'Section 4 implements Section 6'], '"Separate," "overlap without coinciding," and the two examples establish independence.'),
      Q('inferential', 'Why is the safe-harbor deletion practice risky?', ['Section 6 can require keeping records the Section 4 schedule would delete, before any suit is filed', 'Section 4 forbids routine deletion', 'Deletion is unlawful once five years pass', 'Retention policies are disfavored generally'], 'Anticipation, not filing, triggers Section 6.'),
      Q('application', 'A firm negotiated with a customer in 2019 but no deal closed. In 2026 it reasonably anticipates the customer will sue. Must it keep its 2019 negotiation notes?', ['Yes — under Section 6', 'No — Section 4 never reached them', 'Yes — under Section 4', 'No — the five-year period has run'], 'Section 6 covers every record concerning the customer once litigation is anticipated.'),
      Q('precision', 'Which statement goes beyond the passage?', ['Violating Section 6 carries heavier penalties than violating Section 4', 'Section 4 covers voice recordings that relate to a transaction', 'Deleting right after five years is lawful under Section 4 alone', 'A record can be covered by Section 6 after its Section 4 period ends'], '"More demanding" refers to scope, not sanctions; penalties are never discussed.'),
    ],
    gist: 'Section 4 requires keeping transaction records five years; Section 6 separately requires keeping all customer records once litigation is anticipated, so on-schedule deletion can still violate Section 6.' },

  { id: 'seed_r04', level: 4, domain: 'patent', tags: ['burden-standard', 'limiting-words'], title: 'Functional Genus Claims',
    passage: `A patent claim may define its subject matter by what it does rather than by what it is. A claim to any polymer that reduces friction on steel by at least 40 percent covers every polymer with that property, whether or not the inventors ever made it. Such functional genus claims are attractive to applicants precisely because they are broad: a competitor cannot escape them by designing a structurally different molecule with the same effect.

That breadth is also their vulnerability. The specification must teach a skilled reader how to make and use the full scope of what is claimed, not merely the handful of examples the inventors tested. Where the claimed function is achieved by a few closely related structures, a description of those structures and a reliable method for testing candidates may suffice. Where it is achieved by structurally diverse compounds, and the specification offers only a trial-and-error screen, the inventors have claimed a research program rather than an invention.

The amount of experimentation that remains is the usual measure. Some experimentation is permissible; the specification need not anticipate every routine adjustment. But the question is not whether any single embodiment could be found with effort. It is whether the skilled reader could reach the claimed class as a whole without undue experimentation. A specification that works for ten examples out of a million candidates, with no principle for predicting which others will work, discloses a starting point, not the claimed genus.`,
    questions: [
      Q('structural', 'What does the second paragraph do relative to the first?', ["Turns the breadth praised in the first into the claim's weakness", 'Gives an example of a functional claim', "Defines 'functional genus claim'", 'Argues functional claims are always invalid'], '"That breadth is also their vulnerability" is the hinge.'),
      Q('inferential', 'Why does structural diversity among working compounds matter?', ['It makes untested members harder to predict, raising the experimentation needed', 'Diverse compounds infringe more easily', 'It makes the claim narrower', 'It means the inventors made more examples'], 'Diversity defeats prediction; the passage’s measure is remaining experimentation.'),
      Q('application', 'A claim covers all enzymes that cleave a given bond. The specification discloses three closely related enzymes sharing a conserved active site that the field knows determines function, plus a reliable assay. Most likely:', ['Adequate — a few related structures plus a reliable test', 'Inadequate — every species must be disclosed', 'Inadequate — three examples are too few as a matter of law', 'Irrelevant — functional claims need no examples'], 'This matches the passage’s "closely related structures… may suffice" branch.'),
      Q('precision', 'Which statement goes beyond the passage?', ['Functional genus claims are unpatentable in the life sciences', 'The specification need not anticipate every routine adjustment', 'The test asks about the claimed class as a whole', 'A structurally different compound with the same effect still falls within such a claim'], 'The passage states a test, not a categorical bar.'),
    ],
    gist: 'Functional genus claims are broad but must be enabled across their full scope; diverse structures with only trial-and-error screening means undue experimentation, while a few related structures plus a reliable test may suffice.' },

  { id: 'seed_r05', level: 5, domain: 'philosophy', tags: ['comparative'], title: 'Rules, Standards, and Who Decides',
    passage: `Legal directives can be framed as rules or as standards. A rule fixes the legally relevant facts in advance—no driving over 65 miles per hour—while a standard leaves their identification to the decision-maker applying it—no driving at an unreasonable speed. The familiar comparison holds that rules are cheaper to apply and more predictable, while standards fit outcomes more closely to the purposes behind them. Rules err by being over- and under-inclusive; standards err by being uncertain.

That comparison is usually framed in terms of error and cost, but it conceals a question about the allocation of power. Choosing a rule is a decision by the lawmaker to settle the content of the law now, at the moment of enactment, with whatever information the lawmaker then has. Choosing a standard delegates that settlement to whoever applies the law later—often a judge or jury—who will have more information about the particular case but less democratic accountability and less ability to see the aggregate effects of many decisions.

It follows that the choice cannot be made on accuracy alone. A standard may produce better individual outcomes and still be the wrong choice if those outcomes are reached by actors who should not be making the relevant trade-offs. Conversely, a rule's crudeness may be tolerable precisely because it keeps a contested value judgment in the hands of the legislature. The debate over rules and standards is thus, in part, a debate about institutional competence and legitimacy, and treating it as purely a matter of minimizing error assumes away the question that most needs answering.`,
    questions: [
      Q('structural', 'What move does the second paragraph make?', ['Reframes an error-and-cost comparison as a question of who decides', 'Gives examples of over-inclusive rules', 'Rejects the definitions in the first paragraph', 'Argues standards are always preferable'], '"Conceals a question about the allocation of power" is the reframing.'),
      Q('inferential', 'Which actor does the passage imply is better placed to see aggregate effects?', ['The lawmaker who sets a rule in advance', 'The jury in a particular case', 'The individual driver', 'A judge deciding one case'], 'Appliers are said to have "less ability to see the aggregate effects."'),
      Q('application', "A legislature unsure how to weigh privacy against security considers 'searches must be reasonable' versus a detailed list of permitted searches. Under the passage, the strongest reason for the list is:", ['It keeps the contested trade-off with the accountable lawmaker', 'It yields more accurate outcomes in each case', 'It is always cheaper to draft', 'Courts lack information about particular searches'], 'The passage’s distinctive argument is about who makes contested value trade-offs.'),
      Q('precision', 'Which statement goes beyond the passage?', ['Rules are generally preferable to standards in democratic systems', 'Standards delegate settlement of content to later decision-makers', 'Rules can be over- and under-inclusive', 'The choice cannot be made on accuracy alone'], 'The passage says legitimacy must be weighed, not that rules win.'),
    ],
    gist: 'Choosing rules or standards is not only about error and cost; it allocates who settles the law’s content, so institutional legitimacy must be weighed alongside accuracy.' },

  { id: 'seed_b01', level: 4, domain: 'legal', benchmark: true, tags: ['burden-standard'], title: 'Liquidated Damages and Penalties',
    passage: `Contracting parties often agree in advance on the sum one will pay the other if it breaches. Such a clause can save both sides the cost and uncertainty of proving actual losses, and courts generally enforce it. They will not, however, enforce a clause whose function is to punish breach rather than to compensate for it. The line between a valid liquidated-damages clause and an unenforceable penalty is drawn by asking two questions, both directed to the amount the parties chose.

The first is whether the harm from breach was difficult to estimate when the contract was made. If losses could readily have been calculated, the parties had little need to agree on a figure, and an agreed sum that departs from the calculable loss looks more like a deterrent than a forecast. The second is whether the amount was a reasonable estimate of the anticipated harm or, in some jurisdictions, of the harm that actually resulted. A sum wildly disproportionate to any plausible loss fails this test, however the parties labeled it.

Two features of the inquiry are easy to miss. Labels do not control: a clause called liquidated damages can be struck as a penalty, and one called a penalty can be upheld if it meets the tests. And the inquiry focuses on the amount, not on whether the breaching party acted in bad faith. A deliberate breach does not convert a reasonable estimate into a penalty, and an innocent breach does not save an unreasonable one. Where a clause fails, the non-breaching party is not left without remedy; it may still recover its actual damages, proved in the ordinary way.`,
    questions: [
      Q('structural', 'What do the two tests share?', ['Both are directed at the amount the parties chose', "Both turn on the breaching party's intent", "Both depend on the clause's label", 'Both apply only after actual damages are proved'], 'The first paragraph says so expressly; the third confirms intent is irrelevant.'),
      Q('inferential', 'Why does easy calculability of losses cut against enforcement?', ['The parties had little need for a forecast, so a divergent sum suggests deterrence', 'Courts always prefer to calculate damages themselves', 'Calculable losses are always small', 'It shows bad faith by the drafter'], 'The passage links calculability to the inference of a deterrent purpose.'),
      Q('application', 'A contract sets $500,000 for late delivery; losses were hard to predict and $500,000 was a reasonable forecast. The seller deliberately delivered late to take a better offer. Enforceable?', ["Yes — deliberate breach doesn't convert a reasonable estimate into a penalty", 'No — deliberate breach makes it a penalty', 'No — because it is labeled liquidated damages', 'Only up to actual damages'], 'Both tests are met; bad faith is irrelevant.'),
      Q('precision', 'Which statement goes beyond the passage?', ['A clause struck as a penalty voids the entire contract', "A clause labeled a 'penalty' can be upheld", 'Some jurisdictions measure reasonableness against actual harm', 'If the clause fails, proven actual damages remain recoverable'], 'The passage says only that actual damages remain available; it says nothing about voiding the contract.'),
    ],
    gist: 'Courts enforce agreed breach sums only if harm was hard to estimate and the amount reasonable — judged by amount, not label or bad faith — and a failed clause leaves actual damages recoverable.' },
];

function build() {
  const out = [];
  const add = (raw, fn) => {
    const v = fn(raw, { level: raw.level, domain: raw.domain, source: 'seed', easy: raw.easy, benchmark: raw.benchmark });
    if (!v) { console.error('Seed failed validation:', raw.id); return; }
    v.id = raw.id;
    if (raw.tags) v.tags = raw.tags;
    out.push(v);
  };
  PARSE.forEach(r => add(r, validateParse));
  FUNCTION.forEach(r => add(r, validateFunction));
  READ.forEach(r => add(r, validateRead));
  return out;
}

export const SEED = build();
export const SEED_COUNTS = { parse: PARSE.length, function: FUNCTION.length, read: READ.length };
