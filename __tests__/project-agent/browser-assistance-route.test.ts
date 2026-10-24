import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ access: vi.fn(), task: vi.fn(), operation: vi.fn() }));
vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: mock.access }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mock.task }));
vi.mock("@/lib/project-agent/runtime/browser-agent/manual", () => ({
  parseHumanBrowserAction: (data: unknown) => data && typeof data === "object" ? data : null,
  humanBrowserOperation: mock.operation,
}));
import { POST } from "../../app/api/projects/[projectId]/agent/tasks/[taskId]/browser/control/route";
const url = "http://localhost/api/projects/project-a/agent/tasks/pat_123456789abc/browser/control";
const params = { params: { projectId: "project-a", taskId: "pat_123456789abc" } };
const req = (origin = "http://localhost") => new NextRequest(url, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ op: "takeover" }),
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
function setup(email: string) {
  mock.access.mockResolvedValue({ callerEmail: email });
  mock.task.mockResolvedValue({ id: "pat_123456789abc", projectId: "project-a", ownerEmail: "owner@example.test", status: "running", conversationId: "thread-a" });
  mock.operation.mockResolvedValue({ ok: true, paused: true });
  vi.stubEnv("PROJECT_AGENT_RUNTIME", "sandbox"); vi.stubEnv("PROJECT_AGENT_BROWSER_AGENT", "1");
}
describe("authenticated human browser takeover", () => {
  it("never allows a Project collaborator to operate another owner's browser", async () => {
    setup("other@example.test");
    expect((await POST(req(), params)).status).toBe(404);
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it("requires same-origin POST and an active task", async () => {
    setup("owner@example.test");
    expect((await POST(req("https://attacker.example"), params)).status).toBe(403);
    expect(mock.operation).not.toHaveBeenCalled();
    mock.task.mockResolvedValue({ id: "pat_123456789abc", ownerEmail: "owner@example.test", projectId: "project-a", status: "done" });
    expect((await POST(req(), params)).status).toBe(409);
  });
  it("applies a valid takeover to the conversation's active Playwright session", async () => {
    setup("owner@example.test");
    expect((await POST(req(), params)).status).toBe(200);
    expect(mock.operation).toHaveBeenCalledWith("pat_123456789abc", "thread-a", { op: "takeover" });
  });
});
