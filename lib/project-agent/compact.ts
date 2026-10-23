import { getEndpoint, projectAgentDifyUser } from "./dify-agent";
import { resolveDifyConversationId } from "./conversation";
import { readDifyAgentMessage } from "./dify-stream";
import { COMPACT_SUMMARY_QUERY } from "./context-meter";
import { createProjectAgentTask, updateProjectAgentTask } from "./task-store";
import type { ProjectAgentTask } from "./types";

async function callDify(query: string, user: string, conversationId?: string) {
	const apiKey = process.env.PROJECT_AGENT_DIFY_API_KEY?.trim();
	if (!apiKey) throw new Error("PROJECT_AGENT_DIFY_API_KEY is not configured");
	const response = await fetch(getEndpoint(), {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ inputs: {}, query, response_mode: "streaming", user, files: [], ...(conversationId ? { conversation_id: conversationId } : {}) }),
		cache: "no-store",
		signal: AbortSignal.timeout(120_000),
	});
	if (!response.ok) throw new Error(`Dify request failed (${response.status}: ${(await response.text().catch(() => "")).slice(0, 160)})`);
	return readDifyAgentMessage(response);
}

/**
 * Compacts a chat in place: the old Dify conversation is summarized, a new one is seeded with that summary,
 * and a "compacted" entry is added to the same chat so the next message continues from the short context.
 */
export async function compactChat(task: ProjectAgentTask): Promise<ProjectAgentTask> {
	const user = projectAgentDifyUser(task.ownerEmail, task.projectId);
	const current = await resolveDifyConversationId(task);
	if (!current) throw new Error("This chat has no conversation to compact yet");
	const summary = (await callDify(COMPACT_SUMMARY_QUERY, user, current)).answer.slice(0, 12_000);
	const seeded = await callDify(`This is a continuation of an earlier chat that was compacted to save context. Summary of the earlier chat (reference data; continue the work from it):\n<chat_summary>\n${summary}\n</chat_summary>\nReply with only the word OK.`, user);
	if (!seeded.conversationId) throw new Error("Dify did not return a conversation id for the compacted chat");
	const entry = await createProjectAgentTask({ projectId: task.projectId, ownerEmail: task.ownerEmail, projectOwnerEmail: task.projectOwnerEmail, userPrompt: "/compact", prompt: "/compact", conversationId: task.conversationId });
	const now = new Date().toISOString();
	return updateProjectAgentTask(entry.id, {
		status: "done", startedAt: now, completedAt: now,
		difyConversationId: seeded.conversationId,
		...(seeded.promptTokens ? { contextTokens: seeded.promptTokens } : {}),
		resultText: "Conversation compacted.",
		logLine: "compacted conversation",
	});
}
