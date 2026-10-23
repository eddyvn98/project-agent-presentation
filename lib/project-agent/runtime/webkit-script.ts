/** webkit.py: offline web libraries, fonts and icons from /opt/webkit, and a packer that makes one self-contained .web.html. */
export const WEBKIT_SCRIPT = String.raw`#!/usr/bin/env python3
# Offline web toolkit: list/add libraries, fonts, icons, and inline a multi-file page into one .web.html
import argparse, base64, datetime, functools, http.server, json, mimetypes, os, re, signal, socket, socketserver, subprocess, sys, time
ROOT = "/opt/webkit/node_modules"
CACHE = "/work/.cache/webkit"
# name: (import specifier, browser global, "default" or "ns", css file inside the package or None)
LIBS = {
    "chart.js": ("chart.js/auto", "Chart", "default", None), "d3": ("d3", "d3", "ns", None), "three": ("three", "THREE", "ns", None),
    "gsap": ("gsap", "gsap", "default", None), "echarts": ("echarts", "echarts", "ns", None),
    "leaflet": ("leaflet", "L", "default", "leaflet/dist/leaflet.css"), "apexcharts": ("apexcharts", "ApexCharts", "default", "apexcharts/dist/apexcharts.css"),
    "mermaid": ("mermaid", "mermaid", "default", None), "katex": ("katex", "katex", "default", "katex/dist/katex.min.css"),
    "marked": ("marked", "marked", "ns", None), "highlight.js": ("highlight.js", "hljs", "default", "highlight.js/styles/github.css"),
    "papaparse": ("papaparse", "Papa", "default", None), "xlsx": ("xlsx", "XLSX", "ns", None), "alpinejs": ("alpinejs", "Alpine", "default", None),
    "htmx.org": ("htmx.org", "htmx", "default", None), "jspdf": ("jspdf", "jspdf", "ns", None), "html2canvas": ("html2canvas", "html2canvas", "default", None),
    "pdf-lib": ("pdf-lib", "PDFLib", "ns", None), "animejs": ("animejs", "anime", "default", None),
}
SUBSETS = {"latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-02AF,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF",
    "vietnamese": "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB"}
ALLOWED = ("https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com")

def version(pkg):
    try: return json.load(open(os.path.join(ROOT, pkg, "package.json")))["version"]
    except Exception: return "?"

def bundle(name):
    spec, glob, mode, css = LIBS[name]
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, re.sub(r"\W+", "-", name) + ".js")
    if not os.path.exists(out):
        entry = os.path.join(CACHE, "entry-" + re.sub(r"\W+", "-", name) + ".js")
        open(entry, "w").write('import %s from "%s"; globalThis.%s = X;' % ("X" if mode == "default" else "* as X", spec, glob))
        env = dict(os.environ, NODE_PATH=ROOT)
        run = subprocess.run(["esbuild", entry, "--bundle", "--minify", "--format=iife", "--platform=browser", "--define:process.env.NODE_ENV=\"production\"", "--outfile=" + out, "--log-level=error"], env=env, capture_output=True, text=True)
        if run.returncode: sys.exit("esbuild failed for %s: %s" % (name, run.stderr[:400]))
    return out, (os.path.join(ROOT, css) if css else None)

def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return "data:%s;base64,%s" % (mime, base64.b64encode(open(path, "rb").read()).decode())

def css_inline(text, base):
    def swap(m):
        ref = m.group(2).strip()
        if re.match(r"^(data:|https?:|#)", ref): return m.group(0)
        path = os.path.normpath(os.path.join(base, ref.split("?")[0].split("#")[0]))
        return "url(%s%s%s)" % (m.group(1), data_uri(path), m.group(1)) if os.path.isfile(path) else m.group(0)
    return re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", swap, text)

def cmd_list(_):
    for name, (spec, glob, mode, css) in LIBS.items(): print("%-14s %-8s window.%-12s%s" % (name, version(name.split("/")[0]), glob, " + css" if css else ""))
    print("tools on PATH: esbuild, tsc, vite, tailwindcss (postcss, autoprefixer); fonts: inter, be-vietnam-pro, noto-sans, noto-serif, playfair-display, jetbrains-mono, montserrat, roboto; icons: lucide")

def cmd_add(a):
    os.makedirs(a.dir, exist_ok=True)
    for name in a.names:
        if name not in LIBS: sys.exit("unknown library %s; run list" % name)
        js, css = bundle(name)
        stem = re.sub(r"\W+", "-", name)
        target = os.path.join(a.dir, stem + ".js"); open(target, "wb").write(open(js, "rb").read())
        print('<script src="%s/%s.js"></script>   <!-- window.%s -->' % (a.dir, stem, LIBS[name][1]))
        if css:
            open(os.path.join(a.dir, stem + ".css"), "w").write(css_inline(open(css).read(), os.path.dirname(css)))
            print('<link rel="stylesheet" href="%s/%s.css">' % (a.dir, stem))

def cmd_font(a):
    slug = re.sub(r"\s+", "-", a.family.strip().lower()); pkg = os.path.join(ROOT, "@fontsource", slug, "files")
    if not os.path.isdir(pkg): sys.exit("font %s is not installed; run list" % a.family)
    css = []
    for weight in a.weights.split(","):
        for subset, rng in SUBSETS.items():
            f = os.path.join(pkg, "%s-%s-%s-normal.woff2" % (slug, subset, weight))
            if os.path.isfile(f): css.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;src:url(%s) format('woff2');unicode-range:%s}" % (a.family, weight, data_uri(f), rng))
    if not css: sys.exit("no files for weights " + a.weights)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True); open(a.out, "w").write("\n".join(css))
    print("wrote %s (%d KB); link it, then use font-family:'%s',sans-serif" % (a.out, os.path.getsize(a.out) // 1024, a.family))

def cmd_icon(a):
    for name in a.names:
        path = os.path.join(ROOT, "lucide-static", "icons", name + ".svg")
        print(open(path).read().strip() if os.path.isfile(path) else "<!-- no lucide icon named %s -->" % name)

def cmd_inline(a):
    base = os.path.dirname(os.path.abspath(a.src)); html = open(a.src, encoding="utf-8").read(); warn = []
    def local(ref):
        if re.match(r"^(https?:|data:|//|#|mailto:)", ref):
            if ref.startswith("http") and not ref.startswith(ALLOWED): warn.append("blocked in the canvas preview (not an allowed CDN): " + ref[:120])
            return None
        path = os.path.normpath(os.path.join(base, ref.split("?")[0].split("#")[0]))
        if os.path.isfile(path): return path
        warn.append("missing file: " + ref); return None
    def script(m):
        path = local(m.group(2));
        return m.group(0) if not path else "<script%s%s>%s</script>" % (m.group(1), m.group(3), open(path, encoding="utf-8").read().replace("</script", "<\\/script"))
    html = re.sub(r"<script([^>]*?)\ssrc=[\"']([^\"']+)[\"']([^>]*)></script>", script, html)
    def link(m):
        tag = m.group(0)
        if not re.search(r"rel=[\"']?stylesheet", tag): return tag
        ref = re.search(r"href=[\"']?([^\"'\s>]+)", tag); path = local(ref.group(1)) if ref else None
        return tag if not path else "<style>%s</style>" % css_inline(open(path, encoding="utf-8").read(), os.path.dirname(path))
    html = re.sub(r"<link[^>]*>", link, html)
    html = re.sub(r"\b(src|poster)=([\"'])([^\"']+)\2", lambda m: (lambda p: m.group(0) if not p else "%s=%s%s%s" % (m.group(1), m.group(2), data_uri(p), m.group(2)))(local(m.group(3))), html)
    html = re.sub(r"<style[^>]*>(.*?)</style>", lambda m: m.group(0).replace(m.group(1), css_inline(m.group(1), base)), html, flags=re.S)
    if re.search(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b", html): warn.append("network calls are blocked in the canvas preview (connect-src none); embed data in the page instead")
    if re.search(r"\b(localStorage|sessionStorage|document\.cookie|indexedDB)\b", html): warn.append("storage is unavailable in the sandboxed preview; wrap it in try/catch")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True); open(a.out, "w", encoding="utf-8").write(html)
    size = os.path.getsize(a.out)
    if size > 8 * 1024 * 1024: warn.append("file is %d MB; trim images and libraries" % (size // 1048576))
    if not a.out.lower().endswith((".web.html", ".web.htm")): warn.append("name it <name>.web.html so the canvas runs its scripts and shows the Present button")
    print(json.dumps({"out": a.out, "bytes": size, "warnings": warn}, indent=1))


PREVIEWS = "/work/.preview"

def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5): return True
    except OSError: return False

def register(port, title):
    os.makedirs(PREVIEWS, exist_ok=True)
    json.dump({"port": port, "title": title, "startedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}, open("%s/%d.json" % (PREVIEWS, port), "w"))

def cmd__serve(a):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
        def send_error(self, code, *x, **y):
            index = os.path.join(a.dir, "index.html")
            if a.spa and code == 404 and os.path.isfile(index) and "." not in os.path.basename(self.path.split("?")[0]):
                self.path = "/index.html"; return self.do_GET()
            super().send_error(code, *x, **y)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", a.port), functools.partial(Handler, directory=a.dir)) as server: server.serve_forever()

def cmd_serve(a):
    if port_open(a.port): sys.exit("port %d is already in use; pick another or run stop %d" % (a.port, a.port))
    if not os.path.isdir(a.dir): sys.exit("folder not found: " + a.dir)
    os.makedirs(PREVIEWS, exist_ok=True); log = open("%s/%d.log" % (PREVIEWS, a.port), "w")
    cmd = [sys.executable, os.path.abspath(__file__), "_serve", os.path.abspath(a.dir), "--port", str(a.port)] + (["--spa"] if a.spa else [])
    proc = subprocess.Popen(cmd, stdout=log, stderr=log, start_new_session=True)
    open("%s/%d.pid" % (PREVIEWS, a.port), "w").write(str(proc.pid))
    for _ in range(40):
        if port_open(a.port): break
        time.sleep(0.15)
    else: sys.exit("the server did not start; see %s/%d.log" % (PREVIEWS, a.port))
    register(a.port, a.title or os.path.basename(os.path.abspath(a.dir)))
    print("serving %s on port %d; the user can open it from the live preview card in the chat. Check it first: python3 /work/.tools/page_check.py http://127.0.0.1:%d/" % (a.dir, a.port, a.port))

def cmd_preview(a):
    if not port_open(a.port): sys.exit("nothing listens on 127.0.0.1:%d; start the server first (bind 127.0.0.1 or 0.0.0.0)" % a.port)
    register(a.port, a.title or "Port %d" % a.port); print("registered port %d for the live preview card" % a.port)

def cmd_stop(a):
    try: os.killpg(int(open("%s/%d.pid" % (PREVIEWS, a.port)).read()), signal.SIGTERM)
    except Exception: pass
    for ext in ("json", "pid"):
        try: os.remove("%s/%d.%s" % (PREVIEWS, a.port, ext))
        except OSError: pass
    print("stopped port %d" % a.port)

p = argparse.ArgumentParser(description=__doc__); sub = p.add_subparsers(dest="cmd", required=True)
sub.add_parser("list").set_defaults(fn=cmd_list)
s = sub.add_parser("add"); s.add_argument("names", nargs="+"); s.add_argument("--dir", default="vendor"); s.set_defaults(fn=cmd_add)
s = sub.add_parser("font"); s.add_argument("family"); s.add_argument("--weights", default="400,700"); s.add_argument("--out", default="vendor/fonts.css"); s.set_defaults(fn=cmd_font)
s = sub.add_parser("icon"); s.add_argument("names", nargs="+"); s.set_defaults(fn=cmd_icon)
s = sub.add_parser("serve", help="serve a folder on a port and show it to the user in the chat"); s.add_argument("dir"); s.add_argument("--port", type=int, default=5173); s.add_argument("--title"); s.add_argument("--spa", action="store_true", help="unknown paths return index.html"); s.set_defaults(fn=cmd_serve)
s = sub.add_parser("_serve"); s.add_argument("dir"); s.add_argument("--port", type=int); s.add_argument("--spa", action="store_true"); s.set_defaults(fn=cmd__serve)
s = sub.add_parser("preview", help="show a server you already started"); s.add_argument("port", type=int); s.add_argument("--title"); s.set_defaults(fn=cmd_preview)
s = sub.add_parser("stop"); s.add_argument("port", type=int); s.set_defaults(fn=cmd_stop)
s = sub.add_parser("inline"); s.add_argument("src"); s.add_argument("out"); s.set_defaults(fn=cmd_inline)
args = p.parse_args(); args.fn(args)
`;
