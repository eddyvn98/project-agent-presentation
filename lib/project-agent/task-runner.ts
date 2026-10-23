import { runProjectAgentTask } from "./dify-agent";
import { updateProjectAgentTask } from "./task-store";
import { autoTitleProjectAgentConversation } from "./chat-title";
import { afterTaskForGoal } from "./goal-hook";

import { PROJECT_AGENT_BOOT_ID, runningProjectAgentTasks as runningTasks } from "./boot";

export { PROJECT_AGENT_BOOT_ID };
export const isProjectAgentTaskRunningHere = (taskId: string) => runningTasks.has(taskId);
const controllers = new Map<string, AbortController>();

export function startProjectAgentTask(taskId: string): void {
	if (runningTasks.has(taskId)) return;
	const controller = new AbortController();
	controllers.set(taskId, controller);
	const run = runProjectAgentTask(taskId, controller.signal)
		.then(() => { void autoTitleProjectAgentConversation(taskId); })
		.catch(async (cause) => {
			const error = cause instanceof Error ? cause.message : String(cause);
			console.error(`[project-agent] task ${taskId} escaped its failure handler`, error);
			await updateProjectAgentTask(taskId, {
				status: "failed",
				completedAt: new Date().toISOString(),
				error,
				logLine: `failed: ${error}`,
			}).catch(() => {});
		})
		.finally(() => { runningTasks.delete(taskId); controllers.delete(taskId); void afterTaskForGoal(taskId, startProjectAgentTask); });
	runningTasks.set(taskId, run);
}

/** Aborts a task running in this server process. Returns false when this process is not running it. */
export function stopProjectAgentTask(taskId: string): boolean {
	const controller = controllers.get(taskId);
	if (!controller) return false;
	controller.abort();
	return true;
}
