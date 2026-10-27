import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-sessions", () => ({
  findProjectBrowser: vi.fn(), projectBrowserKey: vi.fn((project: string, owner: string) =>
    project + ":" + owner.trim().toLowerCase()),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/control", () => ({
  browserControlState: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/project-control-db", () => ({
  readProjectControl: vi.fn(),
}));
import { activeBrowserSession }
  from "../../lib/project-agent/runtime/browser-agent/session";
import { findProjectBrowser }
  from "../../lib/project-agent/runtime/browser-agent/project-sessions";
import { browserControlState } from "../../lib/project-agent/runtime/browser-agent/control";
import { readProjectControl }
  from "../../lib/project-agent/runtime/browser-agent/project-control-db";
import { resolveTaskBrowser, taskBrowserControlStatus }
  from "../../lib/project-agent/runtime/browser-agent/task-browser";

const task = "pat_123456789abc", project = "proj-c5", owner = "owner@project-agent.test";
const local = { owner, persistent: false,
  browser: { isConnected: () => true }, page: { isClosed: () => false } };
const remote = { owner, persistent: true };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "0");
  vi.mocked(activeBrowserSession).mockReturnValue(null);
  vi.mocked(browserControlState).mockReturnValue({ paused: false, revision: 3 } as never);
  vi.mocked(readProjectControl).mockResolvedValue({
    activeTaskId: task, paused: true, revision: 5,
  } as never);
  vi.mocked(findProjectBrowser).mockResolvedValue(remote as never);
});
describe("C5 Browser Agent stale session reattachment", () => {
  it("uses local Stop/takeover status if Steel is disabled", async () => {
    expect(await taskBrowserControlStatus(task, project, owner))
      .toEqual({ paused: false, revision: 3 });
    expect(readProjectControl).not.toHaveBeenCalled();
  });
  it("reattaches only the matching owner to a connected local session", async () => {
    vi.mocked(activeBrowserSession).mockReturnValue(local as never);
    expect(await resolveTaskBrowser(task, project, owner)).toBe(local);
    expect(await resolveTaskBrowser(task, project, "foreign@project-agent.test")).toBeNull();
  });
  it("rejects stale remote task ownership and does not create a new browser", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
    vi.mocked(readProjectControl).mockResolvedValueOnce({
      activeTaskId: "another-task", paused: true, revision: 6,
    } as never);
    expect(await resolveTaskBrowser(task, project, owner)).toBeNull();
    expect(findProjectBrowser).not.toHaveBeenCalled();
  });
  it("drops a remote result when Stop/takeover changed lease during reconnect", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
    vi.mocked(readProjectControl)
      .mockResolvedValueOnce({ activeTaskId: task, paused: false, revision: 3 } as never)
      .mockResolvedValueOnce({ activeTaskId: "other-task", paused: true, revision: 4 } as never);
    expect(await resolveTaskBrowser(task, project, owner)).toBeNull();
    expect(findProjectBrowser).toHaveBeenCalledOnce();
  });
  it("exposes paused state only to the active task, not the old worker", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_BROWSER", "1");
    expect(await taskBrowserControlStatus(task, project, owner))
      .toEqual({ paused: true, revision: 5 });
    expect(await taskBrowserControlStatus("stale-task", project, owner))
      .toEqual({ paused: false, revision: 5 });
  });
});
