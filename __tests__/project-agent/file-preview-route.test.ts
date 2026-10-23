import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	resolveAccess: vi.fn(),
	listMembers: vi.fn(),
	readTask: vi.fn(),
	readAgentFile: vi.fn(),
	getProject: vi.fn(),
	readKnowledgeOriginal: vi.fn(),
	readKnowledgeImage: vi.fn(),
	render: vi.fn(),
}));

vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: mocks.resolveAccess }));
vi.mock("@/lib/capabilities/project-sharing", () => ({ listProjectConversationMembers: mocks.listMembers }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mocks.readTask, readProjectAgentFile: mocks.readAgentFile }));
vi.mock("@/lib/capabilities/project", () => ({
	getProject: mocks.getProject,
	readKnowledgeOriginal: mocks.readKnowledgeOriginal,
	readKnowledgeImage: mocks.readKnowledgeImage,
}));
vi.mock("@/lib/project-agent/visual-review", () => ({ renderProjectAgentFile: mocks.render }));

import { GET as getTaskFile } from "@/app/api/projects/[projectId]/agent/tasks/[taskId]/files/[fileId]/route";
import { GET as getKnowledgeFile } from "@/app/api/projects/[projectId]/knowledge/original/route";

describe("Project Agent rendered file previews", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.resolveAccess.mockResolvedValue({ response: null, callerEmail: "member@example.com", ownerEmail: "owner@example.com" });
		mocks.listMembers.mockResolvedValue(["member@example.com"]);
		mocks.readTask.mockResolvedValue({
			id: "task-1", projectId: "project-1", ownerEmail: "member@example.com", projectOwnerEmail: "owner@example.com",
			filesExpireAt: new Date(Date.now() + 60_000).toISOString(),
			files: [{ id: "file-1", name: "report.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 4 }],
		});
		mocks.readAgentFile.mockResolvedValue(Buffer.from("book"));
		mocks.getProject.mockResolvedValue({ ok: true, data: { knowledgeFiles: [{ id: "saved-1", name: "report.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileType: "document" }] } });
		mocks.readKnowledgeOriginal.mockResolvedValue({ buffer: Buffer.from("book"), filename: "report.xlsx" });
		mocks.render.mockResolvedValue({ bytes: Buffer.from("png"), label: "report.xlsx visual review" });
	});

	it("renders a task file only after Project member access is verified", async () => {
		const response = await getTaskFile(
			new NextRequest("http://localhost/api/projects/project-1/agent/tasks/task-1/files/file-1?rendered=1"),
			{ params: { projectId: "project-1", taskId: "task-1", fileId: "file-1" } },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png");
		expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ name: "report.xlsx" }), Buffer.from("book"));

		mocks.resolveAccess.mockResolvedValue({ response: new Response("denied", { status: 403 }) });
		const denied = await getTaskFile(
			new NextRequest("http://localhost/api/projects/project-1/agent/tasks/task-1/files/file-1?rendered=1"),
			{ params: { projectId: "project-1", taskId: "task-1", fileId: "file-1" } },
		);
		expect(denied.status).toBe(403);
		expect(mocks.render).toHaveBeenCalledTimes(1);
	});

	it("serves legacy HTML outputs inline after identifying their stored bytes", async () => {
		mocks.readTask.mockResolvedValue({
			id: "task-1", projectId: "project-1", ownerEmail: "member@example.com", projectOwnerEmail: "owner@example.com",
			files: [{ id: "file-1", name: "Quarterly report", mimeType: "application/octet-stream", size: 40 }],
		});
		mocks.readAgentFile.mockResolvedValue(Buffer.from("<!DOCTYPE html><html><body>report</body></html>"));

		const response = await getTaskFile(
			new NextRequest("http://localhost/api/projects/project-1/agent/tasks/task-1/files/file-1?preview=1"),
			{ params: { projectId: "project-1", taskId: "task-1", fileId: "file-1" } },
		);

		expect(response.headers.get("content-type")).toBe("text/html");
		expect(response.headers.get("content-disposition")).toContain("inline");
		expect(response.headers.get("content-security-policy")).toContain("sandbox");
	});

	it("renders a saved Project original for preview after task-file expiry", async () => {
		const response = await getKnowledgeFile(
			new NextRequest("http://localhost/api/projects/project-1/knowledge/original?fileId=saved-1&rendered=1"),
			{ params: { projectId: "project-1" } },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ name: "report.xlsx" }), Buffer.from("book"));
	});
});
