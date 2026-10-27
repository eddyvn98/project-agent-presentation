import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/browser-agent/g2-ownership", () => ({
  assertG2BrowserOwnership: vi.fn(), changeG2HumanControl: vi.fn(),
  bindG2BrowserOwnership: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/personal-vault", () => ({
  readPersonalBrowserGrant: vi.fn(),
}));
import { readPersonalBrowserGrant } from "../../lib/project-agent/runtime/browser-agent/personal-vault";
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";
describe("C6 Vault refresh/revoke during browser action queue", () => {
  it("rejects a queued write after the owner's Vault grant is revoked", async () => {
    const close = vi.fn(async () => {});
    const session = { scopeId: "pat_fedcba987654", owner: "qa@project-agent.test",
      authHost: "portal.example.test", authVersion: "v1", operationCount: 0,
      page: { isClosed: () => false }, browser: { isConnected: () => true },
      close } as never;
    vi.mocked(readPersonalBrowserGrant).mockResolvedValueOnce({
      grant: { mode: "interact", automation: true, version: "v1" },
    } as never).mockResolvedValue(null);
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const first = withBrowserOp(session, async () => { started(); await gate; },
      false, "system");
    await ready;
    const write = vi.fn(async () => "unsafe");
    const pending = withBrowserOp(session, write, true, "agent", "pat_fedcba987654",
      undefined, "click");
    release(); await first;
    await expect(pending).rejects.toThrow(/revoked or changed/i);
    expect(write).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
