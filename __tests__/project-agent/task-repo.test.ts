import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const cursor = {
		sort: vi.fn(() => cursor),
		limit: vi.fn(() => cursor),
		toArray: vi.fn(async () => []),
	};
	const collection = {
		createIndex: vi.fn(async () => "index"),
		find: vi.fn(() => cursor),
	};
	return { collection, cursor };
});

vi.mock("@/services/mongodb/client", () => ({
	getMongoAiDb: async () => ({ collection: () => mocks.collection }),
}));

import { listProjectAgentTasks } from "@/services/mongodb/projectAgentTasks.repo";

describe("Project Agent task listing", () => {
	beforeEach(() => vi.clearAllMocks());

	it("fetches one bounded Project history for the active member set", async () => {
		await listProjectAgentTasks(["owner@example.com", "member@example.com"], "project-1", 10);

		expect(mocks.collection.find).toHaveBeenCalledWith({
			ownerEmail: { $in: ["owner@example.com", "member@example.com"] },
			projectId: "project-1",
		});
		expect(mocks.cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
		// The repository asks for one extra row to know whether another page exists.
		expect(mocks.cursor.limit).toHaveBeenCalledWith(11);
	});

	it("does not query task storage when no members are authorized", async () => {
		await expect(listProjectAgentTasks([], "project-1", 10)).resolves.toEqual({ tasks: [], hasMore: false });
		expect(mocks.collection.find).not.toHaveBeenCalled();
	});
});
