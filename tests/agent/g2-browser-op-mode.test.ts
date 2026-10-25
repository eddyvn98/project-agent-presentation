import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
const lease = vi.hoisted(() => ({ assert: vi.fn(async (_session: unknown, _mode: string) => {}) }));
vi.mock("../../lib/project-agent/runtime/browser-agent/g2-ownership", () => ({
  assertG2BrowserOwnership: lease.assert,
  bindG2BrowserOwnership: vi.fn(),
  g2OwnershipEnabled: () => false,
}));
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";

function syntheticSession() {
  return { page: { isClosed: () => false }, browser: { isConnected: () => true },
    operationCount: 0, lastUsed: 0 } as unknown as BrowserSession;
}
beforeEach(() => lease.assert.mockClear());
afterEach(() => lease.assert.mockReset());

describe("G2 browser ownership is independent from operation accounting", () => {
  it("uncounted fixture setup still requires the Agent lease", async () => {
    const session = syntheticSession();
    expect(await withBrowserOp(session, async () => "fixture", false)).toBe("fixture");
    expect(lease.assert).toHaveBeenCalledWith(session, "agent");
    expect(session.operationCount).toBe(0);
  });
  it("normal Agent action counts and checks Agent ownership", async () => {
    const session = syntheticSession();
    expect(await withBrowserOp(session, async () => "clicked")).toBe("clicked");
    expect(lease.assert).toHaveBeenCalledWith(session, "agent");
    expect(session.operationCount).toBe(1);
  });
  it("explicit human mode permits uncounted takeover/manual/personal-auth", async () => {
    const session = syntheticSession();
    expect(await withBrowserOp(session, async () => "manual", false, "human"))
      .toBe("manual");
    expect(lease.assert).toHaveBeenCalledWith(session, "human");
    expect(session.operationCount).toBe(0);
  });
  it("revoked human lease fails closed before any mutation", async () => {
    const session = syntheticSession(), mutate = vi.fn();
    lease.assert.mockRejectedValueOnce(new Error("Browser ownership was lost"));
    await expect(withBrowserOp(session, async () => { mutate(); }, false, "human"))
      .rejects.toThrow("Browser ownership was lost");
    expect(mutate).not.toHaveBeenCalled();
    // The rejected operation must unlock its queue.
    await withBrowserOp(session, async () => {}, false, "human");
    expect(lease.assert).toHaveBeenCalledTimes(2);
  });
});
