import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadOfficeToolFiles, extractOfficeToolLinks, officeToolsContext } from "@/lib/project-agent/office-tools";

const ok = (name: string, url: string) => JSON.stringify({ ok: true, file: { name, url } });

afterEach(() => { vi.unstubAllEnvs(); });

describe("Office Tools integration", () => {
	it("extracts only successful create/edit calls with safe office file names", () => {
		const { links, failedCalls } = extractOfficeToolLinks([
			{ tool: "create_xlsx", observation: ok("sales.xlsx", "https://tools.example/files/a/sales.xlsx?exp=1&sig=2") },
			{ tool: "create_docx", observation: JSON.stringify({ ok: false, file: { name: "x.docx", url: "https://tools.example/f" }, issues: ["empty"] }) },
			{ tool: "create_pptx", observation: "not json" },
			{ tool: "create_pptx", observation: ok("../evil.pptx", "https://tools.example/f") },
			{ tool: "create_pptx", observation: ok("run.exe", "https://tools.example/f") },
			{ tool: "read_file", observation: ok("r.docx", "https://tools.example/f") },
		]);
		expect(links.map((link) => link.name)).toEqual(["sales.xlsx", "evil.pptx"]);
		expect(failedCalls).toBe(2);
	});

	it("downloads only from the configured service origin and only zip-based office files", async () => {
		vi.stubEnv("OFFICE_TOOLS_URL", "https://tools.example");
		const zip = new Uint8Array([0x50, 0x4b, 3, 4, 1]);
		const fetcher = vi.fn(async (url: URL | string) => new Response(String(url).includes("bad") ? new Uint8Array([1, 2, 3]) : zip)) as unknown as typeof fetch;
		const files = await downloadOfficeToolFiles([
			{ name: "good.xlsx", url: "https://tools.example/files/a/good.xlsx?sig=1" },
			{ name: "attack.xlsx", url: "https://evil.example/files/a/attack.xlsx" },
			{ name: "bad.xlsx", url: "https://tools.example/files/a/bad.xlsx" },
		], fetcher);
		expect(files.map((file) => file.name)).toEqual(["good.xlsx"]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("gives the agent a stable hashed user id and project id only when the service is configured", () => {
		expect(officeToolsContext("A@x.com", "proj_1")).toBe("");
		vi.stubEnv("OFFICE_TOOLS_URL", "https://tools.example");
		const context = officeToolsContext("A@x.com", "proj_1");
		expect(context).toContain('project_id="proj_1"');
		expect(context).toMatch(/user_id="u_[0-9a-f]{20}"/);
		expect(context).not.toContain("x.com");
		expect(officeToolsContext("a@X.com", "proj_1")).toBe(context);
	});
});
