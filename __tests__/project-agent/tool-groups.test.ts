import { describe, expect, it } from "vitest";
import { formatDisabledToolGroups } from "@/lib/project-agent/tool-groups";

describe("formatDisabledToolGroups", () => {
	it("is empty when every tool group is on", () => {
		expect(formatDisabledToolGroups(undefined)).toBe("");
		expect(formatDisabledToolGroups([])).toBe("");
		expect(formatDisabledToolGroups(["unknown"])).toBe("");
	});
	it("names the restricted groups and their tools", () => {
		const text = formatDisabledToolGroups(["web", "charts"]);
		expect(text).toContain("do NOT use Web research (DuckDuckGo search and WebScraper); Charts (ECharts to Image)");
		expect(text).not.toContain("Code and data analysis");
	});
});
