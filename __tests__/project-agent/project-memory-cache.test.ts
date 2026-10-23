import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects/project-memory", () => ({
	loadProjectMemoryContext: vi.fn(async (_projectId: string, links: Array<{ conversationId: string }>) =>
		links.map((link) => link.conversationId).join(",")),
}));
vi.mock("@/stores/adapters/localStorageProjectAdapter", () => ({
	localStorageProjectAdapter: {
		saveConversation: vi.fn(),
		deleteConversation: vi.fn(),
		saveActiveProjectId: vi.fn(),
		getProject: vi.fn(() => null),
	},
}));
vi.mock("@/stores/adapters/serverProjectAdapter", () => ({
	serverProjectAdapter: {
		saveConvLink: vi.fn(async () => {}),
		deleteConvLink: vi.fn(async () => {}),
	},
}));
vi.mock("@/stores/project-store/knowledgeActions", () => ({ createKnowledgeActions: () => ({}) }));

import { useProjectStore } from "@/stores/useProjectStore";
import { memoryCache } from "@/stores/project-store/runtime";

const sourceLink = { conversationId: "conversation-1", projectId: "project-source", category: "CHAT_KEY", linkedAt: 1 };

describe("Project memory cache boundaries", () => {
	beforeEach(() => {
		memoryCache.clear();
		useProjectStore.setState({
			projects: [], activeProjectId: null, conversations: [], isHydrated: true,
			isSyncing: false, activeKnowledgeSize: 0,
		});
	});

	it("drops unlinked conversation text before refreshing the active Project", async () => {
		useProjectStore.setState({ activeProjectId: "project-source", conversations: [sourceLink] });
		memoryCache.set("project-source", "conversation-1 private history");

		await useProjectStore.getState().unlinkConversation("conversation-1");

		// unlinking now waits for the server; the private text must be gone either way.
		await vi.waitFor(() => expect(memoryCache.get("project-source") ?? "").not.toContain("private history"));
	});

	it("invalidates the old Project when a chat is moved and refreshes the destination", async () => {
		useProjectStore.setState({ activeProjectId: "project-destination", conversations: [sourceLink] });
		memoryCache.set("project-source", "conversation-1 private history");
		memoryCache.set("project-destination", "old destination history");

		useProjectStore.getState().linkConversation("conversation-1", "project-destination", "CHAT_KEY");

		expect(memoryCache.has("project-source")).toBe(false);
		expect(memoryCache.has("project-destination")).toBe(false);
		await vi.waitFor(() => expect(memoryCache.get("project-destination")).toBe("conversation-1"));
	});
});
