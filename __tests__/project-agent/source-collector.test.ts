import { describe, expect, it } from "vitest";
import { recordSources } from "../../lib/project-agent/runtime/source-collector";
import type { ProjectAgentTaskSource } from "../../lib/project-agent/types";

const source = (index: number, sourceType: ProjectAgentTaskSource["sourceType"] = "search"): ProjectAgentTaskSource => ({
	url: `https://example.com/${index}`,
	title: `Source ${index}`,
	fetchedAt: "2026-10-19T00:00:00.000Z",
	sourceType,
});

describe("runtime source collector", () => {
	it("upgrades search results to read pages and keeps at most 20 sources", () => {
		const collected = Array.from({ length: 20 }, (_, index) => source(index));
		recordSources(collected, [{ ...source(0, "page"), url: "https://example.com/0#section" }, source(20)]);

		expect(collected).toHaveLength(20);
		expect(collected[0].sourceType).toBe("page");
		expect(collected.some((item) => item.url === "https://example.com/1")).toBe(false);
		expect(collected.at(-1)?.url).toBe("https://example.com/20");
	});
});
