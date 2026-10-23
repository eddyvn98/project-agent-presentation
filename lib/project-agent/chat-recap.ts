import { listProjectAgentTasks } from "./task-store";
import type { ProjectAgentTask } from "./types";

const MAX_TURNS = 8;
const MAX_REQUEST_CHARS = 600;
const MAX_RESULT_CHARS = 900;
const MAX_CHARS = 8_000;

const clean = (text: string, limit: number) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim().slice(0, limit);

/** The earlier finished turns of this chat (oldest first), used to brief the agent when the model conversation behind the chat was lost. Empty when the chat has no earlier turns. */
export async function buildChatRecap(task: Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "conversationId">): Promise<string> {
	if (!task.conversationId) return "";
	const turns = (await listProjectAgentTasks([task.ownerEmail], task.projectId, 20))
		.filter((other) => other.id !== task.id && other.conversationId === task.conversationId && other.status === "done" && other.resultText?.trim())
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.slice(-MAX_TURNS);
	const lines = turns.map((turn) => [
		`User: ${clean(turn.userPrompt ?? turn.prompt, MAX_REQUEST_CHARS)}`,
		`You: ${clean(turn.resultText ?? "", MAX_RESULT_CHARS)}`,
		turn.files?.length ? `Files made: ${clean(turn.files.map((file) => file.name).join(", "), 200)}` : "",
	].filter(Boolean).join("\n"));
	// Keep the most recent turns when the recap is too long.
	let recap = lines.join("\n\n");
	while (recap.length > MAX_CHARS && lines.length > 1) { lines.shift(); recap = lines.join("\n\n"); }
	return recap.slice(-MAX_CHARS);
}
