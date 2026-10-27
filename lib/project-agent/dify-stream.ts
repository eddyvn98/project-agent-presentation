import { estimateContextTokens } from "./context-meter";
import { extractDifyInlineFiles, type DifyAgentToolThought, type DifyInlineFile } from "./dify-inline-output";
import { extractOfficeToolLinks } from "./office-tools";
import type { ProjectAgentTaskSource } from "./types";

const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_EVENT_CHARS = 32 * 1024 * 1024;
const MAX_ANSWER_CHARS = 8 * 1024 * 1024;
const MAX_THOUGHTS = 200;

export interface DifyAgentMessage {
	answer: string;
	/** Explicit runtime signal; prose alone must never advance a waiting workflow. */
	needsInput?: string;
	conversationId?: string;
	inlineFiles: DifyInlineFile[];
	officeVerified?: boolean;
	officeLinks?: ReturnType<typeof extractOfficeToolLinks>["links"];
	officeFailedCalls?: number;
	/** Prompt size Dify reported for the last model call: roughly how much context the conversation uses. */
	promptTokens?: number;
	/** Number of model calls behind promptTokens (one per tool round); Dify sums the prompt size over all of them. */
	iterations?: number;
	sources?: ProjectAgentTaskSource[];
}

function getEventPayload(block: string): Record<string, unknown> | null {
	const data = block.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.join("\n");
	if (!data || data === "[DONE]") return null;
	try {
		const parsed: unknown = JSON.parse(data);
		return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
	} catch {
		throw new Error("Dify returned an invalid stream event");
	}
}

const DETAIL_KEYS = ["query", "q", "search_query", "keywords", "url", "urls", "link", "input"];

/** A short human-readable detail (search query or page address) from a Dify tool input, for the activity list. */
export function toolDetail(input: unknown): string {
	let value: unknown = input;
	if (typeof input === "string") { try { value = JSON.parse(input); } catch { return input.trim().slice(0, 120); } }
	if (!value || typeof value !== "object") return "";
	const record = value as Record<string, unknown>;
	for (const key of DETAIL_KEYS) {
		const entry = record[key];
		if (typeof entry === "string" && entry.trim()) return entry.trim().slice(0, 120);
		if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0].trim().slice(0, 120);
	}
	return "";
}

export interface DifyToolProgress { id: string; detail: string; phase: "started" | "returned" }
export type DifyProgressCallback = (answerSoFar: string, toolName?: string, step?: DifyToolProgress) => void;

export async function readDifyAgentMessage(response: Response, onPartial?: DifyProgressCallback): Promise<DifyAgentMessage> {
	if (!response.body) throw new Error("Dify Project Agent returned an empty stream");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let streamBytes = 0;
	let answer = "";
	let failure = "";
	let conversationId: string | undefined;
	let promptTokens: number | undefined;
	const toolThoughts = new Map<string, DifyAgentToolThought>();
	const announcedSteps = new Map<string, string>();
	const returnedSteps = new Set<string>();
	const consume = (block: string) => {
		const payload = getEventPayload(block);
		if (!payload) return;
		if (payload.event === "error") {
			failure = typeof payload.message === "string" ? payload.message : "Dify Project Agent failed";
			return;
		}
		if (payload.event === "agent_message" && typeof payload.answer === "string") { answer += payload.answer; if (answer.length > MAX_ANSWER_CHARS) throw new Error("Dify answer exceeded the size limit"); onPartial?.(answer); }
		if (payload.event === "message" && typeof payload.answer === "string") { answer = payload.answer; if (answer.length > MAX_ANSWER_CHARS) throw new Error("Dify answer exceeded the size limit"); onPartial?.(answer); }
		if (payload.event === "message_end") {
			const usage = (payload.metadata as { usage?: { prompt_tokens?: unknown } } | undefined)?.usage;
			if (typeof usage?.prompt_tokens === "number" && usage.prompt_tokens > 0) promptTokens = usage.prompt_tokens;
		}
		if (payload.event === "agent_thought") {
			const fresh = payload as DifyAgentToolThought;
			const key = typeof fresh.id === "string" && fresh.id ? fresh.id : `${fresh.position ?? ""}:${fresh.tool ?? ""}`;
			if (!toolThoughts.has(key) && toolThoughts.size >= MAX_THOUGHTS) throw new Error("Dify tool activity exceeded the safety limit");
			// Dify may stream tool_input and observation in separate events. Retain both for Office file extraction.
			const thought = { ...toolThoughts.get(key), ...fresh };
			toolThoughts.set(key, thought);
			if (typeof thought.tool === "string" && thought.tool) {
				const detail = toolDetail(thought.tool_input);
				if (!announcedSteps.has(key) || (!announcedSteps.get(key) && detail)) {
					announcedSteps.set(key, detail);
					onPartial?.(answer, thought.tool, { id: key, detail, phase: "started" });
				}
				// "returned" means Dify supplied an observation, NOT that the tool output was verified correct.
				if (thought.observation !== undefined && thought.observation !== null && !returnedSteps.has(key)) {
					returnedSteps.add(key);
					onPartial?.(answer, thought.tool, { id: key, detail, phase: "returned" });
				}
			}
		}
		if (typeof payload.conversation_id === "string" && payload.conversation_id) conversationId = payload.conversation_id;
	};

	try {
		while (true) {
			const { value, done } = await reader.read();
			streamBytes += value?.byteLength ?? 0;
			if (streamBytes > MAX_STREAM_BYTES) throw new Error("Dify stream exceeded the byte limit");
			buffer += decoder.decode(value, { stream: !done });
			let boundary = buffer.search(/\r?\n\r?\n/);
			while (boundary >= 0) {
				const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
				consume(buffer.slice(0, boundary));
				buffer = buffer.slice(boundary + separator.length);
				boundary = buffer.search(/\r?\n\r?\n/);
			}
			if (buffer.length > MAX_EVENT_CHARS) throw new Error("Dify SSE event exceeded the size limit");
			if (done) break;
		}
		if (buffer.trim()) consume(buffer);
	} catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
	finally { reader.releaseLock(); }
	if (failure) throw new Error(failure.slice(0, 400));
	const thoughts = [...toolThoughts.values()];
	const inlineFiles = extractDifyInlineFiles(thoughts);
	const office = extractOfficeToolLinks(thoughts);
	// The agent sometimes ends right after the exporter call without any text; the file itself is the answer then.
	if (!answer.trim() && (inlineFiles.length > 0 || office.links.length > 0)) answer = "Generated the requested file(s).";
	if (!answer.trim()) throw new Error("Dify Project Agent finished without a response");
	return { answer: answer.trim().slice(0, 80_000), conversationId, inlineFiles, officeLinks: office.links, officeFailedCalls: office.failedCalls, promptTokens: promptTokens && estimateContextTokens(promptTokens, thoughts.length + 1), iterations: thoughts.length + 1 };
}

export async function readDifyAgentAnswer(response: Response): Promise<string> {
	return (await readDifyAgentMessage(response)).answer;
}
