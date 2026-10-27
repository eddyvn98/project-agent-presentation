import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@/lib/capabilities/project-sharing", () => ({ getProjectAccess: state.access }));
import { hindsightDocumentId } from "../../lib/project-agent/hindsight/transport";
import { retainProjectHindsight } from "../../lib/project-agent/hindsight/memory";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const task = {
  id: "pat_a1b2c3d4e5f6", projectId: "project-test",
  ownerEmail: "owner@example.test", projectOwnerEmail: "owner@example.test",
  prompt: "Use blue", userPrompt: "Use blue", resultText: "Approved blue",
  status: "done", createdAt: "2026-10-27T00:00:00Z",
  updatedAt: "2026-10-27T00:02:00Z", log: [],
} as ProjectAgentTask;
const config = () => {
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_ENABLED", "1");
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_API_URL", "http://localhost:8888");
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("L8B deleting a Project while long-term memory is being retained", () => {
  it("compensates remote POST if Project access is revoked before it finishes", async () => {
    config();
    let finishPost!: () => void;
    const gate = new Promise<void>(resolve => { finishPost = resolve; });
    state.access.mockReset().mockResolvedValueOnce({ role: "OWNER" })
      .mockResolvedValueOnce(null);
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init: RequestInit) => {
      requests.push({ method: init.method!, url: String(url) });
      if (init.method === "POST") { await gate; return new Response("{}", { status: 200 }); }
      return new Response(null, { status: 204 });
    }));
    const pending = retainProjectHindsight(task);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    finishPost();
    expect(await pending).toBe(false);
    expect(requests.map(x => x.method)).toEqual(["POST", "DELETE"]);
    expect(requests[1].url).toContain(hindsightDocumentId(task.id));
    expect(state.access).toHaveBeenCalledTimes(2);
  });
  it("does not send memory before an initial access denial", async () => {
    config(); state.access.mockReset().mockResolvedValue(null);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await retainProjectHindsight(task)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains exactly once if access remains valid before and after write", async () => {
    config(); state.access.mockReset().mockResolvedValue({ role: "OWNER" });
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await retainProjectHindsight(task)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.access).toHaveBeenCalledTimes(2);
  });
});
