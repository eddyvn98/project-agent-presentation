import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/files", () => ({ inferProjectAgentFileMetadata: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ createProjectAgentTask: vi.fn(), readProjectAgentFile: vi.fn() }));
vi.mock("../../lib/project-agent/dify-agent", () => ({ isProjectAgentDifyConfigured: () => true, runProjectAgentTask: vi.fn() }));
vi.mock("@/lib/capabilities/project", () => ({ getProject: vi.fn(), listProjects: vi.fn(), isHiddenProject: () => false }));
import { getProject } from "@/lib/capabilities/project";
import { createProjectAgentTask } from "../../lib/project-agent/task-store";
import { runProjectAgentTask } from "../../lib/project-agent/dify-agent";
import { toPublicProjectAgentTask } from "../../lib/project-agent/public-task";
import { handleProjectAgentTool } from "../../lib/mcp/tools/project-agent-tools";
const owner = "owner@example.test";
const task = { id: "task-1", projectId: "project-1", ownerEmail: owner, projectOwnerEmail: "project-owner@example.test", difyConversationId: "internal-provider-id", bootId: "internal-process-id", prompt: "Synthetic", status: "done" as const, createdAt: "", updatedAt: "", conversationId: "chat-1", log: [], steerNotes: ["User follow-up"], inputFiles: [{ id: "input", name: "test.txt", mimeType: "text/plain", size: 4 }] };
beforeEach(() => vi.clearAllMocks());
it("keeps display fields and strips internal owner/provider/process fields", () => {
  const result = toPublicProjectAgentTask(task);
  for (const key of ["ownerEmail", "projectOwnerEmail", "difyConversationId", "bootId", "log", "inputFiles"]) expect(result).not.toHaveProperty(key);
  expect(result.steerNotes).toEqual(["User follow-up"]);
  expect(result.attachments).toEqual(task.inputFiles);
  expect(toPublicProjectAgentTask(task, "viewer@example.test").conversationId).toBeUndefined();
});
it("rejects malformed handoffs before touching project capabilities", async () => {
  expect(await handleProjectAgentTool("delegate_to_web_ai", { project_id: {}, prompt: "Synthetic" }, owner)).toHaveProperty("error");
  expect(await handleProjectAgentTool("delegate_to_web_ai", { project_id: "project-1", prompt: {} }, owner)).toHaveProperty("error");
  expect(await handleProjectAgentTool("delegate_to_web_ai", { project_id: "project-1", prompt: "a".repeat(64001) }, owner)).toHaveProperty("error");
  expect(getProject).not.toHaveBeenCalled();
});
it("preserves project access and denies unavailable module engines on handoff", async () => {
  vi.mocked(getProject).mockResolvedValueOnce({ ok: false } as never);
  await handleProjectAgentTool("delegate_to_web_ai", { project_id: "project-1", prompt: "Synthetic" }, owner);
  expect(createProjectAgentTask).not.toHaveBeenCalled();
  vi.mocked(getProject).mockResolvedValueOnce({ ok: true } as never);
  vi.mocked(createProjectAgentTask).mockResolvedValue(task);
  vi.mocked(runProjectAgentTask).mockResolvedValue(task);
  const result = await handleProjectAgentTool("delegate_to_web_ai", { project_id: "project-1", prompt: "Synthetic" }, owner) as { task: unknown; completed: boolean };
  expect(createProjectAgentTask).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: owner, engines: [] }));
  expect(result.task).not.toHaveProperty("ownerEmail");
  expect(result.completed).toBe(true);
});
