import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_CHANGES_PY } from "@/lib/office/pdf-changes-script";
import { parsePdfChanges } from "@/lib/office/pdf-changes-validate";
import { PDF_TILE_WORKER_PY } from "@/lib/office/pdf-tile-worker-script";

const region = (page = 1, x = 10, y = 10, width = 30, height = 5) => ({ page, x, y, width, height });
const calibration = (page = 1, id = "cal-1") => ({ id, page, points: [{ x: 10, y: 50 }, { x: 60, y: 50 }], realLength: 5, unit: "m" });
const redact = (extra: object) => ({ kind: "redact", schemaVersion: 1, ...extra });
const measure = (type: string, points: object[], page = 1) => ({ kind: "measure", schemaVersion: 1, type, page, points, calibration: calibration(page) });
const replace = (extra: object) => ({ kind: "text.replace", schemaVersion: 1, search: "Hello", replacement: "Xin chao", scope: { kind: "document" }, ...extra });

describe("P3 change validation", () => {
	it("accepts the supported shapes", () => {
		expect(parsePdfChanges([
			redact({ regions: [region()] }), redact({ terms: ["secret"], pages: [1, 2] }),
			{ kind: "measure.calibrate", schemaVersion: 1, calibration: calibration() },
			measure("distance", [{ x: 10, y: 10 }, { x: 40, y: 10 }]), measure("perimeter", [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 30 }]), measure("area", [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 30 }]),
			replace({}), replace({ scope: { kind: "pages", pages: [1] } }), replace({ scope: { kind: "region", region: region() }, caseSensitive: true, replacement: "" }),
		])).toHaveLength(9);
	});
	it.each([
		["a redaction with nothing to remove", redact({})],
		["terms without pages", redact({ terms: ["a"] })],
		["a region outside the page", redact({ regions: [region(1, 90, 90, 30, 30)] })],
		["a distance with three points", measure("distance", [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])],
		["an area with two points", measure("area", [{ x: 1, y: 1 }, { x: 2, y: 2 }])],
		["a calibration of another page", { ...measure("distance", [{ x: 1, y: 1 }, { x: 5, y: 5 }]), calibration: calibration(2) }],
		["a zero length calibration", { kind: "measure.calibrate", schemaVersion: 1, calibration: { ...calibration(), realLength: 0 } }],
		["calibration points on top of each other", { kind: "measure.calibrate", schemaVersion: 1, calibration: { ...calibration(), points: [{ x: 5, y: 5 }, { x: 5, y: 5 }] } }],
		["an unknown unit", { kind: "measure.calibrate", schemaVersion: 1, calibration: { ...calibration(), unit: "yd" } }],
		["empty search text", replace({ search: "" })],
		["a scope without a kind", replace({ scope: {} })],
		["a future schema", { ...replace({}), schemaVersion: 2 }],
	])("rejects %s", (_name, bad) => {
		expect(() => parsePdfChanges([bad])).toThrow();
	});
});

const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();
let dir = "";
const py = (code: string) => execFileSync("python3", ["-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], { cwd: dir, encoding: "utf8" }).trim();
const apply = (changes: unknown[], input = "in.pdf") => {
	writeFileSync(path.join(dir, "spec.json"), JSON.stringify({ changes: parsePdfChanges(changes) }));
	const out = execFileSync("python3", ["-W", "ignore", "apply.py", input, "out.pdf", "spec.json"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
	return JSON.parse(out.trim().split("\n").at(-1)!) as { notes: string[] };
};
const failure = (changes: unknown[]) => { try { apply(changes); return ""; } catch (error) { return String((error as { stderr?: string }).stderr); } };
const worker = (command: object) => JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, "out.pdf"), ...command }) + "\n", encoding: "utf8" }).trim());

describe.skipIf(!hasEngine)("P3 changes on real PDFs", () => {
	beforeAll(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "p3-"));
		writeFileSync(path.join(dir, "apply.py"), PDF_CHANGES_PY);
		writeFileSync(path.join(dir, "worker.py"), PDF_TILE_WORKER_PY);
		py(`from PIL import Image
Image.new("RGB", (60, 30), (200, 20, 20)).save("pic.png")
d = fitz.open()
p = d.new_page()
p.insert_text((72, 100), "Hello world, secret code 4711 here", fontsize=14)
p.insert_text((72, 140), "Second hello line", fontsize=12)
p.insert_image(fitz.Rect(72, 300, 200, 360), filename="pic.png")
q = d.new_page(); q.insert_text((72, 100), "Page two has a secret too", fontsize=14)
d.save("in.pdf")`);
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("redaction removes the text for good, even from the file bytes, and rewrites the whole file", () => {
		const result = apply([redact({ terms: ["secret"], pages: [1, 2] })]);
		expect(result.notes.join(" ")).toContain("Removed 2 place(s)");
		expect(py('d = fitz.open("out.pdf"); print("secret" in d[0].get_text(), "secret" in d[1].get_text(), "Hello world" in d[0].get_text())')).toBe("False False True");
		const bytes = readFileSync(path.join(dir, "out.pdf")).toString("latin1");
		expect(bytes.includes("secret")).toBe(false);
		expect(bytes.split("%%EOF").length - 1).toBe(1);
	});
	it("redaction by region also deletes the pixels of an image under it", () => {
		apply([redact({ regions: [{ page: 1, x: 10, y: 35, width: 30, height: 10 }] })]);
		expect(py('d = fitz.open("out.pdf"); pix = d[0].get_pixmap(clip=fitz.Rect(80, 305, 190, 355)); print(min(pix.samples) == max(pix.samples) or sorted(set(pix.samples))[0] == 0)')).toBe("True");
		expect(py('d = fitz.open("out.pdf"); pix = d[0].get_pixmap(clip=fitz.Rect(80, 305, 190, 355)); print(len(set(pix.samples)) <= 4)')).toBe("True");
	});
	it("refuses a redaction that finds nothing, and never saves a half done one", () => {
		expect(failure([redact({ terms: ["does-not-exist"], pages: [1] })])).toContain("Nothing was found");
		expect(failure([redact({ regions: [region(5)] })])).toContain("missing page");
	});
	it("calibrates a page and measures with the right real numbers", () => {
		const result = apply([{ kind: "measure.calibrate", schemaVersion: 1, calibration: calibration() }, measure("distance", [{ x: 10, y: 20 }, { x: 35, y: 20 }]), measure("perimeter", [{ x: 10, y: 60 }, { x: 40, y: 60 }, { x: 40, y: 80 }]), measure("area", [{ x: 10, y: 60 }, { x: 40, y: 60 }, { x: 40, y: 80 }, { x: 10, y: 80 }])]);
		expect(result.notes).toEqual(expect.arrayContaining(["Distance: 2.50 m", "Perimeter: 9.95 m"]));
		expect(result.notes.join(" ")).toMatch(/Area: 8\.4\d m\u00b2/);
		const labels = py('d = fitz.open("out.pdf"); print(sorted(a.info["content"] for a in d[0].annots() if a.info.get("title") == "Measure"))');
		expect(labels).toContain("2.50 m");
		expect(labels).toContain("m²");
		expect(worker({ kind: "calibrations" }).calibrations).toEqual([expect.objectContaining({ page: 1, realLength: 5, unit: "m" })]);
	});
	it("replaces calibrations of the same page instead of keeping both", () => {
		apply([{ kind: "measure.calibrate", schemaVersion: 1, calibration: calibration() }]);
		py('import shutil; shutil.copy("out.pdf", "cal.pdf")');
		apply([{ kind: "measure.calibrate", schemaVersion: 1, calibration: { ...calibration(1, "cal-2"), realLength: 12 } }], "cal.pdf");
		const list = worker({ kind: "calibrations" }).calibrations;
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ id: "cal-2", realLength: 12 });
	});
	it("replaces text in a region, pages or the whole document and counts matches first", () => {
		expect(worker({ kind: "matches", search: "hello", caseSensitive: false, scope: { kind: "document" } })).toMatchObject({ count: 2 });
		expect(worker({ kind: "matches", search: "hello", caseSensitive: true, scope: { kind: "document" } })).toMatchObject({ count: 1 });
		expect(worker({ kind: "matches", search: "hello", caseSensitive: false, scope: { kind: "region", region: { page: 1, x: 5, y: 15, width: 60, height: 8 } } })).toMatchObject({ count: 1 });
		apply([replace({ scope: { kind: "region", region: { page: 1, x: 5, y: 15, width: 60, height: 8 } }, replacement: "Chao ban" })]);
		expect(py('d = fitz.open("out.pdf"); t = d[0].get_text(); print("Chao ban" in t, "Hello world" in t)')).toBe("True True");
		const all = apply([replace({ replacement: "Xin chao" })]);
		expect(all.notes.join(" ")).toContain("Replaced 2 place(s)");
		expect(py('d = fitz.open("out.pdf"); t = d[0].get_text(); print("Hello" in t, "Xin chao" in t)')).toBe("False True");
		expect(failure([replace({ search: "zzz-nothing" })])).toContain("not found");
	});
});
