import { callRuntimeModel } from "../runtime/model";
import { subAgentSelector } from "../runtime/sub-agent-model";
import { scrubText } from "../insights-public";
import type { ProjectAgentTask } from "../types";
import { generalLesson, recordLessonCandidates } from "./global-lessons";

const TIMEOUT_MS = 30_000;
const STEP_LIMIT = 20;
const SNIPPET = 150;
const MAX_TOOLS = 60;
const reflecting = new Set<string>();

const field = (line: string | undefined, key: string) => Number(line?.match(new RegExp(`${key}=(\\d+)`))?.[1] ?? 0);
export const reflectEnabled = () => process.env.PROJECT_AGENT_AUTO_REFLECT !== "0";
/** Log lines start with an ISO timestamp ("2026-10-19T16:53:59.788Z using tool ..."). */
const body = (line: string) => line.replace(/^\d{4}-\d{2}-\d{2}T\S+Z /, "");
const toolSteps = (task: ProjectAgentTask) => task.log.map(body).filter((line) => line.startsWith("using tool ")).map((line) => line.slice(11).replace(/ #\S+/, ""));

/** Failed tool steps are logged as "tool failed ::" (after the timestamp); repeated identical calls are the other signal. */
export function isWasteful(task: ProjectAgentTask): boolean {
	if (task.status === "failed") return !/stopped by you/i.test(task.error ?? "");
	const metrics = task.log.findLast((line) => line.includes("metrics ::"));
	if (!metrics) return false;
	const failedSteps = task.log.filter((line) => /\btool failed ::/.test(line)).length;
	const counts = new Map<string, number>();
	for (const step of toolSteps(task)) { const key = step.slice(0, 60); counts.set(key, (counts.get(key) ?? 0) + 1); }
	const retries = [...counts.values()].filter((count) => count >= 3).length;
	return field(metrics, "invalid") > 0 || failedSteps >= 2 || retries > 0 || field(metrics, "steps") > STEP_LIMIT;
}

/** Compact trace: tool names, error snippets, metrics, and the first 80 scrubbed chars of the prompt. No document content. */
export function buildTrace(task: ProjectAgentTask): string {
	const tools = toolSteps(task).map((step) => step.split(" ::")[0]).slice(0, MAX_TOOLS);
	const errors = [task.error, ...task.log.filter((line) => /\btool failed ::|invalid_reply|\bfailed: /.test(line))]
		.filter((line): line is string => Boolean(line)).slice(0, 5).map((line) => scrubText(body(line).replace(/^using tool invalid_reply :: /, "")).slice(0, SNIPPET));
	return [
		`Task status: ${task.status}`,
		`Request start: ${scrubText(task.userPrompt ?? task.prompt).slice(0, 80)}`,
		`Tool calls in order: ${tools.join(" > ") || "none"}`,
		errors.length ? `Errors:\n${errors.map((line) => `- ${line}`).join("\n")}` : "",
		`Metrics: ${scrubText(task.log.findLast((line) => line.includes("metrics ::"))?.replace(/^metrics :: /, "") ?? "none")}`,
	].filter(Boolean).join("\n");
}

const ask = (trace: string) => `An AI agent finished a task that wasted steps. Below is a compact trace (no document content).\n\n${trace}\n\nWrite at most ONE general, reusable lesson (max 150 characters, starting with "Lesson:") about tool use or approach that would have saved steps on ANY project. Do not mention files, names, topics or the request itself. If nothing general can be learned, reply with exactly NONE.`;

export interface ReflectInput { task: ProjectAgentTask; user: string; wroteLesson?: boolean; log: (line: string) => Promise<unknown> }

/** One cheap model call after a wasteful task; the lesson becomes a global candidate. Never throws, resolves to the lesson text or null. */
export async function reflectOnTask(input: ReflectInput): Promise<string | null> {
	const { task } = input;
	if (!reflectEnabled() || input.wroteLesson || task.log.some((line) => line.includes("reflected ::")) || reflecting.has(task.id) || !isWasteful(task)) return null;
	reflecting.add(task.id);
	let outcome = "none";
	let lesson: string | null = null;
	let id: string | null = null;
	try {
		const reply = await callRuntimeModel({ query: ask(buildTrace(task)), user: input.user, modelSelector: subAgentSelector(task.modelSelector, "fast", "worker"), signal: AbortSignal.timeout(TIMEOUT_MS) });
		lesson = generalLesson(reply.answer.split("\n").find((line) => /^lesson:/i.test(line.trim()))?.trim().slice(0, 150) ?? "");
		if (lesson) { id = await recordLessonCandidates([lesson], task.projectId, "reflect"); outcome = id ?? "none"; }
	} catch { outcome = "error"; }
	await input.log(`reflected :: ${outcome}`).catch(() => {});
	return lesson;
}
