/** refimage.py: takes the lead picture of a public web page (og:image) as a reference illustration and records where it came from. */
export const REF_IMAGE_SCRIPT = String.raw`#!/usr/bin/env python3
# Reference picture from a public web page: python3 refimage.py <page-url> <output.jpg> [--max 1400]
import argparse, ipaddress, io, re, socket, sys, urllib.parse, urllib.request
from html import unescape

AGENT = "Mozilla/5.0 (compatible; 360i-project-agent/1.0; reference picture)"
LIMIT = 6 * 1024 * 1024

def check(url):
    parts = urllib.parse.urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname: sys.exit("Only public http(s) pages are allowed.")
    try:
        for info in socket.getaddrinfo(parts.hostname, None):
            address = ipaddress.ip_address(info[4][0])
            if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved: sys.exit("That address is not public.")
    except socket.gaierror:
        sys.exit("Cannot resolve " + parts.hostname)

class PublicRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        check(newurl)
        return super().redirect_request(request, response, code, message, headers, newurl)

OPENER = urllib.request.build_opener(PublicRedirectHandler())

def get(url, limit):
    check(url)
    request = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "text/html,image/*;q=0.9"})
    with OPENER.open(request, timeout=25) as response:
        data = response.read(limit + 1)
        if len(data) > limit: sys.exit("Too large.")
        return data, response.headers.get("Content-Type", ""), response.geturl()

def meta(html, names):
    for name in names:
        for pattern in (r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']+)["\']' % re.escape(name), r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(name)):
            found = re.search(pattern, html, re.I)
            if found: return unescape(found.group(1)).strip()
    return ""

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("page"); parser.add_argument("output"); parser.add_argument("--max", type=int, default=1400)
    args = parser.parse_args()
    body, kind, final = get(args.page, 3 * 1024 * 1024)
    if kind.startswith("image/"):
        image_url, title = final, ""
    else:
        html = body.decode("utf-8", "ignore")
        image_url = meta(html, ["og:image", "twitter:image", "og:image:url"])
        title = meta(html, ["og:title", "twitter:title"]) or (re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S) or [None, ""])[1].strip()
        if not image_url: sys.exit("This page has no lead picture; try another result.")
        image_url = urllib.parse.urljoin(final, image_url)
    data, kind, _ = get(image_url, LIMIT)
    from PIL import Image
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if min(image.size) < 300: sys.exit("The picture is too small to use (%dx%d)." % image.size)
    image.thumbnail((args.max, args.max))
    image.save(args.output, quality=88)
    print("wrote %s (%dx%d)" % (args.output, image.width, image.height))
    print("source page: " + final)
    print("title: " + unescape(title)[:160])
    print("Use it only as a reference illustration: caption it as a picture from that site, not the owner's shop, and link the source page.")

try:
    main()
except SystemExit:
    raise
except Exception as exc:
    sys.exit("Could not get a picture: %s" % exc)
`;
