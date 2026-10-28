import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  abortLocal: vi.fn(), read: vi.fn(), record: vi.fn(),
  stopCAS: vi.fn(), revokeQueue: vi.fn(), revokeG2: vi.fn(),
  cleanupQA: vi.fn(), isQA: vi.fn(),
}));
vi.mock("../../lib/project-agent/task-runner", () => ({
  stopProjectAgentTask: m.abortLocal,
}));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: m.read, recordGuardedTerminalTask: m.record,
}));
vi.mock("../../lib/project-agent/task-terminal-guard", () => ({
  stopTaskIfActive: m.stopCAS,
}));
vi.mock("../../lib/project-agent/durable-mongo-queue", () => ({
  revokeDurableTaskLease: m.revokeQueue,
}));
vi.mock("../../lib/project-agent/runtime/browser-agent/g2-ownership", () => ({
  revokeG2BrowserOwnership: m.revokeG2,
}));
vi.mock("../../lib/project-agent/p7-qa-browser-cleanup", () => ({
  cleanupP7DiscardedBrowser: m.cleanupQA,
}));
vi.mock("../../lib/project-agent/p7-qa-guard", () => ({
  P7_QA_PREFIX: "[P7_SYNTHETIC_QA]", p7SyntheticTask: m.isQA,
}));
import { stopProjectAgentTaskNow } from "../../lib/project-agent/task-stop";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const task = {
  id: "pat_123456789abc", projectId: "proj-qa",
  ownerEmail: "owner@example.test", prompt: "ordinary user request",
  status: "running", cancelled: false,
} as ProjectAgentTask;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROJECT_AGENT_DURABLE_QUEUE", "1");
  vi.stubEnv("PROJECT_AGENT_P7_QA_FIXTURE", "0");
  m.read.mockResolvedValue({ ...task });
  m.stopCAS.mockResolvedValue(true);
  m.record.mockResolvedValue(undefined);
  m.revokeQueue.mockResolvedValue(true);
  m.revokeG2.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Stop orchestration: local abort, atomic terminal CAS and authority revocation", () => {
  it("aborts the local worker before any asynchronous database read", async () => {
    let finish!: (value: ProjectAgentTask) => void;
    m.read.mockImplementationOnce(() => new Promise<ProjectAgentTask>(resolve => {
      finish = resolve;
    }));
    const pending = stopProjectAgentTaskNow(task);
    expect(m.abortLocal).toHaveBeenCalledWith(task.id);
    expect(m.stopCAS).not.toHaveBeenCalled();
    expect(m.revokeQueue).not.toHaveBeenCalled();
    finish(task);
    expect(await pending).toBe("requested");
  });
  it("writes terminal receipt, then revokes both durable and Browser G2 leases", async () => {
    m.read.mockResolvedValueOnce(task).mockResolvedValueOnce({
      ...task, status: "failed", cancelled: true,
    });
    expect(await stopProjectAgentTaskNow(task)).toBe("requested");
    expect(m.stopCAS).toHaveBeenCalledWith(task);
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed", cancelled: true,
    }));
    expect(m.revokeQueue).toHaveBeenCalledWith(task.id);
    expect(m.revokeG2).toHaveBeenCalledWith(task.id, task.ownerEmail);
    const order = [
      m.abortLocal.mock.invocationCallOrder[0],
      m.read.mock.invocationCallOrder[0],
      m.stopCAS.mock.invocationCallOrder[0],
      m.record.mock.invocationCallOrder[0],
      m.revokeQueue.mock.invocationCallOrder[0],
      m.revokeG2.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("does not revoke a successful completion that won the CAS race", async () => {
    m.stopCAS.mockResolvedValueOnce(false);
    expect(await stopProjectAgentTaskNow(task)).toBe("completed");
    expect(m.abortLocal).toHaveBeenCalledOnce();
    expect(m.record).not.toHaveBeenCalled();
    expect(m.revokeQueue).not.toHaveBeenCalled();
    expect(m.revokeG2).not.toHaveBeenCalled();
  });
  it("does not perform terminal work for already completed or missing tasks", async () => {
    expect(await stopProjectAgentTaskNow({ ...task, status: "done" })).toBe("completed");
    expect(m.abortLocal).not.toHaveBeenCalled();
    m.read.mockResolvedValueOnce(null);
    expect(await stopProjectAgentTaskNow(task)).toBe("completed");
    expect(m.abortLocal).toHaveBeenCalledOnce();
    expect(m.stopCAS).not.toHaveBeenCalled();
  });
  it("returns completed when status changes during the initial re-read", async () => {
    m.read.mockResolvedValueOnce({ ...task, status: "done" });
    expect(await stopProjectAgentTaskNow(task)).toBe("completed");
    expect(m.stopCAS).not.toHaveBeenCalled();
    expect(m.revokeQueue).not.toHaveBeenCalled();
  });
  it("does not revoke Mongo queue when explicitly disabled, but revokes Browser G2", async () => {
    vi.stubEnv("PROJECT_AGENT_DURABLE_QUEUE", "0");
    expect(await stopProjectAgentTaskNow(task)).toBe("requested");
    expect(m.revokeQueue).not.toHaveBeenCalled();
    expect(m.revokeG2).toHaveBeenCalledWith(task.id, task.ownerEmail);
  });
  it("fails visibly on a database outage after local abort, without a fake completion", async () => {
    m.read.mockRejectedValueOnce(new Error("synthetic Mongo outage"));
    await expect(stopProjectAgentTaskNow(task)).rejects.toThrow("synthetic Mongo outage");
    expect(m.abortLocal).toHaveBeenCalledWith(task.id);
    expect(m.stopCAS).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });
  it("revokes G2 even if terminal read-back no longer exists", async () => {
    m.read.mockResolvedValueOnce(task).mockResolvedValueOnce(null);
    expect(await stopProjectAgentTaskNow(task)).toBe("requested");
    expect(m.record).not.toHaveBeenCalled();
    expect(m.revokeQueue).toHaveBeenCalledWith(task.id);
    expect(m.revokeG2).toHaveBeenCalledWith(task.id, task.ownerEmail);
  });
});
