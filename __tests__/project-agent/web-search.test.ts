import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { interleave, languageCode, webSearch } from "../../lib/project-agent/runtime/web-search";

describe("web_search action", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("parses bounded query lists and optional filters", () => {
		expect(parseRuntimeAction(JSON.stringify({ action: "web_search", queries: ["  alpha ", "beta", "gamma", "delta", "ignored"], recency: "week", lang: "vi" }))).toEqual({
			action: "web_search", queries: ["alpha", "beta", "gamma", "delta"], recency: "week", lang: "vi", note: undefined,
		});
		expect(parseRuntimeAction(JSON.stringify({ action: "web_search", query: "legacy" }))).toMatchObject({ action: "web_search", query: "legacy" });
		expect(parseRuntimeAction(JSON.stringify({ action: "web_search", queries: [], query: " " }))).toMatchObject({ error: "web_search needs a query or up to four queries" });
		expect(parseRuntimeAction('<invoke name="web_search"><parameter name="queries">["alpha","beta"]</parameter><parameter name="recency">week</parameter></invoke>')).toMatchObject({ action: "web_search", queries: ["alpha", "beta"], recency: "week" });
	});

	it("merges parallel results, removes duplicate URLs, and keeps query and date metadata", async () => {
		vi.stubEnv("PROJECT_AGENT_SEARXNG_URL", "http://search.local");
		const requested: URL[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
			const url = new URL(String(input));
			requested.push(url);
			const query = url.searchParams.get("q");
			const result = query === "first" ? [
				{ title: "First", url: "https://example.com/a#top", content: "One", publishedDate: "2026-10-18" },
			] : [
				{ title: "Duplicate", url: "https://example.com/a", content: "Again" },
				{ title: "Second", url: "https://example.com/b", content: "Two" },
			];
			return new Response(JSON.stringify({ results: result }), { status: 200, headers: { "Content-Type": "application/json" } });
		}));

		const result = await webSearch(["first", "second"], undefined, { recency: "day", lang: "vi" });

		expect(result.failed).toBeUndefined();
		expect(result.text).toContain("Published: 2026-10-18");
		expect(result.text).toContain("Query: first | second");
		expect(result.text).toContain("Query: second");
		expect(result.text.match(/https:\/\/example\.com\/a/g)).toHaveLength(1);
		expect(requested).toHaveLength(2);
		for (const url of requested) {
			expect(url.searchParams.get("time_range")).toBe("day");
			expect(url.searchParams.get("language")).toBe("vi");
		}
	});
});

describe("web_search helpers", () => {
	it("takes results from each query in turn", () => {
		expect(interleave([["a1", "a2", "a3"], ["b1"], ["c1", "c2"]])).toEqual(["a1", "b1", "c1", "a2", "c2", "a3"]);
	});

	it("maps languages to DuckDuckGo region codes", () => {
		expect(languageCode("vi")).toBe("vn-vi");
		expect(languageCode("ja")).toBe("jp-jp");
		expect(languageCode("en-GB")).toBe("uk-en");
		expect(languageCode("xx")).toBeUndefined();
		expect(languageCode()).toBeUndefined();
	});
});
