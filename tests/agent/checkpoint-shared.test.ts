import { describe, expect, it, vi } from "vitest";
import { checkpointScopeKey, appendSharedCheckpoint, listSharedCheckpoints,
  deleteSharedCheckpoints } from "../../lib/project-agent/runtime/checkpoint-core.mjs";

interface Doc { _id: string; projectId: string; chatId: string; entries: any[]; expiresAt: Date }
function fakeCollection() {
  const records = new Map<string, Doc>();
  return {
    records,
    async updateOne(q: any, update: any) {
      const row = records.get(q._id) ?? {
        _id: q._id, projectId: q.projectId, chatId: q.chatId, entries: [], expiresAt: new Date(0),
      };
      row.entries.push(...update.$push.entries.$each);
      row.entries = row.entries.slice(update.$push.entries.$slice);
      row.expiresAt = update.$set.expiresAt;
      records.set(q._id, row);
    },
    async findOne(q: any) {
      const row = records.get(q._id);
      return row?.projectId === q.projectId && row.chatId === q.chatId &&
        row.expiresAt > q.expiresAt.$gt ? row : null;
    },
    async deleteOne(q: any) {
      const row = records.get(q._id);
      if (row?.projectId !== q.projectId || row.chatId !== q.chatId) return { deletedCount: 0 };
      records.delete(q._id);
      return { deletedCount: 1 };
    },
  };
}
const owner = { projectId: "p1", chatId: "chat1" };
const event = (step: number) => ({
  taskId: "task-a", step, action: "shell", failed: false, observation: "verified step " + step,
});
describe("L3B shared checkpoint store", () => {
  it("keeps cross-host reads consistent, bounded and strictly scoped", async () => {
    const coll = fakeCollection();
    const second = { projectId: "p2", chatId: "chat1" };
    for (let i = 0; i < 100; i++) await appendSharedCheckpoint(coll, owner, event(i));
    expect((await listSharedCheckpoints(coll, owner)).map(x => x.step)).toEqual(
      Array.from({ length: 16 }, (_, i) => 84 + i));
    expect(await listSharedCheckpoints(coll, second)).toEqual([]);
    expect(checkpointScopeKey(owner)).not.toBe(checkpointScopeKey(second));
    await appendSharedCheckpoint(coll, owner, { ...event(101), taskId: "task-b" });
    expect(await listSharedCheckpoints(coll, owner, "task-b")).toHaveLength(1);
    expect(await deleteSharedCheckpoints(coll, second)).toBe(false);
    expect(await deleteSharedCheckpoints(coll, owner)).toBe(true);
    expect(await listSharedCheckpoints(coll, owner)).toEqual([]);
  });
  it("rejects unknown scopes and expired or malformed records", async () => {
    const coll = fakeCollection();
    const now = new Date("2026-10-27T00:00:00Z");
    await expect(appendSharedCheckpoint(coll, { projectId: "", chatId: "chat" }, event(1))).rejects.toThrow(/scope/);
    await expect(appendSharedCheckpoint(coll, owner, { ...event(1), step: -1 })).rejects.toThrow(/Invalid/);
    await appendSharedCheckpoint(coll, owner, { ...event(1), observation: "x".repeat(1000) }, now);
    expect((await listSharedCheckpoints(coll, owner, undefined, new Date("2026-11-04T00:00:00Z")))).toEqual([]);
  });
});
