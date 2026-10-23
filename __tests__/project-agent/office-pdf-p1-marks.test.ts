import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_CHANGES_PY } from "@/lib/office/pdf-changes-script";
import { PDF_TILE_WORKER_PY } from "@/lib/office/pdf-tile-worker-script";
import { parsePdfChanges } from "@/lib/office/pdf-changes-validate";

const style = { strokeColor: "#dd3149", fillColor: "#ffdc45", opacity: 0.65, strokeWidthPt: 2, fontSizePt: 12 };
const region = (page: number, x = 10, y = 10, width = 30, height = 10) => ({ page, x, y, width, height });
const quad = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 14 }, { x: 10, y: 14 }];
const mark = (type: string, extra: object = {}, page = 1) => ({ kind: "mark", mark: { schemaVersion: 1, type, region: region(page), style, ...extra } });

describe("P1 mark validation", () => {
	it("accepts every P1 type and keeps the legacy marks working", () => {
		const changes = parsePdfChanges([
			mark("highlight", { quads: [quad] }), mark("underline", { quads: [quad] }), mark("strikeout", { quads: [quad] }), mark("squiggly", { quads: [quad] }),
			mark("inkHighlight", { paths: [[{ x: 1, y: 1 }, { x: 5, y: 5 }]] }), mark("addText", { text: "Xin chào" }), mark("callout", { text: "x", anchor: { x: 50, y: 50 } }),
			mark("rectangle"), mark("circle"), mark("line", { points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }), mark("arrow", { points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }),
			mark("polygon", { points: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 9 }] }), mark("polyline", { points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }), mark("stamp", { assetId: "abc-123" }),
			{ kind: "mark", mark: { type: "highlight", region: region(1) } },
		]);
		expect(changes).toHaveLength(15);
		expect((changes[10] as { mark: { arrowEnd: string } }).mark.arrowEnd).toBe("end");
	});
	it.each([
		["a future schema version", { kind: "mark", mark: { ...mark("rectangle").mark, schemaVersion: 2 } }],
		["a text mark without exact quads", mark("underline", { quads: [] })],
		["a quad with three corners", mark("highlight", { quads: [quad.slice(0, 3)] })],
		["a point outside the page", mark("line", { points: [{ x: 1, y: 1 }, { x: 101, y: 5 }] })],
		["a polygon with two points", mark("polygon", { points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] })],
		["an opacity above 1", { kind: "mark", mark: { ...mark("rectangle").mark, style: { ...style, opacity: 1.5 } } }],
		["a colour that is not hex", { kind: "mark", mark: { ...mark("rectangle").mark, style: { ...style, strokeColor: "red" } } }],
		["empty text", mark("addText", { text: "   " })],
		["an asset id with a slash", mark("image", { assetId: "../etc/passwd" })],
	])("rejects %s", (_name, bad) => {
		expect(() => parsePdfChanges([bad])).toThrow();
	});
});

const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();
let dir = "";
const py = (code: string) => execFileSync("python3", ["-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], { cwd: dir, encoding: "utf8" }).trim();
const apply = (changes: unknown[], assets: Record<string, string> = {}) => {
	writeFileSync(path.join(dir, "spec.json"), JSON.stringify({ changes: parsePdfChanges(changes), assets }));
	execFileSync("python3", ["-W", "ignore", "apply.py", "in.pdf", "out.pdf", "spec.json"], { cwd: dir, encoding: "utf8" });
};

describe.skipIf(!hasEngine)("P1 marks become real PDF annotations", () => {
	beforeAll(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "p1-"));
		writeFileSync(path.join(dir, "apply.py"), PDF_CHANGES_PY);
		py(`d = fitz.open()
p = d.new_page(); p.insert_text((72, 100), "Hello world, line one", fontsize=14)
q = d.new_page(); q.insert_text((72, 100), "Second page", fontsize=14); q.set_rotation(90)
d.save("in.pdf")
from PIL import Image
Image.new("RGBA", (80, 40), (20, 80, 200, 255)).save("sig.png")`);
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("draws every annotation type with the right PDF subtype", () => {
		apply([
			mark("highlight", { quads: [quad] }), mark("underline", { quads: [quad] }), mark("strikeout", { quads: [quad] }), mark("squiggly", { quads: [quad] }),
			mark("inkHighlight", { paths: [[{ x: 10, y: 30 }, { x: 40, y: 32 }, { x: 60, y: 30 }]] }), mark("addText", { text: "Ghi chu" }), mark("callout", { text: "Callout", anchor: { x: 60, y: 60 } }),
			mark("rectangle"), mark("circle"), mark("line", { points: [{ x: 10, y: 50 }, { x: 40, y: 55 }] }), mark("arrow", { points: [{ x: 10, y: 60 }, { x: 40, y: 65 }] }),
			mark("polygon", { points: [{ x: 50, y: 50 }, { x: 70, y: 50 }, { x: 60, y: 70 }] }), mark("polyline", { points: [{ x: 50, y: 80 }, { x: 60, y: 85 }, { x: 70, y: 80 }] }),
			mark("stamp", { assetId: "asset-1" }), mark("signature", { assetId: "asset-1" }),
		], { "asset-1": "sig.png" });
		const types = py('print(sorted(a.type[1] for a in fitz.open("out.pdf")[0].annots()))');
		for (const expected of ["Highlight", "Underline", "StrikeOut", "Squiggly", "Ink", "FreeText", "Square", "Circle", "Line", "Polygon", "PolyLine", "Stamp"]) expect(types).toContain(expected);
		expect(py('print(sum(1 for a in fitz.open("out.pdf")[0].annots() if a.type[1] == "Stamp"))')).toBe("2");
	});
	it("keeps Vietnamese text readable and records the colour and opacity", () => {
		apply([mark("addText", { text: "Nguyễn Văn A" }), mark("highlight", { quads: [quad] })]);
		expect(py('t = fitz.open("out.pdf")[0].get_text(); print("Nguyễn Văn A" in t or "Nguyen Van A" in t)')).toBe("True");
		expect(py('d = fitz.open("out.pdf"); a = [x for x in d[0].annots() if x.type[1] == "Highlight"][0]; print(round(a.opacity, 2), [round(c, 2) for c in a.colors["stroke"]])')).toBe("0.65 [1.0, 0.86, 0.27]");
	});
	it("places marks on a rotated page where the user sees them", () => {
		apply([mark("highlight", { quads: [quad] }, 2), mark("rectangle", {}, 2)]);
		const result = py('d = fitz.open("out.pdf"); p = d[1]; r = [a for a in p.annots() if a.type[1] == "Square"][0].rect; v = r * p.rotation_matrix; print(round(v.x0 / p.rect.width * 100), round(v.y0 / p.rect.height * 100))');
		expect(result).toBe("10 10");
	});
	it("fails clearly when the image of a mark is missing", () => {
		expect(() => apply([mark("image", { assetId: "nope" })])).toThrow();
	});

	it("finds the exact text line boxes of a region for underline, strikeout and squiggly", () => {
		writeFileSync(path.join(dir, "worker.py"), PDF_TILE_WORKER_PY);
		const ask = (command: object) => JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, "in.pdf"), ...command }) + "\n", encoding: "utf8" }).trim());
		const first = ask({ kind: "quads", page: 1, region: { x: 5, y: 5, width: 60, height: 20 } });
		expect(first.quads).toHaveLength(1);
		const [tl, tr, br, bl] = first.quads[0] as Array<{ x: number; y: number }>;
		expect(tl.x).toBeCloseTo(12.1, 0);
		expect(tr.x).toBeGreaterThan(tl.x + 20);
		expect(bl.y).toBeGreaterThan(tl.y);
		expect(br.x).toBeCloseTo(tr.x, 3);
		expect(ask({ kind: "quads", page: 1, region: { x: 5, y: 60, width: 30, height: 10 } }).quads).toHaveLength(0);
		expect(ask({ kind: "quads", page: 9, region: { x: 5, y: 5, width: 30, height: 10 } })).toHaveProperty("error");
		expect(ask({ kind: "quads", page: 1, region: { x: 90, y: 5, width: 30, height: 10 } })).toHaveProperty("error");
		const rotated = ask({ kind: "quads", page: 2, region: { x: 0, y: 0, width: 100, height: 100 } });
		expect(rotated.quads).toHaveLength(1);
		for (const corner of rotated.quads[0] as Array<{ x: number; y: number }>) { expect(corner.x).toBeGreaterThanOrEqual(0); expect(corner.x).toBeLessThanOrEqual(100); }
	});
});
