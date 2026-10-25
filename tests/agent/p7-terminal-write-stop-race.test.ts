import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { runWithLeaseFence } from "../../lib/project-agent/lease-fence";
import { commitTaskTerminalIfActive, stopTaskIfActive,
  PROJECT_AGENT_TASKS_COLLECTION } from "../../lib/project-agent/task-terminal-guard";

const identity = { id: "pat_123456789abc", ownerEmail: "owner@project-agent.test",
  projectId: "proj_qa" };
let task: Record<string, any>, leaseValid: boolean;
const matcher = (value: any, condition: any) => {
  if (condition && typeof condition === "object") {
    if ("$in" in condition) return condition.$in.includes(value);
    if ("$ne" in condition) return value !== condition.$ne;
    if ("$gt" in condition) return value > condition.$gt;
  }
  return value === condition;
};
const updateOne = vi.fn(async (filter: Record<string, any>, patch: Record<string, any>) => {
  if (Object.entries(filter).some(([key, value]) =>
    !matcher(key === "_id" ? task.id : task[key], value)))
    return { modifiedCount: 0 };
  Object.assign(task, patch.$set);
  if (patch.$push?.log) task.log.push(patch.$push.log);
  return { modifiedCount: 1 };
});
beforeEach(() => {
  task = { ...identity, status: "running", cancelled: false, log: [],
    createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z" };
  leaseValid = true; vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: (name: string) => {
    if (name === PROJECT_AGENT_TASKS_COLLECTION) return { updateOne };
    if (name === "projectAgentDurableTasks")
      return { findOne: async (filter: Record<string, any>) =>
        leaseValid && filter.leaseToken === "worker-a" ? { _id: identity.id } : null };
    throw new Error("Unexpected Mongo collection: " + name);
  } } as never);
});
describe("P7.6.2 terminal write vs Stop Mongo CAS", () => {
  it("Stop wins first: old worker cannot write done or overwrite cancellation", async () => {
    expect(await stopTaskIfActive(identity)).toBe(true);
    expect(await commitTaskTerminalIfActive(identity, "done",
      { resultText: "late stale result", logLine: "completed" })).toBe(false);
    expect(task).toMatchObject({ status: "failed", cancelled: true, error: "Stopped by you." });
    expect(task.resultText).toBeUndefined();
    expect(task.log).toHaveLength(1);
  });
  it("completion wins first: Stop cannot overwrite already finished task", async () => {
    expect(await commitTaskTerminalIfActive(identity, "done",
      { resultText: "successful result" })).toBe(true);
    expect(await stopTaskIfActive(identity)).toBe(false);
    expect(task).toMatchObject({ status: "done", cancelled: false,
      resultText: "successful result" });
  });
  it("does not let an old worker convert a stopped task into failed again", async () => {
    await stopTaskIfActive(identity);
    expect(await commitTaskTerminalIfActive(identity, "failed",
      { error: "late model timeout" })).toBe(false);
    expect(task.error).toBe("Stopped by you.");
  });
  it("worker lost lease before completion: deny even while task still running", async () => {
    leaseValid = false;
    expect(await runWithLeaseFence({ taskId: identity.id, token: "worker-a" }, () =>
      commitTaskTerminalIfActive(identity, "done", { resultText: "unsafe" })))
      .toBe(false);
    expect(task.status).toBe("running");
    expect(task.resultText).toBeUndefined();
  });
  it("valid worker lease permits terminal write", async () => {
    expect(await runWithLeaseFence({ taskId: identity.id, token: "worker-a" }, () =>
      commitTaskTerminalIfActive(identity, "done", { resultText: "safe" }))).toBe(true);
    expect(task.status).toBe("done");
  });
  it("failed startup can end queued, but not resurrect a cancelled queue", async () => {
    task.status = "queued";
    expect(await commitTaskTerminalIfActive(identity, "failed",
      { error: "mock runtime missing" })).toBe(true);
    expect(task.status).toBe("failed");
    task.status = "queued"; task.cancelled = true;
    expect(await commitTaskTerminalIfActive(identity, "failed",
      { error: "another failure" })).toBe(false);
  });
  it("scope mismatch is never allowed to finalize another owner's task", async () => {
    expect(await commitTaskTerminalIfActive({ ...identity, ownerEmail: "another@project-agent.test" },
      "done", { resultText: "bad" })).toBe(false);
    expect(task.status).toBe("running");
  });
});
