/** Vietnamese legal structure (chapter, section, article, clause, point) and appendix rendering for pdf_scan_to_md.py. */
export const PDF_SCAN_STRUCTURE_PY = String.raw`
LETTERS = list('abcdđeghiklmnopqrstuvxy')  # vi-allow
DIEU = re.compile(r'^\W{0,3}Đi[ềêếeềễ]u\s+(\d{1,3})\s*[\.,:;]\s*(.*)$')  # vi-allow
KHOAN = re.compile(r'^(\d{1,2})\s?[\.,]\s+(\S.*)$')
KHOAN_ONE = re.compile(r'^[ÌlIi!|\]]{1,2}[\.,]\s+(\S.*)$')  # vi-allow
DIEM = re.compile(r'^([a-zđ])\)\s*(\S.*)$')  # vi-allow
CHUONG = re.compile(r'^.{0,6}?Ch[uư][ơo]ng\s+([IVXHl1]+)\b\s*(.*)$')  # vi-allow
MUC = re.compile(r'^.{0,8}?Mục\s*(\d)\b\W*(.*)$')  # vi-allow
JUNK = re.compile(r'[~_>^ˆ⁄|\\]')
APPENDIX = re.compile(r'^.{0,8}?PH[UỤ]\s*L[UỤ]C\s+([IVXHl1]+)\W{0,3}$', re.I)  # vi-allow
ROMAN_SEQ = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
ROMAN = {'H': 'II', 'IH': 'III', 'Il': 'II', 'l': 'I', '1': 'I'}
NEW_TEXT = re.compile(r'^(Nghị định|Trường hợp|Cơ quan|Các |Việc |Người|Chủ đầu|Trong |Đối với|Tổ chức|Bộ |Ủy ban)')  # vi-allow

def roman(value): return ROMAN.get(value, value)

def appendix_heading(lines):
    """(line index, roman numeral) of an appendix heading near the top of a page: the line is just 'Phu luc X' and '(Kem theo ...' follows."""
    for index, line in enumerate(lines[:6]):
        m = APPENDIX.match(line)
        if m and any('Kèm theo' in other or 'Kem theo' in other for other in lines[index + 1:index + 7]): return index, roman(m.group(1))  # vi-allow
    return None

def appendix_start(args, count):
    """First page after the body that carries an appendix heading (running text also says 'Phu luc III ban hanh kem theo')."""
    for number in range(2, count + 1):
        if appendix_heading(page_lines(args, number)): return number
    return count + 1

def body_items(args, last):
    lines = []
    for number in range(1, last + 1): lines += [(number, line) for line in page_lines(args, number)] + [(number, '')]
    items, cur = [], None
    skipped_junk, muc_count, muc_in_chapter = False, 0, False  # a chapter that has Mục headings: an all-caps line OCR left without its 'Mục N' is the next Mục  # vi-allow
    def flush():
        nonlocal cur
        if cur: items.append(cur); cur = None
    for index, (page, text) in enumerate(lines):
        if not text: continue
        if len(text) <= 14 and JUNK.search(text) and not re.search(r'[^\W\d_]{3}', text): skipped_junk = True; continue  # stray marks the scanner left around a heading
        blank = index > 0 and lines[index - 1][1] == '' or skipped_junk
        skipped_junk = False
        m = DIEU.match(text)
        if m: flush(); cur = ['dieu', m.group(1), m.group(2)]; continue
        m = CHUONG.match(text)
        if m and (m.group(1) in 'IVXHl' or len(m.group(1)) < 5): flush(); cur = ['chuong', roman(m.group(1)), m.group(2)]; muc_in_chapter = False; continue
        m = MUC.match(text)
        if m and len(text) < 80: flush(); cur = ['muc', m.group(1), re.sub(r'^\W+|\W+$', '', m.group(2))]; muc_count, muc_in_chapter = int(m.group(1)), True; continue
        if cur and cur[0] in ('chuong', 'muc') and text.isupper(): cur[2] = (cur[2] + ' ' + text).strip(); continue
        if muc_in_chapter and blank and len(text) >= 12 and text.isupper() and (cur is None or cur[0] not in ('chuong', 'muc')): flush(); muc_count += 1; cur = ['muc', str(muc_count), text]; continue
        if cur and cur[0] == 'dieu' and not blank and len(cur) == 3 and not KHOAN.match(text) and not KHOAN_ONE.match(text) and not DIEM.match(text) and not cur[2].endswith(('.', ';', ':')): cur[2] += ' ' + text; continue
        m = KHOAN.match(text)
        if m or KHOAN_ONE.match(text):
            number, body = (m.group(1), m.group(2)) if m else ('1', KHOAN_ONE.match(text).group(1))
            flush(); cur = ['khoan', number, body, 1]; continue
        m = DIEM.match(text)
        if m: flush(); cur = ['diem', m.group(1), m.group(2), 1]; continue
        if cur is None: cur = ['text', '', text, 1]; continue
        if blank and cur[0] in ('khoan', 'diem', 'text') and cur[2].endswith(('.', ':', ';')) and text[0].isupper() and NEW_TEXT.match(text): flush(); cur = ['text', '', text, 1]; continue
        if cur[0] == 'dieu': flush(); cur = ['text', '', text, 1]; continue
        cur[2] += ' ' + text
    flush()
    return items

def clean_title(text): return re.sub(r'\s+', ' ', re.sub(r'^[^\w(]+|[\s;:\\|]+$', '', re.sub(r'^[ˆ˜´¨ʻ]+\s*', '', text))).strip()

def render_body(items):
    md, expected, seen = [''], 0, []
    for kind, label, text, *_ in items:
        if kind == 'chuong': md.append('\n## Chương %s – %s' % (label, clean_title(text)))  # vi-allow
        elif kind == 'muc': md.append('\n### Mục %s. %s' % (label, clean_title(text)))  # vi-allow
        elif kind == 'dieu': md.append('\n#### Điều %s. %s\n' % (label, text.strip())); seen.append(int(label)); expected = 0  # vi-allow
        elif kind == 'khoan': md.append('\n%s. %s' % (label, text.strip())); expected = 0
        elif kind == 'diem':
            letter = label
            if letter in 'dđ' and expected < len(LETTERS) and LETTERS[expected] in 'dđ': letter = LETTERS[expected]  # OCR confuses d and đ: the sequence decides  # vi-allow
            if letter in LETTERS: expected = LETTERS.index(letter) + 1
            md.append('   - %s) %s' % (letter, text.strip()))
        else: md.append('\n' + text.strip())
    return '\n'.join(md) + '\n', seen

BLOCK_START = re.compile(r'^(Mẫu số|[IVX]+\.\s|\d{1,2}\.\s|\d\.\d\.?\s|[a-zđ]\)\s|[-–•]\s|Kính gửi|Căn cứ|Nơi nhận|CỘNG HÒA|Độc lập|Số:|Điều \d)')  # vi-allow

def reflow(lines):
    out, cur = [], ''
    for line in lines:
        if not line:
            if cur: out.append(cur); cur = ''
        elif BLOCK_START.match(line) and cur: out.append(cur); cur = line
        else: cur = (cur + ' ' + line).strip()
    if cur: out.append(cur)
    return out

def render_appendix(args, first, count, infos):
    """Appendix pages: a Markdown table when outputs/work/tables/pNNN.md exists, otherwise the reflowed OCR text with a marker."""
    md, pending, current, seen_appendices = [], [], None, 0
    for number in range(first, count + 1):
        lines = page_lines(args, number)
        table_file = os.path.join(args.tables_dir, 'p%03d.md' % number)
        heading = appendix_heading(lines)
        if heading:  # appendices come in order and OCR misreads the numeral (III as II), so they are numbered by position
            seen_appendices += 1; current = ROMAN_SEQ[min(seen_appendices, len(ROMAN_SEQ)) - 1]
            md.append('\n## Phụ lục %s\n' % current); lines = lines[:heading[0]] + lines[heading[0] + 1:]  # vi-allow
        is_table = infos[number - 1]['table']
        if os.path.exists(table_file): md.append('\n<!-- trang PDF %d: bảng -->\n\n%s\n' % (number, open(table_file, encoding='utf8').read().strip())); continue  # vi-allow
        if is_table: pending.append(number)
        md.append('\n<!-- trang PDF %d%s -->\n' % (number, ' (bảng, cần chuyển bằng ảnh)' if is_table else ''))  # vi-allow
        md += [block + '\n' for block in reflow(lines)]
    return '\n'.join(md), pending, current
`;
