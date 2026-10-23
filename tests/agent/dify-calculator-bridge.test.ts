import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/rich-files", () => ({
  extractRichFileSpecs: (answer: string) => ({ text: answer, specs: [] }),
  buildRichFiles: vi.fn(), stripUnverifiedDisclaimers: (text: string) => text,
}));
vi.mock("../../lib/project-agent/edit-files", () => ({ applyEditSpec: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ readProjectAgentTaskInputFile: vi.fn() }));
import { callDifyWithCalculator } from "../../lib/project-agent/dify-calculator-bridge";

const base = { endpoint: "https://dify.test/v1/chat-messages", apiKey: "test", user: "user-1", query: "Original task with values 59, 26, 47000 and 72000000", originalRequest: "Calculate break-even surplus", files: [], calculatorEnabled: true };
const event = (value: Record<string, unknown>) => `data: ${JSON.stringify(value)}\n\n`;
const response = (...events: Record<string, unknown>[]) => new Response(events.map(event).join(""), { headers: { "Content-Type": "text/event-stream" } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("executes app calculator and returns real exact result through memoryless HTTP/SSE", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const activity: string[] = [];
  const partial: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (requests.length === 1) return response(
      { event: "agent_message", answer: "<app_calculate>", conversation_id: "dify-1" },
      { event: "agent_message", answer: '{"id":"c1","expression":"59*26*47000-72000000"}</app_calculate>' },
    );
    expect(body.query).toContain("<app_calculate_results>");
    expect(body.query).toContain("Calculate break-even surplus");
    const receipt = JSON.parse(body.query.match(/<app_calculate_results>\n([\s\S]*?)\n<\/app_calculate_results>/)![1])[0];
    expect(JSON.parse(receipt.output).exact).toBe("98000");
    return response({ event: "message", answer: "The surplus is 98000 VND.", conversation_id: "dify-1" });
  }));
  const result = await callDifyWithCalculator({ ...base, onPartial: (text) => partial.push(text), onBridgeEvent: (tool, detail) => activity.push(`${tool} :: ${detail}`) });
  expect(result.answer).toBe("The surplus is 98000 VND.");
  expect(requests).toHaveLength(2);
  expect(requests.every((body) => body.user === "user-1")).toBe(true);
  expect(requests[1].conversation_id).toBe("dify-1");
  expect(requests[1].files).toEqual([]);
  expect(activity).toEqual([expect.stringContaining("calculate :: Exact result: 98000")]);
  expect(partial.join(" ")).not.toContain("<app_calculate>");
});

it("preserves ordinary SSE text, tool thoughts and inline Office files without another call", async () => {
  const seen: string[] = [];
  const f = vi.fn(async () => response(
    { event: "agent_thought", id: "thought-1", tool: "md_to_pptx", tool_input: '{"output_filename":"deck.pptx"}', observation: "blob=b'PK\\x03\\x04slide'" },
    { event: "agent_message", answer: "Created ", conversation_id: "dify-2" },
    { event: "agent_message", answer: "deck.", conversation_id: "dify-2" },
  ));
  vi.stubGlobal("fetch", f);
  const result = await callDifyWithCalculator({ ...base, onPartial: (text) => seen.push(text) });
  expect(result.answer).toBe("Created deck.");
  expect(result.inlineFiles.map((file) => file.name)).toEqual(["deck.pptx"]);
  expect([...result.inlineFiles[0].bytes.slice(0, 2)]).toEqual([80, 75]);
  expect(seen.at(-1)).toBe("Created deck.");
  expect(f).toHaveBeenCalledTimes(1);
});

it("does not dispatch when code tools are disabled", async () => {
  const events = vi.fn();
  const f = vi.fn(async () => response({ event: "message", answer: '<app_calculate>{"id":"c1","expression":"1+2"}</app_calculate>' }));
  vi.stubGlobal("fetch", f);
  const result = await callDifyWithCalculator({ ...base, calculatorEnabled: false, onBridgeEvent: events });
  expect(result.answer).toContain("disabled");
  expect(f).toHaveBeenCalledTimes(1);
  expect(events).not.toHaveBeenCalled();
});

it("stops repeated actions rather than computing forever", async () => {
  const f = vi.fn(async () => response({ event: "message", answer: '<app_calculate>{"id":"c1","expression":"1+2"}</app_calculate>', conversation_id: "loop" }));
  vi.stubGlobal("fetch", f);
  const activity = vi.fn();
  const result = await callDifyWithCalculator({ ...base, onBridgeEvent: activity });
  expect(result.answer).toContain("repeated expression");
  expect(f).toHaveBeenCalledTimes(2);
  expect(activity.mock.calls.filter((call) => call[0] === "calculate")).toHaveLength(1);
});

it("caps distinct calculations at four with no fifth execution", async () => {
  let index = 0;
  vi.stubGlobal("fetch", vi.fn(async () => response({ event: "message", answer: `<app_calculate>{"id":"c${++index}","expression":"${index}+2"}</app_calculate>`, conversation_id: "many" })));
  const activity = vi.fn();
  const result = await callDifyWithCalculator({ ...base, onBridgeEvent: activity });
  expect(result.answer).toContain("limit of 4 calculations");
  expect(index).toBe(5);
  expect(activity.mock.calls.filter((call) => call[0] === "calculate")).toHaveLength(4);
});

it("rejects malformed actions and an already-aborted task without running a calculator", async () => {
  const f = vi.fn(async () => response({ event: "message", answer: '<app_calculate>{"id":"c1","expression":"1+2","command":"whoami"}</app_calculate>' }));
  vi.stubGlobal("fetch", f);
  expect((await callDifyWithCalculator(base)).answer).toContain("invalid");
  const controller = new AbortController(); controller.abort();
  await expect(callDifyWithCalculator({ ...base, signal: controller.signal })).rejects.toBeDefined();
  expect(f).toHaveBeenCalledTimes(1);
});
