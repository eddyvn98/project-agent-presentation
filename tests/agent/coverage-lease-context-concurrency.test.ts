import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getDb: vi.fn(), findOne: vi.fn() }));
vi.mock("@/services/mongodb/client", () => ({
  getMongoAiDb: m.getDb,
}));
import { assertActiveTaskLease, runWithLeaseFence } from
  "../../lib/project-agent/lease-fence";
const taskA = "pat_aaaaaaaaaaaa", taskB = "pat_bbbbbbbbbbbb";
const allowed = new Set(["token-A", "token-B"]);
beforeEach(() => {
  vi.clearAllMocks();
  allowed.add("token-A"); allowed.add("token-B");
  m.findOne.mockImplementation(async (filter: { leaseToken: string }) =>
    allowed.has(filter.leaseToken) ? { _id: taskA } : null);
  m.getDb.mockResolvedValue({ collection: (name: string) => {
    if (name !== "projectAgentDurableTasks") throw Error("Wrong Mongo collection");
    return { findOne: m.findOne };
  } });
});
afterEach(() => { allowed.clear(); });
describe("Mongo lease context across concurrent and resumed Agent actions", () => {
  it("does not touch Mongo outside a lease-fenced task", async () => {
    await expect(assertActiveTaskLease()).resolves.toBeUndefined();
    expect(m.getDb).not.toHaveBeenCalled();
  });
  it("keeps separate lease identities across overlapping asynchronous contexts", async () => {
    await Promise.all([
      runWithLeaseFence({ taskId: taskA, token: "token-A" }, async () => {
        await Promise.resolve(); await assertActiveTaskLease();
        await Promise.resolve(); await assertActiveTaskLease();
      }),
      runWithLeaseFence({ taskId: taskB, token: "token-B" }, async () => {
        await Promise.resolve(); await assertActiveTaskLease();
        await Promise.resolve(); await assertActiveTaskLease();
      }),
    ]);
    const filters = m.findOne.mock.calls.map(([filter]) => filter);
    expect(filters).toHaveLength(4);
    expect(filters.filter(f => f._id === taskA && f.leaseToken === "token-A")).toHaveLength(2);
    expect(filters.filter(f => f._id === taskB && f.leaseToken === "token-B")).toHaveLength(2);
    expect(filters.every(f => f.state === "running" && typeof f.leaseUntil.$gt === "string"))
      .toBe(true);
  });
  it("restores the outer lease after a nested worker scope exits", async () => {
    await runWithLeaseFence({ taskId: taskA, token: "token-A" }, async () => {
      await assertActiveTaskLease();
      await runWithLeaseFence({ taskId: taskB, token: "token-B" },
        async () => { await Promise.resolve(); await assertActiveTaskLease(); });
      await assertActiveTaskLease();
    });
    expect(m.findOne.mock.calls.map(([f]) => f.leaseToken))
      .toEqual(["token-A", "token-B", "token-A"]);
  });
  it("prevents dispatch once the lease is revoked between two awaited actions", async () => {
    const sideEffect = vi.fn();
    await runWithLeaseFence({ taskId: taskA, token: "token-A" }, async () => {
      await assertActiveTaskLease();
      allowed.delete("token-A");
      await Promise.resolve();
      await expect(assertActiveTaskLease()).rejects.toThrow(/lease expired or changed/);
    });
    expect(sideEffect).not.toHaveBeenCalled();
  });
  it("does not leak a failed nested lease identity to the next task", async () => {
    await expect(runWithLeaseFence({ taskId: taskA, token: "revoked-token" },
      assertActiveTaskLease)).rejects.toThrow(/lease expired or changed/);
    await runWithLeaseFence({ taskId: taskB, token: "token-B" }, assertActiveTaskLease);
    expect(m.findOne.mock.calls.at(-1)?.[0]).toMatchObject({
      _id: taskB, leaseToken: "token-B", state: "running",
    });
  });
  it("propagates a Mongo outage rather than granting an optimistic lease", async () => {
    m.getDb.mockRejectedValueOnce(new Error("synthetic Mongo unavailable"));
    await expect(runWithLeaseFence({ taskId: taskA, token: "token-A" },
      assertActiveTaskLease)).rejects.toThrow("synthetic Mongo unavailable");
  });
});
