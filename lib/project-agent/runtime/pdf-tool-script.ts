/**
 * Python run in the Agent sandbox for the `pdf` action. The page export and visual comparison functions are the ones from the Tpdf
 * server (server/workers/agent_web_worker.py), reused as they are; the rest (info, text, search, edits) is PyMuPDF on the file in place,
 * so no upload and no size limit beyond the workspace quota.
 */
import { PDF_TOOL_EXTRA_PY } from "./pdf-tool-extra-script";
import { PDF_TOOL_EDIT_PY } from "./pdf-tool-edit-script";

export const PDF_TOOL_PY = `
import json
import os
import sys

try:
    import pymupdf as fitz
except ImportError:
    import fitz
from PIL import Image, ImageChops

MAX_PAGES = 400


def verify_doc(path):
    doc = fitz.open(path)
    if doc.needs_pass:
        raise ValueError("Encrypted PDF is unsupported")
    if len(doc) > 1500:
        raise ValueError("Page count limit exceeded")
    return doc


def export_images(args):
    doc = verify_doc(args["pdf"])
    pages = args["pages"]
    fmt = args["format"]
    dpi = args["dpi"]
    if fmt not in ("png", "jpeg") or not isinstance(dpi, int) or not 36 <= dpi <= 180:
        raise ValueError("Invalid image format or DPI")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 8:
        raise ValueError("Export requires 1-8 pages")
    if any(not isinstance(n, int) or n < 1 or n > len(doc) for n in pages):
        raise ValueError("Invalid page number")
    files = []
    for number in pages:
        page = doc[number - 1]
        matrix = fitz.Matrix(dpi / 72, dpi / 72)
        if page.rect.width * dpi / 72 > 6000 or page.rect.height * dpi / 72 > 6000:
            raise ValueError("Raster page dimensions exceed limit")
        pix = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        path = os.path.join(args["dir"], str(number) + "." + fmt)
        img.save(path, format="PNG" if fmt == "png" else "JPEG", quality=86)
        if os.path.getsize(path) > 15 * 1024 * 1024:
            raise ValueError("Page image exceeds 15MB")
        files.append({"page": number, "path": path, "format": fmt})
    doc.close()
    return {"images": files}


def grayscale(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), colorspace=fitz.csGRAY, alpha=False)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples).resize((512, 512))


def compare(args):
    left, right = verify_doc(args["left"]), verify_doc(args["right"])
    if max(len(left), len(right)) > MAX_PAGES:
        raise ValueError("Comparison supports at most 400 pages")
    differences = []
    for i in range(max(len(left), len(right))):
        if i >= len(left) or i >= len(right):
            differences.append({"page": i + 1, "changedPercent": 100.0,
                "region": {"page": i + 1, "x": 0, "y": 0, "width": 100, "height": 100},
                "status": "added" if i >= len(left) else "removed"})
            continue
        first, second = grayscale(left[i]), grayscale(right[i])
        mask = ImageChops.difference(first, second).point(lambda pixel: 255 if pixel > 24 else 0)
        bbox = mask.getbbox()
        if not bbox:
            continue
        histogram = mask.histogram()
        ratio = round(histogram[255] * 100 / (512 * 512), 3)
        x0, y0, x1, y1 = bbox
        differences.append({"page": i + 1, "changedPercent": ratio,
            "region": {"page": i + 1, "x": round(x0 * 100 / 512, 2),
                "y": round(y0 * 100 / 512, 2), "width": round((x1 - x0) * 100 / 512, 2),
                "height": round((y1 - y0) * 100 / 512, 2)}, "status": "modified"})
    left_count, right_count = len(left), len(right)
    left.close()
    right.close()
    return {"pageCountLeft": left_count, "pageCountRight": right_count, "differences": differences}

import json, os, shutil, sys, time, unicodedata

def fold(text):
    plain = unicodedata.normalize("NFD", text.lower().replace("\\u0111", "d"))
    return "".join(ch for ch in plain if not unicodedata.combining(ch))

def open_pdf(path):
    doc = fitz.open(path)
    if doc.needs_pass:
        raise ValueError("Encrypted PDF is unsupported")
    return doc

def info(a):
    doc = open_pdf(a["path"])
    first = doc[0].rect if len(doc) else None
    meta = {k: v for k, v in (doc.metadata or {}).items() if v}
    return {"pages": len(doc), "bytes": os.path.getsize(a["path"]), "firstPage": [round(first.width), round(first.height)] if first else None, "metadata": meta,
            "textPagesOfFirst10": sum(1 for p in list(doc)[:10] if p.get_text().strip()), "forms": bool(doc.is_form_pdf)}

def text(a):
    doc = open_pdf(a["path"])
    start, count = max(1, a.get("page") or 1), min(a.get("count") or 5, 25)
    pages = [{"page": n, "text": doc[n - 1].get_text("text")[:12000]} for n in range(start, min(len(doc), start + count - 1) + 1)]
    return {"pageCount": len(doc), "pages": pages}

def search(a):
    doc = open_pdf(a["path"])
    needle = fold(a["query"]).strip()
    started, hits, complete = time.time(), [], True
    for index, page in enumerate(doc):
        if time.time() - started > 100:
            complete = False
            break
        raw = " ".join(page.get_text("text").split())
        folded = fold(raw)
        count = folded.count(needle)
        if count:
            at = folded.find(needle)
            hits.append({"page": index + 1, "score": count, "snippet": raw[max(0, at - 60):at + 160]})
    hits.sort(key=lambda h: (-h["score"], h["page"]))
    return {"pageCount": len(doc), "complete": complete, "results": hits[:15]}

def region_rect(page, region):
    w, h = page.rect.width, page.rect.height
    return fitz.Rect(region["x"] * w / 100, region["y"] * h / 100, (region["x"] + region["width"]) * w / 100, (region["y"] + region["height"]) * h / 100)

def edit(a):
    kind, src, out = a["editType"], a["path"], a["out"]
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    shutil.copyfile(src, out)
    doc = open_pdf(out)
    total = len(doc)
    pages = a.get("pages") or list(range(1, total + 1))
    if any(not isinstance(n, int) or n < 1 or n > total for n in pages):
        raise ValueError("Invalid page numbers (document has %d pages)." % total)
    incremental = True
    if kind == "rotate":
        degrees = a.get("degrees") or 90
        if degrees % 90:
            raise ValueError("Rotation must be a multiple of 90.")
        for n in pages:
            doc[n - 1].set_rotation((doc[n - 1].rotation + degrees) % 360)
    elif kind == "delete":
        keep = [n - 1 for n in range(1, total + 1) if n not in set(pages)]
        if not keep:
            raise ValueError("Cannot remove every page.")
        doc.select(keep); incremental = False
    elif kind in ("reorder", "split", "extract"):
        if kind == "reorder" and sorted(pages) != list(range(1, total + 1)):
            raise ValueError("Reorder needs every page exactly once.")
        doc.select([n - 1 for n in pages]); incremental = False
    elif kind == "crop":
        region = a.get("region") or {}
        for n in pages:
            page = doc[n - 1]
            page.set_cropbox(region_rect(page, region) * page.derotation_matrix)
    elif kind == "merge":
        for other in a.get("others") or []:
            doc.insert_pdf(open_pdf(other))
        incremental = False
    elif kind == "fill-form":
        done = 0
        for page in doc:
            for widget in page.widgets() or []:
                if widget.field_name in (a.get("fields") or {}):
                    widget.field_value = str(a["fields"][widget.field_name])[:2000]
                    widget.update(); done += 1
        if not done:
            raise ValueError("No matching form fields found.")
    elif kind == "mark-region":
        region = a.get("region") or {}
        page = doc[int(region.get("page", pages[0])) - 1]
        rect = region_rect(page, region) * page.derotation_matrix
        page.draw_rect(rect.normalize(), color=(0.9, 0.2, 0.1), fill=(1, 0.84, 0.18), fill_opacity=0.3, width=1.5)
        if a.get("note"):
            page.add_text_annot(rect.normalize().tl, a["note"][:500])
    else:
        raise ValueError("Unknown edit type.")
    if incremental and doc.can_save_incrementally():
        doc.saveIncr()
    else:
        tmp = out + ".full"
        doc.save(tmp, garbage=1, deflate=True)
        doc.close(); os.replace(tmp, out)
    return {"out": out, "pages": total if incremental else None}

def images(a):
    return export_images({"pdf": a["path"], "pages": a["pages"], "format": a["format"], "dpi": a["dpi"], "dir": a["dir"]})

def compare_op(a):
    result = compare({"left": a["path"], "right": a["other"]})
    left, right = open_pdf(a["path"]), open_pdf(a["other"])
    for d in result["differences"]:
        if d["status"] == "modified" and d["page"] <= len(left):
            page = left[d["page"] - 1]
            page.draw_rect(region_rect(page, d["region"]), color=(0.9, 0.1, 0.1), width=2)
    os.makedirs(os.path.dirname(a["out"]) or ".", exist_ok=True)
    left.save(a["out"], garbage=1, deflate=True)
    result["out"] = a["out"]
    result["total"] = len(result["differences"])
    result["differences"] = result["differences"][:40]
    return result

OPS = {"info": info, "text": text, "search": search, "edit": edit, "images": images, "compare": compare_op}
`+PDF_TOOL_EXTRA_PY+PDF_TOOL_EDIT_PY+`if __name__ == "__main__":
    try:
        spec = json.load(open(sys.argv[1]))
        print(json.dumps(OPS[spec["op"]](spec), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:400]}))
        sys.exit(1)
`;
