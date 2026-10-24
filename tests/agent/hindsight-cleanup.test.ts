import { afterEach, expect, it, vi } from "vitest";
import { encodeProjectAgentTaskCursor } from "../../lib/project-agent/task-pagination";
const { page, read } = vi.hoisted(() => ({ page: vi.fn(), read: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  listProjectAgentTaskPage: (...args: unknown[]) => page(...args),
  readProjectAgentTask: (...args: unknown[]) => read(...args),
}));
import { clearHindsightChatMemory } from "../../lib/project-agent/hindsight/cleanup";
import { hindsightDocumentId } from "../../lib/project-agent/hindsight/transport";
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks();
});

it("purges only the selected chat and completes before local Mongo mutation", async () => {
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_API_URL", "http://localhost:8888");
  const thirdTaskId = "pat_a1b2c3d4e5f6";
  const nextCursor = encodeProjectAgentTaskCursor({ createdAt: "2026-10-23T13:00:00.000Z", id: thirdTaskId });
  page.mockResolvedValueOnce({
    tasks: [
      { id: "t1", conversationId: "chat-a" },
      { id: "t2", conversationId: "chat-b" },
    ], nextCursor,
  }).mockResolvedValueOnce({
    tasks: [
      { id: thirdTaskId, conversationId: "chat-a" },
      { id: "t4", conversationId: "chat-b" },
    ],
  });
  const deleted: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
    deleted.push(String(url));
    return { ok: true, status: 204 } as Response;
  }));
  await clearHindsightChatMemory("project-one", "owner@example.test", { conversationId: "chat-a" });
  expect(page).toHaveBeenCalledTimes(2);
  expect(deleted).toHaveLength(2);
  expect(deleted.some((url) => url.includes(hindsightDocumentId("t1")))).toBe(true);
  expect(deleted.some((url) => url.includes(hindsightDocumentId(thirdTaskId)))).toBe(true);
  expect(deleted.some((url) => url.includes(hindsightDocumentId("t2")))).toBe(false);
  expect(read).not.toHaveBeenCalled();
});

it("does not delete locally if Hindsight refuses memory cleanup", async () => {
  vi.stubEnv("PROJECT_AGENT_HINDSIGHT_API_URL", "http://localhost:8888");
  page.mockResolvedValue({ tasks: [{ id: "task-1", conversationId: "chat-a" }] });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 } as Response)));
  await expect(clearHindsightChatMemory("project-one", "owner@example.test", { conversationId: "chat-a" })).rejects.toThrow();
});

it("does no extra Project scans without a configured Hindsight endpoint", async () => {
  await clearHindsightChatMemory("project-one", "owner@example.test", { conversationId: "chat-a" });
  expect(page).not.toHaveBeenCalled();
});
