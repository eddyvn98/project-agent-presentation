/** places.py: geocodes an address or shop name, measures distances and lists what OpenStreetMap knows nearby (schools, markets, fuel). Standard library only. */
export const PLACES_SCRIPT = String.raw`#!/usr/bin/env python3
# Place lookups for local-business research: Google Maps search with coordinates, geocode, distance between two places, things near a place (OpenStreetMap Nominatim)
import argparse, json, math, os, re, sys, time, urllib.parse, urllib.request

API = "https://nominatim.openstreetmap.org/search"
AGENT = "360i-project-agent/1.0 (business research)"
last_call = [0.0]

def fetch(params):
    wait = 1.1 - (time.time() - last_call[0])
    if wait > 0: time.sleep(wait)
    last_call[0] = time.time()
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": AGENT, "Accept-Language": "vi,en"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))

def point(text):
    """Accepts 'lat,lon', a Google Maps or OpenStreetMap link, or any address / place name; returns (lat, lon, label)."""
    if text.startswith("http"):
        link_match = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", text) or re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", text) or re.search(r"[?&](?:q|ll|mlat)=(-?\d+\.\d+)(?:,|&mlon=)(-?\d+\.\d+)", text)
        if not link_match: sys.exit("No coordinates in that link; open the place in the map and copy the full link that contains @lat,lon.")
        return float(link_match.group(1)), float(link_match.group(2)), "map link"
    parts = text.split(",")
    if len(parts) == 2:
        try: return float(parts[0]), float(parts[1]), text
        except ValueError: pass
    found = fetch({"q": text, "format": "jsonv2", "limit": 1})
    if not found: sys.exit("No OpenStreetMap match for: " + text + ". Try a shorter query (street, ward, city) or use web_search for the exact shop.")
    top = found[0]
    return float(top["lat"]), float(top["lon"]), top["display_name"]

def metres(a, b):
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))

def link(lat, lon):
    return "https://www.openstreetmap.org/?mlat=%.6f&mlon=%.6f#map=18/%.6f/%.6f" % (lat, lon, lat, lon)

def cmd_geocode(args):
    found = fetch({"q": args.query, "format": "jsonv2", "limit": args.limit})
    if not found: print("No match. OpenStreetMap often lacks house numbers and small shops; search the web for the exact shop."); return
    for item in found:
        print("%s, %s | %s | %s" % (item["lat"], item["lon"], item["display_name"], link(float(item["lat"]), float(item["lon"]))))
    print("Note: a street match is the street, not the house number.")

def cmd_distance(args):
    a, b = point(args.a), point(args.b)
    d = metres(a, b)
    print("A: %.6f,%.6f %s" % (a[0], a[1], a[2][:90]))
    print("B: %.6f,%.6f %s" % (b[0], b[1], b[2][:90]))
    print("Straight line: %.0f m; walking about %d min (road distance is usually 1.2-1.4x longer)." % (d, round(d / 75)))

def cmd_nearby(args):
    centre = point(args.place)
    box = args.radius / 111000.0
    lon_box = box / max(math.cos(math.radians(centre[0])), 0.1)
    view = "%f,%f,%f,%f" % (centre[1] - lon_box, centre[0] + box, centre[1] + lon_box, centre[0] - box)
    found = fetch({"q": args.what, "format": "jsonv2", "limit": 40, "viewbox": view, "bounded": 1})
    rows = sorted(((metres(centre, (float(i["lat"]), float(i["lon"]))), i) for i in found), key=lambda r: r[0])
    print("Centre: %.6f,%.6f %s" % (centre[0], centre[1], centre[2][:90]))
    if not rows:
        print("OpenStreetMap lists no '%s' within %d m. It covers small shops poorly, so this proves nothing: search the web and Facebook pages next." % (args.what, args.radius))
        return
    for d, item in rows[:args.limit]:
        print("%5.0f m | %s | %s" % (d, item["display_name"][:110], link(float(item["lat"]), float(item["lon"]))))

def coords_in(url):
    found = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url) or re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    return (float(found.group(1)), float(found.group(2))) if found else None

def cmd_maps(args):
    """Searches one or more Google Maps queries in a shared sandbox browser session."""
    from playwright.sync_api import sync_playwright
    origin = point(args.origin) if args.origin else None
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_context(locale="vi-VN", viewport={"width": 1280, "height": 900}).new_page()
        try:
            for query in args.query:
                rows = []
                try:
                    page.goto("https://www.google.com/maps/search/" + urllib.parse.quote(query) + "?hl=vi", wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(2500)
                except Exception:
                    if not page.url.startswith("https://www.google.com/maps/"):
                        print("Google Maps timed out for: " + query)
                        continue
                url = page.url
                if "/maps/place/" in url:
                    here = coords_in(url)
                    lines = [line.strip() for line in page.locator("body").inner_text(timeout=4000).split("\n") if line.strip()]
                    rows.append((page.title().replace(" - Google Maps", ""), here, [line for line in lines if re.search(r"\d{2,}|Mở cửa|Đóng cửa|Open|Closed", line)][:8]))  # vi-allow
                else:
                    for item in page.query_selector_all('a[href*="/maps/place/"]')[:args.limit]:
                        href = item.get_attribute("href") or ""
                        card = item.evaluate("node => (node.parentElement && node.parentElement.innerText) || ''")
                        rows.append((item.get_attribute("aria-label") or "?", coords_in(href), [line.strip() for line in card.split("\n") if line.strip()][1:5]))
                print("Query: " + query)
                if not rows:
                    print("Google Maps returned no place. Check the wording, or the page asked for consent or a captcha; use web_search instead.")
                    continue
                print("Source: Google Maps search %s" % url[:160])
                for name, here, lines in rows:
                    away = ""
                    if origin and here: away = " | %.0f m from origin" % metres((origin[0], origin[1]), here)
                    print("%s | %s%s | %s" % (name, ("%.7f,%.7f" % here) if here else "no coordinates", away, "; ".join(lines)[:200]))
        finally:
            browser.close()

parser = argparse.ArgumentParser(description=__doc__)
sub = parser.add_subparsers(dest="command", required=True)
g = sub.add_parser("geocode"); g.add_argument("query"); g.add_argument("--limit", type=int, default=5); g.set_defaults(run=cmd_geocode)
d = sub.add_parser("distance"); d.add_argument("a"); d.add_argument("b"); d.set_defaults(run=cmd_distance)
n = sub.add_parser("nearby"); n.add_argument("place"); n.add_argument("what"); n.add_argument("--radius", type=int, default=1000); n.add_argument("--limit", type=int, default=15); n.set_defaults(run=cmd_nearby)
m = sub.add_parser("maps"); m.add_argument("query", nargs="+"); m.add_argument("--origin", default=""); m.add_argument("--limit", type=int, default=8); m.set_defaults(run=cmd_maps)
args = parser.parse_args()
try:
    args.run(args)
except Exception as exc:
    sys.exit("Lookup failed: %s" % exc)
`;
