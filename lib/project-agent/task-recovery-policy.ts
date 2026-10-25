import type { ProjectAgentTask } from "./types";

export type TaskRecoveryPlan = "none" | "stop" | "wait_for_lease" | "review" | "dispatch";

/** Only work that has never started may be dispatched without a human decision. */
export function taskRecoveryPlan(
  task: Pick<ProjectAgentTask, "status" | "cancelled">,
  options: { durableQueue: boolean; orphaned: boolean },
): TaskRecoveryPlan {
  if (task.status === "done" || task.status === "failed") return "none";
  if (task.cancelled) return "stop";
  if (task.status === "running" && options.durableQueue) return "wait_for_lease";
  if (task.status === "running" && options.orphaned) return "review";
  if (task.status === "queued") return "dispatch";
  return "none";
}
