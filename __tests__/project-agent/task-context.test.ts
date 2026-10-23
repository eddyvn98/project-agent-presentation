import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listMembers: vi.fn(), listTasks: vi.fn() }));

vi.mock("@/lib/capabilities/project-sharing", () => ({ listProjectConversationMembers: mocks.listMembers }));
vi.mock("@/lib/project-agent/task-store", () => ({ listProjectAgentTasks: mocks.listTasks }));

import { loadProjectAgentTaskContext } from "@/lib/project-agent/task-context";

describe("Project Agent shared history context", () => {
	beforeEach(() => vi.clearAllMocks());

	it("uses only completed tasks from current members and escapes their content", async () => {
		mocks.listMembers.mockResolvedValue(["owner@example.com", "member@example.com"]);
		mocks.listTasks.mockResolvedValue([
			{ id: "current", status: "done", prompt: "current", resultText: "skip" },
			{ id: "previous", status: "done", prompt: "Plan <v2>", resultText: "Result & approved" },
			{ id: "failed", status: "failed", prompt: "failed", resultText: "skip" },
		]);

		const context = await loadProjectAgentTaskContext("project-1", "member@example.com", "current");

		expect(context).toContain("Earlier Project Agent request: Plan &lt;v2&gt;");
		expect(context).toContain("Recorded result: Result &amp; approved");
		expect(context).not.toContain("current");
		expect(context).not.toContain("failed");
		expect(mocks.listTasks).toHaveBeenCalledWith(["owner@example.com", "member@example.com"], "project-1", 20);
	});

	it("does not load history for callers without current Project access", async () => {
		mocks.listMembers.mockResolvedValue(null);
		await expect(loadProjectAgentTaskContext("project-1", "stranger@example.com", "current")).resolves.toBe("");
		expect(mocks.listTasks).not.toHaveBeenCalled();
	});

	it("bounds shared history before adding it to a Dify request", async () => {
		mocks.listMembers.mockResolvedValue(["owner@example.com"]);
		mocks.listTasks.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({
			id: `task-${index}`, status: "done", prompt: "p".repeat(4_000), resultText: "r".repeat(8_000),
		})));
		const context = await loadProjectAgentTaskContext("project-1", "owner@example.com", "current");
		expect(context.length).toBeLessThanOrEqual(16_000);
		expect(context.match(/Earlier Project Agent request:/g)).toHaveLength(8);
	});
});
