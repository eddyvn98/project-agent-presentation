import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	getToken: vi.fn(),
	getProjectAccess: vi.fn(),
	saveConvLink: vi.fn(),
	saveConvLinksBulk: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));
vi.mock("@/app/api/aidt-access/_module-guard", () => ({ requireModuleAccess: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/capabilities/project", () => ({ getProjectAccess: mocks.getProjectAccess }));
vi.mock("@/lib/capabilities/conv-links", () => ({
	listConvLinks: vi.fn(),
	saveConvLink: mocks.saveConvLink,
	saveConvLinksBulk: mocks.saveConvLinksBulk,
	deleteConvLink: vi.fn(),
}));

import { POST } from "@/app/api/conversation-links/route";

function request(body: unknown) {
	return new NextRequest("http://localhost/api/conversation-links", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/conversation-links", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getToken.mockResolvedValue({ email: "owner@example.com" });
		mocks.getProjectAccess.mockResolvedValue({ role: "OWNER", project: { id: "project-1" } });
	});

	it("rejects a project that is not owned by the signed-in user", async () => {
		mocks.getProjectAccess.mockResolvedValue(null);

		const response = await POST(request({ conversationId: "chat-1", projectId: "private-project" }));

		expect(response.status).toBe(404);
		expect(mocks.saveConvLink).not.toHaveBeenCalled();
	});

	it("saves a chat link only after confirming project ownership", async () => {
		const response = await POST(request({ conversationId: "chat-1", projectId: "project-1", category: "CHAT_KEY" }));

		expect(response.status).toBe(201);
		expect(mocks.getProjectAccess).toHaveBeenCalledWith("project-1", "owner@example.com");
		expect(mocks.saveConvLink).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
			conversationId: "chat-1",
			projectId: "project-1",
		}));
	});

	it("rejects non-assistant conversations from Project links", async () => {
		const response = await POST(request({ conversationId: "chat-1", projectId: "project-1", category: "IMAGE_KEY" }));

		expect(response.status).toBe(400);
		expect(mocks.saveConvLink).not.toHaveBeenCalled();
	});

	it("ignores unowned projects during local-link migration", async () => {
		mocks.getProjectAccess.mockImplementation(async (projectId: string) => projectId === "owned" ? { role: "OWNER", project: { id: projectId } } : null);

		const response = await POST(request({ links: [
			{ conversationId: "chat-1", projectId: "owned", category: "CHAT_KEY", linkedAt: 1 },
			{ conversationId: "chat-2", projectId: "foreign", category: "CHAT_KEY", linkedAt: 1 },
		] }));

		expect(response.status).toBe(200);
		expect(mocks.saveConvLinksBulk).toHaveBeenCalledWith("owner@example.com", [
			expect.objectContaining({ conversationId: "chat-1", projectId: "owned" }),
		]);
	});
});
