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
    const session = ({ page, refs: new Map([["e1", "#name"]]), lastSnapshot: before.snapshot })
      as unknown as BrowserSession;
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
