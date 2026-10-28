import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  active: vi.fn(), withOp: vi.fn(), projectOp: vi.fn(), resolve: vi.fn(),
  status: vi.fn(), begin: vi.fn(), complete: vi.fn(), notify: vi.fn(),
  claim: vi.fn(), take: vi.fn(), release: vi.fn(), keep: vi.fn(),
  takeover: vi.fn(), handback: vi.fn(), watch: vi.fn(), capture: vi.fn(),
  setWatch: vi.fn(), assertFrame: vi.fn(), clearFrame: vi.fn(),
  sharedPage: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: m.active, withBrowserOp: m.withOp,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-sessions", () => ({
  projectBrowserOperation: m.projectOp,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/task-browser", () => ({
  resolveTaskBrowser: m.resolve, taskBrowserControlStatus: m.status,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/control", () => ({
  beginBrowserIntervention: m.begin, completeBrowserIntervention: m.complete,
  notifyBrowserIntervention: m.notify, claimHumanBrowserAction: m.claim,
  takeBrowserControl: m.take, releaseBrowserControl: m.release,
  keepBrowserControl: m.keep,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/loop-state", () => ({
  noteBrowserLoopTakeover: m.takeover, noteBrowserLoopHandback: m.handback,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/watch", () => ({
  browserWatchStatus: m.watch, captureBrowserWatch: m.capture,
  setBrowserWatch: m.setWatch,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/shared-frame", () => ({
  assertSharedFrame: m.assertFrame, clearSharedFrame: m.clearFrame,
  sharedActivePage: m.sharedPage,
}));
import { humanBrowserOperation, parseHumanBrowserAction } from
  "../../lib/project-agent/runtime/browser-agent/manual";

const id = "pat_012345abcdef", chat = "qa-manual";
let page: any, session: any;
beforeEach(() => {
  vi.clearAllMocks();
  page = {
    viewportSize: vi.fn(() => ({ width: 1000, height: 800 })),
    evaluate: vi.fn(async (_fn: unknown, arg?: { px: number; py: number }) =>
      arg?.px !== undefined ? { tag: "BUTTON", label: "Open menu" } : false),
    waitForLoadState: vi.fn(async () => {}),
    mouse: { click: vi.fn(async () => {}), wheel: vi.fn(async () => {}) },
    keyboard: { insertText: vi.fn(async () => {}), press: vi.fn(async () => {}) },
  };
  session = { page, owner: "owner@example.test", persistent: false };
  m.active.mockReturnValue(session);
  m.resolve.mockResolvedValue(session);
  m.status.mockResolvedValue({ paused: true });
  m.claim.mockReturnValue(true);
  m.watch.mockReturnValue({ watching: true, sequence: 12 });
  m.withOp.mockImplementation(async (_session: unknown, fn: () => Promise<unknown>) => fn());
  m.capture.mockResolvedValue(undefined);
  m.clearFrame.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Manual Browser risk-checked actions", () => {
  it("rejects malformed control input and unsafe coordinates", () => {
    for (const value of [null, [], {}, { op: "click", x: -0.1, y: 0, frame: 1 },
      { op: "click", x: Infinity, y: 0, frame: 1 },
      { op: "click", x: 1, y: 1, frame: 1.4 },
      { op: "type", text: "\u0000" }, { op: "type", text: "x".repeat(601) },
      { op: "key", key: "Control+L" }, { op: "scroll", direction: "sideways" }])
      expect(parseHumanBrowserAction(value)).toBeNull();
    expect(parseHumanBrowserAction({ op: "click", x: 0, y: 1, frame: 1 }))
      .toMatchObject({ op: "click", x: 0, y: 1, frame: 1 });
    expect(parseHumanBrowserAction({ op: "key", key: "Escape" }))
      .toEqual({ op: "key", key: "Escape" });
  });
  it("refuses missing sessions and cross-owner project sessions", async () => {
    m.active.mockReturnValueOnce(undefined);
    expect((await humanBrowserOperation(id, chat, { op: "takeover" })).error)
      .toMatch(/has not opened/);
    expect((await humanBrowserOperation(id, chat, { op: "takeover" },
      { projectId: "qa", owner: "other@example.test" })).error).toMatch(/owner mismatch/);
    expect(m.take).not.toHaveBeenCalled();
  });
  it("takes and releases control, capturing Watch without clicking the page", async () => {
    expect(await humanBrowserOperation(id, chat, { op: "takeover" }))
      .toMatchObject({ ok: true, paused: true });
    expect(m.take).toHaveBeenCalledWith(id);
    expect(m.capture).toHaveBeenCalledWith(id, page, "human_takeover");
    expect(m.notify).toHaveBeenCalledWith(id);
    expect(await humanBrowserOperation(id, chat, { op: "release" }))
      .toMatchObject({ ok: true, paused: false });
    expect(m.release).toHaveBeenCalledWith(id);
    expect(m.clearFrame).toHaveBeenCalledWith(id);
    expect(page.mouse.click).not.toHaveBeenCalled();
  });
  it("rolls back a failed takeover instead of retaining manual control", async () => {
    m.withOp.mockRejectedValueOnce(new Error("Browser operation busy"));
    expect((await humanBrowserOperation(id, chat, { op: "takeover" })).error)
      .toMatch(/busy/);
    expect(m.release).toHaveBeenCalledWith(id);
    expect(m.notify).not.toHaveBeenCalled();
  });
  it("refuses input before takeover and when rate limit is exhausted", async () => {
    m.status.mockResolvedValueOnce({ paused: false });
    expect((await humanBrowserOperation(id, chat,
      { op: "type", text: "Hello" })).error).toMatch(/Take control/);
    m.claim.mockReturnValueOnce(false);
    expect((await humanBrowserOperation(id, chat,
      { op: "type", text: "Hello" })).error).toMatch(/limit reached/);
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
  });
  it("rejects a stale screenshot and finishes intervention cleanup", async () => {
    const result = await humanBrowserOperation(id, chat,
      { op: "click", x: 0.3, y: 0.2, frame: 11 });
    expect(result.error).toMatch(/screenshot is stale/);
    expect(page.mouse.click).not.toHaveBeenCalled();
    expect(m.begin).toHaveBeenCalledWith(id);
    expect(m.complete).toHaveBeenCalledWith(id);
  });
  it("requires a matching one-time ticket for destructive click", async () => {
    page.evaluate.mockImplementation(async (_fn: unknown, arg?: { px: number }) =>
      arg?.px !== undefined ? { tag: "BUTTON", label: "Delete account" } : false);
    const action = { op: "click" as const, x: 0.25, y: 0.5, frame: 12 };
    const pending = await humanBrowserOperation(id, chat, action);
    expect(pending.error).toMatch(/Confirm this high-impact/);
    expect(pending.approvalTicket).toMatch(/^[a-f0-9-]{36}$/);
    expect(page.mouse.click).not.toHaveBeenCalled();
    const wrong = await humanBrowserOperation(id, chat, {
      ...action, x: 0.26, approvalTicket: pending.approvalTicket,
    });
    expect(wrong.error).toMatch(/Confirm/);
    const approved = await humanBrowserOperation(id, chat, {
      ...action, x: 0.26, approvalTicket: wrong.approvalTicket,
    });
    expect(approved).toMatchObject({ ok: true });
    expect(page.mouse.click).toHaveBeenCalledWith(260, 400);
  });
  it("never inserts text into sensitive credential or payment fields", async () => {
    page.evaluate.mockResolvedValueOnce({
      tag: "input", type: "password", autocomplete: "current-password", name: "secret",
    });
    expect((await humanBrowserOperation(id, chat,
      { op: "type", text: "secret" })).error).toMatch(/non-sensitive/);
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
    page.evaluate.mockResolvedValueOnce({
      tag: "textarea", type: "", autocomplete: "", name: "notes",
    });
    expect(await humanBrowserOperation(id, chat,
      { op: "type", text: "Public note" })).toMatchObject({ ok: true });
    expect(page.keyboard.insertText).toHaveBeenCalledWith("Public note");
  });
  it("permits Enter only for a search box, with bounded safe keys", async () => {
    page.evaluate.mockResolvedValueOnce(false);
    expect((await humanBrowserOperation(id, chat,
      { op: "key", key: "Enter" })).error).toMatch(/only in a search/);
    expect(page.keyboard.press).not.toHaveBeenCalled();
    page.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await humanBrowserOperation(id, chat,
      { op: "key", key: "Enter" })).toMatchObject({ ok: true });
    expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
  });
});
