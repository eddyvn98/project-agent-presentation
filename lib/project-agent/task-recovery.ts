import type { ProjectAgentTask } from "./types";
import { failStaleProjectAgentTask, updateProjectAgentTask } from "./task-store";
import { isProjectAgentTaskRunningHere, PROJECT_AGENT_BOOT_ID, startProjectAgentTask } from "./task-runner";
import { isProjectAgentTaskStale, PROJECT_AGENT_STALE_AFTER_MS } from "./task-stale";
import { taskRecoveryPlan } from "./task-recovery-policy";

export { isProjectAgentTaskStale, PROJECT_AGENT_STALE_AFTER_MS };

/** A task with the prior process's boot ID may have completed external side effects. */
export function isProjectAgentTaskOrphaned(task: ProjectAgentTask): boolean {
  return task.status === "running" && Boolean(task.bootId) &&
    task.bootId !== PROJECT_AGENT_BOOT_ID && !isProjectAgentTaskRunningHere(task.id);
}

export async function recoverProjectAgentTask(task: ProjectAgentTask): Promise<ProjectAgentTask> {
  const decision = taskRecoveryPlan(task, {
    // Runner defaults to the durable queue unless explicitly disabled.
    durableQueue: process.env.PROJECT_AGENT_DURABLE_QUEUE !== "0",
    orphaned: isProjectAgentTaskOrphaned(task),
  });
  if (decision === "wait_for_lease") return task;
  // Legacy running work without a recorded boot ID is not safe to replay.
  if (decision === "none") return task.status === "running" &&
    process.env.PROJECT_AGENT_DURABLE_QUEUE === "0" ? failStaleProjectAgentTask(task) : task;
  if (decision === "stop") {
    return updateProjectAgentTask(task.id, {
      status: "failed", cancelled: true, completedAt: new Date().toISOString(),
      error: "Stopped by you.", logLine: "failed: cancelled task will not resume",
    });
  }
  if (decision === "review") {
    return updateProjectAgentTask(task.id, {
      status: "failed", completedAt: new Date().toISOString(),
      error: "Server restarted while this task was running. External actions may have occurred; inspect the results before retrying.",
      logLine: "failed: restart has uncertain side effects; manual review required",
    });
  }
  // Only queued, non-cancelled tasks may be scheduled again without replay risk.
  const current = await failStaleProjectAgentTask(task);
  if (current.status === "queued" && !current.cancelled &&
      !isProjectAgentTaskRunningHere(current.id)) startProjectAgentTask(current.id);
  return current;
}
