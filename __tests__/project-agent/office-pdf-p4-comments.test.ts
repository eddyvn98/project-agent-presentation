import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_CHANGES_PY } from "@/lib/office/pdf-changes-script";
import { parsePdfChanges } from "@/lib/office/pdf-changes-validate";
import { PDF_TILE_WORKER_PY } from "@/lib/office/pdf-tile-worker-script";

const add = (tempId: string, text = "Check this", page = 1, point = { x: 20, y: 30 }) => ({ kind: "comment.add", schemaVersion: 1, tempId, page, point, text });
const reply = (parentId: string, text = "Done", tempId?: string) => ({ kind: "comment.reply", schemaVersion: 1, parentId, text, ...(tempId ? { tempId } : {}) });
const edit = (id: string, text: string) => ({ kind: "comment.edit", schemaVersion: 1, id, text });
const resolve = (id: string, resolved: boolean) => ({ kind: "comment.resolve", schemaVersion: 1, id, resolved });
const remove = (id: string) => ({ kind: "comment.delete", schemaVersion: 1, id });

describe("P4 comment change validation", () => {
	it("accepts the five kinds", () => {
		expect(parsePdfChanges([add("t1"), reply("t1", "ok", "t2"), edit("c1", "x"), resolve("c1", true), remove("c1")])).toHaveLength(5);
	});
	it.each([
		["an empty text", add("t1", "  ")],
		["a text over the limit", add("t1", "x".repeat(5001))],
		["a point outside the page", add("t1", "a", 1, { x: 120, y: 5 })],
		["a page of zero", add("t1", "a", 0)],
		["an id with a slash", edit("../x", "a")],
		["a resolve flag that is not a boolean", { kind: "comment.resolve", schemaVersion: 1, id: "c1", resolved: "yes" }],
		["a future schema", { ...add("t1"), schemaVersion: 2 }],
	])("rejects %s", (_name, bad) => {
		expect(() => parsePdfChanges([bad])).toThrow();
	});
});

const hasEngine = (() => { try { execFileSync("python3", ["-c", "import PIL\ntry:\n import pymupdf\nexcept ImportError:\n import fitz"], { stdio: "pipe" }); return true; } catch { return false; } })();
let dir = "";
const ann = { name: "Ann", email: "ann@example.com" };
const bob = { name: "Bob", email: "bob@example.com" };
const run = (changes: unknown[], who = ann, input = "in.pdf", isOwner = false) => {
	writeFileSync(path.join(dir, "spec.json"), JSON.stringify({ changes: parsePdfChanges(changes), author: who, isOwner }));
	execFileSync("python3", ["-W", "ignore", "apply.py", input, "out.pdf", "spec.json"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
};
const failure = (changes: unknown[], who = ann, input = "in.pdf", isOwner = false) => { try { run(changes, who, input, isOwner); return ""; } catch (error) { return String((error as { stderr?: string }).stderr); } };
const py = (code: string) => execFileSync("python3", ["-c", `try:\n import pymupdf as fitz\nexcept ImportError:\n import fitz\n${code}`], { cwd: dir, encoding: "utf8" }).trim();
const list = (file = "out.pdf") => JSON.parse(execFileSync("python3", ["-W", "ignore", "worker.py"], { cwd: dir, input: JSON.stringify({ id: 1, path: path.join(dir, file), kind: "comments" }) + "\n", encoding: "utf8" }).trim()).comments as Array<{ id: string; page: number; text: string; status: string; point: { x: number; y: number }; author: { name: string }; authorEmail: string; createdAt?: string; replies: Array<{ id: string; text: string; authorEmail: string }> }>;
const keep = (name: string) => py(`import shutil; shutil.copy("out.pdf", "${name}")`);

describe.skipIf(!hasEngine)("P4 comments become real note annotations", () => {
	beforeAll(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "p4-"));
		writeFileSync(path.join(dir, "apply.py"), PDF_CHANGES_PY);
		writeFileSync(path.join(dir, "worker.py"), PDF_TILE_WORKER_PY);
		py('d = fitz.open(); d.new_page(); d.new_page(); d.save("in.pdf")');
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("adds a comment with a reply in one save and lists it back", () => {
		run([add("t1", "Check the date", 2, { x: 25, y: 40 }), reply("t1", "Fixed", "t2"), reply("t1", "Thanks")]);
		const comments = list();
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({ page: 2, text: "Check the date", status: "open", author: { name: "Ann" }, authorEmail: "ann@example.com" });
		expect(comments[0].point.x).toBeCloseTo(25, 0);
		expect(comments[0].point.y).toBeCloseTo(40, 0);
		expect(comments[0].createdAt).toMatch(/^20\d\d-/);
		expect(comments[0].replies.map((r) => r.text)).toEqual(["Fixed", "Thanks"]);
		expect(py('d = fitz.open("out.pdf"); p = d[1]; print([a.type[1] for a in p.annots()])')).toBe("['Text', 'Text', 'Text']");
	});
	it("resolves and reopens a comment", () => {
		run([add("t1")]);
		const id = list()[0].id;
		keep("c1.pdf");
		run([resolve(id, true)], bob, "c1.pdf");
		expect(list()[0].status).toBe("resolved");
		keep("c2.pdf");
		run([resolve(id, false)], bob, "c2.pdf");
		expect(list()[0].status).toBe("open");
	});
	it("lets only the author edit, and the author or the owner delete", () => {
		run([add("t1", "Mine"), reply("t1", "Reply by Ann")]);
		const id = list()[0].id;
		keep("c3.pdf");
		expect(failure([edit(id, "Hacked")], bob, "c3.pdf")).toContain("Only the author can edit");
		expect(failure([remove(id)], bob, "c3.pdf")).toContain("author or the owner");
		run([edit(id, "Edited")], ann, "c3.pdf");
		expect(list()[0].text).toBe("Edited");
		run([remove(id)], bob, "c3.pdf", true);
		expect(list()).toHaveLength(0);
		expect(py('d = fitz.open("out.pdf"); print(sum(len(list(p.annots())) for p in d))')).toBe("0");
	});
	it("refuses unknown comments, replies to replies and missing pages", () => {
		run([add("t1")]);
		const top = list()[0];
		keep("c5.pdf");
		run([reply(top.id, "r")], ann, "c5.pdf");
		const replyId = list()[0].replies[0].id;
		keep("c4.pdf");
		expect(failure([edit("nope", "x")], ann, "c4.pdf")).toContain("not found");
		expect(failure([reply(replyId, "nested")], ann, "c4.pdf")).toContain("reply to the comment itself");
		expect(failure([add("t9", "x", 9)], ann, "c4.pdf")).toContain("missing page");
	});
	it("keeps a note added by another program readable and not editable", () => {
		py('d = fitz.open(); p = d.new_page(); a = p.add_text_annot((50, 50), "From Acrobat"); a.set_info(title="Carol"); a.update(); d.save("foreign.pdf")');
		const found = list("foreign.pdf");
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ text: "From Acrobat", author: { name: "Carol" }, authorEmail: "" });
		expect(failure([edit(found[0].id, "x")], ann, "foreign.pdf")).toContain("Only the author can edit");
	});
});
