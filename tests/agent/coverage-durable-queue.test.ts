import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const mock = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: mock.read, updateProjectAgentTask: mock.update,
}));
import { enqueueDurableTask, readQueueReceipt, scanDurableQueue,
  withDurableTaskLease } from "../../lib/project-agent/durable-queue";
let dir: string;
const id = "pat_012345abcdef";
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "coverage-queue-"));
  vi.stubEnv("PROJECT_AGENT_DURABLE_QUEUE_DIR", dir);
  mock.read.mockResolvedValue({ id, status: "queued", cancelled: false });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});
describe("coverage-driven durable task recovery", () => {
  it("never queues an unknown task or accepts a path-traversal ID", async () => {
    mock.read.mockResolvedValueOnce(null);
    await expect(enqueueDurableTask(id)).rejects.toThrow(/does not exist/);
    await expect(readQueueReceipt("../etc/passwd")).rejects.toThrow(/Invalid queued task ID/);
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 0 });
  });
  it("deduplicates enqueue and serializes two competing workers", async () => {
    await Promise.all([enqueueDurableTask(id), enqueueDurableTask(id)]);
    expect((await scanDurableQueue()).queued).toEqual([id]);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const worker = withDurableTaskLease(id, async () => {
      started(); await pending; mock.read.mockResolvedValue({ id, status: "done" });
    });
    await entered;
    expect(await withDurableTaskLease(id, async () => {
      throw Error("must not run");
    })).toBe(false);
    release();
    expect(await worker).toBe(true);
    expect((await readQueueReceipt(id))?.state).toBe("done");
    expect((await scanDurableQueue()).queued).toEqual([]);
    expect((await readdir(dir)).some(x => x.endsWith(".lease"))).toBe(false);
  });
  it("quarantines uncertain execution after failure instead of replaying it", async () => {
    await enqueueDurableTask(id);
    await expect(withDurableTaskLease(id, async () => {
      throw Error("synthetic external action uncertainty");
    })).rejects.toThrow(/uncertainty/);
    expect((await readQueueReceipt(id))?.state).toBe("needs_review");
    expect(await withDurableTaskLease(id, async () => {
      throw Error("unsafe replay");
    })).toBe(false);
    expect((await scanDurableQueue()).queued).toEqual([]);
  });
  it("refuses to run cancelled tasks even when a queued receipt remains", async () => {
    await enqueueDurableTask(id);
    mock.read.mockResolvedValue({ id, status: "queued", cancelled: true });
    expect(await withDurableTaskLease(id, async () => {
      throw Error("unsafe cancelled task");
    })).toBe(false);
    expect((await readQueueReceipt(id))?.state).toBe("failed");
  });
});
