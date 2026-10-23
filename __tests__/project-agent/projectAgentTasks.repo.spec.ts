import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeMongo = vi.hoisted(() => {
	const docs = new Map<string, Record<string, any>>();
	const tasks = {
		createIndex: vi.fn(async () => "ok"),
		updateOne: vi.fn(async (filter: Record<string, string>, update: Record<string, any>) => {
			if (!docs.has(filter._id)) docs.set(filter._id, update.$setOnInsert);
			return { upsertedCount: 1 };
		}),
		findOne: vi.fn(async (filter: Record<string, string>) => docs.get(filter._id) ?? null),
		findOneAndUpdate: vi.fn(async (filter: Record<string, string>, update: Record<string, any>) => {
			const doc = docs.get(filter._id);
			if (!doc) return null;
			Object.assign(doc, update.$set);
			if (update.$push?.log) doc.log.push(update.$push.log);
			return { ...doc };
		}),
		find: vi.fn((filter: Record<string, string>) => {
			let selected = [...docs.values()].filter((doc) => doc.ownerEmail === filter.ownerEmail && doc.projectId === filter.projectId);
			return {
				sort: () => ({
					limit: (limit: number) => ({ toArray: async () => selected.slice(0, limit) }),
				}),
			};
		}),
	};
	return { docs, tasks };
});

vi.mock("@/services/mongodb/client", () => ({
	getMongoAiDb: async () => ({ collection: () => fakeMongo.tasks }),
}));

import {
	findProjectAgentTask,
	listProjectAgentTasks,
	patchProjectAgentTask,
	saveProjectAgentTask,
} from "@/services/mongodb/projectAgentTasks.repo";
import { toPublicProjectAgentTask } from "@/lib/project-agent/public-task";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const task: ProjectAgentTask = {
	id: "pat_0123456789ab",
	projectId: "project-a",
	ownerEmail: "owner@example.com",
	prompt: "Build a report",
	status: "queued",
	createdAt: "2026-10-14T00:00:00.000Z",
	updatedAt: "2026-10-14T00:00:00.000Z",
	log: ["queued"],
};

beforeEach(() => fakeMongo.docs.clear());

describe("Project Agent task persistence", () => {
	it("stores updates and log entries durably by task id", async () => {
		await saveProjectAgentTask(task);
		const updated = await patchProjectAgentTask(task.id, { status: "done", resultText: "Saved result" }, "completed");

		expect(updated.resultText).toBe("Saved result");
		expect(updated.log.at(-1)).toContain("completed");
		expect(await findProjectAgentTask(task.id)).toMatchObject({ status: "done", resultText: "Saved result" });
	});

	it("lists only the owner's tasks for the requested Project", async () => {
		await saveProjectAgentTask(task);
		await saveProjectAgentTask({ ...task, id: "pat_abcdef012345", projectId: "project-b" });
		await saveProjectAgentTask({ ...task, id: "pat_fedcba543210", ownerEmail: "other@example.com" });

		await expect(listProjectAgentTasks("owner@example.com", "project-a", 10))
			.resolves.toMatchObject([{ id: task.id, projectId: "project-a", ownerEmail: "owner@example.com" }]);
	});
});

describe("Project Agent history response", () => {
	it("omits internal owner/log fields and hides expired downloads", () => {
		const response = toPublicProjectAgentTask({
			...task,
			status: "done",
			files: [{ id: "file-id", name: "report.pdf", mimeType: "application/pdf", size: 100 }],
			filesExpireAt: "2020-01-01T00:00:00.000Z",
		});

		expect(response).not.toHaveProperty("ownerEmail");
		expect(response).not.toHaveProperty("log");
		expect(response.files).toEqual([]);
	});
});
