import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-agent/runtime/sandbox", () => ({ execInSandbox: vi.fn(), workspaceDir: vi.fn(() => "/tmp/none") }));

import { htmlToMarkdown } from "@/lib/project-agent/runtime/html-markdown";

describe("htmlToMarkdown", () => {
	const html = `<html><head><title>Clause 2.2</title><script>var x=1</script></head><body><nav>Menu Home</nav>
	<main><h1>Exit width</h1><p>Minimum widths in <a href="/a/table">Table 2.2A</a>.</p>
	<table><tr><th>Use</th><th>Stairs</th></tr><tr><td>Offices</td><td>1.0 m</td></tr><tr><td colspan="2">note | pipe</td></tr></table>
	<ul><li>one</li><li>two</li></ul>${"<p>filler text for the main element to count as content.</p>".repeat(12)}</main><footer>Copyright</footer></body></html>`;

	it("keeps headings, links and tables and drops chrome", () => {
		const { title, text } = htmlToMarkdown(html, "https://example.org/x/");
		expect(title).toBe("Clause 2.2");
		expect(text).toContain("# Exit width");
		expect(text).toContain("[Table 2.2A](https://example.org/a/table)");
		expect(text).toContain("| Use | Stairs |");
		expect(text).toContain("| Offices | 1.0 m |");
		expect(text).toContain("note / pipe");
		expect(text).toContain("- one");
		expect(text).not.toMatch(/Menu Home|Copyright|var x/);
	});
});

describe("find", () => {
	it("returns the window with the most matching words first-class, not just the first mention", async () => {
		vi.resetModules();
		const filler = "alpha beta ".repeat(300);
		const body = `<html><body><main><p>Table intro width banner</p><p>${filler}</p><p>Table 2.2A lists minimum width for staircase in offices</p><p>${filler}</p></main></body></html>`;
		vi.doMock("@/lib/project-agent/runtime/guarded-fetch", () => ({
			guardedRequest: vi.fn(async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from(body), truncated: false })),
		}));
		const { webFetch } = await import("@/lib/project-agent/runtime/web-fetch");
		const result = await webFetch("http://93.184.216.34/page", undefined, { find: "Table 2.2A minimum width staircase" });
		expect(result.text).toContain("lists minimum width for staircase");
		vi.doUnmock("@/lib/project-agent/runtime/guarded-fetch");
	});
});
