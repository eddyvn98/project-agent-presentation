import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-agent/task-store", () => ({ failStaleProjectAgentTask: vi.fn(async (task: unknown) => task), updateProjectAgentTask: vi.fn(async (id: string, patch: object) => ({ id, ...patch })) }));
vi.mock("@/lib/project-agent/dify-agent", () => ({ runProjectAgentTask: vi.fn(async () => {}) }));
vi.mock("@/lib/project-agent/chat-title", () => ({ autoTitleProjectAgentConversation: vi.fn() }));

import { isProjectAgentTaskOrphaned, recoverProjectAgentTask } from "@/lib/project-agent/task-recovery";
import { PROJECT_AGENT_BOOT_ID } from "@/lib/project-agent/task-runner";
import type { ProjectAgentTask } from "@/lib/project-agent/types";

const task = (patch: Partial<ProjectAgentTask>) => ({ id: "pat_1", status: "running", bootId: "old-boot", log: [], ...patch }) as ProjectAgentTask;

describe("task recovery after a server restart", () => {
	it("recognises a task left running by an earlier process", () => {
		expect(isProjectAgentTaskOrphaned(task({}))).toBe(true);
		expect(isProjectAgentTaskOrphaned(task({ bootId: PROJECT_AGENT_BOOT_ID }))).toBe(false);
		expect(isProjectAgentTaskOrphaned(task({ status: "done" }))).toBe(false);
		expect(isProjectAgentTaskOrphaned(task({ bootId: undefined }))).toBe(false);
	});

	it("resumes once, then fails", async () => {
		expect((await recoverProjectAgentTask(task({}))).status).toBe("queued");
		expect((await recoverProjectAgentTask(task({ id: "pat_2", resumeCount: 1 }))).status).toBe("failed");
	});
});
