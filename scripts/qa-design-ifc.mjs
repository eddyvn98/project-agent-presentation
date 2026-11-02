import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { IFC_DESIGN_SCRIPT } from "../lib/project-agent/runtime/design-ifc-script.ts";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ifc-"));
function runPython(args) {
  const p = spawnSync("python3", args, { encoding: "utf8", timeout: 90_000, maxBuffer: 2_000_000 });
  if (p.status !== 0) throw new Error("IFC test failed:\n" + p.stderr + "\n" + p.stdout);
  return p.stdout.trim();
}
const model = {
 title: "Revit mobile handoff test", units: "mm",
 room: { width: 8000, depth: 5000, height: 3000, wallThickness: 150 },
 openings: [
  { wall: "south", kind: "door", offset: 700, width: 900, height: 2100, sill: 0 },
  { wall: "east", kind: "window", offset: 1700, width: 1200, height: 1200, sill: 900 }
 ],
 furniture: [
  { kind: "table", x: 4000, y: 2300, width: 2000, depth: 1100, height: 750, rotation: 0, label: "Table" },
  { kind: "cabinet", x: 6300, y: 3900, width: 1600, depth: 400, height: 2000, rotation: 90, label: "Storage" }
 ]
};
const checker = "import ifcopenshell, ifcopenshell.geom, ifcopenshell.util.unit, json, sys\nm=ifcopenshell.open(sys.argv[1])\nassert m.schema==\"IFC4\", m.schema\nassert abs(ifcopenshell.util.unit.calculate_unit_scale(m)-1.0)<1e-8\ncounts={\"IfcProject\":1,\"IfcBuilding\":1,\"IfcBuildingStorey\":1,\"IfcSpace\":1,\"IfcSlab\":1,\"IfcDoor\":1,\"IfcWindow\":1,\"IfcFurniture\":2}\nfor kind,needed in counts.items():\n    actual=len(m.by_type(kind))\n    assert actual==needed,(kind,actual,needed)\nwalls=m.by_type(\"IfcWall\")\nassert len(walls)>=6\nsettings=ifcopenshell.geom.settings()\nsolids=0\nfor kind in (\"IfcSlab\",\"IfcWall\",\"IfcDoor\",\"IfcWindow\",\"IfcFurniture\"):\n    for item in m.by_type(kind):\n        assert item.Representation and item.ObjectPlacement,item\n        vertices=ifcopenshell.geom.create_shape(settings,item).geometry.verts\n        assert len(vertices)>=24 and all(abs(v)<500 for v in vertices),(kind,item.Name)\n        solids+=1\nslab=m.by_type(\"IfcSlab\")[0]\nverts=ifcopenshell.geom.create_shape(settings,slab).geometry.verts\nxs,ys=verts[::3],verts[1::3]\nassert abs(max(xs)-min(xs)-8)<.01,(min(xs),max(xs))\nassert abs(max(ys)-min(ys)-5)<.01,(min(ys),max(ys))\nprint(json.dumps({\"schema\":m.schema,\"solids\":solids,\"walls\":len(walls),\"units\":\"m\"}))\n";
try {
 const py=path.join(tmp,"export.py"), input=path.join(tmp,"room.json");
 const target=path.join(tmp,"room.ifc"), validate=path.join(tmp,"verify.py");
 fs.writeFileSync(py, IFC_DESIGN_SCRIPT);
 fs.writeFileSync(input, JSON.stringify(model));
 fs.writeFileSync(validate, checker);
 const result=JSON.parse(runPython([py,input,target]));
 assert.equal(result.schema, "IFC4");
 assert(fs.readFileSync(target,"utf8").startsWith("ISO-10303-21;"));
 const checked=JSON.parse(runPython([validate,target]));
 assert(checked.solids>=10);
 console.log("IFC4 real solid geometry test PASS",checked);
} finally {
 fs.rmSync(tmp,{recursive:true,force:true});
}
