function localDay(value: Date): string {
	return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function dayLabel(value: Date): string {
	const today = new Date();
	if (localDay(value) === localDay(today)) return "Today";
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (localDay(value) === localDay(yesterday)) return "Yesterday";
	return value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** A local time for every turn and a date separator when the day changes. */
export function ProjectAgentTimeMarker({ timestamp, previousTimestamp }: { timestamp: string; previousTimestamp?: string }) {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) return null;
	const previous = previousTimestamp ? new Date(previousTimestamp) : null;
	const showDate = !previous || !Number.isFinite(previous.getTime()) || localDay(date) !== localDay(previous);
	return <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-2">
		{showDate && <div role="separator" aria-label={dayLabel(date)} className="flex min-w-0 flex-1 items-center gap-3"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /><span className="shrink-0 text-[11px] font-medium text-slate-400">{dayLabel(date)}</span><span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /></div>}
		<time dateTime={date.toISOString()} className="shrink-0 text-[11px] tabular-nums text-slate-400">{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
	</div>;
}
