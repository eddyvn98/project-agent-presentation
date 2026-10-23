import { createHash } from "crypto";
import { buildInsights, type InsightReport } from "./insights";
import type { ProjectAgentTask } from "./types";

/** System-wide report safe to leave the server: no prompts, emails, project ids, file names or paths. */
export interface PublicInsightReport extends Omit<InsightReport, "dislikes" | "slowest" | "findings"> {
	users: number;
	projects: number;
	dislikes: number;
	slowest: Array<{ ref: string; seconds: number; steps: number; promptTokens: number; tools: string }>;
	findings: Array<Omit<InsightReport["findings"][number], "evidence"> & { evidence: string }>;
	daily: Array<{ day: string; tasks: number; failed: number; avgSeconds: number; avgSteps: number; avgPromptTokens: number }>;
}

const field = (line: string, key: string) => line.match(new RegExp(`${key}=(\\S+)`))?.[1];
const ref = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 10);
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

/** Removes anything that could identify a person, a project or document content from free text. */
export function scrubText(text: string): string {
	return text
		.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
		.replace(/https?:\/\/\S+/g, "<url>")
		.replace(/(?:\/[\w.-]+){2,}/g, "<path>")
		.replace(/[\w-]+\.(docx?|xlsx?|pptx?|pdf|csv|txt|md|png|jpe?g|dwg|dxf|ifc|msg|eml|zip)\b/gi, "<file>")
		.replace(/"[^"]{3,}"/g, "\"<text>\"")
		.replace(/\b[0-9a-f]{8,}(-[0-9a-f]{4,})*\b/gi, "<id>")
		.replace(/\s+/g, " ")
		.trim();
}

function metricsOf(task: ProjectAgentTask) {
	const line = task.log.findLast((entry) => entry.includes("metrics ::"));
	if (!line) return null;
	return { seconds: Number(field(line, "total_s") ?? 0), steps: Number(field(line, "steps") ?? 0), promptTokens: Number(field(line, "prompt_tokens") ?? 0), tools: field(line, "tools") ?? "none" };
}

export function buildPublicInsights(tasks: ProjectAgentTask[]): PublicInsightReport {
	const report = buildInsights(tasks);
	const byDay = new Map<string, ProjectAgentTask[]>();
	for (const task of tasks) { const day = task.createdAt.slice(0, 10); byDay.set(day, [...(byDay.get(day) ?? []), task]); }
	const daily = [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, dayTasks]) => {
		const rows = dayTasks.map(metricsOf).filter((row): row is NonNullable<ReturnType<typeof metricsOf>> => Boolean(row));
		return { day, tasks: dayTasks.length, failed: dayTasks.filter((task) => task.status === "failed").length, avgSeconds: average(rows.map((row) => row.seconds)), avgSteps: average(rows.map((row) => row.steps)), avgPromptTokens: average(rows.map((row) => row.promptTokens)) };
	});
	const slowest = tasks.map((task) => ({ task, row: metricsOf(task) })).filter((item) => item.row).sort((a, b) => b.row!.seconds - a.row!.seconds).slice(0, 10)
		.map(({ task, row }) => ({ ref: ref(task.id), ...row! }));
	return {
		period: report.period,
		outcomes: report.outcomes,
		runtime: report.runtime,
		users: new Set(tasks.map((task) => task.ownerEmail)).size,
		projects: new Set(tasks.map((task) => task.projectId)).size,
		failures: report.failures.map((item) => ({ reason: scrubText(item.reason), count: item.count })),
		dislikes: report.dislikes.length,
		slowest,
		findings: report.findings.map((item) => ({ ...item, evidence: item.title === "Users disliked answers" ? `${report.dislikes.length} disliked task(s)` : scrubText(item.evidence) })),
		daily,
	};
}
