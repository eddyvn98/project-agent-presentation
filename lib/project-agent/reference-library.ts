import fs from "node:fs/promises";
import path from "node:path";
import { bm25Filter } from "../bm25";

export type ReferenceStatus = "current" | "superseded" | "draft";
export interface ReferenceEntry {
	id: string; code: string; title: string; jurisdiction: string; domain: string[]; issuedBy: string;
	issued?: string; effective?: string; status: ReferenceStatus; supersedes?: string[]; supersededBy?: string[];
	amendments?: string[]; sourceUrl: string; checkedAt?: string; watch?: string[]; license: "public-law" | "summary-only";
	verified?: boolean; body: string;
}
const ROOT = process.cwd();
const SEED = path.join(ROOT, "reference-library");
const OVERLAY = path.join(ROOT, "data/project-agent/reference");
const required = ["id", "code", "title", "jurisdiction", "issuedBy", "status", "sourceUrl", "license"] as const;

function scalar(value: string): string {
	const v = value.trim();
	if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
	return v;
}
export function parseReference(text: string): ReferenceEntry {
	const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
	if (!match) throw new Error("reference entry needs YAML front matter");
	const meta: Record<string, string | string[] | boolean> = {};
	let listKey = "";
	for (const line of match[1].split(/\r?\n/)) {
		const item = line.match(/^\s+-\s+(.+)$/);
		if (item && listKey) { const list = meta[listKey] as string[]; list.push(scalar(item[1])); continue; }
		const pair = line.match(/^([\w]+):\s*(.*)$/);
		if (!pair) continue;
		listKey = pair[2] ? "" : pair[1];
		const value = pair[2].trim();
		meta[pair[1]] = !value ? [] : value === "true" || value === "false" ? value === "true" : value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1).split(",").map(scalar).filter(Boolean) : scalar(value);
	}
	for (const key of required) if (!meta[key]) throw new Error(`reference entry missing ${key}`);
	if (!/^https:\/\//.test(String(meta.sourceUrl))) throw new Error("reference sourceUrl must use https");
	if (!["current", "superseded", "draft"].includes(String(meta.status))) throw new Error("reference status must be current, superseded, or draft");
	if (!["public-law", "summary-only"].includes(String(meta.license))) throw new Error("reference license is invalid");
	if (!Array.isArray(meta.domain) || !meta.domain.length) throw new Error("reference domain must be a non-empty list");
	if (meta.verified !== undefined && typeof meta.verified !== "boolean") throw new Error("reference verified must be boolean");
	return { ...meta, body: match[2].trim() } as unknown as ReferenceEntry;
}
async function readDir(dir: string): Promise<ReferenceEntry[]> {
	let files: string[];
	try { files = (await fs.readdir(dir)).filter((file) => file.endsWith(".md")); } catch { return []; }
	return Promise.all(files.map(async (file) => parseReference(await fs.readFile(path.join(dir, file), "utf8"))));
}
export async function loadReferences(): Promise<ReferenceEntry[]> {
	return mergeReferences(await readDir(SEED), await readDir(OVERLAY));
}
export function mergeReferences(seed: ReferenceEntry[], overlay: ReferenceEntry[]): ReferenceEntry[] {
	const entries = new Map(seed.map((entry) => [entry.id, entry]));
	for (const entry of overlay) entries.set(entry.id, entry);
	return [...entries.values()];
}
export function normalizeReferenceText(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d").replace(/\u0110/g, "D").toLowerCase();
}
const STATUS_ORDER: Record<ReferenceStatus, number> = { current: 0, draft: 1, superseded: 2 };
/**
 * Entries ranked by how many query words they contain (code, title, watch names in any language, body), then current
 * before upcoming before superseded. A superseded match brings its replacement in just above it.
 */
export function searchReferences(entries: ReferenceEntry[], query: string): ReferenceEntry[] {
	const normalized = normalizeReferenceText(query).replace(/[^\p{L}\p{N}:./\s-]/gu, " ").replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	const terms = [...new Set(normalized.split(" ").filter((term) => term.length > 1))];
	const indexed = entries.map((entry, index) => ({ entry, index, text: normalizeReferenceText(`${entry.code} ${entry.title} ${(entry.watch ?? []).join(" ")} ${entry.domain.join(" ")} ${entry.body}`) }));
	const candidates = bm25Filter(normalized, indexed.map((item) => item.text), Math.min(entries.length, 20));
	const rank = new Map(candidates.map((text, index) => [text, index]));
	const scored = indexed.map((item) => ({ ...item, score: terms.filter((term) => item.text.includes(term)).length + (item.text.includes(normalized) ? terms.length : 0)
		+ (normalized.includes(normalizeReferenceText(item.entry.code.split(":")[0])) ? terms.length : 0) }))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || STATUS_ORDER[a.entry.status] - STATUS_ORDER[b.entry.status] || (rank.get(a.text) ?? 999) - (rank.get(b.text) ?? 999) || a.index - b.index);
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const out: ReferenceEntry[] = [];
	for (const { entry } of scored) {
		if (entry.status === "superseded") for (const id of entry.supersededBy ?? []) { const next = byId.get(id); if (next && !out.includes(next)) out.push(next); }
		if (!out.includes(entry)) out.push(entry);
		if (out.length >= 5) break;
	}
	return out.slice(0, 5);
}
export function findReference(entry: ReferenceEntry, query: string): string {
	const words = normalizeReferenceText(query).split(/\s+/).filter(Boolean);
	const sections = entry.body.split(/(?=^#{1,4} )/m);
	return sections.filter((section) => words.some((word) => normalizeReferenceText(section).includes(word))).slice(0, 5).join("\n\n") || "No matching passage found.";
}
export function renderReference(entry: ReferenceEntry, passage = entry.body): string {
	const replaces = entry.status === "superseded" && entry.supersededBy?.length ? `; replaced by ${entry.supersededBy.join(", ")}` : "";
	const status = entry.status === "draft" && entry.effective && entry.effective > new Date().toISOString().slice(0, 10) ? "issued, not yet in force" : entry.status;
	return `${entry.code} — ${entry.title} (${status}${entry.effective ? `, effective ${entry.effective}` : ""}${replaces}${entry.verified === false ? "; metadata only, not verified" : ""})\n${passage}\nOfficial source: ${entry.sourceUrl}`;
}
export function detectReferenceCandidate(title: string, url: string, codes: string[]): string | null {
	if (!/^https:\/\//.test(url)) return null;
	const code = title.match(/\b(?:QCVN|TCVN|IBC|IFC|NFPA|EN|BS)\s*[\w.:/-]+/i)?.[0];
	return code && !codes.some((known) => normalizeReferenceText(known) === normalizeReferenceText(code)) ? code : null;
}
