import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ access: vi.fn(), task: vi.fn(), status: vi.fn(),
  image: vi.fn(), active: vi.fn(), setWatch: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: mocks.access }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mocks.task }));
vi.mock("@/lib/project-agent/runtime/browser-agent/watch", () => ({
  browserWatchStatus: mocks.status, browserWatchImage: mocks.image,
  setBrowserWatch: mocks.setWatch, captureBrowserWatch: mocks.capture,
}));
vi.mock("@/lib/project-agent/runtime/browser-agent/session", () => ({
  activeBrowserSession: mocks.active,
}));
import { GET } from "../../app/api/projects/[projectId]/agent/tasks/[taskId]/browser/route";
import { recordBrowserLoopOutcome, clearBrowserLoop, authorizeBrowserLoopAction } from "../../lib/project-agent/runtime/browser-agent/loop-state";

const taskId = "pat_123456789abc";
const params = { params: { projectId: "project-qa", taskId } };
const url = "http://localhost/api/projects/project-qa/agent/tasks/" + taskId + "/browser";
beforeEach(() => {
  vi.stubEnv("PROJECT_AGENT_P8_LOOP", "1");
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ callerEmail: "owner@example.test" });
  mocks.task.mockResolvedValue({ id: taskId, projectId: "project-qa",
    ownerEmail: "owner@example.test", status: "running" });
  mocks.status.mockReturnValue({ watching: true, hasImage: false });
});
afterEach(() => { clearBrowserLoop(taskId); vi.unstubAllEnvs(); });
describe("P8 browser loop ledger privacy and Project permissions", () => {
  it("shows only bounded operation metadata to task owner", async () => {
    authorizeBrowserLoopAction(taskId, "click");
    recordBrowserLoopOutcome(taskId, "click", "unverified");
    const res = await GET(new NextRequest(url), params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.loop).toMatchObject({ actions: 1, unverified: 1 });
    expect(JSON.stringify(data)).not.toContain("password");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("never shows collaborator another owner's browser loop metadata", async () => {
    authorizeBrowserLoopAction(taskId, "click");
    mocks.access.mockResolvedValue({ callerEmail: "other@example.test" });
    const res = await GET(new NextRequest(url), params);
    expect(res.status).toBe(404);
    expect((await res.json()).loop).toBeUndefined();
  });
  it("omits P8 telemetry when feature flag is disabled", async () => {
    vi.stubEnv("PROJECT_AGENT_P8_LOOP", "0");
    const res = await GET(new NextRequest(url), params);
    expect(res.status).toBe(200);
    expect((await res.json()).loop).toBeUndefined();
  });
});
