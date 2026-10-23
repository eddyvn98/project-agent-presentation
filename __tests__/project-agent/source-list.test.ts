import { describe, expect, it } from "vitest";
import { citedProjectAgentSources } from "../../components/features/projects/ProjectAgentActivity";
import type { ProjectAgentTaskSource } from "../../lib/project-agent/types";

const source = (url: string, title: string): ProjectAgentTaskSource => ({
	url,
	title,
	fetchedAt: "2026-10-20T00:00:00.000Z",
	sourceType: "page",
});

describe("Project Agent source list", () => {
	it("orders de-duplicated sources by first citation and accepts angle-bracket destinations", () => {
		const sources = [source("https://example.com/one", "One"), source("https://example.com/two", "Two"), source("https://example.com/three", "Three")];
		const result = citedProjectAgentSources("Second [2](<https://example.com/two>) then [1](https://example.com/one) and [3](https://example.com/two).", sources);

		expect(result.map((item) => item.title)).toEqual(["Two", "One"]);
	});

	it("keeps URL extraction as a fallback for old tasks", () => {
		const result = citedProjectAgentSources("See [source](https://example.com/legacy).");
		expect(result).toMatchObject([{ url: "https://example.com/legacy", title: "example.com" }]);
	});
});
