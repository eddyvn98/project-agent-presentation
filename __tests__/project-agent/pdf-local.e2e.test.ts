import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parsePdfAction, runPdfAction } from "@/lib/project-agent/runtime/pdf-action";
import { stopSandbox, workspaceDir } from "@/lib/project-agent/runtime/sandbox";

// Needs Docker and the sandbox image: PDF_LOCAL_E2E=/path/to/a.pdf[,/path/to/b.pdf] npx vitest run __tests__/project-agent/pdf-local.e2e.test.ts
const files = (process.env.PDF_LOCAL_E2E ?? "").split(",").filter(Boolean);
const CHAT = "pdf-local-e2e";
const identity = { email: "user@company.com", projectId: "p" };
const act = (raw: Record<string, unknown>) => runPdfAction(CHAT, identity, parsePdfAction(raw) as never);

describe.skipIf(files.length === 0)("pdf action in the sandbox", () => {
	afterAll(async () => { await stopSandbox(CHAT); await rm(workspaceDir(CHAT), { recursive: true, force: true }); });
	it("reads, searches, renders, edits and compares real files", async () => {
		await mkdir(path.join(workspaceDir(CHAT), "inputs"), { recursive: true });
		await copyFile(files[0], path.join(workspaceDir(CHAT), "inputs", "a.pdf"));
		await copyFile(files[1] ?? files[0], path.join(workspaceDir(CHAT), "inputs", "b.pdf"));
		const timings: Record<string, number> = {};
		const timed = async (name: string, raw: Record<string, unknown>) => { const t = Date.now(); const result = await act(raw); timings[name] = (Date.now() - t) / 1000; return result; };
		const info = await timed("info", { op: "info", path: "inputs/a.pdf" });
		expect(info.failed).toBeUndefined(); expect(info.text).toContain("pages");
		const text = await timed("text", { op: "text", path: "inputs/a.pdf", page: 1, count: 2 });
		expect(text.text).toContain("--- page 1 ---");
		const search = await timed("search", { op: "search", path: "inputs/a.pdf", query: "kien truc" });
		expect(search.failed).toBeUndefined();
		const images = await timed("images", { op: "images", path: "inputs/a.pdf", pages: [1], dpi: 72 });
		expect(images.text).toContain("Rendered 1 page image");
		const rotate = await timed("rotate", { op: "edit", path: "inputs/a.pdf", type: "rotate", pages: [1], degrees: 90 });
		expect(rotate.text).toContain("done");
		const mark = await timed("mark", { op: "edit", path: "inputs/a.pdf", type: "mark-region", region: { page: 1, x: 10, y: 10, width: 20, height: 5 }, note: "check" });
		expect(mark.text).toContain("done");
		const del = await timed("delete", { op: "edit", path: "inputs/a.pdf", type: "delete", pages: [2] });
		expect(del.text).toContain("done");
		expect((await stat(path.join(workspaceDir(CHAT), "outputs", "a-rotate.pdf"))).size).toBeGreaterThan(1000);
		const compare = await timed("compare", { op: "compare", path: "inputs/a.pdf", other: "outputs/a-delete.pdf" });
		expect(compare.text).not.toContain("failed");
		console.log("pdf-local timings (s)", JSON.stringify(timings), "\n", search.text.slice(0, 200), "\n", compare.text.slice(0, 200));
	}, 600_000);
});
