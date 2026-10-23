/** Plain-language cause for the failures users actually hit; null keeps the original text. */
export function friendlyTaskError(error: string): string | null {
	if (/kept replying without a valid action/i.test(error)) return "The assistant could not produce a usable next step. This is usually temporary. Press Try again; if it keeps happening, split the request into smaller parts.";
	if (/\b(502|503|504)\b|bad gateway|gateway time-?out|service unavailable/i.test(error)) return "The AI service is busy or unreachable right now. Press Try again in a moment.";
	if (/terminated|timed? ?out|took longer/i.test(error)) return "The task took too long and was stopped. Press Try again, or ask for a smaller piece first.";
	if (/fetch failed|network|ECONNRESET|ECONNREFUSED|socket hang up/i.test(error)) return "The connection to the AI service was interrupted. Press Try again.";
	return null;
}

export function TaskErrorNotice({ error, cancelled }: { error: string; cancelled: boolean }) {
	if (error.startsWith("Office visual review failed:")) return <details role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"><summary className="cursor-pointer px-3 py-2 font-medium">Office visual review failed · show details</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-amber-200/70 px-3 py-2 text-xs dark:border-amber-900/60">{error.replace(/^Office visual review failed:\s*/i, "")}</pre></details>;
	const friendly = cancelled ? null : friendlyTaskError(error);
	if (friendly) return <div role="alert" className="mt-3 text-red-600"><p>{friendly}</p><details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Technical details</summary><pre className="mt-1 whitespace-pre-wrap break-words">{error}</pre></details></div>;
	return <p role="alert" className={`mt-3 whitespace-pre-wrap ${cancelled ? "text-slate-500" : "text-red-600"}`}>{error}</p>;
}
