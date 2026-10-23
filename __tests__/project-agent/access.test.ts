import { describe, expect, it } from "vitest";
import { canAccessProjectAgentTask } from "@/lib/project-agent/access";
import { toPublicProjectAgentTask } from "@/lib/project-agent/public-task";

const task = {
	projectId: "project-1",
	projectOwnerEmail: "owner@example.com",
	ownerEmail: "member@example.com",
};

describe("Project Agent task sharing", () => {
	it("allows current Project members to view each other's Agent tasks", () => {
		expect(canAccessProjectAgentTask(task, "project-1", "OWNER@example.com", [
			"owner@example.com", "member@example.com",
		])).toBe(true);
	});

	it("revokes task visibility when the creator leaves the Project", () => {
		expect(canAccessProjectAgentTask(task, "project-1", "owner@example.com", [
			"owner@example.com",
		])).toBe(false);
	});

	it("does not expose tasks from another Project or previous owner", () => {
		expect(canAccessProjectAgentTask(task, "project-2", "owner@example.com", ["member@example.com"])).toBe(false);
		expect(canAccessProjectAgentTask(task, "project-1", "new-owner@example.com", ["member@example.com"])).toBe(false);
	});

	it("supports legacy tasks without a recorded Project owner", () => {
		expect(canAccessProjectAgentTask({ ...task, projectOwnerEmail: undefined }, "project-1", "owner@example.com", [
			"member@example.com",
		])).toBe(true);
	});

	it("lets members view shared Agent tasks without reusing another member's Dify chat", () => {
		const sharedTask = {
			...task, id: "task-1", prompt: "Create a report", status: "done" as const,
			createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z",
			conversationId: "dify-conversation-1", log: [],
		};
		const ownerView = toPublicProjectAgentTask(sharedTask, "owner@example.com");
		expect(ownerView.canContinue).toBe(false);
		expect(ownerView.conversationId).toBeUndefined();
		const memberView = toPublicProjectAgentTask(sharedTask, "MEMBER@example.com");
		expect(memberView.canContinue).toBe(true);
		expect(memberView.conversationId).toBe("dify-conversation-1");
	});
});
