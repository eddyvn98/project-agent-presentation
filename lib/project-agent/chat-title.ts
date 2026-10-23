import { requestProjectAgentChatTitle } from "./chat-title-request";
import { readProjectAgentTask } from "./task-store";
import { setProjectAgentConversationTitleIfUntitled } from "@/services/mongodb/projectAgentTasks.repo";

// Models answer in the user's language, so the label prefix can be Vietnamese.
const TITLE_PREFIX = /^(title|tiêu đề)\s*[:：-]\s*/i; // vi-allow

/** Cleans a model-written title: first line, no quotes/markdown, max 60 chars; null when unusable. */
export function sanitizeChatTitle(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let title = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
	title = title.replace(/[*_`#>]+/g, "").replace(TITLE_PREFIX, "").replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s.。]+$/g, "").replace(/\s+/g, " ").trim();
	if (title.length < 2) return null;
	if (title.split(" ").length > 12) return null; // the model wrote a sentence, not a title
	return title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title;
}

/** Fire-and-forget after a task finishes: titles the conversation once, never over a user rename. */
export async function autoTitleProjectAgentConversation(taskId: string): Promise<void> {
	if (process.env.PROJECT_AGENT_AI_TITLES === "0") return;
	try {
		const task = await readProjectAgentTask(taskId);
		if (!task || task.status !== "done" || !task.conversationId || task.chatTitle) return;
		const title = sanitizeChatTitle(await requestProjectAgentChatTitle(task, task.resultText ?? ""));
		if (title) await setProjectAgentConversationTitleIfUntitled(task.projectId, task.ownerEmail, task.conversationId, title);
	} catch (cause) {
		console.warn("[project-agent] automatic chat title failed", cause instanceof Error ? cause.message : cause);
	}
}
