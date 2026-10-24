import { runProjectAgentTask } from "./dify-agent";
import { updateProjectAgentTask } from "./task-store";
import { autoTitleProjectAgentConversation } from "./chat-title";
import { afterTaskForGoal } from "./goal-hook";
import { enqueueDurableTask, withDurableTaskLease, scanDurableQueue } from "./durable-mongo-queue";

import { PROJECT_AGENT_BOOT_ID, runningProjectAgentTasks as runningTasks } from "./boot";

export { PROJECT_AGENT_BOOT_ID };
export const isProjectAgentTaskRunningHere = (taskId: string) => runningTasks.has(taskId);
const controllers = new Map<string, AbortController>();

export function startProjectAgentTask(taskId: string): void {
	if (runningTasks.has(taskId)) return;
	const controller = new AbortController();
	controllers.set(taskId, controller);
	let actuallyRan = false;
	const run = (async () => {
		if (process.env.PROJECT_AGENT_DURABLE_QUEUE === "0") { actuallyRan = true; return runProjectAgentTask(taskId, controller.signal); }
		await enqueueDurableTask(taskId);
		actuallyRan = await withDurableTaskLease(taskId, async () => {
			await runProjectAgentTask(taskId, controller.signal);
		});
	})()
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
		.finally(() => { runningTasks.delete(taskId); controllers.delete(taskId); if (actuallyRan) { void afterTaskForGoal(taskId, startProjectAgentTask); void import("./workflow-runner").then(m => m.afterTaskForWorkflow(taskId)).catch(() => {}); } });
	runningTasks.set(taskId, run);
}

/** Aborts a task running in this server process. Returns false when this process is not running it. */
export function stopProjectAgentTask(taskId: string): boolean {
	const controller = controllers.get(taskId);
	if (!controller) return false;
	controller.abort();
	return true;
}

/** Cron replays only durable jobs that were queued and never claimed. Uncertain side effects require review. */
export async function tickDurableTasks(limit = 12): Promise<{ enqueued: number; uncertain: number }> {
	if (process.env.PROJECT_AGENT_DURABLE_QUEUE === "0") return { enqueued: 0, uncertain: 0 };
	const found = await scanDurableQueue(limit);
	for (const taskId of found.queued) startProjectAgentTask(taskId);
	return { enqueued: found.queued.length, uncertain: found.uncertain };
}
