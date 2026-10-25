import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { markP7BrowserRunningIfCurrent } from "../../lib/project-agent/p7-qa-conditional-update";
import type { P7RecoverTask } from "../../lib/project-agent/p7-qa-recovery";

const task: P7RecoverTask = {
  id: "pat_123456789abc", projectId: "proj_synthetic",
  ownerEmail: "p7-owner@project-agent.test",
  prompt: "[P7_SYNTHETIC_QA] browser fixture - local synthetic data only",
  status: "failed", cancelled: false, updatedAt: "2026-10-25T00:00:00Z",
};
const updateOne = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({
    collection: (name: string) => {
      expect(name).toBe("projectAgentTasks");
      return { updateOne };
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
  it("fails closed if MongoDB is unavailable rather than writing a stale task", async () => {
    vi.mocked(getMongoAiDb).mockRejectedValue(new Error("db disconnected"));
    await expect(markP7BrowserRunningIfCurrent(task, "boot-new"))
      .rejects.toThrow("db disconnected");
    expect(updateOne).not.toHaveBeenCalled();
  });
});
