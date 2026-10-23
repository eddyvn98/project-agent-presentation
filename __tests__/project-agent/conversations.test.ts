import { describe, expect, it } from "vitest";
import { groupProjectAgentTasks } from "@/lib/project-agent/conversations";
import type { PublicProjectAgentTask } from "@/lib/project-agent/public-task";

function task(id: string, createdAt: string, conversationId?: string): PublicProjectAgentTask {
	return {
		id,
		projectId: "project-1",
		conversationId,
		prompt: `Prompt ${id}`,
		status: "done",
		createdAt,
		updatedAt: createdAt,
		canContinue: true,
	};
}

describe("Project Agent conversation history", () => {
	function displayTask(overrides: Partial<PublicProjectAgentTask>): PublicProjectAgentTask {
		return {
			...task("display", "2026-10-14T00:00:00.000Z"),
			prompt: "Internal file-review instructions\n\nUser request: Fix page 2",
			userPrompt: "Fix the chart labels on page 2",
			...overrides,
		};
	}

	it("groups turns by Dify conversation and orders threads and turns by time", () => {
		const threads = groupProjectAgentTasks([
			task("turn-2", "2026-10-14T10:02:00.000Z", "conversation-a"),
			task("turn-1", "2026-10-14T10:01:00.000Z", "conversation-a"),
			task("other", "2026-10-14T10:03:00.000Z", "conversation-b"),
			task("legacy", "2026-10-14T10:00:00.000Z"),
		]);

		expect(threads.map((thread) => thread.conversationId)).toEqual([
			"conversation-b",
			"conversation-a",
			undefined,
		]);
		expect(threads[1].tasks.map((item) => item.id)).toEqual(["turn-1", "turn-2"]);
		expect(threads[2].tasks).toHaveLength(1);
	});

	it("uses the user's message as the conversation title instead of internal instructions", () => {
		const [conversation] = groupProjectAgentTasks([displayTask({})]);
		expect(conversation.title).toBe("Fix the chart labels on page 2");
	});

	it("keeps titles readable for legacy tasks without a separate user message", () => {
		const [conversation] = groupProjectAgentTasks([displayTask({ userPrompt: undefined, prompt: "Legacy request" })]);
		expect(conversation.title).toBe("Legacy request");
	});
});
