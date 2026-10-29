# Dense

Daily drills for reading complex text — statutes, opinions, patent claims, dense technical prose — faster **without** losing comprehension. A static web app for GitHub Pages that installs to the iPhone Home Screen and uses your own Claude API key, so you pay only for usage.

## Why it's built this way

Speed-reading gimmicks don't survive the research. Your eye span can't be trained much wider. Suppressing subvocalization hurts comprehension. RSVP removes the regressions you need to repair misparses. On complex text, the bottleneck is how fast you **resolve structure**: what a clause modifies, where an exception sits, what a paragraph is doing. So Dense trains that directly and scores speed only together with comprehension:

| Drill | What it trains | Scored on |
|---|---|---|
| **Parse sprint** | One dense sentence. Tap the main verb, the party who bears the duty, the word an exception attaches to; answer scope questions. Then see the sentence color-coded by structure. | Accuracy, time per task |
| **Function call** | You see only a paragraph's lead sentence and its signal words, then predict what the paragraph does (rule, limit, application, counter, rebuttal, rationale, background). Higher levels set traps in the lead. | Accuracy, time |
| **Dense read** | A timed read at your natural pace, then closed-book structural, inferential, application, and precision questions, then a one-sentence gist graded by Claude. | Effective reading rate = wpm × comprehension |
| **Paced read** | A line-by-line pacer. Speed rises 5% after two reads at ≥80% comprehension and eases off when comprehension drops. | Comprehension at a set speed |
| **RSVP** | Words shown one at a time with the focus letter marked in red. Used as a momentum drill on easy text only. Unrated, on purpose. | Comprehension |
| **Weekly benchmark** | A fixed-difficulty passage (level 4, about 280 words). Your cleanest week-over-week measure. | Effective reading rate |
| **Your reading** | Paste a case section or statute you have to read anyway. Claude pulls its hardest sentences and paragraphs **verbatim** and writes drills on them. | Same as above |

### Adaptivity

- **Ratings.** Parse, Function, and Reading each have a Glicko-2 rating. Every item has a rating set by its difficulty level (L1–L7), and you're served items at your level, with a stretch item about 30% of the time. Speed counts as a bounded bonus. Correctness dominates, so skimming can't inflate your rating.
- **Weak structures.** Each item is tagged with the structures it tests (nested exceptions, provisos, and/or scope, modifier attachment, antecedents, negation stacking, and others). Dense tracks your accuracy per tag, and new items are generated toward your weakest tags.
- **Missed items** go to a review list. Clear an item by getting it right.
- **Progress** shows your rating trends with uncertainty bands, effective reading rate (benchmarks marked), parse speed, accuracy by question type, weakest structures, activity, and computed "what changed" insights. Claude can also coach you from your aggregate stats; only the numbers are sent, never your text.

### Sessions

| Length | Contents |
|---|---|
| 5 min | 3 parse + 3 function |
| 8 min | 3 parse + 2 function + 1 dense read |
| 12 min | paced warm-up + 4 parse + 3 function + 1 dense read |
| 15 min | paced warm-up + 6 parse + 4 function + 1 dense read |

The weekly benchmark replaces that day's dense read when it's due. Every item stands alone, so a session can be resumed later the same day.

## Deploy to GitHub Pages

```bash
git push -u origin main   # repo: github.com/keshantej/readbetter
```

Then on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save.** The app will be live at **https://keshantej.github.io/readbetter/** within a minute or two.

**On iPhone:** open that URL in Safari, then **Share → Add to Home Screen**. Launch it from the icon. Installed web apps get persistent storage and run full-screen.

## Claude API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys) and **set a monthly spend limit** there as a backstop.
2. In Dense, go to **Settings → API key**, paste the key, and tap **Test key**.

The key is stored only in the app's IndexedDB on your device. It's sent only to `api.anthropic.com` (calls go directly from the browser using Anthropic's `anthropic-dangerous-direct-browser-access` header), and it's never included in backups. The page loads no third-party scripts, and its Content-Security-Policy restricts network calls to the Anthropic API.

### Models and cost

You can pick a model separately for three jobs in Settings:

| Job | Default | Notes |
|---|---|---|
| Item writer | Sonnet 5.5 | The sweet spot. Haiku items are easier to see through. |
| Grader & coach | Sonnet 5.5 | Haiku 5.5 is fine here and much cheaper. |
| Your-reading packs | Sonnet 5.5 | Switch to Opus 5.5 if you want the hardest sentences picked most reliably. |

Items are generated in batches and stocked in the background, so sessions start instantly and you don't pay per tap. The system prompt is cached across calls. A rough estimate on Sonnet is a few cents per 8-minute session, which comes to low single-digit dollars a month at daily use. Settings shows a running spend estimate, but the Console bill is authoritative.

**No key?** The app ships with 30 hand-written items (14 parse, 10 function, 6 reads including a benchmark), so it works fully offline. Gist grading falls back to self-grading against a reference.

## Your data

Everything is stored on-device in IndexedDB. Use **Settings → Export backup** occasionally (it opens the iOS share sheet) and **Import backup** to restore or move to a new phone. **Reset progress** clears history but keeps your key and settings.

## Development

There's no build step and no dependencies.

```bash
python3 -m http.server 8000      # then open http://localhost:8000
node test/unit.mjs               # seed validation, span matching, Glicko math
python3 test/e2e.py /tmp/shots   # full iPhone-viewport run with the API mocked (needs playwright + chromium)
```

The service worker only registers over HTTPS. After changing app files, bump `VERSION` in `sw.js` so installed copies pick up the update.

```
index.html, css/app.css, sw.js, manifest.webmanifest
js/app.js         router + boot
js/store.js       IndexedDB state, backup/restore
js/claude.js      API client (forced tool use → schema-shaped JSON), spend tracking
js/gen.js         prompts, schemas, validation of every AI item, gist grading, packs, coach
js/engine.js      item bank, adaptive selection, background refill, result recording
js/rating.js      Glicko-2 + scoring
js/session.js     session recipes and runners
js/runner.js      drill frame (header, timer, result bar)
js/drills/        parse, function, read (self-paced, pacer, RSVP, benchmark)
js/views/         home, progress, library, settings
js/seed.js        built-in starter items
```

Every AI-generated item is checked mechanically before it reaches the bank. Tap answers must be exact substrings of the sentence, structural segments must reproduce the sentence exactly, multiple-choice answers must be valid indexes, and pack excerpts must appear verbatim in your pasted text. Anything that fails is dropped. Answer choices are shuffled to cancel the model's position bias.

## License

MIT
