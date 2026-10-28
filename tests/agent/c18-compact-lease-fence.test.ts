import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getMongoAiDb: vi.fn(), readProjectAgentTask: vi.fn(),
  claimCompaction: vi.fn(), finishCompaction: vi.fn(), releaseCompaction: vi.fn(),
}));
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: mocks.getMongoAiDb }));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: mocks.readProjectAgentTask,
}));
vi.mock("../../lib/project-agent/compact-lease-core.mjs", () => ({
  claimCompaction: mocks.claimCompaction, finishCompaction: mocks.finishCompaction,
  releaseCompaction: mocks.releaseCompaction, COMPACTION_LEASE_COLLECTION: "qa_compaction",
}));
import { withCompactionLease } from "../../lib/project-agent/compact-lease";
const task = { id: "pat_abcdef123456", projectId: "p-c18",
  ownerEmail: "owner@example.test", conversationId: "chat-c18" };
const live = { ...task, cancelled: false, status: "running" };
afterEach(() => vi.clearAllMocks());
describe("C18 compaction source and ownership fencing", () => {
  it("does not acquire when there is no conversation", async () => {
    expect(await withCompactionLease({ ...task, conversationId: undefined },
      task.id, async () => "model")).toBeUndefined();
    expect(mocks.getMongoAiDb).not.toHaveBeenCalled();
  });
  it("rejects a lost claim without executing any model work", async () => {
    mocks.getMongoAiDb.mockResolvedValue({ collection: vi.fn(() => ({})) });
    mocks.claimCompaction.mockResolvedValue(null);
    const work = vi.fn(async () => "model");
    expect(await withCompactionLease(task, task.id, work)).toBeUndefined();
    expect(work).not.toHaveBeenCalled();
  });
  it("fences stopped or differently owned tasks before and after compaction", async () => {
    mocks.getMongoAiDb.mockResolvedValue({ collection: vi.fn(() => ({})) });
    mocks.claimCompaction.mockResolvedValue({ token: "lease" });
    mocks.readProjectAgentTask.mockResolvedValueOnce({ ...live, cancelled: true });
    const work = vi.fn(async () => "model");
    expect(await withCompactionLease(task, task.id, work)).toBeUndefined();
    expect(work).not.toHaveBeenCalled();
    expect(mocks.releaseCompaction).toHaveBeenCalledTimes(1);
    mocks.readProjectAgentTask.mockResolvedValueOnce(live)
      .mockResolvedValueOnce({ ...live, status: "done" });
    expect(await withCompactionLease(task, task.id, work)).toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);
    expect(mocks.finishCompaction).not.toHaveBeenCalled();
    expect(mocks.releaseCompaction).toHaveBeenCalledTimes(2);
  });
  it("publishes only if CAS acknowledges and always releases a failed worker", async () => {
    mocks.getMongoAiDb.mockResolvedValue({ collection: vi.fn(() => ({})) });
    mocks.claimCompaction.mockResolvedValue({ token: "lease" });
    mocks.readProjectAgentTask.mockResolvedValue(live);
    mocks.finishCompaction.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await withCompactionLease(task, task.id, async () => "snapshot")).toBeUndefined();
    expect(await withCompactionLease(task, task.id, async () => "snapshot")).toBe("snapshot");
    await expect(withCompactionLease(task, task.id, async () => {
      throw new Error("synthetic model outage");
    })).rejects.toThrow(/synthetic model outage/);
    expect(mocks.releaseCompaction).toHaveBeenCalledTimes(3);
  });
});
