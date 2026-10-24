import type { QueueState } from "./durable-mongo-queue";
import type { ProjectAgentTaskStatus } from "./types";
export type RecoveryDecision = "dispatch" | "wait" | "complete" | "fail" | "review";
/** Pure decision table for crash/restart outcomes: unknown side effects are never replayed. */
export function queueRecoveryDecision(queue: QueueState, task: ProjectAgentTaskStatus | null,
  leaseExpired: boolean): RecoveryDecision {
  if (queue === "needs_review") return "review";
  if (queue === "done") return "complete";
  if (queue === "failed") return "fail";
  if (queue === "queued") {
    if (task === "done") return "complete";
    if (task === "failed" || task === null) return "fail";
    if (task === "running") return "review";
    return "dispatch";
  }
  if (!leaseExpired) return "wait";
  if (task === "done") return "complete";
  if (task === "failed") return "fail";
  return "review";
}
