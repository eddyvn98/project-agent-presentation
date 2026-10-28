import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const m = vi.hoisted(() => ({
  request: vi.fn(), resolve: vi.fn(), local: vi.fn(),
}));
vi.mock("../../lib/project-agent/tpdf-ocr-client", () => ({ request: m.request }));
vi.mock("../../lib/project-agent/runtime/sandbox", () => ({
  resolveWorkspacePath: m.resolve,
}));
vi.mock("../../lib/project-agent/runtime/pdf-local", () => ({
  runLocalPdfAction: m.local,
}));
import { parsePdfAction, pdfConfigured, runPdfAction, runPdfForTask,
  useTpdfService } from "../../lib/project-agent/runtime/pdf-action";
const identity = { email: "owner@example.test", projectId: "project-qa" };
let root: string;
const response = (value: object, status = 200) =>
  new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(os.tmpdir(), "qa-pdf-"));
  await writeFile(path.join(root, "source.pdf"), Buffer.from("%PDF-1.4 synthetic source"));
  m.resolve.mockImplementation((_chat: string, relative: string) =>
    path.join(root, relative));
  m.local.mockResolvedValue({ text: "Local PDF result" });
  vi.stubEnv("PROJECT_AGENT_PDF_ENGINE", "tpdf");
  vi.stubEnv("TPDF_AGENT_WEB_BASE_URL", "https://pdf.example.test");
  vi.stubEnv("TPDF_AGENT_WEB_BRIDGE_SECRET", "synthetic-only");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
describe("PDF Action parsing and service authority", () => {
  it("denies malformed actions before touching service or disk", () => {
    const bad = [
      { op: "search", path: "source.pdf" },
      { op: "compare", path: "source.pdf" },
      { op: "edit", path: "source.pdf", type: "invalid" },
      { op: "convert", path: "source.pdf", to: "exe" },
      { op: "markup", path: "source.pdf", type: "unknown" },
      { op: "redact", path: "source.pdf" },
      { op: "protect", path: "source.pdf", mode: "encrypt" },
      { op: "assemble", path: "source.pdf", parts: [] },
      { op: "annotate", path: "source.pdf", annotations: [] },
      { op: "sign", path: "source.pdf" },
      { op: "replace-text", path: "source.pdf", replacements: [] },
      { op: "launch", path: "source.pdf" },
    ];
    for (const value of bad) expect(parsePdfAction(value)).toHaveProperty("error");
    expect(m.request).not.toHaveBeenCalled();
  });
  it("infers structured operations, normalizes output and bounds arrays", () => {
    const parsed = parsePdfAction({
      path: "source.pdf", replacements: Array.from({ length: 150 },
        (_, i) => ({ find: "old-" + i, replace: "new" })),
      pages: [1, 0, -1, 2, "3", "bad"], out: "new.pdf",
      note: "x".repeat(300),
    });
    expect(parsed).toMatchObject({ action: "pdf", op: "replace-text",
      pages: [1, 2, 3], out: "outputs/new.pdf" });
    if ("error" in parsed) throw Error(parsed.error);
    expect(parsed.replacements).toHaveLength(100);
    expect(parsed.note).toHaveLength(200);
    expect(parsePdfAction({ op: "assemble", parts: [{ path: "source.pdf" }] }))
      .toMatchObject({ op: "assemble", path: "source.pdf" });
  });
  it("defaults to isolated local tools without a configured TPDF service", async () => {
    vi.stubEnv("PROJECT_AGENT_PDF_ENGINE", "local");
    expect(useTpdfService()).toBe(false);
    expect(await runPdfAction("qa", identity, {
      action: "pdf", op: "info", path: "source.pdf",
    })).toEqual({ text: "Local PDF result" });
    expect(m.local).toHaveBeenCalledOnce();
    expect(m.request).not.toHaveBeenCalled();
    vi.stubEnv("TPDF_AGENT_WEB_BRIDGE_SECRET", "");
    expect(pdfConfigured()).toBe(false);
  });
  it("refuses reviewer edits before routing and refuses unsigned TPDF requests", async () => {
    const edit = { action: "pdf" as const, op: "edit" as const,
      path: "source.pdf", type: "rotate" };
    expect(await runPdfAction("qa", identity, edit, undefined, true))
      .toMatchObject({ failed: true });
    expect(m.local).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
    expect(await runPdfForTask({ chatId: "qa" }, {
      action: "pdf", op: "info", path: "source.pdf",
    })).toMatchObject({ failed: true });
  });
  it("uploads a single PDF and reads bounded page text from the owner service", async () => {
    m.request.mockImplementation(async (_id: unknown, endpoint: string) => {
      if (endpoint.includes("/documents?name=")) return response({
        document: { id: "doc-qa" },
      });
      if (endpoint.endsWith("/text?page=2&count=25")) return response({
        pageCount: 55, pages: [{ page: 2, text: "untrusted document text" }],
      });
      throw Error("Unexpected TPDF endpoint " + endpoint);
    });
    const receipt = await runPdfForTask({ chatId: "qa", ...{
      ownerEmail: identity.email, projectId: identity.projectId },
      onStep: vi.fn(),
    }, { action: "pdf", op: "text", path: "source.pdf", page: 2, count: 99 });
    expect(receipt.text).toContain("untrusted document content");
    expect(receipt.text).toContain("page 2");
    expect(m.request).toHaveBeenCalledTimes(2);
    expect(m.local).not.toHaveBeenCalled();
  });
  it("reports remote upload errors without leaking or fabricating a saved result", async () => {
    m.request.mockResolvedValue(response({ error: "remote service unavailable" }, 503));
    const result = await runPdfAction("qa", identity, {
      action: "pdf", op: "info", path: "source.pdf",
    });
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toContain("remote service unavailable");
    expect(result.text).toContain("Fall back to the sandbox");
    expect(m.local).not.toHaveBeenCalled();
  });
  it("reports OCR failure instead of declaring a searchable PDF produced", async () => {
    m.request.mockImplementation(async (_id: unknown, endpoint: string) => {
      if (endpoint.includes("/documents?name=")) return response({ document: { id: "doc-ocr" } });
      if (endpoint.endsWith("/ocr")) return response({ jobId: "job-ocr" });
      if (endpoint.includes("/ocr/jobs/job-ocr")) return response({
        status: "failed", error: "synthetic empty scan",
      });
      throw Error("Unexpected endpoint " + endpoint);
    });
    const result = await runPdfAction("qa-ocr", identity, {
      action: "pdf", op: "ocr", path: "source.pdf",
    });
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toMatch(/OCR failed/);
    expect(m.request).toHaveBeenCalledTimes(3);
  });
  it("uses sandbox implementation for unsupported TPDF operations", async () => {
    expect(useTpdfService()).toBe(true);
    expect(await runPdfAction("qa", identity, {
      action: "pdf", op: "redact", path: "source.pdf", query: "secret",
    })).toEqual({ text: "Local PDF result" });
    expect(m.local).toHaveBeenCalledOnce();
    expect(m.request).not.toHaveBeenCalled();
  });
});
