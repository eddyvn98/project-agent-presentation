import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeBrowserLoopAction, browserLoopStatus, clearBrowserLoop,
  recordBrowserLoopOutcome, noteBrowserLoopTakeover, noteBrowserLoopHandback,
  closeBrowserLoop, browserLoopEnabled } from "../../lib/project-agent/runtime/browser-agent/loop-state";

const id = "pat_090909090909", other = "pat_080808080808";
afterEach(() => { clearBrowserLoop(id); clearBrowserLoop(other);
  vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("P8 bounded privacy-safe browser loop", () => {
  it("is disabled unless the operator opts in", () => {
    expect(browserLoopEnabled()).toBe(false);
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    expect(browserLoopEnabled()).toBe(true);
  });
  it("L1 report-only mode observes, warns and never blocks existing actions", () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    vi.stubEnv("PROJECT_AGENT_P8_LOOP_REPORT_ONLY", "1");
    for (let n = 0; n < 55; n++) {
      expect(authorizeBrowserLoopAction(id, "click")).toBeNull();
      recordBrowserLoopOutcome(id, "click", "unverified");
    }
    expect(browserLoopStatus(id)).toMatchObject({ phase: "needs_help", actions: 55 });
  });
  it("separates independent progress proof from an unverified tool return", () => {
    expect(authorizeBrowserLoopAction(id, "click")).toBeNull();
    recordBrowserLoopOutcome(id, "click", "unverified");
    expect(authorizeBrowserLoopAction(id, "type")).toBeNull();
    recordBrowserLoopOutcome(id, "type", "verified");
    expect(browserLoopStatus(id)).toMatchObject({
      phase: "active", actions: 2, verified: 1, unverified: 1, consecutiveUnverified: 0,
    });
  });
  it("prompts for human help after three attempts without evidence", () => {
    for (let n = 0; n < 3; n++) {
      expect(authorizeBrowserLoopAction(id, "click")).toBeNull();
      recordBrowserLoopOutcome(id, "click", "unverified");
    }
    expect(browserLoopStatus(id)?.phase).toBe("needs_help");
    expect(authorizeBrowserLoopAction(id, "click")).toMatch(/human assistance/i);
    expect(authorizeBrowserLoopAction(id, "snapshot")).toBeNull();
  });
  it("read-only observations cannot cause false no-progress escalation", () => {
    for (let n = 0; n < 10; n++) {
      expect(authorizeBrowserLoopAction(id, "snapshot")).toBeNull();
      recordBrowserLoopOutcome(id, "snapshot", "unverified");
    }
    expect(browserLoopStatus(id)).toMatchObject({
      phase: "active", actions: 0, unverified: 10, consecutiveUnverified: 0,
    });
  });
  it("takeover and handback reset no-progress streak but preserve spent budget", () => {
    authorizeBrowserLoopAction(id, "click");
    recordBrowserLoopOutcome(id, "click", "unverified");
    noteBrowserLoopTakeover(id);
    expect(browserLoopStatus(id)?.phase).toBe("human_control");
    expect(authorizeBrowserLoopAction(id, "type")).toMatch(/controlled by the user/);
    noteBrowserLoopHandback(id);
    expect(browserLoopStatus(id)).toMatchObject({
      phase: "active", actions: 1, interventions: 1, consecutiveUnverified: 0,
    });
  });
  it("does not consume the active-time budget while a user is taking over", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
    authorizeBrowserLoopAction(id, "scroll");
    noteBrowserLoopTakeover(id);
    vi.advanceTimersByTime(15 * 60_000);
    noteBrowserLoopHandback(id);
    expect(browserLoopStatus(id)?.humanWaitMs).toBe(15 * 60_000);
    expect(authorizeBrowserLoopAction(id, "click")).toBeNull();
  });
  it("hard action budget is non-negotiable and survives human handback", () => {
    for (let n = 0; n < 48; n++) {
      expect(authorizeBrowserLoopAction(id, "scroll")).toBeNull();
      recordBrowserLoopOutcome(id, "scroll", "verified");
    }
    expect(authorizeBrowserLoopAction(id, "click")).toMatch(/safety budget/i);
    noteBrowserLoopTakeover(id);
    noteBrowserLoopHandback(id);
    expect(authorizeBrowserLoopAction(id, "click")).toMatch(/safety budget/i);
  });
  it("time budget pauses mutation, but allows inspection for handback", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
    authorizeBrowserLoopAction(id, "snapshot");
    vi.advanceTimersByTime(12 * 60_000 + 1);
    expect(authorizeBrowserLoopAction(id, "click")).toMatch(/safety budget/);
    expect(authorizeBrowserLoopAction(id, "snapshot")).toBeNull();
  });
  it("exports bounded task-isolated receipts without URL, secrets or page text", () => {
    authorizeBrowserLoopAction(id, "click");
    recordBrowserLoopOutcome(id, "click", "failed");
    const copy = browserLoopStatus(id)!;
    copy.events[0].operation = "private-value";
    expect(JSON.stringify(browserLoopStatus(id))).not.toMatch(/private-value|token=|password/);
    expect(browserLoopStatus(other)).toBeNull();
  });
  it("limits event history and never keeps more than 16 entries", () => {
    for (let n = 0; n < 30; n++) recordBrowserLoopOutcome(id, "snapshot", "unverified");
    const events = browserLoopStatus(id)!.events;
    expect(events).toHaveLength(16);
    expect(events[0].sequence).toBe(15);
  });
  it("close prevents accidental reuse until task history is cleared", () => {
    authorizeBrowserLoopAction(id, "click");
    closeBrowserLoop(id);
    expect(authorizeBrowserLoopAction(id, "click")).toMatch(/closed/);
    clearBrowserLoop(id);
    expect(authorizeBrowserLoopAction(id, "click")).toBeNull();
  });
});
