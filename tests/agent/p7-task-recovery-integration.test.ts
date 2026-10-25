import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/task-store", () => ({
  updateProjectAgentTask: vi.fn(), failStaleProjectAgentTask: vi.fn(),
}));
vi.mock("../../lib/project-agent/task-runner", () => ({
  PROJECT_AGENT_BOOT_ID: "boot-current",
  isProjectAgentTaskRunningHere: vi.fn(() => false),
  startProjectAgentTask: vi.fn(),
}));
import { recoverProjectAgentTask } from "../../lib/project-agent/task-recovery";
import { updateProjectAgentTask, failStaleProjectAgentTask } from "../../lib/project-agent/task-store";
import { startProjectAgentTask, isProjectAgentTaskRunningHere } from "../../lib/project-agent/task-runner";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const base: ProjectAgentTask = {
  id: "pat_123456789abc", ownerEmail: "qa@project-agent.test", projectId: "proj_qa",
  prompt: "Synthetic read-only", status: "running", bootId: "boot-before-restart",
  createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z", log: [],
};
let oldQueue: string | undefined;
beforeEach(() => {
  oldQueue = process.env.PROJECT_AGENT_DURABLE_QUEUE;
  vi.clearAllMocks();
  vi.mocked(updateProjectAgentTask).mockImplementation(async (_, patch) => ({
    ...base, ...patch,
  } as ProjectAgentTask));
  vi.mocked(failStaleProjectAgentTask).mockImplementation(async task => task);
  vi.mocked(isProjectAgentTaskRunningHere).mockReturnValue(false);
});
afterEach(() => {
  if (oldQueue === undefined) delete process.env.PROJECT_AGENT_DURABLE_QUEUE;
  else process.env.PROJECT_AGENT_DURABLE_QUEUE = oldQueue;
});
describe("P7 legacy restart integration", () => {
  it("never redispatches an orphaned running task without durable queue", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "0";
    const recovered = await recoverProjectAgentTask(base);
    expect(recovered.status).toBe("failed");
    expect(vi.mocked(updateProjectAgentTask).mock.calls[0][1].error).toMatch(/inspect the results/);
    expect(startProjectAgentTask).not.toHaveBeenCalled();
  });
  it("defaults to durable lease ownership when queue flag is absent", async () => {
    delete process.env.PROJECT_AGENT_DURABLE_QUEUE;
    expect(await recoverProjectAgentTask(base)).toBe(base);
    expect(updateProjectAgentTask).not.toHaveBeenCalled();
    expect(startProjectAgentTask).not.toHaveBeenCalled();
  });
  it("never dispatches a queued task already cancelled", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "0";
    const result = await recoverProjectAgentTask({ ...base, status: "queued", cancelled: true });
    expect(result.status).toBe("failed");
    expect(startProjectAgentTask).not.toHaveBeenCalled();
  });
  it("may dispatch genuinely queued, non-cancelled work", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "0";
    await recoverProjectAgentTask({ ...base, status: "queued" });
    expect(startProjectAgentTask).toHaveBeenCalledOnce();
    expect(startProjectAgentTask).toHaveBeenCalledWith(base.id);
  });
  it("does not expire a still-running legacy worker on UI read", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "0";
    vi.mocked(isProjectAgentTaskRunningHere).mockReturnValue(true);
    expect(await recoverProjectAgentTask({ ...base, bootId: "boot-current" })).toMatchObject({
      status: "running",
    });
    expect(failStaleProjectAgentTask).not.toHaveBeenCalled();
  });
});
