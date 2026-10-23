import type { DifyAgentMessage } from "../dify-stream";
import { harnessOff } from "./harness-flags";
import { runtimeTaskInstructions } from "./instructions";
import type { RuntimeInput } from "./run-agent";
import { subAgentSelector } from "./sub-agent-model";
import { recordSubUsage } from "./sub-agent";

const REVIEWED = /\.(docx|pptx|xlsx|pdf)$/i;
const EVALUATOR_STEPS = 14;

export interface Verdict { pass: boolean; issues: string }

/** First line PASS, or FAIL followed by the problems. An unclear verdict counts as a pass: the evaluator must never block a delivery by itself. */
export function parseVerdict(report: string): Verdict {
	const text = report.trim();
	const fail = text.match(/^\W*FAIL\b[:\s-]*([\s\S]*)/i);
	return fail ? { pass: false, issues: fail[1].trim().slice(0, 1800) || "The evaluator found problems but did not describe them." } : { pass: true, issues: "" };
}

function brief(request: string, answer: string, files: string[]): string {
	return `${runtimeTaskInstructions()}\n\nYou are an independent evaluator. A lead agent finished a task and wants to deliver. You see only the user's request, the lead's final message and the deliverable files; you do not see how the work was done. Your shell sees /work read-only; you may not write files.\n\nJudge the deliverables against the request: render each file and look at the pages (render action), open the contents (python-docx, openpyxl, python-pptx, pdftotext), and check every explicit requirement in the request (language, sections, figures, units, named standards, counts, format). Also check the lead's message makes no claim the files do not support. Be strict about what the user asked for and relaxed about taste.\n\nReply with final whose answer starts with PASS (nothing else needed) or with FAIL: followed by a numbered list of concrete problems, each with where it is and what to change. Maximum 8 items, most serious first.\n\nUser request:\n${request.slice(0, 4000)}\n\nLead's final message:\n${answer.slice(0, 3000)}\n\nDeliverable files (under /work):\n${files.map((file) => `- ${file}`).join("\n")}`;
}

/** Runs per task: the automated-check loop around the agent starts a new run each round, so the cap lives here, not on the run. */
const runsByTask = new Map<string, number>();
const MAX_TRACKED_TASKS = 200;

/** Independent check before final: a read-only agent on another model family judges the deliverables; one revision round at most. Opt-in (PROJECT_AGENT_EVALUATOR=on): a blind comparison on 4 held-out document cases showed no measurable quality gain for about 50% more time. */
export class DeliverableEvaluator {
	private runs = 0;
	private taskRuns(input: RuntimeInput) { return input.taskId ? runsByTask.get(input.taskId) ?? 0 : this.runs; }
	constructor(private readonly maxRuns = Number(process.env.PROJECT_AGENT_EVALUATOR_RUNS ?? 1)) {}

	async check(run: (input: RuntimeInput) => Promise<DifyAgentMessage>, input: RuntimeInput, answer: string, files: string[]): Promise<string | null> {
		const reviewed = files.filter((file) => REVIEWED.test(file));
		if (input.depth || !reviewed.length || this.taskRuns(input) >= this.maxRuns || harnessOff("evaluator") || process.env.PROJECT_AGENT_EVALUATOR !== "on") return null;
		this.runs += 1;
		if (input.taskId) {
			runsByTask.set(input.taskId, (runsByTask.get(input.taskId) ?? 0) + 1);
			if (runsByTask.size > MAX_TRACKED_TASKS) runsByTask.delete(runsByTask.keys().next().value as string);
		}
		const modelSelector = subAgentSelector(input.modelSelector, "other", "reviewer");
		input.onStep?.({ tool: "evaluator", detail: `[${modelSelector || "default model"}] checking ${reviewed.length} file(s)` });
		try {
			const result = await run({ ...input, query: brief(input.userPrompt ?? input.query.slice(-3000), answer, reviewed), modelSelector, conversationId: undefined, onConversation: undefined, recoverChatContext: undefined, depth: 1, slot: 2, readOnly: true, maxSteps: EVALUATOR_STEPS, budget: { delegates: 99 }, onStep: (step) => {
				if (step.tool === "metrics") recordSubUsage(input, step.detail, modelSelector);
			} });
			const verdict = parseVerdict(result.answer);
			input.onStep?.({ tool: "evaluator_verdict", detail: verdict.pass ? "PASS" : `FAIL ${verdict.issues.replace(/\s+/g, " ").slice(0, 140)}` });
			return verdict.pass ? null : `An independent evaluator checked the deliverables against the request and found problems:\n${verdict.issues}\n\nFix what is right to fix, re-render the changed files, then send final again. If an item is wrong or out of scope, say so briefly in your final message instead of changing the file.`;
		} catch { return null; }
	}
}
