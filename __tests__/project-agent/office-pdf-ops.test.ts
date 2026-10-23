import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_OPS_PY } from "@/lib/office/pdf-ops-script";
import { parsePdfOp, RESULT_OF } from "@/lib/office/pdf-ops-validate";
import { recipeFiles } from "@/lib/project-agent/recipes/registry";

describe("parsePdfOp", () => {
	it("accepts each supported operation and rejects the rest with a readable message", () => {
		expect(parsePdfOp({ op: "page-numbers", prefix: "Trang ", position: "bottom-right", startNumber: 3 })).toMatchObject({ op: "page-numbers", startNumber: 3 });
		expect(parsePdfOp({ op: "watermark", text: "DRAFT", pages: "1-3" })).toMatchObject({ op: "watermark" });
		expect(parsePdfOp({ op: "compress" })).toEqual({ op: "compress", level: "lossless" });
		expect(parsePdfOp({ op: "redact", terms: [" a ", ""], emails: true })).toMatchObject({ terms: ["a"], emails: true, phones: false });
		expect(parsePdfOp({ op: "split", mode: "every", every: 5 })).toEqual({ op: "split", mode: "every", every: 5 });
		expect(parsePdfOp({ op: "protect", password: "abcd" })).toMatchObject({ mode: "encrypt" });
		expect(() => parsePdfOp({ op: "rm -rf" })).toThrow("Unknown operation");
		expect(() => parsePdfOp({ op: "watermark" })).toThrow("text is required");
		expect(() => parsePdfOp({ op: "extract-pages", pages: "1; drop" })).toThrow("Pages look like");
		expect(() => parsePdfOp({ op: "redact", terms: [] })).toThrow("Give words to remove");
		expect(() => parsePdfOp({ op: "protect", password: "abc" })).toThrow("at least 4");
		expect(() => parsePdfOp({ op: "merge", resourceIds: ["../etc"] })).toThrow("Choose 1 to 20");
		expect(() => parsePdfOp({ op: "convert", to: "exe" })).toThrow("Convert to");
		expect(parsePdfOp({ op: "convert", to: "rtf" })).toMatchObject({ to: "rtf" });
		expect(parsePdfOp({ op: "import-file", resourceId: "00000000-0000-0000-0000-000000000001" })).toMatchObject({ op: "import-file" });
		expect(() => parsePdfOp({ op: "import-file", resourceId: "../x" })).toThrow("Choose a file");
		expect(() => parsePdfOp({ op: "page-numbers", position: "nowhere" })).toThrow("Unknown position");
	});
	it("knows what each operation produces", () => {
		expect(RESULT_OF.watermark).toBe("version");
		expect(RESULT_OF.split).toBe("resources");
		expect(RESULT_OF["insert-from"]).toBe("version");
	});
});

const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();
let dir = "";
const py = (code: string) => execFileSync("python3", ["-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], { cwd: dir, encoding: "utf8" }).trim();
const op = (spec: object) => {
	writeFileSync(path.join(dir, "spec.json"), JSON.stringify(spec));
	try { return JSON.parse(execFileSync("python3", ["-W", "ignore", "ops.py"], { cwd: dir, encoding: "utf8" }).trim().split("\n").at(-1)!); }
	catch (error) { return JSON.parse(String((error as { stdout: string }).stdout).trim().split("\n").at(-1)!); }
};

describe.skipIf(!hasEngine)("manual PDF tools in the sandbox script", () => {
	beforeAll(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "pdf-ops-"));
		mkdirSync(path.join(dir, "recipes")); mkdirSync(path.join(dir, "inputs")); mkdirSync(path.join(dir, "outputs"));
		for (const [name, body] of Object.entries(recipeFiles())) writeFileSync(path.join(dir, "recipes", name), body);
		writeFileSync(path.join(dir, "ops.py"), PDF_OPS_PY.replace('"/work/recipes"', JSON.stringify(path.join(dir, "recipes"))));
		py(`for name, count in (("in", 8), ("other-1", 3), ("other-2", 2)):
    d = fitz.open()
    for i in range(count):
        p = d.new_page()
        p.insert_text((72, 100), "%s page %d" % (name, i + 1), fontsize=20)
        p.insert_text((72, 140), "contact a.b@example.com 0912 345 678", fontsize=10)
    if name == "in":
        d.set_toc([[1, "One", 1], [1, "Two", 5]])
    d.save("inputs/%s.pdf" % name)`);
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("page numbers and watermark write outputs/out.pdf", () => {
		expect(op({ op: "page-numbers", prefix: "P", pages: "1-3" })).toMatchObject({ pagesMarked: 3 });
		expect(py('print("P2" in fitz.open("outputs/out.pdf")[1].get_text(), "P4" in fitz.open("outputs/out.pdf")[3].get_text())')).toBe("True False");
		expect(op({ op: "watermark", text: "DRAFT" })).toMatchObject({ pagesMarked: 8 });
	});
	it("extract-pages keeps the chosen pages", () => {
		op({ op: "extract-pages", pages: "2,last" });
		expect(py('d = fitz.open("outputs/out.pdf"); print(len(d), d[1].get_text().split("\\n")[0])')).toBe("2 in page 8");
	});
	it("insert-from puts pages of another PDF after a page, merge appends whole PDFs", () => {
		op({ op: "insert-from", resourceId: "x", pages: "2-3", after: 4 });
		expect(py('d = fitz.open("outputs/out.pdf"); print(len(d), d[4].get_text().split("\\n")[0], d[6].get_text().split("\\n")[0])')).toBe("10 other-1 page 2 in page 5");
		op({ op: "merge", resourceIds: ["a", "b"] });
		expect(py('print(len(fitz.open("outputs/out.pdf")))')).toBe("13");
	});
	it("redact deletes emails and phone numbers for good", () => {
		expect(op({ op: "redact", terms: [], emails: true, phones: true, vnIds: false, pages: "1-2" })).toMatchObject({ remainingMatches: 0 });
		expect(py('t = fitz.open("outputs/out.pdf")[0].get_text(); print("example.com" in t, "0912" in t)')).toBe("False False");
	});
	it("rotate, delete-pages and crop change the page set or geometry", () => {
		py('import shutil; shutil.copy("inputs/in.pdf", "inputs/in-keep.pdf")');
		op({ op: "rotate", degrees: 90, pages: "1" });
		expect(py('d = fitz.open("outputs/out.pdf"); print(d[0].rotation, d[1].rotation)')).toBe("90 0");
		op({ op: "delete-pages", pages: "1-2" });
		expect(py('print(len(fitz.open("outputs/out.pdf")))')).toBe("6");
		op({ op: "crop", region: { x: 10, y: 10, width: 50, height: 50 }, pages: "1" });
		expect(py('r = fitz.open("outputs/out.pdf")[0].cropbox; print(round(r.width))')).toBe("298");
	});
	it("compare marks differing pages and images exports page pictures", () => {
		py('import shutil; shutil.copy("inputs/other-1.pdf", "inputs/other-1.pdf.bak")');
		const result = op({ op: "compare", resourceId: "x" });
		expect(result.summary).toMatch(/pages differ/);
		op({ op: "images", format: "png", pages: "1-2", dpi: 72 });
		expect(readdirSync(path.join(dir, "outputs/images")).sort()).toEqual(["1.png", "2.png"]);
		expect(op({ op: "images", format: "png", pages: "1-8", dpi: 72 })).not.toHaveProperty("error");
	});
	it("split writes one file per part and reports an unknown operation", () => {
		op({ op: "split", mode: "bookmarks" });
		expect(readdirSync(path.join(dir, "outputs/split")).length).toBe(2);
		expect(op({ op: "nope" })).toHaveProperty("error");
	});
	it("protect encrypts and decrypts with the password", () => {
		expect(op({ op: "protect", mode: "encrypt", password: "secret1" })).toMatchObject({ mode: "encrypt" });
		expect(py('print(bool(fitz.open("outputs/out.pdf").needs_pass))')).toBe("True");
		copyFileSync(path.join(dir, "outputs/out.pdf"), path.join(dir, "inputs/in.pdf"));
		expect(op({ op: "protect", mode: "decrypt", password: "wrong-one" })).toHaveProperty("error");
		expect(op({ op: "protect", mode: "decrypt", password: "secret1" })).toMatchObject({ mode: "decrypt" });
		expect(py('print(bool(fitz.open("outputs/out.pdf").needs_pass))')).toBe("False");
	});
	it("convert to txt gives readable text", () => {
		py('import shutil; shutil.copy("outputs/out.pdf", "inputs/in.pdf")');
		expect(op({ op: "convert", to: "txt" })).toMatchObject({ to: "txt" });
		expect(execFileSync("cat", [path.join(dir, "outputs/out.txt")], { encoding: "utf8" })).toContain("page 1");
	});
	it("convert to xml is well formed and to rtf is a valid rtf header", () => {
		expect(op({ op: "convert", to: "xml" })).toMatchObject({ to: "xml" });
		expect(py('import xml.dom.minidom as m; d = m.parse("outputs/out.xml"); print(len(d.getElementsByTagName("page")))')).toBe(py('print(len(fitz.open("inputs/in.pdf")))'));
		expect(op({ op: "convert", to: "rtf" })).toMatchObject({ to: "rtf" });
		const rtf = execFileSync("cat", [path.join(dir, "outputs/out.rtf")], { encoding: "utf8" });
		expect(rtf.startsWith("{\\rtf1")).toBe(true);
		expect(rtf.trimEnd().endsWith("}")).toBe(true);
	});
	it("import-file turns an image into a one page PDF", () => {
		py('from PIL import Image; Image.new("RGB", (120, 80), (200, 30, 30)).save("inputs/source.png")');
		expect(op({ op: "import-file", name: "source.png" })).toMatchObject({ out: "outputs/out.pdf" });
		expect(py('print(len(fitz.open("outputs/out.pdf")))')).toBe("1");
	});
});

import { PDF_TOOLS } from "@/lib/office/pdf-tools-catalog";

describe("tools menu catalog", () => {
	it("every tool builds an operation the server accepts from its own default values", () => {
		const ID = "00000000-0000-0000-0000-000000000001";
		for (const tool of PDF_TOOLS) {
			const values: Record<string, unknown> = {};
			for (const field of tool.fields) {
				if (field.type === "select" || field.type === "number") values[field.key] = field.value;
				if (field.type === "pages") values[field.key] = "1-2";
				if (field.type === "text") values[field.key] = field.key === "ranges" ? "1-2;3-" : "Sample";
				if (field.type === "password") values[field.key] = "secret1";
				if (field.type === "checkbox") values[field.key] = true;
				if (field.type === "file") values[field.key] = ID;
				if (field.type === "pdf") values[field.key] = field.multiple ? [ID] : ID;
			}
			const operation = tool.toOperation(values, { page: 3, pages: 10 });
			expect(() => parsePdfOp(operation), tool.id).not.toThrow();
		}
		expect(new Set(PDF_TOOLS.map((tool) => tool.id)).size).toBe(PDF_TOOLS.length);
	});
	it("insert-from defaults to the current page", () => {
		const tool = PDF_TOOLS.find((item) => item.id === "insert-from")!;
		expect(tool.toOperation({ resourceId: "x" }, { page: 4, pages: 9 })).toMatchObject({ after: 4 });
	});
});
