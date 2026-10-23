import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callModel: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/project-agent/runtime/model", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/project-agent/runtime/model")>()), callRuntimeModel: mocks.callModel }));
vi.mock("@/lib/project-agent/runtime/outputs", () => ({ newOutputFiles: async () => [], checkHtmlPage: async () => "", storeWorkbookValues: async () => {} }));
vi.mock("@/lib/project-agent/task-store", () => ({ listProjectAgentTasks: mocks.list, writeProjectAgentFile: vi.fn() }));

import { isConversationLostError } from "@/lib/project-agent/runtime/model";
import { runRuntimeAgent } from "@/lib/project-agent/runtime/run-agent";
import { buildChatRecap } from "@/lib/project-agent/chat-recap";
import { normalizeProjectAgentModelSelector } from "@/lib/project-agent/model-selector";

const final = JSON.stringify({ action: "final", answer: "done", files: [] });
const lost = () => Object.assign(new Error('Model step failed (404: {"code":"not_found","message":"Conversation Not Exists.","status":404})'), { status: 404 });
const base = { chatId: "pat_aaaaaaaaaaaa", user: "u", query: "FIRST QUERY" };

describe("model selector", () => {
	it("resolves picker ids and drops unknown values", () => {
		expect(normalizeProjectAgentModelSelector("claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
		expect(normalizeProjectAgentModelSelector("openai/gpt-5.6-luna")).toBe("openai/gpt-5.6-luna");
		expect(normalizeProjectAgentModelSelector("qwen3.7-flash")).toBe("qwen/qwen3.7-flash");
		expect(normalizeProjectAgentModelSelector("gemini 3.7 flash")).toBeUndefined();
		expect(normalizeProjectAgentModelSelector("")).toBeUndefined();
		expect(normalizeProjectAgentModelSelector(42)).toBeUndefined();
	});
});

describe("callRuntimeModel request", () => {
	afterEach(() => vi.unstubAllGlobals());
	it("sends model_selector in the start inputs, empty for the default", async () => {
		const { callRuntimeModel } = await vi.importActual<typeof import("@/lib/project-agent/runtime/model")>("@/lib/project-agent/runtime/model");
		vi.stubEnv("PROJECT_AGENT_RUNTIME_DIFY_API_URL", "http://dify.test/v1");
		vi.stubEnv("PROJECT_AGENT_RUNTIME_DIFY_API_KEY", "k");
		const fetchMock = vi.fn(async () => new Response('data: {"event":"message","answer":"hi","conversation_id":"c1"}\n\n', { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		await callRuntimeModel({ query: "q", user: "u", modelSelector: "openai/gpt-5.6-luna" });
		await callRuntimeModel({ query: "q", user: "u" });
		const bodies = fetchMock.mock.calls.map((call) => JSON.parse((call as unknown as [string, { body: string }])[1].body));
		expect(bodies[0].inputs).toEqual({ model_selector: "openai/gpt-5.6-luna" });
		expect(bodies[1].inputs).toEqual({ model_selector: "" });
		vi.unstubAllEnvs();
	});
});

describe("runRuntimeAgent", () => {
	beforeEach(() => { mocks.callModel.mockReset(); });

	it("passes the selector to every model call and records it in the metrics line", async () => {
		mocks.callModel.mockResolvedValue({ answer: final, conversationId: "d1" });
		const steps: string[] = [];
		await runRuntimeAgent({ ...base, modelSelector: "qwen/qwen3.7-flash", onStep: (step) => steps.push(`${step.tool} ${step.detail}`) });
		expect(mocks.callModel.mock.calls[0][0].modelSelector).toBe("qwen/qwen3.7-flash");
		expect(steps.find((line) => line.startsWith("metrics"))).toContain("model=qwen/qwen3.7-flash");
	});

	it("records the default model when none is chosen", async () => {
		mocks.callModel.mockResolvedValue({ answer: final });
		const steps: string[] = [];
		await runRuntimeAgent({ ...base, onStep: (step) => steps.push(`${step.tool} ${step.detail}`) });
		expect(steps.find((line) => line.startsWith("metrics"))).toContain("model=default");
	});

	it("restarts once in a new conversation, briefed with the chat, when the old one is gone", async () => {
		mocks.callModel.mockRejectedValueOnce(lost()).mockResolvedValueOnce({ answer: final, conversationId: "d2" });
		const onConversation = vi.fn();
		const reply = await runRuntimeAgent({ ...base, conversationId: "stale", modelSelector: "openai/gpt-5.6-luna", recoverChatContext: async () => "User: hi\nYou: hello", onConversation });
		const [first, second] = mocks.callModel.mock.calls.map((call) => call[0]);
		expect(first.conversationId).toBe("stale");
		expect(second.conversationId).toBeUndefined();
		expect(second.modelSelector).toBe("openai/gpt-5.6-luna");
		expect(second.query).toContain("FIRST QUERY");
		expect(second.query).toContain("<chat_recap>\nUser: hi\nYou: hello\n</chat_recap>");
		expect(onConversation).toHaveBeenCalledWith("d2");
		expect(reply.conversationId).toBe("d2");
	});

	it("does not retry when the run had no conversation", async () => {
		mocks.callModel.mockImplementation(async () => { throw lost(); });
		await expect(runRuntimeAgent({ ...base })).rejects.toThrow(/Conversation Not Exists/);
		expect(mocks.callModel).toHaveBeenCalledTimes(1);
	});

	it("does not retry other errors", async () => {
		mocks.callModel.mockImplementation(async () => { throw Object.assign(new Error("Model step failed (500: boom)"), { status: 500 }); });
		await expect(runRuntimeAgent({ ...base, conversationId: "c" })).rejects.toThrow(/boom/);
		expect(mocks.callModel).toHaveBeenCalledTimes(1);
	});

	it("restarts only once", async () => {
		mocks.callModel.mockImplementation(async () => { throw lost(); });
		await expect(runRuntimeAgent({ ...base, conversationId: "c" })).rejects.toThrow(/Conversation Not Exists/);
		expect(mocks.callModel).toHaveBeenCalledTimes(2);
	});

	it("still restarts when building the recap fails", async () => {
		mocks.callModel.mockRejectedValueOnce(lost()).mockResolvedValueOnce({ answer: final, conversationId: "d3" });
		await runRuntimeAgent({ ...base, conversationId: "stale", recoverChatContext: async () => { throw new Error("db down"); } });
		expect(mocks.callModel.mock.calls[1][0].query).toContain("APP ACTION TRANSPORT");
		expect(mocks.callModel.mock.calls[1][0].query).toContain("FIRST QUERY");
	});
});

describe("isConversationLostError", () => {
	it("matches only a 404 about the conversation", () => {
		expect(isConversationLostError(lost())).toBe(true);
		expect(isConversationLostError(Object.assign(new Error("Model step failed (404: Conversation Not Exists.)"), { status: 500 }))).toBe(false);
		expect(isConversationLostError(Object.assign(new Error("Model step failed (404: route not found)"), { status: 404 }))).toBe(false);
	});
});

describe("buildChatRecap", () => {
	const turn = (id: string, createdAt: string, extra = {}) => ({ id, projectId: "p", ownerEmail: "a@b.c", conversationId: "c1", status: "done", createdAt, prompt: `prompt ${id}`, resultText: `result ${id}`, ...extra });
	it("lists earlier finished turns of this chat oldest first", async () => {
		mocks.list.mockResolvedValue([turn("t3", "2026-01-03", { userPrompt: "ask <3>" }), turn("t2", "2026-01-02", { files: [{ name: "a.docx" }] }), turn("other", "2026-01-02", { conversationId: "c2" }), turn("cur", "2026-01-04"), turn("fail", "2026-01-01", { status: "failed" })]);
		const recap = await buildChatRecap({ id: "cur", projectId: "p", ownerEmail: "a@b.c", conversationId: "c1" });
		expect(recap).toBe("User: prompt t2\nYou: result t2\nFiles made: a.docx\n\nUser: ask &lt;3&gt;\nYou: result t3");
	});
	it("is empty for a chat without a thread id", async () => {
		expect(await buildChatRecap({ id: "cur", projectId: "p", ownerEmail: "a@b.c" })).toBe("");
	});
});
