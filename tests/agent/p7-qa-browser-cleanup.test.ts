import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  closeBrowserSession: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/watch", () => ({
  setBrowserWatch: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/control", () => ({
  browserControlState: vi.fn(), clearBrowserControl: vi.fn(),
}));
import { cleanupP7DiscardedBrowser } from "../../lib/project-agent/p7-qa-browser-cleanup";
import { closeBrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
import { setBrowserWatch } from "../../lib/project-agent/runtime/browser-agent/watch";
import { browserControlState, clearBrowserControl } from "../../lib/project-agent/runtime/browser-agent/control";

const taskId = "pat_123456789abc";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(browserControlState).mockReturnValue({ paused: false, revision: 0 });
  vi.mocked(closeBrowserSession).mockResolvedValue();
});
describe("P7 rejected Chromium fixture cleanup", () => {
  it("removes Watch frame, releases control and closes the task session", async () => {
    expect(await cleanupP7DiscardedBrowser(taskId)).toBe(true);
    expect(setBrowserWatch).toHaveBeenCalledTimes(1);
    expect(setBrowserWatch).toHaveBeenCalledWith(taskId, false);
    expect(clearBrowserControl).toHaveBeenCalledTimes(1);
    expect(clearBrowserControl).toHaveBeenCalledWith(taskId);
    expect(closeBrowserSession).toHaveBeenCalledTimes(1);
    expect(closeBrowserSession).toHaveBeenCalledWith(taskId);
  });
  it("preserves a session while a human owns takeover", async () => {
    vi.mocked(browserControlState).mockReturnValue({ paused: true, revision: 1 });
    expect(await cleanupP7DiscardedBrowser(taskId)).toBe(false);
    expect(setBrowserWatch).not.toHaveBeenCalled();
    expect(clearBrowserControl).not.toHaveBeenCalled();
    expect(closeBrowserSession).not.toHaveBeenCalled();
  });
  it("purges Watch/control even if Chromium context close fails", async () => {
    vi.mocked(closeBrowserSession).mockRejectedValue(new Error("context crashed"));
    await expect(cleanupP7DiscardedBrowser(taskId)).rejects.toThrow("context crashed");
    expect(setBrowserWatch).toHaveBeenCalledWith(taskId, false);
    expect(clearBrowserControl).toHaveBeenCalledWith(taskId);
  });
});
