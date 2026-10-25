import type { ProjectAgentTask } from "./types";
import { stopProjectAgentTask } from "./task-runner";
import { readProjectAgentTask } from "./task-store";
import { stopTaskIfActive } from "./task-terminal-guard";
import { cleanupP7DiscardedBrowser } from "./p7-qa-browser-cleanup";
import { p7SyntheticTask, P7_QA_PREFIX } from "./p7-qa-guard";
import { revokeDurableTaskLease } from "./durable-mongo-queue";

/** Stop is an atomic terminal transition, never an unconditional stale write. */
export async function stopProjectAgentTaskNow(task: ProjectAgentTask): Promise<"requested" | "completed"> {
  if (task.status === "done" || task.status === "failed") return "completed";
  stopProjectAgentTask(task.id); // Abort local work immediately, even before Mongo I/O.
  const latest = await readProjectAgentTask(task.id);
  if (!latest || latest.status === "done" || latest.status === "failed") return "completed";
  const stopped = await stopTaskIfActive(latest);
  if (!stopped) return "completed"; // Completion or another Stop already won.
  if (process.env.PROJECT_AGENT_DURABLE_QUEUE !== "0")
    await revokeDurableTaskLease(task.id);
  // An orphan synthetic fixture has no runner/AbortSignal of its own.
  if (process.env.NODE_ENV !== "production" && process.env.PROJECT_AGENT_P7_QA_FIXTURE === "1" &&
      latest.prompt === `${P7_QA_PREFIX} browser fixture - local synthetic data only` &&
      p7SyntheticTask(latest, latest.projectId, latest.ownerEmail))
    await cleanupP7DiscardedBrowser(latest.id).catch(() => {});
  return "requested";
}
