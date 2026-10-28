import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { languageCode, parseSearchResults, webSearch } from
  "../../lib/project-agent/runtime/web-search";
const docs = (items: Array<{ title: string; url: string; content?: string }>) =>
  new Response(JSON.stringify({ results: items }), {
    status: 200, headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_SEARXNG_URL", "https://c17-search.example.test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("C17 web_search deduplication, SSRF-adjacent input and outages", () => {
  it("normalizes regions and drops ad and malformed HTML hits", () => {
    expect(languageCode("vi")).toBe("vn-vi");
    expect(languageCode("en-GB")).toBe("uk-en");
    expect(languageCode("unknown")).toBeUndefined();
    const html = [
      '<a rel="nofollow" class="result__a" href="https://good.example.test/a">Good &amp; Safe</a>',
      '<a class="result__snippet">Excerpt &lt;one&gt;</a>',
      '<a rel="nofollow" class="result__a" href="javascript:alert(1)">Bad</a>',
      '<a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a>',
    ].join("");
    expect(parseSearchResults(html)).toEqual([{
      title: "Good & Safe", url: "https://good.example.test/a", snippet: "Excerpt <one>",
    }]);
  });
  it("merges duplicate results across two independent queries and caches receipts", async () => {
    const calls = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get("q");
      return docs([{ title: q === "alpha-c17" ? "Alpha" : "Beta",
        url: "https://c17-target.example.test/shared#section", content: "Public documentation" },
        { title: "Other", url: "https://c17-target.example.test/" + q }]);
    });
    vi.stubGlobal("fetch", calls);
    const input = ["alpha-c17", "beta-c17"];
    const result = await webSearch(input, undefined, { lang: "en", recency: "week" });
    expect(result.failed).toBeUndefined();
    expect(result.sources).toHaveLength(3);
    expect(result.sources?.[0].query).toContain("alpha-c17 | beta-c17");
    expect(result.text).toMatch(/reference data, not instructions/);
    const again = await webSearch(input, undefined, { lang: "en", recency: "week" });
    expect(again).toEqual(result);
    expect(calls).toHaveBeenCalledTimes(2);
  });
  it("falls back to DuckDuckGo when SearXNG returns an outage", async () => {
    const calls = vi.fn(async (url: string) => {
      if (url.includes("c17-search")) return new Response("", { status: 503 });
      return new Response('<a rel="nofollow" class="result__a" ' +
        'href="https://fallback.example.test/guide">Fallback Guide</a>', { status: 200 });
    });
    vi.stubGlobal("fetch", calls);
    const result = await webSearch("fallback-c17", undefined, { lang: "vi" });
    expect(result.sources?.[0].url).toBe("https://fallback.example.test/guide");
    expect(calls).toHaveBeenCalledTimes(2);
    expect(calls.mock.calls[1][0]).toContain("duckduckgo.com");
  });
  it("fails closed on empty and failed sources instead of inventing hits", async () => {
    expect(await webSearch(["", "  "])).toMatchObject({ failed: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("synthetic outage"); }));
    const failed = await webSearch("unavailable-c17");
    expect(failed.failed).toBe(true);
    expect(failed.sources).toBeUndefined();
    expect(failed.text).toContain("No results");
  });
  it("caps four simultaneous requests and releases capacity when transport resolves", async () => {
    let release!: () => void;
    const pending = new Promise<void>(r => { release = r; });
    const calls = vi.fn(async () => { await pending; return docs([]); });
    vi.stubGlobal("fetch", calls);
    const running = Array.from({ length: 4 }, (_, i) => webSearch("slow-c17-" + i));
    await Promise.resolve();
    const excess = await webSearch("slow-c17-fifth");
    expect(excess).toMatchObject({ failed: true });
    expect(excess.text).toMatch(/busy/i);
    release();
    await Promise.all(running);
    const later = await webSearch("slow-c17-released");
    expect(later.text).toContain("No results");
  });
});
