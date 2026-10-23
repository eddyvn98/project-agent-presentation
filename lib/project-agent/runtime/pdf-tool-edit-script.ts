/** Sandbox pdf tool, multi-file and content operations: assemble (split, merge, insert pages of one file into another), annotate, sign, replace-text. */
export const PDF_TOOL_EDIT_PY = `
def parse_pages(spec, total):
    if spec in (None, "", "all"):
        return list(range(1, total + 1))
    if isinstance(spec, list):
        out = [int(n) for n in spec]
    else:
        out = []
        for part in str(spec).split(","):
            part = part.strip()
            if "-" in part:
                lo, hi = part.split("-", 1)
                out += list(range(int(lo or 1), int(hi or total) + 1))
            elif part:
                out.append(int(part))
    if any(n < 1 or n > total for n in out):
        raise ValueError("Page out of range (the file has %d pages)." % total)
    return out

def assemble(a):
    """Builds a new PDF from parts in order: split (one part), merge (several), insert pages of one file into another at a position."""
    parts = a.get("parts") or []
    if not parts:
        raise ValueError("assemble needs parts.")
    os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
    result, cache = fitz.open(), {}
    for part in parts:
        if part["path"] not in cache:
            cache[part["path"]] = open_pdf(part["path"])
        source = cache[part["path"]]
        for n in parse_pages(part.get("pages"), len(source)):
            result.insert_pdf(source, from_page=n - 1, to_page=n - 1)
    if not len(result):
        raise ValueError("The result would have no pages.")
    result.save(a["out"], garbage=1, deflate=True)
    return {"out": a["out"], "pages": len(result), "parts": len(parts)}

COLORS = {"yellow": (1, 0.85, 0.1), "red": (0.9, 0.1, 0.1), "green": (0.1, 0.7, 0.2), "blue": (0.1, 0.3, 0.9), "orange": (1, 0.55, 0), "black": (0, 0, 0)}

def annotate(a):
    doc = start_copy(a)
    total, done = len(doc), []
    for item in a.get("annotations") or []:
        kind, number = item.get("type"), int(item.get("page") or 1)
        if number < 1 or number > total:
            raise ValueError("Annotation page %d is out of range." % number)
        page, color = doc[number - 1], COLORS.get(item.get("color") or "yellow", COLORS["yellow"])
        rects = [r for r in page.search_for(item["query"])] if item.get("query") else []
        if item.get("region"):
            rects.append(region_rect(page, item["region"]) * page.derotation_matrix)
        if kind in ("highlight", "underline", "strikeout"):
            if not rects:
                raise ValueError("No text found for the %s on page %d." % (kind, number))
            annot = {"highlight": page.add_highlight_annot, "underline": page.add_underline_annot, "strikeout": page.add_strikeout_annot}[kind](rects)
            annot.set_colors(stroke=color)
            if item.get("text"):
                annot.set_info(content=str(item["text"])[:1000])
            annot.update()
        elif kind == "note":
            point = rects[0].tl if rects else fitz.Point(40, 40)
            page.add_text_annot(point, str(item.get("text") or "")[:1000]).update()
        elif kind in ("text", "stamp"):
            if not rects:
                raise ValueError("%s needs a region or query." % kind)
            page.add_freetext_annot(rects[0], str(item.get("text") or "")[:500], fontsize=float(item.get("fontSize") or 12), text_color=color, border_color=color if kind == "stamp" else None, fill_color=None)
        elif kind in ("rect", "circle"):
            if not rects:
                raise ValueError("%s needs a region or query." % kind)
            annot = page.add_rect_annot(rects[0]) if kind == "rect" else page.add_circle_annot(rects[0])
            annot.set_colors(stroke=color)
            annot.set_border(width=2)
            annot.update()
        elif kind == "ink":
            strokes = [[(page.rect.width * p[0] / 100, page.rect.height * p[1] / 100) for p in stroke] for stroke in item.get("strokes") or []]
            if not strokes:
                raise ValueError("ink needs strokes.")
            annot = page.add_ink_annot(strokes)
            annot.set_colors(stroke=color)
            annot.update()
        else:
            raise ValueError("Unknown annotation type: %s" % kind)
        done.append({"page": number, "type": kind})
    if not done:
        raise ValueError("No annotations given.")
    finish(doc, a["out"])
    return {"out": a["out"], "annotations": done}

def sign(a):
    """Visual signature (image or text with date) in a rectangle, or a digital signature from a .p12 certificate (pyHanko)."""
    if a.get("p12"):
        try:
            from pyhanko.sign import signers, fields
            from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        except ImportError:
            raise ValueError("Digital signing is not available in this sandbox image (pyHanko missing).")
        os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
        signer = signers.SimpleSigner.load_pkcs12(a["p12"], passphrase=str(a.get("password") or "").encode())
        if signer is None:
            raise ValueError("Could not open the certificate (wrong password?).")
        with open(a["path"], "rb") as inf:
            writer = IncrementalPdfFileWriter(inf)
            region = a.get("region") or {}
            fields.append_signature_field(writer, fields.SigFieldSpec("Signature1", on_page=int(region.get("page", 1)) - 1, box=(40, 40, 240, 100)))
            with open(a["out"], "wb") as outf:
                signers.sign_pdf(writer, signers.PdfSignatureMetadata(field_name="Signature1", reason=str(a.get("text") or "Approved")[:200]), signer=signer, output=outf)
        return {"out": a["out"], "mode": "digital"}
    doc = start_copy(a)
    region = a.get("region") or {}
    page = doc[int(region.get("page", 1)) - 1]
    rect = region_rect(page, region) * page.derotation_matrix
    if not a.get("image") and not str(a.get("text") or "").strip():
        raise ValueError("A visual signature needs an image or text.")
    if a.get("image"):
        page.insert_image(rect.normalize(), filename=a["image"], keep_proportion=True)
    stamp = str(a.get("text") or "").strip()
    if stamp:
        box = rect.normalize() if not a.get("image") else fitz.Rect(rect.x0, rect.y1, rect.x1 + 80, rect.y1 + 24)
        extra = {"fontname": "dejavu", "fontfile": FONT_FILE} if os.path.exists(FONT_FILE) else {}
        page.insert_textbox(box, stamp + "\\n" + time.strftime("%Y-%m-%d"), fontsize=10, color=(0.1, 0.2, 0.7), **extra)
    finish(doc, a["out"])
    return {"out": a["out"], "mode": "visual"}

def replace_text(a):
    """Edits text in place: removes the matched text and writes the replacement at the same spot with the same size and colour (font: the closest base font)."""
    doc = start_copy(a)
    count = 0
    wanted = [(r["find"], str(r.get("replace", ""))) for r in a.get("replacements") or []]
    for page in doc:
        for find, replace in wanted:
            for rect in page.search_for(find):
                size, color = 11.0, (0, 0, 0)
                for block in page.get_text("dict", clip=rect)["blocks"]:
                    for line in block.get("lines", []):
                        for span in line["spans"]:
                            size, color = span["size"], tuple(((span["color"] >> s) & 255) / 255 for s in (16, 8, 0))
                page.add_redact_annot(rect, fill=(1, 1, 1))
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
                extra = {"fontname": "dejavu", "fontfile": FONT_FILE} if os.path.exists(FONT_FILE) else {"fontname": "helv"}
                page.insert_text(fitz.Point(rect.x0, rect.y1 - size * 0.2), replace, fontsize=size, color=color, **extra)
                count += 1
    if not count:
        raise ValueError("The text to replace was not found (scanned pages need OCR first).")
    tmp = a["out"] + ".full"
    doc.save(tmp, garbage=1, deflate=True)
    doc.close()
    os.replace(tmp, a["out"])
    return {"out": a["out"], "replaced": count}

OPS.update({"assemble": assemble, "annotate": annotate, "sign": sign, "replace-text": replace_text})
`;
