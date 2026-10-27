import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

const host = vi.hoisted(() => ({
  access: vi.fn(), create: vi.fn(), read: vi.fn(), start: vi.fn(),
}));
vi.mock("@/lib/capabilities/project", () => ({ getProjectAccess: host.access }));
vi.mock("../../lib/project-agent/task-store", () => ({
  createProjectAgentTask: host.create, readProjectAgentTask: host.read,
}));
vi.mock("../../lib/project-agent/task-runner", () => ({ startProjectAgentTask: host.start }));

import { advanceWorkflowForTask, approveWorkflowStep, launchWorkflow,
  rejectWorkflowStep, tickWorkflowRuns, provideWorkflowInput } from "../../lib/project-agent/workflow-runner";
import { changeAgentWorkflow, createWorkflowRun, getWorkflowRun, listAgentWorkflows, saveAgentWorkflow,
  updateWorkflowRun } from "../../lib/project-agent/workflow-store";
import type { AgentWorkflowStep } from "../../lib/project-agent/workflow-types";
import type { RuntimeInput } from "../../lib/project-agent/runtime/run-agent-types";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { agentWorkflowAction } from "../../lib/project-agent/workflow-agent-tool";

const owner = "lifecycle-owner@example.test", projectId = "isolated-project";
const steps: AgentWorkflowStep[] = [
  { id: "step_1", title: "Collect", prompt: "Read synthetic orders", requiresApproval: false },
  { id: "step_2", title: "Publish", prompt: "Publish synthetic summary", requiresApproval: true },
];
let dir: string, sequence = 0;
const tasks = new Map<string, ProjectAgentTask>();
const finished = (taskId: string, resultText: string): ProjectAgentTask =>
  ({ ...tasks.get(taskId)!, status: "done", resultText, completedAt: new Date().toISOString() });
const makeWorkflow = () => saveAgentWorkflow(owner, {
  projectId, title: "QA sales pipeline", steps, enabled: true,
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "agent-lifecycle-"));
  process.env.PROJECT_AGENT_WORKFLOWS_DIR = dir;
  tasks.clear(); sequence = 0;
  host.access.mockReset().mockResolvedValue({ ownerEmail: owner });
  host.start.mockReset();
  host.create.mockReset().mockImplementation(async input => {
    const task = { ...input, id: "pat_" + String(++sequence).padStart(12, "0"),
      ownerEmail: owner, status: "queued", log: [], createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString() } as ProjectAgentTask;
    tasks.set(task.id, task);
    return task;
  });
  host.read.mockReset().mockImplementation(async id => tasks.get(id) ?? null);
});
afterEach(async () => {
  delete process.env.PROJECT_AGENT_WORKFLOWS_DIR;
  await rm(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("persisted workflow lifecycle with synthetic task service", () => {
  it("holds the same step for explicit missing input, then resumes exactly once", async () => {
    const definition = await makeWorkflow();
    const launched = await launchWorkflow(owner, definition.id);
    const pausedTask = { ...finished(launched.taskId!, "Need sales figures"),
      requestedInput: "What is the daily revenue?" };
    await advanceWorkflowForTask(pausedTask);
    const waiting = await getWorkflowRun(owner, launched.runId);
    expect(waiting).toMatchObject({ status: "waiting_input", index: 0,
      requestedInput: "What is the daily revenue?", history: [{ status: "waiting_input" }] });
    expect(host.create).toHaveBeenCalledTimes(1);
    expect((await tickWorkflowRuns()).resumed).toBe(0);
    await expect(provideWorkflowInput(owner, launched.runId, "")).rejects.toThrow(/input/i);
    const [a, b] = await Promise.allSettled([
      provideWorkflowInput(owner, launched.runId, "120 orders"),
      provideWorkflowInput(owner, launched.runId, "120 orders"),
    ]);
    expect([a,b].filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(host.create).toHaveBeenCalledTimes(2);
    const resume = [a,b].find(x => x.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof provideWorkflowInput>>>;
    expect(host.create.mock.calls[1][0].idempotencyKey).toContain(":input:1");
    expect(host.create.mock.calls[1][0].prompt).toContain("120 orders");
    await advanceWorkflowForTask(finished(resume.value.taskId!, "Revenue processed"));
    expect(await getWorkflowRun(owner, launched.runId)).toMatchObject({
      status: "waiting_approval", index: 1,
    });
  });

  it("requires owner review before resuming when browser side effects may exist", async () => {
    const def = await makeWorkflow(), launched = await launchWorkflow(owner, def.id);
    await advanceWorkflowForTask({ ...finished(launched.taskId!, "Need your input"),
      requestedInput: "Confirm date?", log: ["using tool browser :: clicked Submit"] });
    expect(await getWorkflowRun(owner, launched.runId)).toMatchObject({
      status: "waiting_input", inputReviewRequired: true,
    });
    await expect(provideWorkflowInput(owner, launched.runId, "Tomorrow"))
      .rejects.toThrow(/Review earlier tool effects/);
    expect(host.create).toHaveBeenCalledTimes(1);
    await provideWorkflowInput(owner, launched.runId, "Tomorrow", true);
    expect(host.create).toHaveBeenCalledTimes(2);
  });

  it("connects a synthetic model action to draft, enable, dispatch and task creation", async () => {
    const raw = JSON.stringify({ action: "workflow", op: "propose", title: "Synthetic model draft",
      steps: [{ title: "Collect", prompt: "Read synthetic orders", requiresApproval: false }] });
    const action = parseRuntimeAction(raw);
    if ("error" in action || action.action !== "workflow") throw new Error("Invalid synthetic model action");
    const input = { chatId: "chat_synthetic", user: "synthetic", query: "",
      ownerEmail: owner, projectId } as RuntimeInput;
    const proposal = await agentWorkflowAction(input, action);
    expect(proposal.failed).not.toBe(true);
    expect(proposal.text).toContain("DISABLED");
    const draft = (await listAgentWorkflows(owner))[0];
    expect(draft).toMatchObject({ title: "Synthetic model draft", enabled: false });
    await expect(launchWorkflow(owner, draft.id)).rejects.toThrow(/disabled/);
    await changeAgentWorkflow(owner, draft.id, "enable");
    const run = await launchWorkflow(owner, draft.id);
    expect(run.status).toBe("running");
    expect(host.create).toHaveBeenCalledTimes(1);
  });

  it("requires approval, rejects repeat approval and advances only after the approved task", async () => {
    const definition = await makeWorkflow();
    const launched = await launchWorkflow(owner, definition.id);
    expect(launched.status).toBe("running");
    expect(host.create).toHaveBeenCalledTimes(1);
    await advanceWorkflowForTask(finished(launched.taskId!, "Orders: 7"));
    const paused = await getWorkflowRun(owner, launched.runId);
    expect(paused).toMatchObject({ status: "waiting_approval", index: 1, history: [{ status: "done" }] });
    expect(host.create).toHaveBeenCalledTimes(1);
    const approved = await approveWorkflowStep(owner, launched.runId);
    expect(approved.status).toBe("running");
    expect(host.create).toHaveBeenCalledTimes(2);
    expect(host.create.mock.calls[1][0].prompt).toContain("Orders: 7");
    await expect(approveWorkflowStep(owner, launched.runId)).rejects.toThrow(/approval/i);
    await advanceWorkflowForTask(finished(approved.taskId!, "Published"));
    expect(await getWorkflowRun(owner, launched.runId)).toMatchObject({
      status: "done", index: 2, history: [{ status: "done" }, { status: "done" }],
    });
    await advanceWorkflowForTask(finished(approved.taskId!, "Published"));
    expect(host.create).toHaveBeenCalledTimes(2);
  });

  it("rejecting an approval never dispatches the blocked step", async () => {
    const definition = await makeWorkflow();
    const launched = await launchWorkflow(owner, definition.id);
    await advanceWorkflowForTask(finished(launched.taskId!, "Ready"));
    await rejectWorkflowStep(owner, launched.runId);
    expect(await getWorkflowRun(owner, launched.runId)).toMatchObject({ status: "failed", index: 1 });
    expect(host.create).toHaveBeenCalledTimes(1);
    await expect(approveWorkflowStep(owner, launched.runId)).rejects.toThrow(/approval/i);
  });

  it("fails closed when Project permission is revoked before dispatch", async () => {
    const definition = await makeWorkflow();
    host.access.mockResolvedValue(null);
    await expect(launchWorkflow(owner, definition.id)).rejects.toThrow(/revoked/);
    expect(host.create).not.toHaveBeenCalled();
  });

  it("quarantines an uncertain expired dispatch rather than replaying a mutation", async () => {
    const definition = await makeWorkflow();
    const run = await createWorkflowRun(owner, definition);
    await updateWorkflowRun(owner, run.id, current => {
      current.status = "dispatching";
      current.updatedAt = "2000-01-01T00:00:00.000Z";
    });
    // The store refreshes updatedAt: simulate an expired crash using controlled time.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2100-01-01T00:00:00.000Z"));
    try {
      const report = await tickWorkflowRuns();
      expect(report.uncertain).toBe(1);
      expect(await getWorkflowRun(owner, run.id)).toMatchObject({ status: "failed" });
      expect(host.create).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
});
