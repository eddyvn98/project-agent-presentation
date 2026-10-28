import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";

const m = vi.hoisted(() => ({
  ownership: vi.fn(), change: vi.fn(), grant: vi.fn(), projectOp: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/g2-ownership", () => ({
  assertG2BrowserOwnership: m.ownership,
  changeG2HumanControl: m.change,
  bindG2BrowserOwnership: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/personal-vault", () => ({
  readPersonalBrowserGrant: m.grant, vaultHost: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-control-db", () => ({
  withProjectControlOp: m.projectOp,
}));
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";

function fake() {
  let connected = true, closed = false;
  const close = vi.fn(async () => { closed = true; });
  const session = {
    browser: { isConnected: () => connected },
    page: { isClosed: () => closed },
    operationCount: 0, lastUsed: 0, close,
  } as unknown as BrowserSession;
  return { session, close, disconnect: () => { connected = false; },
    reconnect: () => { connected = true; closed = false; },
    closePage: () => { closed = true; } };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.ownership.mockResolvedValue(undefined);
  m.change.mockResolvedValue(undefined);
  m.projectOp.mockImplementation(async (_id: string, _mode: string,
    _task: string | undefined, fn: (revision: number) => Promise<unknown>) => fn(0));
});
afterEach(() => vi.useRealTimers());

describe("Browser Agent disconnection and late completion fences", () => {
  it("rejects an optimistic success when Chromium disconnects during the action", async () => {
    const qa = fake();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const pending = withBrowserOp(qa.session, async () => {
      started(); await gate; return "success that cannot be verified";
    });
    await ready;
    qa.disconnect(); release();
    await expect(pending).rejects.toThrow(/session closed while an action was running/);
    const next = vi.fn(async () => "safe read");
    await expect(withBrowserOp(qa.session, next)).rejects.toThrow(/session is closed/);
    expect(next).not.toHaveBeenCalled();
  });
  it("rejects a success if only the active page closed during operation", async () => {
    const qa = fake();
    const action = vi.fn(async () => {
      qa.closePage(); return "stale";
    });
    await expect(withBrowserOp(qa.session, action))
      .rejects.toThrow(/session closed while an action was running/);
    expect(action).toHaveBeenCalledOnce();
  });
  it("does not replay a queued action after the browser disconnects", async () => {
    const qa = fake();
    let unblock!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = withBrowserOp(qa.session, async () => {
      entered(); await gate; return "result";
    });
    await started;
    const secondAction = vi.fn(async () => "must not run");
    const second = withBrowserOp(qa.session, secondAction);
    qa.disconnect(); unblock();
    await expect(first).rejects.toThrow(/session closed while an action was running/);
    await expect(second).rejects.toThrow(/session is closed/);
    expect(secondAction).not.toHaveBeenCalled();
  });
  it("unlocks after a disconnection so the next connected read can proceed", async () => {
    const qa = fake();
    qa.disconnect();
    await expect(withBrowserOp(qa.session, async () => "bad"))
      .rejects.toThrow(/session is closed/);
    qa.reconnect();
    expect(await withBrowserOp(qa.session, async () => "refreshed snapshot"))
      .toBe("refreshed snapshot");
  });
  it("refuses revoked G2 ownership before calling the Browser side effect", async () => {
    const qa = fake(), click = vi.fn(async () => "clicked");
    m.ownership.mockRejectedValueOnce(new Error("Browser ownership was lost"));
    await expect(withBrowserOp(qa.session, click))
      .rejects.toThrow(/ownership was lost/);
    expect(click).not.toHaveBeenCalled();
    expect(await withBrowserOp(qa.session, async () => "fresh"))
      .toBe("fresh");
  });
  it("does not publish a result after the distributed control lease is lost", async () => {
    const qa = fake();
    qa.session.persistent = true;
    qa.session.scopeId = "pb_synthetic";
    const external = vi.fn(async () => "tool returned success");
    m.projectOp.mockImplementationOnce(async (_id: string, _mode: string,
      _task: string | undefined, fn: (revision: number) => Promise<unknown>) => {
      await fn(0);
      throw new Error("Browser operation lease was lost");
    });
    await expect(withBrowserOp(qa.session, external, true, "agent", "task-a"))
      .rejects.toThrow(/lease was lost/);
    expect(external).toHaveBeenCalledOnce();
    expect(m.projectOp).toHaveBeenCalledWith(
      "pb_synthetic", "agent", "task-a", expect.any(Function), expect.any(Function));
  });
  it("requires task identity for shared browser before a mutation", async () => {
    const qa = fake(), sideEffect = vi.fn(async () => "unsafe");
    qa.session.persistent = true;
    qa.session.scopeId = "pb_shared";
    await expect(withBrowserOp(qa.session, sideEffect))
      .rejects.toThrow(/task identity is required/);
    expect(sideEffect).not.toHaveBeenCalled();
    expect(m.projectOp).not.toHaveBeenCalled();
  });
  it("closes a saved-login session if its consent changed before execution", async () => {
    const qa = fake(), click = vi.fn(async () => "unsafe");
    Object.assign(qa.session, {
      owner: "owner@example.test", authHost: "portal.example.test", authVersion: "version-1",
    });
    m.grant.mockResolvedValueOnce({
      grant: { automation: true, version: "version-2", mode: "interact" },
    });
    await expect(withBrowserOp(qa.session, click, true, "agent", undefined,
      undefined, "click")).rejects.toThrow(/revoked or changed/);
    expect(qa.close).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
  it("enforces read-only access even when the stored login has valid consent", async () => {
    const qa = fake(), submit = vi.fn(async () => "unsafe");
    Object.assign(qa.session, {
      owner: "owner@example.test", authHost: "portal.example.test", authVersion: "version-1",
    });
    m.grant.mockResolvedValue({
      grant: { automation: true, version: "version-1", mode: "read" },
    });
    await expect(withBrowserOp(qa.session, submit, true, "agent", undefined,
      undefined, "click")).rejects.toThrow(/read-only Agent access/);
    expect(submit).not.toHaveBeenCalled();
    expect(await withBrowserOp(qa.session, async () => "snapshot", true, "agent",
      undefined, undefined, "snapshot")).toBe("snapshot");
  });
  it("closes a hung browser operation after 35 seconds and rejects the result", async () => {
    vi.useFakeTimers();
    const qa = fake();
    const never = vi.fn(async () => new Promise<string>(() => {}));
    const pending = withBrowserOp(qa.session, never);
    await vi.advanceTimersByTimeAsync(35_000);
    await expect(pending).rejects.toThrow(/timed out after 35 seconds/);
    expect(never).toHaveBeenCalledOnce();
    expect(qa.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("denies over-budget actions before the Browser callback runs", async () => {
    const qa = fake(), click = vi.fn(async () => "bad");
    qa.session.operationCount = 60;
    await expect(withBrowserOp(qa.session, click))
      .rejects.toThrow(/action limit \(60\)/);
    expect(click).not.toHaveBeenCalled();
  });
});
