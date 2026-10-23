import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_SKILLS } from "@/lib/project-agent/runtime/builtin-skills";
import { IFC_SUMMARY_SCRIPT } from "@/lib/project-agent/runtime/ifc-summary-script";
import { REF_IMAGE_SCRIPT } from "@/lib/project-agent/runtime/ref-image-script";
import { ANNOTATE_SCRIPT } from "@/lib/project-agent/runtime/annotate-script";
import { PLACES_SCRIPT } from "@/lib/project-agent/runtime/places-script";
import { PAGE_CHECK_SCRIPT } from "@/lib/project-agent/runtime/page-check-script";
import { WEBKIT_SCRIPT } from "@/lib/project-agent/runtime/webkit-script";

const SCRIPTS = { "page_check.py": PAGE_CHECK_SCRIPT, "webkit.py": WEBKIT_SCRIPT, "ifc_summary.py": IFC_SUMMARY_SCRIPT, "places.py": PLACES_SCRIPT, "annotate.py": ANNOTATE_SCRIPT, "refimage.py": REF_IMAGE_SCRIPT };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-"));
const write = (name: string, body: string) => { const file = path.join(tmp, name); fs.writeFileSync(file, body); return file; };

describe("sandbox tool scripts", () => {
	for (const [name, body] of Object.entries(SCRIPTS)) {
		it(`${name} is valid python without a backtick`, () => {
			expect(body).not.toContain("`");
			execFileSync("python3", ["-c", "import ast,sys;ast.parse(open(sys.argv[1]).read())", write(name, body)]);
		});
	}

	it("every /work/.tools script a skill mentions is installed by prepare.ts", () => {
		const prepare = fs.readFileSync(path.join(__dirname, "../../lib/project-agent/runtime/prepare.ts"), "utf8");
		const mentioned = new Set(BUILTIN_SKILLS.flatMap((skill) => [...skill.body.matchAll(/\/work\/\.tools\/([a-z_]+\.py)/g)].map((m) => m[1])));
		expect(mentioned.size).toBeGreaterThan(3);
		for (const script of mentioned) expect(prepare, script).toContain(`"${script}"`);
	});

	it("skill names are unique", () => {
		const names = BUILTIN_SKILLS.map((skill) => skill.name);
		expect(new Set(names).size).toBe(names.length);
		for (const wanted of ["web-build-kit", "brand-guidelines", "boq-cost-estimate", "ifc-bim-read", "project-programme", "design-review-register", "proposal-tender", "local-business-research", "advisory-answer", "visual-references"]) expect(names).toContain(wanted);
	});

	it("ifc_summary reads storeys, areas and element counts from a small model", () => {
		const ifc = [
			"ISO-10303-21;", "HEADER;", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
			"#1=IFCPROJECT('p',$,'Demo',$,$,$,$,(),$);", "#4=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#5=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);",
			"#20=IFCBUILDING('b',$,'A',$,$,$,$,$,.ELEMENT.,$,$,$);", "#21=IFCBUILDINGSTOREY('s1',$,'Level 1 ''Podium''',$,$,$,$,$,.ELEMENT.,0.);",
			"#22=IFCBUILDINGSTOREY('s2',$,'Level 2',$,$,$,$,$,.ELEMENT.,4200.);", "#30=IFCSPACE('x',$,'101',$,$,$,$,'Lobby',.ELEMENT.,.INTERNAL.,$);",
			"#32=IFCSPACE('y',$,'201',$,$,$,$,'Office',.ELEMENT.,.INTERNAL.,$);", "#40=IFCDOOR('d',$,'D1',$,$,$,$,$,2100.,900.);",
			"#50=IFCRELAGGREGATES('r1',$,$,$,#20,(#21,#22));", "#51=IFCRELAGGREGATES('r2',$,$,$,#21,(#30));", "#52=IFCRELAGGREGATES('r3',$,$,$,#22,(#32));",
			"#53=IFCRELCONTAINEDINSPATIALSTRUCTURE('r4',$,$,$,(#40),#21);", "#60=IFCQUANTITYAREA('NetFloorArea',$,$,120.5,$);",
			"#63=IFCELEMENTQUANTITY('q',$,'Qto_SpaceBaseQuantities',$,$,(#60));", "#65=IFCRELDEFINESBYPROPERTIES('r5',$,$,$,(#30),#63);", "ENDSEC;", "END-ISO-10303-21;",
		].join("\n");
		const out = JSON.parse(execFileSync("python3", [write("ifc_summary.py", IFC_SUMMARY_SCRIPT), write("m.ifc", ifc)]).toString());
		expect(out.schema).toBe("IFC4");
		expect(out.project).toBe("Demo");
		expect(out.total_space_area_m2).toBe(120.5);
		expect(out.storeys.map((s: unknown[]) => [s[0], s[1]])).toEqual([["Level 1 'Podium'", 0], ["Level 2", 4.2]]);
		expect(out.elements).toEqual({ IFCDOOR: 1 });
		expect(out.missing).toEqual(["space 201 has no area quantity"]);
	});

	it("annotate.py marks a photo and adds a legend strip", () => {
		try { execFileSync("python3", ["-c", "import PIL"]); } catch { return; }
		const photo = path.join(tmp, "photo.jpg");
		execFileSync("python3", ["-c", "from PIL import Image;import sys;Image.new('RGB',(400,300),(120,130,140)).save(sys.argv[1])", photo]);
		const out = path.join(tmp, "marked.jpg");
		execFileSync("python3", [write("annotate.py", ANNOTATE_SCRIPT), photo, out, "--mark", "50,50|Move the boxes", "--box", "10,10,40,40|Clear this shelf"]);
		const size = execFileSync("python3", ["-c", "from PIL import Image;import sys;print(Image.open(sys.argv[1]).size)", out]).toString();
		expect(size).toMatch(/\(400, (3[1-9]\d|[4-9]\d\d)\)/);
	});

	it("refimage.py refuses private addresses", () => {
		let message = "";
		try { execFileSync("python3", [write("refimage.py", REF_IMAGE_SCRIPT), "http://127.0.0.1:9/", path.join(tmp, "ref.jpg")], { stdio: "pipe" }); } catch (error) { message = String((error as { stderr?: Buffer }).stderr ?? ""); }
		expect(message).toContain("not public");
	});
});
