import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_CHANGES_PY } from "@/lib/office/pdf-changes-script";
import { parsePdfChanges } from "@/lib/office/pdf-changes-validate";
import { PDF_TILE_WORKER_PY } from "@/lib/office/pdf-tile-worker-script";

const region = (page = 1, x = 10, y = 10, width = 30, height = 5) => ({ page, x, y, width, height });
const create = (field: object) => ({ kind: "form.create", schemaVersion: 1, field });
const fill = (name: string, fieldType: string, value: unknown) => ({ kind: "form.fill", schemaVersion: 1, name, fieldType, value });
const options = [{ label: "Ha Noi", value: "HN" }, { label: "Da Nang", value: "DN" }];

describe("P2a change validation", () => {
	it("accepts the supported shapes", () => {
		const changes = parsePdfChanges([
			create({ name: "ten", type: "text", region: region(), defaultValue: "A", required: true, tooltip: "Ho ten", maxLength: 40, multiline: false }),
			create({ name: "dongy", type: "checkbox", region: region(1, 10, 20, 3, 3), defaultValue: true, exportValue: "Yes" }),
			create({ name: "tinh", type: "dropdown", region: region(1, 10, 30), options, defaultValue: "HN" }),
			create({ name: "ds", type: "listBox", region: region(1, 10, 40, 30, 10), options, defaultValues: ["DN"] }),
			fill("ten", "text", "B"), fill("dongy", "checkbox", false), fill("tinh", "dropdown", null), fill("ds", "listBox", ["HN"]),
			{ kind: "link", schemaVersion: 1, region: region(), target: { kind: "url", url: "https://example.com/x?y=1" } },
			{ kind: "link", schemaVersion: 1, region: region(), target: { kind: "page", page: 2, point: { x: 10, y: 20 } } },
			{ kind: "attachment", schemaVersion: 1, region: region(), assetId: "res-1" },
		]);
		expect(changes).toHaveLength(11);
	});
	it("accepts radio groups, multi-select lists and checkbox export values", () => {
		const choices = [{ region: region(), label: "A", exportValue: "a" }, { region: region(1, 10, 20), label: "B", exportValue: "b" }];
		expect(parsePdfChanges([
			create({ name: "g", type: "radio", choices, defaultValue: "b" }), fill("g", "radio", "a"), fill("g", "radio", null),
			create({ name: "ds", type: "listBox", region: region(1, 10, 40, 30, 10), options, multiSelect: true, defaultValues: ["HN", "DN"] }), fill("ds", "listBox", ["HN", "DN"]),
			create({ name: "c", type: "checkbox", region: region(1, 10, 20, 3, 3), exportValue: "On" }),
		])).toHaveLength(6);
	});
	it("lets an attachment anchor have no width or height", () => {
		expect(parsePdfChanges([{ kind: "attachment", schemaVersion: 1, region: { page: 1, x: 50, y: 50, width: 0, height: 0 }, assetId: "a1" }])).toHaveLength(1);
		expect(() => parsePdfChanges([create({ name: "t", type: "text", region: { page: 1, x: 50, y: 50, width: 0, height: 0 } })])).toThrow();
	});
	it.each([
		["a radio group", create({ name: "g", type: "radio", choices: [] })],
		["two default items in a single-choice list", create({ name: "ds", type: "listBox", region: region(), options, defaultValues: ["HN", "DN"] })],
		["a checkbox export value that is not a name", create({ name: "c", type: "checkbox", region: region(), exportValue: "a b" })],
		["a radio group with one choice", create({ name: "g", type: "radio", choices: [{ region: region(), label: "a", exportValue: "a" }] })],
		["a radio group with repeated export values", create({ name: "g", type: "radio", choices: [{ region: region(), label: "a", exportValue: "a" }, { region: region(1, 10, 20), label: "b", exportValue: "a" }] })],
		["a radio default outside the choices", create({ name: "g", type: "radio", choices: [{ region: region(), label: "a", exportValue: "a" }, { region: region(1, 10, 20), label: "b", exportValue: "b" }], defaultValue: "z" })],
		["duplicate option values", create({ name: "d", type: "dropdown", region: region(), options: [{ label: "a", value: "x" }, { label: "b", value: "x" }] })],
		["a default outside the options", create({ name: "d", type: "dropdown", region: region(), options, defaultValue: "ZZ" })],
		["filling a radio with a bad value", fill("g", "radio", "a b")],
		["a javascript link", { kind: "link", schemaVersion: 1, region: region(), target: { kind: "url", url: "javascript:alert(1)" } }],
		["a data link", { kind: "link", schemaVersion: 1, region: region(), target: { kind: "url", url: "data:text/html,x" } }],
		["a future schema", { kind: "link", schemaVersion: 2, region: region(), target: { kind: "page", page: 1 } }],
		["an asset id with a slash", { kind: "attachment", schemaVersion: 1, region: region(), assetId: "../x" }],
		["a region outside the page", create({ name: "t", type: "text", region: region(1, 90, 90, 30, 30) })],
	])("rejects %s", (_name, bad) => {
		expect(() => parsePdfChanges([bad])).toThrow();
	});
});

const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();
let dir = "";
const py = (code: string) => execFileSync("python3", ["-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], { cwd: dir, encoding: "utf8" }).trim();
const apply = (changes: unknown[], extra: object = {}, input = "in.pdf") => {
	writeFileSync(path.join(dir, "spec.json"), JSON.stringify({ changes: parsePdfChanges(changes), ...extra }));
	execFileSync("python3", ["-W", "ignore", "apply.py", input, "out.pdf", "spec.json"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
};
const failure = (changes: unknown[], input = "in.pdf") => { try { apply(changes, {}, input); return ""; } catch (error) { return String((error as { stderr?: string }).stderr); } };

describe.skipIf(!hasEngine)("P2a changes become real form fields, links and attachments", () => {
	beforeAll(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "p2-"));
		writeFileSync(path.join(dir, "apply.py"), PDF_CHANGES_PY);
		writeFileSync(path.join(dir, "worker.py"), PDF_TILE_WORKER_PY);
		writeFileSync(path.join(dir, "note.txt"), "attached text");
		py('d = fitz.open(); d.new_page(); d.new_page(); d.save("in.pdf")');
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("creates every supported field type and fills it in the same save", () => {
		apply([
			create({ name: "ten", type: "text", region: region(), defaultValue: "Nguyen", required: true, tooltip: "Ho ten", maxLength: 40 }),
			create({ name: "dongy", type: "checkbox", region: region(1, 10, 20, 4, 3) }),
			create({ name: "tinh", type: "dropdown", region: region(1, 10, 30), options, defaultValue: "HN" }),
			create({ name: "ds", type: "listBox", region: region(1, 10, 40, 30, 10), options, defaultValues: ["DN"] }),
			fill("ten", "text", "Tran Van B"), fill("dongy", "checkbox", true), fill("tinh", "dropdown", "DN"), fill("ds", "listBox", ["HN"]),
		]);
		const values = py('d = fitz.open("out.pdf"); print(sorted((w.field_name, w.field_type_string, str(w.field_value)) for w in d[0].widgets()))');
		for (const expected of ["('ten', 'Text', 'Tran Van B')", "('dongy', 'CheckBox', 'Yes')", "('tinh', 'ComboBox', 'DN')", "('ds', 'ListBox', 'HN')"]) expect(values).toContain(expected);
		expect(py('d = fitz.open("out.pdf"); print(sorted(w.field_flags & 3 for w in d[0].widgets() if w.field_name == "ten"))')).toBe("[2]");
	});
	it("keeps option labels apart from export values", () => {
		apply([create({ name: "tinh", type: "dropdown", region: region(), options, defaultValue: "HN" })]);
		expect(py('d = fitz.open("out.pdf"); print(d.xref_get_key([w for w in d[0].widgets()][0].xref, "Opt")[1])')).toContain("[");
	});
	it("lists the existing fields once per field with displayed-page regions", () => {
		apply([create({ name: "ten", type: "text", region: region(1, 10, 10, 30, 5) }), create({ name: "dongy", type: "checkbox", region: region(1, 10, 20, 4, 3) }), create({ name: "tinh", type: "dropdown", region: region(2, 10, 30), options })]);
		const reply = JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, "out.pdf"), kind: "fields" }) + "\n", encoding: "utf8" }).trim());
		expect(reply.fields.map((f: { name: string }) => f.name).sort()).toEqual(["dongy", "ten", "tinh"]);
		const ten = reply.fields.find((f: { name: string }) => f.name === "ten");
		expect(ten).toMatchObject({ type: "text", widgets: [{ region: { page: 1 } }] });
		expect(ten.widgets[0].region.x).toBeCloseTo(10, 0);
		expect(reply.fields.find((f: { name: string }) => f.name === "tinh")).toMatchObject({ type: "dropdown", options: [{ value: "HN" }, { value: "DN" }] });
		expect(reply.fields.find((f: { name: string }) => f.name === "dongy")).toMatchObject({ type: "checkbox", value: false });
	});
	it("refuses duplicates, unknown, read-only, mismatched and cleared required fields", () => {
		apply([create({ name: "ro", type: "text", region: region(), readOnly: true }), create({ name: "req", type: "text", region: region(1, 10, 20), required: true, defaultValue: "x" }), create({ name: "box", type: "checkbox", region: region(1, 10, 30, 3, 3) })]);
		py('import shutil; shutil.copy("out.pdf", "forms.pdf")');
		expect(failure([create({ name: "ro", type: "text", region: region(1, 10, 50) })], "forms.pdf")).toContain("already exists");
		expect(failure([fill("nope", "text", "x")], "forms.pdf")).toContain("not found");
		expect(failure([fill("ro", "text", "x")], "forms.pdf")).toContain("read-only");
		expect(failure([fill("box", "text", "x")], "forms.pdf")).toContain("not a Text");
		expect(failure([fill("req", "text", "  ")], "forms.pdf")).toContain("cannot be empty");
	});
	it("builds a radio group with its own states and fills it", () => {
		apply([create({ name: "gt", type: "radio", tooltip: "Gioi tinh", choices: [{ region: region(1, 10, 10, 4, 3), label: "Nam", exportValue: "nam" }, { region: region(1, 10, 20, 4, 3), label: "Nu", exportValue: "nu" }], defaultValue: "nam" }), fill("gt", "radio", "nu")]);
		const reply = () => JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, "out.pdf"), kind: "fields" }) + "\n", encoding: "utf8" }).trim());
		const group = reply().fields.find((f: { name: string }) => f.name === "gt");
		expect(group).toMatchObject({ type: "radio", value: "nu", tooltip: "Gioi tinh" });
		expect(group.widgets.map((w: { exportValue: string }) => w.exportValue)).toEqual(["nam", "nu"]);
		expect(py('d = fitz.open("out.pdf"); print(len(__import__("re").findall(r"\\d+ 0 R", d.xref_get_key(d.pdf_catalog(), "AcroForm/Fields")[1])))')).toBe("1");
		py('import shutil; shutil.copy("out.pdf", "radio.pdf")');
		apply([fill("gt", "radio", null)], {}, "radio.pdf");
		expect(reply().fields.find((f: { name: string }) => f.name === "gt").value).toBeNull();
		expect(failure([fill("gt", "radio", "khac")], "radio.pdf")).toContain("not one of the choices");
		expect(failure([fill("gt", "text", "x")], "radio.pdf")).toContain("not a Text");
	});
	it("refuses to clear a required radio and to fill a read-only one", () => {
		apply([create({ name: "r1", type: "radio", required: true, choices: [{ region: region(), label: "A", exportValue: "a" }, { region: region(1, 10, 20), label: "B", exportValue: "b" }], defaultValue: "a" }), create({ name: "r2", type: "radio", readOnly: true, choices: [{ region: region(1, 50, 10), label: "A", exportValue: "a" }, { region: region(1, 50, 20), label: "B", exportValue: "b" }] })]);
		py('import shutil; shutil.copy("out.pdf", "radio2.pdf")');
		expect(failure([fill("r1", "radio", null)], "radio2.pdf")).toContain("cannot be cleared");
		expect(failure([fill("r2", "radio", "a")], "radio2.pdf")).toContain("read-only");
	});
	it("keeps several chosen items of a multi-select list, and refuses them in a single-choice list", () => {
		apply([create({ name: "ds", type: "listBox", region: region(1, 10, 40, 30, 10), options, multiSelect: true, defaultValues: ["HN"] }), create({ name: "one", type: "listBox", region: region(1, 50, 40, 30, 10), options }), fill("ds", "listBox", ["DN", "HN"])]);
		const reply = JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, "out.pdf"), kind: "fields" }) + "\n", encoding: "utf8" }).trim());
		expect(reply.fields.find((f: { name: string }) => f.name === "ds")).toMatchObject({ multiSelect: true, value: ["DN", "HN"] });
		py('import shutil; shutil.copy("out.pdf", "multi.pdf")');
		expect(failure([fill("one", "listBox", ["HN", "DN"])], "multi.pdf")).toContain("allows one choice");
		expect(failure([fill("ds", "listBox", ["ZZ"])], "multi.pdf")).toContain("not one of the options");
	});
	it("gives a checkbox its own export value and fills it", () => {
		apply([create({ name: "ok", type: "checkbox", region: region(1, 10, 10, 4, 3), exportValue: "Dong_y" }), fill("ok", "checkbox", true)]);
		expect(py('d = fitz.open("out.pdf"); p = d[0]; w = list(p.widgets())[0]; print(w.on_state(), d.xref_get_key(w.xref, "AS")[1], str(w.field_value))')).toBe("Dong_y /Dong_y Dong_y");
		py('import shutil; shutil.copy("out.pdf", "box.pdf")');
		apply([fill("ok", "checkbox", false)], {}, "box.pdf");
		expect(py('d = fitz.open("out.pdf"); p = d[0]; w = list(p.widgets())[0]; print(w.on_state(), d.xref_get_key(w.xref, "AS")[1])')).toBe("Dong_y /Off");
	});
	it("adds web and page links and a file attachment", () => {
		apply([
			{ kind: "link", schemaVersion: 1, region: region(), target: { kind: "url", url: "https://example.com/" } },
			{ kind: "link", schemaVersion: 1, region: region(1, 10, 30), target: { kind: "page", page: 2, point: { x: 0, y: 50 } } },
			{ kind: "attachment", schemaVersion: 1, region: region(1, 50, 50), assetId: "a1" },
		], { attachments: { a1: { path: "note.txt", name: "ghi-chu.txt" } } });
		expect(py('d = fitz.open("out.pdf"); p = d[0]; print(sorted((l["kind"], l.get("uri") or l.get("page")) for l in p.get_links()), [a.type[1] for a in p.annots()])')).toBe("[(1, 1), (2, 'https://example.com/')] ['FileAttachment']");
		expect(failure([{ kind: "link", schemaVersion: 1, region: region(), target: { kind: "page", page: 9 } }])).toContain("does not exist");
		expect(failure([{ kind: "attachment", schemaVersion: 1, region: region(), assetId: "missing" }])).toContain("not available");
	});
});
