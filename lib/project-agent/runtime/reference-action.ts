import { loadReferences, searchReferences, findReference, renderReference } from "../reference-library";
import type { ProjectAgentTaskSource } from "../types";

export async function referenceAction(input: { query?: string; id?: string; find?: string }): Promise<{ text: string; sources: ProjectAgentTaskSource[]; failed?: boolean }> {
	const entries = await loadReferences();
	const matches = input.id ? entries.filter((entry) => entry.id === input.id) : searchReferences(entries, input.query ?? "");
	if (!matches.length) return { text: "No matching reference entry. Use web_search and web_fetch to verify the official source.", sources: [], failed: true };
	const results = matches.map((entry) => renderReference(entry, input.find ? findReference(entry, input.find) : entry.body));
	return {
		text: `Reference library matches (official sources):\n${results.map((item, index) => `${index + 1}. ${item}`).join("\n\n---\n\n")}`,
		sources: matches.map((entry) => ({ url: entry.sourceUrl, title: `${entry.code} — ${entry.title}`, fetchedAt: new Date().toISOString(), sourceType: "page" as const })),
	};
}
