import { describe, expect, it } from "vitest";
import { readDifyAgentMessage } from "../../lib/project-agent/dify-stream";
const enc = new TextEncoder();
const data = (event: object) => "data: " + JSON.stringify(event) + "\n\n";
function response(body: string) {
  return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(body)); c.close(); } }));
}
describe("P5 bounded classic Dify streaming", () => {
  it("handles ordinary complete answers", async () => {
    const message = await readDifyAgentMessage(response(data({ event: "agent_message", answer: "OK" })));
    expect(message.answer).toBe("OK");
  });
  it("does not silently discard malformed SSE event payloads", async () => {
    await expect(readDifyAgentMessage(response("data: {broken}\n\n"))).rejects.toThrow(/invalid stream event/);
  });
  it("refuses more than 200 unique tool thoughts", async () => {
    const stream = Array.from({ length: 201 }, (_, id) =>
      data({ event: "agent_thought", id: String(id), tool: "search", tool_input: "{}" })).join("");
    await expect(readDifyAgentMessage(response(stream))).rejects.toThrow(/activity exceeded/);
  });
  it("rejects SSE buffers larger than the individual event limit", async () => {
    await expect(readDifyAgentMessage(response("X".repeat(32 * 1024 * 1024 + 1))))
      .rejects.toThrow(/size limit/);
  });
});
