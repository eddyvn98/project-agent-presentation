import { uploadProjectAgentReviewFile, type DifyChatFile } from "../dify-input-files";

export interface RuntimeModelReply { answer: string; conversationId?: string; promptTokens?: number; completionTokens?: number }

const base = () => (process.env.PROJECT_AGENT_RUNTIME_DIFY_API_URL?.trim() || "").replace(/\/+$/, "");
const key = () => process.env.PROJECT_AGENT_RUNTIME_DIFY_API_KEY?.trim() || "";
export const isRuntimeModelConfigured = () => Boolean(base() && key());

export async function uploadRuntimeImage(name: string, bytes: Buffer, user: string, mimeType: "image/png" | "image/jpeg" = "image/png"): Promise<DifyChatFile> {
	return uploadProjectAgentReviewFile({ name, mimeType }, bytes, user, `${base()}/chat-messages`, key(), true);
}

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_EMPTY_ATTEMPTS = 4;

export interface RuntimeModelInput { query: string; user: string; conversationId?: string; images?: DifyChatFile[]; signal?: AbortSignal; /** Model-step selector; empty or absent runs the app's default model. */ modelSelector?: string }

/** Dify answers 404 "Conversation Not Exists" for a conversation id the model-step app does not hold (for example one from a previous app). */
export function isConversationLostError(cause: unknown): boolean {
	const message = cause instanceof Error ? cause.message : String(cause);
	return (cause as { status?: number })?.status === 404 && /conversation/i.test(message) && /not exist|not found/i.test(message);
}

async function streamStep(input: RuntimeModelInput): Promise<RuntimeModelReply> {
	const timeout = AbortSignal.timeout(600_000);
	const response = await fetch(`${base()}/chat-messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
		body: JSON.stringify({ inputs: { model_selector: input.modelSelector ?? "" }, query: input.query, response_mode: "streaming", user: input.user, files: input.images ?? [], ...(input.conversationId ? { conversation_id: input.conversationId } : {}) }),
		cache: "no-store",
		signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
	});
	if (!response.ok || !response.body) throw Object.assign(new Error(`Model step failed (${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)})`), { status: response.status });
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let answer = "";
	let conversationId: string | undefined;
	let promptTokens: number | undefined;
	let completionTokens: number | undefined;
	const handle = (line: string) => {
		if (!line.startsWith("data:")) return;
		let event: { event?: string; answer?: string; conversation_id?: string; message?: string; metadata?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } };
		try { event = JSON.parse(line.slice(5).trim()); } catch { return; }
		if (event.conversation_id) conversationId = event.conversation_id;
		if (event.event === "message" || event.event === "agent_message") answer += event.answer ?? "";
		else if (event.event === "message_end") { promptTokens = event.metadata?.usage?.prompt_tokens; completionTokens = event.metadata?.usage?.completion_tokens; }
		else if (event.event === "error") throw new Error(`Model step failed (${event.message ?? "stream error"})`);
	};
	for (;;) {
		const { done, value } = await reader.read();
		if (value) {
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			lines.forEach(handle);
		}
		if (done) break;
	}
	handle(buffer);
	return { answer, conversationId, promptTokens, completionTokens };
}

/** One reasoning step through the Dify model-step app. Streamed so a long file write does not hit the gateway timeout; Dify keeps the conversation and the logs. */
export async function callRuntimeModel(input: RuntimeModelInput): Promise<RuntimeModelReply> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const reply = await streamStep(input);
			// An empty answer is a gateway hiccup, not a model decision: ask again before the run counts it as an invalid reply.
			if (reply.answer.trim() || input.signal?.aborted || attempt >= MAX_EMPTY_ATTEMPTS) return reply;
		} catch (cause) {
			const status = (cause as { status?: number }).status;
			if (input.signal?.aborted || attempt >= MAX_ATTEMPTS || !(status && RETRY_STATUSES.has(status))) throw cause;
		}
		await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
	}
}
