import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  access: vi.fn(), task: vi.fn(), status: vi.fn(), image: vi.fn(),
  watch: vi.fn(), active: vi.fn(), capture: vi.fn(),
}));
vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: mocks.access }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mocks.task }));
vi.mock("@/lib/project-agent/runtime/browser-agent/watch", () => ({
  browserWatchImage: mocks.image, browserWatchStatus: mocks.status,
  setBrowserWatch: mocks.watch, captureBrowserWatch: mocks.capture,
}));
vi.mock("@/lib/project-agent/runtime/browser-agent/session", () => ({ activeBrowserSession: mocks.active }));
import { GET, POST } from "../../app/api/projects/[projectId]/agent/tasks/[taskId]/browser/route";

const params = { params: { projectId: "project-a", taskId: "pat_123456789abc" } };
const url = "http://localhost/api/projects/project-a/agent/tasks/pat_123456789abc/browser";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
function authorized(email = "owner@example.test") {
  mocks.access.mockResolvedValue({ callerEmail: email, ownerEmail: email });
  mocks.task.mockResolvedValue({ projectId: "project-a", ownerEmail: "owner@example.test", status: "running" });
  mocks.active.mockReturnValue(null);
  mocks.status.mockReturnValue({ watching: true, sequence: 1, hasImage: true, action: "click" });
}
function request(method = "GET", data?: unknown, origin = "http://localhost") {
  return new NextRequest(url, {
    method, headers: method === "POST" ? { "Content-Type": "application/json", Origin: origin } : {},
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}

describe("Project Agent browser preview API permissions", () => {
  it("never returns another collaborator's browser screenshot", async () => {
    authorized("collaborator@example.test");
    const res = await GET(new NextRequest(url + "?image=1"), params);
    expect(res.status).toBe(404);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.watch).not.toHaveBeenCalled();
  });
  it("serves only the task initiator's ephemeral frame, without cache", async () => {
    authorized();
    mocks.image.mockReturnValue(Buffer.from([255, 216, 255, 217]));
    const res = await GET(new NextRequest(url + "?image=1"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("only active tasks may opt in to watching, and opt-out purges the session", async () => {
    authorized();
    vi.stubEnv("PROJECT_AGENT_RUNTIME", "sandbox");
    vi.stubEnv("PROJECT_AGENT_BROWSER_AGENT", "1");
    const yes = await POST(request("POST", { watch: true }), params);
    expect(yes.status).toBe(200);
    expect(mocks.watch).toHaveBeenCalledWith("pat_123456789abc", true);
    const no = await POST(request("POST", { watch: false }), params);
    expect(no.status).toBe(200);
    expect(mocks.watch).toHaveBeenCalledWith("pat_123456789abc", false);
    mocks.task.mockResolvedValue({ projectId: "project-a", ownerEmail: "owner@example.test", status: "done" });
    const late = await POST(request("POST", { watch: true }), params);
    expect(late.status).toBe(409);
  });
  it("refuses cross-origin requests before changing watch state", async () => {
    authorized();
    const res = await POST(request("POST", { watch: true }, "https://evil.example"), params);
    expect(res.status).toBe(403);
    expect(mocks.watch).not.toHaveBeenCalled();
  });
});
