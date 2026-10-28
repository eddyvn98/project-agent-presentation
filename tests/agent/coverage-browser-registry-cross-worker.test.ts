import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/steel-session", () => ({
  createSteelRemote: vi.fn(), releaseSteelRemote: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSteelRemote, releaseSteelRemote }
  from "../../lib/project-agent/runtime/browser-agent/steel-session";
import {
  ensureProjectRecord, findProjectRecord, projectRecordByKey,
  touchProjectRecord, updateProjectActiveTab, closeProjectRecord,
} from "../../lib/project-agent/runtime/browser-agent/project-registry";

type Row = Record<string, any>;
const scope = "pb_cross_worker_qa", project = "qa_project";
const owner = "owner@example.test";
let row: Row | null;
const matches = (item: Row, filter: Row) => Object.entries(filter).every(([key, expected]) =>
  expected && typeof expected === "object" && "$gt" in expected ?
    item[key] > expected.$gt : item[key] === expected);
const collection = {
  findOne: vi.fn(async (filter: Row) => row && matches(row, filter) ? { ...row } : null),
  updateOne: vi.fn(async (filter: Row, patch: Row, options?: { upsert?: boolean }) => {
    if (!row && options?.upsert) {
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
  row = null; vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => collection } as never);
  vi.mocked(createSteelRemote).mockResolvedValue({ id: "steel-original", timeout: 900_000 });
  vi.mocked(releaseSteelRemote).mockResolvedValue(undefined);
});
describe("Project Browser registry survives worker restart without replaying browser creation", () => {
  it("lets a second worker reconnect to the same remote session without creating another", async () => {
    const created = await ensureProjectRecord(scope, project, owner);
    await updateProjectActiveTab(scope, created.steelId!, 3);
    // No worker-local session survives: only Mongo registry is shared.
    const discovered = await findProjectRecord(scope, project, owner.toUpperCase());
    expect(discovered).toMatchObject({ state: "active", steelId: created.steelId,
      generation: created.generation, activeTabIndex: 3 });
    const reused = await ensureProjectRecord(scope, project, owner);
    expect(reused.steelId).toBe(created.steelId);
    expect(reused.activeTabIndex).toBe(3);
    expect(createSteelRemote).toHaveBeenCalledOnce();
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });
  it("does not disclose a recovered session to another owner or project", async () => {
    await ensureProjectRecord(scope, project, owner);
    expect(await findProjectRecord(scope, project, "intruder@example.test")).toBeNull();
    expect(await findProjectRecord(scope, "other-project", owner)).toBeNull();
    expect(await projectRecordByKey(scope, "intruder@example.test")).toBeNull();
    expect(await projectRecordByKey(scope, owner)).toMatchObject({
      state: "active", steelId: "steel-original",
    });
  });
  it("replaces an expired remote ID and fences the old worker's tab writes", async () => {
    await ensureProjectRecord(scope, project, owner);
    row!.expiresAt = Date.now() - 100;
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-replacement", timeout: 900_000,
    });
    const fresh = await ensureProjectRecord(scope, project, owner);
    expect(fresh).toMatchObject({ steelId: "steel-replacement", generation: 2 });
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-original");
    expect(await touchProjectRecord(scope, "steel-original")).toBe(false);
    await expect(updateProjectActiveTab(scope, "steel-original", 1))
      .rejects.toThrow(/stale/i);
    await updateProjectActiveTab(scope, "steel-replacement", 1);
    expect((await findProjectRecord(scope, project, owner))?.activeTabIndex).toBe(1);
  });
  it("cleans up a new Steel session if Stop wins while it is being created", async () => {
    vi.mocked(createSteelRemote).mockImplementationOnce(async () => {
      await closeProjectRecord(scope, project, owner);
      return { id: "steel-orphan", timeout: 900_000 };
    });
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/creation was fenced/i);
    expect(row).toMatchObject({ state: "closed", generation: 2 });
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-orphan");
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/User closed/);
    expect(createSteelRemote).toHaveBeenCalledOnce();
  });
  it("returns to a retryable vacant state when remote creation fails before commit", async () => {
    vi.mocked(createSteelRemote).mockRejectedValueOnce(
      new Error("synthetic Steel unavailable"));
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow("synthetic Steel unavailable");
    expect(row).toMatchObject({ state: "vacant", generation: 1 });
    expect(row?.steelId).toBeUndefined();
    await ensureProjectRecord(scope, project, owner);
    expect(row).toMatchObject({ state: "active", generation: 2 });
    expect(createSteelRemote).toHaveBeenCalledTimes(2);
  });
  it("never auto-reopens a user-closed Project browser after another worker restarts", async () => {
    await ensureProjectRecord(scope, project, owner);
    await closeProjectRecord(scope, project, owner);
    expect(await findProjectRecord(scope, project, owner)).toBeNull();
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-original");
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/Reopen it from the right panel/);
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-user-reopened", timeout: 900_000,
    });
    const reopened = await ensureProjectRecord(scope, project, owner, undefined, true);
    expect(reopened.steelId).toBe("steel-user-reopened");
    expect(reopened.activeTabIndex).toBe(0);
  });
  it("rejects stale registry writes after a foreign browser generation replaces the old", async () => {
    await ensureProjectRecord(scope, project, owner);
    row!.state = "active"; row!.generation++;
    row!.steelId = "steel-another-generation";
    expect(await touchProjectRecord(scope, "steel-original")).toBe(false);
    await expect(updateProjectActiveTab(scope, "steel-original", 7))
      .rejects.toThrow(/stale/i);
    expect((await findProjectRecord(scope, project, owner))?.steelId)
      .toBe("steel-another-generation");
  });

  it("preserves the remote Steel ID when close fails and retries across workers", async () => {
    const old = await ensureProjectRecord(scope, project, owner);
    vi.mocked(releaseSteelRemote)
      .mockRejectedValueOnce(new Error("synthetic Steel release outage"))
      .mockResolvedValueOnce(undefined);
    await expect(closeProjectRecord(scope, project, owner))
      .rejects.toThrow(/release outage/);
    expect(row).toMatchObject({ state: "closed",
      releasePendingSteelId: old.steelId, generation: 2 });
    expect(row?.steelId).toBeUndefined();
    await expect(closeProjectRecord(scope, project, owner)).resolves.toBeUndefined();
    expect(row?.releasePendingSteelId).toBeUndefined();
    expect(row?.generation).toBe(2); // No extra generation after retry.
    expect(releaseSteelRemote).toHaveBeenCalledTimes(2);
    expect(releaseSteelRemote).toHaveBeenNthCalledWith(2, old.steelId);
  });
  it("blocks explicit reopen while a prior remote release is still failing", async () => {
    await ensureProjectRecord(scope, project, owner);
    vi.mocked(releaseSteelRemote).mockRejectedValue(
      new Error("synthetic remote cleanup unavailable"));
    await expect(closeProjectRecord(scope, project, owner)).rejects.toThrow(/cleanup unavailable/);
    expect(row?.releasePendingSteelId).toBe("steel-original");
    await expect(ensureProjectRecord(scope, project, owner, undefined, true))
      .rejects.toThrow(/cleanup unavailable/);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ state: "closed", generation: 2 });
    vi.mocked(releaseSteelRemote).mockResolvedValue(undefined);
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-reopened", timeout: 900_000,
    });
    const recovered = await ensureProjectRecord(scope, project, owner, undefined, true);
    expect(recovered).toMatchObject({ state: "active", steelId: "steel-reopened" });
    expect(recovered.releasePendingSteelId).toBeUndefined();
    expect(createSteelRemote).toHaveBeenCalledTimes(2);
  });
  it("retains an expired active Steel ID when remote cleanup fails before rotation", async () => {
    await ensureProjectRecord(scope, project, owner);
    row!.expiresAt = Date.now() - 10;
    vi.mocked(releaseSteelRemote).mockRejectedValueOnce(
      new Error("synthetic old Steel unreachable"));
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/old Steel unreachable/);
    expect(row).toMatchObject({ state: "active", steelId: "steel-original",
      generation: 1 });
    expect(createSteelRemote).toHaveBeenCalledOnce();
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-next", timeout: 900_000,
    });
    const next = await ensureProjectRecord(scope, project, owner);
    expect(next).toMatchObject({ state: "active", steelId: "steel-next",
      generation: 2 });
    expect(releaseSteelRemote).toHaveBeenCalledTimes(2);
  });
  it("retries remote cleanup if Mongo fails after Steel acknowledged its release", async () => {
    await ensureProjectRecord(scope, project, owner);
    const originalUpdate = collection.updateOne.getMockImplementation()!;
    collection.updateOne.mockImplementationOnce(originalUpdate);
    // On release-confirmation persistence the Mongo write fails; pending ID stays.
    collection.updateOne.mockImplementationOnce(async (filter: Row, update: Row, opts?: Row) => {
      if (filter.releasePendingSteelId) throw Error("synthetic Mongo ack lost");
      return originalUpdate(filter, update, opts);
    });
    await expect(closeProjectRecord(scope, project, owner))
      .rejects.toThrow(/Mongo ack lost/);
    expect(row).toMatchObject({ state: "closed", releasePendingSteelId: "steel-original" });
    expect(await closeProjectRecord(scope, project, owner)).toBeUndefined();
    expect(releaseSteelRemote).toHaveBeenCalledTimes(2);
    expect(row?.releasePendingSteelId).toBeUndefined();
  });

});
