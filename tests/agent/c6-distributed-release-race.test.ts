import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { claimProjectAgent, releaseProjectAgent, withProjectControlOp }
  from "../../lib/project-agent/runtime/browser-agent/project-control-db";
type Row = Record<string, any>;
let row: Row;
const matches = (filter: Row): boolean => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part: Row) => matches(part));
  if (key === "$and") return value.every((part: Row) => matches(part));
  if (value && typeof value === "object")
    return Object.entries(value).every(([op, expected]) =>
      op === "$exists" ? (key in row) === expected :
      op === "$gt" ? row[key] > expected : op === "$lt" ? row[key] < expected : false);
  return row[key] === value;
});
const patch = (update: Row) => { Object.assign(row, update.$set ?? {});
  for (const key of Object.keys(update.$unset ?? {})) delete row[key];
  for (const [key, number] of Object.entries(update.$inc ?? {}))
    row[key] = (row[key] ?? 0) + Number(number);
};
const collection = {
  updateOne: vi.fn(async (filter: Row, update: Row, options?: Row) => {
    if (!row && options?.upsert) { row = { ...update.$setOnInsert }; return { matchedCount: 0 }; }
    if (!matches(filter)) return { matchedCount: 0 };
    patch(update); return { matchedCount: 1 };
  }),
  findOne: vi.fn(async () => ({ ...row })),
  findOneAndUpdate: vi.fn(async (filter: Row, update: Row) => {
    if (!matches(filter)) return null;
    patch(update); return { ...row };
  }),
};
const scope = "pb_c6_stress";
beforeEach(() => {
  row = undefined as never;
  vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => collection } as never);
});
describe("C6 distributed browser operation CAS after Stop", () => {
  it("rejects stale successful result when Stop releases agent ownership mid-action", async () => {
    await claimProjectAgent(scope, "agent-a");
    let unblock!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { unblock = r; });
    const ready = new Promise<void>(r => { entered = r; });
    const onLost = vi.fn();
    const action = withProjectControlOp(scope, "agent", "agent-a", async () => {
      entered(); await gate; return "stale success";
    }, onLost);
    await ready;
    await releaseProjectAgent(scope, "agent-a");
    unblock();
    await expect(action).rejects.toThrow(/lease was lost/);
    expect(onLost).toHaveBeenCalledOnce();
    expect(row.agentTaskId).toBeUndefined();
    expect(row.opToken).toBeUndefined();
  });
  it("does not release a newer worker's lock if the previous token is replaced", async () => {
    await claimProjectAgent(scope, "agent-a");
    let unblock!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { unblock = r; });
    const ready = new Promise<void>(r => { entered = r; });
    const old = withProjectControlOp(scope, "agent", "agent-a",
      async () => { entered(); await gate; return 1; });
    await ready;
    row.opToken = "new-owner-token"; row.revision++;
    unblock();
    await expect(old).rejects.toThrow(/lease was lost/);
    expect(row.opToken).toBe("new-owner-token");
  });
});
