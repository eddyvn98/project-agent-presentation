import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/steel-session", () => ({
  createSteelRemote: vi.fn(), releaseSteelRemote: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSteelRemote, releaseSteelRemote }
  from "../../lib/project-agent/runtime/browser-agent/steel-session";
import { closeProjectRecord, ensureProjectRecord, findProjectRecord,
  projectRecordByKey, touchProjectRecord, updateProjectActiveTab }
  from "../../lib/project-agent/runtime/browser-agent/project-registry";

type Row = Record<string, any>;
const scope = "pb_c4_shared";
const project = "proj_c4";
const owner = "owner@project-agent.test";
let row: Row | null;
function matches(item: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$gt" in expected)
      return item[key] > expected.$gt;
    return item[key] === expected;
  });
}
const collection = {
  findOne: vi.fn(async (filter: Row) => row && matches(row, filter) ? { ...row } : null),
  updateOne: vi.fn(async (filter: Row, patch: Row, opts?: { upsert?: boolean }) => {
    if (!row && opts?.upsert) {
      row = { ...patch.$setOnInsert };
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!row || !matches(row, filter)) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(row, patch.$set ?? {});
    for (const key of Object.keys(patch.$unset ?? {})) delete row[key];
    for (const [key, value] of Object.entries(patch.$inc ?? {}))
      row[key] = (row[key] ?? 0) + Number(value);
    return { matchedCount: 1, modifiedCount: 1 };
  }),
};
beforeEach(() => {
  row = null;
  vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => collection } as never);
  vi.mocked(createSteelRemote).mockResolvedValue({ id: "steel-c4", timeout: 60_000 } as never);
  vi.mocked(releaseSteelRemote).mockResolvedValue(undefined as never);
});
describe("C4 shared Browser Agent registry owner/CAS/recovery", () => {
  it("one browser is created for two simultaneous host requests", async () => {
    const [a, b] = await Promise.all([
      ensureProjectRecord(scope, project, " OWNER@PROJECT-AGENT.TEST "),
      ensureProjectRecord(scope, project, owner),
    ]);
    expect(a.steelId).toBe("steel-c4");
    expect(b.steelId).toBe(a.steelId);
    expect(createSteelRemote).toHaveBeenCalledOnce();
    expect(row).toMatchObject({ state: "active", owner, generation: 1 });
  });
  it("prevents a foreign owner or project from discovering or closing a session", async () => {
    await ensureProjectRecord(scope, project, owner);
    expect(await findProjectRecord(scope, project, "intruder@project-agent.test")).toBeNull();
    expect(await findProjectRecord(scope, "wrong-project", owner)).toBeNull();
    expect(await projectRecordByKey(scope, "intruder@project-agent.test")).toBeNull();
    await closeProjectRecord(scope, project, "intruder@project-agent.test");
    expect(row?.state).toBe("active");
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });
  it("fences expired Steel sessions and validates tab updates", async () => {
    await ensureProjectRecord(scope, project, owner);
    expect(await touchProjectRecord(scope, "steel-c4")).toBe(true);
    await updateProjectActiveTab(scope, "steel-c4", 7);
    expect(row?.activeTabIndex).toBe(7);
    for (const index of [-1, 8, NaN, 1.5])
      await expect(updateProjectActiveTab(scope, "steel-c4", index)).rejects.toThrow(/Invalid browser tab/);
    row!.expiresAt = Date.now() - 1000;
    expect(await touchProjectRecord(scope, "steel-c4")).toBe(false);
    await expect(updateProjectActiveTab(scope, "steel-c4", 0))
      .rejects.toThrow(/stale/);
    expect(await projectRecordByKey(scope, owner)).toBeNull();
  });
  it("requires explicit reopen after close, with old Steel remote released", async () => {
    await ensureProjectRecord(scope, project, owner);
    await closeProjectRecord(scope, project, owner);
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-c4");
    await expect(ensureProjectRecord(scope, project, owner)).rejects.toThrow(/Reopen/);
    vi.mocked(createSteelRemote).mockResolvedValueOnce({ id: "steel-new", timeout: 60_000 } as never);
    const reopened = await ensureProjectRecord(scope, project, owner, undefined, true);
    expect(reopened.steelId).toBe("steel-new");
    expect(reopened.generation).toBe(3);
  });
  it("releases a newly created Steel remote when the final Mongo CAS loses", async () => {
    const original = collection.updateOne.getMockImplementation()!;
    collection.updateOne.mockImplementationOnce(original);
    let fence = false;
    collection.updateOne.mockImplementation(async (filter: Row, patch: Row, opts?: { upsert?: boolean }) => {
      if (filter.state === "creating" && patch.$set?.state === "active" && !fence) {
        fence = true;
        return { matchedCount: 0, modifiedCount: 0 };
      }
      return original(filter, patch, opts);
    });
    await expect(ensureProjectRecord(scope, project, owner)).rejects.toThrow(/fenced/);
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-c4");
    expect(row?.state).toBe("vacant");
  });
  it("honors a pre-aborted Stop signal before starting any remote browser", async () => {
    const abort = new AbortController();
    abort.abort(new Error("Task stopped"));
    await expect(ensureProjectRecord(scope, project, owner, abort.signal))
      .rejects.toThrow(/Task stopped/);
    expect(createSteelRemote).not.toHaveBeenCalled();
  });
});
