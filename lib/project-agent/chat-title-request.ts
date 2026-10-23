import { createHash } from "crypto";
import { callDifyAgent } from "./dify-call";
import { getEndpoint } from "./dify-agent";
import type { ProjectAgentTask } from "./types";

/** One small, tool-free call in a separate Dify conversation that returns a short chat title (or null). */
export async function requestProjectAgentChatTitle(task: ProjectAgentTask, answerText: string): Promise<string | null> {
	const apiKey = process.env.PROJECT_AGENT_DIFY_API_KEY?.trim();
	if (!apiKey) return null;
	const user = `project_${createHash("sha256").update(`${task.ownerEmail.trim().toLowerCase()}:${task.projectId}`).digest("hex").slice(0, 24)}`;
	const message = await callDifyAgent({
		endpoint: getEndpoint(), apiKey, user, files: [],
		signal: AbortSignal.timeout(45_000),
		query: [
			"Write a very short title for a chat. Rules: at most 6 words, the same language as the user request, no quotes, no markdown, no trailing punctuation. Do not use any tool. Reply with ONLY the title.",
			`User request:\n${(task.userPrompt ?? task.prompt).slice(0, 500)}`,
			answerText ? `Assistant answer (start):\n${answerText.slice(0, 400)}` : "",
		].filter(Boolean).join("\n\n"),
	});
	return message.answer;
}
