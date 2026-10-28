import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  active: vi.fn(), close: vi.fn(), get: vi.fn(), op: vi.fn(),
  notify: vi.fn(), watchUrl: vi.fn(), safeUrl: vi.fn(),
  closeRecord: vi.fn(), ensure: vi.fn(), find: vi.fn(), record: vi.fn(),
  touch: vi.fn(), updateTab: vi.fn(),
  claim: vi.fn(), clear: vi.fn(), handback: vi.fn(), keep: vi.fn(),
  control: vi.fn(), release: vi.fn(), takeover: vi.fn(), wait: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: m.active, closeBrowserSession: m.close,
  getBrowserSession: m.get, withBrowserOp: m.op,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/control", () => ({
  notifyBrowserIntervention: m.notify,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/watch", () => ({
  publicBrowserWatchLocation: m.watchUrl,
}));
vi.mock("../../lib/project-agent/runtime/web-security", () => ({
  assertPublicHttpUrl: m.safeUrl,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-registry", () => ({
  closeProjectRecord: m.closeRecord, ensureProjectRecord: m.ensure,
  findProjectRecord: m.find, projectRecordByKey: m.record,
  touchProjectRecord: m.touch, updateProjectActiveTab: m.updateTab,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-control-db", () => ({
  claimProjectAgent: m.claim, clearProjectControl: m.clear,
  handbackProjectControl: m.handback, keepProjectControl: m.keep,
  readProjectControl: m.control, releaseProjectAgent: m.release,
  takeProjectControl: m.takeover, waitForProjectControl: m.wait,
}));
import {
  agentBrowserSession, finishProjectAgent, findProjectBrowser, openProjectBrowser,
  projectBrowserKey, projectBrowserOperation, stopProjectBrowser,
} from "../../lib/project-agent/runtime/browser-agent/project-sessions";

const project = "qa-project-races", owner = "owner@example.test", task = "pat_abcdef123456";
function fakeSession() {
  const page = {
    url: vi.fn(() => "https://public.example.test"),
    isClosed: vi.fn(() => false),
    bringToFront: vi.fn(async () => {}),
    goto: vi.fn(async () => {}),
    viewportSize: vi.fn(() => ({ width: 1200, height: 900 })),
    mouse: { click: vi.fn(async () => {}), wheel: vi.fn(async () => {}) },
    keyboard: { insertText: vi.fn(async () => {}), press: vi.fn(async () => {}) },
  };
  return { scopeId: projectBrowserKey(project, owner), steelId: "steel-new", owner,
    persistent: true, activeAgentTaskId: task, operationCount: 7,
    browser: { isConnected: () => true }, page,
    context: { pages: () => [page] },
    refs: new Map([["old", "#btn"]]), snapshotUrl: "old-snapshot",
    lastSnapshot: "old-snapshot", lastUsed: 0,
    close: vi.fn(async () => {}),
  } as any;
}
let session: ReturnType<typeof fakeSession>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
  session = fakeSession();
  m.find.mockResolvedValue(null);
  m.active.mockReturnValue(null);
  m.get.mockResolvedValue(session);
  m.record.mockResolvedValue({ steelId: "steel-new", activeTabIndex: 0 });
  m.ensure.mockResolvedValue(undefined);
  m.wait.mockResolvedValue({ paused: false });
  m.control.mockResolvedValue({ paused: true });
  m.op.mockImplementation(async (_session: unknown, fn: () => Promise<unknown>) => fn());
  m.touch.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Project Browser startup, handback and stale attachment races", () => {
  it("clears the rejected single-flight promise and allows a clean retry", async () => {
    m.ensure.mockRejectedValueOnce(new Error("synthetic registry failure"));
    await expect(openProjectBrowser(project, owner)).rejects.toThrow(/registry failure/);
    expect(m.ensure).toHaveBeenCalledTimes(1);
    const next = await openProjectBrowser(project, owner);
    expect(next).toBe(session);
    expect(m.ensure).toHaveBeenCalledTimes(2);
  });
  it("stops an inflight opening session before releasing the shared browser record", async () => {
    let unblock!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    m.ensure.mockImplementationOnce(async () => { entered(); await gate; });
    const open = openProjectBrowser(project, owner);
    await started;
    const stop = stopProjectBrowser(project, owner);
    expect(m.closeRecord).not.toHaveBeenCalled();
    unblock();
    await open;
    await stop;
    expect(m.closeRecord).toHaveBeenCalledWith(session.scopeId, project, owner);
    expect(m.clear).toHaveBeenCalledWith(session.scopeId);
    expect(m.close).toHaveBeenCalledWith(session.scopeId);
  });
  it("refuses a stopped Agent before claiming the shared browser", async () => {
    const controller = new AbortController();
    m.wait.mockImplementationOnce(async () => {
      controller.abort(new Error("synthetic task stopped"));
      throw controller.signal.reason;
    });
    await expect(agentBrowserSession({
      projectId: project, ownerEmail: owner, taskId: task,
      chatId: "synthetic-chat", signal: controller.signal,
    }, "fallback")).rejects.toThrow(/task stopped/);
    expect(m.claim).not.toHaveBeenCalled();
    expect(session.operationCount).toBe(7);
    expect(session.refs.size).toBe(1);
  });
  it("clears only the matching local Agent identity after release", async () => {
    m.active.mockReturnValue(session);
    await finishProjectAgent(project, owner, "different-task");
    expect(session.activeAgentTaskId).toBe(task);
    await finishProjectAgent(project, owner, task);
    expect(session.activeAgentTaskId).toBeUndefined();
    expect(m.release).toHaveBeenCalledTimes(2);
  });
  it("rejects an obsolete Steel attachment before it can become current", async () => {
    m.find.mockResolvedValue({ steelId: "steel-new" });
    m.record.mockResolvedValueOnce({ steelId: "steel-old", activeTabIndex: 0 });
    await expect(findProjectBrowser(project, owner)).rejects.toThrow(/Stale Project/);
    expect(m.claim).not.toHaveBeenCalled();
  });
  it("closes an obsolete local attachment before opening the replacement", async () => {
    const obsolete = fakeSession();
    obsolete.steelId = "steel-old";
    m.active.mockReturnValue(obsolete);
    m.record.mockResolvedValue({ steelId: "steel-new", activeTabIndex: 0 });
    await openProjectBrowser(project, owner);
    expect(obsolete.close).toHaveBeenCalledOnce();
    expect(session.persistent).toBe(true);
  });
  it("sends human click, wheel and typing to the live shared browser", async () => {
    await projectBrowserOperation(session, { op: "click", x: 0.5, y: 0.5 });
    expect(session.page.mouse.click).toHaveBeenCalledWith(600, 450);
    await projectBrowserOperation(session, { op: "wheel", deltaY: 450 });
    expect(session.page.mouse.wheel).toHaveBeenCalledWith(0, 450);
    await projectBrowserOperation(session, { op: "type", text: "login@example.test" });
    expect(session.page.keyboard.insertText).toHaveBeenCalledWith("login@example.test");
    await projectBrowserOperation(session, { op: "key", key: "Enter" });
    expect(session.page.keyboard.press).toHaveBeenCalledWith("Enter");
  });
  it("rejects input without takeover and invalid remote browser coordinates", async () => {
    m.control.mockResolvedValueOnce({ paused: false });
    await expect(projectBrowserOperation(session, { op: "click", x: 0.2, y: 0.3 }))
      .rejects.toThrow(/Take control/);
    expect(session.page.mouse.click).not.toHaveBeenCalled();
    for (const x of [-1, 2, Infinity, NaN]) {
      await expect(projectBrowserOperation(session, { op: "click", x, y: 0.5 }))
        .rejects.toThrow(/Invalid browser click/);
    }
    await expect(projectBrowserOperation(session, { op: "type", text: "x".repeat(1001) }))
      .rejects.toThrow(/Invalid browser input/);
    await expect(projectBrowserOperation(session, { op: "key", key: "Alt+F4" }))
      .rejects.toThrow(/Unsupported remote key/);
    expect(session.page.keyboard.insertText).not.toHaveBeenCalled();
  });
  it("treats a failed statistics touch as noncritical to an allowed human navigation", async () => {
    m.touch.mockRejectedValueOnce(new Error("synthetic telemetry timeout"));
    await projectBrowserOperation(session, { op: "navigate", url: "https://public.example.test" });
    expect(session.page.goto).toHaveBeenCalledOnce();
    expect(m.safeUrl).toHaveBeenCalledWith("https://public.example.test");
    expect(m.notify).toHaveBeenCalledWith(task);
    expect(session.refs.size).toBe(0);
  });
});
