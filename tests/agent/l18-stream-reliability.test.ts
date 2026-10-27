import { describe, expect, it } from "vitest";
import { readDifyAgentMessage } from "../../lib/project-agent/dify-stream";
import { ModelStreamGuard } from "../../lib/project-agent/runtime/model-stream-guard";
const encoded = new TextEncoder();
const event = (data: object) => "data: " + JSON.stringify(data) + "\n\n";
describe("L18 SSE streaming, reconnect and truncated response fencing", () => {
  it("parses UTF-8 split across arbitrary byte offsets without duplicating messages", async () => {
    const payload = event({ event: "agent_message", answer: "Xin chào 🧪" }) +
      event({ event: "message_end", conversation_id: "chat-1", metadata: {
        usage: { prompt_tokens: 123, completion_tokens: 15 } } });
    const bytes = encoded.encode(payload), guard = new ModelStreamGuard();
    for (const byte of bytes) guard.push(Uint8Array.of(byte));
    expect(guard.finish()).toMatchObject({ answer: "Xin chào 🧪",
      conversationId: "chat-1", promptTokens: 123, completionTokens: 15 });
  });
  it("never executes partial model action if EOF occurs without completion", () => {
    const guard = new ModelStreamGuard();
    guard.push(encoded.encode(event({ event: "agent_message", answer: '{"action":"browser"}' })));
    expect(() => guard.finish()).toThrow(/without completion/);
    const malformed = new ModelStreamGuard();
    expect(() => malformed.push(encoded.encode("data: {not-json}\n\n")))
      .toThrow(/invalid SSE/);
  });
  it("rejects terminal error, duplicate oversized payload and empty final answer", () => {
    const error = new ModelStreamGuard();
    expect(() => error.push(encoded.encode(event({ event: "error", message: "private detail" }))))
      .toThrow(/reported an error/);
    const oversized = new ModelStreamGuard();
    expect(() => oversized.push(encoded.encode("x".repeat(2 * 1024 * 1024 + 1))))
      .toThrow(/size limit/);
    const empty = new ModelStreamGuard();
    empty.push(encoded.encode(event({ event: "message_end" })));
    expect(() => empty.finish()).toThrow(/empty answer/);
  });
  it("stream reader handles a disconnect without treating incomplete last answer as success", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(c) { controller = c; c.enqueue(encoded.encode(event({ event: "agent_message", answer: "partial" }))); },
    }));
    const promise = readDifyAgentMessage(response);
    controller.error(new Error("wire disconnect"));
    await expect(promise).rejects.toThrow(/wire disconnect/);
  });
  it("deduplicates SSE tool progress events after an identical replay", async () => {
    const events = [
      { event: "agent_thought", id: "step-1", tool: "web_search", tool_input: '{"query":"safe"}' },
      { event: "agent_thought", id: "step-1", tool: "web_search", observation: "done" },
    ];
    const response = new Response([...events, ...events, { event: "message", answer: "verified" }]
      .map(event).join(""));
    const phases: string[] = [];
    const result = await readDifyAgentMessage(response, (_text, _tool, step) => {
      if (step) phases.push(step.phase);
    });
    expect(phases).toEqual(["started", "returned"]);
    expect(result.answer).toBe("verified");
  });
});
