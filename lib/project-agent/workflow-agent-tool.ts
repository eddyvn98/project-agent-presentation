import type { RuntimeInput } from "./runtime/run-agent-types";
import type { RuntimeAction } from "./runtime/actions";
import { listAgentWorkflows, saveAgentWorkflow } from "./workflow-store";
import * as projectCap from "@/lib/capabilities/project";
type Action = Extract<RuntimeAction, { action: "workflow" }>;

export async function agentWorkflowAction(input: RuntimeInput, action: Action) {
  if (!input.ownerEmail || !input.projectId) return { text: "Workflow requires a verified owner and Project", failed: true };
  try {
    if (action.op === "list") {
      const defs = await listAgentWorkflows(input.ownerEmail);
      return { text: JSON.stringify(defs.map(w => ({ id: w.id, title: w.title,
        projectId: w.projectId, enabled: w.enabled, steps: w.steps.map(s => s.title) }))) };
    }
    if (input.readOnly || input.depth || input.scheduledRun)
      return { text: "Only the primary interactive Agent may propose a workflow", failed: true };
    if (!await projectCap.getProjectAccess(input.projectId, input.ownerEmail))
      return { text: "Project access was revoked", failed: true };
    const workflow = await saveAgentWorkflow(input.ownerEmail, {
      id: action.id, projectId: input.projectId, title: action.title!,
      description: action.description ?? "",
      steps: (action.steps ?? []).map((step, i) => ({ ...step, id: "step_" + (i + 1) })),
      enabled: false,
    });
    return { text: "Workflow draft saved but DISABLED. It will not run until the owner enables it at /account/agent-workflows. " +
      JSON.stringify({ id: workflow.id, title: workflow.title, steps: workflow.steps.length }) };
  } catch (error) {
    return { text: "Workflow error: " + (error instanceof Error ? error.message : "unknown"), failed: true };
  }
}
