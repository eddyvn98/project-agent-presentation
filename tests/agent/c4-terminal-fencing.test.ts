import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/lease-fence", () => ({
  assertActiveTaskLease: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { assertActiveTaskLease } from "../../lib/project-agent/lease-fence";
import { commitTaskTerminalIfActive, markTaskRunningIfQueued,
  stopTaskIfActive, PROJECT_AGENT_TASKS_COLLECTION }
  from "../../lib/project-agent/task-terminal-guard";

const task = { id: "pat_123456789abc", ownerEmail: "owner@project-agent.test",
  projectId: "proj_c4" };
const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertActiveTaskLease).mockResolvedValue();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: (name: string) => {
    if (name !== PROJECT_AGENT_TASKS_COLLECTION) throw new Error("unexpected collection");
    return { updateOne };
  } } as never);
});
describe("C4 terminal/Stop/recovery safety paths", () => {
  it("rejects malformed task IDs and contradictory completion statuses before touching Mongo", async () => {
    const malformed = { ...task, id: "../../foreign" };
    await expect(stopTaskIfActive(malformed)).rejects.toThrow(/Invalid Stop task id/);
    await expect(markTaskRunningIfQueued(malformed, "boot")).rejects.toThrow(/Invalid queued task id/);
    await expect(commitTaskTerminalIfActive(malformed, "done", {}))
      .rejects.toThrow(/Invalid terminal task id/);
    await expect(commitTaskTerminalIfActive(task, "done", { status: "failed" }))
      .rejects.toThrow(/Terminal status mismatch/);
    expect(getMongoAiDb).not.toHaveBeenCalled();
  });
  it("fails closed when a recovery worker's lease is revoked, without making a write", async () => {
    vi.mocked(assertActiveTaskLease).mockRejectedValue(
      new Error("MongoDB task lease expired or changed"));
    await expect(commitTaskTerminalIfActive(task, "done", { resultText: "late" }))
      .resolves.toBe(false);
    await expect(markTaskRunningIfQueued(task, "stale-boot")).resolves.toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("propagates unknown lease/database errors rather than pretending success", async () => {
    vi.mocked(assertActiveTaskLease).mockRejectedValueOnce(new Error("Mongo unavailable"));
    await expect(commitTaskTerminalIfActive(task, "done", {}))
      .rejects.toThrow(/Mongo unavailable/);
    vi.mocked(assertActiveTaskLease).mockRejectedValueOnce(new Error("Mongo unavailable"));
    await expect(markTaskRunningIfQueued(task, "boot")).rejects.toThrow(/Mongo unavailable/);
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("keeps owner and project identity in every terminal transition filter", async () => {
    await commitTaskTerminalIfActive(task, "done", { logLine: "safe" });
    await markTaskRunningIfQueued(task, "boot");
    await stopTaskIfActive(task);
    expect(updateOne).toHaveBeenCalledTimes(3);
    for (const [filter] of updateOne.mock.calls) {
      expect(filter).toMatchObject({ _id: task.id, ownerEmail: task.ownerEmail,
        projectId: task.projectId, cancelled: { $ne: true } });
    }
    expect(updateOne.mock.calls[0][0].status).toBe("running");
    expect(updateOne.mock.calls[1][0].status).toBe("queued");
    expect(updateOne.mock.calls[2][0].status).toEqual({ $in: ["queued", "running"] });
  });
  it("reports losing a CAS race for Stop, restart, and terminal completion", async () => {
    updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    expect(await stopTaskIfActive(task)).toBe(false);
    expect(await markTaskRunningIfQueued(task, "boot")).toBe(false);
    expect(await commitTaskTerminalIfActive(task, "done", {})).toBe(false);
  });
});
