import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../lib/project-agent/runtime/browser-agent/session";
import type { BrowserAction } from "../../lib/project-agent/runtime/browser-agent/action-parser";
import { runP8BrowserLoopStep } from "../../lib/project-agent/runtime/browser-agent/loop-step";
import { verifyBrowserProgress } from "../../lib/project-agent/runtime/browser-agent/progress-checker";
import { browserLoopStatus, clearBrowserLoop } from "../../lib/project-agent/runtime/browser-agent/loop-state";

const task = "pat_0a0b0c0d0e0f";
function stub() {
  let url = "https://example.test/start", value = "";
  const page = { url: () => url,
    locator: vi.fn(() => ({ inputValue: async () => value })),
  };
  const session = { page, refs: new Map([["e1", "#field"]]),
    lastSnapshot: "[ref=e1] textbox Name" } as unknown as BrowserSession;
  return { session, setUrl: (next: string) => { url = next; },
    setValue: (next: string) => { value = next; },
    setSnapshot: (next: string) => { session.lastSnapshot = next; } };
}
const act = (op: BrowserAction["op"], more: Partial<BrowserAction> = {}): BrowserAction =>
  ({ action: "browser", op, ...more });
afterEach(() => { clearBrowserLoop(task); vi.unstubAllEnvs(); });

describe("P8 independent browser action checker", () => {
  it("verifies text only by inspecting the real input value", async () => {
    const state = stub();
    state.setValue("typed");
    expect(await verifyBrowserProgress(state.session, act("type", { ref: "e1", text: "typed" }),
      { url: state.session.page.url(), snapshot: state.session.lastSnapshot }))
      .toEqual({ verified: true, reason: "value_matched" });
  });
  it("does not accept mere command success as evidence of a changed form", async () => {
    const state = stub();
    expect((await verifyBrowserProgress(state.session, act("select", { ref: "e1", value: "wrong" }),
      { url: state.session.page.url(), snapshot: state.session.lastSnapshot })).verified).toBe(false);
  });
  it("detects navigation or changed DOM without exposing page content", async () => {
    const state = stub(), before = { url: state.session.page.url(),
      snapshot: state.session.lastSnapshot };
    state.setUrl("https://example.test/done");
    expect((await verifyBrowserProgress(state.session, act("click", { ref: "e1" }), before)).reason)
      .toBe("navigation");
    state.setUrl(before.url); state.setSnapshot(before.snapshot + " changed");
    expect((await verifyBrowserProgress(state.session, act("click", { ref: "e1" }), before)).reason)
      .toBe("page_changed");
  });
});
describe("P8 maker/checker enforcement", () => {
  it("does not alter existing browser flow while feature flag is off", async () => {
    const state = stub(), notify = vi.fn();
    const result = await runP8BrowserLoopStep(task, state.session, act("click"), notify,
      async () => ({ text: "completed" }));
    expect(result.text).toBe("completed");
    expect(browserLoopStatus(task)).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });
  it("checks actual post-action DOM state and emits safe evidence only", async () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    const state = stub(), notify = vi.fn();
    const result = await runP8BrowserLoopStep(task, state.session, act("click", { ref: "e1" }),
      notify, async () => { state.setSnapshot("Changed DOM"); return { text: "clicked" }; });
    expect(result).toEqual({ text: "clicked" });
    expect(browserLoopStatus(task)).toMatchObject({ verified: 1, actions: 1 });
    expect(JSON.stringify(notify.mock.calls)).not.toContain("example.test");
    expect(JSON.stringify(notify.mock.calls)).not.toContain("Changed DOM");
  });
  it("records an unverified result instead of a false success", async () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    const state = stub();
    await runP8BrowserLoopStep(task, state.session, act("click"), undefined,
      async () => ({ text: "clicked" }));
    expect(browserLoopStatus(task)).toMatchObject({ verified: 0, unverified: 1 });
  });
  it("catches tool failures and preserves the original exception", async () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    const state = stub();
    await expect(runP8BrowserLoopStep(task, state.session, act("click"), undefined,
      async () => { throw new Error("Synthetic failure"); })).rejects.toThrow("Synthetic failure");
    expect(browserLoopStatus(task)?.failed).toBe(1);
  });
  it("stops after repeated no-progress actions without invoking maker again", async () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
    const state = stub(), maker = vi.fn(async () => ({ text: "clicked" }));
    for (let i = 0; i < 3; i++)
      await runP8BrowserLoopStep(task, state.session, act("click"), undefined, maker);
    const rejected = await runP8BrowserLoopStep(task, state.session, act("click"), undefined, maker);
    expect(maker).toHaveBeenCalledTimes(3);
    expect(rejected.failed).toBe(true);
    expect(browserLoopStatus(task)).toMatchObject({ actions: 3, blocked: 1, phase: "needs_help" });
  });
});
