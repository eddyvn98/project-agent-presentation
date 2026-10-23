import { describe, expect, it } from "vitest";
import { isProjectAgentTaskStale, PROJECT_AGENT_STALE_AFTER_MS } from "@/lib/project-agent/task-stale";
import { PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS } from "@/lib/project-agent/timeouts";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

function makeTask(status: ProjectAgentTask["status"], updatedAt: string): ProjectAgentTask {
	return {
		id: "pat_0123456789ab", projectId: "project-1", ownerEmail: "owner@example.com",
		prompt: "Create a report", status, createdAt: updatedAt, updatedAt, log: [],
	};
}

describe("Project Agent stale task detection", () => {
	it("allows a long Dify pass to finish before the stale-task deadline", () => {
		expect(PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(180_000);
		expect(PROJECT_AGENT_DIFY_CALL_TIMEOUT_MS).toBeLessThan(PROJECT_AGENT_STALE_AFTER_MS);
	});

	it("waits longer than one Dify pass before expiring queued/running tasks", () => {
		const now = Date.now();
		const fresh = new Date(now - PROJECT_AGENT_STALE_AFTER_MS + 1).toISOString();
		const stale = new Date(now - PROJECT_AGENT_STALE_AFTER_MS).toISOString();

		expect(isProjectAgentTaskStale(makeTask("running", fresh), now)).toBe(false);
		expect(isProjectAgentTaskStale(makeTask("running", stale), now)).toBe(true);
		expect(isProjectAgentTaskStale(makeTask("queued", stale), now)).toBe(true);
	});

	it("never expires terminal tasks or tasks with invalid timestamps", () => {
		const now = Date.now();
		const old = new Date(now - PROJECT_AGENT_STALE_AFTER_MS * 2).toISOString();

		expect(isProjectAgentTaskStale(makeTask("done", old), now)).toBe(false);
		expect(isProjectAgentTaskStale(makeTask("failed", old), now)).toBe(false);
		expect(isProjectAgentTaskStale(makeTask("running", "invalid"), now)).toBe(false);
	});
});
