import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/project-agent/dify-agent", () => ({ runProjectAgentTask: mocks.run }));
vi.mock("@/lib/project-agent/task-store", () => ({ updateProjectAgentTask: mocks.update }));

import { startProjectAgentTask } from "@/lib/project-agent/task-runner";

function nextTurn(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("Project Agent in-process task runner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.run.mockResolvedValue(undefined);
		mocks.update.mockResolvedValue(undefined);
	});

	it("deduplicates a task while it is running and releases it when finished", async () => {
		let finish!: () => void;
		mocks.run.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));

		startProjectAgentTask("pat_123456789abc");
		startProjectAgentTask("pat_123456789abc");
		expect(mocks.run).toHaveBeenCalledTimes(1);

		finish();
		await nextTurn();
		startProjectAgentTask("pat_123456789abc");
		expect(mocks.run).toHaveBeenCalledTimes(2);
	});

	it("records an escaped runner failure on the task", async () => {
		mocks.run.mockRejectedValueOnce(new Error("Mongo unavailable"));

		startProjectAgentTask("pat_abcdef012345");
		await nextTurn();

		expect(mocks.update).toHaveBeenCalledWith("pat_abcdef012345", expect.objectContaining({
			status: "failed", error: "Mongo unavailable",
		}));
	});
});
