import { describe, expect, it } from "vitest";
import { resolveHydratedActiveProjectId, resolveProjectContextId } from "@/stores/project-store/resolve-active-project";

const projects = [
	{ id: "project-a", name: "A", icon: "📁", color: "#000", updatedAt: 1 },
	{ id: "project-b", name: "B", icon: "📁", color: "#000", updatedAt: 1 },
];
const conversations = [
	{ conversationId: "chat-a", projectId: "project-a", category: "CHAT_KEY", linkedAt: 1 },
];

describe("resolveHydratedActiveProjectId", () => {
	it("uses the linked project's context for an existing chat and isolates unlinked chats", () => {
		expect(resolveProjectContextId("chat-a", "project-b", conversations)).toBe("project-a");
		expect(resolveProjectContextId("chat-unlinked", "project-b", conversations)).toBeNull();
		expect(resolveProjectContextId(null, "project-b", conversations)).toBe("project-b");
	});

	it("restores the project linked to the current chat", () => {
		expect(resolveHydratedActiveProjectId({
			candidateProjectId: "project-b",
			currentConversationId: "chat-a",
			projects,
			conversations,
		})).toBe("project-a");
	});

	it("does not carry a selected project into an unrelated restored chat", () => {
		expect(resolveHydratedActiveProjectId({
			candidateProjectId: "project-b",
			currentConversationId: "chat-unlinked",
			projects,
			conversations,
		})).toBeNull();
	});

	it("restores the last project for a new chat and ignores deleted projects", () => {
		expect(resolveHydratedActiveProjectId({
			candidateProjectId: "project-b",
			currentConversationId: null,
			projects,
			conversations,
		})).toBe("project-b");
		expect(resolveHydratedActiveProjectId({
			candidateProjectId: "deleted-project",
			currentConversationId: null,
			projects,
			conversations,
		})).toBeNull();
	});
});
