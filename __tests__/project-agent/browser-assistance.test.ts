import { afterEach, describe, expect, it, vi } from "vitest";
import { browserControlState, clearBrowserControl, requestBrowserTakeover, releaseBrowserControl, waitForBrowserHandoff } from "../../lib/project-agent/runtime/browser-agent/control";
import { parseHumanBrowserAction } from "../../lib/project-agent/runtime/browser-agent/manual";

const TASK = "pat_123456789abc";
afterEach(() => { clearBrowserControl(TASK); vi.restoreAllMocks(); });

describe("human-in-the-loop browser handback", () => {
  it("pauses model actions until human explicitly hands control back", async () => {
    const first = browserControlState(TASK).revision;
    requestBrowserTakeover(TASK);
    expect(browserControlState(TASK).paused).toBe(true);
    const release = vi.fn();
    const waiting = waitForBrowserHandoff(TASK).then(release);
    expect(release).not.toHaveBeenCalled();
    releaseBrowserControl(TASK);
    await waiting;
    expect(release).toHaveBeenCalledWith(first + 1);
    expect(browserControlState(TASK).paused).toBe(false);
  });
  it("honors task cancellation while the human is in control", async () => {
    requestBrowserTakeover(TASK);
    const abort = new AbortController();
    const awaited = waitForBrowserHandoff(TASK, abort.signal);
    abort.abort(new Error("Task stopped"));
    await expect(awaited).rejects.toThrow("Task stopped");
  });
  it("rejects malformed coordinate, key and text actions", () => {
    expect(parseHumanBrowserAction({ op: "click", x: 0.5, y: 0.3 })).toEqual({ op: "click", x: 0.5, y: 0.3 });
    expect(parseHumanBrowserAction({ op: "click", x: -1, y: 0.1 })).toBeNull();
    expect(parseHumanBrowserAction({ op: "click", x: Infinity, y: 0.1 })).toBeNull();
    expect(parseHumanBrowserAction({ op: "type", text: "a".repeat(601) })).toBeNull();
    expect(parseHumanBrowserAction({ op: "type", text: "hello" })).toEqual({ op: "type", text: "hello" });
    expect(parseHumanBrowserAction({ op: "key", key: "Ctrl+A" })).toBeNull();
    expect(parseHumanBrowserAction({ op: "key", key: "Tab" })).toEqual({ op: "key", key: "Tab" });
    expect(parseHumanBrowserAction({ op: "release" })).toEqual({ op: "release" });
  });
});
