import type { ProjectAgentTask } from "./types";
import { harnessFindings, harnessMarkdown, harnessStats, type HarnessStats } from "./trajectory-insights";

export interface Finding { severity: "high" | "medium" | "low"; title: string; evidence: string; suggestion: string }
export interface InsightReport {
	period: { tasks: number; from?: string; to?: string };
	outcomes: { done: number; failed: number; stopped: number; running: number };
	runtime: { tasks: number; avgSeconds: number; p90Seconds: number; avgSteps: number; avgPromptTokens: number; invalidReplies: number; compactions: number; tools: Record<string, number>; /** Per model-step selector ("default" when none was chosen); only for tasks whose metrics line names a model. */ byModel: Record<string, { tasks: number; avgSeconds: number; avgSteps: number; avgPromptTokens: number }> };
	failures: Array<{ reason: string; count: number }>;
	dislikes: Array<{ taskId: string; prompt: string }>;
	slowest: Array<{ taskId: string; seconds: number; steps: number; prompt: string }>;
	findings: Finding[];
	harness?: HarnessStats;
}

const field = (line: string, key: string) => line.match(new RegExp(`${key}=(\\S+)`))?.[1];
const clip = (text: string, length = 80) => text.replace(/\s+/g, " ").trim().slice(0, length);
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
/** Groups error texts so ids and paths do not split one cause into many rows. */
const reasonOf = (error: string) => clip(error.replace(/\(agent_run_id=[^)]*\)|['"]?\/[^\s'"]*['"]?|[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "").replace(/<!DOCTYPE[\s\S]*/i, "(html error page)").trim(), 90);

/** Rule-based review of finished tasks: what failed, what was slow or expensive, what users disliked, and what to change. No model call, so it is free to run often. */
export function buildInsights(tasks: ProjectAgentTask[]): InsightReport {
	const metrics = tasks.map((task) => ({ task, line: task.log.findLast((entry) => entry.includes("metrics ::")) })).filter((row): row is { task: ProjectAgentTask; line: string } => Boolean(row.line));
	const seconds = metrics.map(({ line }) => Number(field(line, "total_s") ?? 0));
	const steps = metrics.map(({ line }) => Number(field(line, "steps") ?? 0));
	const tokens = metrics.map(({ line }) => Number(field(line, "prompt_tokens") ?? 0));
	const tools: Record<string, number> = {};
	for (const { line } of metrics) for (const part of (field(line, "tools") ?? "").split(",")) {
		const [name, count] = part.split(":");
		if (name && name !== "none") tools[name] = (tools[name] ?? 0) + Number(count || 0);
	}
	const invalidReplies = metrics.reduce((sum, { line }) => sum + Number(field(line, "invalid") ?? 0), 0);
	const compactions = metrics.reduce((sum, { line }) => sum + Number(field(line, "compactions") ?? 0), 0);
	const failedTasks = tasks.filter((task) => task.status === "failed");
	const stopped = failedTasks.filter((task) => /stopped by you/i.test(task.error ?? "")).length;
	const reasons = new Map<string, number>();
	for (const task of failedTasks) if (!/stopped by you/i.test(task.error ?? "")) reasons.set(reasonOf(task.error ?? "unknown"), (reasons.get(reasonOf(task.error ?? "unknown")) ?? 0) + 1);
	const slowest = metrics.map(({ task, line }) => ({ taskId: task.id, seconds: Number(field(line, "total_s") ?? 0), steps: Number(field(line, "steps") ?? 0), prompt: clip(task.userPrompt ?? task.prompt) })).sort((a, b) => b.seconds - a.seconds).slice(0, 5);
	const dislikes = tasks.filter((task) => task.feedback === "dislike").map((task) => ({ taskId: task.id, prompt: clip(task.userPrompt ?? task.prompt) }));
	const byModel: InsightReport["runtime"]["byModel"] = {};
	for (const name of new Set(metrics.flatMap(({ line }) => field(line, "model") ?? []))) {
		const rows = metrics.filter(({ line }) => field(line, "model") === name).map(({ line }) => line);
		byModel[name] = { tasks: rows.length, avgSeconds: average(rows.map((line) => Number(field(line, "total_s") ?? 0))), avgSteps: average(rows.map((line) => Number(field(line, "steps") ?? 0))), avgPromptTokens: average(rows.map((line) => Number(field(line, "prompt_tokens") ?? 0))) };
	}
	const runtime = { tasks: metrics.length, avgSeconds: average(seconds), p90Seconds: percentile(seconds, 0.9), avgSteps: average(steps), avgPromptTokens: average(tokens), invalidReplies, compactions, tools, byModel };
	const findings: Finding[] = [];
	const failureRate = tasks.length ? failedTasks.length / tasks.length : 0;
	if (tasks.length >= 5 && failureRate > 0.2) findings.push({ severity: "high", title: "High failure rate", evidence: `${failedTasks.length} of ${tasks.length} tasks failed (${stopped} stopped by users)`, suggestion: `Fix the top cause first: ${[...reasons.keys()][0] ?? "see the failure list"}` });
	if (metrics.length && invalidReplies / Math.max(1, steps.reduce((a, b) => a + b, 0)) > 0.1) findings.push({ severity: "medium", title: "The model often replies without a valid action", evidence: `${invalidReplies} invalid replies over ${steps.reduce((a, b) => a + b, 0)} steps`, suggestion: "Shorten the instructions, keep one clear JSON example, or check the model-step app prompt for conflicting output rules" });
	if (runtime.p90Seconds > 240) findings.push({ severity: "medium", title: "Slow tail", evidence: `90th percentile ${runtime.p90Seconds}s; slowest ${slowest[0]?.seconds}s`, suggestion: "Check the slowest tasks for repeated scripts that belong in the project library, and for model steps that write very long files" });
	if (runtime.avgPromptTokens > 60_000) findings.push({ severity: "medium", title: "Large context per task", evidence: `average ${runtime.avgPromptTokens} prompt tokens per task`, suggestion: "Trim the first-turn context (knowledge excerpts, history) and lower the auto-compact threshold" });
	if (dislikes.length) findings.push({ severity: "medium", title: "Users disliked answers", evidence: `${dislikes.length} task(s): ${dislikes.slice(0, 3).map((item) => `"${item.prompt}"`).join("; ")}`, suggestion: "Read these tasks and add a project note or a library script for the pattern that went wrong" });
	if (metrics.length && !tools.render && tasks.some((task) => task.files?.some((file) => /\.(docx|pptx|xlsx|pdf)$/i.test(file.name)))) findings.push({ severity: "low", title: "Office deliverables without a render", evidence: "tasks produced office files but no render action was recorded", suggestion: "Confirm the verification gate is active (runtime/verify.ts)" });
	const harness = harnessStats(tasks);
	findings.push(...harnessFindings(harness));
	return {
		harness,
		period: { tasks: tasks.length, from: tasks.map((task) => task.createdAt).sort()[0], to: tasks.map((task) => task.createdAt).sort().at(-1) },
		outcomes: { done: tasks.filter((task) => task.status === "done").length, failed: failedTasks.length - stopped, stopped, running: tasks.filter((task) => task.status === "running" || task.status === "queued").length },
		runtime,
		failures: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
		dislikes,
		slowest,
		findings,
	};
}

export function insightsMarkdown(report: InsightReport): string {
	const lines = [`# Project Agent insights`, `${report.period.tasks} tasks (${report.period.from?.slice(0, 10) ?? "-"} to ${report.period.to?.slice(0, 10) ?? "-"}): ${report.outcomes.done} done, ${report.outcomes.failed} failed, ${report.outcomes.stopped} stopped, ${report.outcomes.running} running.`];
	const { runtime } = report;
	if (runtime.tasks) lines.push(`Sandbox runtime: ${runtime.tasks} tasks, average ${runtime.avgSeconds}s (p90 ${runtime.p90Seconds}s), ${runtime.avgSteps} steps, ${runtime.avgPromptTokens} prompt tokens, ${runtime.invalidReplies} invalid replies, ${runtime.compactions} compactions. Tools: ${Object.entries(runtime.tools).map(([name, count]) => `${name} ${count}`).join(", ") || "none"}.`);
	if (report.harness && harnessMarkdown(report.harness)) lines.push(harnessMarkdown(report.harness));
	const models = Object.entries(runtime.byModel);
	if (models.length) lines.push("## Models", ...models.map(([name, row]) => `- ${name}: ${row.tasks} tasks, average ${row.avgSeconds}s, ${row.avgSteps} steps, ${row.avgPromptTokens} prompt tokens`));
	if (report.failures.length) lines.push("## Failure causes", ...report.failures.map((item) => `- ${item.count}x ${item.reason}`));
	if (report.slowest.length) lines.push("## Slowest", ...report.slowest.map((item) => `- ${item.seconds}s, ${item.steps} steps: ${item.prompt} (${item.taskId})`));
	lines.push("## Findings", ...(report.findings.length ? report.findings.map((item) => `- [${item.severity}] ${item.title}: ${item.evidence}. Suggestion: ${item.suggestion}`) : ["- Nothing needs attention."]));
	return lines.join("\n");
}
