import { afterEach, describe, expect, it, vi } from "vitest";
import { beginBrowserIntervention, browserControlState, claimHumanBrowserAction, clearBrowserControl, completeBrowserIntervention, notifyBrowserIntervention, releaseBrowserControl, waitForBrowserHandoff, waitForBrowserIntervention, waitForBrowserInterventionIdle, waitForBrowserTakeover } from "../../lib/project-agent/runtime/browser-agent/control";
import { parseHumanBrowserAction } from "../../lib/project-agent/runtime/browser-agent/manual";

const TASK = "pat_123456789abc";
afterEach(() => { clearBrowserControl(TASK); vi.restoreAllMocks(); });

describe("shared live browser control", () => {
  it("invalidates stale model plans without pausing the Agent", async () => {
    const first = browserControlState(TASK).revision;
    const waiting = waitForBrowserIntervention(TASK, first);
    expect(claimHumanBrowserAction(TASK)).toBe(true);
    notifyBrowserIntervention(TASK);
    await expect(waiting).resolves.toBe(first + 1);
    expect(browserControlState(TASK).paused).toBe(false);
    await expect(waitForBrowserHandoff(TASK)).resolves.toBe(first + 1);
  });
  it("keeps the legacy release call from changing shared browser ownership", async () => {
    notifyBrowserIntervention(TASK);
    const revision = browserControlState(TASK).revision;
    releaseBrowserControl(TASK);
    expect(browserControlState(TASK)).toEqual({ paused: false, revision });
  });
  it("interrupts an Agent browser wait after a user action", async () => {
    const waiting = waitForBrowserTakeover(TASK);
    notifyBrowserIntervention(TASK);
    await expect(waiting).resolves.toBeUndefined();
  });
  it("honors task cancellation while waiting for user intervention", async () => {
    const abort = new AbortController();
    const awaited = waitForBrowserIntervention(TASK, browserControlState(TASK).revision, abort.signal);
    abort.abort(new Error("Task stopped"));
    await expect(awaited).rejects.toThrow("Task stopped");
  });
  it("waits for queued user actions and a quiet typing interval before Agent resumes", async () => {
    beginBrowserIntervention(TASK);
    const idle = waitForBrowserInterventionIdle(TASK, 10);
    completeBrowserIntervention(TASK);
    await expect(idle).resolves.toBeUndefined();
  });
  it("does not wait for a handback after an intervention", async () => {
    notifyBrowserIntervention(TASK);
    const abort = new AbortController();
    const awaited = waitForBrowserHandoff(TASK, abort.signal);
    abort.abort(new Error("Task stopped"));
    await expect(awaited).resolves.toBe(browserControlState(TASK).revision);
  });
  it("rejects malformed coordinate, key and text actions", () => {
    expect(parseHumanBrowserAction({ op: "click", x: 0.5, y: 0.3 })).toEqual({ op: "click", x: 0.5, y: 0.3 });
    expect(parseHumanBrowserAction({ op: "click", x: -1, y: 0.1 })).toBeNull();
    expect(parseHumanBrowserAction({ op: "click", x: Infinity, y: 0.1 })).toBeNull();
    expect(parseHumanBrowserAction({ op: "type", text: "a".repeat(601) })).toBeNull();
    expect(parseHumanBrowserAction({ op: "type", text: "hello" })).toEqual({ op: "type", text: "hello" });
    expect(parseHumanBrowserAction({ op: "key", key: "Ctrl+A" })).toBeNull();
    expect(parseHumanBrowserAction({ op: "key", key: "Tab" })).toEqual({ op: "key", key: "Tab" });
    expect(parseHumanBrowserAction({ op: "key", key: "Enter" })).toEqual({ op: "key", key: "Enter" });
    expect(parseHumanBrowserAction({ op: "release" })).toEqual({ op: "release" });
  });
});
