export const RECIPE_SPLIT_PY = String.raw`"""Split one PDF into several files: by page ranges, every N pages, or by top-level bookmarks."""
import argparse, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import guarded, pages_spec
import _pdf_tool as T

def slug(text):
    return re.sub(r"[^\w]+", "-", T.fold(text)).strip("-")[:40] or "part"

def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--ranges", help='page ranges separated by ";" one file each, e.g. "1-5;6-10;11-"')
    group.add_argument("--every", type=int, help="a new file every N pages")
    group.add_argument("--bookmarks", action="store_true", help="one file per top-level bookmark")
    ap.add_argument("--out-dir", default="outputs/split")
    a = ap.parse_args()

    doc = T.open_pdf(a.path)
    total, stem = len(doc), os.path.splitext(os.path.basename(a.path))[0]
    plan = []
    if a.ranges:
        for item in [s.strip() for s in a.ranges.split(";") if s.strip()]:
            pages = pages_spec(item, total)
            plan.append((item, pages, "%s-%d-%d" % (stem, pages[0], pages[-1])))
    elif a.every:
        if a.every < 1:
            raise ValueError("--every needs a number of pages of 1 or more.")
        for lo in range(1, total + 1, a.every):
            hi = min(total, lo + a.every - 1)
            plan.append(("%d-%d" % (lo, hi), list(range(lo, hi + 1)), "%s-%d-%d" % (stem, lo, hi)))
    else:
        marks = [(title, page) for level, title, page in doc.get_toc(simple=True) if level == 1 and 1 <= page <= total]
        if not marks:
            raise ValueError("The file has no top-level bookmarks; split by --ranges or --every.")
        for i, (title, page) in enumerate(marks):
            hi = marks[i + 1][1] - 1 if i + 1 < len(marks) else total
            hi = max(hi, page)
            plan.append(("%d-%d" % (page, hi), list(range(page, hi + 1)), "%02d-%s" % (i + 1, slug(title))))
    if not plan:
        raise ValueError("Nothing to split.")
    os.makedirs(a.out_dir, exist_ok=True)
    files = []
    for label, pages, name in plan:
        out = os.path.join(a.out_dir, name + ".pdf")
        T.assemble({"parts": [{"path": a.path, "pages": pages}], "out": out})
        files.append({"file": out, "range": label, "pages": len(pages), "bytes": os.path.getsize(out)})
    return {"source": a.path, "sourcePages": total, "files": files}

guarded(run)
`;
