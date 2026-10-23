import type { DifyAgentMessage } from "../dify-stream";
import type { RuntimeAction } from "./actions";
import { runtimeTaskInstructions } from "./instructions";
import type { RuntimeInput } from "./run-agent";
import { subAgentSelector } from "./sub-agent-model";

/** A sub-agent: a fresh model conversation over the same sandbox; only its final report comes back, so the lead keeps a small context. */
export async function delegateToSubAgent(run: (input: RuntimeInput) => Promise<DifyAgentMessage>, input: RuntimeInput, action: Extract<RuntimeAction, { action: "delegate" }>, budget: { delegates: number }, MAX_DELEGATES: number, SUB_AGENT_STEPS: number): Promise<{ text: string; failed?: boolean }> {
	const { task, note } = action;
	const reviewer = action.role === "reviewer";
	if ((input.depth ?? 0) >= 1) return { text: "A sub-agent cannot delegate further; do the job yourself.", failed: true };
	if (budget.delegates >= MAX_DELEGATES) return { text: `Delegation is limited to ${MAX_DELEGATES} sub-agents per task.`, failed: true };
	const slot = budget.delegates;
	budget.delegates += 1;
	const modelSelector = subAgentSelector(input.modelSelector, action.model, reviewer ? "reviewer" : "worker");
	input.onStep?.({ tool: "delegate", detail: `[${modelSelector || "default model"}] ${note || task}` });
	const query = `${runtimeTaskInstructions()}\n\nYou are a sub-agent working for a lead agent in the same sandbox (/work/inputs, /work/outputs, /work/scripts and /work/library are shared). You do not see the lead's conversation. Do only the job below, then send final with a concise report: what you found or made, with file paths. List in final.files only files the job asks you to deliver.\n\n${reviewer ? "\n\nYou are a reviewer: only look and judge (read files, render and view pages, compare with the reference). Your shell sees /work read-only (writes fail; /tmp is writable and private), and you may not generate images. Report concrete problems and where they are, or say it passes." : ""}\n\nJob:\n${task}`;
	try {
		const result = await run({ ...input, query, modelSelector, conversationId: undefined, onConversation: undefined, recoverChatContext: undefined, depth: 1, slot, readOnly: reviewer, maxSteps: SUB_AGENT_STEPS, budget: { delegates: MAX_DELEGATES }, onStep: (step) => {
			if (step.tool === "metrics") recordSubUsage(input, step.detail, modelSelector);
			else if (step.tool !== "model_step") input.onStep?.({ ...step, detail: `[sub-agent] ${step.detail}` });
		} });
		return { text: `Sub-agent report:\n${result.answer}${result.inlineFiles?.length ? `\nFiles it delivered: ${result.inlineFiles.map((file) => file.name).join(", ")} (saved in the sandbox)` : ""}` };
	} catch (cause) { return { text: `The sub-agent failed: ${cause instanceof Error ? cause.message : "error"}`, failed: true }; }
}

export function recordSubUsage(input: RuntimeInput, metricsLine: string, selector: string | undefined): void {
	const usage = input.subUsage ??= { runs: 0, steps: 0, tokens: 0, models: new Set() };
	usage.runs += 1;
	usage.steps += Number(metricsLine.match(/\bsteps=(\d+)/)?.[1] ?? 0);
	usage.tokens += Number(metricsLine.match(/\bprompt_tokens=(\d+)/)?.[1] ?? 0);
	usage.models.add(selector || "default");
}
