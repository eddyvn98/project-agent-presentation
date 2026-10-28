import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  active: vi.fn(), close: vi.fn(), get: vi.fn(), op: vi.fn(),
  notify: vi.fn(), watch: vi.fn(), safe: vi.fn(),
  closeRecord: vi.fn(), ensure: vi.fn(), find: vi.fn(),
  record: vi.fn(), touch: vi.fn(), updateTab: vi.fn(),
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
  publicBrowserWatchLocation: m.watch,
}));
vi.mock("../../lib/project-agent/runtime/web-security", () => ({
  assertPublicHttpUrl: m.safe,
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
import { activeProjectBrowser, agentBrowserSession, findProjectBrowser,
  finishProjectAgent, openProjectBrowser, projectBrowserKey,
  projectBrowserOperation, projectBrowserStatus, stopProjectBrowser }
  from "../../lib/project-agent/runtime/browser-agent/project-sessions";

const project = "project-c7", owner = "owner@project-agent.test";
const task = "pat_123456789abc";
function makePage(address: string) {
  return { url: vi.fn(() => address), isClosed: vi.fn(() => false),
    goto: vi.fn(async () => {}), close: vi.fn(async () => {}),
    bringToFront: vi.fn(async () => {}), setViewportSize: vi.fn(async () => {}),
    viewportSize: vi.fn(() => ({ width: 1280, height: 800 })) };
}
function makeSession() {
  const pages = [makePage("https://a.example.test"), makePage("https://b.example.test")];
  const session: any = {
    scopeId: projectBrowserKey(project, owner), steelId: "steel-c7", owner,
    persistent: true, browser: { isConnected: vi.fn(() => true) },
    page: pages[0], context: {
      pages: vi.fn(() => pages.filter(x => !x.isClosed())),
      newPage: vi.fn(async () => { const p = makePage("about:blank"); pages.push(p); return p; }),
    }, refs: new Map([["old", "selector"]]), snapshotUrl: "old-url",
    lastSnapshot: "old-snapshot", operationCount: 19,
    close: vi.fn(async () => {}), viewerUrl: null, lastUsed: 0,
    activeAgentTaskId: undefined,
  };
  return { session, pages };
}
let live: ReturnType<typeof makeSession>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
  live = makeSession();
  m.active.mockReturnValue(null);
  m.get.mockResolvedValue(live.session);
  m.find.mockResolvedValue(null);
  m.record.mockResolvedValue({ steelId: "steel-c7", activeTabIndex: 0 });
  m.control.mockResolvedValue({ paused: true, revision: 5 });
  m.wait.mockResolvedValue({ paused: false, revision: 6 });
  m.keep.mockResolvedValue(true);
  m.op.mockImplementation(async (_session: unknown, fn: () => Promise<unknown>) => fn());
  m.watch.mockImplementation((url: string) => url);
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("C7 shared browser sessions lifecycle and owner isolation", () => {
  it("normalizes owner identity and rejects invalid active sessions", () => {
    expect(projectBrowserKey(project, owner.toUpperCase())).toBe(projectBrowserKey(project, owner));
    expect(projectBrowserKey("other-project", owner)).not.toBe(projectBrowserKey(project, owner));
    m.active.mockReturnValue(live.session);
    expect(activeProjectBrowser(project, owner)).toBe(live.session);
    live.session.owner = "intruder@project-agent.test";
    expect(activeProjectBrowser(project, owner)).toBeNull();
    live.session.owner = owner;
    live.session.page.isClosed.mockReturnValue(true);
    expect(activeProjectBrowser(project, owner)).toBeNull();
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
    expect(activeProjectBrowser(project, owner)).toBeNull();
  });
  it("reuses connected Project browser and blocks creation while feature disabled", async () => {
    m.find.mockResolvedValue({ steelId: "steel-c7" });
    expect(await openProjectBrowser(project, owner)).toBe(live.session);
    expect(m.ensure).not.toHaveBeenCalled();
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
    await expect(openProjectBrowser(project, owner)).rejects.toThrow(/disabled/);
  });
  it("single-flights concurrent session creation and removes pending promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    m.ensure.mockImplementationOnce(async () => { await gate; });
    const first = openProjectBrowser(project, owner);
    const second = openProjectBrowser(project, owner);
    for (let i = 0; i < 8 && !m.ensure.mock.calls.length; i++) await Promise.resolve();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(m.ensure).toHaveBeenCalledOnce();
    expect(a.persistent).toBe(true);
    await openProjectBrowser(project, owner);
    expect(m.ensure).toHaveBeenCalledTimes(2);
  });
  it("synchronizes browser tab from shared Mongo state and invalidates stale refs", async () => {
    m.find.mockResolvedValue({ steelId: "steel-c7" });
    m.record.mockResolvedValue({ steelId: "steel-c7", activeTabIndex: 1 });
    const found = await findProjectBrowser(project, owner);
    expect(found?.page).toBe(live.pages[1]);
    expect(found?.refs.size).toBe(0);
    expect(found?.snapshotUrl).toBe("");
    expect(found?.lastSnapshot).toBe("");
    m.record.mockResolvedValue({ steelId: "stale-steel" });
    await expect(findProjectBrowser(project, owner)).rejects.toThrow(/Stale Project/);
  });
  it("closes stale local worker attachment before reconnecting new Steel", async () => {
    m.find.mockResolvedValue({ steelId: "steel-new" });
    m.active.mockReturnValue(live.session);
    await findProjectBrowser(project, owner);
    expect(m.close).toHaveBeenCalledWith(live.session.scopeId);
  });
  it("binds shared Agent task only after handback and resets task-scoped refs", async () => {
    const start = await agentBrowserSession({
      projectId: project, ownerEmail: owner, taskId: task, chatId: "chat-c7",
    }, "fallback");
    expect(start.shared).toBe(true);
    expect(m.wait).toHaveBeenCalledWith(live.session.scopeId, undefined);
    expect(m.claim).toHaveBeenCalledWith(live.session.scopeId, task);
    expect(live.session.activeAgentTaskId).toBe(task);
    expect(live.session.operationCount).toBe(0);
    expect(live.session.refs.size).toBe(0);
    await finishProjectAgent(project, owner, task);
    expect(m.release).toHaveBeenCalledWith(live.session.scopeId, task);
    expect(live.session.activeAgentTaskId).toBe(task); // no local active registry
  });
  it("rejects shared missing task identity, supports local fallback, and serializes Stop cleanup", async () => {
    await expect(agentBrowserSession({ projectId: project,
      ownerEmail: owner, chatId: "chat-c7" }, "fallback"))
      .rejects.toThrow(/task id/);
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
    const fallback = await agentBrowserSession({ chatId: "local-chat" }, "fallback");
    expect(fallback).toMatchObject({ id: "fallback", shared: false });
    expect(live.session.chatId).toBe("local-chat");
    await stopProjectBrowser(project, owner);
    expect(m.closeRecord).toHaveBeenCalledOnce();
    expect(m.clear).toHaveBeenCalledWith(live.session.scopeId);
    expect(m.close).toHaveBeenCalledWith(live.session.scopeId);
  });
  it("provides status with only live tabs, safe location and viewport", async () => {
    live.pages[1].isClosed.mockReturnValue(true);
    live.session.viewerUrl = "/private/steel/view";
    const status = await projectBrowserStatus(live.session);
    expect(status.tabs).toHaveLength(1);
    expect(status.tabs[0]).toMatchObject({ index: 0, active: true });
    expect(status.viewerUrl).toBe("/private/steel/view");
    expect(status.control).toMatchObject({ paused: true });
    expect(m.watch).toHaveBeenCalledWith("https://a.example.test");
  });
  it("returns the same opaque Steel QA proof across host attachments", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STEEL_QA_ALLOW_LIVE", "1");
    vi.stubEnv("STEEL_QA_DB_ISOLATION_ATTESTED", "1");
    vi.stubEnv("G2_QA_DB_ISOLATION_ATTESTED", "1");
    const first = await projectBrowserStatus(live.session);
    expect(first.qaSessionProof).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(first)).not.toContain("steel-c7");
    const second = makeSession().session;
    expect((await projectBrowserStatus(second)).qaSessionProof).toBe(first.qaSessionProof);
    second.steelId = "steel-other";
    expect((await projectBrowserStatus(second)).qaSessionProof).not.toBe(first.qaSessionProof);
    second.steelId = "steel-c7";
    second.owner = "other@project-agent.test";
    expect((await projectBrowserStatus(second)).qaSessionProof).not.toBe(first.qaSessionProof);
  });
  it("hides Steel QA proof outside explicitly attested isolated nonproduction QA", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STEEL_QA_ALLOW_LIVE", "1");
    vi.stubEnv("STEEL_QA_DB_ISOLATION_ATTESTED", "1");
    vi.stubEnv("G2_QA_DB_ISOLATION_ATTESTED", "1");
    const visible = await projectBrowserStatus(live.session);
    expect(visible.qaSessionProof).toMatch(/^[a-f0-9]{24}$/);
    for (const [name, value] of [
      ["NODE_ENV", "production"],
      ["STEEL_QA_ALLOW_LIVE", "0"],
      ["STEEL_QA_DB_ISOLATION_ATTESTED", "0"],
      ["G2_QA_DB_ISOLATION_ATTESTED", "0"],
      ["PROJECT_AGENT_STEEL_BROWSER", "0"],
    ]) {
      vi.stubEnv(name, value);
      expect((await projectBrowserStatus(live.session)).qaSessionProof).toBeUndefined();
      vi.stubEnv(name, name === "NODE_ENV" ? "test" : "1");
    }
    live.session.steelId = undefined;
    expect((await projectBrowserStatus(live.session)).qaSessionProof).toBeUndefined();
    live.session.steelId = "steel-c7"; live.session.persistent = false;
    expect((await projectBrowserStatus(live.session)).qaSessionProof).toBeUndefined();
  });

});
