import { afterEach, expect, it, vi } from "vitest";
import { encodeProjectAgentTaskCursor } from "../../lib/project-agent/task-pagination";
const mocks = vi.hoisted(() => ({ page: vi.fn(), read: vi.fn(), deleted: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  listProjectAgentTaskPage: mocks.page, readProjectAgentTask: mocks.read,
}));
vi.mock("../../lib/project-agent/hindsight/memory", () => ({
  deleteProjectHindsightTasks: mocks.deleted,
}));
import { clearHindsightChatMemory } from "../../lib/project-agent/hindsight/cleanup";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("L8 enumerates all 5,000 chat turns before deleting remote documents", async () => {
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_API_URL", "http://localhost:8888");
  const rows = Array.from({ length: 5_050 }, (_, i) => ({
    id: "pat_" + i.toString(16).padStart(12, "0"),
    conversationId: i % 101 === 0 ? "other-chat" : "chat-a",
    createdAt: new Date(Date.UTC(2026, 9, 27, 0, i)).toISOString(),
  })).reverse();
  mocks.page.mockImplementation(async (_owners: string[], _project: string,
    limit: number, cursor?: { id: string }) => {
    const offset = cursor ? rows.findIndex(x => x.id === cursor.id) + 1 : 0;
    const tasks = rows.slice(offset, offset + limit);
    const last = tasks.at(-1);
    return { tasks, nextCursor: offset + limit < rows.length && last ?
      encodeProjectAgentTaskCursor({ id: last.id, createdAt: last.createdAt }) : undefined };
  });
  await clearHindsightChatMemory("project-a", "owner@test.example", { conversationId: "chat-a" });
  expect(mocks.page.mock.calls.length).toBeGreaterThan(200);
  expect(mocks.deleted).toHaveBeenCalledTimes(1);
  const ids = mocks.deleted.mock.calls[0][1] as string[];
  expect(ids).toHaveLength(5_000);
  expect(new Set(ids).size).toBe(5_000);
  expect(ids).not.toContain(rows.find(x => x.conversationId === "other-chat")!.id);
});
it("L8 fails closed if pagination loops before remote deletion", async () => {
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_API_URL", "http://localhost:8888");
  const cursor = encodeProjectAgentTaskCursor({ id: "pat_000000000000",
    createdAt: "2026-10-27T00:00:00.000Z" });
  mocks.page.mockResolvedValue({ tasks: [{ id: "pat_000000000000", conversationId: "chat-a" }],
    nextCursor: cursor });
  await expect(clearHindsightChatMemory("project-a", "owner@test.example", {
    conversationId: "chat-a" })).rejects.toThrow(/cursor/);
  expect(mocks.deleted).not.toHaveBeenCalled();
});
