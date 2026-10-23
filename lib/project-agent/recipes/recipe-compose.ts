export const RECIPE_COMPOSE_PY = String.raw`"""Merge, split or insert pages from several PDFs in order, then highlight words, stamp a typed signature, add page numbers or a watermark, all in ONE run."""
import argparse, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import fold, guarded, pages_spec, region_arg
import _pdf_tool as T

PAGES = re.compile(r"^[0-9lasLAST,\- ]+$")

def parse_parts(text):
    parts = []
    for item in [s.strip() for s in text.split(";") if s.strip()]:
        path, pages = item, "all"
        if ":" in item:
            head, tail = item.rsplit(":", 1)
            if tail.strip() and PAGES.match(tail):
                path, pages = head, tail.strip()
        parts.append({"path": path.strip(), "pages": pages})
    if not parts:
        raise ValueError("--parts needs at least one path, for example inputs/B.pdf:1-5;inputs/A.pdf:2-4;inputs/B.pdf:6-")
    return parts

def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--parts", required=True, help='path:pages items separated by ";" in result order, e.g. "inputs/B.pdf:1-5;inputs/A.pdf:2-4;inputs/B.pdf:6-" (pages: 3, 1-5, 6-, last, all)')
    ap.add_argument("--highlight", action="append", default=[], help="word or phrase to highlight (repeatable; case-insensitive)")
    ap.add_argument("--highlight-pages", default="all", help="result pages to search, e.g. 1-3 (default all)")
    ap.add_argument("--highlight-color", default="yellow", choices=sorted(T.COLORS))
    ap.add_argument("--stamp", help="typed signature text (a date line is added)")
    ap.add_argument("--stamp-page", default="last", help="result page for the stamp (default last)")
    ap.add_argument("--stamp-region", default="58,92,40,5", help="x,y,width,height in percent of the page (default bottom right)")
    ap.add_argument("--page-numbers", action="store_true")
    ap.add_argument("--number-prefix", default="")
    ap.add_argument("--number-position", default="bottom-center")
    ap.add_argument("--watermark")
    ap.add_argument("--out", default="outputs/composed.pdf")
    a = ap.parse_args()

    parts, sources = parse_parts(a.parts), {}
    for part in parts:
        sources.setdefault(part["path"], len(T.open_pdf(part["path"])))
        part["pages"] = pages_spec(part["pages"], sources[part["path"]])
    os.makedirs(".tmp", exist_ok=True)
    temps, current = [], ".tmp/compose-0.pdf"
    temps.append(current)
    result = T.assemble({"parts": parts, "out": current})
    total = result["pages"]

    def step(op, spec):
        nonlocal current
        nxt = ".tmp/compose-%d.pdf" % len(temps)
        temps.append(nxt)
        T.OPS[op](dict(spec, path=current, out=nxt))
        current = nxt

    found, missing = {}, []
    if a.highlight:
        doc, annotations = T.open_pdf(current), []
        for n in pages_spec(a.highlight_pages, total):
            for term in a.highlight:
                if doc[n - 1].search_for(term):
                    annotations.append({"type": "highlight", "page": n, "query": term, "color": a.highlight_color})
                    found[n] = found.get(n, 0) + 1
        missing = [t for t in a.highlight if not any(x["query"] == t for x in annotations)]
        doc.close()
        if annotations:
            step("annotate", {"annotations": annotations})
    if a.page_numbers:
        step("markup", {"markupType": "page-numbers", "prefix": a.number_prefix, "position": a.number_position})
    if a.watermark:
        step("markup", {"markupType": "watermark", "text": a.watermark})
    stamp_page = None
    if a.stamp:
        stamp_page = pages_spec(a.stamp_page, total)[0]
        step("sign", {"text": a.stamp, "region": dict(region_arg(a.stamp_region), page=stamp_page)})

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    os.replace(current, a.out)
    for t in temps:
        if os.path.exists(t):
            os.remove(t)
    final = T.open_pdf(a.out)
    highlights = {str(i + 1): sum(1 for an in p.annots() if an.type[1] == "Highlight") for i, p in enumerate(final) if any(an.type[1] == "Highlight" for an in p.annots())}
    out = {"out": a.out, "pages": len(final), "sourcePages": [{"path": p["path"], "pages": len(p["pages"])} for p in parts], "highlights": highlights, "termsNotFound": missing}
    if a.stamp:
        out["stamp"] = {"page": stamp_page, "textFound": fold(a.stamp) in fold(final[stamp_page - 1].get_text())}
    if a.page_numbers:
        out["pageNumbers"] = True
    return out

guarded(run)
`;
