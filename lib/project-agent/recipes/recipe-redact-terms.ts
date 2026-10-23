export const RECIPE_REDACT_TERMS_PY = String.raw`"""Permanently remove words and personal data (emails, phone numbers, ID numbers) from a PDF: text and the pixels under it are deleted, then checked."""
import argparse, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import guarded, pages_spec
import _pdf_tool as T

fitz = T.fitz
PRESETS = {
    "emails": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    "phones": re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?!\d)"),
    "vn_ids": re.compile(r"(?<!\d)(?:\d{12}|\d{9})(?!\d)"),
}

def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    ap.add_argument("--terms", default="", help='words or phrases separated by ";" (case-insensitive)')
    ap.add_argument("--emails", action="store_true")
    ap.add_argument("--phones", action="store_true")
    ap.add_argument("--vn-ids", action="store_true", help="9 or 12 digit ID numbers (may also match other long numbers: check the report)")
    ap.add_argument("--regex", action="append", default=[], help="extra regular expression (repeatable)")
    ap.add_argument("--pages", default="all")
    ap.add_argument("--out", default="outputs/redacted.pdf")
    a = ap.parse_args()
    terms = [t.strip() for t in a.terms.split(";") if t.strip()]
    patterns = [PRESETS[k] for k, on in (("emails", a.emails), ("phones", a.phones), ("vn_ids", a.vn_ids)) if on] + [re.compile(r) for r in a.regex]
    if not terms and not patterns:
        raise ValueError("Give --terms, --emails, --phones, --vn-ids or --regex.")

    def targets(page):
        found = list(terms)
        if patterns:
            text = page.get_text("text")
            for pattern in patterns:
                found += [m.group(0) for m in pattern.finditer(text)]
        return sorted(set(found), key=len, reverse=True)

    doc = T.open_pdf(a.path)
    per_page, scans = {}, []
    chosen = pages_spec(a.pages, len(doc))
    for n in chosen:
        page = doc[n - 1]
        count = 0
        for needle in targets(page):
            for rect in page.search_for(needle):
                page.add_redact_annot(rect, fill=(0, 0, 0))
                count += 1
        if count:
            page.apply_redactions(images=getattr(fitz, "PDF_REDACT_IMAGE_PIXELS", 2))
            per_page[n] = count
        elif not page.get_text("text").strip() and page.get_images():
            scans.append(n)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    doc.save(a.out, garbage=4, deflate=True, clean=True)
    doc.close()
    check = T.open_pdf(a.out)
    left = sum(len(check[n - 1].search_for(t)) for n in chosen for t in terms) + sum(len(p.findall(check[n - 1].get_text("text"))) for n in chosen for p in patterns)
    return {"out": a.out, "redactions": sum(per_page.values()), "perPage": {str(n): c for n, c in per_page.items()}, "remainingMatches": left,
            "imagePagesWithoutText": scans[:50], "note": "image-only pages carry no text layer: run OCR first, or their content was not searched" if scans else ""}

guarded(run)
`;
