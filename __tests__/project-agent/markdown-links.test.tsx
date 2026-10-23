// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { afterEach, describe, expect, it } from "vitest";
import { projectAgentMarkdownComponents } from "@/components/features/projects/ProjectAgentMarkdown";

afterEach(cleanup);

describe("Project Agent markdown links", () => {
	it("renders external citations as safe domain chips", async () => {
		const html = renderToStaticMarkup(createElement(ReactMarkdown, {
			components: projectAgentMarkdownComponents,
			children: "[Reuters](https://www.reuters.com/world/example)",
		}));

		expect(html).toContain('aria-label="Show source: Reuters (reuters.com)"');
		expect(html).toContain(">Reuters</span>");

		render(createElement(ReactMarkdown, {
			components: projectAgentMarkdownComponents,
			children: "[Reuters](https://www.reuters.com/world/example)",
		}));
		fireEvent.click(screen.getByRole("button", { name: "Show source: Reuters (reuters.com)" }));

		const sourceDialog = await screen.findByRole("dialog", { name: "Source details: Reuters" });
		const sourceLink = sourceDialog.querySelector("a");
		expect(sourceLink?.getAttribute("href")).toBe("https://www.reuters.com/world/example");
		expect(sourceLink?.getAttribute("target")).toBe("_blank");
		expect(sourceLink?.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("keeps project file links as ordinary in-app links", () => {
		const html = renderToStaticMarkup(createElement(ReactMarkdown, {
			components: projectAgentMarkdownComponents,
			children: "[Budget.xlsx](/api/projects/p/files/f)",
		}));

		expect(html).toContain('href="/api/projects/p/files/f"');
		expect(html).not.toContain("target=\"_blank\"");
		expect(html).not.toContain("google.com/s2/favicons");
	});
});
