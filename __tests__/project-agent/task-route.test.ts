import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	getProjectAccess: vi.fn(),
	createTask: vi.fn(),
	startTask: vi.fn(),
	getToken: vi.fn(),
}));

vi.mock("@/app/api/aidt-access/_module-guard", () => ({ requireModuleAccess: vi.fn(async () => null), allowedModulesForRequest: vi.fn(async (_req: unknown, ids: string[]) => ({ allowed: new Set(ids) })) }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));
vi.mock("@/lib/capabilities/project", () => ({ getProjectAccess: mocks.getProjectAccess }));
vi.mock("@/lib/project-agent/task-store", () => ({
	createProjectAgentTask: mocks.createTask,
	listProjectAgentTasks: vi.fn(),
}));
vi.mock("@/lib/project-agent/dify-agent", () => ({ isProjectAgentDifyConfigured: () => true }));
vi.mock("@/lib/project-agent/task-runner", () => ({ startProjectAgentTask: mocks.startTask }));

import { POST } from "@/app/api/projects/[projectId]/agent/tasks/route";

describe("Project Agent task route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getToken.mockResolvedValue({ email: "owner@example.com" });
		mocks.getProjectAccess.mockResolvedValue({ ownerEmail: "owner@example.com", canEdit: true, role: "OWNER" });
		mocks.createTask.mockResolvedValue({
			id: "pat_123456789abc", projectId: "project-1", ownerEmail: "owner@example.com",
			prompt: "Create a report", status: "queued", createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(), log: [],
		});
	});

	it("returns the persisted queued task immediately and starts Dify work in-process", async () => {
		const request = new NextRequest("http://localhost/api/projects/project-1/agent/tasks", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ prompt: "Create a report" }),
		});
		const response = await POST(request, { params: { projectId: "project-1" } });
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body.task.status).toBe("queued");
		expect(mocks.startTask).toHaveBeenCalledWith("pat_123456789abc");
	});

	it("forwards a model selector string to the task and omits anything else", async () => {
		const post = (body: unknown) => POST(new NextRequest("http://localhost/api/projects/project-1/agent/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: { projectId: "project-1" } });
		await post({ prompt: "Create a report", modelSelector: "openai/gpt-5.6-luna" });
		await post({ prompt: "Create a report", modelSelector: 7 });
		expect(mocks.createTask.mock.calls[0][0].modelSelector).toBe("openai/gpt-5.6-luna");
		expect("modelSelector" in mocks.createTask.mock.calls[1][0]).toBe(false);
	});
});
