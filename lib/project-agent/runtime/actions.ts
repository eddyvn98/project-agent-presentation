import { parseSubAgentTier, type SubAgentTier } from "./sub-agent-model";
import { parseBrowserAction, type BrowserAction } from "./browser-agent/action-parser";
import { parsePlanItems, type PlanItem } from "../plan";
import { parseWait, type WaitSpec } from "./wait-action";
import { parsePdfAction, type PdfAction } from "./pdf-action";

/** Zoom: a part of each page in percent of the page (0-100), drawn about 1400 px wide instead of the whole page at 560-760 px. */
export interface RenderRegion { x: number; y: number; width: number; height: number }

function parseRenderRegion(value: unknown): RenderRegion | undefined {
	if (!value || typeof value !== "object") return undefined;
	const { x, y, width, height } = value as Record<string, unknown>;
	const nums = [x, y, width, height];
	if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
	const [rx, ry, rw, rh] = nums as number[];
	if (rx < 0 || ry < 0 || rw <= 0 || rh <= 0 || rx + rw > 100.01 || ry + rh > 100.01) return undefined;
	return { x: rx, y: ry, width: rw, height: rh };
}

export type RuntimeAction =
	| { action: "shell"; command: string; timeout?: number; note?: string }
	| { action: "write_file"; path: string; content: string; note?: string }
	| { action: "render"; path: string; pages?: "sample" | number[]; region?: RenderRegion; note?: string }
	| { action: "delegate"; task: string; role?: "worker" | "reviewer"; model?: SubAgentTier; note?: string }
	| { action: "transcribe_tables"; path: string; pages: number[]; model?: SubAgentTier; note?: string }
	| { action: "web_fetch"; url: string; offset?: number; find?: string; note?: string }
	| { action: "reference"; query?: string; id?: string; find?: string; note?: string }
	| { action: "web_search"; query?: string; queries?: string[]; recency?: "day" | "week" | "month" | "year"; lang?: string; note?: string }
	| BrowserAction
	| PdfAction
	| { action: "workspace_read"; board?: string; note?: string }
	| { action: "workspace_commands"; categories?: string[]; query?: string; note?: string }
	| { action: "workspace_view"; blockIds?: string[]; board?: string; title?: string; note?: string }
	| { action: "workspace_apply"; actions: Record<string, unknown>[]; revision?: number; board?: string; title?: string; note?: string }
	| { action: "generate_image"; prompt: string; aspectRatio?: string; resolution?: string; model?: string; count?: number; references?: string[]; note?: string }
	| ({ action: "wait"; note?: string } & WaitSpec)
	| { action: "plan"; items: PlanItem[]; note?: string }
	| { action: "final"; answer: string; files?: string[]; note?: string };

function firstJsonObject(text: string): string | null {
	const start = text.indexOf("{");
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (char === "\\") index += 1;
			else if (char === "\"") inString = false;
		} else if (char === "\"") inString = true;
		else if (char === "{") depth += 1;
		else if (char === "}" && --depth === 0) return text.slice(start, index + 1);
	}
	return null;
}

/** The model sometimes answers in its native tool-call markup (<invoke name="shell"><parameter name="command">…) instead of JSON. */
function xmlToolCall(text: string): Record<string, unknown> | null {
	const invoke = text.match(/<invoke name="(\w+)">([\s\S]*?)(?:<\/invoke>|$)/);
	if (!invoke) return null;
	const raw: Record<string, unknown> = { action: invoke[1] };
	for (const [, key, value] of invoke[2].matchAll(/<parameter name="(\w+)"[^>]*>([\s\S]*?)<\/parameter>/g)) {
		const trimmed = value.replace(/^\n|\n$/g, "");
		raw[key] = /^\s*[\[\d]/.test(trimmed) && (["pages", "timeout", "files", "actions", "categories", "blockIds", "queries", "revision"].includes(key)) ? safeJson(trimmed) : trimmed;
	}
	return raw;
}

function safeJson(text: string): unknown {
	try { return JSON.parse(text); } catch { return text; }
}

/** A list of non-empty strings; a lone string (or comma-separated names) counts as a list, since models often send one name unwrapped. */
function strings(value: unknown): string[] | undefined {
	const source = typeof value === "string" ? value.split(",") : value;
	const list = Array.isArray(source) ? source.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
	return list.length ? list : undefined;
}

function toAction(raw: Record<string, unknown>): RuntimeAction | { error: string } {
	if (raw.action === "shell" && raw.timeout !== undefined && (typeof raw.timeout !== "number" || !Number.isFinite(raw.timeout) || raw.timeout <= 0)) return { error: "shell timeout must be a positive finite number" };
	if (raw.action === "web_fetch" && raw.offset !== undefined && (typeof raw.offset !== "number" || !Number.isSafeInteger(raw.offset) || raw.offset < 0)) return { error: "web_fetch offset must be a non-negative integer" };
	if (raw.action === "generate_image" && raw.count !== undefined && (typeof raw.count !== "number" || !Number.isSafeInteger(raw.count) || raw.count < 1 || raw.count > 4)) return { error: "generate_image count must be an integer from 1 to 4" };
	if (raw.action === "render" && raw.pages !== undefined && raw.pages !== "sample" && (!Array.isArray(raw.pages) || !raw.pages.length || raw.pages.some((page) => !Number.isSafeInteger(page) || page < 1))) return { error: "render pages must be sample or positive integer page numbers" };
	const note = typeof raw.note === "string" ? raw.note.slice(0, 200) : undefined;
	switch (raw.action) {
		case "shell":
			return typeof raw.command === "string" && raw.command.trim() ? { action: "shell", command: raw.command, timeout: typeof raw.timeout === "number" ? raw.timeout : undefined, note } : { error: "shell needs a command" };
		case "write_file":
			return typeof raw.path === "string" && typeof raw.content === "string" ? { action: "write_file", path: raw.path, content: raw.content, note } : { error: "write_file needs path and content" };
		case "render":
			{
			if (typeof raw.path !== "string") return { error: "render needs a path" };
			const region = raw.region === undefined ? undefined : parseRenderRegion(raw.region);
			if (raw.region !== undefined && !region) return { error: "render region needs x, y, width, height in percent of the page (0-100, inside the page)" };
			return { action: "render", path: raw.path, pages: Array.isArray(raw.pages) ? raw.pages.filter((page): page is number => typeof page === "number") : "sample", ...(region ? { region } : {}), note };
		}
		case "generate_image":
			return typeof raw.prompt === "string" && raw.prompt.trim() ? {
				action: "generate_image", prompt: raw.prompt, note,
				aspectRatio: typeof raw.aspect_ratio === "string" ? raw.aspect_ratio : undefined,
				resolution: typeof raw.resolution === "string" ? raw.resolution : undefined,
				model: typeof raw.model === "string" ? raw.model : undefined,
				count: typeof raw.count === "number" ? raw.count : undefined,
				references: Array.isArray(raw.references) ? raw.references.filter((item): item is string => typeof item === "string") : undefined,
			} : { error: "generate_image needs a prompt" };
		case "wait": {
			const spec = parseWait(raw);
			return "error" in spec ? spec : { action: "wait", ...spec, note };
		}
		case "plan": {
			const items = parsePlanItems(raw.items ?? raw.steps);
			return items ? { action: "plan", items, note } : { error: "plan needs items: a list of short steps, each a string or {text, status}" };
		}
		case "delegate":
			return typeof raw.task === "string" && raw.task.trim() ? { action: "delegate", task: raw.task.trim(), role: raw.role === "reviewer" ? "reviewer" : "worker", model: parseSubAgentTier(raw.model), note } : { error: "delegate needs a task" };
		case "transcribe_tables": {
			const source = typeof raw.pages === "string" ? raw.pages.split(",") : raw.pages;
			const pages = Array.isArray(source) ? source.map((page) => Number(page)).filter((page) => Number.isInteger(page) && page > 0) : [];
			return typeof raw.path === "string" && raw.path.trim() && pages.length ? { action: "transcribe_tables", path: raw.path.trim(), pages, model: parseSubAgentTier(raw.model), note } : { error: "transcribe_tables needs path (the PDF) and pages (a list of page numbers)" };
		}
		case "workspace_read":
			return { action: "workspace_read", board: typeof raw.board === "string" ? raw.board : undefined, note };
		case "workspace_commands":
			return { action: "workspace_commands", categories: strings(raw.categories), query: typeof raw.query === "string" && raw.query.trim() ? raw.query.trim().slice(0, 500) : undefined, note };
		case "workspace_view":
			return { action: "workspace_view", blockIds: strings(raw.blockIds), board: typeof raw.board === "string" ? raw.board : undefined, title: typeof raw.title === "string" ? raw.title : undefined, note };
		case "workspace_apply": {
			const list = Array.isArray(raw.actions) ? raw.actions : [];
			if (!list.length || list.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof (item as { type?: unknown }).type !== "string")) return { error: "workspace_apply needs actions: an array of command objects, each with a string type" };
			const revision = typeof raw.revision === "string" ? (raw.revision.trim() ? Number(raw.revision) : undefined) : raw.revision;
			if (revision !== undefined && revision !== null && (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0)) return { error: "workspace_apply revision must be the integer revision number shown by workspace_view (or omitted)" };
			return { action: "workspace_apply", actions: list as Record<string, unknown>[], revision: revision ?? undefined, board: typeof raw.board === "string" ? raw.board : undefined, title: typeof raw.title === "string" ? raw.title : undefined, note };
		}
		case "web_search":
			{
				const queries = Array.isArray(raw.queries) ? raw.queries.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 300)).slice(0, 4) : undefined;
				const query = typeof raw.query === "string" && raw.query.trim() ? raw.query.trim().slice(0, 300) : undefined;
				const recency = ["day", "week", "month", "year"].includes(String(raw.recency)) ? raw.recency as "day" | "week" | "month" | "year" : undefined;
				const lang = typeof raw.lang === "string" && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(raw.lang.trim()) ? raw.lang.trim().slice(0, 12) : undefined;
				return query !== undefined || Boolean(queries?.length) ? { action: "web_search", query, queries, recency, lang, note } : { error: "web_search needs a query or up to four queries" };
			}
		case "web_fetch":
			return typeof raw.url === "string" && raw.url.trim() ? { action: "web_fetch", url: raw.url.trim(), offset: typeof raw.offset === "number" ? raw.offset : undefined, find: typeof raw.find === "string" && raw.find.trim() ? raw.find.trim().slice(0, 120) : undefined, note } : { error: "web_fetch needs a url" };
		case "browser":
			return parseBrowserAction({ ...raw, note });
		case "pdf":
			return parsePdfAction({ ...raw, note });
		case "reference":
			return typeof raw.id === "string" && raw.id.trim() ? { action: "reference", id: raw.id.trim(), find: typeof raw.find === "string" ? raw.find.trim().slice(0, 120) : undefined, note } : typeof raw.query === "string" && raw.query.trim() ? { action: "reference", query: raw.query.trim().slice(0, 500), note } : { error: "reference needs a query or id" };
		case "final":
			return typeof raw.answer === "string" ? { action: "final", answer: raw.answer, files: Array.isArray(raw.files) ? raw.files.filter((file): file is string => typeof file === "string") : [], note } : { error: "final needs an answer" };
		default:
			return { error: `unknown action ${JSON.stringify(raw.action)}` };
	}
}

/** Reads the model's single JSON action; tolerates code fences and stray prose around it. */
export function parseRuntimeAction(answer: string): RuntimeAction | { error: string } {
	const source = firstJsonObject(answer.replace(/^```(?:json)?\s*|\s*```$/gim, ""));
	let raw: Record<string, unknown> | null = null;
	let parseError = "no JSON object found";
	if (source) {
		try { raw = JSON.parse(source) as Record<string, unknown>; } catch (cause) { parseError = `invalid JSON (${cause instanceof Error ? cause.message : "parse error"})`; }
	}
	raw ??= xmlToolCall(answer);
	if (!raw) return { error: parseError };
	return toAction(raw);
}

export const MAX_ACTIONS_PER_REPLY = 6;

/** Reads every action in a reply (one JSON object or tool call after another); actions after a final one are dropped. */
export function parseRuntimeActions(answer: string): RuntimeAction[] | { error: string } {
	const text = answer.replace(/^```(?:json)?\s*|\s*```$/gim, "");
	const raws: Record<string, unknown>[] = [];
	for (let rest = text; raws.length < MAX_ACTIONS_PER_REPLY;) {
		const source = firstJsonObject(rest);
		if (!source) break;
		rest = rest.slice(rest.indexOf(source) + source.length);
		try { const value = JSON.parse(source) as Record<string, unknown>; if (typeof value.action === "string") raws.push(value); } catch { break; }
	}
	for (const [whole] of raws.length ? [] : text.matchAll(/<invoke name="\w+">[\s\S]*?(?:<\/invoke>|$)/g)) {
		const raw = xmlToolCall(whole);
		if (raw && raws.length < MAX_ACTIONS_PER_REPLY) raws.push(raw);
	}
	if (!raws.length) { const single = parseRuntimeAction(answer); return "error" in single ? single : [single]; }
	const actions: RuntimeAction[] = [];
	for (const raw of raws) {
		const action = toAction(raw);
		if ("error" in action) return action;
		actions.push(action);
		if (action.action === "final") break;
	}
	return actions;
}

/** Replies that announce work still to do ("Let me open the file") are not answers. */
const INTENT_OPENER = /^\W*(i'?ll|i will|i am going to|let me|let's|first,? i|tôi sẽ|để tôi|mình sẽ|trước tiên)/i; // vi-allow
const ACTION_MARKUP = /"action"\s*:|<invoke|<parameter|<function_calls|^\s*[{\[]/;

/** A chat-style question answered in plain prose on the first turn is already the final answer; asking the model to re-send it as JSON would repeat the whole model call. */
export function plainAnswerAsFinal(answer: string): RuntimeAction | null {
	const text = answer.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
	if (text.length < 200 || ACTION_MARKUP.test(text) || INTENT_OPENER.test(text) || /[:：]\s*$/.test(text)) return null;
	return { action: "final", answer: text, files: [] };
}
