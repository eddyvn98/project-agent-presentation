import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const fake = vi.hoisted(() => ({ page: vi.fn(), update: vi.fn(), compact: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  listProjectAgentTaskPage: fake.page, updateProjectAgentTask: fake.update,
}));
vi.mock("../../lib/project-agent/compact", () => ({ compactChat: fake.compact }));
// L1/L2 unit scenarios stub coordination; L7 runs the real Mongo lock and Stop fencing.
vi.mock("../../lib/project-agent/compact-lease", () => ({
  withCompactionLease: async (_task: unknown, _source: string, fn: () => Promise<string | undefined>) => fn(),
}));
import { encodeProjectAgentTaskCursor } from "../../lib/project-agent/task-pagination";
import { buildChatRecap } from "../../lib/project-agent/chat-recap";
import { recentConversationTasks } from "../../lib/project-agent/conversation-history";
import { coordinateMemorySources } from "../../lib/project-agent/memory-coordination";
import { resolveDifyConversationId } from "../../lib/project-agent/conversation";
import { autoCompactIfNeeded } from "../../lib/project-agent/auto-compact";

const PROJECT = "long-session-project", USER = "qa-user@example.test", CHAT = "chat-long";
const BASE = Date.UTC(2026, 9, 27, 1);
const stamp = (i: number, offset = 0) => new Date(BASE + i * 60000 + offset).toISOString();
const id = (i: number) => "pat_" + i.toString(16).padStart(12, "0");
function turn(i: number, overrides: Partial<ProjectAgentTask> = {}): ProjectAgentTask {
  return {
    id: id(i), projectId: PROJECT, ownerEmail: USER, projectOwnerEmail: USER,
    conversationId: CHAT, status: "done", createdAt: stamp(i), updatedAt: stamp(i),
    prompt: "Turn " + i, userPrompt: "Turn " + i, resultText: "Answer " + i,
    log: [], ...overrides,
  } as ProjectAgentTask;
}
const current = () => turn(1500, { status: "queued", resultText: "" });
let rows: ProjectAgentTask[] = [];
function setRows(values: ProjectAgentTask[]) {
  rows = values.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  fake.page.mockImplementation(async (
    owners: string[], project: string, limit: number,
    cursor?: { createdAt: string; id: string },
  ) => {
    const filtered = rows.filter(t => owners.includes(t.ownerEmail) && t.projectId === project
      && (!cursor || t.createdAt < cursor.createdAt ||
        (t.createdAt === cursor.createdAt && t.id < cursor.id)));
    const tasks = filtered.slice(0, limit);
    const last = tasks.at(-1);
    return {
      tasks,
      nextCursor: filtered.length > limit && last ? encodeProjectAgentTaskCursor({
        createdAt: last.createdAt, id: last.id,
      }) : undefined,
    };
  });
}
const historical = (size: number) => Array.from({ length: size }, (_, i) =>
  turn(i + 1, i + 1 === 995 ? {
    prompt: "Decision update", userPrompt: "Decision update: design = BLUE",
    resultText: "Decision confirmed: design = BLUE",
  } : {}));

describe("L1/L2: deterministic long-session history and memory", () => {
  beforeEach(() => { vi.clearAllMocks(); rows = []; fake.compact.mockResolvedValue({ difyConversationId: "dify-next" }); });

  it.each([100, 500, 1000])("L1 retains %i authorized turns through 20-item cursors", async size => {
    const owned = historical(size);
    const noise = Array.from({ length: Math.ceil(size / 8) }, (_, i) =>
      turn(10_000 + i, { conversationId: "other-chat", createdAt: stamp(i * 8 + 1, 500) }));
    const outsider = turn(90_000, { ownerEmail: "outsider@example.test", createdAt: stamp(size, 700) });
    setRows([...owned, ...noise, outsider]);
    const found: ProjectAgentTask[] = [];
    let cursor: { createdAt: string; id: string } | undefined;
    for (let page = 0; page < 70; page++) {
      const response = await fake.page([USER], PROJECT, 20, cursor);
      found.push(...response.tasks.filter((entry: ProjectAgentTask) => entry.conversationId === CHAT));
      if (!response.nextCursor) break;
      const parsed = JSON.parse(Buffer.from(response.nextCursor, "base64url").toString("utf8"));
      cursor = parsed;
    }
    expect(found).toHaveLength(size);
    expect(new Set(found.map(t => t.id)).size).toBe(size);
    expect(found.every(t => t.ownerEmail === USER && t.projectId === PROJECT)).toBe(true);
    const recap = await buildChatRecap(current());
    expect(recap.match(/^You: /gm)).toHaveLength(8);
    expect(recap).toContain("Turn " + size);
    expect(recap).not.toContain("other-chat");
    expect(recap.length).toBeLessThanOrEqual(8_000);
  });

  it("L2 prefers the latest corrected decision after synthetic compact markers", async () => {
    const owned = historical(1000).map(t =>
      [200, 400, 600, 800, 950].includes(Number(t.userPrompt?.split(" ")[1]))
        ? { ...t, prompt: "/compact", userPrompt: "/compact",
            resultText: "Conversation compacted.", difyConversationId: "dify-segment" } : t);
    setRows(owned);
    const recap = await buildChatRecap(current());
    expect(recap).toContain("design = BLUE");
    expect(recap).not.toContain("/compact");
    const memory = coordinateMemorySources({
      sameChat: recap, projectAgentHistory: "Other Project summary",
      projectChats: "", personalChats: "",
      hindsightMemory: "Older unverified memory: design = RED", xerjContext: "",
    }, true);
    expect(memory.projectAgentHistory).toContain("design = BLUE");
    expect(memory.projectAgentHistory).toContain("newer user corrections");
    expect(memory.hindsightMemory).toContain("RED");
    expect(memory.projectAgentHistory.length).toBeLessThan(12_000);
  });

  it("L2 resolves the newest compacted model conversation beyond the first 20 Project tasks", async () => {
    const seeded = turn(100, { difyConversationId: "dify-seeded-4", contextTokens: 720_000 });
    const unrelated = Array.from({ length: 55 }, (_, i) =>
      turn(101 + i, { conversationId: "another-chat" }));
    setRows([seeded, ...unrelated]);
    expect(await resolveDifyConversationId(current())).toBe("dify-seeded-4");
    expect(await autoCompactIfNeeded(current())).toBe("dify-next");
    expect(fake.compact).toHaveBeenCalledWith(seeded);
    expect(fake.update).toHaveBeenCalledWith(current().id, { logLine: "auto-compacting conversation" });
    expect(fake.update.mock.calls[0][1]).not.toHaveProperty("status");
    expect(fake.page.mock.calls.length).toBeGreaterThan(2);
  });

  it("L2 carries multiple compact transitions without ever claiming queued work", async () => {
    for (let cycle = 1; cycle <= 4; cycle++) {
      const parent = turn(200 + cycle, {
        contextTokens: 700_000 + cycle, difyConversationId: "dify-" + cycle,
      });
      setRows([parent, turn(100 + cycle, { conversationId: "other-chat" })]);
      fake.compact.mockResolvedValueOnce({ difyConversationId: "dify-" + (cycle + 1) });
      expect(await autoCompactIfNeeded(current())).toBe("dify-" + (cycle + 1));
      expect(await resolveDifyConversationId(current())).toBe("dify-" + cycle);
    }
    expect(fake.compact).toHaveBeenCalledTimes(4);
    expect(fake.update.mock.calls.every(call => !Object.hasOwn(call[1], "status"))).toBe(true);
  });

  it("does not accept a foreign owner or Project as same-chat memory", async () => {
    setRows([
      turn(100, { ownerEmail: "outsider@example.test" }),
      turn(101, { projectId: "private-project" }),
      turn(102, { conversationId: "different-chat" }),
    ]);
    expect(await buildChatRecap(current())).toBe("");
    expect(await recentConversationTasks(current(), t => t.status === "done")).toEqual([]);
  });
});
