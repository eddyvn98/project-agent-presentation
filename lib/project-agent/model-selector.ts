import { WORKSPACE_DIFY_MODEL_SELECTORS } from "@/lib/ai-model-catalog";
import { resolveWorkspaceDifyModelSelector } from "@/app/workspace/utils/workspaceChatRequest";

const VALID = new Set<string>(WORKSPACE_DIFY_MODEL_SELECTORS);

/**
 * The model-step selector for a picker id or selector (aliases resolved), or undefined when it is empty or not one the
 * model-step app knows. Undefined means the app's default model.
 */
export function normalizeProjectAgentModelSelector(value: unknown): string | undefined {
	if (typeof value !== "string" || !value.trim() || value.length > 200) return undefined;
	const selector = resolveWorkspaceDifyModelSelector(value.trim());
	return VALID.has(selector) ? selector : undefined;
}
