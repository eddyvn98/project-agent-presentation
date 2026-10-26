import { afterEach, describe, expect, it } from "vitest";
import { clearProjectBrowserControl, projectBrowserControl, releaseProjectBrowser,
  takeProjectBrowser, waitForProjectBrowser, keepProjectBrowser } from "../../lib/project-agent/runtime/browser-agent/project-control";

const id = "pb_123456789abcdef0123456789abcdef0";
afterEach(() => clearProjectBrowserControl(id));
describe("Project browser manual takeover", () => {
  it("blocks Agent until explicit handback", async () => {
    takeProjectBrowser(id);
    expect(projectBrowserControl(id).paused).toBe(true);
    const waiting = waitForProjectBrowser(id);
    let finished = false;
    void waiting.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    releaseProjectBrowser(id);
    await waiting;
    expect(projectBrowserControl(id).paused).toBe(false);
  });
  it("increments revision and extends a live manual lease", () => {
    const old = projectBrowserControl(id).revision;
    takeProjectBrowser(id);
    keepProjectBrowser(id);
    expect(projectBrowserControl(id).revision).toBe(old + 1);
    releaseProjectBrowser(id);
    expect(projectBrowserControl(id).revision).toBe(old + 2);
  });
  it("cancels a pending Agent wait on Stop", async () => {
    takeProjectBrowser(id);
    const abort = new AbortController();
    const wait = waitForProjectBrowser(id, abort.signal);
    abort.abort(new Error("Task stopped"));
    await expect(wait).rejects.toThrow("Task stopped");
  });
});
