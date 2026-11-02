import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const state = vi.hoisted(() => ({ rows: new Map<string, { _id: string; token: string; taskId: string; expiresAt: string }>() }));
const mock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ readProjectAgentTask: mock.read }));
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: async () => ({ collection: () => ({
  insertOne: async (row: { _id: string; token: string; taskId: string; expiresAt: string }) => {
    if (state.rows.has(row._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    state.rows.set(row._id, row);
  },
  findOne: async (query: { _id: string; token?: string; expiresAt?: { $gt: string } }) => {
    const row = state.rows.get(query._id);
    return row && (!query.token || row.token === query.token) && (!query.expiresAt || row.expiresAt > query.expiresAt.$gt) ? row : null;
  },
  deleteOne: async (query: { _id: string; token: string }) => {
    if (state.rows.get(query._id)?.token === query.token) state.rows.delete(query._id);
  },
  updateOne: async () => ({ matchedCount: 1 }),
}) }) }));
import { withConversationLease } from "../../lib/project-agent/conversation-lease";
import { assertActiveTaskLease } from "../../lib/project-agent/lease-fence";

const task = (id: string, conversationId = "chat") => ({ id, projectId: "project", conversationId, status: "queued" }) as ProjectAgentTask;
beforeEach(() => { state.rows.clear(); mock.read.mockResolvedValue(task("waiting")); vi.stubEnv("PROJECT_AGENT_SERIALIZE_CONVERSATIONS", "1"); });
afterEach(() => { vi.unstubAllEnvs(); });

it("serializes same chat while allowing a different chat to run", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  const first = withConversationLease(task("one"), new AbortController(), async () => { await assertActiveTaskLease(); order.push("first-start"); await gate; order.push("first-end"); });
  await vi.waitFor(() => expect(order).toEqual(["first-start"]));
  const second = withConversationLease(task("two"), new AbortController(), async () => { await assertActiveTaskLease(); order.push("second"); });
  const other = withConversationLease(task("three", "other"), new AbortController(), async () => { order.push("other"); });
  await other; expect(order).toEqual(["first-start", "other"]);
  release(); await Promise.all([first, second]);
  expect(order).toEqual(["first-start", "other", "first-end", "second"]);
});

it("does not reclaim an expired conversation with uncertain side effects", async () => {
  const key = createHash("sha256").update(JSON.stringify(["project", "chat"])).digest("hex");
  state.rows.set(key, { _id: key, taskId: "old", token: "old", expiresAt: "2000-01-01T00:00:00.000Z" });
  const work = vi.fn();
  await expect(withConversationLease(task("new"), new AbortController(), work)).rejects.toThrow(/expired/);
  expect(work).not.toHaveBeenCalled();
});

it("allows a queued task to stop while waiting", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const first = withConversationLease(task("one"), new AbortController(), () => gate);
  await vi.waitFor(() => expect(state.rows.size).toBe(1));
  const controller = new AbortController(), work = vi.fn();
  const waiting = withConversationLease(task("two"), controller, work);
  controller.abort();
  await expect(waiting).rejects.toThrow();
  expect(work).not.toHaveBeenCalled(); release(); await first;
});

it("fails the fence if the holder no longer owns its lease", async () => {
  await withConversationLease(task("one"), new AbortController(), async () => {
    state.rows.clear();
    await expect(assertActiveTaskLease()).rejects.toThrow(/conversation lease lost/);
  });
});

it("does not acquire a chat lease when the experimental flag is off", async () => {
  vi.stubEnv("PROJECT_AGENT_SERIALIZE_CONVERSATIONS", "0");
  await expect(withConversationLease(task("one"), new AbortController(), async () => "ok")).resolves.toBe("ok");
  expect(state.rows.size).toBe(0);
});
