import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { waitForPageOrIntervention } from
  "../../lib/project-agent/runtime/browser-agent/browser-wait";
import { clearBrowserControl, notifyBrowserIntervention } from
  "../../lib/project-agent/runtime/browser-agent/control";

const task = "pat_678901abcdef";
afterEach(() => clearBrowserControl(task));
const blockedPage = () => ({
  waitForLoadState: vi.fn(() => new Promise<void>(() => {})),
  waitForFunction: vi.fn(() => new Promise<void>(() => {})),
}) as unknown as Page;

describe("C15 Browser Wait Stop and user-intervention boundary", () => {
  it("fails closed on a signal already cancelled before the wait begins", async () => {
    const cancelled = new AbortController();
    cancelled.abort(new Error("Task stopped"));
    const page = blockedPage();
    await expect(waitForPageOrIntervention(page, {
      action: "browser", op: "wait", seconds: 10,
    }, task, cancelled.signal)).rejects.toThrow(/Task stopped/);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });
  it("rejects an active network wait when the task is stopped", async () => {
    const cancelled = new AbortController();
    const page = blockedPage();
    const pending = waitForPageOrIntervention(page, {
      action: "browser", op: "wait", seconds: 10,
    }, task, cancelled.signal);
    cancelled.abort(new Error("Task stopped"));
    await expect(pending).rejects.toThrow(/Task stopped/);
  });
  it("returns an intervention outcome without claiming the page settled", async () => {
    const page = blockedPage();
    const pending = waitForPageOrIntervention(page, {
      action: "browser", op: "wait", seconds: 10,
    }, task);
    notifyBrowserIntervention(task);
    await expect(pending).resolves.toMatchObject({ interrupted: true });
  });
  it("returns a successful find-text receipt and a bounded miss", async () => {
    const found = { waitForFunction: vi.fn(async () => ({})) } as unknown as Page;
    expect((await waitForPageOrIntervention(found, {
      action: "browser", op: "wait", seconds: 2, find: "Success",
    }, task)).text).toMatch(/is on the page now/);
    const absent = { waitForFunction: vi.fn(async () => { throw Error("timeout"); }) } as unknown as Page;
    expect((await waitForPageOrIntervention(absent, {
      action: "browser", op: "wait", seconds: 1, find: "Missing",
    }, task)).text).toMatch(/did not appear/);
  });
});
