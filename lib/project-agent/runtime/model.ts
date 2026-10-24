import { uploadProjectAgentReviewFile, type DifyChatFile } from "../dify-input-files";
import { setTimeout as delay } from "node:timers/promises";
import { ModelStreamGuard } from "./model-stream-guard";

export interface RuntimeModelReply { answer: string; conversationId?: string; promptTokens?: number; completionTokens?: number }

const base = () => (process.env.PROJECT_AGENT_RUNTIME_DIFY_API_URL?.trim() || "").replace(/\/+$/, "");
const key = () => process.env.PROJECT_AGENT_RUNTIME_DIFY_API_KEY?.trim() || "";
export const isRuntimeModelConfigured = () => Boolean(base() && key());

export async function uploadRuntimeImage(name: string, bytes: Buffer, user: string, mimeType: "image/png" | "image/jpeg" = "image/png"): Promise<DifyChatFile> {
	return uploadProjectAgentReviewFile({ name, mimeType }, bytes, user, `${base()}/chat-messages`, key(), true);
}

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;

export interface RuntimeModelInput { query: string; user: string; conversationId?: string; images?: DifyChatFile[]; signal?: AbortSignal; /** Model-step selector; empty or absent runs the app's default model. */ modelSelector?: string }

/** Dify answers 404 "Conversation Not Exists" for a conversation id the model-step app does not hold (for example one from a previous app). */
export function isConversationLostError(cause: unknown): boolean {
	const message = cause instanceof Error ? cause.message : String(cause);
	return (cause as { status?: number })?.status === 404 && /conversation/i.test(message) && /not exist|not found/i.test(message);
}

async function streamStep(input: RuntimeModelInput): Promise<RuntimeModelReply> {
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000);
  const response = await fetch(`${base()}/chat-messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: { model_selector: input.modelSelector ?? "" }, query: input.query,
      response_mode: "streaming", user: input.user, files: input.images ?? [],
      ...(input.conversationId ? { conversation_id: input.conversationId } : {}) }),
    cache: "no-store", signal,
  });
  if (!response.ok || !response.body)
    throw Object.assign(new Error(`Model step failed (HTTP ${response.status})`), { status: response.status });
  const reader = response.body.getReader(), guard = new ModelStreamGuard();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) guard.push(value);
    }
    return guard.finish();
  } catch (cause) {
    await reader.cancel().catch(() => {});
    throw cause;
  } finally { reader.releaseLock(); }
}

/** Retry only upstream 502/503/504 before receiving a model stream, never an uncertain partial response. */
export async function callRuntimeModel(input: RuntimeModelInput): Promise<RuntimeModelReply> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await streamStep(input); }
    catch (cause) {
      const status = (cause as { status?: number })?.status;
      if (input.signal?.aborted || attempt >= MAX_ATTEMPTS || !status || !RETRY_STATUSES.has(status)) throw cause;
    }
    await delay(2000 * attempt, undefined, { signal: input.signal });
  }
}
