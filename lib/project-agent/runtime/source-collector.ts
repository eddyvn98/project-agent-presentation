import type { ProjectAgentTaskSource } from "../types";

const MAX_SOURCES = 20;

function sourceKey(url: string): string {
	try { const parsed = new URL(url); parsed.hash = ""; return parsed.href; } catch { return url; }
}

/** Keeps first-seen order, upgrades search candidates to pages actually read, and bounds task metadata. */
export function recordSources(target: ProjectAgentTaskSource[], incoming: ProjectAgentTaskSource[]): void {
	for (const source of incoming) {
		const key = sourceKey(source.url);
		const index = target.findIndex((item) => sourceKey(item.url) === key);
		if (index < 0) target.push(source);
		else if (source.sourceType === "page" || target[index].sourceType !== "page") target[index] = source;
	}
	while (target.length > MAX_SOURCES) {
		const candidate = target.findIndex((source) => source.sourceType === "search");
		target.splice(candidate >= 0 ? candidate : target.length - 1, 1);
	}
}
