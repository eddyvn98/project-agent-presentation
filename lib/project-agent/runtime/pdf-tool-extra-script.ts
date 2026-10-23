/** More operations for the sandbox pdf tool: markup (watermark, page numbers, header, footer, Bates), redaction, password protection, compression, health report and conversions. */
export const PDF_TOOL_EXTRA_PY = `
import subprocess, tempfile

FONT_FILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def run(cmd, timeout=280):
    done = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return done.returncode, (done.stdout + done.stderr).strip()

def start_copy(a):
    os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
    shutil.copyfile(a["path"], a["out"])
    return open_pdf(a["out"])

def finish(doc, out):
    if doc.can_save_incrementally():
        doc.saveIncr()
        doc.close()
    else:
        tmp = out + ".full"
        doc.save(tmp, garbage=1, deflate=True)
        doc.close()
        os.replace(tmp, out)

def put_text(page, text, size, where, gray=0.0, opacity=1.0, morph=None):
    font = fitz.Font(fontfile=FONT_FILE) if os.path.exists(FONT_FILE) else fitz.Font("helv")
    width = font.text_length(text, fontsize=size)
    w, h = page.rect.width, page.rect.height
    horizontal = "left" if "left" in where else "right" if "right" in where else "center"
    x = 36 if horizontal == "left" else w - 36 - width if horizontal == "right" else (w - width) / 2
    y = 36 + size if where.startswith("top") else h - 28
    if where == "center":
        x, y = (w - width) / 2, h / 2
    point = fitz.Point(x, y) * page.derotation_matrix
    kw = {"fontsize": size, "color": (gray, gray, gray), "fill_opacity": opacity}
    if os.path.exists(FONT_FILE):
        kw.update(fontname="dejavu", fontfile=FONT_FILE)
    if morph:
        kw["morph"] = (fitz.Point(w / 2, h / 2) * page.derotation_matrix, fitz.Matrix(morph))
    page.insert_text(point, text, **kw)

def markup(a):
    doc = start_copy(a)
    total, kind = len(doc), a["markupType"]
    pages = a.get("pages") or list(range(1, total + 1))
    if any(not isinstance(n, int) or n < 1 or n > total for n in pages):
        raise ValueError("Invalid page numbers (document has %d pages)." % total)
    size = float(a.get("fontSize") or (48 if kind == "watermark" else 11))
    text = str(a.get("text") or "")[:300]
    where = a.get("position") or ("center" if kind == "watermark" else "bottom-right" if kind == "bates" else "top-center" if kind == "header" else "bottom-center")
    number = int(a.get("startNumber") or 1)
    if kind in ("watermark", "header", "footer") and not text:
        raise ValueError("%s needs text." % kind)
    for n in pages:
        page = doc[n - 1]
        if kind == "watermark":
            put_text(page, text, size, "center", 0.5, 0.3, 45)
        elif kind == "page-numbers":
            put_text(page, "%s%d%s" % (a.get("prefix") or "", number, a.get("suffix") or ""), size, where)
        elif kind == "bates":
            put_text(page, "%s%06d%s" % (a.get("prefix") or "", number, a.get("suffix") or ""), size, where)
        elif kind in ("header", "footer"):
            put_text(page, text.replace("{page}", str(n)).replace("{pages}", str(total)), size, where)
        else:
            raise ValueError("Unknown markup type.")
        number += 1
    finish(doc, a["out"])
    return {"out": a["out"], "pagesMarked": len(pages)}

def redact(a):
    doc = start_copy(a)
    started, counts = time.time(), {}
    regions = a.get("regions") or []
    query = (a.get("query") or "").strip()
    if not query and not regions:
        raise ValueError("redact needs a query or regions.")
    for index, page in enumerate(doc):
        if time.time() - started > 240:
            raise ValueError("Redaction took too long; pass pages or regions.")
        rects = list(page.search_for(query)) if query else []
        rects += [region_rect(page, r) * page.derotation_matrix for r in regions if int(r.get("page", 0)) == index + 1]
        for rect in rects:
            page.add_redact_annot(rect.normalize(), fill=(0, 0, 0))
        if rects:
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
            counts[index + 1] = len(rects)
    if not counts:
        raise ValueError("Nothing to redact: no match found.")
    tmp = a["out"] + ".full"
    doc.save(tmp, garbage=3, deflate=True, clean=True)
    doc.close()
    os.replace(tmp, a["out"])
    return {"out": a["out"], "redactions": sum(counts.values()), "pages": counts}

def protect(a):
    password = str(a.get("password") or "")
    if len(password) < 4:
        raise ValueError("A password of at least 4 characters is required.")
    os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
    doc = fitz.open(a["path"])
    if a["mode"] == "decrypt":
        if doc.needs_pass and not doc.authenticate(password):
            raise ValueError("Wrong password.")
        doc.save(a["out"], encryption=fitz.PDF_ENCRYPT_NONE, garbage=1, deflate=True)
    else:
        if doc.needs_pass:
            raise ValueError("The file is already encrypted.")
        doc.save(a["out"], encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw=password, user_pw=password, garbage=1, deflate=True)
    doc.close()
    return {"out": a["out"], "mode": a["mode"]}

def compress(a):
    os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
    before = os.path.getsize(a["path"])
    if a.get("level") == "images":
        code, log = run(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/ebook", "-dCompatibilityLevel=1.6", "-sOutputFile=" + a["out"], a["path"]])
    else:
        code, log = run(["qpdf", "--object-streams=generate", "--recompress-flate", "--compression-level=9", a["path"], a["out"]])
    if code not in (0, 3) or not os.path.exists(a["out"]):
        raise ValueError(log[-300:] or "compression failed")
    after = os.path.getsize(a["out"])
    return {"out": a["out"], "before": before, "after": after, "savedPercent": round((before - after) * 100 / before, 1) if before else 0, "level": a.get("level") or "lossless"}

def health(a):
    code, check = run(["qpdf", "--check", a["path"]], 200)
    doc = fitz.open(a["path"])
    encrypted = doc.needs_pass
    report = {"bytes": os.path.getsize(a["path"]), "encrypted": bool(encrypted), "qpdfCheck": ("ok" if code == 0 else check[-400:]), "repaired": bool(doc.is_repaired)}
    if encrypted:
        return report
    sample = list(doc)[:30]
    fonts, unembedded = set(), set()
    for page in sample:
        for f in page.get_fonts():
            fonts.add(f[3])
            if f[1] == "n/a":
                unembedded.add(f[3])
    report.update(pages=len(doc), format=(doc.metadata or {}).get("format"), forms=bool(doc.is_form_pdf), signed=bool(doc.get_sigflags() > 0),
        outlines=len(doc.get_toc()), pagesWithoutTextInFirst30=sum(1 for p in sample if not p.get_text().strip()), imagesInFirst30=sum(len(p.get_images()) for p in sample),
        fontsInFirst30=len(fonts), notEmbeddedFonts=sorted(unembedded)[:10], incrementalUpdates=max(0, open(a["path"], "rb").read().count(b"%%EOF") - 1) if report["bytes"] < 300_000_000 else None)
    return report

def convert(a):
    src, out, to = a["path"], a["out"], a["to"]
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if to == "pdf":
        if src.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp")):
            image = fitz.open(src)
            pdf = fitz.open("pdf", image.convert_to_pdf())
            pdf.save(out)
            return {"out": out}
        outdir = tempfile.mkdtemp()
        code, log = run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", outdir, src], 280)
        produced = [f for f in os.listdir(outdir) if f.lower().endswith(".pdf")]
        if not produced:
            raise ValueError("LibreOffice could not convert the file: " + log[-200:])
        shutil.move(os.path.join(outdir, produced[0]), out)
        return {"out": out}
    doc = open_pdf(src)
    if to == "txt":
        open(out, "w", encoding="utf-8").write("\\n\\n".join("--- page %d ---\\n%s" % (i + 1, p.get_text("text")) for i, p in enumerate(doc)))
    elif to == "xml":
        from xml.sax.saxutils import escape
        pages = "".join('<page number="%d">%s</page>' % (i + 1, escape(p.get_text("text"))) for i, p in enumerate(doc))
        open(out, "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?><document pages="%d">%s</document>' % (len(doc), pages))
    elif to == "rtf":
        bs, nl = chr(92), chr(10)
        def rtf(text):
            out_chars = []
            for c in text:
                if c == nl: out_chars.append(bs + "par" + nl)
                elif c in "{}" + bs: out_chars.append(bs + c)
                elif ord(c) < 128: out_chars.append(c)
                else: out_chars.append(bs + "u" + str(ord(c) if ord(c) < 32768 else ord(c) - 65536) + "?")
            return "".join(out_chars)
        body = (bs + "page" + nl).join(rtf(p.get_text("text")) for p in doc)
        open(out, "w", encoding="utf-8").write("{" + bs + "rtf1" + bs + "ansi" + bs + "uc1" + nl + body + "}")
    elif to == "html":
        open(out, "w", encoding="utf-8").write("<html><meta charset=utf-8><body>" + "".join(p.get_text("html") for p in doc) + "</body></html>")
    elif to == "xlsx" and a.get("mode") == "tables":
        import pdfplumber
        from openpyxl import Workbook
        wb, count = Workbook(), 0
        wb.remove(wb.active)
        with pdfplumber.open(src) as pdf:
            for number, page in enumerate(pdf.pages, start=1):
                for t, table in enumerate(page.extract_tables() or [], start=1):
                    ws = wb.create_sheet("p%d-t%d" % (number, t))
                    for row in table:
                        ws.append([("" if c is None else str(c)) for c in row])
                    count += 1
        if not count:
            raise ValueError("No tables were found; use the default mode for page text.")
        wb.save(out)
    elif to in ("docx", "pptx", "xlsx"):
        code, log = run(["python3", "-W", "ignore", "/work/.tools/pdf_office_convert.py", src, to, out, a.get("mode") or "auto"], 280)
        if code != 0 or not os.path.exists(out):
            raise ValueError(log[-300:] or "conversion failed")
    else:
        raise ValueError("Unsupported target: " + to)
    return {"out": out, "to": to}

OPS.update({"markup": markup, "redact": redact, "protect": protect, "compress": compress, "health": health, "convert": convert})
`;
