import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProjectMemoryContext } from "@/lib/projects/project-memory";

describe("loadProjectMemoryContext", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("uses server-authorized shared Project chats before the browser's private session list", async () => {
		const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ context: "Owner's shared Project chat" }) } as Response));
		vi.stubGlobal("fetch", fetchMock);

		await expect(loadProjectMemoryContext("shared/project", [])).resolves.toBe("Owner's shared Project chat");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/projects/shared%2Fproject/memory-context");
	});

	it("loads only assistant conversations linked to the requested project", async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({ ok: false, status: 503 })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [
				{ id: "session-a", title: "Project A chat", category: "CHAT_KEY", difyConversationId: "conv-a", updatedAt: 2 },
				{ id: "session-b", title: "Project B chat", category: "CHAT_KEY", difyConversationId: "conv-b", updatedAt: 1 },
			] }) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
				{ query: "Question from A", answer: "Answer from A", created_at: 1 },
			] }) });
		vi.stubGlobal("fetch", fetchMock);

		const context = await loadProjectMemoryContext("project-a", [
			{ conversationId: "conv-a", projectId: "project-a", category: "CHAT_KEY" },
			{ conversationId: "conv-b", projectId: "project-b", category: "CHAT_KEY" },
			{ conversationId: "conv-image", projectId: "project-a", category: "IMAGE_KEY" },
		]);

		expect(context).toContain("Project A chat");
		expect(context).toContain("Question from A");
		expect(context).not.toContain("Project B chat");
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[0][0]).toContain("/memory-context");
		expect(fetchMock.mock.calls[1][0]).toContain("conversationIds=conv-a");
		expect(fetchMock.mock.calls[2][0]).toBe("/api/chat-sessions/session-a/messages?limit=12");
	});

	it("retrieves linked chat metadata by ID and includes multiple older project chats", async () => {
		const sessions = Array.from({ length: 24 }, (_, index) => ({
			id: `session-${index}`,
			title: `Project topic ${index}`,
			category: "CHAT_KEY",
			difyConversationId: `conv-${index}`,
			updatedAt: 100 - index,
		}));
		const fetchMock = vi.fn(async (input: string) => {
			if (input.includes("/memory-context")) return { ok: false, status: 503 } as Response;
			if (input.startsWith("/api/chat-sessions?")) return {
				ok: true,
				json: async () => ({ items: sessions }),
			} as Response;
			const sessionIndex = Number(input.match(/session-(\d+)/)?.[1] ?? 0);
			return {
				ok: true,
				json: async () => ({ data: [{ query: `Question ${sessionIndex}`, answer: `Answer ${sessionIndex}`, created_at: 1 }] }),
			} as Response;
		});
		vi.stubGlobal("fetch", fetchMock);

		const links = sessions.map((session) => ({
			conversationId: session.difyConversationId,
			projectId: "project-a",
			category: "CHAT_KEY",
		}));
		const context = await loadProjectMemoryContext("project-a", links);

		expect(context).toContain("Question 0");
		expect(context).toContain("Question 23");
		expect(fetchMock).toHaveBeenCalledTimes(26);
		expect(fetchMock.mock.calls[2][0]).toContain("limit=12");
	});

	it("returns empty context when the project has no linked assistant chats", async () => {
		const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ context: "" }) } as Response));
		vi.stubGlobal("fetch", fetchMock);

		await expect(loadProjectMemoryContext("project-a", [])).resolves.toBe("");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not fall back to stale local chat links after access is denied", async () => {
		const fetchMock = vi.fn(async () => ({ ok: false, status: 404 } as Response));
		vi.stubGlobal("fetch", fetchMock);
		await expect(loadProjectMemoryContext("revoked-project", [
			{ conversationId: "private-old-link", projectId: "revoked-project", category: "CHAT_KEY" },
		])).resolves.toBe("");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
