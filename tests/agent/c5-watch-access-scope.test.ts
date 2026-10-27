import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { setSharedBrowserWatch, sharedBrowserWatchAllowed }
  from "../../lib/project-agent/runtime/browser-agent/watch-access-db";

type RecordRow = { _id: string; owner: string; projectId: string; expiresAt: number };
let row: RecordRow | null = null;
const updateOne = vi.fn(async (filter: Record<string, string>, update: any,
  opts: { upsert?: boolean } = {}) => {
  const matched = row && Object.entries(filter).every(([key, value]) =>
    (row as any)[key] === value);
  if (matched) {
    Object.assign(row!, update.$set ?? {});
    return { modifiedCount: 1 };
  }
  if (opts.upsert) {
    if (row?._id === filter._id) throw new Error("E11000 duplicate key error");
    row = { ...filter, ...update.$setOnInsert, ...update.$set } as RecordRow;
    return { modifiedCount: 0, upsertedCount: 1 };
  }
  return { modifiedCount: 0 };
});
const deleteOne = vi.fn(async (filter: Record<string, string>) => {
  if (row && Object.entries(filter).every(([key, value]) => (row as any)[key] === value)) {
    row = null; return { deletedCount: 1 };
  }
  return { deletedCount: 0 };
});
const findOne = vi.fn(async (filter: any) =>
  row && Object.entries(filter).every(([key, value]) =>
    key === "expiresAt" ? row!.expiresAt > (value as any).$gt :
      (row as any)[key] === value) ? { ...row } : null);
beforeEach(() => {
  vi.clearAllMocks(); row = null;
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () =>
    ({ updateOne, deleteOne, findOne }) } as never);
});
describe("C5 distributed Browser Watch opt-in owner scope", () => {
  const task = "pat_123456789abc", project = "proj-a";
  const alice = "alice@project-agent.test", bob = "bob@project-agent.test";
  it("permits only the exact owner and project until the grant expires", async () => {
    await setSharedBrowserWatch(task, project, " ALICE@PROJECT-AGENT.TEST ", true);
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(true);
    expect(await sharedBrowserWatchAllowed(task, project, bob)).toBe(false);
    expect(await sharedBrowserWatchAllowed(task, "proj-b", alice)).toBe(false);
    row!.expiresAt = Date.now() - 1;
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(false);
  });
  it("rejects foreign-owner or foreign-project overwrite of an existing task grant", async () => {
    await setSharedBrowserWatch(task, project, alice, true);
    const first = { ...row! };
    await expect(setSharedBrowserWatch(task, project, bob, true)).rejects.toThrow(/duplicate/i);
    await expect(setSharedBrowserWatch(task, "proj-b", alice, true)).rejects.toThrow(/duplicate/i);
    expect(row).toMatchObject({ _id: task, owner: alice, projectId: project });
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(true);
    expect(first.owner).toBe(row!.owner);
  });
  it("foreign Stop cannot disable an owner's watch, but the owner can revoke it", async () => {
    await setSharedBrowserWatch(task, project, alice, true);
    await setSharedBrowserWatch(task, project, bob, false);
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(true);
    await setSharedBrowserWatch(task, project, alice, false);
    expect(row).toBeNull();
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(false);
  });
  it("renewal cannot alter the owner or project identity", async () => {
    await setSharedBrowserWatch(task, project, alice, true);
    row!.expiresAt = Date.now() - 1;
    await setSharedBrowserWatch(task, project, alice, true);
    expect(row).toMatchObject({ owner: alice, projectId: project });
    expect(await sharedBrowserWatchAllowed(task, project, alice)).toBe(true);
  });
});
