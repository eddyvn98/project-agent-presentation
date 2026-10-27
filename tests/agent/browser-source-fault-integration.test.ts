import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { verifyBrowserProgress } from "../../lib/project-agent/runtime/browser-agent/progress-checker";
import { browserRetryStalled, clearBrowserStall, recordBrowserDomFailure } from
  "../../lib/project-agent/runtime/browser-agent/stall-guard";
import { auditFinalAnswer } from "../../lib/project-agent/runtime/final-audit";
import { extractAgentSideEffects } from "../../lib/project-agent/agent-sources";
import type { Span } from "../../lib/project-agent/runtime/trace";

const task = "pat_synthetic_faults", before = { url: "https://local.test/start", snapshot: "initial" };
const action = (op: string, extra: Record<string, unknown> = {}) =>
  parseRuntimeAction(JSON.stringify({ action: "browser", op, ...extra }));
const passed = (name: string): Span => ({
  agent: "lead", kind: "action", name, ms: 1, ok: true, step: 1,
});
afterEach(() => { clearBrowserStall(task); vi.restoreAllMocks(); });

describe("deterministic browser fault injection", () => {
  it("does not mistake a missing value or navigation race for verified typing", async () => {
    const page = { url: () => before.url,
      locator: () => ({ inputValue: async () => { throw new Error("Execution context was destroyed"); } }) };
    const session = ({ page, refs: new Map([["e1", "#name"]]), lastSnapshot: before.snapshot }) as unknown as BrowserSession;
    expect(await verifyBrowserProgress(session, {
      action: "browser", op: "type", ref: "e1", text: "synthetic",
    }, before)).toEqual({ verified: false, reason: "not_observable" });
    (page as { url: () => string }).url = () => "https://local.test/redirected";
    expect(await verifyBrowserProgress(session, {
      action: "browser", op: "type", ref: "e1", text: "synthetic",
    }, before)).toEqual({ verified: true, reason: "navigation" });
  });

  it("blocks identical stalled actions, but a fresh DOM or control intervention resets the stall", () => {
    expect(recordBrowserDomFailure(task, "click", "e1", before.url, before.snapshot)).toBe(false);
    expect(recordBrowserDomFailure(task, "click", "e1", before.url, before.snapshot)).toBe(true);
    expect(browserRetryStalled(task, "click", "e1", before.url, before.snapshot)).toBe(true);
    expect(browserRetryStalled(task, "click", "e1", before.url, "changed DOM")).toBe(false);
    expect(recordBrowserDomFailure(task, "click", "e1", before.url, "changed DOM")).toBe(false);
    clearBrowserStall(task);
    expect(browserRetryStalled(task, "click", "e1", before.url, before.snapshot)).toBe(false);
  });

  it("rejects malformed browser actions across 128 reproducible generated inputs", () => {
    let seed = 173, rejected = 0;
    const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 128; i++) {
      const raw = { frame: Math.floor(random() * 16) - 4,
        x: random() * 2 - 0.5, y: random() * 2 - 0.5 };
      const result = action("visual_click", raw);
      const valid = raw.frame > 0 && raw.x >= 0 && raw.x <= 1 && raw.y >= 0 && raw.y <= 1;
      expect("error" in result).toBe(!valid);
      if (!valid) rejected++;
    }
    expect(rejected).toBeGreaterThan(40);
  });
});

describe("source and verification evidence contracts", () => {
  it("does not claim web verification or passing tests without successful tool evidence", () => {
    expect(auditFinalAnswer({ answer: "I searched the web.", trace: [], attempts: 0 }))
      .toMatch(/without browsing evidence/i);
    expect(auditFinalAnswer({ answer: "Tests all passed.", trace: [], attempts: 0 }))
      .toMatch(/without a verification tool/i);
    expect(auditFinalAnswer({ answer: "I searched the web.", trace: [passed("web_fetch")], attempts: 0 }))
      .toBeNull();
    expect(auditFinalAnswer({ answer: "Tests all passed.", trace: [passed("shell")], attempts: 0 }))
      .toBeNull();
  });

  it("strips untrusted side effect tags, refuses executable URLs and limits source writes", () => {
    const sources = Array.from({ length: 12 }, (_, i) =>
      '<project_source_add>' + JSON.stringify({
        url: "https://source.example.test/" + i, summary: "Synthetic information " + i,
      }) + '</project_source_add>').join("");
    const result = extractAgentSideEffects("Finished" + sources +
      '<project_source_add>{"url":"javascript:alert(1)","summary":"bad"}</project_source_add>');
    expect(result.sources).toHaveLength(8);
    expect(result.answer).toBe("Finished");
    expect(result.sources.every(s => s.url.startsWith("https://"))).toBe(true);
  });

  it("never crashes the model answer when a source contains a malformed URL", () => {
    const parsed = extractAgentSideEffects(
      'Done<project_source_add>{"url":"https://","summary":"Malformed"}</project_source_add>');
    expect(parsed.answer).toBe("Done");
    expect(parsed.sources).toEqual([]);
  });
});

describe("snapshot recovery and retrieved-page evidence", () => {
  it("retries read-only snapshot after a transient redirect without replaying click", async () => {
    const { snapshotAfterNavigation } = await import(
      "../../lib/project-agent/runtime/browser-agent/snapshot-after-navigation");
    const wait = vi.fn().mockResolvedValue(undefined);
    const session = { page: { waitForLoadState: wait } } as unknown as BrowserSession;
    const snapshot = vi.fn().mockRejectedValueOnce(
      new Error("Execution context was destroyed")).mockResolvedValue("new DOM");
    expect(await snapshotAfterNavigation(session, snapshot)).toBe("new DOM");
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
  it("does not retry non-navigation errors or retry indefinitely", async () => {
    const { snapshotAfterNavigation } = await import(
      "../../lib/project-agent/runtime/browser-agent/snapshot-after-navigation");
    const session = { page: { waitForLoadState: async () => {} } } as unknown as BrowserSession;
    const denied = vi.fn().mockRejectedValue(new Error("Permission denied"));
    await expect(snapshotAfterNavigation(session, denied)).rejects.toThrow("Permission denied");
    expect(denied).toHaveBeenCalledTimes(1);
    const broken = vi.fn().mockRejectedValue(new Error("frame was detached"));
    await expect(snapshotAfterNavigation(session, broken)).rejects.toThrow();
    expect(broken).toHaveBeenCalledTimes(3);
  });
  it("cites only fetched pages, not search hits, and rejects unsafe source metadata", async () => {
    const { appendRetrievedSources } = await import(
      "../../lib/project-agent/runtime/retrieved-sources");
    const sources = [
      { url: "https://valid.test/report", title: "Annual [report]", sourceType: "page", fetchedAt: "2026-01-01" },
      { url: "https://search.test/a", title: "Snippet", sourceType: "search", fetchedAt: "2026-01-01" },
      { url: "https://name:secret@invalid.test/", title: "Credentials", sourceType: "page", fetchedAt: "2026-01-01" },
    ] as Parameters<typeof appendRetrievedSources>[1];
    const answer = appendRetrievedSources("Summary", sources);
    expect(answer).toContain("https://valid.test/report");
    expect(answer).not.toContain("https://search.test/a");
    expect(answer).not.toContain("invalid.test");
    expect(appendRetrievedSources(answer, sources)).toBe(answer);
  });
});
