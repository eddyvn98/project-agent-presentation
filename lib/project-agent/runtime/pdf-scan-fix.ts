/** Spell fixes, checks and the command line for pdf_scan_to_md.py. */
export const PDF_SCAN_FIX_PY = String.raw`
PAIRS = [('tô chức','tổ chức'),('đâu tư','đầu tư'),('quyên','quyền'),('câp','cấp'),('kêt','kết'),('thiêt','thiết'),('thiệt kê','thiết kế'),('thuyêt','thuyết'),  # vi-allow
 ('triên','triển'),('triền','triển'),('điêu','điều'),('điêm','điểm'),('điềm','điểm'),('chât','chất'),('gôm','gồm'),('hô sơ','hồ sơ'),('hỗ sơ','hồ sơ'),  # vi-allow
 ('kiêm tra','kiểm tra'),('kiềm tra','kiểm tra'),('thẳm','thẩm'),('thầm','thẩm'),('thắm','thẩm'),('thấm định','thẩm định'),('thấm tra','thẩm tra'),  # vi-allow
 ('thẫm','thẩm'),('tiệp','tiếp'),('khân','khẩn'),('giầy','giấy'),('giây phép','giấy phép'),('bản vê','bản vẽ'),('khả thị','khả thi'),('tông mức','tổng mức'),  # vi-allow
 ('tâng','tầng'),('tằng','tầng'),('đât','đất'),('đồi với','đối với'),('đầu tự','đầu tư'),('mâu','mẫu'),('Mẫu sô','Mẫu số'),('đê nghị','đề nghị'),  # vi-allow
 ('đê cập','đề cập'),('kê hoạch','kế hoạch'),('kỹ thuât','kỹ thuật'),('quy chuân','quy chuẩn'),('tiêu chuân','tiêu chuẩn'),('chuân','chuẩn'),('quôc','quốc'),  # vi-allow
 ('quộc','quốc'),('báo đảm','bảo đảm'),('cộng đông','cộng đồng'),('thâm','thẩm'),('luông','lượng'),('phâm','phẩm'),('thị công','thi công'),('QUAN LÝ','QUẢN LÝ'),('TÔ CHỨC','TỔ CHỨC'),('GIẦY PHÉP','GIẤY PHÉP'),('ĐIÊU KHOẢN','ĐIỀU KHOẢN')]  # vi-allow

def curated_fix(text):
    word = r'(?<![^\W\d_])%s(?![^\W\d_])'
    total = 0
    for wrong, right in PAIRS:
        text, n = re.subn(word % re.escape(wrong), right, text); total += n
        text, n = re.subn(word % re.escape(wrong[0].upper() + wrong[1:]), right[0].upper() + right[1:], text); total += n
    text, n = re.subn(r'\bglao\b', 'giao', text)
    return text, total + n

def base_form(word):
    word = word.replace('đ', 'd').replace('Đ', 'D')  # vi-allow
    return ''.join(c for c in unicodedata.normalize('NFD', word) if not unicodedata.combining(c)).lower()

def bigram_fix(text):
    """Swaps a syllable for a same-base variant when the document's own word pairs favour it (fixes diacritics OCR got wrong)."""
    matches = list(re.finditer(r'[^\W\d_]+', text))
    tokens = [m.group(0).lower() for m in matches]
    unigram, bigram, variants = collections.Counter(tokens), collections.Counter(zip(tokens, tokens[1:])), collections.defaultdict(set)
    for token in unigram: variants[base_form(token)].add(token)
    out, last, changes = [], 0, 0
    for i, m in enumerate(matches):
        low = tokens[i]
        if len(variants[base_form(low)]) < 2 or unigram[low] > 60: continue
        prev, nxt = tokens[i - 1] if i else '', tokens[i + 1] if i + 1 < len(tokens) else ''
        score = lambda c: bigram[(prev, c)] + bigram[(c, nxt)]
        best = max(variants[base_form(low)], key=lambda c: (score(c), unigram[c]))
        if best != low and score(best) >= 3 * max(1, score(low)) and score(best) >= 3 and unigram[best] > unigram[low]:
            word = m.group(0)
            out.append(text[last:m.start()]); out.append(best.capitalize() if word[0].isupper() and not word.isupper() else best.upper() if word.isupper() and len(word) > 1 else best)
            last = m.end(); changes += 1
    out.append(text[last:])
    return ''.join(out), changes

def check(seen, chuong, muc):
    wanted = list(range(1, max(seen) + 1)) if seen else []
    return {'dieu_found': len(set(seen)), 'dieu_max': max(seen) if seen else 0, 'dieu_missing': [n for n in wanted if n not in seen], 'dieu_duplicates': sorted({n for n in seen if seen.count(n) > 1}),
            'in_order': seen == sorted(seen), 'chuong': chuong, 'muc': muc}

def main():
    parser = argparse.ArgumentParser(description='Scanned PDF to structured Markdown')
    parser.add_argument('pdf'); parser.add_argument('out')
    parser.add_argument('--lang', default='vie'); parser.add_argument('--workers', type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument('--scale', type=float, default=1.5); parser.add_argument('--work', default='/work/outputs/work/scan')
    parser.add_argument('--profile', default='vn-legal', choices=['vn-legal', 'plain'])
    args = parser.parse_args()
    args.ocr_dir, args.tables_dir = os.path.join(args.work, 'ocr'), os.path.join(os.path.dirname(args.work), 'tables')
    count, infos = run_ocr(args)
    if args.profile == 'plain':
        md = ''.join('\n<!-- trang PDF %d -->\n\n%s\n' % (n, '\n\n'.join(reflow(page_lines(args, n)))) for n in range(1, count + 1))
        fixed, n1 = curated_fix(md); open(args.out, 'w', encoding='utf8').write(fixed)
        print(json.dumps({'pages': count, 'spell_fixes': n1, 'table_pages': [i['page'] for i in infos if i['table']]}, ensure_ascii=False)); return
    first_appendix = appendix_start(args, count)
    body, seen = render_body(body_items(args, first_appendix - 1))
    appendix, pending, last = render_appendix(args, first_appendix, count, infos)
    text, curated = curated_fix(body + appendix)
    text, bigram = bigram_fix(text)
    header = '<!-- Chuyển từ bản scan PDF %d trang bằng OCR (Tesseract %s) rồi hiệu chỉnh tự động; trang bảng có thể được chuyển từ ảnh. -->\n' % (count, args.lang)  # vi-allow
    open(args.out, 'w', encoding='utf8').write(header + text)
    final_seen = [int(n) for n in re.findall(r'(?m)^#### Điều (\d+)\.', text)]  # vi-allow
    tables = [i['page'] for i in infos if i['table'] and i['page'] >= first_appendix]
    report = check(final_seen, len(re.findall(r'(?m)^## Chương', text)), len(re.findall(r'(?m)^### Mục', text)))  # vi-allow
    report.update({'pages': count, 'body_pages': first_appendix - 1, 'appendix_pages': [first_appendix, count], 'appendices': re.findall(r'(?m)^## (Phụ lục \w+)', text),  # vi-allow
                   'spell_fixes': {'curated': curated, 'context': bigram}, 'table_pages': tables, 'table_pages_pending': pending, 'chars': len(text)})
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__': main()
`;
