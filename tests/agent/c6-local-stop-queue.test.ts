import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("../../lib/project-agent/runtime/browser-agent/g2-ownership", () => ({
  assertG2BrowserOwnership: vi.fn(), changeG2HumanControl: vi.fn(),
  bindG2BrowserOwnership: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/personal-vault", () => ({
  readPersonalBrowserGrant: vi.fn(),
}));
import { withBrowserOp } from "../../lib/project-agent/runtime/browser-agent/session";
import { takeBrowserControl, clearBrowserControl }
  from "../../lib/project-agent/runtime/browser-agent/control";
const id = "pat_abcdef123456";
const fake = () => ({ scopeId: id, owner: "qa@project-agent.test",
  operationCount: 0, persistent: false, lastUsed: 0,
  page: { isClosed: () => false }, browser: { isConnected: () => true } }) as never;
afterEach(() => clearBrowserControl(id));
describe("C6 queued browser Stop/takeover fencing", () => {
  it("never executes an action queued before Stop, even after the first action releases", async () => {
    const session = fake();
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const first = withBrowserOp(session, async () => { started(); await blocked; });
    await ready;
    const abort = new AbortController(), action = vi.fn(async () => "unsafe");
    const second = withBrowserOp(session, action, true, "agent", id, abort.signal);
    abort.abort(new Error("Task stopped"));
    release(); await first;
    await expect(second).rejects.toThrow(/Task stopped/);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects stale queued actions after user takeover and handback", async () => {
    const session = fake();
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const first = withBrowserOp(session, async () => { started(); await blocked; });
    await ready;
    const action = vi.fn(async () => "stale");
    const second = withBrowserOp(session, action, true, "agent", id);
    takeBrowserControl(id);
    release(); await first.catch(() => {});
    await expect(second).rejects.toThrow(/control changed/i);
    expect(action).not.toHaveBeenCalled();
  });
  it("does not accept completion after Stop interrupted the action", async () => {
    const session = fake(), abort = new AbortController();
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const pending = withBrowserOp(session, async () => { started(); await blocked; return "stale"; },
      true, "agent", id, abort.signal);
    await ready; abort.abort(new Error("Task stopped")); release();
    await expect(pending).rejects.toThrow(/Task stopped/);
  });
});
