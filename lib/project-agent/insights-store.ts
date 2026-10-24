import { promises as fs } from "fs";
import path from "path";
import { buildInsights, insightsMarkdown } from "./insights";
import type { ProjectAgentTask } from "./types";

const DIR = path.join(process.cwd(), "data", "project-agent", "insights");
const HISTORY = path.join(DIR, "tasks.jsonl");
const LATEST = path.join(DIR, "latest.md");
const REPORT_TASKS = 500;
const KEEP_LINES = 5000;

const KEPT_LOG = /metrics ::|context ::|learned ::|trajectory ::|using tool (?:evaluator_verdict|policy_denied)/;

/** Task history that survives the 24 hour task cleanup: one trimmed line per finished task. */
function trimmed(task: ProjectAgentTask): Pick<ProjectAgentTask, "id" | "projectId" | "ownerEmail" | "scheduleRunId" | "workflowRunId" | "status" | "error" | "createdAt" | "updatedAt" | "prompt" | "userPrompt" | "log" | "files" | "feedback"> {
	return { id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail, scheduleRunId: task.scheduleRunId, workflowRunId: task.workflowRunId, status: task.status, error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt, prompt: task.prompt.slice(0, 200), userPrompt: task.userPrompt?.slice(0, 200), log: task.log.filter((line) => KEPT_LOG.test(line)).slice(-4), files: task.files?.map((file) => ({ ...file })), feedback: task.feedback };
}

export async function readInsightHistory(): Promise<ProjectAgentTask[]> {
	const lines = (await fs.readFile(HISTORY, "utf-8").catch(() => "")).split("\n").filter(Boolean);
	const byId = new Map<string, ProjectAgentTask>();
	for (const line of lines) { try { const record = JSON.parse(line) as ProjectAgentTask; byId.set(record.id, record); } catch { /* skip a torn line */ } }
	return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Called when a task finishes: appends its summary and refreshes data/project-agent/insights/latest.md so the report is always current while testing. */
export async function recordFinishedTask(task: ProjectAgentTask): Promise<void> {
  // Durable, owner-scoped proactive signal must not depend on the local JSONL report.
  await import("./proactive-signals").then(m => m.recordProactiveSignal(task)).catch(() => {});
	try {
		await fs.mkdir(DIR, { recursive: true });
		await fs.appendFile(HISTORY, `${JSON.stringify(trimmed(task))}\n`);
		let history = await readInsightHistory();
		if (history.length > KEEP_LINES) { history = history.slice(-KEEP_LINES); await fs.writeFile(HISTORY, history.map((record) => JSON.stringify(record)).join("\n") + "\n"); }
		const report = buildInsights(history.slice(-REPORT_TASKS));
		await fs.writeFile(LATEST, `${insightsMarkdown(report)}\n\nUpdated ${new Date().toISOString()} after ${task.id} (${task.status}).\n`);
	} catch (error) { console.error("[project-agent] insights update failed", error); }
}
