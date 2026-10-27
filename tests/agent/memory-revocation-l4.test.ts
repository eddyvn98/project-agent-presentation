import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), hindsight: vi.fn(), xerj: vi.fn() }));
vi.mock("@/lib/capabilities/project-sharing", () => ({
  getProjectAccess: mocks.access,
}));
vi.mock("../../lib/project-agent/hindsight/memory", () => ({
  recallProjectHindsight: mocks.hindsight,
}));
vi.mock("../../lib/project-agent/xerj/search", () => ({
  prefetchProjectXerj: mocks.xerj,
}));
import { loadAgentSearchContext } from "../../lib/project-agent/xerj/agent-context";
import { coordinateMemorySources } from "../../lib/project-agent/memory-coordination";
describe("L4 multi-user memory revocation and scope isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hindsight.mockImplementation(async (x: { projectId: string }) => "long-memory:" + x.projectId);
    mocks.xerj.mockImplementation(async (projectId: string) => "indexed:" + projectId);
  });
  it.each([5, 20])("does not leak when %i users lose permission", async count => {
    const active = new Set(Array.from({ length: count }, (_, i) => "user-" + i + "@example.test"));
    mocks.access.mockImplementation(async (_project: string, user: string) =>
      active.has(user) ? { role: "EDIT" } : null);
    const job = (user: string) => loadAgentSearchContext({
      projectId: "project-a", ownerEmail: user, query: "find code" });
    for (const user of active) {
      expect((await job(user)).hindsightMemory).toBe("long-memory:project-a");
    }
    const revoked = [...active].filter((_, i) => i % 2 === 0);
    revoked.forEach(u => active.delete(u));
    const baseline = mocks.hindsight.mock.calls.length;
    for (const user of revoked) {
      expect(await job(user)).toEqual({ hindsightMemory: "", xerjContext: "" });
    }
    expect(mocks.hindsight).toHaveBeenCalledTimes(baseline);
    expect(mocks.xerj).toHaveBeenCalledTimes(baseline);
  });
  it("does not query Hindsight/XERJ when owner access check throws or is missing", async () => {
    mocks.access.mockRejectedValue(new Error("membership service unavailable"));
    expect(await loadAgentSearchContext({
      projectId: "project-b", ownerEmail: "alice@example.test", query: "source" }))
      .toEqual({ hindsightMemory: "", xerjContext: "" });
    expect(mocks.xerj).not.toHaveBeenCalled();
    expect(mocks.hindsight).not.toHaveBeenCalled();
  });
  it("keeps optional personal memory separate from Project sources", () => {
    const gathered = coordinateMemorySources({
      sameChat: "project-a chat", projectAgentHistory: "project-a task",
      projectChats: "Shared Project history",
      personalChats: "", hindsightMemory: "", xerjContext: "",
    });
    expect(gathered.personalChats).toBe("");
    expect(gathered.projectAgentHistory).not.toContain("personal");
  });
});
