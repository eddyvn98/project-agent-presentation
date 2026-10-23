import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { scrubText } from "../insights-public";
import type { ProjectAgentTask } from "../types";
import { stemSimilarity } from "./lesson-match";

/**
 * Lessons the agent writes in single projects (<project_note> "Lesson: ...") become candidates here.
 * A candidate seen in MIN_PROJECTS different projects goes on trial: it is shown to 1 in TRIAL_SHARE tasks.
 * After enough trial tasks its outcomes are compared with tasks that did not see it; it is promoted to every
 * task or retired automatically. No model call: the only cost is a few lines in the prompt.
 */
export type LessonStatus = "candidate" | "trial" | "active" | "retired";
interface Outcome { tasks: number; failed: number; steps: number; tokens: number }
export interface GlobalLesson {
	id: string; text: string; status: LessonStatus; projects: string[]; createdAt: string; updatedAt: string;
	sources?: string[]; trialStartedAt?: string; trial?: Outcome; control?: Outcome; decision?: string;
}

const dir = () => process.env.PROJECT_AGENT_LEARNING_DIR ?? path.join(process.cwd(), "data", "project-agent", "learning");
const storeFile = () => path.join(dir(), "lessons.json");
export const MIN_PROJECTS = 3;
const TRIAL_SHARE = 5;
const MIN_TRIAL_TASKS = 15;
const MAX_ACTIVE = 12;
const SIMILAR = 0.5;
const SIMILAR_STEMS = 0.4;
const empty = (): Outcome => ({ tasks: 0, failed: 0, steps: 0, tokens: 0 });
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const words = (text: string) => new Set(text.toLowerCase().replace(/^lesson:\s*/, "").match(/[\p{L}\p{N}]{3,}/gu) ?? []);

export function similarity(a: string, b: string): number {
	const left = words(a); const right = words(b);
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared += 1;
	return shared / (left.size + right.size - shared);
}

/** A lesson is general when scrubbing finds nothing project-specific in it (no files, paths, quotes, ids, people). */
export function generalLesson(text: string): string | null {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!/^lesson:/i.test(clean) || clean.length < 25 || clean.length > 200) return null;
	// Sandbox paths (/work/library, /work/skills) are the same in every project, so they do not make a lesson specific.
	const probe = clean.replace(/\/work\/[\w./-]*/g, "WORKPATH");
	return scrubText(probe) === probe ? clean : null;
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialises read-modify-write of the store inside this process. */
function locked<T>(work: (lessons: GlobalLesson[]) => Promise<T> | T): Promise<T> {
	const run = queue.then(async () => {
		const lessons = JSON.parse(await fs.readFile(storeFile(), "utf-8").catch(() => "[]")) as GlobalLesson[];
		const result = await work(lessons);
		await fs.mkdir(dir(), { recursive: true });
		const temporary = `${storeFile()}.${process.pid}.tmp`;
		await fs.writeFile(temporary, JSON.stringify(lessons, null, 2));
		await fs.rename(temporary, storeFile());
		return result;
	});
	queue = run.catch(() => {});
	return run;
}

const decide = (lesson: GlobalLesson, status: LessonStatus, why: string) => {
	lesson.status = status; lesson.decision = why; lesson.updatedAt = new Date().toISOString();
	void fs.appendFile(path.join(dir(), "decisions.log"), `${lesson.updatedAt} ${lesson.id} ${status}: ${why} :: ${lesson.text}\n`).catch(() => {});
};

const isSameLesson = (a: string, b: string) => similarity(a, b) >= SIMILAR || stemSimilarity(a, b) >= SIMILAR_STEMS;

/** Adds lessons as candidates (or counts the project on a matching one). Resolves to the id of the last lesson touched, or null. */
export function recordLessonCandidates(texts: string[], projectId: string, source = "note"): Promise<string | null> {
	const general = texts.map(generalLesson).filter((text): text is string => Boolean(text));
	if (!general.length) return Promise.resolve(null);
	return locked((lessons) => {
		const project = hash(projectId);
		const now = new Date().toISOString();
		let touched: string | null = null;
		for (const text of general) {
			const match = lessons.filter((lesson) => lesson.status !== "retired").map((lesson) => ({ lesson, score: Math.max(similarity(lesson.text, text), stemSimilarity(lesson.text, text)) })).filter((item) => isSameLesson(item.lesson.text, text)).sort((a, b) => b.score - a.score)[0];
			if (match) {
				touched = match.lesson.id;
				if (!match.lesson.projects.includes(project)) match.lesson.projects.push(project);
				if (!(match.lesson.sources ??= []).includes(source)) match.lesson.sources.push(source);
				match.lesson.updatedAt = now;
				if (match.lesson.status === "candidate" && match.lesson.projects.length >= MIN_PROJECTS) {
					match.lesson.trialStartedAt = now; match.lesson.trial = empty(); match.lesson.control = empty();
					decide(match.lesson, "trial", `seen in ${match.lesson.projects.length} projects`);
				}
				continue;
			}
			touched = `gl_${hash(text + now)}`;
			lessons.push({ id: touched, text, status: "candidate", projects: [project], sources: [source], createdAt: now, updatedAt: now });
		}
		return touched;
	});
}

/** Lessons for a new task: every active one, plus trial ones for a fixed share of tasks (chosen by task id, so retries see the same set). */
export async function lessonsForTask(taskId: string): Promise<GlobalLesson[]> {
	const lessons = JSON.parse(await fs.readFile(storeFile(), "utf-8").catch(() => "[]")) as GlobalLesson[];
	const inTrial = parseInt(hash(taskId).slice(0, 6), 16) % TRIAL_SHARE === 0;
	return lessons.filter((lesson) => lesson.status === "active" || (inTrial && lesson.status === "trial"));
}

export function lessonsPrompt(lessons: GlobalLesson[]): string {
	if (!lessons.length) return "";
	return `LESSONS FROM OTHER PROJECTS (verified to help; follow them when they apply):\n${lessons.map((lesson) => `- ${lesson.text.replace(/^lesson:\s*/i, "")}`).join("\n")}`;
}

const field = (line: string | undefined, key: string) => Number(line?.match(new RegExp(`${key}=(\\d+)`))?.[1] ?? 0);
const mean = (outcome: Outcome, key: "failed" | "steps" | "tokens") => outcome.tasks ? outcome[key] / outcome.tasks : 0;

/** Called for every finished task: counts it for trial lessons it saw (trial) or did not see (control), then promotes or retires. */
export function scoreLessonTrials(task: ProjectAgentTask): Promise<void> {
	if (task.status !== "done" && task.status !== "failed") return Promise.resolve();
	if (/stopped by you/i.test(task.error ?? "")) return Promise.resolve();
	const seen = new Set(task.log.findLast((line) => line.includes("learned ::"))?.split("learned ::")[1]?.trim().split(",").filter(Boolean) ?? []);
	const metrics = task.log.findLast((line) => line.includes("metrics ::"));
	if (!metrics && task.status === "done") return Promise.resolve();
	const add = (outcome: Outcome) => { outcome.tasks += 1; outcome.failed += task.status === "failed" ? 1 : 0; outcome.steps += field(metrics, "steps"); outcome.tokens += field(metrics, "prompt_tokens"); };
	return locked((lessons) => {
		for (const lesson of lessons.filter((item) => item.status === "trial" && item.trialStartedAt && task.createdAt >= item.trialStartedAt)) {
			lesson.trial ??= empty(); lesson.control ??= empty();
			add(seen.has(lesson.id) ? lesson.trial : lesson.control);
			if (lesson.trial.tasks < MIN_TRIAL_TASKS || lesson.control.tasks < MIN_TRIAL_TASKS) continue;
			const failDelta = mean(lesson.trial, "failed") - mean(lesson.control, "failed");
			const stepRatio = mean(lesson.trial, "steps") / Math.max(1, mean(lesson.control, "steps"));
			const tokenRatio = mean(lesson.trial, "tokens") / Math.max(1, mean(lesson.control, "tokens"));
			const summary = `fail ${failDelta >= 0 ? "+" : ""}${Math.round(failDelta * 100)}pt, steps x${stepRatio.toFixed(2)}, tokens x${tokenRatio.toFixed(2)} over ${lesson.trial.tasks}/${lesson.control.tasks} tasks`;
			const activeCount = lessons.filter((item) => item.status === "active").length;
			if (failDelta <= 0.05 && stepRatio <= 1.1 && tokenRatio <= 1.1 && activeCount < MAX_ACTIVE) decide(lesson, "active", `promoted: ${summary}`);
			else decide(lesson, "retired", `${activeCount >= MAX_ACTIVE ? "no room" : "not better"}: ${summary}`);
		}
	});
}

/** Admin escape hatch and visibility: list the store or force a status (used by the improvement job, not by users). */
export async function listGlobalLessons(): Promise<GlobalLesson[]> {
	return JSON.parse(await fs.readFile(storeFile(), "utf-8").catch(() => "[]")) as GlobalLesson[];
}
export function setLessonStatus(id: string, status: LessonStatus, why: string): Promise<boolean> {
	return locked((lessons) => { const lesson = lessons.find((item) => item.id === id); if (!lesson) return false; decide(lesson, status, why); return true; });
}
