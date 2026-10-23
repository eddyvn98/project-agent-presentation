/** Web modules the agent can use as engines: runtime action -> AIDT module id the caller must have. Add the next module here. */
export const ENGINES: Record<string, { module: string; label: string }> = {
	generate_image: { module: "assistant", label: "Image Generator" },
	workspace_read: { module: "mindmap", label: "Workspace" },
	workspace_commands: { module: "mindmap", label: "Workspace" },
	workspace_view: { module: "mindmap", label: "Workspace" },
	workspace_apply: { module: "mindmap", label: "Workspace" },
};

/** Engines whose module the caller may use; resolved when the task is created (the request carries the access context). */
export async function allowedEngines(guard: (moduleId: string) => Promise<ReadonlySet<string> | null>): Promise<string[]> {
	const allowed: string[] = [];
	for (const [action, engine] of Object.entries(ENGINES)) if ((await guard(engine.module))?.has(engine.module)) allowed.push(action);
	return allowed;
}

/** A refusal for the model when the task owner may not use this engine; undefined allowlist (old tasks, tests) allows everything. Access is per module, so a task saved before an engine existed still passes when it holds another engine of the same module. */
export function engineRefusal(allowed: string[] | undefined, action: string): string | null {
	const engine = ENGINES[action];
	if (!engine || !allowed || allowed.includes(action) || allowed.some((name) => ENGINES[name]?.module === engine.module)) return null;
	return `${engine.label} is not available to this user. Do not retry; continue without it or tell the user it needs access.`;
}
