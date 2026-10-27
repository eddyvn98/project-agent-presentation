import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({
  auth: vi.fn(), statuses: vi.fn(), purge: vi.fn(), remove: vi.fn(),
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (value: unknown, options?: { status?: number }) =>
    new Response(JSON.stringify(value), { status: options?.status ?? 200,
      headers: { "Content-Type": "application/json" } }) },
}));
vi.mock("@/lib/projects/api-access", () => ({
  resolveProjectRequestAccess: fixtures.auth,
}));
vi.mock("@/services/mongodb/projectAgentTasks.repo", () => ({
  listProjectAgentConversationStatuses: fixtures.statuses, patchProjectAgentConversation: vi.fn(),
}));
vi.mock("../../lib/project-agent/hindsight/cleanup", () => ({
  clearHindsightChatMemory: fixtures.purge,
}));
vi.mock("../../lib/project-agent/task-store", () => ({
  deleteProjectAgentConversation: fixtures.remove,
}));
import { DELETE } from "../../app/api/projects/[projectId]/agent/chats/route";

const ctx = { params: { projectId: "project-l8b" } };
const req = () => ({ nextUrl: new URL("http://localhost/api/projects/project-l8b/agent/chats?conversationId=chat-a") }) as never;
describe("L8B host chat-deletion route: active task and in-flight memory cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.auth.mockResolvedValue({ callerEmail: "owner@example.test", ownerEmail: "owner@example.test" });
    fixtures.statuses.mockResolvedValue(["failed"]);
    fixtures.purge.mockResolvedValue(undefined);
    fixtures.remove.mockResolvedValue(1);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("returns 409 and preserves all data while the Agent is still running", async () => {
    fixtures.statuses.mockResolvedValue(["done", "running"]);
    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(409);
    expect(fixtures.purge).not.toHaveBeenCalled();
    expect(fixtures.remove).not.toHaveBeenCalled();
  });
  it("waits for long-term memory purge before deleting the local chat", async () => {
    let release!: () => void;
    fixtures.purge.mockImplementation(() => new Promise<void>(done => { release = done; }));
    const pending = DELETE(req(), ctx);
    await vi.waitFor(() => expect(fixtures.purge).toHaveBeenCalledTimes(1));
    expect(fixtures.remove).not.toHaveBeenCalled();
    release();
    expect((await pending).status).toBe(200);
    expect(fixtures.remove).toHaveBeenCalledTimes(1);
    expect(fixtures.purge.mock.invocationCallOrder[0]).toBeLessThan(fixtures.remove.mock.invocationCallOrder[0]);
  });
  it("returns 503 with no local deletion when external memory cleanup fails", async () => {
    fixtures.purge.mockRejectedValue(new Error("Hindsight unavailable"));
    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(503);
    expect(fixtures.remove).not.toHaveBeenCalled();
  });
  it("blocks deletion and external cleanup after Project membership is revoked", async () => {
    fixtures.auth.mockResolvedValue({ response: new Response("Not found", { status: 404 }) });
    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(404);
    expect(fixtures.statuses).not.toHaveBeenCalled();
    expect(fixtures.purge).not.toHaveBeenCalled();
    expect(fixtures.remove).not.toHaveBeenCalled();
  });
});
