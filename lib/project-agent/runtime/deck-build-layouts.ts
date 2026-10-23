/** Composed slide and native AEC diagram helpers for the sandbox deck builder. */
export const DECK_LAYOUTS_PY = String.raw`
def card(slide, x, y, w, h, fill=TC.BACKGROUND_2, line=None):
    shape = add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid(); shape.fill.fore_color.rgb = RGBColor.from_string(hexval(fill))
    if line: shape.line.color.rgb = RGBColor.from_string(hexval(line))
    else: shape.line.fill.background()
    shape.adjustments[0] = 0.05
    return shape

ZONE_COLORS = {'building': 'EBCFAF', 'yard': 'C7E2D2', 'green': '91C2A4', 'road': 'C8D8D5', 'parking': 'AFC5D3', 'water': 'A9CEE0', 'classroom': 'F3D9A4', 'circulation': 'E2E6E3', 'service': 'CBD3DA', 'play': 'C7E2D2', 'admin': 'D6C9E3', 'entry': 'F0B9A8'}

def diagram(slide, spec, x, y, w, h, lang):
    site = spec.get('site') or {}; sw = max(1, float(site.get('w', 80))); sh = max(1, float(site.get('h', 80)))
    pad = 0.48 if spec.get('dims') else 0.12; dw, dh = w - 2 * pad, h - 2 * pad
    scale = min(dw / sw, dh / sh); ox = x + (w - sw * scale) / 2; oy = y + (h - sh * scale) / 2
    box = card(slide, ox, oy, sw * scale, sh * scale, 'E8F2EB', 'AFC9BB')
    box.adjustments[0] = 0.015
    north = site.get('north', 'up'); nx, ny = ox + sw * scale - 0.48, oy + 0.16
    arrow = add_shape(slide, MSO_SHAPE.ISOSCELES_TRIANGLE, Inches(nx + 0.08), Inches(ny - 0.02), Inches(0.16), Inches(0.2))
    arrow.fill.solid(); arrow.fill.fore_color.rgb = RGBColor.from_string('173F48'); arrow.line.fill.background()
    if isinstance(north, (int, float)): arrow.rotation = float(north) % 360
    text(slide, 'N', nx + 0.27, ny, 0.22, 0.2, 9, TC.ACCENT_1, True, PP_ALIGN.CENTER, lang=lang)
    access = site.get('access')
    if access:
        road_color = RGBColor.from_string('C8D8D5')
        side = str(access).lower()
        rx, ry, rw, rh = ox, oy, sw * scale, max(0.18, sw * scale * 0.055)
        if side == 'north': ry = oy - rh
        elif side == 'east': rx, ry, rw, rh = ox + sw * scale, oy, max(0.18, sh * scale * 0.055), sh * scale
        elif side == 'west': rw, rh = max(0.18, sh * scale * 0.055), sh * scale
        else: ry = oy + sh * scale
        road = add_shape(slide, MSO_SHAPE.RECTANGLE, Inches(rx), Inches(ry), Inches(rw), Inches(rh))
        road.fill.solid(); road.fill.fore_color.rgb = road_color; road.line.fill.background()
        text(slide, 'ĐƯỜNG TIẾP CẬN' if (lang or '').startswith('vi') else 'ACCESS ROAD', rx, ry, rw, rh, 8, TC.ACCENT_1, True, PP_ALIGN.CENTER, lang=lang)  # vi-allow: localized AEC diagram label
    colors = ZONE_COLORS
    for item in spec.get('blocks', []):
        bx = ox + float(item.get('x', 0)) * scale; by = oy + float(item.get('y', 0)) * scale
        bw = max(0.04, float(item.get('w', 1)) * scale); bh = max(0.04, float(item.get('h', 1)) * scale)
        block = add_shape(slide, MSO_SHAPE.RECTANGLE, Inches(bx), Inches(by), Inches(bw), Inches(bh))
        block.fill.solid(); block.fill.fore_color.rgb = RGBColor.from_string(colors.get(item.get('kind'), colors['building']))
        block.line.color.rgb = RGBColor.from_string('FFFFFF')
        label = str(item.get('label', ''))
        compact = h < 2.0
        if label and ((not compact and bw > 0.75 and bh > 0.35) or (compact and bw > 1.6 and bh > 0.75)):
            tf = block.text_frame; tf.text = label; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
            for p in tf.paragraphs:
                p.alignment = PP_ALIGN.CENTER
                for run in p.runs: run.font.size = Pt(8 if compact else 10); run.font.bold = True; run.font.color.rgb = RGBColor.from_string('31534A')
            style_runs(tf, lang)
    for tx, ty in spec.get('trees', []):
        dot = add_shape(slide, MSO_SHAPE.OVAL, Inches(ox + float(tx) * scale - 0.07), Inches(oy + float(ty) * scale - 0.07), Inches(0.14), Inches(0.14))
        dot.fill.solid(); dot.fill.fore_color.rgb = RGBColor.from_string('78B497'); dot.line.fill.background()
    if spec.get('dims'):
        text(slide, '%g m' % sw, ox, oy - 0.30, sw * scale, 0.2, 9, TC.ACCENT_3, True, PP_ALIGN.CENTER, lang=lang)
        dim = text(slide, '%g m' % sh, ox - 0.56, oy + sh * scale / 2 - 0.35, 0.7, 0.2, 9, TC.ACCENT_3, True, PP_ALIGN.CENTER, lang=lang)
        if dim is not None: dim.rotation = 270
    if spec.get('scale_note'):
        text(slide, str(spec['scale_note']), x, y + h - 0.22, w, 0.18, 8, TC.ACCENT_3, lang=lang)

PRESETS = {
 'courtyard-u': [{'x':12,'y':12,'w':20,'h':56,'kind':'building','label':'KHỐI LỚP'}, {'x':32,'y':12,'w':36,'h':18,'kind':'building','label':'KHỐI LỚP'}, {'x':68,'y':12,'w':20,'h':56,'kind':'building','label':'KHỐI LỚP'}, {'x':34,'y':34,'w':32,'h':28,'kind':'yard','label':'SÂN CHUNG'}],  # vi-allow
 'parallel-bars': [{'x':18,'y':16,'w':22,'h':58,'kind':'building','label':'KHỐI A'}, {'x':58,'y':16,'w':22,'h':58,'kind':'building','label':'KHỐI B'}, {'x':42,'y':24,'w':14,'h':40,'kind':'yard','label':'SÂN'}],  # vi-allow
 'l-shape': [{'x':14,'y':14,'w':62,'h':20,'kind':'building','label':'KHỐI A'}, {'x':14,'y':34,'w':20,'h':48,'kind':'building','label':'KHỐI B'}, {'x':36,'y':38,'w':42,'h':38,'kind':'yard','label':'SÂN'}],  # vi-allow
 'single-bar': [{'x':18,'y':24,'w':64,'h':32,'kind':'building','label':'KHỐI CÔNG TRÌNH'}],  # vi-allow
 'tower-podium': [{'x':12,'y':58,'w':76,'h':18,'kind':'building','label':'ĐẾ CÔNG TRÌNH'}, {'x':34,'y':20,'w':32,'h':38,'kind':'building','label':'THÁP'}],  # vi-allow
}

def diagram_spec(raw):
    result = dict(raw or {})
    if result.get('preset') in PRESETS:
        site = result.get('site') or {}; sx = float(site.get('w', 100)) / 100; sy = float(site.get('h', 100)) / 100
        result['blocks'] = [dict(block, x=block['x'] * sx, y=block['y'] * sy, w=block['w'] * sx, h=block['h'] * sy) for block in PRESETS[result['preset']]]
    return result

def dashboard(deck, item):
    s = deck.new(str(item.get('title', '')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    kpis = item.get('kpis', [])[:4]; n = max(1, len(kpis)); gap = 0.22; width = (12.1 - gap * (n - 1)) / n
    for i, kpi in enumerate(kpis):
        x = 0.6 + i * (width + gap); card(s, x, 1.52, width, 1.12, 'FFFFFF')
        text(s, kpi.get('value',''), x + 0.16, 1.64, width - 0.3, 0.48, 25, TC.ACCENT_2, True, lang=deck.lang)
        text(s, kpi.get('label',''), x + 0.16, 2.15, width - 0.3, 0.3, 10, TC.ACCENT_1, True, lang=deck.lang)
    cards = item.get('cards', [])[:3]; cw = (12.1 - 0.24 * (len(cards)-1)) / max(1, len(cards))
    tones = {'primary': ('E3F2EC', TC.ACCENT_1), 'warning': ('F6EBD9', TC.ACCENT_2), 'neutral': ('FFFFFF', TC.ACCENT_3)}
    for i, entry in enumerate(cards):
        x = 0.6 + i * (cw + 0.24); fill, ink = tones.get(entry.get('tone'), tones['neutral']); card(s, x, 2.88, cw, 2.65, fill)
        text(s, entry.get('title',''), x + 0.25, 3.12, cw - 0.5, 0.5, 16, ink, True, lang=deck.lang)
        text(s, entry.get('text',''), x + 0.25, 3.72, cw - 0.5, 1.5, 12, TC.TEXT_1, lang=deck.lang)
    return s, []

def callout_list(slide, callouts, x, y, w, h, lang):
    entries = callouts[:4]; gap = 0.16; row = (h - gap * (len(entries) - 1)) / max(1, len(entries))
    for i, item in enumerate(entries):
        yy = y + i * (row + gap); card(slide, x, yy, 0.48, 0.48, 'D7EAE2')
        text(slide, '%02d' % (i + 1), x, yy + 0.06, 0.48, 0.3, 11, TC.ACCENT_1, True, PP_ALIGN.CENTER, lang=lang)
        text(slide, item.get('title',''), x + 0.62, yy, w - 0.62, 0.4, 13, TC.ACCENT_1, True, lang=lang)
        text(slide, item.get('text',''), x + 0.62, yy + 0.42, w - 0.62, max(0.3, row - 0.44), 12, TC.TEXT_1, lang=lang)

def site_plan(deck, item):
    s = deck.new(str(item.get('title','')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    diagram(s, diagram_spec(item.get('diagram')), 0.65, 1.55, 7.45, 4.95, deck.lang)
    callout_list(s, item.get('callouts', []), 8.45, 1.72, 4.25, 4.55, deck.lang)
    return s, []

def options(deck, item):
    s = deck.new(str(item.get('title','')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    options = item.get('options', [])[:3]; gap = 0.2; width = (12.1 - gap * (len(options)-1)) / max(1, len(options))
    for i, option in enumerate(options):
        x = 0.6 + i * (width + gap); card(s, x, 1.55, width, 4.82, 'FFFFFF')
        text(s, option.get('name',''), x + 0.2, 1.68, width - 0.4, 0.38, 16, TC.ACCENT_1, True, lang=deck.lang)
        text(s, option.get('tag',''), x + 0.2, 2.08, width - 0.4, 0.26, 11, TC.ACCENT_2, True, lang=deck.lang)
        diagram(s, diagram_spec(option.get('diagram')), x + 0.18, 2.35, width - 0.36, 1.78, deck.lang)
        text(s, 'Ưu điểm' if (deck.lang or '').startswith('vi') else 'Pros', x + 0.2, 4.12, width - 0.4, 0.3, 12, TC.ACCENT_1, True, lang=deck.lang)  # vi-allow: localized comparison label
        text(s, ' · '.join(option.get('pros', [])[:2]), x + 0.2, 4.44, width - 0.4, 0.62, 12, TC.TEXT_1, lang=deck.lang)
        text(s, 'Cần cân nhắc' if (deck.lang or '').startswith('vi') else 'Trade-offs', x + 0.2, 5.1, width - 0.4, 0.3, 12, TC.ACCENT_2, True, lang=deck.lang)  # vi-allow: localized comparison label
        text(s, ' · '.join(option.get('cons', [])[:2]), x + 0.2, 5.42, width - 0.4, 0.8, 12, TC.TEXT_1, lang=deck.lang)
    return s, []

def chart_breakdown(deck, item):
    s = deck.new(str(item.get('title','')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    spec = item.get('chart') or {}; data = CategoryChartData(); data.categories = [str(c) for c in spec.get('categories', [])]
    for series in spec.get('series', []): data.add_series(str(series.get('name','')), [float(v or 0) for v in series.get('values', [])])
    frame = s.shapes.add_chart(CHARTS.get(spec.get('type'), CHARTS['doughnut']), Inches(0.55), Inches(1.55), Inches(5.75), Inches(4.8), data)
    frame.chart.has_legend = False; frame.chart.font.size = Pt(10)
    items = item.get('breakdown', []); card(s, 6.55, 1.55, 6.15, 4.8, 'FFFFFF')
    if spec.get('secondary'):
        text(s, 'Cơ cấu sử dụng đất' if (deck.lang or '').startswith('vi') else 'Land use', 6.85, 1.78, 5.5, 0.28, 11, TC.ACCENT_1, True, lang=deck.lang)  # vi-allow: localized chart label
        colors = ['17877F','72B995','82ABC0','DDB778','A6B2B8']; total = sum(max(0,float(v.get('value',0))) for v in spec['secondary']) or 1; xx = 6.85
        for i, entry in enumerate(spec['secondary']):
            ww = 5.55 * max(0,float(entry.get('value',0))) / total
            rect = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(xx), Inches(2.18), Inches(ww), Inches(0.48)); rect.fill.solid(); rect.fill.fore_color.rgb = RGBColor.from_string(colors[i % len(colors)]); rect.line.fill.background(); xx += ww
    for i, entry in enumerate(items[:5]):
        yy = 2.85 + i * 0.62; text(s, entry.get('label',''), 6.9, yy, 3.2, 0.25, 10, TC.ACCENT_1, True, lang=deck.lang)
        text(s, entry.get('value',''), 10.1, yy, 1.0, 0.25, 10, TC.TEXT_1, lang=deck.lang)
        text(s, entry.get('percent',''), 11.25, yy, 1.1, 0.25, 10, TC.ACCENT_2, True, PP_ALIGN.RIGHT, lang=deck.lang)
    if item.get('total_row'): card(s, 6.85, 5.78, 5.55, 0.36, 'E3F2EC'); text(s, item['total_row'], 6.95, 5.82, 5.3, 0.25, 10, TC.ACCENT_1, True, PP_ALIGN.CENTER, lang=deck.lang)
    return s, []
`;
