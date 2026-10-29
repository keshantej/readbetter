"""End-to-end run on an iPhone-sized viewport with the Claude API mocked.
Usage: python3 test/e2e.py <screenshot_dir>
"""
import json, sys, threading, functools, http.server, socketserver, os, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dense-shots'
os.makedirs(OUT, exist_ok=True)

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(Handler.func):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

S1 = 'Unless the commission finds that the applicant has not complied with section 9, a permit issued under this chapter shall remain valid for three years, provided that the holder files an annual report.'
PARSE = {"items": [{"level": 3, "tags": ["double-negation", "proviso"], "sentence": S1 if i == 0 else S1.replace('three', ['four', 'five', 'six'][i - 1]),
    "tasks": [
        {"kind": "tap", "prompt": "Tap the main verb.", "answer_text": "shall remain valid", "choices": [], "answer_index": -1, "explain": "Main clause verb."},
        {"kind": "mc", "prompt": "What keeps the permit valid?", "answer_text": "", "choices": ["Filing an annual report", "A commission finding", "Section 9", "Nothing"], "answer_index": 0, "explain": "The proviso."},
        {"kind": "tap", "prompt": "Tap who makes the finding.", "answer_text": "the commission", "choices": [], "answer_index": -1, "explain": "Agent of the finding."}],
    "segments": [{"text": "Unless the commission finds that the applicant has not complied with section 9,", "role": "exception"},
                 {"text": "a permit issued under this chapter shall remain valid for " + ['three', 'four', 'five', 'six'][i] + " years,", "role": "core"},
                 {"text": "provided that the holder files an annual report.", "role": "condition"}],
    "explain": "Validity, unless a noncompliance finding, conditioned on reports."} for i in range(4)]}

PARA = ("Critics argue that the rule is too rigid. That objection misreads the text. The provision applies only where the parties "
        "have not agreed otherwise, and nothing prevents them from contracting around it. Thus the rule is a default, not a mandate, "
        "and the rigidity critics fear simply does not arise in practice for sophisticated parties who bargain with counsel.")
FUNC = {"items": [{"level": 3, "tags": ["limiting-words"], "paragraph": PARA, "lead": "Critics argue that the rule is too rigid.",
    "signals": ["misreads", "only where", "Thus"], "answer": k, "trap": "counter", "explain": "Concede then rebut."} for k in ["rebuttal", "limit", "rule", "rationale"]]}

PASSAGE = "\n\n".join(["The doctrine of claim construction asks what a skilled artisan would understand the claim terms to mean. " * 4,
                       "Courts begin with the claim language, then consult the specification, which is usually dispositive. " * 4,
                       "Extrinsic evidence such as dictionaries and expert testimony is less significant than the intrinsic record. " * 4])
READ = {"level": 3, "tags": ["antecedent"], "title": "Construing Claims", "passage": PASSAGE,
        "questions": [{"kind": k, "prompt": f"{k} question?", "choices": ["Right", "Wrong A", "Wrong B", "Wrong C"], "answer": 0, "explain": "Because."}
                      for k in ["structural", "inferential", "application", "precision"]],
        "gist": "Claim terms take the meaning a skilled artisan would give them, read in light of the specification first."}
GIST = {"score": 2, "feedback": "You captured the main point but dropped the priority of the specification.", "missing": "Specification is usually dispositive."}
PACK = {"title": "Test reading", "level": 4, "parse": [{**PARSE["items"][0]}], "functions": [], "read": {**READ}}

calls = []
contract_violations = []
mode = {'verify_disagree': False, 'dispute': 'item_flawed', 'fail_next': 0}

UNSUPPORTED = {'minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'oneOf', 'pattern'}
def check_schema(sch, path='$'):
    """Enforce the structured-outputs JSON Schema subset."""
    if not isinstance(sch, dict): return
    for k in sch:
        if k in UNSUPPORTED: contract_violations.append(f'{path}: unsupported keyword {k}')
    if sch.get('minItems', 0) not in (0, 1): contract_violations.append(f'{path}: minItems > 1')
    t = sch.get('type')
    if t == 'object':
        if sch.get('additionalProperties') is not False: contract_violations.append(f'{path}: additionalProperties must be false')
        props = sch.get('properties', {})
        if set(sch.get('required', [])) != set(props): contract_violations.append(f'{path}: not all properties required')
        for k, v in props.items(): check_schema(v, f'{path}.{k}')
    if t == 'array': check_schema(sch.get('items'), f'{path}[]')
    if t is None and 'anyOf' not in sch and 'enum' not in sch and 'const' not in sch:
        contract_violations.append(f'{path}: missing type')

def conforms(val, sch, path='$'):
    """Validate a fixture against the schema the app sent (so mocks can't drift from reality)."""
    t = sch.get('type')
    ok = {'object': dict, 'array': list, 'string': str, 'boolean': bool}.get(t)
    if t == 'integer' and not (isinstance(val, int) and not isinstance(val, bool)): return [f'{path}: want integer']
    if ok and not isinstance(val, ok): return [f'{path}: want {t}, got {type(val).__name__}']
    if 'enum' in sch and val not in sch['enum']: return [f'{path}: {val!r} not in enum']
    errs = []
    if t == 'object':
        for k in sch['properties']:
            if k not in val: errs.append(f'{path}: missing {k}')
            else: errs += conforms(val[k], sch['properties'][k], f'{path}.{k}')
        for k in val:
            if k not in sch['properties']: errs.append(f'{path}: extra {k}')
    if t == 'array':
        for i, v in enumerate(val): errs += conforms(v, sch['items'], f'{path}[{i}]')
    return errs

def kind_of(schema):
    pr = schema.get('properties', {})
    if 'items' in pr:
        inner = pr['items']['items']['properties']
        return 'parse' if 'sentence' in inner else 'function'
    for k, name in [('passage', 'read'), ('answers', 'verify'), ('score', 'gist'), ('verdict', 'dispute'), ('parse', 'pack'), ('ok', 'test')]:
        if k in pr: return name
    return 'unknown'

def bad(route, msg):
    route.fulfill(status=400, content_type='application/json', headers={'access-control-allow-origin': '*'},
                  body=json.dumps({"type": "error", "error": {"type": "invalid_request_error", "message": msg}}))

def handle(route):
    body = json.loads(route.request.post_data or '{}')
    # --- the real Claude 5.5 contract ---
    tc = (body.get('tool_choice') or {}).get('type')
    if tc in ('tool', 'any'):
        calls.append('REJECTED:tool_choice'); return bad(route, 'tool_choice: type "tool" and "any" are not supported for this model.')
    for k in ('temperature', 'top_p', 'top_k'):
        if k in body: calls.append(f'REJECTED:{k}'); return bad(route, f'`{k}` is not supported for this model.')
    if (body.get('thinking') or {}).get('type') in ('disabled', 'enabled'):
        calls.append('REJECTED:thinking'); return bad(route, 'thinking type not supported')
    if body['messages'][-1]['role'] != 'user': return bad(route, 'This model does not support assistant message prefill.')
    if mode['fail_next'] > 0:
        mode['fail_next'] -= 1; calls.append('FORCED_FAIL')
        return bad(route, 'Your credit balance is too low to access the Claude API.')
    fmt = (body.get('output_config') or {}).get('format')
    if fmt:
        if fmt.get('type') != 'json_schema': return bad(route, 'bad format type')
        check_schema(fmt['schema'])
        k = kind_of(fmt['schema'])
        out = {
            'parse': PARSE, 'function': FUNC, 'read': READ, 'gist': GIST, 'pack': PACK, 'test': {"ok": True},
            'verify': {"answers": [{"id": "0.1", "choice": 3}] if mode['verify_disagree'] else []},
            'dispute': {"verdict": mode['dispute'], "explanation": "The keyed answer ignores that the proviso governs both clauses."},
        }.get(k)
        calls.append(k)
        errs = conforms(out, fmt['schema'])
        if errs: contract_violations.append(f'{k} fixture: {errs[:3]}')
        text = json.dumps(out)
    else:
        calls.append('text'); text = "1. Bottleneck: parse speed.\n2. Do more parse sprints."
    content = [{"type": "thinking", "thinking": "", "signature": "sig"}, {"type": "text", "text": text}]
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                  body=json.dumps({"id": "m", "type": "message", "role": "assistant", "content": content, "stop_reason": "end_turn",
                                   "usage": {"input_tokens": 1500, "output_tokens": 2000}}))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and '400' not in m.text else None)
    page.route('https://api.anthropic.com/**', handle)
    base = f'http://127.0.0.1:{port}/'
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=False)

    # 1. first launch, no key — seed items
    page.goto(base); page.wait_for_selector('.wordmark'); shot('01-home-nokey')
    page.click('text=Start today\'s session'); page.wait_for_selector('.drill')
    for step in range(20):
        page.wait_for_timeout(150)
        if page.query_selector('.summary'): break
        title = page.inner_text('.drill-title strong')
        if 'Parse' in title:
            if step == 0: shot('02-parse')
            for t in range(4):
                if page.query_selector('.task .choice:not([disabled])'):
                    page.click('.task .choice >> nth=0')
                elif page.query_selector('.tappable'):
                    page.click('.sentence .w >> nth=2')
                else: break
                page.wait_for_selector('.task .btn.primary')
                if step == 0 and t == 0: shot('03-parse-feedback')
                page.click('.task .btn.primary')
                if page.query_selector('.breakdown') or page.query_selector('.result-bar'): break
            page.wait_for_selector('.result-bar');
            if step <= 1: shot('04-parse-breakdown')
        elif 'Function' in title:
            page.wait_for_selector('.fn'); shot('05-function')
            page.click('.fn >> nth=1'); page.wait_for_selector('.result-bar'); shot('06-function-result')
        else:
            page.click('text=Start reading'); page.wait_for_timeout(300); shot('07-read')
            page.click('text=Done reading')
            for q in range(5):
                if not page.query_selector('.choices .choice'): break
                page.click('.choices .choice >> nth=0'); page.click('.drill-foot .btn.primary')
            if page.query_selector('textarea.gist'):
                page.fill('textarea.gist', 'Courts follow precedent for predictability, within a hierarchy.')
                page.click('text=Submit'); page.wait_for_selector('.choices.row3'); shot('08-gist-self')
                page.click('.choices.row3 .choice >> nth=1')
            page.wait_for_selector('.result-bar'); shot('09-read-result')
        page.click('.result-bar .btn')
    page.wait_for_selector('.summary'); shot('10-summary')
    page.click('text=Done')

    # 2. add key, test, generation
    page.goto(base + '#/settings'); page.wait_for_selector('.settings')
    page.fill('input[type=password]', 'sk-ant-test'); page.click('text=Test key'); page.wait_for_timeout(1500); shot('11-settings')
    page.goto(base + '#/'); page.wait_for_timeout(2500); shot('12-home-key')
    # quick parse with fresh AI items
    page.goto(base + '#/quick/parse'); page.wait_for_selector('.sentence'); shot('13-ai-parse')
    page.click('#view .icon-btn')
    # pacer
    page.goto(base + '#/quick/read/pacer'); page.click('text=Start reading'); page.wait_for_timeout(1500); shot('14-pacer')
    page.click('#view .icon-btn')
    # rsvp
    page.goto(base + '#/quick/read/rsvp'); page.click('text=Start reading'); page.wait_for_timeout(2200); shot('15-rsvp')
    page.click('text=Stop')
    for q in range(3):
        page.click('.choices .choice >> nth=0'); page.click('.drill-foot .btn.primary')
    page.wait_for_selector('.result-bar'); shot('16-rsvp-result')
    page.click('#view .icon-btn')
    # dense read with AI gist grading
    page.goto(base + '#/quick/read'); page.click('text=Start reading'); page.wait_for_timeout(400); page.click('text=Done reading')
    for q in range(4):
        page.click('.choices .choice >> nth=0'); page.click('.drill-foot .btn.primary')
    page.fill('textarea.gist', 'Claims mean what an artisan would read them to mean.'); page.click('text=Submit')
    page.wait_for_selector('.gist-result'); page.wait_for_selector('.result-bar'); shot('17-gist-ai')
    page.click('#view .icon-btn')
    # pack
    page.goto(base + '#/library'); page.click('text=New pack from pasted text')
    page.fill('textarea.paste', (S1 + ' ') * 3 + '\n\n' + PASSAGE); page.click('text=Build pack')
    page.wait_for_selector('text=Drill this pack'); shot('18-pack')
    page.click('text=Drill this pack'); page.wait_for_selector('.drill'); page.click('#view .icon-btn')
    # progress + coach
    page.goto(base + '#/progress'); page.wait_for_selector('.page-title'); shot('19-progress')
    page.click('text=Get coaching from my data'); page.wait_for_selector('.coach-text');
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)'); shot('20-progress-bottom')
    # API failure is surfaced, not silent
    mode['fail_next'] = 3
    page.goto(base + '#/settings'); page.wait_for_selector('.settings'); page.click('text=Test key'); page.wait_for_selector('.err-box'); shot('23-settings-error')
    page.goto(base + '#/'); page.wait_for_selector('text=Claude API problem'); shot('24-home-api-error')
    mode['fail_next'] = 0
    page.goto(base + '#/settings'); page.click('text=Test key'); page.wait_for_selector('text=Key works with')
    page.goto(base + '#/'); page.wait_for_selector('.wordmark')
    assert not page.query_selector('text=Claude API problem'), 'error callout should clear after a good call'
    # dispute a parse item: answer every task wrong, dispute, item_flawed -> rating restored
    page.goto(base + '#/quick/parse'); page.wait_for_selector('.sentence')
    before = page.evaluate("1")
    for t in range(4):
        if page.query_selector('.result-bar'): break
        if page.query_selector('.task .choice:not([disabled])'): page.click('.task .choice >> nth=3')
        elif page.query_selector('.tappable'): page.click('.sentence .w >> nth=-1')
        page.wait_for_selector('.task .btn.primary'); page.click('.task .btn.primary')
    page.wait_for_selector('.result-bar')
    r_after = page.inner_text('.delta b')
    page.click('text=I think the answer key is wrong'); page.fill('.sheet textarea', 'The proviso governs both clauses.')
    page.click('.sheet >> text=Submit'); page.wait_for_selector("text=You’re right"); shot('25-dispute-upheld')
    restored_msg = page.locator('.sheet', has_text='You’re right').inner_text()
    page.locator('.sheet', has_text='You’re right').locator('text=OK').click()
    r_restored = page.evaluate("(async () => { const m = await import('./js/store.js'); return Math.round(m.S().ratings.parse.r); })()")
    page.click('#view .icon-btn')
    # dark mode
    page.emulate_media(color_scheme='dark'); page.goto(base + '#/'); page.wait_for_selector('.wordmark'); shot('21-home-dark')
    page.goto(base + '#/quick/parse'); page.wait_for_selector('.sentence'); shot('22-parse-dark')
    # persistence after reload
    page.goto(base + '#/'); page.reload(); page.wait_for_selector('.wordmark')
    persisted = page.evaluate("document.querySelector('.big-num').textContent")
    b.close()

srv.shutdown()
print('API calls:', calls)
print('rating shown after wrong answers:', r_after, '| restored to:', r_restored, '| dispute:', restored_msg.replace('\n', ' ')[:160])
print('CONTRACT VIOLATIONS:' if contract_violations else 'no contract violations', *contract_violations, sep='\n  ')
assert not contract_violations and not any(c.startswith('REJECTED') for c in calls)
print('rating text after reload:', persisted)
print('ERRORS:' if errors else 'no page errors', *errors, sep='\n  ')
