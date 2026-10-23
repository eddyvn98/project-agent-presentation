import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface Span { agent: "lead" | "sub"; kind: "model" | "action"; name: string; ms: number; ok: boolean; step: number; tokens?: number; key?: string }

const TRACE_DIR = path.join(process.cwd(), "data", "project-agent", "traces");
const KEEP_TRACES = 200;

export const spanKey = (name: string, detail: string) => `${name}:${createHash("sha1").update(detail.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 10)}`;

export interface Trajectory { steps: number; actions: number; retries: number; repeats: number; firstRender: number; slowest: string; modelShare: number }

/** Shape of one run: how many actions were retried after a failure, how often an identical action was sent again, when the first render happened. */
export function analyzeTrajectory(spans: Span[]): Trajectory {
	const actions = spans.filter((span) => span.kind === "action" && span.agent === "lead");
	let retries = 0;
	actions.forEach((span, index) => { if (!span.ok && actions[index + 1]?.name === span.name) retries += 1; });
	const seen = new Map<string, number>();
	for (const span of actions) if (span.key) seen.set(span.key, (seen.get(span.key) ?? 0) + 1);
	const slow = [...actions].sort((a, b) => b.ms - a.ms)[0];
	const modelMs = spans.filter((span) => span.kind === "model").reduce((sum, span) => sum + span.ms, 0);
	const totalMs = spans.reduce((sum, span) => sum + span.ms, 0);
	return {
		steps: spans.filter((span) => span.kind === "model" && span.agent === "lead").length, actions: actions.length, retries,
		repeats: [...seen.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0),
		firstRender: actions.findIndex((span) => span.name === "render") + 1, slowest: slow ? `${slow.name}:${Math.round(slow.ms / 1000)}s` : "none",
		modelShare: totalMs ? Math.round((modelMs / totalMs) * 100) : 0,
	};
}

export const trajectoryLine = (t: Trajectory) => `actions=${t.actions} retries=${t.retries} repeats=${t.repeats} first_render=${t.firstRender} slowest=${t.slowest} model_pct=${t.modelShare}`;

/** Full spans of a run for debugging, newest 200 kept; the one-line summary also goes to the task log. */
export async function writeTrace(taskId: string, spans: Span[]): Promise<void> {
	try {
		await fs.mkdir(TRACE_DIR, { recursive: true });
		await fs.writeFile(path.join(TRACE_DIR, `${taskId}.json`), JSON.stringify({ taskId, at: new Date().toISOString(), spans, summary: analyzeTrajectory(spans) }));
		const files = (await fs.readdir(TRACE_DIR)).filter((file) => file.endsWith(".json"));
		if (files.length > KEEP_TRACES) {
			const dated = await Promise.all(files.map(async (file) => ({ file, at: (await fs.stat(path.join(TRACE_DIR, file))).mtimeMs })));
			for (const { file } of dated.sort((a, b) => a.at - b.at).slice(0, files.length - KEEP_TRACES)) await fs.rm(path.join(TRACE_DIR, file), { force: true });
		}
	} catch { /* tracing must never fail a task */ }
}
