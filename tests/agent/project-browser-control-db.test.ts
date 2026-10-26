import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMongoAiDb } from "@/services/mongodb/client";
import { claimProjectAgent, handbackProjectControl, readProjectControl,
  releaseProjectAgent, takeProjectControl, withProjectControlOp } from
  "../../lib/project-agent/runtime/browser-agent/project-control-db";

vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
type Row = Record<string, any>;
const rows = new Map<string, Row>();
function matches(row: Row, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([field, value]) => {
    if (field === "$or") return value.some((part: Row) => matches(row, part));
    if (field === "$and") return value.every((part: Row) => matches(row, part));
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.entries(value).every(([op, expected]) =>
        op === "$exists" ? (field in row) === expected :
        op === "$gt" ? row[field] > expected :
        op === "$lt" ? row[field] < expected : row[field] === expected);
    return row[field] === value;
  });
}
function apply(row: Row, patch: Row) {
  Object.assign(row, patch.$set ?? {});
  for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
  for (const [key, value] of Object.entries(patch.$inc ?? {}))
    row[key] = (row[key] ?? 0) + Number(value);
}
const collection = {
  findOne: async (filter: Row) => {
    const found = [...rows.values()].find(row => matches(row, filter));
    return found ? { ...found } : null;
  },
  updateOne: async (filter: Row, patch: Row, options?: { upsert?: boolean }) => {
    const found = [...rows.values()].find(row => matches(row, filter));
    if (found) {
      apply(found, patch);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    if (options?.upsert && !rows.has(filter._id)) {
      rows.set(filter._id, { ...patch.$setOnInsert });
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  },
  findOneAndUpdate: async (filter: Row, patch: Row) => {
    const found = [...rows.values()].find(row => matches(row, filter));
    if (!found) return null;
    apply(found, patch);
    return { ...found };
  },
  deleteOne: async (filter: Row) => {
    const found = [...rows.values()].find(row => matches(row, filter));
    if (found) rows.delete(found._id);
    return { deletedCount: found ? 1 : 0 };
  },
};
const scope = "pb_1234567890abcdef1234567890abcdef";
beforeEach(() => {
  rows.clear();
  vi.mocked(getMongoAiDb).mockResolvedValue({
    collection: () => collection,
  } as never);
});
describe("shared browser distributed operation permissions", () => {
  it("fences different Agent tasks from the same browser", async () => {
    await claimProjectAgent(scope, "task-a");
    expect(await withProjectControlOp(scope, "agent", "task-a", async () => 42)).toBe(42);
    await expect(withProjectControlOp(scope, "agent", "task-b", async () => 0))
      .rejects.toThrow(/control changed/);
    await expect(claimProjectAgent(scope, "task-b"))
      .rejects.toThrow(/another Agent/);
    await releaseProjectAgent(scope, "task-a");
    await claimProjectAgent(scope, "task-b");
    await expect(withProjectControlOp(scope, "agent", "task-a", async () => 0))
      .rejects.toThrow(/control changed/);
  });
  it("blocks Agent actions during takeover and permits handback", async () => {
    await claimProjectAgent(scope, "task-a");
    await takeProjectControl(scope);
    expect((await readProjectControl(scope)).paused).toBe(true);
    await expect(withProjectControlOp(scope, "agent", "task-a", async () => 0))
      .rejects.toThrow(/control changed/);
    expect(await withProjectControlOp(scope, "human", undefined, async () => "ok"))
      .toBe("ok");
    await handbackProjectControl(scope);
    expect((await readProjectControl(scope)).paused).toBe(false);
    expect(await withProjectControlOp(scope, "agent", "task-a", async () => "ok"))
      .toBe("ok");
  });
  it("rejects a second mutation while the first holds its token", async () => {
    await claimProjectAgent(scope, "task-a");
    let release!: () => void, ready!: () => void;
    const pending = new Promise<void>(r => { release = r; });
    const started = new Promise<void>(r => { ready = r; });
    const running = withProjectControlOp(scope, "agent", "task-a", async () => {
      ready(); await pending;
    });
    await started;
    await expect(withProjectControlOp(scope, "agent", "task-a", async () => {}))
      .rejects.toThrow(/another action/);
    release(); await running;
  });
});
