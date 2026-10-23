import type { RuntimeInput } from "./run-agent";
import type { RuntimeAction } from "./actions";

/** The plan is bookkeeping for the user's checklist: it costs no tool time and never fails. The latest one is logged for the live view. */
export function runPlanAction(input: RuntimeInput, action: Extract<RuntimeAction, { action: "plan" }>): { text: string } {
	if (!input.depth) input.onStep?.({ tool: "plan", detail: JSON.stringify(action.items) });
	const done = action.items.filter((item) => item.status === "done").length;
	return { text: `Plan noted (${done}/${action.items.length} done). Continue with the next item.` };
}
