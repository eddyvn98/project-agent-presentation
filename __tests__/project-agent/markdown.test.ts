import { describe, expect, it } from "vitest";
import { createElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeProjectAgentMarkdown } from "@/components/features/projects/ProjectAgentMarkdown";

describe("Project Agent Markdown", () => {
	it("repairs a file link whose destination was emitted as nested anchor HTML", () => {
		const source = 'Download: [report.xlsx](<a href="/api/projects/p1/agent/tasks/t1/files/f1">Download report.xlsx</a>)';

		const markdown = normalizeProjectAgentMarkdown(source);
		expect(markdown).toBe("Download: [report.xlsx](/api/projects/p1/agent/tasks/t1/files/f1)");
		const rendered = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown));
		expect(rendered).toContain('<a href="/api/projects/p1/agent/tasks/t1/files/f1">report.xlsx</a>');
	});

	it("does not promote external or script URLs from malformed anchor destinations", () => {
		const source = 'Link: [report.xlsx](<a href="javascript:alert(1)">Download</a>)';

		expect(normalizeProjectAgentMarkdown(source)).toBe(source);
	});
});
