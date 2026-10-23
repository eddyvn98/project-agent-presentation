import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("@/lib/projects/api-access", () => ({ resolveProjectRequestAccess: vi.fn() }));
vi.mock("@/lib/capabilities/project-sharing", () => ({ listProjectConversationMembers: vi.fn() }));
vi.mock("@/app/api/aidt-access/_module-guard", () => ({ allowedModulesForRequest: vi.fn() }));
vi.mock("@/lib/capabilities/project", () => ({ getProject: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ createProjectAgentTask: vi.fn(), listProjectAgentTaskPage: vi.fn(), readProjectAgentTask: vi.fn() }));
vi.mock("../../lib/project-agent/public-task", () => ({ toPublicProjectAgentTask: (task: unknown) => task, toPublicProjectAgentTaskWithFileMetadata: vi.fn() }));
vi.mock("../../lib/project-agent/dify-agent", () => ({ isProjectAgentDifyConfigured: () => true }));
vi.mock("../../lib/project-agent/task-runner", () => ({ startProjectAgentTask: vi.fn() }));
vi.mock("../../lib/project-agent/task-recovery", () => ({ recoverProjectAgentTask: vi.fn() }));
vi.mock("../../lib/project-agent/files", () => ({ inferProjectAgentFileMimeType: vi.fn() }));
vi.mock("../../lib/project-agent/goal-store", () => ({ newGoal: vi.fn(), saveGoal: vi.fn() }));
import { POST } from "../../app/api/projects/[projectId]/agent/tasks/route";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { allowedModulesForRequest } from "@/app/api/aidt-access/_module-guard";
import { getProject } from "@/lib/capabilities/project";
import { createProjectAgentTask, readProjectAgentTask } from "../../lib/project-agent/task-store";
import { startProjectAgentTask } from "../../lib/project-agent/task-runner";
const send = (body: unknown) => POST(new NextRequest("http://localhost/api/projects/project-1/agent/tasks", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: { projectId: "project-1" } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveProjectRequestAccess).mockResolvedValue({ callerEmail: "caller@example.test", ownerEmail: "owner@example.test" } as never);
  vi.mocked(allowedModulesForRequest).mockResolvedValue({ allowed: new Set() } as never);
});
it("checks host authentication before parsing or creating tasks", async () => {
  vi.mocked(resolveProjectRequestAccess).mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as never);
  expect((await send({ prompt: "Synthetic" })).status).toBe(401);
  expect(createProjectAgentTask).not.toHaveBeenCalled();
});
it.each([null, [], { prompt: {} }, { prompt: "Synthetic", goal: { objective: [] } }, { prompt: "Synthetic", conversationId: [] }])("rejects malformed task requests %j", async (body) => {
  expect((await send(body)).status).toBe(400);
  expect(createProjectAgentTask).not.toHaveBeenCalled();
});
it("rejects oversized prompts before running host tasks", async () => {
  expect((await send({ prompt: "x".repeat(64001) })).status).toBe(413);
  expect(startProjectAgentTask).not.toHaveBeenCalled();
});
it("preserves source ownership checks", async () => {
  vi.mocked(getProject).mockResolvedValue({ ok: true, data: { knowledgeFiles: [] } } as never);
  expect((await send({ prompt: "Synthetic", inputFiles: [{ id: "upload-1", name: "synthetic.txt", mimeType: "text/plain", size: 4, projectSourceId: "missing-source" }] })).status).toBe(400);
  expect(createProjectAgentTask).not.toHaveBeenCalled();
});
it("does not reuse another user's attachments and retains module guards", async () => {
  vi.mocked(readProjectAgentTask).mockResolvedValue({ projectId: "project-1", ownerEmail: "someone-else@example.test", inputFiles: [{ id: "private-file" }] } as never);
  vi.mocked(createProjectAgentTask).mockResolvedValue({ id: "task-1" } as never);
  expect((await send({ prompt: "Synthetic", retryOfTaskId: "previous-task" })).status).toBe(202);
  expect(createProjectAgentTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", ownerEmail: "caller@example.test", projectOwnerEmail: "owner@example.test", engines: [] }));
  expect(vi.mocked(createProjectAgentTask).mock.calls[0][0]).not.toHaveProperty("reuseInputsFrom");
  expect(allowedModulesForRequest).toHaveBeenCalledTimes(2);
  expect(startProjectAgentTask).toHaveBeenCalledWith("task-1");
});
it.each([123, null, false, {}, []].map((modelSelector) => ({ modelSelector })))("ignores non-string modelSelector $modelSelector under the existing host contract", async ({ modelSelector }) => {
  vi.mocked(createProjectAgentTask).mockResolvedValue({ id: "task-selector" } as never);
  expect((await send({ prompt: "Synthetic", modelSelector })).status).toBe(202);
  expect(vi.mocked(createProjectAgentTask).mock.calls[0][0]).not.toHaveProperty("modelSelector");
  expect(startProjectAgentTask).toHaveBeenCalledWith("task-selector");
});
it("forwards string modelSelector to the existing task-store normalizer", async () => {
  vi.mocked(createProjectAgentTask).mockResolvedValue({ id: "task-selector" } as never);
  expect((await send({ prompt: "Synthetic", modelSelector: "synthetic/model" })).status).toBe(202);
  expect(createProjectAgentTask).toHaveBeenCalledWith(expect.objectContaining({ modelSelector: "synthetic/model" }));
});
