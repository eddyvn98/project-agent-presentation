import { afterEach, describe, expect, it } from "vitest";
import { browserControlState, clearBrowserControl, keepBrowserControl,
  releaseBrowserControl, takeBrowserControl, waitForBrowserHandoff } from
  "../../lib/project-agent/runtime/browser-agent/control";

const id = "pat_abc123def456";
afterEach(() => clearBrowserControl(id));
describe("exclusive local browser handoff", () => {
  it("blocks automatic control until explicit release", async () => {
    takeBrowserControl(id);
    expect(browserControlState(id).paused).toBe(true);
    expect(keepBrowserControl(id)).toBe(true);
    releaseBrowserControl(id);
    await expect(waitForBrowserHandoff(id)).resolves.toBe(
      browserControlState(id).revision);
    expect(browserControlState(id).paused).toBe(false);
  });
  it("cannot renew without a takeover", () => {
    expect(keepBrowserControl(id)).toBe(false);
  });
});
