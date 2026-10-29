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
        {"kind": "tap", "prompt": "Tap the main verb.", "answer": "shall remain valid", "explain": "Main clause verb."},
        {"kind": "mc", "prompt": "What keeps the permit valid?", "choices": ["Filing an annual report", "A commission finding", "Section 9", "Nothing"], "answer": 0, "explain": "The proviso."},
        {"kind": "tap", "prompt": "Tap who makes the finding.", "answer": "the commission", "explain": "Agent of the finding."}],
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
def handle(route):
    body = json.loads(route.request.post_data or '{}')
    tool = (body.get('tool_choice') or {}).get('name')
    calls.append(tool or 'text')
    out = {'emit_parse_items': PARSE, 'emit_function_items': FUNC, 'emit_read_item': READ, 'grade_gist': GIST, 'emit_pack': PACK}.get(tool)
    content = [{"type": "tool_use", "id": "t1", "name": tool, "input": out}] if tool else [{"type": "text", "text": "1. Bottleneck: parse speed.\n2. Do more parse sprints."}]
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                  body=json.dumps({"id": "m", "type": "message", "role": "assistant", "content": content, "stop_reason": "tool_use",
                                   "usage": {"input_tokens": 1500, "output_tokens": 2000}}))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
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
    # dark mode
    page.emulate_media(color_scheme='dark'); page.goto(base + '#/'); page.wait_for_selector('.wordmark'); shot('21-home-dark')
    page.goto(base + '#/quick/parse'); page.wait_for_selector('.sentence'); shot('22-parse-dark')
    # persistence after reload
    page.goto(base + '#/'); page.reload(); page.wait_for_selector('.wordmark')
    persisted = page.evaluate("document.querySelector('.big-num').textContent")
    b.close()

srv.shutdown()
print('API calls:', calls)
print('rating text after reload:', persisted)
print('ERRORS:' if errors else 'no page errors', *errors, sep='\n  ')
