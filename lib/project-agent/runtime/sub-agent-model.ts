/**
 * Which model a sub-agent runs on. The lead agent keeps the model the user picked; a sub-agent can run on
 * the same model, a fast and cheap one of the same family (reading, extraction, search, first drafts), or a
 * model of another family (an independent reviewer that does not share the lead's blind spots).
 */
export type SubAgentTier = "same" | "fast" | "other";

/** The model-step app's default model when no selector is sent (see scripts/project-agent-model-step/models.mjs). */
export const DEFAULT_LEAD_SELECTOR = "anthropic/claude-sonnet-5.5";
/**
 * Fast tier for the Anthropic family. The Dify OpenRouter provider has no Claude Haiku 5.5 yet (adding it needs the
 * provider key in Dify, then a hidden model-step branch), so GPT-5.6 Luna, the cheapest capable model it has, stands in.
 */
export const ANTHROPIC_FAST_SELECTOR = "openai/gpt-5.6-luna";

type Family = "anthropic" | "openai" | "qwen" | "other";

const FAST: Record<Family, string> = {
	anthropic: ANTHROPIC_FAST_SELECTOR,
	openai: "openai/gpt-5.6-luna",
	qwen: "qwen/qwen3.7-flash",
	other: ANTHROPIC_FAST_SELECTOR,
};

/** A capable, low-cost model outside the lead's family. */
const CROSS: Record<Family, string> = {
	anthropic: "openai/gpt-5.6-luna",
	openai: "anthropic/claude-sonnet-5",
	qwen: "anthropic/claude-sonnet-5",
	other: "openai/gpt-5.6-luna",
};

export function modelFamily(selector: string | undefined): Family {
	const vendor = (selector || DEFAULT_LEAD_SELECTOR).split("/")[0];
	return vendor === "anthropic" || vendor === "openai" || vendor === "qwen" ? vendor : "other";
}

export function parseSubAgentTier(value: unknown): SubAgentTier | undefined {
	return value === "same" || value === "fast" || value === "other" ? value : undefined;
}

/**
 * The selector a sub-agent runs on. Workers default to the fast tier, reviewers to another family; the
 * lead's own selector is kept for "same" (undefined means the app default, as for the lead).
 */
export function subAgentSelector(lead: string | undefined, tier: SubAgentTier | undefined, role: "worker" | "reviewer"): string | undefined {
	const chosen = tier ?? (role === "reviewer" ? "other" : "fast");
	if (chosen === "same") return lead;
	const family = modelFamily(lead);
	const selector = chosen === "fast" ? FAST[family] : CROSS[family];
	// The fast tier of a model that is already the fast one is that model itself.
	return selector === (lead || DEFAULT_LEAD_SELECTOR) && chosen === "fast" ? lead : selector;
}
