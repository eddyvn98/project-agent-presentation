import { afterEach, describe, expect, it, vi } from "vitest";
import { browserRetryStalled, recordBrowserDomFailure,
  clearBrowserStall, P8_STALL_GUIDANCE } from "../../lib/project-agent/runtime/browser-agent/stall-guard";
import { requestBrowserTakeover, releaseBrowserControl, clearBrowserControl } from "../../lib/project-agent/runtime/browser-agent/control";

const task = "pat_8a8b8c8d8e8f", url = "https://example.test/article?token=not-for-logs";
const before = "heading: Details; ref=e3 role=button label=Open";
afterEach(() => { clearBrowserControl(task); clearBrowserStall(task); vi.useRealTimers(); });

describe("P8 opt-in browser DOM action stall detector", () => {
  it("allows a first failure and recommends assistance after two identical failures", () => {
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(false);
    expect(recordBrowserDomFailure(task, "click", "e3", url, before)).toBe(false);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(false);
    expect(recordBrowserDomFailure(task, "click", "e3", url, before)).toBe(true);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(true);
  });
  it("does not block different refs, pages, operations or refreshed DOM", () => {
    recordBrowserDomFailure(task, "click", "e3", url, before);
    recordBrowserDomFailure(task, "click", "e3", url, before);
    expect(browserRetryStalled(task, "click", "e4", url, before)).toBe(false);
    expect(browserRetryStalled(task, "type", "e3", url, before)).toBe(false);
    expect(browserRetryStalled(task, "click", "e3", "https://example.test/other", before)).toBe(false);
    expect(browserRetryStalled(task, "click", "e3", url, before + " UPDATED")).toBe(false);
  });
  it("resets the counter when a failing attempt has a changed snapshot", () => {
    recordBrowserDomFailure(task, "click", "e3", url, before);
    expect(recordBrowserDomFailure(task, "click", "e3", url, "new DOM")).toBe(false);
    expect(browserRetryStalled(task, "click", "e3", url, "new DOM")).toBe(false);
  });
  it("does not treat repeated reads, screenshots or wait as failed mutations", () => {
    expect(recordBrowserDomFailure(task, "snapshot", "", url, before)).toBe(false);
    expect(recordBrowserDomFailure(task, "wait", "", url, before)).toBe(false);
    expect(recordBrowserDomFailure(task, "visual_observe", "", url, before)).toBe(false);
    expect(browserRetryStalled(task, "snapshot", "", url, before)).toBe(false);
  });
  it("clearing on browser close or successful new snapshot restores progress", () => {
    recordBrowserDomFailure(task, "click", "e3", url, before);
    recordBrowserDomFailure(task, "click", "e3", url, before);
    clearBrowserStall(task);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(false);
  });
  it("human takeover and handback permit a fresh attempt on the same page", () => {
    recordBrowserDomFailure(task, "click", "e3", url, before);
    recordBrowserDomFailure(task, "click", "e3", url, before);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(true);
    requestBrowserTakeover(task);
    releaseBrowserControl(task);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(false);
  });
  it("forgets stale failures after five minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T00:00:00.000Z"));
    recordBrowserDomFailure(task, "click", "e3", url, before);
    recordBrowserDomFailure(task, "click", "e3", url, before);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(browserRetryStalled(task, "click", "e3", url, before)).toBe(false);
  });
  it("never displays URL, DOM text or secrets in assistance guidance", () => {
    expect(P8_STALL_GUIDANCE).toMatch(/fresh browser snapshot/i);
    expect(P8_STALL_GUIDANCE).toMatch(/user to take over/i);
    expect(P8_STALL_GUIDANCE).not.toContain("token=");
    expect(P8_STALL_GUIDANCE).not.toContain("Details");
  });
  it("isolates repeat failures by task id", () => {
    recordBrowserDomFailure(task, "click", "e3", url, before);
    recordBrowserDomFailure(task, "click", "e3", url, before);
    expect(browserRetryStalled("pat_other", "click", "e3", url, before)).toBe(false);
  });
});
