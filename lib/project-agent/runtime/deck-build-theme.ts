/** Python helpers for deck_build.py: theme written into the slide master, theme-coloured text, and PowerPoint motion XML. */
export const DECK_THEME_PY = String.raw`import json, math, os, sys
from itertools import count
from lxml import etree
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_THEME_COLOR as TC
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
THEMES = {
 'corporate': {'primary':'17365D','accent':'E67E22','neutral':'5B6770','background':'FFFFFF','text':'1F2933','surface':'EEF2F6','heading':'Calibri','body':'Calibri'},
 'architecture-minimal': {'primary':'173F48','accent':'17877F','neutral':'738A8D','background':'F7F8F6','text':'223638','surface':'E9F2ED','heading':'Arial','body':'Arial'},
 'bold': {'primary':'111827','accent':'DB2777','neutral':'4B5563','background':'FFFFFF','text':'111827','surface':'F3F4F6','heading':'Cambria','body':'Calibri'},
}
W, H = 13.333, 7.5
WARN = []

def hexval(value): return str(value).lstrip('#')[:6].upper()

def apply_theme(prs, theme):
    """Writes palette and fonts into the theme part, so every slide, chart and table follows it and PowerPoint's Design tab can change it."""
    part = prs.slide_master.part.part_related_by(RT.THEME)
    root = etree.fromstring(part.blob)
    scheme = root.find('.//{%s}clrScheme' % A); scheme.set('name', 'Deck')
    extra = theme.get('palette', [])
    slots = {'dk1':theme['text'],'lt1':theme['background'],'dk2':theme['primary'],'lt2':theme['surface'],'accent1':theme['primary'],'accent2':theme['accent'],
             'accent3':theme['neutral'],'accent4':(extra+['2A9D8F'])[0],'accent5':(extra+['','E9C46A'])[1] or 'E9C46A','accent6':(extra+['','','8D99AE'])[2] or '8D99AE'}
    for name, value in slots.items():
        slot = scheme.find('{%s}%s' % (A, name))
        for child in list(slot): slot.remove(child)
        etree.SubElement(slot, '{%s}srgbClr' % A, val=hexval(value))
    fonts = root.find('.//{%s}fontScheme' % A); fonts.set('name', 'Deck')
    fonts.find('{%s}majorFont/{%s}latin' % (A, A)).set('typeface', theme['heading'])
    fonts.find('{%s}minorFont/{%s}latin' % (A, A)).set('typeface', theme['body'])
    part._blob = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    size = prs._element.find(qn('p:sldSz'))
    if size is not None and 'type' in size.attrib: del size.attrib['type']

def style_runs(frame, lang):
    for paragraph in frame.paragraphs:
        for run in paragraph.runs:
            if lang: run._r.get_or_add_rPr().set('lang', lang)

def add_shape(slide, kind, x, y, w, h):
    shape = slide.shapes.add_shape(kind, x, y, w, h)
    style = shape._element.find(qn('p:style'))
    if style is not None:
        effect = style.find('{%s}effectRef' % A)
        if effect is not None: effect.set('idx', '0')
    return shape

def text(slide, value, x, y, w, h, size, color=TC.TEXT_1, bold=False, align=None, anchor=None, heading=False, lang=None):
    if not str(value or '').strip(): return None
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); frame = box.text_frame
    frame.word_wrap = True
    if anchor: frame.vertical_anchor = anchor
    for index, line in enumerate(str(value).split('\n')):
        p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        run = p.add_run(); run.text = line; run.font.size = Pt(size); run.font.bold = bold; run.font.color.theme_color = color
        if heading: run.font.name = '+mj-lt'
        if align is not None: p.alignment = align
    style_runs(frame, lang)
    return box

def lines_needed(items, width_in, size):
    per_line = max(10, int(width_in * 72 / (size * 0.52)))
    return sum(max(1, math.ceil(len(str(item)) / per_line)) for item in items)

def bullets(slide, items, x, y, w, h, size, lang, color=TC.TEXT_1):
    if not items: return None
    if w >= 5 and lines_needed(items, w, size) <= 5: size = max(size, 22 if len(items) <= 3 else 20)
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); frame = box.text_frame; frame.word_wrap = True
    for index, item in enumerate(items):
        p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        p.space_after = Pt(size * 0.55); p.line_spacing = 1.08
        ppr = p._p.get_or_add_pPr(); ppr.set('marL', str(int(Emu(Inches(0.32))))); ppr.set('indent', str(-int(Emu(Inches(0.28)))))
        color_el = etree.SubElement(ppr, qn('a:buClr')); etree.SubElement(color_el, qn('a:schemeClr'), val='accent2')
        etree.SubElement(ppr, qn('a:buFont'), typeface='Arial'); etree.SubElement(ppr, qn('a:buChar'), char='•')
        run = p.add_run(); run.text = str(item); run.font.size = Pt(size); run.font.color.theme_color = color
    style_runs(frame, lang)
    return box

EFFECTS = {'fade': (10, 0, 'fade'), 'wipe': (22, 8, 'wipe(left)'), 'appear': (1, 0, None)}
TRANSITIONS = {'fade': '<p:fade/>', 'push': '<p:push dir="l"/>', 'wipe': '<p:wipe dir="l"/>', 'zoom': '<p:zoom/>'}

def _effect(ids, spid, para, preset, node):
    pid, sub, flt = preset
    target = '<p:tgtEl><p:spTgt spid="%s">%s</p:spTgt></p:tgtEl>' % (spid, '' if para is None else '<p:txEl><p:pRg st="%d" end="%d"/></p:txEl>' % (para, para))
    outer = next(ids); show = next(ids)
    inner = ('<p:set><p:cBhvr><p:cTn id="%d" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>%s'
             '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>') % (show, target)
    if flt: inner += '<p:animEffect transition="in" filter="%s"><p:cBhvr><p:cTn id="%d" dur="500"/>%s</p:cBhvr></p:animEffect>' % (flt, next(ids), target)
    return ('<p:par><p:cTn id="%d" presetID="%d" presetClass="entr" presetSubtype="%d" fill="hold" grpId="0" nodeType="%s">'
            '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>') % (outer, pid, sub, node, inner)

def motion(slide, transition, animation, targets, trigger='after'):
    """Adds a slide transition and entrance animations in the order PowerPoint writes them. targets: [(shape, by_paragraph)]."""
    targets = [(shape, by_para) for shape, by_para in targets if shape is not None]
    sld = slide._element
    anchor = sld.find(qn('p:clrMapOvr'))
    if anchor is None: anchor = sld.find(qn('p:cSld'))
    xml = TRANSITIONS.get(transition)
    if xml:
        node = etree.fromstring('<p:transition xmlns:p="%s" spd="med">%s</p:transition>' % (P, xml)); anchor.addnext(node); anchor = node
    preset = EFFECTS.get(animation)
    steps = [(shape.shape_id, index if by_para else None) for shape, by_para in targets
             for index in (range(len(shape.text_frame.paragraphs)) if by_para else [None])]
    if not preset or not steps: return
    ids = count(3); groups = ''
    if trigger == 'click':
        for spid, para in steps:
            group, inner = next(ids), next(ids)
            groups += ('<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="%d" fill="hold">'
                       '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>') % (group, inner, _effect(ids, spid, para, preset, 'clickEffect'))
    else:
        group = next(ids); body = ''
        for step, (spid, para) in enumerate(steps):
            inner = next(ids)
            body += ('<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="%d"/></p:stCondLst><p:childTnLst>%s</p:childTnLst></p:cTn></p:par>') % (inner, step * 450, _effect(ids, spid, para, preset, 'afterEffect'))
        groups = ('<p:par><p:cTn id="%d" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>'
                  '<p:childTnLst>%s</p:childTnLst></p:cTn></p:par>') % (group, body)
    builds = ''.join('<p:bldP spid="%s" grpId="0" %s/>' % (shape.shape_id, 'build="p"' if by_para else 'animBg="1"') for shape, by_para in targets)
    timing = ('<p:timing xmlns:p="%s"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek">'
              '<p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>%s</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
              '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>%s</p:bldLst></p:timing>') % (P, groups, builds)
    anchor.addnext(etree.fromstring(timing))
`;
