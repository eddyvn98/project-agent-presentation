import type { PublicProjectAgentTask } from "./public-task";

/** Compacts the chat the task belongs to; resolves with the "compacted" entry added to that chat. */
export async function compactProjectAgentChat(projectId: string, taskId: string): Promise<PublicProjectAgentTask> {
	const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent/compact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId }) });
	const body = await response.json().catch(() => ({})) as { task?: PublicProjectAgentTask; error?: string };
	if (!response.ok || !body.task) throw new Error(body.error ?? "Could not compact this chat");
	return body.task;
}
