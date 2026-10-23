import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/project-agent/task-store", async (importOriginal) => ({
	...await importOriginal<typeof import("@/lib/project-agent/task-store")>(),
	readProjectAgentFile: vi.fn(),
}));
import { taskActivity, toPublicProjectAgentTask, toPublicProjectAgentTaskWithFileMetadata } from "@/lib/project-agent/public-task";
import { readProjectAgentFile } from "@/lib/project-agent/task-store";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const readFile = vi.mocked(readProjectAgentFile);

beforeEach(() => vi.clearAllMocks());

describe("Project Agent expired files", () => {
	it("shows a safe task progress label without exposing internal logs", () => {
		const task: ProjectAgentTask = {
			id: "pat_0123456789ab", projectId: "project-1", ownerEmail: "owner@example.com",
			prompt: "Create a report", status: "running", createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(), log: [
				"2026-10-14T00:00:00.000Z reviewing saved deliverables (pass 2/4)",
			],
		};
		const response = toPublicProjectAgentTask(task);

		expect(response.progress).toBe("Reviewing saved files (pass 2/4)");
		expect(response).not.toHaveProperty("log");
	});

	it("keeps a saved Project copy visible after the task cache expires", () => {
		const task: ProjectAgentTask = {
			id: "pat_0123456789ab",
			projectId: "project-1",
			ownerEmail: "owner@example.com",
			prompt: "Create a report",
			status: "done",
			createdAt: new Date(0).toISOString(),
			updatedAt: new Date(0).toISOString(),
			filesExpireAt: new Date(0).toISOString(),
			log: [],
			files: [
				{ id: "file-saved", name: "saved.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100, savedToProjectFileId: "kf_1234567" },
				{ id: "file-expired", name: "expired.pdf", mimeType: "application/pdf", size: 200 },
			],
		};

		expect(toPublicProjectAgentTask(task).files?.map((file) => file.id)).toEqual(["file-saved"]);
	});

	it("recovers a generated file type from stored bytes for existing tasks", async () => {
		const task: ProjectAgentTask = {
			id: "pat_0123456789ab", projectId: "project-1", ownerEmail: "owner@example.com",
			prompt: "Create a report", status: "done", createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(), log: [],
			files: [{ id: "file-html", name: "Quarterly report", mimeType: "application/octet-stream", size: 40 }],
		};
		readFile.mockResolvedValue(Buffer.from("<!DOCTYPE html><html><body>report</body></html>"));

		const response = await toPublicProjectAgentTaskWithFileMetadata(task);

		expect(response.files).toEqual([{
			id: "file-html", name: "Quarterly report.html", mimeType: "text/html",
			size: Buffer.byteLength("<!DOCTYPE html><html><body>report</body></html>"),
		}]);
	});
});

describe("taskActivity", () => {
	it("deduplicates repeated stream events by thought id and keeps queries", () => {
		const log = [
			"t1 using tool duckduckgo_search #a1",
			"t2 using tool duckduckgo_search #a1 :: green concrete 2023",
			"t3 using tool duckduckgo_search #b2 :: low carbon cement",
			"t4 using tool webscraper #c3 :: https://example.org/report",
		];
		expect(taskActivity(log)).toEqual([
			{ label: "Searching the web", kind: "search", count: 2, details: ["green concrete 2023", "low carbon cement"] },
			{ label: "Reading a web page", kind: "read", count: 1, details: ["https://example.org/report"] },
		]);
	});
});
