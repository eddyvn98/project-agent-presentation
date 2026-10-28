import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ mongo: vi.fn() }));
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: m.mongo }));
import {
  claimProjectAgent, clearProjectControl, handbackProjectControl,
  keepProjectControl, readProjectControl, releaseProjectAgent,
  renewProjectAgent, takeProjectControl, waitForProjectControl,
  withProjectControlOp,
} from "../../lib/project-agent/runtime/browser-agent/project-control-db";

type Row = Record<string, any>;
const rows = new Map<string, Row>();
const scope = "pb_expiry_qa", taskA = "task-a", taskB = "task-b";
function match(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((item: Row) => match(row, item));
    if (key === "$and") return value.every((item: Row) => match(row, item));
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.entries(value).every(([op, expected]) =>
        op === "$exists" ? (key in row) === expected :
        op === "$gt" ? row[key] > expected :
        op === "$lt" ? row[key] < expected : row[key] === expected);
    return row[key] === value;
  });
}
function patch(row: Row, update: Row) {
  Object.assign(row, update.$set ?? {});
  for (const key of Object.keys(update.$unset ?? {})) delete row[key];
  for (const [key, amount] of Object.entries(update.$inc ?? {}))
    row[key] = (row[key] ?? 0) + Number(amount);
}
const collection = {
  updateOne: vi.fn(async (filter: Row, update: Row, opts?: Row) => {
    const row = [...rows.values()].find(value => match(value, filter));
    if (row) { patch(row, update); return { matchedCount: 1 }; }
    if (opts?.upsert && !rows.has(filter._id)) {
      rows.set(filter._id, { ...update.$setOnInsert }); return { matchedCount: 0 };
    }
    return { matchedCount: 0 };
  }),
  findOne: vi.fn(async (filter: Row) => {
    const row = [...rows.values()].find(value => match(value, filter));
    return row ? { ...row } : null;
  }),
  findOneAndUpdate: vi.fn(async (filter: Row, update: Row) => {
    const row = [...rows.values()].find(value => match(value, filter));
    if (!row) return null;
    patch(row, update); return { ...row };
  }),
  deleteOne: vi.fn(async (filter: Row) => {
    const row = [...rows.values()].find(value => match(value, filter));
    if (row) rows.delete(row._id);
    return { deletedCount: row ? 1 : 0 };
  }),
};
const row = () => rows.get(scope)!;
beforeEach(() => {
  vi.clearAllMocks(); rows.clear();
  m.mongo.mockResolvedValue({ collection: () => collection });
});
describe("Browser distributed control expiry, renewal, and Stop fences", () => {
  it("releases an expired human takeover and increments revision before Agent resumes", async () => {
    await takeProjectControl(scope);
    const before = row().revision;
    row().humanUntil = Date.now() - 1;
    expect(await readProjectControl(scope)).toMatchObject({
      paused: false, revision: before + 1,
    });
    expect(row().humanUntil).toBeUndefined();
  });
  it("keeps expired human takeover fenced while an operation still has a live token", async () => {
    await takeProjectControl(scope);
    row().humanUntil = Date.now() - 1;
    row().opToken = "human-inflight"; row().opUntil = Date.now() + 10_000;
    expect((await readProjectControl(scope)).paused).toBe(true);
    expect(row().opToken).toBe("human-inflight");
    row().opUntil = Date.now() - 1;
    expect((await readProjectControl(scope)).paused).toBe(false);
  });
  it("refuses takeover while an action holds a live operation lock", async () => {
    await readProjectControl(scope);
    row().opToken = "busy"; row().opUntil = Date.now() + 30_000;
    await expect(takeProjectControl(scope)).rejects.toThrow(/Browser busy/);
    expect(row().mode).toBe("agent");
    row().opUntil = Date.now() - 1;
    await takeProjectControl(scope);
    expect(row().mode).toBe("human");
  });
  it("refuses handback during a live human action, then clears control after expiry", async () => {
    await takeProjectControl(scope);
    row().opToken = "typing"; row().opUntil = Date.now() + 10_000;
    await expect(handbackProjectControl(scope)).rejects.toThrow(/input to finish/);
    expect(row().mode).toBe("human");
    row().opUntil = Date.now() - 1;
    await handbackProjectControl(scope);
    expect(row().mode).toBe("agent");
    expect(row().humanUntil).toBeUndefined();
  });
  it("renews human takeover only before expiry, not after", async () => {
    await takeProjectControl(scope);
    const before = row().humanUntil;
    expect(await keepProjectControl(scope)).toBe(true);
    expect(row().humanUntil).toBeGreaterThanOrEqual(before);
    row().humanUntil = Date.now() - 1;
    expect(await keepProjectControl(scope)).toBe(false);
  });
  it("renews only the same live Agent lease even during human takeover", async () => {
    await claimProjectAgent(scope, taskA);
    await takeProjectControl(scope);
    expect(await renewProjectAgent(scope, taskB)).toBe(false);
    expect(await renewProjectAgent(scope, taskA)).toBe(true);
    expect(row().agentTaskId).toBe(taskA);
    await releaseProjectAgent(scope, taskB);
    expect(row().agentTaskId).toBe(taskA);
    await releaseProjectAgent(scope, taskA);
    expect(row().agentTaskId).toBeUndefined();
  });
  it("permits another Agent after lease expiration, never while the previous lease is live", async () => {
    await claimProjectAgent(scope, taskA);
    await expect(claimProjectAgent(scope, taskB)).rejects.toThrow(/another Agent/);
    row().agentUntil = Date.now() - 1;
    await claimProjectAgent(scope, taskB);
    expect(row().agentTaskId).toBe(taskB);
  });
  it("restricts a system operation to unclaimed browser control", async () => {
    await readProjectControl(scope);
    expect(await withProjectControlOp(scope, "system", undefined,
      async revision => revision)).toBe(0);
    await claimProjectAgent(scope, taskA);
    await expect(withProjectControlOp(scope, "system", undefined, async () => "bad"))
      .rejects.toThrow(/control changed/);
    await releaseProjectAgent(scope, taskA);
    expect(await withProjectControlOp(scope, "system", undefined,
      async () => "safe")).toBe("safe");
  });
  it("clears revoked state and rejects waits already aborted by Stop", async () => {
    await takeProjectControl(scope);
    const controller = new AbortController();
    controller.abort(new Error("Stop requested"));
    await expect(waitForProjectControl(scope, controller.signal))
      .rejects.toThrow("Stop requested");
    await clearProjectControl(scope);
    expect(rows.has(scope)).toBe(false);
    expect((await readProjectControl(scope)).paused).toBe(false);
  });
});
