import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: vi.fn(), updateProjectAgentTask: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { readProjectAgentTask, updateProjectAgentTask } from "../../lib/project-agent/task-store";
import {
  enqueueDurableTask, readQueueReceipt, withDurableTaskLease,
  revokeDurableTaskLease, scanDurableQueue, importLegacyQueueReceipt,
} from "../../lib/project-agent/durable-mongo-queue";
import { assertActiveTaskLease } from "../../lib/project-agent/lease-fence";

type Row = Record<string, any>;
const id = "pat_abcdef123456", rows = new Map<string, Row>();
let task: Row;
const matches = (row: Row, filter: Row): boolean =>
  Object.entries(filter).every(([field, wanted]) => {
    const current = row[field];
    if (wanted && typeof wanted === "object" && !Array.isArray(wanted))
      return (!("$in" in wanted) || wanted.$in.includes(current)) &&
        (!("$lt" in wanted) || current < wanted.$lt) &&
        (!("$gt" in wanted) || current > wanted.$gt);
    return current === wanted;
  });
const queue = {
  createIndex: vi.fn(async () => "index"),
  findOne: vi.fn(async (filter: Row) =>
    [...rows.values()].find(value => matches(value, filter)) ?? null),
  findOneAndUpdate: vi.fn(async (filter: Row, patch: Row) => {
    const row = [...rows.values()].find(value => matches(value, filter));
    if (!row) return null;
    Object.assign(row, patch.$set ?? {});
    for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + Number(value);
    return { ...row };
  }),
  updateOne: vi.fn(async (filter: Row, patch: Row, opts?: { upsert?: boolean }) => {
    let row = [...rows.values()].find(value => matches(value, filter));
    if (!row && opts?.upsert) {
      row = { ...patch.$setOnInsert }; rows.set(row._id, row);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(row, patch.$set ?? {});
    for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + Number(value);
    return { matchedCount: 1, modifiedCount: 1 };
  }),
  find: vi.fn((filter: Row) => {
    let values = [...rows.values()].filter(row => matches(row, filter));
    const cursor = {
      sort: (_by: object) => cursor,
      limit: (limit: number) => { values = values.slice(0, limit); return cursor; },
      toArray: async () => values.map(row => ({ ...row })),
    };
    return cursor;
  }),
};
beforeEach(() => {
  rows.clear(); vi.clearAllMocks();
  task = { id, status: "queued", cancelled: false };
  vi.mocked(getMongoAiDb).mockResolvedValue({
    collection: (name: string) => {
      if (name !== "projectAgentDurableTasks") throw Error("Unknown collection");
      return queue;
    },
  } as never);
  vi.mocked(readProjectAgentTask).mockImplementation(async () => task as never);
  vi.mocked(updateProjectAgentTask).mockImplementation(async (_, patch) => {
    task = { ...task, ...patch }; return task as never;
  });
});
describe("Cross-worker durable queue: never replay uncertain side effects", () => {
  it("quarantines a remote mutation committed before its acknowledgment was lost", async () => {
    await enqueueDurableTask(id);
    let externalWrites = 0;
    await expect(withDurableTaskLease(id, async () => {
      await assertActiveTaskLease();
      externalWrites++;
      throw Error("connection lost after the external commit");
    })).rejects.toThrow(/connection lost/);
    expect(externalWrites).toBe(1);
    expect(await readQueueReceipt(id)).toMatchObject({
      state: "needs_review", attempt: 1,
      error: "connection lost after the external commit",
    });
    expect(await withDurableTaskLease(id, async () => { externalWrites++; }))
      .toBe(false);
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 0 });
    expect(externalWrites).toBe(1);
  });
  it("does not treat an interrupted running receipt as a fresh queued job", async () => {
    await enqueueDurableTask(id);
    rows.set(id, { ...rows.get(id), state: "running", attempt: 1,
      leaseToken: "worker-dead", leaseUntil: "2020-01-01T00:00:00.000Z" });
    task.status = "running";
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 1 });
    expect(await readQueueReceipt(id)).toMatchObject({ state: "needs_review", attempt: 1 });
    expect(task.status).toBe("failed");
    const execute = vi.fn();
    expect(await withDurableTaskLease(id, async () => { execute(); })).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
  it("recognizes externally committed completion even when queue receipt is stale", async () => {
    await enqueueDurableTask(id);
    rows.set(id, { ...rows.get(id), state: "running", attempt: 1,
      leaseToken: "dead-worker", leaseUntil: "2020-01-01T00:00:00.000Z" });
    task.status = "done";
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 0 });
    expect(await readQueueReceipt(id)).toMatchObject({ state: "done" });
    expect(updateProjectAgentTask).not.toHaveBeenCalled();
  });
  it("preserves terminal failure rather than scheduling the same operation again", async () => {
    await enqueueDurableTask(id);
    rows.set(id, { ...rows.get(id), state: "running", attempt: 1,
      leaseToken: "dead-worker", leaseUntil: "2020-01-01T00:00:00.000Z" });
    task.status = "failed";
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 0 });
    expect(await readQueueReceipt(id)).toMatchObject({ state: "failed" });
  });
  it("releases a revoked worker token without resurrecting an old result", async () => {
    await enqueueDurableTask(id);
    let enter!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { enter = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let writes = 0;
    const running = withDurableTaskLease(id, async () => {
      await assertActiveTaskLease(); enter(); await barrier;
      await assertActiveTaskLease(); writes++;
    });
    await started;
    task = { ...task, status: "failed", cancelled: true };
    expect(await revokeDurableTaskLease(id)).toBe(true);
    release();
    await expect(running).rejects.toThrow(/lease expired or changed/);
    expect(writes).toBe(0);
    expect(await readQueueReceipt(id)).toMatchObject({ state: "failed" });
  });
  it("imports a legacy running receipt only as needs_review", async () => {
    await importLegacyQueueReceipt({ taskId: id, state: "running", attempt: 5,
      queuedAt: "2025-01-01T00:00:00.000Z" });
    expect(await readQueueReceipt(id)).toMatchObject({ state: "needs_review", attempt: 5 });
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 0 });
    const sideEffect = vi.fn();
    expect(await withDurableTaskLease(id, async () => { sideEffect(); })).toBe(false);
    expect(sideEffect).not.toHaveBeenCalled();
  });
  it("dispatches a genuinely new queued task once, never again after completion", async () => {
    await enqueueDurableTask(id);
    expect(await scanDurableQueue()).toEqual({ queued: [id], uncertain: 0 });
    let executed = 0;
    expect(await withDurableTaskLease(id, async () => {
      await assertActiveTaskLease(); executed++; task.status = "done";
    })).toBe(true);
    expect((await readQueueReceipt(id))?.state).toBe("done");
    expect(await withDurableTaskLease(id, async () => { executed++; })).toBe(false);
    expect(executed).toBe(1);
  });
});
