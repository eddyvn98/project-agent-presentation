/** OCR of the scanned pages (cached per page), table-page detection from ruled lines. */
export const PDF_SCAN_OCR_PY = String.raw`#!/usr/bin/env python3
"""pdf_scan_to_md.py: scanned PDF -> structured Markdown in one command (OCR, Vietnamese legal structure, spell fixes, table-page detection, checks).

  python3 /work/.tools/pdf_scan_to_md.py inputs/file.pdf outputs/file.md [--lang vie] [--workers 4] [--work outputs/work/scan] [--profile vn-legal|plain]
Run it again after writing outputs/work/tables/pNNN.md (one Markdown table per page): the OCR is cached, so the merge takes seconds.
It prints one JSON report: page counts, Dieu/Chuong/Muc found, missing or duplicated Dieu, appendices, table pages and which still need a table file.
"""
import argparse, collections, json, os, re, subprocess, sys, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
import cv2, numpy as np, pymupdf

BEST_URL = 'https://github.com/tesseract-ocr/tessdata_best/raw/main/%s.traineddata'

def tessdata_dir(lang, work):
    """tessdata_best is more accurate on Vietnamese diacritics; fall back to the installed model when it cannot be fetched."""
    folder = os.path.join(work, 'tessdata')
    target = os.path.join(folder, lang + '.traineddata')
    if os.path.exists(target) and os.path.getsize(target) > 1_000_000: return folder
    try:
        os.makedirs(folder, exist_ok=True)
        urllib.request.urlretrieve(BEST_URL % lang, target + '.part')
        os.replace(target + '.part', target)
        return folder
    except Exception as error:
        print('tessdata_best unavailable (%s); using the installed model' % error, file=sys.stderr)
        return None

def page_image(doc, index):
    page = doc[index]
    images = page.get_images(full=True)
    if images:
        raw = doc.extract_image(images[0][0])['image']
        return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    pix = page.get_pixmap(dpi=200)
    arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
    return cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2BGR)

def grid_lines(gray):
    """Counts long horizontal and vertical rules: a page with a real table has many of both."""
    bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 12)
    h, w = bw.shape
    horizontal = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(40, w // 8), 1)))
    vertical = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(40, h // 12))))
    count = lambda mask: max(0, cv2.connectedComponents(cv2.dilate(mask, np.ones((3, 3), np.uint8)))[0] - 1)
    return count(horizontal), count(vertical)

def ocr_page(args, index):
    base = os.path.join(args.ocr_dir, '%03d' % (index + 1))
    meta = base + '.json'
    if os.path.exists(base + '.txt') and os.path.exists(meta): return json.load(open(meta))
    doc = pymupdf.open(args.pdf)
    img = page_image(doc, index)
    blue_green_red = img[:, :, 2]  # the red channel drops red stamps and seals
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    rows, cols = grid_lines(gray)
    big = cv2.resize(blue_green_red, None, fx=args.scale, fy=args.scale, interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(base + '.png', big)
    env = dict(os.environ, OMP_THREAD_LIMIT='1')
    if args.tessdata: env['TESSDATA_PREFIX'] = args.tessdata
    subprocess.run(['tesseract', base + '.png', base + '_t', '-l', args.lang, '--psm', '6', 'txt'], env=env, capture_output=True)
    os.replace(base + '_t.txt', base + '.txt')
    os.remove(base + '.png')
    info = {'page': index + 1, 'h_lines': rows, 'v_lines': cols, 'table': rows >= 4 and cols >= 3}
    json.dump(info, open(meta, 'w'))
    return info

def run_ocr(args):
    os.makedirs(args.ocr_dir, exist_ok=True)
    args.tessdata = tessdata_dir(args.lang, args.work)
    count = len(pymupdf.open(args.pdf))
    with ThreadPoolExecutor(args.workers) as pool: infos = list(pool.map(lambda i: ocr_page(args, i), range(count)))
    return count, infos

def page_lines(args, number):
    lines = open(os.path.join(args.ocr_dir, '%03d.txt' % number), encoding='utf8').read().split('\n')
    while lines and not lines[0].strip(): lines.pop(0)
    if number > 1 and lines and len(lines[0].strip()) <= 4: lines.pop(0)  # printed page number
    return [line.strip() for line in lines]
`;
