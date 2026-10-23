import { callRuntimeModel } from "./model";

/**
 * One model call above this many prompt tokens starts a fresh conversation from a progress summary. Every picker model
 * has a window of about 1M tokens, so 150k keeps long tasks whole while bounding the cost of each step (every step re-sends the whole conversation). Override with
 * PROJECT_AGENT_COMPACT_AT_TOKENS.
 */
export const COMPACT_AT_PROMPT_TOKENS = Math.max(50_000, Number(process.env.PROJECT_AGENT_COMPACT_AT_TOKENS) || 150_000);

const SUMMARY_REQUEST = "Context is getting long. Do NOT send an action now. Write a plain-text progress summary for yourself so the work can continue in a fresh conversation: what the task needs, what is already done (files and scripts created, with their paths), what you verified and what the renders showed, what is still wrong or left to do, and the exact next step. Under 600 words.";

/** Asks the model to summarise its own progress, then returns the query that restarts the task in a fresh Dify conversation. */
export async function compactConversation(input: { firstQuery: string; user: string; conversationId: string; signal?: AbortSignal; modelSelector?: string }): Promise<string> {
	const reply = await callRuntimeModel({ query: SUMMARY_REQUEST, user: input.user, conversationId: input.conversationId, signal: input.signal, modelSelector: input.modelSelector });
	return `${input.firstQuery}\n\nYou already worked on this task in an earlier conversation; its files are still in /work. Your own progress summary:\n<progress_summary>\n${reply.answer.slice(0, 6000)}\n</progress_summary>\nContinue from the next step with a single action reply (re-render to check the current state if unsure).`;
}
