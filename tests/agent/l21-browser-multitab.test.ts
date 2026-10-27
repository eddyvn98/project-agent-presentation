import { afterEach, describe, expect, it } from "vitest";
import { BrowserSlotPool } from "../../lib/project-agent/runtime/browser-agent/slot-pool";
import { browserControlState, takeBrowserControl, releaseBrowserControl,
  notifyBrowserIntervention, waitForBrowserHandoff, waitForBrowserIntervention,
  clearBrowserControl, claimHumanBrowserAction, keepBrowserControl }
  from "../../lib/project-agent/runtime/browser-agent/control";

const scope = "pat_009988776655";
afterEach(() => clearBrowserControl(scope));
describe("L21 multi-tab browser and bounded manual takeover", () => {
  it("fairly admits queued browser tabs and never leaks active slots", async () => {
    const pool = new BrowserSlotPool(2, 500);
    const a = await pool.acquire(), b = await pool.acquire();
    const order: string[] = [];
    const pendingC = pool.acquire().then(release => { order.push("c"); return release; });
    const pendingD = pool.acquire().then(release => { order.push("d"); return release; });
    expect(pool.active).toBe(2);
    expect(pool.waiting).toBe(2);
    a();
    const c = await pendingC;
    expect(order).toEqual(["c"]);
    expect(pool.waiting).toBe(1);
    b();
    const d = await pendingD;
    expect(order).toEqual(["c", "d"]);
    c(); d(); c(); d();
    expect(pool.active).toBe(0);
    expect(pool.waiting).toBe(0);
  });
  it("aborted waiting tab is removed without blocking later handoff", async () => {
    const pool = new BrowserSlotPool(1, 500);
    const releaseA = await pool.acquire();
    const controller = new AbortController();
    const abandoned = pool.acquire(controller.signal);
    const waiting = pool.acquire();
    controller.abort();
    await expect(abandoned).rejects.toThrow(/stopped/);
    expect(pool.waiting).toBe(1);
    releaseA();
    const releaseB = await waiting;
    releaseB();
    expect(pool.active).toBe(0);
  });
  it("requires handback before agent continues and invalidates stale page references", async () => {
    const before = browserControlState(scope).revision;
    takeBrowserControl(scope);
    expect(browserControlState(scope).paused).toBe(true);
    expect(keepBrowserControl(scope)).toBe(true);
    let finished = false;
    const awaiting = waitForBrowserHandoff(scope).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    notifyBrowserIntervention(scope);
    expect(browserControlState(scope).revision).toBeGreaterThan(before);
    releaseBrowserControl(scope);
    await awaiting;
    expect(finished).toBe(true);
    expect(browserControlState(scope).paused).toBe(false);
  });
  it("cancels a waiting agent on Stop without leaving a listener", async () => {
    takeBrowserControl(scope);
    const controller = new AbortController();
    const waiting = waitForBrowserHandoff(scope, controller.signal);
    controller.abort(new Error("Stopped"));
    await expect(waiting).rejects.toThrow(/Stopped/);
    releaseBrowserControl(scope);
    await expect(waitForBrowserHandoff(scope)).resolves.toBeTypeOf("number");
  });
  it("rate limits manual actions even across repeated tab operations", () => {
    for (let i = 0; i < 80; i++) expect(claimHumanBrowserAction(scope)).toBe(true);
    expect(claimHumanBrowserAction(scope)).toBe(false);
  });
});
