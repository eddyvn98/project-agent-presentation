export type PlanStatus = "todo" | "doing" | "done";
export interface PlanItem { text: string; status: PlanStatus }

const MAX_ITEMS = 12;
const STATUSES: PlanStatus[] = ["todo", "doing", "done"];

/** Items as the model sends them: strings (todo) or {text, status}. Returns null when nothing usable is there. */
export function parsePlanItems(raw: unknown): PlanItem[] | null {
	if (!Array.isArray(raw)) return null;
	const items: PlanItem[] = [];
	for (const entry of raw) {
		const text = typeof entry === "string" ? entry : entry && typeof entry === "object" && typeof (entry as { text?: unknown }).text === "string" ? (entry as { text: string }).text : "";
		const status = entry && typeof entry === "object" ? (entry as { status?: unknown }).status : undefined;
		if (text.trim()) items.push({ text: text.trim().slice(0, 140), status: STATUSES.includes(status as PlanStatus) ? (status as PlanStatus) : "todo" });
	}
	return items.length ? items.slice(0, MAX_ITEMS) : null;
}

/** The latest plan a task wrote to its log (`plan :: [json]`), for the live checklist. */
export function planFromLog(log: string[]): PlanItem[] | undefined {
	const line = log.findLast((entry) => /(?:^|\s)plan :: \[/.test(entry));
	if (!line) return undefined;
	try { return parsePlanItems(JSON.parse(line.slice(line.indexOf("plan :: ") + 8))) ?? undefined; } catch { return undefined; }
}
