import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getProjectAccess: vi.fn(),
	getProjectKnowledgeContext: vi.fn(),
	uploadProjectKnowledgeFiles: vi.fn(),
	uploadProjectAgentTaskInputFiles: vi.fn(),
	uploadProjectAgentReviewFile: vi.fn(),
	renderProjectAgentFile: vi.fn(),
	loadProjectChatContext: vi.fn(),
	loadProjectAgentTaskContext: vi.fn(),
	readProjectAgentTask: vi.fn(),
	readProjectAgentFile: vi.fn(),
	updateProjectAgentTask: vi.fn(),
	cacheDifyGeneratedFiles: vi.fn(),
}));

vi.mock("@/lib/capabilities/project", () => ({
	getProjectAccess: mocks.getProjectAccess,
	getProject: vi.fn().mockResolvedValue({ ok: true, data: { knowledgeFiles: [] } }),
	getProjectKnowledgeContext: mocks.getProjectKnowledgeContext,
}));
vi.mock("@/lib/bm25", () => ({ bm25Filter: vi.fn() }));
vi.mock("@/lib/vector-store", () => ({ semanticSearch: vi.fn(), vectorIndexExists: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/project-agent/files", () => ({
	cacheDifyGeneratedFiles: mocks.cacheDifyGeneratedFiles,
	findDifyGeneratedFileLinks: (answer: string, origin: string) => {
		const url = answer.match(/https?:\/\/[^\s)]+/)?.[0];
		return url && new URL(url).origin === origin ? [{ label: "updated.docx", url }] : [];
	},
}));
vi.mock("@/lib/project-agent/dify-input-files", () => ({
	uploadProjectAgentTaskInputFiles: mocks.uploadProjectAgentTaskInputFiles,
	uploadProjectAgentReviewFile: mocks.uploadProjectAgentReviewFile,
	uploadProjectKnowledgeFiles: mocks.uploadProjectKnowledgeFiles,
}));
vi.mock("@/lib/project-agent/intent", () => ({ requiresProjectAgentFileOutput: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/project-agent/visual-review", () => ({ renderProjectAgentFile: mocks.renderProjectAgentFile, buildVisualReviewContactSheet: vi.fn(async () => Buffer.from("png")) }));
vi.mock("@/lib/project-agent/project-chat-context", () => ({
	loadProjectChatContext: mocks.loadProjectChatContext,
	loadDefaultMemoryContext: vi.fn().mockResolvedValue(""),
}));
vi.mock("@/lib/project-agent/task-context", () => ({ loadProjectAgentTaskContext: mocks.loadProjectAgentTaskContext }));
vi.mock("@/lib/project-agent/task-store", () => ({
	readProjectAgentTask: mocks.readProjectAgentTask,
	readProjectAgentFile: mocks.readProjectAgentFile,
	updateProjectAgentTask: mocks.updateProjectAgentTask,
}));

import { runProjectAgentTask } from "@/lib/project-agent/dify-agent";

function difyResponse(answer: string, conversationId = "conversation-1"): Response {
	const body = `data: ${JSON.stringify({ event: "message", answer, conversation_id: conversationId })}\n\n`;
	return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

describe("Project Agent saved-file review loop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("PROJECT_AGENT_DIFY_API_URL", "https://dify.example/v1");
		vi.stubEnv("PROJECT_AGENT_DIFY_API_KEY", "test-key");
		mocks.readProjectAgentTask.mockResolvedValue({
			id: "task-1", projectId: "project-1", ownerEmail: "member@example.com", prompt: "Create a two-page report",
			status: "queued", createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z", log: [],
		});
		mocks.getProjectAccess.mockResolvedValue({
			ownerEmail: "owner@example.com",
			project: { name: "Quarterly Report", description: "", instructions: "", knowledgeFiles: [] },
		});
		mocks.getProjectKnowledgeContext.mockResolvedValue({ textChunks: [] });
		process.env.PROJECT_AGENT_REVIEW_MODE = "dify"; // covers the model-driven review loop
		mocks.uploadProjectKnowledgeFiles.mockResolvedValue({ files: [], names: [] });
		mocks.uploadProjectAgentTaskInputFiles.mockResolvedValue({ files: [], names: [], totalBytes: 0 });
		mocks.loadProjectChatContext.mockResolvedValue("");
		mocks.loadProjectAgentTaskContext.mockResolvedValue("");
		mocks.updateProjectAgentTask.mockImplementation(async (_id, update) => ({ ...update }));
		mocks.readProjectAgentFile.mockImplementation(async (_taskId, fileId) => Buffer.from(`saved bytes for ${fileId}`));
		mocks.renderProjectAgentFile.mockImplementation(async (file, bytes) => ({
			bytes: Buffer.from(`preview for ${file.name}`),
			label: `${file.name} rendered preview`,
			readbackText: bytes.toString(),
		}));
		mocks.uploadProjectAgentReviewFile.mockImplementation(async (file, _bytes, _user, _endpoint, _key, image) => ({
			type: image ? "image" : "document", transfer_method: "local_file", url: "", upload_file_id: `${file.name}-${image ? "preview" : "source"}`,
		}));
		mocks.cacheDifyGeneratedFiles
			.mockResolvedValueOnce({ resultText: "Draft report", files: [{ id: "file-1", name: "draft.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 }] })
			.mockResolvedValueOnce({ resultText: "Revised report", files: [{ id: "file-2", name: "updated.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 12 }] });
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(difyResponse("Draft file: https://dify.example/files/tools/draft.docx?sign=one"))
			.mockResolvedValueOnce(difyResponse("VISUAL_QA_REVISED\nUpdated file: https://dify.example/files/tools/updated.docx?sign=two"))
			.mockResolvedValueOnce(difyResponse("VISUAL_QA_PASS\nVerified title, page count, and rendered layout.")));
	});

	it("reopens and renders the replacement before accepting the final review", async () => {
		const result = await runProjectAgentTask("task-1");

		expect(mocks.readProjectAgentFile.mock.calls.map((call) => call[1])).toEqual(["file-1", "file-2"]);
		expect(mocks.renderProjectAgentFile.mock.calls.map((call) => call[0].name)).toEqual(["draft.docx", "updated.docx"]);
		expect(mocks.uploadProjectAgentReviewFile).toHaveBeenCalledTimes(2);
		const requestBodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as { query: string; files: unknown[] });
		expect(requestBodies[1].query).toContain("saved bytes for file-1");
		expect(requestBodies[1].files).toHaveLength(1); // one contact sheet per review pass
		expect(requestBodies[2].query).toContain("saved bytes for file-2");
		expect(requestBodies[2].query).toContain("updated.docx rendered preview");
		expect(result.status).toBe("done");
		expect(result.files?.map((file) => file.id)).toEqual(["file-2"]);
		expect(result.resultText).toContain("Verified title, page count, and rendered layout.");
	});
});
