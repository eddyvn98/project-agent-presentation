import type { ProjectAgentTask } from "./types";
import { stopProjectAgentTask } from "./task-runner";
import { readProjectAgentTask, updateProjectAgentTask } from "./task-store";

/** Stops a task: aborts it when this process runs it, otherwise marks it stopped so the UI is unblocked. "completed" means it had already finished. */
export async function stopProjectAgentTaskNow(task: ProjectAgentTask): Promise<"requested" | "completed"> {
	if (task.status === "done" || task.status === "failed") return "completed";
	if (stopProjectAgentTask(task.id)) return "requested";
	const latest = await readProjectAgentTask(task.id);
	if (!latest || latest.status === "done" || latest.status === "failed") return "completed";
	await updateProjectAgentTask(task.id, { status: "failed", cancelled: true, completedAt: new Date().toISOString(), error: "Stopped by you.", logLine: "stopped by user" });
	return "requested";
}
