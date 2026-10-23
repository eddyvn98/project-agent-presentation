import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), compact: vi.fn() }));
vi.mock("@/lib/project-agent/task-store", () => ({ listProjectAgentTasks: mocks.list, updateProjectAgentTask: vi.fn() }));
vi.mock("@/lib/project-agent/compact", () => ({ compactChat: mocks.compact }));

import { autoCompactIfNeeded } from "@/lib/project-agent/auto-compact";

const task = { id: "t2", projectId: "p", ownerEmail: "a@b.c", conversationId: "c1" } as never;
const prior = (contextTokens: number) => ({ id: "t1", projectId: "p", ownerEmail: "a@b.c", conversationId: "c1", status: "done", createdAt: "2026-01-01", contextTokens });

describe("autoCompactIfNeeded", () => {
	beforeEach(() => { vi.clearAllMocks(); mocks.compact.mockResolvedValue({ difyConversationId: "d2" }); });
	it("compacts at 70% of the window", async () => {
		mocks.list.mockResolvedValue([prior(700_000)]);
		expect(await autoCompactIfNeeded(task)).toBe("d2");
	});
	it("leaves smaller chats alone", async () => {
		mocks.list.mockResolvedValue([prior(300_000)]);
		expect(await autoCompactIfNeeded(task)).toBeUndefined();
		expect(mocks.compact).not.toHaveBeenCalled();
	});
	it("falls back silently when compaction fails", async () => {
		mocks.list.mockResolvedValue([prior(800_000)]);
		mocks.compact.mockRejectedValue(new Error("boom"));
		expect(await autoCompactIfNeeded(task)).toBeUndefined();
	});
});
