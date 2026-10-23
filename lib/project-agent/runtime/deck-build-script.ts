import { DECK_THEME_PY } from "./deck-build-theme";
import { DECK_LAYOUTS_PY } from "./deck-build-layouts";
import { DECK_GANTT_PY } from "./deck-build-gantt";

/** Installed into each agent sandbox as /work/.tools/deck_build.py: JSON spec in, themed .pptx with native charts and motion out. */
export const DECK_BUILD_SCRIPT = DECK_THEME_PY + DECK_LAYOUTS_PY + DECK_GANTT_PY + String.raw`
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

CHARTS = {'bar': XL_CHART_TYPE.COLUMN_CLUSTERED, 'hbar': XL_CHART_TYPE.BAR_CLUSTERED, 'stacked': XL_CHART_TYPE.COLUMN_STACKED,
          'line': XL_CHART_TYPE.LINE_MARKERS, 'pie': XL_CHART_TYPE.PIE, 'doughnut': XL_CHART_TYPE.DOUGHNUT, 'area': XL_CHART_TYPE.AREA}

def number_format(fmt, values):
    """Quotes literal text in an Excel number format ("USD 0 bn" -> "USD "0" bn") and rescales 78 to 0.78 for percent formats."""
    if not fmt: return None, 1
    out, literal, text, i = '', '', str(fmt), 0
    def flush(lit): return ('"' + lit + '"') if lit.strip() else lit
    while i < len(text):
        ch = text[i]
        if ch == '"':
            close = text.find('"', i + 1); close = len(text) - 1 if close < 0 else close
            out += flush(literal) + text[i:close + 1]; literal = ''; i = close + 1; continue
        if ch == '\\' and i + 1 < len(text): out += flush(literal) + text[i:i + 2]; literal = ''; i += 2; continue
        if ch in '0#.,%?;': out += flush(literal) + ch; literal = ''
        else: literal += ch
        i += 1
    out += flush(literal)
    numbers = [abs(float(v)) for v in values if isinstance(v, (int, float))]
    scale = 0.01 if '%' in out and numbers and max(numbers) > 1.5 else 1
    return out, scale

SPEC_KEYS = ('title', 'subtitle', 'kicker', 'note', 'callouts', 'tags', 'text', 'number', 'bullets', 'left_title', 'left', 'right_title', 'right', 'caption', 'chart', 'table', 'total_row', 'highlight_columns', 'kpis', 'cards', 'steps', 'quote', 'author', 'diagram', 'options', 'breakdown', 'notes', 'transition', 'animation')

def embed_spec(prs, records, theme):
    """Stores the built slide list in the .pptx as a related part (PowerPoint ignores it; python-pptx keeps it on re-save) so the web Slides editor can rebuild each slide natively."""
    from pptx.opc.package import Part
    from pptx.opc.packuri import PackURI
    blob = json.dumps({'version': 1, 'theme': {k: theme[k] for k in ('primary', 'accent', 'neutral', 'background', 'text', 'surface', 'heading', 'body')}, 'slides': records}, ensure_ascii=False).encode('utf-8')
    part = Part(PackURI('/customXml/deck-spec.json'), 'application/json', prs.part.package, blob)
    prs.part.relate_to(part, 'https://example.org/project-agent/relationships/deck-spec')

class Deck:
    def __init__(self, spec):
        self.spec = spec; self.lang = spec.get('lang') or ('vi-VN' if str(spec.get('language', '')).startswith('vi') else None)
        self.theme = {**THEMES.get(spec.get('theme', 'corporate'), THEMES['corporate']), **spec.get('custom_theme', {})}
        self.prs = Presentation(); self.prs.slide_width = Inches(W); self.prs.slide_height = Inches(H)
        self.prs.core_properties.title = str(spec.get('title', '')); apply_theme(self.prs, self.theme)
        self.records = []
        self.cont = ' (tiếp)' if (self.lang or '').startswith('vi') else ' (cont.)'  # vi-allow

    def new(self, title, layout=5, dark=False, chrome=True, box=(0.6, 0.36, 12.1, 0.66), size=None, color=TC.ACCENT_1, kicker=None, subtitle=None):
        s = self.prs.slides.add_slide(self.prs.slide_layouts[layout])
        if dark: s.background.fill.solid(); s.background.fill.fore_color.theme_color = TC.ACCENT_1
        if layout in (0, 5):
            t = s.shapes.title; t.left, t.top, t.width, t.height = (Inches(v) for v in box)
            t.text_frame.word_wrap = True; t.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = t.text_frame.paragraphs[0]; p.text = title; p.alignment = PP_ALIGN.LEFT
            size = size or (28 if len(title) <= 60 else 24 if len(title) <= 85 else 20)
            for r in p.runs: r.font.size = Pt(size); r.font.bold = True; r.font.color.theme_color = color
            style_runs(t.text_frame, self.lang)
        if chrome:
            band = add_shape(s, MSO_SHAPE.RECTANGLE, 0, 0, self.prs.slide_width, Inches(0.09)); band.fill.solid(); band.fill.fore_color.theme_color = TC.ACCENT_2; band.line.fill.background()
            label = str(kicker or getattr(self, '_kicker', '') or '')
            if label: text(s, label, 0.68, 0.16, 11.9, 0.2, 9, TC.ACCENT_2, True, lang=self.lang)
            subtitle = subtitle or getattr(self, '_subtitle', None)
            if subtitle: text(s, subtitle, 0.66, 1.04, 12, 0.28, 11, TC.ACCENT_3, lang=self.lang)
            if self.spec.get('footer') or self.spec.get('slide_numbers', True):
                footer = str(self.spec.get('footer') or self.prs.core_properties.title or '')
                text(s, footer, 0.6, 7.2, 9, 0.18, 8, TC.ACCENT_3, lang=self.lang)
                if self.spec.get('slide_numbers', True): text(s, '%02d / %02d' % (len(self.prs.slides), len(self.spec.get('slides', [])) or len(self.prs.slides)), 11.8, 7.2, 0.9, 0.18, 8, TC.ACCENT_3, align=PP_ALIGN.RIGHT, lang=self.lang)
            if getattr(self, '_note', None):
                card(s, 0.6, 6.88, 12.1, 0.24, 'F6EBD9')
                text(s, self._note, 0.78, 6.9, 11.75, 0.18, 8, TC.ACCENT_1, lang=self.lang)
        return s

    def picture(self, s, path, x, y, w, h):
        if not path or not os.path.exists(path): WARN.append('missing image %s' % path); return None
        pic = s.shapes.add_picture(path, Inches(x), Inches(y))
        ratio, box = pic.width / pic.height, w / h
        pic.width, pic.height = Inches(w), Inches(h)
        if ratio > box: crop = (1 - box / ratio) / 2; pic.crop_left = pic.crop_right = crop
        elif ratio < box: crop = (1 - ratio / box) / 2; pic.crop_top = pic.crop_bottom = crop
        return pic

    def bullet_pages(self, items, width, size, height):
        pages, page = [], []
        for item in items:
            if page and lines_needed(page + [item], width, size) * size * 1.6 / 72 > height: pages.append(page); page = []
            page.append(item)
        return pages + ([page] if page else []) or [[]]

    def slide(self, item):
        kind = item.get('layout', 'bullets'); title = str(item.get('title', '')); lang = self.lang; made = []
        self._note = item.get('note')
        self._kicker = item.get('kicker'); self._subtitle = item.get('subtitle')
        bl = [str(b) for b in item.get('bullets', [])]
        if kind in ('title', 'closing'):
            s = self.new(title, 0, dark=True, chrome=False, box=(0.9, 1.6, 7.6, 2.2), size=40 if len(title) <= 50 else 32, color=TC.BACKGROUND_1)
            sub = s.placeholders[1]; sub.left, sub.top, sub.width, sub.height = Inches(0.9), Inches(4.0), Inches(7.6), Inches(1.4)
            sub.text_frame.text = str(item.get('subtitle') or item.get('text', '')); sub.text_frame.paragraphs[0].alignment = PP_ALIGN.LEFT
            for r in sub.text_frame.paragraphs[0].runs: r.font.size = Pt(20); r.font.color.theme_color = TC.ACCENT_2
            style_runs(sub.text_frame, lang)
            if kind == 'title':
                for x, y, w, h, fill in [(9.35,2.55,1.2,3.5,'72B995'),(10.55,3.35,1.1,2.7,'EBCFAF'),(8.2,4.15,1.15,1.9,'91C2A4')]:
                    block = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)); block.fill.solid(); block.fill.fore_color.rgb = RGBColor.from_string(fill); block.line.fill.background()
                roof = add_shape(s, MSO_SHAPE.ISOSCELES_TRIANGLE, Inches(9.18), Inches(2.04), Inches(2.8), Inches(1.08)); roof.fill.solid(); roof.fill.fore_color.rgb = RGBColor.from_string('17877F'); roof.line.fill.background()
                for x, y in [(9.62,3.25),(10.16,3.25),(9.62,3.92),(10.16,3.92),(9.62,4.59),(10.16,4.59),(10.86,3.9),(11.25,3.9),(10.86,4.58),(11.25,4.58)]:
                    window = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(0.22), Inches(0.26)); window.fill.solid(); window.fill.fore_color.rgb = RGBColor.from_string('E8F2EB'); window.line.fill.background()
                base = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(8.1), Inches(6.05), Inches(3.65), Inches(0.16)); base.fill.solid(); base.fill.fore_color.rgb = RGBColor.from_string('D6E5DC'); base.line.fill.background()
                for i, tag in enumerate(item.get('tags', [])[:3]):
                    chip = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.92 + i * 1.65), Inches(5.65), Inches(1.48), Inches(0.42)); chip.fill.solid(); chip.fill.fore_color.rgb = RGBColor.from_string('315A5E'); chip.line.fill.background()
                    text(s, tag, 1.0 + i * 1.65, 5.74, 1.32, 0.22, 10, TC.BACKGROUND_1, True, PP_ALIGN.CENTER, lang=lang)
            made.append((s, [(sub, False)]))
        elif kind == 'section':
            s = self.new(title, 5, chrome=False, box=(1.3, 2.4, 10.8, 1.4), size=38)
            bar = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(2.4), Inches(0.12), Inches(2.4)); bar.fill.solid(); bar.fill.fore_color.theme_color = TC.ACCENT_2; bar.line.fill.background()
            text(s, item.get('number', ''), 1.3, 1.6, 4, 0.8, 22, TC.ACCENT_2, True, lang=lang)
            made.append((s, [(text(s, item.get('subtitle', ''), 1.3, 3.9, 10.8, 1.0, 20, TC.ACCENT_3, lang=lang), False)]))
        elif kind in ('two-column', 'comparison'):
            s = self.new(title); targets = []
            for col, key in enumerate(('left', 'right')):
                x = 0.6 + col * 6.2
                if kind == 'comparison':
                    card = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(1.45), Inches(5.9), Inches(5.35)); card.fill.solid(); card.fill.fore_color.theme_color = TC.BACKGROUND_2; card.line.fill.background(); card.adjustments[0] = 0.04
                text(s, item.get(key + '_title', ''), x + 0.25, 1.6, 5.4, 0.5, 18, TC.ACCENT_2, True, heading=True, lang=lang)
                group = item.get(key, bl[:len(bl) // 2] if col == 0 else bl[len(bl) // 2:])
                targets.append((bullets(s, group, x + 0.25, 2.2, 5.4, 4.5, 16, lang), True))
            made.append((s, targets))
        elif kind in ('image-full', 'image-text'):
            s = self.new(title); targets = []
            if kind == 'image-full': self.picture(s, item.get('image'), 0.6, 1.4, 12.1, 5.25)
            else:
                self.picture(s, item.get('image'), 6.9, 1.45, 5.8, 5.2); targets.append((bullets(s, bl, 0.6, 1.55, 5.9, 5.1, 17, lang), True))
            if item.get('caption'): text(s, item['caption'], 0.6, 6.7, 12.1, 0.32, 11, TC.ACCENT_3, lang=lang)
            made.append((s, targets))
        elif kind == 'chart' and item.get('chart'):
            s = self.new(title); spec = item['chart']; side = bool(bl)
            data = CategoryChartData(); data.categories = [str(c) for c in spec.get('categories', [])]
            fmt, scale = number_format(spec.get('number_format'), [v for series in spec.get('series', []) for v in series.get('values', [])])
            for series in spec.get('series', []): data.add_series(str(series.get('name', '')), [float(v or 0) * scale for v in series.get('values', [])], fmt)
            frame = s.shapes.add_chart(CHARTS.get(spec.get('type'), CHARTS['bar']), Inches(0.6), Inches(1.45), Inches(8.2 if side else 12.1), Inches(5.4), data); chart = frame.chart
            chart.font.size = Pt(12); chart.has_legend = len(spec.get('series', [])) > 1 or spec.get('type') in ('pie', 'doughnut')
            if chart.has_legend: chart.legend.position = XL_LEGEND_POSITION.BOTTOM; chart.legend.include_in_layout = False
            if spec.get('data_labels'): chart.plots[0].has_data_labels = True
            chart.has_title = bool(spec.get('title'))
            if spec.get('title'): chart.chart_title.text_frame.text = str(spec['title'])
            made.append((s, [(bullets(s, bl, 9.1, 1.6, 3.6, 5.1, 15, lang), True)] if side else []))
        elif kind == 'table' and item.get('table'):
            s = self.new(title, kicker=item.get('kicker'), subtitle=item.get('subtitle')); rows = list(item['table']);
            if item.get('total_row'): rows.append(item['total_row'] if isinstance(item['total_row'], list) else [item['total_row']])
            cols = max(len(r) for r in rows)
            size = 14 if len(rows) <= 8 else 12 if len(rows) <= 12 else 10
            table = s.shapes.add_table(len(rows), cols, Inches(0.6), Inches(1.5), Inches(12.1), Inches(min(5.25, len(rows) * size * 0.032))).table
            for r, row in enumerate(rows):
                for c in range(cols):
                    cell = table.cell(r, c); cell.text = str(row[c]) if c < len(row) else ''
                    cell.fill.solid()
                    if r == 0: cell.fill.fore_color.rgb = RGBColor.from_string('173F48')
                    elif item.get('total_row') and r == len(rows)-1: cell.fill.fore_color.rgb = RGBColor.from_string('DDEFE8')
                    else: cell.fill.fore_color.rgb = RGBColor.from_string('E9F2ED' if r % 2 else 'F7F8F6')
                    for p in cell.text_frame.paragraphs:
                        for run in p.runs:
                            run.font.size = Pt(size); run.font.bold = r == 0 or (item.get('total_row') and r == len(rows)-1)
                            if r == 0: run.font.color.rgb = RGBColor.from_string('FFFFFF')
                            elif c in item.get('highlight_columns', []): run.font.color.rgb = RGBColor.from_string('177F79'); run.font.bold = True
                    style_runs(cell.text_frame, lang)
            made.append((s, []))
        elif kind == 'dashboard':
            made.append(dashboard(self, item))
        elif kind == 'site-plan':
            made.append(site_plan(self, item))
        elif kind == 'gantt':
            made.append(gantt(self, item))
        elif kind == 'floor-plan':
            made.append(floor_plan(self, item))
        elif kind == 'options':
            made.append(options(self, item))
        elif kind == 'chart-breakdown':
            made.append(chart_breakdown(self, item))
        elif kind == 'kpi':
            s = self.new(title); cards = item.get('kpis', [])[:4] or [{}]; width = (12.1 - 0.3 * (len(cards) - 1)) / len(cards); targets = []
            for i, card in enumerate(cards):
                x = 0.6 + i * (width + 0.3)
                box = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(1.9), Inches(width), Inches(3.4)); box.fill.solid(); box.fill.fore_color.theme_color = TC.BACKGROUND_2; box.line.fill.background(); box.adjustments[0] = 0.06
                targets.append((text(s, card.get('value', ''), x + 0.2, 2.2, width - 0.4, 1.2, 40 if len(str(card.get('value', ''))) <= 8 else 30, TC.ACCENT_2, True, PP_ALIGN.CENTER, heading=True, lang=lang), False))
                text(s, card.get('label', ''), x + 0.2, 3.45, width - 0.4, 0.6, 17, TC.ACCENT_1, True, PP_ALIGN.CENTER, lang=lang)
                text(s, card.get('note', ''), x + 0.2, 4.1, width - 0.4, 1.0, 13, TC.ACCENT_3, align=PP_ALIGN.CENTER, lang=lang)
            if bl: targets.append((bullets(s, bl[:2], 0.6, 5.6, 12.1, 1.2, 15, lang), True))
            made.append((s, targets))
        elif kind == 'timeline':
            s = self.new(title); steps = item.get('steps', [])[:6] or [{}]; gap = 12.1 / len(steps); targets = []
            line = s.shapes.add_connector(1, Inches(0.6 + gap / 2), Inches(3.0), Inches(0.6 + gap * (len(steps) - 0.5)), Inches(3.0)); line.line.color.theme_color = TC.ACCENT_3; line.line.width = Pt(2)
            for i, step in enumerate(steps):
                cx = 0.6 + gap * (i + 0.5)
                dot = add_shape(s, MSO_SHAPE.OVAL, Inches(cx - 0.32), Inches(2.68), Inches(0.64), Inches(0.64)); dot.fill.solid(); dot.fill.fore_color.theme_color = TC.ACCENT_2; dot.line.fill.background()
                dot.text_frame.text = str(i + 1); dot.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
                text(s, step.get('date', ''), cx - gap / 2 + 0.1, 1.85, gap - 0.2, 0.6, 14, TC.ACCENT_3, True, PP_ALIGN.CENTER, lang=lang)
                targets.append((text(s, step.get('label', '') + ('\n' + step['text'] if step.get('text') else ''), cx - gap / 2 + 0.1, 3.55, gap - 0.2, 2.8, 14, align=PP_ALIGN.CENTER, lang=lang), False))
            made.append((s, targets))
        elif kind == 'quote':
            s = self.new(title, 6, chrome=False)
            q = text(s, '“' + str(item.get('quote', '')) + '”', 1.2, 1.8, 10.9, 3.2, 30, TC.ACCENT_1, heading=True, anchor=MSO_ANCHOR.MIDDLE, lang=lang)
            text(s, item.get('author', ''), 1.2, 5.2, 10.9, 0.6, 16, TC.ACCENT_2, True, lang=lang); made.append((s, [(q, False)]))
        else:
            side = bool(item.get('image')); width = 6.3 if side else 12.0
            for page_index, page in enumerate(self.bullet_pages(bl, width, 18, 5.2)):
                s = self.new(title + (self.cont if page_index else ''))
                if side: self.picture(s, item['image'], 7.2, 1.45, 5.5, 5.3)
                made.append((s, [(bullets(s, page, 0.65, 1.5, width, 5.3, 18, lang), True)], {'title': title + (self.cont if page_index else ''), 'bullets': page}))
        for entry in made:
            s, targets = entry[0], entry[1]
            self.records.append({**{key: item[key] for key in SPEC_KEYS if key in item}, 'layout': kind, **(entry[2] if len(entry) > 2 else {})})
            if item.get('notes'): s.notes_slide.notes_text_frame.text = str(item['notes'])
            motion(s, item.get('transition', self.spec.get('transition', 'fade')), item.get('animation', self.spec.get('animation', 'fade')), targets, self.spec.get('trigger', 'after'))

def main(spec_path, output):
    with open(spec_path, encoding='utf-8') as f: spec = json.load(f)
    slides = list(spec.get('slides', []))
    for section in spec.get('sections', []):
        with open(section, encoding='utf-8') as f: part = json.load(f)
        slides += part.get('slides', part) if isinstance(part, dict) else part
    deck = Deck(spec)
    for item in slides: deck.slide(item)
    embed_spec(deck.prs, deck.records, deck.theme); deck.prs.save(output)
    print(json.dumps({'output': output, 'slides': len(deck.prs.slides), 'warnings': WARN}, ensure_ascii=False))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit('usage: deck_build.py spec.json output.pptx')
    main(sys.argv[1], sys.argv[2])
`;
