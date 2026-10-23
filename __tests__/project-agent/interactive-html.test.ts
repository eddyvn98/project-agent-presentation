import { describe, expect, it } from "vitest";
import { buildProjectAgentFileHeaders } from "@/lib/project-agent/files";
import { INTERACTIVE_HTML_CSP, isInteractiveHtmlName } from "@/lib/project-agent/interactive-html";

const file = (name: string) => ({ name, mimeType: "text/html", size: 10 });

describe("interactive html preview", () => {
	it("only names *.web.html as interactive", () => {
		expect(isInteractiveHtmlName("tower.web.html")).toBe(true);
		expect(isInteractiveHtmlName("report.html")).toBe(false);
	});
	it("keeps static previews script-free", () => {
		const csp = buildProjectAgentFileHeaders(file("a.html"), true)["Content-Security-Policy"];
		expect(csp).not.toContain("script-src");
	});
	it("allows scripts on an opaque origin with no outbound connections when run is requested", () => {
		const csp = buildProjectAgentFileHeaders(file("a.web.html"), true, true)["Content-Security-Policy"];
		expect(csp).toBe(INTERACTIVE_HTML_CSP);
		expect(csp).toContain("allow-scripts");
		expect(csp).not.toContain("allow-same-origin");
		expect(csp).toContain("connect-src 'none'");
	});
	it("ignores run for downloads", () => {
		expect(buildProjectAgentFileHeaders(file("a.web.html"), false, true)["Content-Security-Policy"]).toBeUndefined();
	});
});
