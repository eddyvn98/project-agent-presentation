import { describe, expect, it } from "vitest";
import { readP8LoopCounters } from "../../lib/project-agent/p8-loop-metrics";
import { finalizeP8BrowserLoop } from "../../lib/project-agent/runtime/browser-agent/loop-finalize";
import { authorizeBrowserLoopAction, recordBrowserLoopOutcome,
  browserLoopStatus, clearBrowserLoop } from "../../lib/project-agent/runtime/browser-agent/loop-state";

const task = "pat_aabbccddeeff";
describe("P8 durable numeric receipt hook", () => {
  it("ignores malformed log entries and parses only bounded metrics", () => {
    expect(readP8LoopCounters(["user wrote actions=999999"])).toMatchObject({ actions: 0 });
    expect(readP8LoopCounters([
      "2026-10-25 using tool p8_loop_metrics :: actions=8 verified=5 unverified=2 failed=1 blocked=0 interventions=1",
    ])).toEqual({ actions: 8, verified: 5, unverified: 2,
      failed: 1, blocked: 0, interventions: 1 });
  });
  it("reports zero for absent metrics and caps implausible values", () => {
    expect(readP8LoopCounters([]).verified).toBe(0);
    expect(readP8LoopCounters([
      "using tool p8_loop_metrics :: actions=99999999999999999999",
    ]).actions).toBe(0);
    expect(readP8LoopCounters([
      "using tool p8_loop_metrics :: actions=15000",
    ]).actions).toBe(10000);
  });
  it("finalizes an opt-in browser task and emits a sanitized counter receipt", () => {
    const original = process.env.PROJECT_AGENT_P8_LOOP;
    process.env.PROJECT_AGENT_P8_LOOP = "1";
    try {
      authorizeBrowserLoopAction(task, "click");
      recordBrowserLoopOutcome(task, "click", "verified");
      const events: Array<{ tool: string; detail: string }> = [];
      finalizeP8BrowserLoop(task, (event) => events.push(event));
      expect(browserLoopStatus(task)?.phase).toBe("closed");
      expect(events[0]).toMatchObject({ tool: "p8_loop_metrics" });
      expect(events[0].detail).toContain("verified=1");
      expect(events[0].detail).not.toContain("https");
    } finally {
      clearBrowserLoop(task);
      if (original === undefined) delete process.env.PROJECT_AGENT_P8_LOOP;
      else process.env.PROJECT_AGENT_P8_LOOP = original;
    }
  });
});
