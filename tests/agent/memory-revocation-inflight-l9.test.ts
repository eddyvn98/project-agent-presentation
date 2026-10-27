import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), hindsight: vi.fn(), xerj: vi.fn() }));
vi.mock("@/lib/capabilities/project-sharing", () => ({ getProjectAccess: mocks.access }));
vi.mock("../../lib/project-agent/hindsight/memory", () => ({
  recallProjectHindsight: mocks.hindsight,
}));
vi.mock("../../lib/project-agent/xerj/search", () => ({
  prefetchProjectXerj: mocks.xerj,
}));
import { loadAgentSearchContext } from "../../lib/project-agent/xerj/agent-context";
describe("L9 in-flight revocation and untrusted memory handling", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("drops both responses if membership is revoked during retrieval", async () => {
    let finish!: (value: string) => void;
    const delayed = new Promise<string>(resolve => { finish = resolve; });
    mocks.access.mockResolvedValueOnce({ role: "EDIT" }).mockResolvedValueOnce(null);
    mocks.hindsight.mockReturnValue(delayed);
    mocks.xerj.mockResolvedValue("INDEXED_SECRET");
    const pending = loadAgentSearchContext({
      projectId: "a", ownerEmail: "member@test.example", query: "project code" });
    await vi.waitFor(() => expect(mocks.hindsight).toHaveBeenCalledTimes(1));
    finish("HINDSIGHT_SECRET");
    expect(await pending).toEqual({ hindsightMemory: "", xerjContext: "" });
    expect(mocks.access).toHaveBeenCalledTimes(2);
  });
  it("fails closed for aborted retrieval and missing authorization", async () => {
    const controller = new AbortController();
    mocks.access.mockResolvedValue({ role: "OWNER" });
    mocks.hindsight.mockImplementation(async () => { controller.abort(); return "PRIVATE"; });
    mocks.xerj.mockResolvedValue("PRIVATE");
    expect(await loadAgentSearchContext({ projectId: "a", ownerEmail: "alice@example.test",
      query: "find code", signal: controller.signal })).toEqual({
      hindsightMemory: "", xerjContext: "",
    });
  });
  it("keeps available sources if the other provider fails but access remains valid", async () => {
    mocks.access.mockResolvedValue({ role: "OWNER" });
    mocks.hindsight.mockRejectedValue(new Error("offline"));
    mocks.xerj.mockResolvedValue("<project_xerj_search>Escaped reference</project_xerj_search>");
    expect((await loadAgentSearchContext({ projectId: "a", ownerEmail: "owner@test.example",
      query: "find code" })).hindsightMemory).toBe("");
    expect(mocks.access).toHaveBeenCalledTimes(2);
  });
});
