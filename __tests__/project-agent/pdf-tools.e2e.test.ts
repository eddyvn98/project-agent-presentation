import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parsePdfAction, runPdfAction } from "@/lib/project-agent/runtime/pdf-action";
import { execInSandbox, stopSandbox, workspaceDir } from "@/lib/project-agent/runtime/sandbox";

// Needs Docker and the sandbox image: PDF_TOOLS_E2E=/path/a.pdf,/path/b.pdf npx vitest run __tests__/project-agent/pdf-tools.e2e.test.ts
const files = (process.env.PDF_TOOLS_E2E ?? "").split(",").filter(Boolean);
const CHAT = "pdf-tools-e2e";
const identity = { email: "user@company.com", projectId: "p" };
const act = async (raw: Record<string, unknown>) => {
	const parsed = parsePdfAction(raw);
	if ("error" in parsed) return { text: parsed.error, failed: true };
	return runPdfAction(CHAT, identity, parsed);
};
const ok = (result: { text: string; failed?: boolean }) => { expect(result.failed, result.text).toBeUndefined(); return result.text; };

describe.skipIf(files.length < 2)("pdf tools across several files", () => {
	afterAll(async () => { await stopSandbox(CHAT); await rm(workspaceDir(CHAT), { recursive: true, force: true }); });
	it("splits, inserts pages of one file into another, annotates, signs, edits text, marks up, protects, converts", async () => {
		await mkdir(path.join(workspaceDir(CHAT), "inputs"), { recursive: true });
		await copyFile(files[0], path.join(workspaceDir(CHAT), "inputs", "a.pdf"));
		await copyFile(files[1], path.join(workspaceDir(CHAT), "inputs", "b.pdf"));
		const size = async (file: string) => (await stat(path.join(workspaceDir(CHAT), file))).size;
		const t: Record<string, number> = {};
		const run = async (name: string, raw: Record<string, unknown>) => { const s = Date.now(); const result = await act(raw); t[name] = (Date.now() - s) / 1000; return ok(result); };
		expect(await run("split", { op: "assemble", parts: [{ path: "inputs/a.pdf", pages: "1-2" }], out: "outputs/a-1-2.pdf" })).toContain("2 page(s)");
		expect(await run("insert", { op: "assemble", parts: [{ path: "inputs/b.pdf", pages: "1-2" }, { path: "inputs/a.pdf", pages: "2" }, { path: "inputs/b.pdf", pages: "3-" }], out: "outputs/merged.pdf" })).toContain("part(s)");
		await run("annotate", { op: "annotate", path: "outputs/merged.pdf", annotations: [{ type: "note", page: 1, text: "check", region: { page: 1, x: 10, y: 10, width: 10, height: 5 } }, { type: "rect", page: 1, region: { page: 1, x: 20, y: 20, width: 30, height: 10 }, color: "red" }], out: "outputs/annotated.pdf" });
		await run("sign", { op: "sign", path: "outputs/annotated.pdf", region: { page: 1, x: 60, y: 80, width: 30, height: 8 }, text: "Approved by QA", out: "outputs/signed.pdf" });
		await run("watermark", { op: "markup", type: "watermark", text: "DRAFT", path: "outputs/signed.pdf", out: "outputs/wm.pdf" });
		await run("numbers", { op: "markup", type: "page-numbers", prefix: "Page ", path: "outputs/wm.pdf", out: "outputs/numbered.pdf" });
		await run("protect", { op: "protect", mode: "encrypt", password: "secret1", path: "outputs/numbered.pdf", out: "outputs/locked.pdf" });
		await run("unprotect", { op: "protect", mode: "decrypt", password: "secret1", path: "outputs/locked.pdf", out: "outputs/unlocked.pdf" });
		await run("compress", { op: "compress", path: "outputs/unlocked.pdf", out: "outputs/small.pdf" });
		expect(await run("health", { op: "health", path: "outputs/small.pdf" })).toContain("pages");
		await run("docx", { op: "convert", to: "docx", path: "outputs/small.pdf", out: "outputs/small.docx" });
		await run("back-to-pdf", { op: "convert", to: "pdf", path: "outputs/small.docx", out: "outputs/from-docx.pdf" });
		expect(await size("outputs/from-docx.pdf")).toBeGreaterThan(1000);
		const first = await act({ op: "text", path: "inputs/b.pdf", page: 1, count: 1 });
		const word = /[A-Za-zÀ-ỹ]{6,}/.exec(first.text.split("\n").slice(2).join(" "))?.[0] ?? "Deployment";
		const replaced = await run("replace-text", { op: "replace-text", path: "inputs/b.pdf", replacements: [{ find: word, replace: "REPLACED" }], out: "outputs/replaced.pdf" });
		expect(replaced).toContain("Replaced");
		expect((await act({ op: "search", path: "outputs/replaced.pdf", query: "REPLACED" })).text).toContain("page 1");
		const redacted = await run("redact", { op: "redact", path: "inputs/b.pdf", query: word, out: "outputs/redacted.pdf" });
		expect(redacted).toContain("Redacted");
		expect((await act({ op: "search", path: "outputs/redacted.pdf", query: word })).text).toContain("No page");
		await run("tables", { op: "convert", to: "xlsx", mode: "tables", path: "inputs/a.pdf", out: "outputs/tables.xlsx" }).catch(() => undefined);
		await execInSandbox(CHAT, "cd /work && openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -days 2 -subj /CN=QA >/dev/null 2>&1 && openssl pkcs12 -export -inkey k.pem -in c.pem -out outputs/qa.p12 -passout pass:qa-pass", 60);
		await run("digital-sign", { op: "sign", path: "inputs/b.pdf", region: { page: 1, x: 10, y: 10, width: 30, height: 8 }, p12: "outputs/qa.p12", password: "qa-pass", text: "QA approval", out: "outputs/digitally-signed.pdf" });
		expect((await act({ op: "health", path: "outputs/digitally-signed.pdf" })).text).toContain('"signed":true');
		const find = await act({ op: "search", path: "outputs/small.pdf", query: "DRAFT" });
		console.log("pdf tools timings (s)", JSON.stringify(t), "\n", find.text.slice(0, 160));
	}, 900_000);
});
