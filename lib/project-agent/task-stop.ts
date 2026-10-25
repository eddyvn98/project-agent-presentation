import type { ProjectAgentTask } from "./types";
import { stopProjectAgentTask } from "./task-runner";
import { readProjectAgentTask, updateProjectAgentTask } from "./task-store";
import { cleanupP7DiscardedBrowser } from "./p7-qa-browser-cleanup";
import { p7SyntheticTask, P7_QA_PREFIX } from "./p7-qa-guard";

/** Stops a task: aborts it when this process runs it, otherwise marks it stopped so the UI is unblocked. "completed" means it had already finished. */
export async function stopProjectAgentTaskNow(task: ProjectAgentTask): Promise<"requested" | "completed"> {
	if (task.status === "done" || task.status === "failed") return "completed";
	if (stopProjectAgentTask(task.id)) return "requested";
	const latest = await readProjectAgentTask(task.id);
	if (!latest || latest.status === "done" || latest.status === "failed") return "completed";
	await updateProjectAgentTask(task.id, { status: "failed", cancelled: true, completedAt: new Date().toISOString(), error: "Stopped by you.", logLine: "stopped by user" });
  // QA fixture has no task runner or AbortSignal to close its in-memory browser.
  // Explicit Stop must discard its Watch/frame/context even without a recovery call.
  if (process.env.NODE_ENV !== "production" && process.env.PROJECT_AGENT_P7_QA_FIXTURE === "1" &&
      latest.prompt === `${P7_QA_PREFIX} browser fixture - local synthetic data only` &&
      p7SyntheticTask(latest, latest.projectId, latest.ownerEmail)) {
    await cleanupP7DiscardedBrowser(latest.id).catch(() => {});
  }
	return "requested";
}
