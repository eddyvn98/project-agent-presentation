import { INTERACTIVE_HTML_CSP } from "../interactive-html";

/** page_check.py: opens a page (URL or local file) in the sandbox's headless Chromium and reports what a user would hit. */
export const PAGE_CHECK_SCRIPT = String.raw`#!/usr/bin/env python3
# Open a page in headless Chromium and report console errors, failed requests, overflow and screenshots.
import argparse, functools, http.server, json, os, re, socketserver, sys, threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

VIEWPORTS = {"desktop": {"width": 1280, "height": 800}, "mobile": {"width": 375, "height": 812}}
parser = argparse.ArgumentParser(description="Check a page in headless Chromium")
parser.add_argument("target", help="http(s) URL, or a file path under /work (served from its folder so relative assets load)")
parser.add_argument("--out", default="/work/outputs/work/page-check", help="folder for screenshots")
parser.add_argument("--viewport", choices=["desktop", "mobile", "both"], default="both")
parser.add_argument("--wait", type=float, default=1.5, help="seconds to let the page settle after load")
parser.add_argument("--wait-text", help="text that must appear before the checks")
parser.add_argument("--preview", action="store_true", help="apply the canvas preview policy (sandboxed origin, CDN-only scripts, data: images, no network); automatic for *.web.html")
parser.add_argument("--full-page", action="store_true", help="screenshot the whole scroll height")
parser.add_argument("--step", action="append", default=[], help="click:SELECTOR | press:KEY | type:SELECTOR=TEXT | wait:SECONDS | shot:NAME | text:SELECTOR (repeatable, run in order)")
args = parser.parse_args()
PREVIEW_CSP = "__PREVIEW_CSP__"
args.preview = args.preview or args.target.lower().endswith((".web.html", ".web.htm"))
os.makedirs(args.out, exist_ok=True)
os.makedirs(os.environ.get("TMPDIR", "/tmp"), exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

server = None
target = args.target
if not re.match(r"^https?://", target):
    path = os.path.abspath(target)
    if not os.path.isfile(path): sys.exit("file not found: " + path)
    handler = functools.partial(Quiet, directory=os.path.dirname(path))
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    target = "http://127.0.0.1:%d/%s" % (server.server_address[1], os.path.basename(path))

def run_steps(page, tag, shots, notes):
    for raw in args.step:
        kind, _, value = raw.partition(":")
        try:
            if kind == "click": page.locator(value).first.click(timeout=5000)
            elif kind == "press": page.keyboard.press(value)
            elif kind == "type":
                selector, _, text = value.partition("=")
                page.locator(selector).first.fill(text, timeout=5000)
            elif kind == "wait": page.wait_for_timeout(int(float(value) * 1000))
            elif kind == "text": notes.append("%s -> %r" % (value, page.locator(value).first.inner_text(timeout=5000)[:200]))
            elif kind == "shot":
                file = os.path.join(args.out, "%s-%s.png" % (tag, re.sub(r"[^\w.-]", "_", value or "step")))
                page.screenshot(path=file, full_page=args.full_page); shots.append(file)
            else: notes.append("unknown step: " + raw)
            page.wait_for_timeout(250)
        except Exception as error:
            notes.append("step failed: %s (%s)" % (raw, str(error).splitlines()[0][:160]))

def check(browser, name):
    context = browser.new_context(viewport=VIEWPORTS[name], device_scale_factor=1, is_mobile=(name == "mobile"), has_touch=(name == "mobile"))
    if args.preview:
        def add_policy(route):
            if route.request.resource_type != "document": return route.continue_()
            response = route.fetch()
            route.fulfill(response=response, headers={**response.headers, "content-security-policy": PREVIEW_CSP})
        context.route("**/*", add_policy)
    page = context.new_page()
    report = {"viewport": name, "console_errors": [], "page_errors": [], "failed_requests": [], "bad_responses": [], "notes": [], "screenshots": []}
    # "Failed to load resource" lines carry no URL; the request/response handlers below report those with the URL
    page.on("console", lambda m: m.type in ("error", "warning") and not m.text.startswith("Failed to load resource") and report["console_errors"].append("[%s] %s" % (m.type, m.text[:300])))
    page.on("pageerror", lambda e: report["page_errors"].append(str(e)[:400]))
    page.on("requestfailed", lambda r: report["failed_requests"].append("%s (%s)" % (r.url[:200], (r.failure or "failed"))))
    page.on("response", lambda r: r.status >= 400 and not r.url.endswith("/favicon.ico") and report["bad_responses"].append("%d %s" % (r.status, r.url[:200])))
    try: page.goto(target, wait_until="load", timeout=30000)
    except Exception as error: report["page_errors"].append("navigation: " + str(error).splitlines()[0][:300])
    if args.wait_text:
        try: page.wait_for_function("t => document.body.innerText.toLowerCase().includes(t)", args.wait_text.lower(), timeout=10000)
        except Exception: report["notes"].append("text did not appear: " + args.wait_text)
    page.wait_for_timeout(int(args.wait * 1000))
    report["preview_policy"] = args.preview
    report["title"] = page.title()
    if name == "mobile" and not page.evaluate("() => !!document.querySelector('meta[name=viewport]')"):
        report["notes"].append("no <meta name=viewport>: phones show a zoomed-out desktop layout; add width=device-width, initial-scale=1")
    report["layout"] = page.evaluate("""() => ({
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 120)),
      emptyBody: document.body.innerText.trim().length === 0 })""")
    first = os.path.join(args.out, name + "-load.png")
    page.screenshot(path=first, full_page=args.full_page); report["screenshots"].append(first)
    run_steps(page, name, report["screenshots"], report["notes"])
    context.close()
    return report

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox", "--disable-dev-shm-usage"])
    names = ["desktop", "mobile"] if args.viewport == "both" else [args.viewport]
    reports = [check(browser, n) for n in names]
    browser.close()
if server: server.shutdown()
problems = sum(len(r["console_errors"]) + len(r["page_errors"]) + len(r["failed_requests"]) + len(r["bad_responses"]) for r in reports)
problems += sum(1 for r in reports if r["layout"]["horizontalScroll"] or r["layout"]["brokenImages"] or r["layout"]["emptyBody"])
print(json.dumps({"target": args.target, "ok": problems == 0, "problems": problems, "reports": reports}, indent=1, ensure_ascii=False))
`.replace("__PREVIEW_CSP__", INTERACTIVE_HTML_CSP);
