export const RECIPE_FIND_PAGES_PY = String.raw`"""Find which pages mention given words (accent- and case-insensitive), as a page-by-term table, and optionally pull those pages into a new PDF."""
import argparse, csv, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import fold, guarded, pages_spec
import _pdf_tool as T

BUDGET_SECONDS = 150

def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    ap.add_argument("--terms", required=True, help='words or phrases separated by ";"')
    ap.add_argument("--pages", default="all")
    ap.add_argument("--match", choices=["any", "all"], default="any", help="which pages --extract-out keeps")
    ap.add_argument("--table-out", help=".csv with a count per page and term")
    ap.add_argument("--extract-out", help="new PDF with the matching pages")
    a = ap.parse_args()
    terms = [t.strip() for t in a.terms.split(";") if t.strip()]
    if not terms:
        raise ValueError("--terms needs at least one word.")
    doc = T.open_pdf(a.path)
    needles, counts, started, complete = [fold(t) for t in terms], {}, time.time(), True
    for n in pages_spec(a.pages, len(doc)):
        if time.time() - started > BUDGET_SECONDS:
            complete = False
            break
        text = fold(" ".join(doc[n - 1].get_text("text").split()))
        row = [text.count(needle) for needle in needles]
        if any(row):
            counts[n] = row
    hit = lambda row: all(row) if a.match == "all" else any(row)
    kept = sorted(n for n, row in counts.items() if hit(row))
    result = {"pageCount": len(doc), "complete": complete, "termPages": {t: [n for n, row in counts.items() if row[i]][:200] for i, t in enumerate(terms)},
              "matchingPages": kept[:300], "matchingCount": len(kept)}
    if a.table_out:
        os.makedirs(os.path.dirname(a.table_out) or ".", exist_ok=True)
        with open(a.table_out, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(["page"] + terms)
            for n in sorted(counts):
                writer.writerow([n] + counts[n])
        result["tableOut"] = a.table_out
    if a.extract_out:
        if not kept:
            raise ValueError("No page matches, so there is nothing to extract.")
        T.assemble({"parts": [{"path": a.path, "pages": kept}], "out": a.extract_out})
        result["extractOut"] = a.extract_out
    return result

guarded(run)
`;
