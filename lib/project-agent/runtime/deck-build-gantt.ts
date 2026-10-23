/** Gantt schedule and functional floor-plan slides for the sandbox deck builder (native, editable shapes). */
export const DECK_GANTT_PY = String.raw`
GANTT_COLORS = [TC.ACCENT_1, TC.ACCENT_2, TC.ACCENT_3, 'DDB778', '82ABC0']

def fill_bar(shape, color):
    shape.fill.solid()
    if isinstance(color, str): shape.fill.fore_color.rgb = RGBColor.from_string(color)
    else: shape.fill.fore_color.theme_color = color

def gantt(deck, item):
    s = deck.new(str(item.get('title', '')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    periods = [str(p) for p in item.get('periods', [])][:24]
    tasks = [t for t in item.get('tasks', []) if isinstance(t, dict)][:12]
    if not periods: periods = [str(i + 1) for i in range(max([int(t.get('start', 0)) + int(t.get('length', 1)) for t in tasks] or [6]))][:24]
    left, top, label_w, right = 0.6, 1.6, 3.4, 12.7
    grid_w = right - left - label_w; col = grid_w / len(periods); head_h = 0.4
    row = min(0.46, (6.45 - top - head_h) / max(1, len(tasks)))
    size = 11 if len(periods) <= 14 else 10
    groups = []
    for t in tasks:
        g = str(t.get('group', ''))
        if g and g not in groups: groups.append(g)
    for i, label in enumerate(periods):
        cell = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(left + label_w + i * col), Inches(top), Inches(col), Inches(head_h))
        cell.fill.solid(); cell.fill.fore_color.theme_color = TC.ACCENT_1; cell.line.color.rgb = RGBColor.from_string('FFFFFF')
        cell.text_frame.text = label; cell.text_frame.margin_left = cell.text_frame.margin_right = Inches(0.02)
        for p in cell.text_frame.paragraphs:
            p.alignment = PP_ALIGN.CENTER
            for run in p.runs: run.font.size = Pt(size); run.font.bold = True; run.font.color.rgb = RGBColor.from_string('FFFFFF')
        style_runs(cell.text_frame, deck.lang)
    for r, task in enumerate(tasks):
        y = top + head_h + r * row
        if r % 2 == 0:
            band = add_shape(s, MSO_SHAPE.RECTANGLE, Inches(left), Inches(y), Inches(right - left), Inches(row))
            band.fill.solid(); band.fill.fore_color.theme_color = TC.BACKGROUND_2; band.line.fill.background()
        text(s, task.get('name', ''), left + 0.08, y, label_w - 0.12, row, 12, TC.TEXT_1, False, anchor=MSO_ANCHOR.MIDDLE, lang=deck.lang)
        start = max(0, min(len(periods) - 1, int(task.get('start', 0)))); length = max(1, min(len(periods) - start, int(task.get('length', 1))))
        color = GANTT_COLORS[(groups.index(str(task.get('group', ''))) if str(task.get('group', '')) in groups else r) % len(GANTT_COLORS)]
        bx, bw = left + label_w + start * col + 0.03, length * col - 0.06
        bar = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(bx), Inches(y + row * 0.18), Inches(bw), Inches(row * 0.64))
        fill_bar(bar, color); bar.line.fill.background(); bar.adjustments[0] = 0.3
        done = float(task.get('done', 0) or 0)
        if 0 < done < 1:
            part = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(bx), Inches(y + row * 0.18), Inches(bw * done), Inches(row * 0.64))
            part.fill.solid(); part.fill.fore_color.rgb = RGBColor.from_string('173F48'); part.line.fill.background(); part.adjustments[0] = 0.3
    for m in item.get('milestones', [])[:6]:
        if not isinstance(m, dict): continue
        at = max(0, min(len(periods) - 1, int(m.get('at', 0)))); mx = left + label_w + (at + 0.5) * col
        line = s.shapes.add_connector(1, Inches(mx), Inches(top + head_h), Inches(mx), Inches(top + head_h + row * len(tasks)))
        line.line.color.rgb = RGBColor.from_string('B94A3A'); line.line.width = Pt(1.5)
        text(s, m.get('label', ''), mx - 0.9, top + head_h + row * len(tasks) + 0.04, 1.8, 0.3, 10, TC.ACCENT_2, True, PP_ALIGN.CENTER, lang=deck.lang)
    if groups:
        lx = left
        for g in groups[:5]:
            sw = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lx), Inches(6.78), Inches(0.2), Inches(0.2)); fill_bar(sw, GANTT_COLORS[groups.index(g) % len(GANTT_COLORS)]); sw.line.fill.background()
            text(s, g, lx + 0.26, 6.72, 2.0, 0.3, 11, TC.TEXT_1, lang=deck.lang); lx += 2.3
    return s, []

ZONE_LABELS = {'classroom': 'Lớp học', 'circulation': 'Giao thông', 'service': 'Phụ trợ', 'play': 'Sân chơi', 'admin': 'Hành chính', 'entry': 'Lối vào'}  # vi-allow: default zone legend labels

def floor_plan(deck, item):
    s = deck.new(str(item.get('title', '')), kicker=item.get('kicker'), subtitle=item.get('subtitle'))
    plan = item.get('plan') or {}
    spec = {'site': {'w': plan.get('w', 40), 'h': plan.get('h', 25), 'north': plan.get('north', 'up')}, 'blocks': plan.get('zones', []), 'dims': plan.get('dims')}
    diagram(s, diagram_spec(spec), 0.6, 1.55, 8.0, 5.0, deck.lang)
    legend = item.get('legend') or [{'kind': k} for k in dict.fromkeys(z.get('kind') for z in plan.get('zones', []) if z.get('kind') in ZONE_COLORS)]
    y = 1.75
    for entry in legend[:7]:
        kind = entry.get('kind'); box = add_shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.95), Inches(y + 0.03), Inches(0.28), Inches(0.28))
        box.fill.solid(); box.fill.fore_color.rgb = RGBColor.from_string(ZONE_COLORS.get(kind, 'EBCFAF')); box.line.color.rgb = RGBColor.from_string('AFC9BB')
        text(s, entry.get('label') or ZONE_LABELS.get(kind, str(kind)), 9.35, y, 3.3, 0.36, 13, TC.TEXT_1, lang=deck.lang); y += 0.42
    notes = [str(n) for n in item.get('notes', [])][:4]
    if notes: text(s, '\n'.join(notes), 8.95, y + 0.25, 3.8, 6.4 - y - 0.25, 12, TC.TEXT_1, lang=deck.lang)
    return s, []
`;
