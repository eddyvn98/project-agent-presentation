import { describe, expect, it } from "vitest";
import { cacheDifyGeneratedFiles } from "@/lib/project-agent/files";
import { toPublicProjectAgentTask } from "@/lib/project-agent/public-task";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

describe("large PDF result kept in the board file library", () => {
	it("is listed as a task file with a resource link and no task copy", async () => {
		const resource = { boardId: "board-1", resourceId: "res-1", size: 463_000_000 };
		const out = await cacheDifyGeneratedFiles("Xong.", "pat_000000000000", "proj_1", "http://localhost:5001", "k", [{ name: "S_final.pdf", bytes: new Uint8Array(0), resource }]);
		expect(out.files).toHaveLength(1);
		expect(out.files[0]).toMatchObject({ name: "S_final.pdf", mimeType: "application/pdf", size: 463_000_000, resource: { boardId: "board-1", resourceId: "res-1" } });
	});
	it("stays listed after the 24 h task download window, unlike a plain task file", () => {
		const task = { id: "pat_000000000000", projectId: "p", ownerEmail: "a@b.c", prompt: "x", status: "done", createdAt: "", updatedAt: "", log: [], filesExpireAt: new Date(Date.now() - 1000).toISOString(),
			files: [{ id: "1", name: "big.pdf", mimeType: "application/pdf", size: 9, resource: { boardId: "b", resourceId: "r" } }, { id: "2", name: "small.pdf", mimeType: "application/pdf", size: 9 }] } as ProjectAgentTask;
		expect(toPublicProjectAgentTask(task).files?.map((file) => file.id)).toEqual(["1"]);
	});
});
