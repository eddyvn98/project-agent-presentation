import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/task-runner", () => ({ stopProjectAgentTask: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: vi.fn(), recordGuardedTerminalTask: vi.fn(),
}));
vi.mock("../../lib/project-agent/p7-qa-browser-cleanup", () => ({
  cleanupP7DiscardedBrowser: vi.fn(),
}));
vi.mock("../../lib/project-agent/durable-mongo-queue", () => ({
  revokeDurableTaskLease: vi.fn(),
}));
vi.mock("../../lib/project-agent/task-terminal-guard", () => ({
  stopTaskIfActive: vi.fn(),
}));
import { stopProjectAgentTaskNow } from "../../lib/project-agent/task-stop";
import { stopProjectAgentTask } from "../../lib/project-agent/task-runner";
import { readProjectAgentTask, recordGuardedTerminalTask } from "../../lib/project-agent/task-store";
import { stopTaskIfActive } from "../../lib/project-agent/task-terminal-guard";
import { cleanupP7DiscardedBrowser } from "../../lib/project-agent/p7-qa-browser-cleanup";
import { revokeDurableTaskLease } from "../../lib/project-agent/durable-mongo-queue";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const synthetic = {
  id: "pat_123456789abc", projectId: "proj_synthetic",
  ownerEmail: "p7-owner@project-agent.test",
  prompt: "[P7_SYNTHETIC_QA] browser fixture - local synthetic data only",
  status: "running",
} as ProjectAgentTask;
const oldFixture = process.env.PROJECT_AGENT_P7_QA_FIXTURE;
const oldQueue = process.env.PROJECT_AGENT_DURABLE_QUEUE;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROJECT_AGENT_P7_QA_FIXTURE = "1";
  process.env.PROJECT_AGENT_DURABLE_QUEUE = "0";
  vi.mocked(stopProjectAgentTask).mockReturnValue(false);
  vi.mocked(readProjectAgentTask).mockResolvedValue(synthetic);
  vi.mocked(stopTaskIfActive).mockResolvedValue(true);
  vi.mocked(cleanupP7DiscardedBrowser).mockResolvedValue(true);
  vi.mocked(revokeDurableTaskLease).mockResolvedValue(true);
});
afterEach(() => {
  if (oldFixture === undefined) delete process.env.PROJECT_AGENT_P7_QA_FIXTURE;
  else process.env.PROJECT_AGENT_P7_QA_FIXTURE = oldFixture;
  if (oldQueue === undefined) delete process.env.PROJECT_AGENT_DURABLE_QUEUE;
  else process.env.PROJECT_AGENT_DURABLE_QUEUE = oldQueue;
});
describe("P7 synthetic Stop disposes an orphan browser", () => {
  it("cleans the synthetic session after marking Stop", async () => {
    expect(await stopProjectAgentTaskNow(synthetic)).toBe("requested");
    expect(stopTaskIfActive).toHaveBeenCalledWith(synthetic);
    expect(recordGuardedTerminalTask).toHaveBeenCalledTimes(1);
    expect(cleanupP7DiscardedBrowser).toHaveBeenCalledTimes(1);
    expect(cleanupP7DiscardedBrowser).toHaveBeenCalledWith(synthetic.id);
  });
  it("revokes a durable lease when Stop comes from a different worker", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "1";
    expect(await stopProjectAgentTaskNow(synthetic)).toBe("requested");
    expect(stopTaskIfActive).toHaveBeenCalledWith(synthetic);
    expect(recordGuardedTerminalTask).toHaveBeenCalledTimes(1);
    expect(revokeDurableTaskLease).toHaveBeenCalledWith(synthetic.id);
  });
  it("revokes a durable lease even when Stop aborts the local worker", async () => {
    process.env.PROJECT_AGENT_DURABLE_QUEUE = "1";
    vi.mocked(stopProjectAgentTask).mockReturnValue(true);
    expect(await stopProjectAgentTaskNow(synthetic)).toBe("requested");
    expect(revokeDurableTaskLease).toHaveBeenCalledWith(synthetic.id);
  });
  it("does not overwrite done when terminal completion won the race", async () => {
    vi.mocked(stopTaskIfActive).mockResolvedValue(false);
    expect(await stopProjectAgentTaskNow(synthetic)).toBe("completed");
    expect(revokeDurableTaskLease).not.toHaveBeenCalled();
    expect(cleanupP7DiscardedBrowser).not.toHaveBeenCalled();
    expect(recordGuardedTerminalTask).not.toHaveBeenCalled();
  });
  it("does not touch employee browser sessions", async () => {
    const employee = { ...synthetic, prompt: "Read a public webpage" };
    vi.mocked(readProjectAgentTask).mockResolvedValue(employee);
    expect(await stopProjectAgentTaskNow(employee)).toBe("requested");
    expect(cleanupP7DiscardedBrowser).not.toHaveBeenCalled();
  });
  it("does not cleanup a synthetic task when QA flag is off", async () => {
    delete process.env.PROJECT_AGENT_P7_QA_FIXTURE;
    await stopProjectAgentTaskNow(synthetic);
    expect(cleanupP7DiscardedBrowser).not.toHaveBeenCalled();
  });
  it("does not close a task that already finished", async () => {
    expect(await stopProjectAgentTaskNow({ ...synthetic, status: "done" })).toBe("completed");
    expect(cleanupP7DiscardedBrowser).not.toHaveBeenCalled();
  });
});
