import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: vi.fn(), updateProjectAgentTask: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { readProjectAgentTask, updateProjectAgentTask } from "../../lib/project-agent/task-store";
import { enqueueDurableTask, readQueueReceipt, revokeDurableTaskLease, scanDurableQueue,
  withDurableTaskLease } from "../../lib/project-agent/durable-mongo-queue";
import { assertActiveTaskLease } from "../../lib/project-agent/lease-fence";

type Row = { _id: string; [key: string]: any };
const id = "pat_7b4f9d029c42";
const rows = new Map<string, Row>();
let task: { id: string; status: "queued" | "running" | "done" | "failed"; cancelled?: boolean };
function matches(row: Row, filter: Record<string, any>) {
  return Object.entries(filter).every(([key, wanted]) => {
    const actual = row[key];
    if (wanted && typeof wanted === "object")
      return (!("$in" in wanted) || wanted.$in.includes(actual)) &&
        (!("$lt" in wanted) || actual < wanted.$lt) &&
        (!("$gt" in wanted) || actual > wanted.$gt);
    return actual === wanted;
  });
}
const queue = {
  createIndex: vi.fn(async () => "index"),
  findOne: vi.fn(async (filter: Record<string, any>) =>
    [...rows.values()].find(row => matches(row, filter)) ?? null),
  findOneAndUpdate: vi.fn(async (filter: Record<string, any>, patch: Record<string, any>) => {
    const row = [...rows.values()].find(value => matches(value, filter));
    if (!row) return null;
    Object.assign(row, patch.$set ?? {});
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + value;
    return { ...row };
  }),
  updateOne: vi.fn(async (filter: Record<string, any>, patch: Record<string, any>,
    options?: { upsert?: boolean }) => {
    let row = [...rows.values()].find(value => matches(value, filter));
    if (!row && options?.upsert) {
      row = { ...patch.$setOnInsert };
      rows.set(row._id, row);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(row, patch.$set ?? {});
    for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + value;
    return { matchedCount: 1, modifiedCount: 1 };
  }),
  find: vi.fn((filter: Record<string, any>) => {
    let selected = [...rows.values()].filter(row => matches(row, filter));
    const chain = {
      sort: (_sort: object) => chain,
      limit: (n: number) => { selected = selected.slice(0, n); return chain; },
      toArray: async () => selected.map(row => ({ ...row })),
    };
    return chain;
  }),
};
beforeEach(() => {
  rows.clear();
  task = { id, status: "queued", cancelled: false };
  vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({
    collection: (name: string) => {
      expect(name).toBe("projectAgentDurableTasks");
      return queue;
    },
  } as never);
  vi.mocked(readProjectAgentTask).mockImplementation(async () => task as never);
  vi.mocked(updateProjectAgentTask).mockImplementation(async (_, patch) => {
    task = { ...task, ...patch } as typeof task;
    return task as never;
  });
});
describe("P7.6.2 two worker durable Mongo lease (atomic fake)", () => {
  it("permits only one of two racing worker claims and one fenced action", async () => {
    await enqueueDurableTask(id);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let actions = 0;
    const workerA = withDurableTaskLease(id, async () => {
      await assertActiveTaskLease(); actions++; entered(); await gate;
      task.status = "done";
    });
    await started;
    expect(await withDurableTaskLease(id, async () => { actions++; })).toBe(false);
    release();
    expect(await workerA).toBe(true);
    expect(actions).toBe(1);
    expect((await readQueueReceipt(id))?.state).toBe("done");
  });
  it("cross-worker Stop revokes active token and blocks the next action", async () => {
    await enqueueDurableTask(id);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let actions = 0;
    const workerA = withDurableTaskLease(id, async () => {
      await assertActiveTaskLease(); entered(); await gate;
      await assertActiveTaskLease(); actions++;
    });
    await started;
    task = { ...task, cancelled: true, status: "failed" };
    expect(await revokeDurableTaskLease(id)).toBe(true);
    release();
    await expect(workerA).rejects.toThrow(/lease expired or changed/);
    expect(actions).toBe(0);
    expect((await readQueueReceipt(id))?.state).toBe("failed");
    expect(await withDurableTaskLease(id, async () => { actions++; })).toBe(false);
  });
  it("quarantines expired running lease after worker crash without replay", async () => {
    await enqueueDurableTask(id);
    rows.set(id, { ...rows.get(id), state: "running", leaseToken: "dead-worker",
      leaseUntil: "2020-01-01T00:00:00.000Z", attempt: 1 });
    task.status = "running";
    expect(await scanDurableQueue()).toEqual({ queued: [], uncertain: 1 });
    expect((await readQueueReceipt(id))?.state).toBe("needs_review");
    expect(task.status).toBe("failed");
    let actions = 0;
    expect(await withDurableTaskLease(id, async () => { actions++; })).toBe(false);
    expect(actions).toBe(0);
  });
  it("does not run a queued task cancelled before first claim", async () => {
    await enqueueDurableTask(id);
    task.cancelled = true;
    let actions = 0;
    expect(await withDurableTaskLease(id, async () => { actions++; })).toBe(false);
    expect(actions).toBe(0);
    expect((await readQueueReceipt(id))?.state).toBe("failed");
  });
});
