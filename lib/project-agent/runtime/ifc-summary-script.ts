/** ifc_summary.py: reads an IFC STEP file with no extra libraries and reports storeys, spaces with areas, element counts and quantities. */
export const IFC_SUMMARY_SCRIPT = String.raw`#!/usr/bin/env python3
# Summarise an IFC model: storeys, spaces and areas, element counts, quantities (STEP text parser, no dependencies)
import argparse, collections, json, re, sys

def statements(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    buf, inside = [], False
    for ch in text:
        if ch == "'": inside = not inside
        if ch == ";" and not inside:
            yield "".join(buf).strip(); buf = []
        else: buf.append(ch)

def parse_args(src):
    pos = 0
    def value():
        nonlocal pos
        while src[pos] in " \n\r\t": pos += 1
        c = src[pos]
        if c == "'":
            end = pos + 1
            while True:
                end = src.index("'", end)
                if src[end:end + 2] == "''": end += 2; continue
                break
            out = src[pos + 1:end].replace("''", "'"); pos = end + 1; return out
        if c == "(":
            pos += 1; items = []
            while True:
                while src[pos] in " \n\r\t,": pos += 1
                if src[pos] == ")": pos += 1; return items
                items.append(value())
        if c == "#":
            m = re.compile(r"#(\d+)").match(src, pos); pos = m.end(); return ("ref", int(m.group(1)))
        if c in "$*": pos += 1; return None
        m = re.compile(r"[^,()\s]+").match(src, pos); token = m.group(0); pos = m.end()
        if pos < len(src) and src[pos] == "(":
            return ("typed", token, value())
        try: return float(token)
        except ValueError: return token.strip(".")
    return value()

def ref(v): return v[1] if isinstance(v, tuple) and v[0] == "ref" else None
def refs(v): return [r for r in (ref(x) for x in (v or [])) if r]
def scalar(v):
    if isinstance(v, tuple) and v[0] == "typed": return v[2][0] if isinstance(v[2], list) and v[2] else v[2]
    return v

parser = argparse.ArgumentParser(description="Summarise an IFC model")
parser.add_argument("ifc"); parser.add_argument("--out", help="write the summary as JSON"); parser.add_argument("--xlsx", help="write storeys, spaces and elements to Excel")
args = parser.parse_args()
raw = open(args.ifc, encoding="utf-8", errors="replace").read()
ents, schema = {}, ""
for st in statements(raw):
    m = re.match(r"#(\d+)\s*=\s*(\w+)\s*\((.*)\)$", st, re.S)
    if m:
        try: ents[int(m.group(1))] = (m.group(2).upper(), parse_args("(" + m.group(3) + ")"))
        except Exception: pass
    elif st.upper().startswith("FILE_SCHEMA"): schema = ", ".join(re.findall(r"'([^']+)'", st))
if not ents: sys.exit("no IFC entities found: is this a STEP .ifc file (not .ifcZIP or .ifcXML)?")
def of(kind): return [(i, a) for i, (n, a) in ents.items() if n == kind]
def arg(a, k): return a[k] if len(a) > k else None

PREFIX = {"MILLI": 1e-3, "CENTI": 1e-2, "DECI": 1e-1, "KILO": 1e3, None: 1.0}
length_factor, area_factor = 1.0, None
for _, a in of("IFCSIUNIT"):
    unit, prefix = arg(a, 1), arg(a, 2)
    if unit == "LENGTHUNIT": length_factor = PREFIX.get(prefix, 1.0)
    if unit == "AREAUNIT": area_factor = PREFIX.get(prefix, 1.0)
area_to_m2 = area_factor if area_factor is not None else length_factor ** 2

parent = {}
for _, a in of("IFCRELCONTAINEDINSPATIALSTRUCTURE"):
    for e in refs(arg(a, 4)): parent[e] = ref(arg(a, 5))
for _, a in of("IFCRELAGGREGATES"):
    for e in refs(arg(a, 5)): parent[e] = ref(arg(a, 4))
quantities = collections.defaultdict(dict)
for _, a in of("IFCRELDEFINESBYPROPERTIES"):
    definition = ents.get(ref(arg(a, 5)) or 0)
    if not definition or definition[0] != "IFCELEMENTQUANTITY": continue
    found = {}
    for q in refs(arg(definition[1], 5)):
        kind, qa = ents.get(q, ("", []))
        if kind.startswith("IFCQUANTITY") and isinstance(arg(qa, 3), float): found[arg(qa, 0)] = (kind[len("IFCQUANTITY"):].lower(), arg(qa, 3))
    for target in refs(arg(a, 4)): quantities[target].update(found)

def m2(q): return round(q[1] * area_to_m2, 3) if q and q[0] == "area" else None
storeys = {i: {"id": i, "name": arg(a, 2), "elevation": (arg(a, 9) or 0) * length_factor if isinstance(arg(a, 9), float) else None, "spaces": 0, "space_area_m2": 0.0} for i, a in of("IFCBUILDINGSTOREY")}
spaces, missing = [], []
for i, a in of("IFCSPACE"):
    q = quantities.get(i, {}); net = m2(q.get("NetFloorArea")) or m2(q.get("NetArea")); gross = m2(q.get("GrossFloorArea")) or m2(q.get("GrossArea"))
    level = parent.get(i); storey = storeys.get(level)
    spaces.append({"name": arg(a, 2), "long_name": arg(a, 7), "storey": storey["name"] if storey else None, "net_area_m2": net, "gross_area_m2": gross})
    if storey: storey["spaces"] += 1; storey["space_area_m2"] = round(storey["space_area_m2"] + (net or gross or 0), 3)
    if net is None and gross is None: missing.append("space %s has no area quantity" % (arg(a, 2) or i))
classes = collections.Counter(); class_quantities = collections.defaultdict(lambda: collections.defaultdict(float))
for e, level in parent.items():
    kind = ents.get(e, ("",))[0]
    if kind in ("", "IFCSPACE") or kind.startswith("IFCBUILDINGSTOREY") or kind in ("IFCBUILDING", "IFCSITE"): continue
    classes[kind] += 1
    for name, (qkind, value) in quantities.get(e, {}).items():
        if qkind in ("area", "length", "volume", "count", "weight"):
            class_quantities[kind][name + (" (m2)" if qkind == "area" else "")] += value * (area_to_m2 if qkind == "area" else 1)
project = next((arg(a, 2) for _, a in of("IFCPROJECT")), None)
summary = {"file": args.ifc, "schema": schema, "project": project, "length_unit_m": length_factor, "storeys": sorted(storeys.values(), key=lambda s: s["elevation"] or 0),
    "spaces": spaces, "elements": dict(classes.most_common()), "quantities_by_class": {k: {n: round(v, 3) for n, v in d.items()} for k, d in class_quantities.items()},
    "total_space_area_m2": round(sum(s["net_area_m2"] or s["gross_area_m2"] or 0 for s in spaces), 3), "missing": missing[:50], "entity_count": len(ents)}
if args.out: json.dump(summary, open(args.out, "w"), indent=1, ensure_ascii=False)
if args.xlsx:
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = "Storeys"; ws.append(["Name", "Elevation (m)", "Spaces", "Space area (m2)"])
    for s in summary["storeys"]: ws.append([s["name"], s["elevation"], s["spaces"], s["space_area_m2"]])
    ws = wb.create_sheet("Spaces"); ws.append(["Name", "Long name", "Storey", "Net area (m2)", "Gross area (m2)"])
    for s in spaces: ws.append([s["name"], s["long_name"], s["storey"], s["net_area_m2"], s["gross_area_m2"]])
    ws = wb.create_sheet("Elements"); ws.append(["Class", "Count"])
    for k, v in classes.most_common(): ws.append([k, v])
    wb.save(args.xlsx)
print(json.dumps({k: summary[k] for k in ("file", "schema", "project", "entity_count", "total_space_area_m2")} | {"storeys": [(s["name"], s["elevation"], s["spaces"], s["space_area_m2"]) for s in summary["storeys"]], "spaces": len(spaces), "elements": summary["elements"], "missing": summary["missing"][:10]}, indent=1, ensure_ascii=False))
`;
