import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	resolveCategoryProvider: vi.fn(),
	getProjectAccess: vi.fn(),
	projectHasSharing: vi.fn(),
	listProjectConversationsForUser: vi.fn(),
	listVisibleProjectConversations: vi.fn(),
	listProjectsSharedWith: vi.fn(),
	listOwnedProjects: vi.fn(),
	listChatSessions: vi.fn(),
}));

vi.mock("@/app/config/categoryProviderResolver", () => ({ resolveCategoryProvider: mocks.resolveCategoryProvider }));
vi.mock("@/lib/capabilities/project-sharing", () => ({
	getProjectAccess: mocks.getProjectAccess,
	projectHasSharing: mocks.projectHasSharing,
	listProjectsSharedWith: mocks.listProjectsSharedWith,
	listOwnedProjects: mocks.listOwnedProjects,
}));
vi.mock("@/lib/projects/shared-conversations", () => ({
	listProjectConversationsForUser: mocks.listProjectConversationsForUser,
	listVisibleProjectConversations: mocks.listVisibleProjectConversations,
}));
vi.mock("@/services/mongodb/chatSessions.repo", () => ({ listChatSessions: mocks.listChatSessions }));

import { loadDefaultMemoryContext, selectDefaultMemorySessions } from "@/lib/project-agent/project-chat-context";

const session = (id: string) => ({
	id, title: id, category: "CHAT_KEY" as const, region: null, updatedAt: "2026-10-14T00:00:00.000Z", pinned: false, difyConversationId: id,
});

describe("Project default memory isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.resolveCategoryProvider.mockReturnValue({ apiKey: "test-key" });
		mocks.getProjectAccess.mockResolvedValue({ role: "OWNER", project: { memoryMode: "DEFAULT", hasShared: false } });
		mocks.projectHasSharing.mockResolvedValue(false);
		mocks.listProjectConversationsForUser.mockResolvedValue([]);
		mocks.listVisibleProjectConversations.mockResolvedValue([
			{ projectId: "current", conversationId: "current-chat", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 1 },
			{ projectId: "default-project", conversationId: "default-chat", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 2 },
			{ projectId: "private-project", conversationId: "private-chat", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 3 },
		]);
		mocks.listOwnedProjects.mockResolvedValue([
			{ id: "current", memoryMode: "DEFAULT" },
			{ id: "default-project", memoryMode: "DEFAULT" },
			{ id: "private-project", memoryMode: "PROJECT_ONLY" },
		]);
		mocks.listProjectsSharedWith.mockResolvedValue([]);
		mocks.listChatSessions.mockResolvedValue({ items: [session("own-chat"), session("current-chat"), session("default-chat"), session("private-chat")], nextCursor: null });
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const id = new URL(String(input)).searchParams.get("conversation_id");
			return Response.json({ data: [{ query: `query ${id}`, answer: `answer ${id}`, created_at: 1 }] });
		}));
	});

	it("includes the user's chats and other default-memory projects, excluding Project-only chats", async () => {
		const context = await loadDefaultMemoryContext("current", "owner@example.com");
		expect(context).toContain("own-chat");
		expect(context).toContain("default-chat");
		expect(context).not.toContain("current-chat");
		expect(context).not.toContain("private-chat");
	});

	it("does not load external chats for shared or Project-only Projects", async () => {
		mocks.getProjectAccess.mockResolvedValueOnce({ role: "EDIT", project: { memoryMode: "DEFAULT", hasShared: true } });
		await expect(loadDefaultMemoryContext("current", "member@example.com")).resolves.toBe("");
		expect(mocks.listChatSessions).not.toHaveBeenCalled();

		mocks.getProjectAccess.mockResolvedValueOnce({ role: "OWNER", project: { memoryMode: "PROJECT_ONLY", hasShared: false } });
		await expect(loadDefaultMemoryContext("current", "owner@example.com")).resolves.toBe("");
		expect(mocks.listChatSessions).not.toHaveBeenCalled();
	});

	it("filters chat sessions by whether their linked Project permits default memory", () => {
		const links = [
			{ projectId: "default", conversationId: "allowed", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 1 },
			{ projectId: "isolated", conversationId: "blocked", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 1 },
			{ projectId: "current", conversationId: "same-project", createdByEmail: "owner@example.com", category: "CHAT_KEY", linkedAt: 1 },
		];
		const modes = new Map([["default", "DEFAULT" as const], ["isolated", "PROJECT_ONLY" as const], ["current", "DEFAULT" as const]]);
		expect(selectDefaultMemorySessions([session("unlinked"), session("allowed"), session("blocked"), session("same-project")], links, modes, "current").map((item) => item.difyConversationId))
			.toEqual(["unlinked", "allowed"]);
	});
});
