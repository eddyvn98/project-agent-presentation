export const RECIPE_REGION_TABLE_PY = String.raw`"""Read the text inside one rectangle of every page into a table (Excel or CSV): drawing register from title blocks, sheet numbers, stamps, headers."""
import argparse, csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import guarded, pages_spec, region_arg
import _pdf_tool as T

MAX_LINE_COLUMNS = 12

def write_table(path, header, rows):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if path.lower().endswith(".xlsx"):
        try:
            import xlsxwriter
        except ImportError:
            path = path[:-5] + ".csv"
        else:
            book = xlsxwriter.Workbook(path)
            sheet = book.add_worksheet("Register")
            bold = book.add_format({"bold": True})
            for c, name in enumerate(header):
                sheet.write(0, c, name, bold)
            for r, row in enumerate(rows, 1):
                for c, value in enumerate(row):
                    sheet.write(r, c, value)
            sheet.freeze_panes(1, 0)
            sheet.set_column(0, 0, 8)
            sheet.set_column(1, len(header), 28)
            book.close()
            return path
    with open(path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    return path

def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    ap.add_argument("--region", default="60,82,40,18", help="x,y,width,height in percent of the page (default: bottom right, where title blocks usually are)")
    ap.add_argument("--pages", default="all")
    ap.add_argument("--out", default="outputs/region-table.xlsx", help=".xlsx or .csv")
    a = ap.parse_args()
    doc, region = T.open_pdf(a.path), region_arg(a.region)
    rows, widest, empty = [], 0, []
    for n in pages_spec(a.pages, len(doc)):
        page = doc[n - 1]
        rect = (T.region_rect(page, region) * page.derotation_matrix).normalize()
        lines = [" ".join(line.split()) for line in page.get_text("text", clip=rect).splitlines() if line.strip()]
        if not lines:
            empty.append(n)
        widest = max(widest, min(len(lines), MAX_LINE_COLUMNS))
        rows.append((n, lines))
    header = ["page", "text"] + ["line %d" % i for i in range(1, widest + 1)]
    table = [[n, " | ".join(lines)] + lines[:MAX_LINE_COLUMNS] + [""] * (widest - len(lines[:MAX_LINE_COLUMNS])) for n, lines in rows]
    written = write_table(a.out, header, table)
    return {"out": written, "pages": len(rows), "pagesWithoutText": empty[:50], "sample": [{"page": n, "text": " | ".join(lines)[:160]} for n, lines in rows[:3]],
            "note": "pages without text may be scans (use OCR first) or the region misses the title block" if empty else ""}

guarded(run)
`;
