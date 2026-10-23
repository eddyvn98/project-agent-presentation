import { afterEach, describe, expect, it, vi } from "vitest";
import { callRuntimeModel } from "@/lib/project-agent/runtime/model";

afterEach(() => vi.restoreAllMocks());

describe("callRuntimeModel", () => {
	it("asks again when the gateway returns an empty answer", async () => {
		vi.useFakeTimers();
		const sse = (answer: string) => new Response(`data: ${JSON.stringify({ event: "message", answer, conversation_id: "c1" })}\n\ndata: ${JSON.stringify({ event: "message_end", metadata: { usage: { prompt_tokens: answer ? 10 : 0 } } })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
		const replies = [sse(""), sse(""), sse('{"action":"final","answer":"ok"}')];
		const fetchMock = vi.fn(async () => replies.shift()!);
		vi.stubGlobal("fetch", fetchMock);
		const pending = callRuntimeModel({ query: "hi", user: "u", conversationId: undefined } as never);
		await vi.runAllTimersAsync();
		const reply = await pending;
		expect(reply.answer).toContain("final");
		expect(fetchMock).toHaveBeenCalledTimes(3);
		vi.useRealTimers(); vi.unstubAllGlobals();
	});
});
