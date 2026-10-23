import type { ProjectAgentTask } from "./types";

export interface HarnessStats { traced: number; avgRetries: number; avgRepeats: number; avgFirstRender: number; evaluatorRuns: number; evaluatorFails: number; policyDenied: number }

const field = (line: string, key: string) => Number(line.match(new RegExp(`${key}=(\\d+)`))?.[1] ?? 0);
const mean = (values: number[]) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;

/** Trajectory, evaluator and policy signals from the task logs (the lines runtime/trace.ts, evaluator.ts and policy.ts write). */
export function harnessStats(tasks: ProjectAgentTask[]): HarnessStats {
	const lines = tasks.map((task) => task.log.findLast((entry) => entry.startsWith("trajectory ::"))).filter((line): line is string => Boolean(line));
	const verdicts = tasks.flatMap((task) => task.log.filter((entry) => entry.includes("using tool evaluator_verdict")));
	const rendered = lines.map((line) => field(line, "first_render")).filter(Boolean);
	return {
		traced: lines.length, avgRetries: mean(lines.map((line) => field(line, "retries"))), avgRepeats: mean(lines.map((line) => field(line, "repeats"))), avgFirstRender: mean(rendered),
		evaluatorRuns: verdicts.length, evaluatorFails: verdicts.filter((entry) => /:: FAIL/.test(entry)).length,
		policyDenied: tasks.reduce((sum, task) => sum + task.log.filter((entry) => entry.includes("using tool policy_denied")).length, 0),
	};
}

export function harnessFindings(stats: HarnessStats): Array<{ severity: "high" | "medium" | "low"; title: string; evidence: string; suggestion: string }> {
	const findings: ReturnType<typeof harnessFindings> = [];
	if (stats.traced >= 5 && stats.avgRepeats > 1) findings.push({ severity: "medium", title: "Agents resend identical actions", evidence: `${stats.avgRepeats} repeated actions per task on average over ${stats.traced} traced tasks`, suggestion: "Look for a loop: a tool result the model cannot use, or a missing hint in the instructions" });
	if (stats.traced >= 5 && stats.avgRetries > 1.5) findings.push({ severity: "medium", title: "Failed actions are retried the same way", evidence: `${stats.avgRetries} retries after a failure per task`, suggestion: "Make the failing tool's error message say what to do differently" });
	if (stats.evaluatorRuns >= 5 && stats.evaluatorFails / stats.evaluatorRuns > 0.6) findings.push({ severity: "medium", title: "The evaluator rejects most deliverables", evidence: `${stats.evaluatorFails} of ${stats.evaluatorRuns} verdicts were FAIL`, suggestion: "Check whether the evaluator is too strict, or the lead agent skips requirements it later has to fix" });
	if (stats.policyDenied > 0) findings.push({ severity: "low", title: "Policy denied actions", evidence: `${stats.policyDenied} action(s) were refused by the policy hooks`, suggestion: "Read the policy_denied log lines: either the model needs a clearer instruction or a rule is too broad" });
	return findings;
}

export const harnessMarkdown = (stats: HarnessStats) => stats.traced || stats.evaluatorRuns || stats.policyDenied
	? `Harness: ${stats.traced} traced tasks, ${stats.avgRetries} retries and ${stats.avgRepeats} repeated actions per task, first render at action ${stats.avgFirstRender}; evaluator ${stats.evaluatorRuns} runs (${stats.evaluatorFails} FAIL); policy denied ${stats.policyDenied}.` : "";
