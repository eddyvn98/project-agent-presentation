import { findReference, loadReferences, renderReference, type ReferenceEntry } from "../reference-library";
import type { ProjectAgentTaskSource } from "../types";
import { harnessOff } from "./harness-flags";
import { requestJurisdictions, topicReferenceIds } from "./reference-topics";

const REFERENCE_CODE = /\b(?:QCVN|TCVN|IBC|IFC|NFPA|Eurocode|EN\s*199\d|BS\s*999\d|ADA Standards?)\b/i;
const MAX_CHARS = 7_000;
/** The user's own words: the "User request" block of a runtime query, a sub-agent's "Job", else the first paragraph. */
function userTurnOf(query: string): string {
	const request = query.lastIndexOf("User request:\n"), job = query.lastIndexOf("\nJob:\n");
	if (request >= 0) return query.slice(request + 14).split(/\n\nBefore you finish:/, 1)[0].slice(0, 2000);
	if (job >= 0) return query.slice(job + 6).slice(0, 2000);
	return query.split(/\n\s*\n/, 1)[0].slice(0, 1200);
}
const projectContextOf = (query: string) => [...query.matchAll(/Project (?:description|instructions):\n([\s\S]*?)(?:\n\n|$)/g)].map((match) => match[1]).join("\n").slice(0, 2000);

/** A question that names a code, or asks about a topic the library covers (density, fire escape, preschools...). */
export function isReferencePrefetchQuery(query: string): boolean {
	const userTurn = userTurnOf(query);
	return REFERENCE_CODE.test(userTurn) || topicReferenceIds(userTurn, requestJurisdictions(userTurn, projectContextOf(query))).length > 0;
}

function matchesMentionedCode(entryCode: string, query: string): boolean {
	const match = entryCode.match(/^(QCVN|TCVN|IBC|IFC|NFPA|EN|BS|ADA)\s*([\d.]+)?/i);
	if (!match) return false;
	const family = match[1].toLowerCase();
	const number = match[2]?.replace(/\.$/, "");
	const requiredNumber = number && !["ibc", "ifc", "ada"].includes(family) ? `\\s*0*${number}` : "";
	return new RegExp(`\\b${family}\\b${requiredNumber}`, "i").test(query);
}

/** Entries the question names or whose topic it asks about, plus the editions that replace them or that they replace. */
export function pickReferences(entries: ReferenceEntry[], userTurn: string, jurisdictions: string[]): ReferenceEntry[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const picked = new Map<string, ReferenceEntry>();
	const add = (entry: ReferenceEntry | undefined) => { if (entry && !picked.has(entry.id)) picked.set(entry.id, entry); };
	entries.filter((entry) => matchesMentionedCode(entry.code, userTurn)).forEach(add);
	topicReferenceIds(userTurn, jurisdictions).forEach((id) => add(byId.get(id)));
	for (const entry of [...picked.values()]) [...(entry.supersededBy ?? []), ...(entry.supersedes ?? [])].forEach((id) => add(byId.get(id)));
	return [...picked.values()].slice(0, 6);
}

export async function prefetchReference(query: string): Promise<{ text: string; sources: ProjectAgentTaskSource[] } | null> {
	if (harnessOff("reference") || !isReferencePrefetchQuery(query)) return null;
	const userTurn = userTurnOf(query);
	const jurisdictions = requestJurisdictions(userTurn, projectContextOf(query));
	const picked = pickReferences(await loadReferences(), userTurn, jurisdictions);
	if (!picked.length) return { text: "Reference library has no matching entry. Use web_search and web_fetch on authoritative sources.", sources: [] };
	const verified = picked.filter((entry) => entry.verified);
	const metadataOnly = picked.filter((entry) => !entry.verified).map((entry) => renderReference(entry, "").split("\n")[0]);
	if (!verified.length) return { text: `Reference library metadata-only matches (not verified): ${metadataOnly.join("; ")}. Use web_search and web_fetch to verify editions and requirements.`, sources: [] };
	let budget = MAX_CHARS;
	const blocks = verified.map((entry) => {
		const found = findReference(entry, userTurn);
		const passage = (found === "No matching passage found." ? entry.body : found).slice(0, Math.max(600, Math.floor(budget / verified.length)));
		budget -= passage.length;
		return renderReference(entry, passage);
	});
	const editions = picked.filter((entry) => entry.status !== "current").map((entry) => renderReference(entry, "").split("\n")[0]);
	return {
		text: [
			`Reference library matches for this question (jurisdiction: ${jurisdictions.join(", ") || "not stated"}; curated from official sources; state the edition in force today and mention editions that are issued but not yet in force or already replaced):`,
			blocks.map((block, index) => `${index + 1}. ${block}`).join("\n\n---\n\n"),
			editions.length ? `Edition changes to mention: ${editions.join("; ")}` : "",
			metadataOnly.length ? `Also related, metadata only (verify before citing): ${metadataOnly.join("; ")}` : "",
		].filter(Boolean).join("\n\n"),
		sources: verified.map((entry) => ({ url: entry.sourceUrl, title: `${entry.code} — ${entry.title}`, fetchedAt: new Date().toISOString(), sourceType: "page" as const })),
	};
}
