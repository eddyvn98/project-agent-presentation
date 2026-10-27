import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { nextWorkflowStep } from "../../lib/project-agent/workflow-branch";
import { listAgentWorkflows, saveAgentWorkflow } from "../../lib/project-agent/workflow-store";

const owner = "workflow-regression@example.test";
const projectId = "project_qa";
const steps = [{ id: "step_1", title: "Collect inputs", prompt: "Collect sales numbers", requiresApproval: false }];
let temp: string | undefined;
async function setup() {
  temp = await mkdtemp(path.join(os.tmpdir(), "workflow-regression-"));
  process.env.PROJECT_AGENT_WORKFLOWS_DIR = temp;
}
afterEach(async () => {
  delete process.env.PROJECT_AGENT_WORKFLOWS_DIR;
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
  vi.restoreAllMocks();
});

describe("workflow identity and draft persistence", () => {
  it("preserves an explicit workflow id in a parsed model action", () => {
    const id = "awf_12345678-1234-1234-1234-123456789abc";
    expect(parseRuntimeAction(JSON.stringify({ action: "workflow", op: "propose", id,
      title: "Sales review", steps }))).toMatchObject({ action: "workflow", id });
    expect(parseRuntimeAction(JSON.stringify({ action: "workflow", op: "propose",
      id: "../../outside", title: "Sales review", steps }))).toHaveProperty("error");
  });

  it("updates an existing draft instead of creating a second record", async () => {
    await setup();
    const first = await saveAgentWorkflow(owner, { projectId, title: "Sales review", steps, enabled: false });
    const second = await saveAgentWorkflow(owner, { id: first.id, projectId,
      title: "Sales review", steps, enabled: false });
    expect(second.id).toBe(first.id);
    expect((await listAgentWorkflows(owner))).toHaveLength(1);
  });

  it("deduplicates concurrent creates with the same owner, project and title", async () => {
    await setup();
    const created = await Promise.all(Array.from({ length: 5 }, () =>
      saveAgentWorkflow(owner, { projectId, title: "Sales review", steps, enabled: false })));
    expect(new Set(created.map(item => item.id)).size).toBe(1);
    expect((await listAgentWorkflows(owner))).toHaveLength(1);
  });

  it("does not collapse different project drafts into one", async () => {
    await setup();
    await saveAgentWorkflow(owner, { projectId, title: "Sales review", steps, enabled: false });
    await saveAgentWorkflow(owner, { projectId: "project_other", title: "Sales review", steps, enabled: false });
    expect((await listAgentWorkflows(owner))).toHaveLength(2);
  });
});

describe("workflow transition contract", () => {
  it("advances only for a genuinely completed task", () => {
    expect(nextWorkflowStep(steps[0], "done", "Finished: 120 orders", 0, 2, 1))
      .toMatchObject({ status: "ready", nextIndex: 1 });
  });
  it("stops on failed tasks rather than proceeding to approval", () => {
    expect(nextWorkflowStep(steps[0], "failed", "Missing required input", 0, 2, 1))
      .toMatchObject({ status: "failed", nextIndex: 0 });
  });
});
