import type { ProjectAgentTask } from "./types";

export const PROJECT_AGENT_STALE_AFTER_MS = 15 * 60 * 1_000;

export function isProjectAgentTaskStale(task: ProjectAgentTask, now = Date.now()): boolean {
	if (task.status !== "queued" && task.status !== "running") return false;
	const updatedAt = Date.parse(task.updatedAt);
	return Number.isFinite(updatedAt) && now - updatedAt >= PROJECT_AGENT_STALE_AFTER_MS;
}
