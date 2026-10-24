import { describe, expect, it, vi, afterEach } from "vitest";
import { ModelStreamGuard } from "../../lib/project-agent/runtime/model-stream-guard";
import { callRuntimeModel } from "../../lib/project-agent/runtime/model";

const encoder = new TextEncoder();
const event = (value: object) => "data: " + JSON.stringify(value) + "\n\n";
function stream(...pieces: string[]) {
  return new ReadableStream<Uint8Array>({ start(c) { for (const p of pieces) c.enqueue(encoder.encode(p)); c.close(); } });
}
afterEach(() => vi.unstubAllGlobals());
describe("P5 Dify fault injection", () => {
  it("reassembles split SSE chunks", () => {
    const guard = new ModelStreamGuard();
    const joined = event({ event: "agent_message", answer: "ok" }) +
      event({ event: "message_end", metadata: { usage: { prompt_tokens: 3, completion_tokens: 1 } } });
    for (const byte of encoder.encode(joined)) guard.push(new Uint8Array([byte]));
    expect(guard.finish()).toMatchObject({ answer: "ok", promptTokens: 3, completionTokens: 1 });
  });
  it("rejects truncated responses and oversized stream data", () => {
    const guard = new ModelStreamGuard();
    guard.push(encoder.encode(event({ event: "agent_message", answer: "partial" })));
    expect(() => guard.finish()).toThrow(/without completion/);
    const oversized = new ModelStreamGuard();
    expect(() => oversized.push(encoder.encode("a".repeat(2 * 1024 * 1024 + 10)))).toThrow(/size limit/);
  });
  it("rejects provider errors and invalid JSON without leaking payloads", () => {
    expect(() => new ModelStreamGuard().push(encoder.encode("data: {broken}\n\n"))).toThrow(/invalid SSE/);
    expect(() => new ModelStreamGuard().push(encoder.encode(event({ event: "error", message: "secret" })))).toThrow(/reported an error/);
  });
  it("does not retry an incomplete 200 response that might have consumed a model turn", async () => {
    const fetcher = vi.fn(async () => new Response(stream(event({ event: "agent_message", answer: "partial" })), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(callRuntimeModel({ query: "test", user: "synthetic" })).rejects.toThrow(/without completion/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("returns a complete model response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream(
      event({ event: "agent_message", answer: "complete" }), event({ event: "message_end" })
    ), { status: 200 })));
    expect((await callRuntimeModel({ query: "test", user: "synthetic" })).answer).toBe("complete");
  });
});
