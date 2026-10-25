import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { markP7BrowserRunningIfCurrent, verifyP7TaskStoreMapping } from "../../lib/project-agent/p7-qa-conditional-update";
import type { P7RecoverTask } from "../../lib/project-agent/p7-qa-recovery";

const task: P7RecoverTask = {
  id: "pat_123456789abc", projectId: "proj_synthetic",
  ownerEmail: "p7-owner@project-agent.test",
  prompt: "[P7_SYNTHETIC_QA] browser fixture - local synthetic data only",
  status: "failed", cancelled: false, updatedAt: "2026-10-25T00:00:00Z",
};
const updateOne = vi.fn();
const findOne = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({
    collection: (name: string) => {
      expect(name).toBe("projectAgentTasks");
      return { updateOne, findOne };
    },
  } as never);
});
describe("P7 synthetic Mongo conditional status write", () => {
  it("matches only this synthetic task, owner, Project, state and version", async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    expect(await markP7BrowserRunningIfCurrent(task, "boot-new")).toBe(true);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toMatchObject({
      _id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail,
      prompt: task.prompt, status: "failed", cancelled: { $ne: true },
      updatedAt: task.updatedAt,
    });
    expect(update.$set).toMatchObject({ status: "running", bootId: "boot-new" });
    expect(update.$unset).toHaveProperty("cancelled");
    expect(update.$set).not.toHaveProperty("cancelled");
    expect(update.$push.log).toMatch(/browser fixture restored/);
  });
  it("returns false when Stop changed status or cancelled before atomic write", async () => {
    updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await markP7BrowserRunningIfCurrent(task, "boot-new")).toBe(false);
  });
  it("rejects non-synthetic, completed, cancelled and non-owner input before DB access", async () => {
    for (const patch of [{ cancelled: true }, { status: "done" }, { status: "queued" },
      { ownerEmail: "real@company.example" },
      { prompt: "[P7_SYNTHETIC_QA] pdf fixture - local synthetic data only" },
      { id: "../task" }]) {
      expect(await markP7BrowserRunningIfCurrent({ ...task, ...patch }, "boot-new")).toBe(false);
    }
    expect(getMongoAiDb).not.toHaveBeenCalled();
  });
  it("verifies the real host Mongo collection and key without changing task data", async () => {
    findOne.mockResolvedValue({ ...task, _id: task.id });
    expect(await verifyP7TaskStoreMapping(task)).toBe(true);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0]).toEqual({ _id: task.id });
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("returns false when the host mapping or version differs", async () => {
    for (const document of [null, { ...task, _id: task.id, updatedAt: "other" },
      { ...task, _id: task.id, projectId: "proj_other" }]) {
      findOne.mockResolvedValueOnce(document);
      expect(await verifyP7TaskStoreMapping(task)).toBe(false);
    }
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("never writes without a source timestamp/version", async () => {
    expect(await markP7BrowserRunningIfCurrent({ ...task, updatedAt: undefined }, "boot-new"))
      .toBe(false);
    expect(getMongoAiDb).not.toHaveBeenCalled();
  });
  it("fails closed if MongoDB is unavailable rather than writing a stale task", async () => {
    vi.mocked(getMongoAiDb).mockRejectedValue(new Error("db disconnected"));
    await expect(markP7BrowserRunningIfCurrent(task, "boot-new"))
      .rejects.toThrow("db disconnected");
    expect(updateOne).not.toHaveBeenCalled();
  });
});
