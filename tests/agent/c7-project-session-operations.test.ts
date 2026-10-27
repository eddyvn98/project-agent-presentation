import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  op: vi.fn(), notify: vi.fn(), safe: vi.fn(), touch: vi.fn(),
  updateTab: vi.fn(), keep: vi.fn(), handback: vi.fn(), takeover: vi.fn(),
  control: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: vi.fn(), closeBrowserSession: vi.fn(), getBrowserSession: vi.fn(),
  withBrowserOp: m.op,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/control", () => ({
  notifyBrowserIntervention: m.notify,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/watch", () => ({
  publicBrowserWatchLocation: vi.fn((s: string) => s),
}));
vi.mock("../../lib/project-agent/runtime/web-security", () => ({
  assertPublicHttpUrl: m.safe,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-registry", () => ({
  closeProjectRecord: vi.fn(), ensureProjectRecord: vi.fn(),
  findProjectRecord: vi.fn(), projectRecordByKey: vi.fn(),
  touchProjectRecord: m.touch, updateProjectActiveTab: m.updateTab,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-control-db", () => ({
  claimProjectAgent: vi.fn(), clearProjectControl: vi.fn(),
  handbackProjectControl: m.handback, keepProjectControl: m.keep,
  readProjectControl: m.control, releaseProjectAgent: vi.fn(),
  takeProjectControl: m.takeover, waitForProjectControl: vi.fn(),
}));
import { projectBrowserOperation } from "../../lib/project-agent/runtime/browser-agent/project-sessions";

function page(address = "about:blank") {
  const p: any = {
    url: vi.fn(() => address), isClosed: vi.fn(() => false),
    goto: vi.fn(async () => {}), bringToFront: vi.fn(async () => {}),
    setViewportSize: vi.fn(async () => {}),
  };
  p.close = vi.fn(async () => p.isClosed.mockReturnValue(true));
  return p;
}
let session: any, tabs: any[];
const id = "pb_c7_operations";
beforeEach(() => {
  vi.resetAllMocks();
  tabs = [page("https://one.example"), page("https://two.example")];
  session = { scopeId: id, steelId: "steel-c7", activeAgentTaskId: "task-c7",
    owner: "owner@project-agent.test", page: tabs[0],
    context: { pages: vi.fn(() => tabs), newPage: vi.fn(async () => {
      const created = page(); tabs.push(created); return created;
    }) }, refs: new Map([["stale", 1]]), snapshotUrl: "old",
    lastSnapshot: "old", lastUsed: 0 };
  m.op.mockImplementation(async (_session: unknown, fn: () => Promise<unknown>) => fn());
  m.control.mockResolvedValue({ paused: true, revision: 1 });
  m.keep.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("C7 manual browser operation, safe tabs and takeover", () => {
  it("requires human takeover for navigation and mutation", async () => {
    m.control.mockResolvedValueOnce({ paused: false });
    await expect(projectBrowserOperation(session, { op: "navigate", url: "https://safe.example" }))
      .rejects.toThrow(/Take control/);
    expect(m.safe).not.toHaveBeenCalled();
    expect(m.op).not.toHaveBeenCalled();
    expect(session.page.goto).not.toHaveBeenCalled();
  });
  it("handles take/release/heartbeat without page side effects, expires closed lease", async () => {
    await projectBrowserOperation(session, { op: "takeover" });
    expect(m.takeover).toHaveBeenCalledWith(id);
    await projectBrowserOperation(session, { op: "heartbeat" });
    expect(m.keep).toHaveBeenCalledWith(id);
    await projectBrowserOperation(session, { op: "release" });
    expect(m.handback).toHaveBeenCalledWith(id);
    expect(m.notify).toHaveBeenCalledTimes(3);
    expect(m.op).not.toHaveBeenCalled();
    m.keep.mockResolvedValueOnce(false);
    await expect(projectBrowserOperation(session, { op: "heartbeat" }))
      .rejects.toThrow(/expired/);
    expect(m.notify).toHaveBeenCalledTimes(3);
  });
  it("checks URL before navigation and clears stale refs only on success", async () => {
    m.safe.mockRejectedValueOnce(new Error("private network"));
    await expect(projectBrowserOperation(session, { op: "navigate", url: "http://127.0.0.1" }))
      .rejects.toThrow(/private network/);
    expect(session.page.goto).not.toHaveBeenCalled();
    expect(session.refs.size).toBe(1);
    await expect(projectBrowserOperation(session, { op: "navigate" }))
      .rejects.toThrow(/URL required/);
    await projectBrowserOperation(session, { op: "navigate", url: "https://safe.example" });
    expect(m.safe).toHaveBeenCalledWith("https://safe.example");
    expect(session.page.goto).toHaveBeenCalledWith("https://safe.example",
      { waitUntil: "domcontentloaded", timeout: 20_000 });
    expect(session.refs.size).toBe(0);
    expect(session.snapshotUrl).toBe("");
    expect(session.lastSnapshot).toBe("");
    expect(m.op).toHaveBeenCalledWith(session, expect.any(Function), false, "human");
    expect(m.updateTab).toHaveBeenCalledWith(id, "steel-c7", 0);
  });
  it("never leaves a newly opened tab behind after unsafe URL or navigation errors", async () => {
    m.safe.mockRejectedValueOnce(new Error("denied"));
    await expect(projectBrowserOperation(session, { op: "new_tab", url: "https://denied.example" }))
      .rejects.toThrow(/denied/);
    expect(tabs[2].close).toHaveBeenCalledOnce();
    tabs[2].isClosed.mockReturnValue(true);
    await projectBrowserOperation(session, { op: "new_tab", url: "https://ok.example" });
    expect(session.page).toBe(tabs[3]);
    expect(m.updateTab).toHaveBeenCalledWith(id, "steel-c7", 2);
    expect(tabs[3].bringToFront).toHaveBeenCalledOnce();
  });
  it("checks tab range, prevents closing the final tab and enforces tab quota", async () => {
    await expect(projectBrowserOperation(session, { op: "switch_tab", tabIndex: 9 }))
      .rejects.toThrow(/tab not found/);
    await projectBrowserOperation(session, { op: "switch_tab", tabIndex: 1 });
    expect(session.page).toBe(tabs[1]);
    await projectBrowserOperation(session, { op: "close_tab", tabIndex: 1 });
    expect(tabs[1].close).toHaveBeenCalledOnce();
    expect(session.page).toBe(tabs[0]);
    await expect(projectBrowserOperation(session, { op: "close_tab", tabIndex: 0 }))
      .rejects.toThrow(/final tab/);
    while (session.context.pages().filter((p: any) => !p.isClosed()).length < 8)
      await projectBrowserOperation(session, { op: "new_tab" });
    await expect(projectBrowserOperation(session, { op: "new_tab" }))
      .rejects.toThrow(/Eight-tab/);
  });
  it("rejects invalid viewport integers and unsupported operations before browser mutation", async () => {
    for (const [width, height] of [[319, 800], [1921, 800], [1280, 479],
      [1280, 1081], [NaN, 800], [800.5, 800]]) {
      await expect(projectBrowserOperation(session, { op: "viewport", width, height }))
        .rejects.toThrow(/Unsupported viewport/);
    }
    await projectBrowserOperation(session, { op: "viewport", width: 390, height: 844 });
    expect(session.page.setViewportSize).toHaveBeenCalledWith({ width: 390, height: 844 });
    await expect(projectBrowserOperation(session, { op: "unknown" }))
      .rejects.toThrow(/Unsupported browser operation/);
  });
});
