/** Runs inside the sandbox: converts a document to PDF with LibreOffice and writes a sampled contact sheet PNG. */
export const RENDER_SCRIPT = `import hashlib, json, os, re, shutil, subprocess, sys, zipfile
import pymupdf
from PIL import Image

def fit_width(path, out):
    """Copy of a workbook with every sheet set to print one page wide, so wide sheets are not cut across pages."""
    fit = 'fitToWidth="1" fitToHeight="0" orientation="landscape"'
    zin = zipfile.ZipFile(path)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.match(r"xl/worksheets/[^/]+\\.xml$", item.filename):
                x = data.decode("utf-8")
                if "<pageSetUpPr" in x: x = re.sub(r"<pageSetUpPr\\b[^>]*/>", '<pageSetUpPr fitToPage="1"/>', x, 1)
                elif re.search(r"<sheetPr\\s*/>", x): x = re.sub(r"<sheetPr\\s*/>", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', x, 1)
                elif "<sheetPr" in x: x = x.replace("</sheetPr>", '<pageSetUpPr fitToPage="1"/></sheetPr>', 1)
                else: x = re.sub(r"(<worksheet\\b[^>]*>)", r'\\1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', x, 1)
                if "<pageSetup" in x:
                    x = re.sub(r"<pageSetup\\b([^>]*?)/>", lambda m: "<pageSetup" + re.sub(r'\\s(?:fitToWidth|fitToHeight|scale|orientation)="[^"]*"', "", m.group(1)) + " " + fit + "/>", x, 1)
                elif re.search(r"<pageMargins\\b[^>]*/>", x):
                    x = re.sub(r"(<pageMargins\\b[^>]*/>)", lambda m: m.group(1) + "<pageSetup " + fit + "/>", x, 1)
                data = x.encode("utf-8")
            zout.writestr(item, data)

src, out_png = sys.argv[1], sys.argv[2]
pages_arg = sys.argv[3] if len(sys.argv) > 3 else "sample"
region = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else None
work = "/work/.render"
os.makedirs(work, exist_ok=True)
if src.lower().endswith(".pdf"):
    pdf = src
else:
    outdir = os.path.join(work, hashlib.md5(src.encode()).hexdigest()[:8])
    if src.lower().endswith(".xlsx"):
        fitted = os.path.join(work, "fit-" + hashlib.md5(src.encode()).hexdigest()[:8] + ".xlsx")
        try: fit_width(src, fitted)
        except Exception: shutil.copy(src, fitted)
        convert_src = fitted
    else:
        convert_src = src
    os.makedirs(outdir, exist_ok=True)
    pdf = os.path.join(outdir, os.path.splitext(os.path.basename(convert_src))[0] + ".pdf")
    if not (os.path.exists(pdf) and os.path.getmtime(pdf) >= os.path.getmtime(src)):
        for attempt in range(2):
            try:
                subprocess.run(["soffice", "--headless", "-env:UserInstallation=file:///work/.lo-profile", "--convert-to", "pdf", "--outdir", outdir, convert_src], check=True, timeout=90, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                break
            except subprocess.TimeoutExpired:
                subprocess.run(["pkill", "-9", "-f", "soffice"], check=False)
                if attempt == 1:
                    raise
doc = pymupdf.open(pdf)
total = len(doc)
if pages_arg == "sample":
    if total <= 8:
        pages = list(range(1, total + 1))
    else:
        chosen = {1, 2, 3, total}
        step = (total - 1) / (8 - len(chosen) + 1)
        i = 1
        while len(chosen) < 8:
            chosen.add(min(total, round(1 + i * step)))
            i += 1
        pages = sorted(chosen)
else:
    pages = [p for p in json.loads(pages_arg) if 1 <= p <= total][:4 if region else 8]
if region and pages_arg == "sample":
    pages = pages[:1]
cell = 1400 if region else 560 if len(pages) > 4 else 760
images = []
for p in pages:
    page = doc[p - 1]
    clip = None
    if region:
        r = page.rect
        clip = pymupdf.Rect(r.x0 + r.width * region["x"] / 100, r.y0 + r.height * region["y"] / 100, r.x0 + r.width * (region["x"] + region["width"]) / 100, r.y0 + r.height * (region["y"] + region["height"]) / 100) & r
    scale = min(cell / clip.width, 2000 / clip.height) if clip else cell / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip)
    images.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
cols = 1 if region else min(4, len(images)) if len(images) > 4 else min(2, len(images))
rows = -(-len(images) // cols)
h = max(i.height for i in images)
sheet = Image.new("RGB", (cols * cell, rows * h), "#e5e7eb")
for idx, img in enumerate(images):
    sheet.paste(img, ((idx % cols) * cell, (idx // cols) * h))
sheet.save(out_png)
print(json.dumps({"total_pages": total, "shown_pages": pages}))
`;
