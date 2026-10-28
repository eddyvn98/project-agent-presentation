import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  attach: vi.fn(), close: vi.fn(), get: vi.fn(), withOp: vi.fn(),
  permission: vi.fn(), policy: vi.fn(), health: vi.fn(),
  loop: vi.fn(), watch: vi.fn(), finish: vi.fn(),
  idle: vi.fn(), clearStall: vi.fn(), approval: vi.fn(),
  snapshotAfter: vi.fn(), publicUrl: vi.fn(),
  observe: vi.fn(), wait: vi.fn(), mask: vi.fn(), uploadImage: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-sessions", () => ({
  agentBrowserSession: m.attach,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  getBrowserSession: m.get, withBrowserOp: m.withOp,
  scheduleIdleClose: m.idle, restorePersonalBrowserSession: vi.fn(),
  assertPersonalBrowserPermission: m.permission,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/policy-hook", () => ({
  checkAgentBrowserPolicy: m.policy,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/browser-session-health", () => ({
  checkSavedBrowserHealth: m.health,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/loop-step", () => ({
  runP8BrowserLoopStep: m.loop,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/watch", () => ({
  captureBrowserWatch: m.watch, finishBrowserWatch: m.finish,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/stall-guard", () => ({
  browserRetryStalled: vi.fn(() => false), recordBrowserDomFailure: vi.fn(),
  clearBrowserStall: m.clearStall, P8_STALL_GUIDANCE: "Stalled",
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/snapshot-after-navigation", () => ({
  snapshotAfterNavigation: m.snapshotAfter,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/browser-wait", () => ({
  waitForPageOrIntervention: m.wait,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/visual", () => ({
  invalidateVisualFrame: vi.fn(), observeVisualFrame: m.observe,
  visualClick: vi.fn(), visualType: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/privacy", () => ({
  sensitiveScreenshotMask: m.mask,
}));
vi.mock("../../lib/project-agent/runtime/model", () => ({
  uploadRuntimeImage: m.uploadImage,
}));
vi.mock("../../lib/project-agent/task-store", () => ({
  writeProjectAgentFile: m.writeFile,
}));
vi.mock("../../lib/project-agent/agent-approvals", () => ({
  requireAgentApproval: m.approval,
}));
vi.mock("../../lib/project-agent/runtime/web-security", () => ({
  assertPublicHttpUrl: m.publicUrl,
}));
import { runBrowserAction } from "../../lib/project-agent/runtime/browser-agent/index";

const id = "pat_001122aabbcc";
const input = { chatId: "qa-browser", taskId: id, user: "synthetic",
  projectId: "project-qa", ownerEmail: "owner@example.test" };
let session: any, click: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PROJECT_AGENT_BROWSER_AGENT", "1");
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
  vi.stubEnv("PROJECT_AGENT_P8_LOOP", "0");
  vi.stubEnv("PROJECT_AGENT_P8_STALL_GUARD", "0");
  vi.stubEnv("PROJECT_AGENT_ALLOW_UPLOADS", "0");
  click = vi.fn(async () => {});
  const locator = { innerText: vi.fn(async () => "Public page"), click,
    boundingBox: vi.fn(async () => null), fill: vi.fn(), setInputFiles: vi.fn(),
    ariaSnapshot: vi.fn(async () => "Aria tree"), evaluateAll: vi.fn(async () => false),
  };
  const page = { url: vi.fn(() => "https://site.example.test/"),
    title: vi.fn(async () => "Page"), locator: vi.fn(() => locator),
    viewportSize: vi.fn(() => ({ width: 1200, height: 800 })),
    screenshot: vi.fn(async () => Buffer.from("fake-jpeg")),
    goto: vi.fn(), evaluate: vi.fn(async () => []), goBack: vi.fn(),
    keyboard: { press: vi.fn() } };
  session = { page, context: { pages: vi.fn(() => [page]) },
    refs: new Map([["e1", "#submit"]]), lastSnapshot: '[ref=e1] button "Delete account"',
    snapshotUrl: page.url(), authMode: undefined, persistent: false,
    console: [], network: [], close: m.close, g2RefEpoch: undefined };
  m.attach.mockResolvedValue({ session, id });
  m.get.mockResolvedValue(session);
  m.withOp.mockImplementation(async (_session: unknown, fn: () => Promise<unknown>) => fn());
  m.loop.mockImplementation(async (_id: string, _session: unknown, _action: unknown,
    _step: unknown, fn: () => Promise<unknown>) => fn());
  m.health.mockResolvedValue(null);
  m.snapshotAfter.mockResolvedValue("Fresh browser snapshot");
  m.approval.mockResolvedValue({ allowed: false, message: "Approval denied" });
  m.uploadImage.mockResolvedValue({ type: "image", url: "synthetic" });
  m.wait.mockResolvedValue({ interrupted: false, text: "Settled" });
});
afterEach(() => vi.unstubAllEnvs());
describe("Browser Agent index: authority and external-effect decision branches", () => {
  it("fails closed when browser feature disabled before opening a session", async () => {
    vi.stubEnv("PROJECT_AGENT_BROWSER_AGENT", "0");
    expect(await runBrowserAction(input as never, { action: "browser", op: "open",
      url: "https://site.example.test/" }, 1)).toMatchObject({ failed: true });
    expect(m.attach).not.toHaveBeenCalled();
  });
  it("detaches a shared browser without closing human tabs", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
    const result = await runBrowserAction(input as never, { action: "browser", op: "close" }, 1);
    expect(result.text).toMatch(/tabs remain open/);
    expect(m.get).not.toHaveBeenCalled();
    expect(m.close).not.toHaveBeenCalled();
  });
  it("closes a private session and stops Watch", async () => {
    const result = await runBrowserAction(input as never, { action: "browser", op: "close" }, 1);
    expect(result.text).toBe("Browser session closed.");
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.finish).toHaveBeenCalledWith(id);
  });
  it("reports failed browser attachment instead of retrying unsafe actions", async () => {
    m.attach.mockRejectedValueOnce(new Error("Project browser unavailable"));
    const result = await runBrowserAction(input as never, { action: "browser", op: "click",
      ref: "e1" }, 2);
    expect(result.text).toMatch(/browser unavailable/);
    expect(result.failed).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });
  it("rejects a read-only login mutation before its operation lock", async () => {
    session.authMode = "read";
    const result = await runBrowserAction(input as never, { action: "browser", op: "click",
      ref: "e1" }, 3);
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toMatch(/read-only/);
    expect(m.withOp).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
  it("stops at explicit approval for an irreversible click", async () => {
    const result = await runBrowserAction(input as never, { action: "browser", op: "click",
      ref: "e1" }, 4);
    expect(m.approval).toHaveBeenCalled();
    expect(result).toMatchObject({ text: "Approval denied", failed: true });
    expect(click).not.toHaveBeenCalled();
  });
  it("prevents uploads when deployment policy disables the capability", async () => {
    const result = await runBrowserAction(input as never, { action: "browser", op: "upload",
      ref: "e1", path: "/work/inputs/private.txt" }, 5);
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toMatch(/uploads are disabled/);
    expect(click).not.toHaveBeenCalled();
  });
  it("returns a Stop/intervention receipt without declaring the wait successful", async () => {
    m.wait.mockResolvedValueOnce({ interrupted: true, text: "Human took control" });
    const result = await runBrowserAction(input as never, { action: "browser", op: "wait",
      seconds: 3 }, 6);
    expect(result).toMatchObject({ failed: true, text: "Human took control" });
  });
  it("rejects a ninth tab and preserves the current tab", async () => {
    session.context.pages = () => Array.from({ length: 8 }, () => session.page);
    const original = session.page;
    const result = await runBrowserAction(input as never, { action: "browser", op: "new_tab" }, 7);
    expect(result).toMatchObject({ failed: true });
    expect(result.text).toMatch(/at most eight tabs/);
    expect(session.page).toBe(original);
  });
  it("sends screenshots through the masked upload path without submitting data", async () => {
    const result = await runBrowserAction(input as never, { action: "browser", op: "screenshot" }, 8);
    expect(result.text).toBe("Browser screenshot captured.");
    expect(m.mask).toHaveBeenCalledWith(session.page);
    expect(session.page.screenshot).toHaveBeenCalled();
    expect(m.uploadImage).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
});
