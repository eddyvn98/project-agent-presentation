import { describe, expect, it } from "vitest";
import { parsePdfAction } from "@/lib/project-agent/runtime/pdf-action";

describe("parsePdfAction new operations", () => {
	it("accepts assemble without a top-level path and keeps the page specs", () => {
		const action = parsePdfAction({ op: "assemble", parts: [{ path: "inputs/b.pdf", pages: "1-10" }, { path: "inputs/a.pdf", pages: [3, 4] }, { path: "inputs/b.pdf", pages: "11-" }] });
		expect(action).toMatchObject({ op: "assemble", path: "inputs/b.pdf" });
		expect((action as { parts: unknown[] }).parts).toHaveLength(3);
	});
	it("puts a bare out name under outputs and infers the op from its payload", () => {
		expect(parsePdfAction({ op: "info", path: "x.pdf", out: "merged.pdf" })).toMatchObject({ out: "outputs/merged.pdf" });
		expect(parsePdfAction({ op: "info", path: "x.pdf", out: "outputs/work/m.pdf" })).toMatchObject({ out: "outputs/work/m.pdf" });
		expect(parsePdfAction({ path: "x.pdf", annotations: [{ type: "highlight", page: 1, query: "a" }] })).toMatchObject({ op: "annotate" });
		expect(parsePdfAction({ parts: [{ path: "inputs/b.pdf" }] })).toMatchObject({ op: "assemble" });
	});
	it("asks for what each operation needs", () => {
		expect(parsePdfAction({ op: "assemble", path: "x.pdf" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "annotate", path: "x.pdf" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "markup", path: "x.pdf", type: "stamp" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "protect", path: "x.pdf", mode: "encrypt" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "convert", path: "x.pdf", to: "exe" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "sign", path: "x.pdf" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "replace-text", path: "x.pdf" })).toHaveProperty("error");
		expect(parsePdfAction({ op: "redact", path: "x.pdf" })).toHaveProperty("error");
	});
	it("takes the new fields", () => {
		const action = parsePdfAction({ op: "markup", path: "x.pdf", type: "bates", prefix: "ABC-", startNumber: 5 }) as { prefix: string; startNumber: number };
		expect(action.prefix).toBe("ABC-"); expect(action.startNumber).toBe(5);
		expect(parsePdfAction({ op: "convert", path: "x.docx", to: ".PDF" })).toMatchObject({ to: "pdf" });
	});
});

describe("render region", () => {
	it("accepts a zoom region in percent and rejects one outside the page", async () => {
		const { parseRuntimeAction } = await import("@/lib/project-agent/runtime/actions");
		const ok = parseRuntimeAction('{"action":"render","path":"outputs/a.pdf","pages":[2],"region":{"x":60,"y":88,"width":40,"height":12}}');
		expect(ok).toMatchObject({ action: "render", region: { x: 60, y: 88, width: 40, height: 12 } });
		expect(parseRuntimeAction('{"action":"render","path":"a.pdf","region":{"x":60,"y":88,"width":50,"height":12}}')).toHaveProperty("error");
	});
});
