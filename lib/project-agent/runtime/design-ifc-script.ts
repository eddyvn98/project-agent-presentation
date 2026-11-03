/** IFC4 exporter for Revit handoff; uses preinstalled IfcOpenShell, no Revit installation. */
export const IFC_DESIGN_SCRIPT = String.raw`#!/usr/bin/env python3
"""Headless concept handoff: true IFC4 entities with solids. Requires preinstalled IfcOpenShell."""
import json
import math
import sys

try:
    import numpy as np
    import ifcopenshell
    import ifcopenshell.api.aggregate
    import ifcopenshell.api.context
    import ifcopenshell.api.geometry
    import ifcopenshell.api.project
    import ifcopenshell.api.root
    import ifcopenshell.api.spatial
    import ifcopenshell.api.unit
except ImportError as cause:
    sys.exit("IFC_DEPENDENCY_MISSING: preinstall ifcopenshell and numpy in the sandbox image: " + str(cause))

spec = json.load(open(sys.argv[1], encoding="utf-8"))
destination = sys.argv[2]
room = spec["room"]
W, D, H, T = (float(room[k]) for k in ("width", "depth", "height", "wallThickness"))
to_m = lambda mm: mm / 1000.0
model = ifcopenshell.api.project.create_file()
project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name=spec["title"])
units = [ifcopenshell.api.unit.add_si_unit(model, unit_type=k) for k in
         ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
ifcopenshell.api.unit.assign_unit(model, units=units)
context = ifcopenshell.api.context.add_context(model, context_type="Model")
body = ifcopenshell.api.context.add_context(model, context_type="Model",
    context_identifier="Body", target_view="MODEL_VIEW", parent=context)
site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Concept site")
building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Concept building")
storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="Level 00")
ifcopenshell.api.aggregate.assign_object(model, relating_object=project, products=[site])
ifcopenshell.api.aggregate.assign_object(model, relating_object=site, products=[building])
ifcopenshell.api.aggregate.assign_object(model, relating_object=building, products=[storey])
space = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSpace", name=spec["title"] + " - room")
ifcopenshell.api.aggregate.assign_object(model, relating_object=storey, products=[space])

def place_box(kind, name, cx, cy, z0, dx, dy, dz, angle=0):
    if min(dx, dy, dz) <= 0: raise ValueError("Empty solid: " + name)
    element = ifcopenshell.api.root.create_entity(model, ifc_class=kind, name=name)
    profile = model.createIfcRectangleProfileDef(ProfileType="AREA", XDim=to_m(dx), YDim=to_m(dy))
    rep = ifcopenshell.api.geometry.add_profile_representation(model, context=body,
          profile=profile, depth=to_m(dz))
    ifcopenshell.api.geometry.assign_representation(model, product=element, representation=rep)
    a = math.radians(angle)
    transform = np.array([[math.cos(a), -math.sin(a), 0, to_m(cx)],
                          [math.sin(a),  math.cos(a), 0, to_m(cy)],
                          [0, 0, 1, to_m(z0)], [0, 0, 0, 1]], dtype=float)
    ifcopenshell.api.geometry.edit_object_placement(model, product=element,
          matrix=transform, is_si=True)
    ifcopenshell.api.spatial.assign_container(model, relating_structure=storey,
          products=[element])
    return element

place_box("IfcSlab", "Concept floor", W / 2, D / 2, -80, W, D, 80)
# A concept wall is deliberately split into solids around each opening.
# This preserves a visible opening without falsely promising host-wall Revit families.
for wall in ("south", "north", "west", "east"):
    length = W if wall in ("north", "south") else D
    openings = sorted((o for o in spec["openings"] if o["wall"] == wall),
                      key=lambda o: o["offset"])
    pieces = []
    pos = 0
    for op in openings:
        a, b = float(op["offset"]), float(op["offset"] + op["width"])
        if a > pos: pieces.append((pos, a, 0, H))
        if op["sill"] > 0: pieces.append((a, b, 0, op["sill"]))
        above = op["sill"] + op["height"]
        if above < H: pieces.append((a, b, above, H))
        pos = b
    if pos < length: pieces.append((pos, length, 0, H))
    for idx, (a, b, z0, z1) in enumerate(pieces):
        if wall == "south": cx, cy, dx, dy = (a + b) / 2, T / 2, b - a, T
        elif wall == "north": cx, cy, dx, dy = (a + b) / 2, D - T / 2, b - a, T
        elif wall == "west": cx, cy, dx, dy = T / 2, (a + b) / 2, T, b - a
        else: cx, cy, dx, dy = W - T / 2, (a + b) / 2, T, b - a
        place_box("IfcWall", wall + " wall segment " + str(idx + 1),
                  cx, cy, z0, dx, dy, z1 - z0)

for idx, op in enumerate(spec["openings"]):
    wall = op["wall"]
    middle = op["offset"] + op["width"] / 2
    thickness = 45 if op["kind"] == "door" else 55
    if wall == "south": cx, cy, dx, dy = middle, T / 2, op["width"], thickness
    elif wall == "north": cx, cy, dx, dy = middle, D - T / 2, op["width"], thickness
    elif wall == "west": cx, cy, dx, dy = T / 2, middle, thickness, op["width"]
    else: cx, cy, dx, dy = W - T / 2, middle, thickness, op["width"]
    kind = "IfcDoor" if op["kind"] == "door" else "IfcWindow"
    place_box(kind, op["kind"] + " " + str(idx + 1), cx, cy,
              op["sill"], dx, dy, op["height"])

for idx, item in enumerate(spec["furniture"]):
    # Rotation is around the furniture center, identical to the authored design model.
    place_box("IfcFurniture", item["label"] + " " + str(idx + 1),
              item["x"], item["y"], 0, item["width"], item["depth"],
              item["height"], item["rotation"])

model.write(destination)
imported = ifcopenshell.open(destination)
counts = {name: len(imported.by_type(name)) for name in
          ("IfcProject", "IfcBuildingStorey", "IfcSlab", "IfcWall",
           "IfcDoor", "IfcWindow", "IfcFurniture", "IfcSpace")}
if imported.schema != "IFC4" or counts["IfcProject"] != 1 or counts["IfcSlab"] != 1:
    sys.exit("IFC_VERIFY_FAILED: invalid project hierarchy")
for kind in ("IfcSlab", "IfcWall", "IfcDoor", "IfcWindow", "IfcFurniture"):
    for element in imported.by_type(kind):
        if not element.Representation or not element.ObjectPlacement:
            sys.exit("IFC_VERIFY_FAILED: missing solid for " + kind)
print(json.dumps({"ifc": destination, "schema": imported.schema,
                  "units": "metres", "counts": counts, "conceptOnly": True}))
`;
