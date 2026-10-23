/** Client-safe numbers for the context meter. The window is the budget the meter measures against. */
export const PROJECT_AGENT_CONTEXT_WINDOW = 1_000_000;
export const COMPACT_SUGGEST_RATIO = 0.7;

export const contextRatio = (tokens: number) => Math.min(1, tokens / PROJECT_AGENT_CONTEXT_WINDOW);
export const formatTokens = (tokens: number) => tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : tokens >= 1000 ? `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k` : String(tokens);

export const COMPACT_SUMMARY_QUERY = [
	"Summarize this conversation so a fresh session can continue it without the history.",
	"Write in the user's language, under 600 words, as Markdown with these sections: Goal, Decisions and facts established, Work done (files made, sources used), Open questions and next steps, User preferences and rules.",
	"Keep concrete numbers, names and links. Do not add new information or call tools.",
].join(" ");

const BASELINE_TOKENS = 13_000;
/**
 * Dify reports prompt tokens summed over every model call of a run, so a run with many tool rounds looks far
 * bigger than the context really is. Prompt size grows roughly linearly from the baseline to its final value,
 * so total = rounds * (baseline + final) / 2 gives the final size.
 */
export function estimateContextTokens(totalPromptTokens: number, rounds: number): number {
	if (rounds <= 1) return totalPromptTokens;
	const final = Math.round((2 * totalPromptTokens) / rounds - BASELINE_TOKENS);
	return Math.max(BASELINE_TOKENS, Math.min(totalPromptTokens, final));
}
