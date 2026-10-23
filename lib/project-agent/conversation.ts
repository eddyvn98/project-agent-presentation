import { listProjectAgentTasks } from "./task-store";
import type { ProjectAgentTask } from "./types";

/**
 * The Dify conversation a chat currently runs in. After a compaction the chat keeps its id (conversationId)
 * while a fresh Dify conversation, seeded with the summary, sits behind it.
 */
export async function resolveDifyConversationId(task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId" | "difyConversationId">): Promise<string | undefined> {
	if (!task.conversationId) return undefined;
	if (task.difyConversationId) return task.difyConversationId;
	const siblings = (await listProjectAgentTasks([task.ownerEmail], task.projectId, 20).catch(() => []))
		.filter((other) => other.id !== task.id && other.conversationId === task.conversationId)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return siblings.find((other) => other.difyConversationId)?.difyConversationId ?? (task.conversationId.startsWith("pat_") ? undefined : task.conversationId);
}
