/**
 * Installed into each agent sandbox as /work/.tools/xlsx_values.py. openpyxl saves formulas without results, so
 * previews, phone viewers and the web Spreadsheet editor show empty cells. This recalculates a copy with LibreOffice
 * and writes the results into the original file's XML, leaving formulas, styles, charts and everything else untouched.
 */
export const XLSX_VALUES_SCRIPT = String.raw`import json, os, subprocess, sys, tempfile, zipfile
from datetime import date, datetime, time
from lxml import etree
from openpyxl import load_workbook

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
EPOCH = datetime(1899, 12, 30)

def serial(value):
    if isinstance(value, datetime): return (value - EPOCH).total_seconds() / 86400
    if isinstance(value, date): return (datetime(value.year, value.month, value.day) - EPOCH).days
    if isinstance(value, time): return (value.hour * 3600 + value.minute * 60 + value.second) / 86400
    return value

def number(value):
    return str(int(value)) if isinstance(value, float) and value.is_integer() and abs(value) < 1e15 else repr(value) if isinstance(value, float) else str(value)

def main(path):
    work = tempfile.mkdtemp()
    run = subprocess.run(['soffice', '--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', work, path], capture_output=True, text=True, timeout=240)
    calculated = os.path.join(work, os.path.splitext(os.path.basename(path))[0] + '.xlsx')
    if run.returncode != 0 or not os.path.exists(calculated): sys.exit('LibreOffice could not recalculate the workbook: ' + (run.stderr or run.stdout)[-400:])
    values = load_workbook(calculated, data_only=True)
    with zipfile.ZipFile(path) as source: parts = {info.filename: (info, source.read(info.filename)) for info in source.infolist()}
    book = etree.fromstring(parts['xl/workbook.xml'][1]); rels = etree.fromstring(parts['xl/_rels/workbook.xml.rels'][1])
    targets = {rel.get('Id'): rel.get('Target') for rel in rels}
    filled, errors, missing = 0, [], []
    for sheet in book.iter('{%s}sheet' % NS):
        target = targets.get(sheet.get('{%s}id' % REL), ''); name = sheet.get('name')
        part = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        if part not in parts or name not in values.sheetnames: missing.append(name); continue
        root, ws = etree.fromstring(parts[part][1]), values[name]
        for cell in root.iter('{%s}c' % NS):
            if cell.find('{%s}f' % NS) is None: continue
            old = cell.find('{%s}v' % NS)
            if old is not None: cell.remove(old)
            cell.attrib.pop('t', None)
            value = serial(ws[cell.get('r')].value)
            if value is None: continue
            v = etree.SubElement(cell, '{%s}v' % NS)
            if isinstance(value, bool): cell.set('t', 'b'); v.text = '1' if value else '0'
            elif isinstance(value, (int, float)): v.text = number(value)
            elif isinstance(value, str) and value.startswith('#') and value.endswith(('!', '?', '0', 'A')): cell.set('t', 'e'); v.text = value; errors.append('%s!%s %s' % (name, cell.get('r'), value))
            else: cell.set('t', 'str'); v.text = str(value)
            filled += 1
        parts[part] = (parts[part][0], etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True))
    calc = book.find('{%s}calcPr' % NS)
    if calc is None:
        calc = etree.Element('{%s}calcPr' % NS)
        anchor = book.find('{%s}definedNames' % NS)
        (anchor if anchor is not None else book.find('{%s}sheets' % NS)).addnext(calc)
    calc.set('fullCalcOnLoad', '1')
    parts['xl/workbook.xml'] = (parts['xl/workbook.xml'][0], etree.tostring(book, xml_declaration=True, encoding='UTF-8', standalone=True))
    temp = path + '.tmp'
    with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in parts.values(): out.writestr(info, data)
    os.replace(temp, path)
    print(json.dumps({'file': path, 'formulas_with_values': filled, 'errors': errors, 'sheets_skipped': missing}, ensure_ascii=False))

if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit('usage: xlsx_values.py workbook.xlsx')
    main(sys.argv[1])
`;
