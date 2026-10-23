import { execInSandbox } from "./sandbox";

export const MAX_WAIT_SECONDS = 300;
export const MAX_TASK_WAIT_SECONDS = 20 * 60;
export interface WaitSpec { seconds: number; until?: string; every: number }

/** Parses the model's wait action: seconds 1-300, an optional shell check (exit code 0 means ready) and how often to run it. */
export function parseWait(raw: Record<string, unknown>): WaitSpec | { error: string } {
	const seconds = Math.round(Number(raw.seconds));
	if (!Number.isFinite(seconds) || seconds < 1) return { error: `wait needs seconds (1-${MAX_WAIT_SECONDS})` };
	const until = typeof raw.until === "string" && raw.until.trim() ? raw.until.trim().slice(0, 600) : undefined;
	const every = Math.min(Math.max(Math.round(Number(raw.every)) || 5, 2), 60);
	return { seconds: Math.min(seconds, MAX_WAIT_SECONDS), until, every };
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
	const timer = setTimeout(resolve, ms);
	signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

/**
 * Waits without any model call. With `until`, runs that shell command every few seconds and returns as soon as it exits 0;
 * otherwise just sleeps. The wait counts against the task's total wait budget and its deadline, and stops when the task is stopped.
 */
export async function runWait(input: { chatId: string; signal?: AbortSignal; readOnly?: boolean; waited: { seconds: number } }, spec: WaitSpec): Promise<{ text: string; failed?: boolean }> {
	const room = MAX_TASK_WAIT_SECONDS - input.waited.seconds;
	if (room <= 0) return { text: `This task has already waited ${MAX_TASK_WAIT_SECONDS / 60} minutes in total. Report what is done and what is still running instead of waiting more.`, failed: true };
	const limit = Math.min(spec.seconds, room);
	const started = Date.now();
	let last = "";
	try {
		for (;;) {
			if (input.signal?.aborted) return { text: "Wait stopped.", failed: true };
			if (spec.until) {
				const check = await execInSandbox(input.chatId, spec.until, 20, input.readOnly);
				last = check.output.slice(-400);
				if ([2, 126, 127].includes(check.exitCode)) return { text: `The check command is broken (exit ${check.exitCode}), so waiting would never end: ${last || "(no output)"}\nFix the check (the command or file it uses may not exist here; the job may never have started), or report instead of waiting.`, failed: true };
				if (check.exitCode === 0) return { text: `Ready after ${Math.round((Date.now() - started) / 1000)} s.${last && last !== "(no output)" ? ` Check output:\n${last}` : ""}` };
			}
			const left = limit * 1000 - (Date.now() - started);
			if (left <= 0) break;
			await sleep(Math.min(spec.every * 1000, left), input.signal);
		}
		return { text: spec.until ? `Waited ${Math.round(limit)} s and the check is still not satisfied. Last check output:\n${last || "(none)"}\nWait again, or report that the job is still running.` : `Waited ${Math.round(limit)} s.` };
	} finally { input.waited.seconds += Math.round((Date.now() - started) / 1000); }
}
