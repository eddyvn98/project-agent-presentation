/** Bounded streaming decoder: never execute partial model actions after a broken SSE response. */
export interface ModelStreamResult {
  answer: string; conversationId?: string; promptTokens?: number; completionTokens?: number;
}
const MAX_WIRE_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_CHARS = 2 * 1024 * 1024;
const MAX_ANSWER_CHARS = 4 * 1024 * 1024;

export class ModelStreamGuard {
  private decoder = new TextDecoder();
  private buffer = "";
  private bytes = 0;
  private done = false;
  private result: ModelStreamResult = { answer: "" };

  push(value: Uint8Array): void {
    this.bytes += value.byteLength;
    if (this.bytes > MAX_WIRE_BYTES) throw new Error("Dify model stream exceeded the byte limit");
    this.buffer += this.decoder.decode(value, { stream: true });
    this.drain();
  }
  finish(): ModelStreamResult {
    this.buffer += this.decoder.decode();
    this.drain();
    if (this.buffer.trim()) this.consume(this.buffer);
    if (!this.done) throw new Error("Dify model stream ended without completion");
    if (!this.result.answer.trim()) throw new Error("Dify model returned an empty answer");
    return this.result;
  }
  private drain() {
    let match = /\r?\n\r?\n/.exec(this.buffer);
    while (match) {
      this.consume(this.buffer.slice(0, match.index));
      this.buffer = this.buffer.slice(match.index + match[0].length);
      match = /\r?\n\r?\n/.exec(this.buffer);
    }
    if (this.buffer.length > MAX_EVENT_CHARS) throw new Error("Dify model SSE event exceeded the size limit");
  }
  private consume(block: string) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data === "[DONE]") { this.done = true; return; }
    let event: Record<string, unknown>;
    try { event = JSON.parse(data) as Record<string, unknown>; }
    catch { throw new Error("Dify model returned an invalid SSE event"); }
    if (event.event === "error") throw new Error("Dify model stream reported an error");
    if (typeof event.conversation_id === "string") this.result.conversationId = event.conversation_id;
    if ((event.event === "agent_message" || event.event === "message") && typeof event.answer === "string") {
      this.result.answer += event.answer;
      if (this.result.answer.length > MAX_ANSWER_CHARS) throw new Error("Dify model answer exceeded the size limit");
    }
    if (event.event === "message_end") {
      const usage = (event.metadata as { usage?: Record<string, unknown> } | undefined)?.usage;
      const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
      if (valid(usage?.prompt_tokens)) this.result.promptTokens = usage.prompt_tokens;
      if (valid(usage?.completion_tokens)) this.result.completionTokens = usage.completion_tokens;
      this.done = true;
    }
  }
}
