import type { ProjectAgentTask } from "./types";
import { failStaleProjectAgentTask, updateProjectAgentTask } from "./task-store";
import { isProjectAgentTaskRunningHere, PROJECT_AGENT_BOOT_ID, startProjectAgentTask } from "./task-runner";
import { isProjectAgentTaskStale, PROJECT_AGENT_STALE_AFTER_MS } from "./task-stale";

export { isProjectAgentTaskStale, PROJECT_AGENT_STALE_AFTER_MS };

const MAX_RESUMES = 1;

/** A task that says it is running but was started by an earlier server process (restart, deploy, crash) will never finish on its own. */
export function isProjectAgentTaskOrphaned(task: ProjectAgentTask): boolean {
	return task.status === "running" && Boolean(task.bootId) && task.bootId !== PROJECT_AGENT_BOOT_ID && !isProjectAgentTaskRunningHere(task.id);
}

export async function recoverProjectAgentTask(task: ProjectAgentTask): Promise<ProjectAgentTask> {
	// A durable leased task belongs to its queue worker; UI reads must never steal a live task.
	if (process.env.PROJECT_AGENT_DURABLE_QUEUE === "1" && task.status === "running") return task;
	if (isProjectAgentTaskOrphaned(task)) {
		const resumes = task.resumeCount ?? 0;
		if (resumes >= MAX_RESUMES) return updateProjectAgentTask(task.id, { status: "failed", completedAt: new Date().toISOString(), error: "The web server stopped twice while this task was running. Please send the request again.", logLine: "failed: interrupted by server restart" });
		// The chat workspace and files are still on disk, so the task starts over once on its own instead of making the user retype it.
		const resumed = await updateProjectAgentTask(task.id, { status: "queued", bootId: undefined, resumeCount: resumes + 1, logLine: "resumed: the server restarted while this task was running" });
		startProjectAgentTask(resumed.id);
		return resumed;
	}
	const current = await failStaleProjectAgentTask(task);
	if (current.status === "queued" && !isProjectAgentTaskRunningHere(current.id)) startProjectAgentTask(current.id);
	return current;
}
