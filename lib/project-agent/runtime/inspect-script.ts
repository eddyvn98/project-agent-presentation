/** Prints a compact structural summary of the Word, Excel and PowerPoint files in /work/inputs, so the agent need not probe them step by step. */
export const INSPECT_SCRIPT = String.raw`
import collections, glob, os, sys
out = []
def docx_summary(path):
    import docx
    d = docx.Document(path)
    styles = collections.Counter(p.style.name for p in d.paragraphs)
    heads = [(p.style.name, p.text.strip()[:60]) for p in d.paragraphs if p.style.name.lower().startswith(("heading", "title")) and p.text.strip()]
    s = d.sections[0]
    out.append("DOCX %s: %d paragraphs, %d tables, %d inline images, %d sections; page %.1fx%.1f cm, margins L%.1f R%.1f T%.1f B%.1f cm" % (os.path.basename(path), len(d.paragraphs), len(d.tables), len(d.inline_shapes), len(d.sections), s.page_width.cm, s.page_height.cm, s.left_margin.cm, s.right_margin.cm, s.top_margin.cm, s.bottom_margin.cm))
    out.append("  styles used: " + ", ".join("%s x%d" % kv for kv in styles.most_common(14)))
    for t in d.tables[:4]:
        out.append("  table %dx%d style=%s first row: %s" % (len(t.rows), len(t.columns), t.style.name if t.style else "-", " | ".join(c.text.strip()[:18] for c in t.rows[0].cells[:5])))
    out.append("  header: " + " / ".join(p.text.strip() for p in s.header.paragraphs if p.text.strip())[:120])
    out.append("  footer: " + " / ".join(p.text.strip() for p in s.footer.paragraphs if p.text.strip())[:120])
    out.append("  outline (%d headings): " % len(heads) + "; ".join("%s:%s" % (a.replace("Heading ", "H"), b) for a, b in heads[:24]))
def xlsx_summary(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    out.append("XLSX %s: " % os.path.basename(path) + "; ".join("%s %sx%s" % (ws.title, ws.max_row, ws.max_column) for ws in wb.worksheets[:12]))
def pptx_summary(path):
    from pptx import Presentation
    p = Presentation(path)
    out.append("PPTX %s: %d slides; layouts: %s" % (os.path.basename(path), len(p.slides), ", ".join(l.name for l in p.slide_layouts[:10])))
    for i, sl in enumerate(p.slides, 1):
        if i > 12: break
        title = sl.shapes.title.text[:60] if sl.shapes.title is not None and sl.shapes.title.has_text_frame else ""
        out.append("  slide %d: %s (%d shapes)" % (i, title, len(sl.shapes)))
for path in sorted(glob.glob("/work/inputs/*")):
    try:
        ext = path.lower().rsplit(".", 1)[-1]
        {"docx": docx_summary, "xlsx": xlsx_summary, "pptx": pptx_summary}.get(ext, lambda p: None)(path)
    except Exception as e:
        out.append("(could not summarize %s: %s)" % (os.path.basename(path), str(e)[:80]))
print("\n".join(out)[:6000])
`;
