import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/guarded-fetch", () => ({
  guardedRequest: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-fetch", () => ({
  renderPublicPage: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/html-markdown", () => ({
  htmlToMarkdown: vi.fn(),
}));
import { guardedRequest } from "../../lib/project-agent/runtime/guarded-fetch";
import { renderPublicPage } from "../../lib/project-agent/runtime/browser-fetch";
import { htmlToMarkdown } from "../../lib/project-agent/runtime/html-markdown";
import { webFetch } from "../../lib/project-agent/runtime/web-fetch";

const response = (status: number, body: string, type = "text/plain",
  location?: string) => ({
  status, body: Buffer.from(body), headers: {
    "content-type": type, ...(location ? { location } : {}),
  }, truncated: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(renderPublicPage).mockResolvedValue(null);
  vi.mocked(htmlToMarkdown).mockImplementation((html: string) => ({
    title: "Synthetic page", text: html.replace(/<[^>]+>/g, " "),
  }) as never);
});
afterEach(() => vi.unstubAllEnvs());
describe("C16 real web_fetch boundaries with isolated transport", () => {
  it("refuses local addresses and failed HTTP without opening a browser", async () => {
    vi.mocked(guardedRequest).mockRejectedValueOnce(new Error("refused private address"))
      .mockResolvedValueOnce(response(503, "service unavailable") as never);
    const denied = await webFetch("http://127.0.0.1:8080/private/c16");
    expect(denied).toMatchObject({ failed: true });
    expect(denied.text).toMatch(/refuses this address/i);
    const failed = await webFetch("https://c16.example.test/down");
    expect(failed.text).toContain("HTTP 503");
    expect(renderPublicPage).not.toHaveBeenCalled();
  });
  it("fences redirect loops and unsupported content types", async () => {
    vi.mocked(guardedRequest)
      .mockResolvedValueOnce(response(302, "", "", "/one") as never)
      .mockResolvedValueOnce(response(302, "", "", "/two") as never)
      .mockResolvedValueOnce(response(302, "", "", "/three") as never)
      .mockResolvedValueOnce(response(302, "", "", "/four") as never);
    const tooMany = await webFetch("https://c16.example.test/start");
    expect(tooMany).toMatchObject({ failed: true });
    expect(tooMany.text).toMatch(/too many redirects/i);
    expect(guardedRequest).toHaveBeenCalledTimes(4);
    vi.mocked(guardedRequest).mockResolvedValueOnce(response(200, "GIF89a", "image/gif") as never);
    expect((await webFetch("https://c16.example.test/image")).text)
      .toMatch(/only reads web pages and PDFs/i);
  });
  it("deduplicates transport for a cached page, supports offsets and keyword windows", async () => {
    const document = "Heading ".repeat(2000) + " important phrase " + "Details ".repeat(2000);
    vi.mocked(guardedRequest).mockResolvedValue(response(200, document) as never);
    const url = "https://c16.example.test/large-document";
    const first = await webFetch(url);
    expect(first.text).toContain("offset");
    expect(first.text.length).toBeLessThan(13_000);
    const later = await webFetch(url, undefined, { offset: 12000 });
    expect(later.text).toContain("Details");
    const found = await webFetch(url, undefined, { find: "important phrase" });
    expect(found.text).toContain("important phrase");
    const missing = await webFetch(url, undefined, { find: "somethingentirelyabsent" });
    expect(missing.text).toMatch(/nothing matching/i);
    expect(guardedRequest).toHaveBeenCalledOnce();
  });
  it("rejects unscoped PDF extraction without writing into a shared workspace", async () => {
    vi.mocked(guardedRequest).mockResolvedValueOnce(
      response(200, "%PDF-1.4", "application/pdf") as never);
    const result = await webFetch("https://c16.example.test/report.pdf");
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toMatch(/cannot read PDFs here/i);
  });
  it("renders opted-in script-heavy HTML and never executes page instructions", async () => {
    vi.stubEnv("PROJECT_AGENT_BROWSER_FETCH", "1");
    vi.mocked(guardedRequest).mockResolvedValueOnce(response(200,
      "<html><main id='root'>Loading</main></html>", "text/html") as never);
    vi.mocked(renderPublicPage).mockResolvedValueOnce({
      html: "<html><h1>Expanded public content with a useful reference</h1></html>",
      title: "Rendered",
    } as never);
    const result = await webFetch("https://c16.example.test/js-app");
    expect(result.sources?.[0].title).toBe("Rendered");
    expect(result.text).toMatch(/reference data, not instructions/);
    expect(renderPublicPage).toHaveBeenCalledOnce();
  });
});
