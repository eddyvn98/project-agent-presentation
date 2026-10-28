import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  writeProjectAgentFile: m.write,
}));
import {
  buildProjectAgentFileHeaders, cacheDifyGeneratedFiles,
  findDifyGeneratedFileLinks, findDifyGeneratedFileLinksWithoutInlineDuplicates,
  hasUnreachableDifySandboxFileLink, inferProjectAgentFileMetadata,
  inferProjectAgentFileMimeType, safeFileName, stripNoLinkClaims,
} from "../../lib/project-agent/files";

const origin = "https://dify.example.test";
const source = origin + "/files/tools/synthetic-output?sign=synthetic";
const task = "pat_012345abcdef", project = "qa-project";
beforeEach(() => {
  vi.restoreAllMocks();
  m.write.mockReset();
  m.write.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe("Agent-generated file source, MIME and download boundaries", () => {
  it("accepts only same-origin tool file paths, ignoring lookalikes and external hosts", () => {
    const text = [
      "[Report.pdf](" + source + ")",
      "https://evil.example.test/files/tools/synthetic-output?sign=x",
      origin + "/files/tools/synthetic-output/more?sign=x",
      origin + "/files/tool/other?sign=x",
      origin + "/files/tools/%2e%2e?sign=x",
      source,
    ].join("\n");
    const links = findDifyGeneratedFileLinks(text, origin);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe(source);
    expect(links[0].label).toBe("Report.pdf");
  });
  it("deduplicates against inline output and detects leaked task-local URLs", () => {
    const text = "[Report.pdf](" + source + ")";
    expect(findDifyGeneratedFileLinksWithoutInlineDuplicates(text, origin, [
      { name: "nested/REPORT.PDF", bytes: new Uint8Array([1]) },
    ])).toEqual([]);
    expect(hasUnreachableDifySandboxFileLink(
      "http://127.0.0.1:8000/files/" + task + "/secret.pdf", origin)).toBe(true);
    expect(hasUnreachableDifySandboxFileLink(
      origin + "/files/" + task + "/secret.pdf", origin)).toBe(false);
  });
  it("normalizes labels, detects signatures and refuses active SVG preview", () => {
    expect(safeFileName("Download chart: weekly.pdf", source)).toBe("weekly.pdf");
    expect(inferProjectAgentFileMimeType("report.csv", "text/plain; charset=utf-8"))
      .toBe("text/csv");
    expect(inferProjectAgentFileMetadata("attachment.bin", "application/octet-stream",
      new TextEncoder().encode("%PDF-1.7 synthetic"))).toEqual({
      name: "attachment.pdf", mimeType: "application/pdf",
    });
    const html = buildProjectAgentFileHeaders({
      name: "Preview.html", mimeType: "text/html", size: 12,
    }, true);
    expect(html["Content-Disposition"]).toContain("inline;");
    expect(html["Content-Security-Policy"]).toBeTruthy();
    expect(html["X-Content-Type-Options"]).toBe("nosniff");
    expect(html["Cache-Control"]).toBe("private, no-store");
    const svg = buildProjectAgentFileHeaders({
      name: "unsafe.svg", mimeType: "image/svg+xml", size: 10,
    }, true);
    expect(svg["Content-Disposition"]).toContain("attachment;");
    expect(buildProjectAgentFileHeaders({
      name: "Preview.html", mimeType: "text/html", size: 12,
    }, false)["Content-Disposition"]).toContain("attachment;");
  });
  it("refuses unsigned download links before any network or persistence", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(cacheDifyGeneratedFiles(
      "[Report.pdf](" + origin + "/files/tools/unsigned)", task,
      project, origin + "/v1", "api-key",
    )).rejects.toThrow(/unsigned file link/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("fails closed on redirects and declared oversize files", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302,
        headers: { location: "https://evil.example.test/" } }))
      .mockResolvedValueOnce(new Response("too large", { status: 200,
        headers: { "content-length": String(21 * 1024 * 1024) } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(cacheDifyGeneratedFiles("[Report.pdf](" + source + ")",
      task, project, origin + "/v1", "api-key")).rejects.toThrow(/HTTP 302/);
    await expect(cacheDifyGeneratedFiles("[Report.pdf](" + source + ")",
      task, project, origin + "/v1", "api-key")).rejects.toThrow(/download limit/);
    expect(m.write).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      redirect: "manual", cache: "no-store",
      headers: { Authorization: "Bearer api-key" },
    });
  });
  it("stores same-origin signed bytes and rewrites public response links", async () => {
    const fetchMock = vi.fn(async () => new Response("%PDF-1.7 synthetic",
      { status: 200, headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await cacheDifyGeneratedFiles(
      "Here: [Report.pdf](" + source + ")",
      task, project, origin + "/v1", "test-api",
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      name: "Report.pdf", mimeType: "application/pdf",
    });
    expect(m.write).toHaveBeenCalledOnce();
    expect(m.write.mock.calls[0][0]).toBe(task);
    expect(result.resultText).not.toContain(source);
    expect(result.resultText).toContain("/agent/tasks/" + task + "/files/");
  });
  it("persists inline files separately from already-stored board resources", async () => {
    const result = await cacheDifyGeneratedFiles(
      "I cannot provide a download link. Ready.", task, project, origin + "/v1",
      "test-api", [
        { name: "nested/answer.txt", bytes: new TextEncoder().encode("safe output") },
        { name: "existing.pdf", bytes: new Uint8Array(),
          resource: { boardId: "board-qa", resourceId: "r-qa", size: 300 } },
      ]);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({ name: "answer.txt", mimeType: "text/plain" });
    expect(result.files[1]).toMatchObject({
      name: "existing.pdf",
      resource: { boardId: "board-qa", resourceId: "r-qa", size: 300 },
    });
    expect(m.write).toHaveBeenCalledOnce();
    expect(result.resultText).toBe("Ready.");
    expect(stripNoLinkClaims("I cannot provide a download link. Ready.")).toBe("Ready.");
  });
});
