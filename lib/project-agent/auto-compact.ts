import { COMPACT_SUGGEST_RATIO, contextRatio } from "./context-meter";
import { listProjectAgentTasks, updateProjectAgentTask } from "./task-store";
import type { ProjectAgentTask } from "./types";

/**
 * Compacts the chat before a new message when its last run used at least COMPACT_SUGGEST_RATIO of the window.
 * Returns the Dify conversation to continue in, or undefined when nothing was compacted (or compaction failed).
 */
export async function autoCompactIfNeeded(task: ProjectAgentTask): Promise<string | undefined> {
	if (!task.conversationId) return undefined;
	try {
		const siblings = (await listProjectAgentTasks([task.ownerEmail], task.projectId, 20))
			.filter((other) => other.id !== task.id && other.conversationId === task.conversationId && other.status === "done")
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		const last = siblings[0];
		if (!last?.contextTokens || contextRatio(last.contextTokens) < COMPACT_SUGGEST_RATIO) return undefined;
		await updateProjectAgentTask(task.id, { status: "running", startedAt: new Date().toISOString(), logLine: "auto-compacting conversation" });
		const { compactChat } = await import("./compact");
		return (await compactChat(last)).difyConversationId;
	} catch {
		return undefined;
	}
}
