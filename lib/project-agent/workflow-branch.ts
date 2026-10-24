import type { AgentWorkflowStep } from "./workflow-types";
export type WorkflowOutcome = "done" | "failed";
export interface WorkflowDecision {
  nextIndex: number; status: "ready" | "done" | "failed"; error?: string;
}
/** Pure forward-only router. Replayed steps cannot silently loop or repeat external writes. */
export function nextWorkflowStep(step: AgentWorkflowStep, status: WorkflowOutcome,
  result: string, index: number, total: number, transitions: number): WorkflowDecision {
  if (transitions > 24) return { nextIndex: index, status: "failed", error: "Workflow step limit reached" };
  const output = result.slice(0, 2000).toLowerCase();
  const target = status === "failed" ? (step.onFailure ?? "stop") :
    step.route ? (output.includes(step.route.contains.toLowerCase()) ?
      step.route.onMatch : step.route.onOther) : "next";
  if (target === "stop") return { nextIndex: index,
    status: status === "failed" ? "failed" : "done" };
  const next = target === "next" ? index+1 : /^step_([1-9]|1[0-2])$/.test(target) ?
    Number(target.slice(5))-1 : -1;
  if (next <= index || next < 0 || next > total) return {
    nextIndex: index, status: "failed", error: "Workflow branch cannot go backwards or outside the steps" };
  return { nextIndex: next, status: next >= total ? "done" : "ready" };
}
