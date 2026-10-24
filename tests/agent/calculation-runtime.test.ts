import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/dify-input-files", () => ({ uploadProjectAgentReviewFile: vi.fn() }));
const model = vi.hoisted(() => vi.fn());
// Isolate the real agent loop/parser/calculator from external services and file execution.
vi.mock("../../lib/project-agent/runtime/model", () => ({ callRuntimeModel: model, isConversationLostError: () => false, uploadRuntimeImage: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/steer", () => ({ takeSteerNotes: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/compact", () => ({ COMPACT_AT_PROMPT_TOKENS: 1000000, compactConversation: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/library", () => ({ saveScriptsOut: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/image-module", () => ({ generateImages: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/evaluator", () => ({ DeliverableEvaluator: class { async check() { return null; } } }));
vi.mock("../../lib/project-agent/runtime/web-fetch", () => ({ webFetch: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ writeProjectAgentFile: vi.fn(), readProjectAgentFile: vi.fn() }));
vi.mock("../../lib/project-agent/files", () => ({ inferProjectAgentFileMetadata: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/web-search", () => ({ webSearch: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/workspace-engine", () => ({ workspaceRead: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/workspace-direct", () => ({ initialWorkspacePrompt: async () => "", runDirectWorkspace: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/input-photos", () => ({ inputPhotoSheets: async () => null }));
vi.mock("../../lib/project-agent/runtime/workspace-direct-apply", () => ({ newDirectState: () => ({}) }));
vi.mock("../../lib/project-agent/runtime/sub-agent", () => ({ delegateToSubAgent: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/outputs", () => ({ newOutputFiles: async () => [], storeWorkbookValues: vi.fn(), checkHtmlPage: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/large-output", () => ({ isLargePdfOutput: vi.fn(), storeLargePdfOutput: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/render-action", () => ({ render: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/sandbox", () => ({ execInSandbox: vi.fn(), resolveWorkspacePath: vi.fn(), workspaceDir: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/reference-action", () => ({ referenceAction: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/pdf-action", () => ({ runPdfForTask: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/plan-action", () => ({ runPlanAction: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/wait-action", () => ({ runWait: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/reference-prefetch", () => ({ prefetchReference: async () => null }));
vi.mock("../../lib/project-agent/runtime/reference-candidates", () => ({ proposeTaskReference: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent", () => ({ runBrowserAction: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/session", () => ({ closeBrowserSession: async () => {} }));
vi.mock("../../lib/project-agent/runtime/table-transcribe", () => ({ transcribeTables: vi.fn() }));
import { taskActivity, toPublicProjectAgentTask } from "../../lib/project-agent/public-task";
import { runRuntimeAgent } from "../../lib/project-agent/runtime/run-agent";
import { execInSandbox } from "../../lib/project-agent/runtime/sandbox";
const input = { chatId: "synthetic-calc", user: "synthetic", query: "Compute supplied synthetic costs", conversationId: "synthetic-chat", depth: 1, maxSteps: 4 };
const reply = (answer: string) => ({ answer, conversationId: "synthetic-chat", promptTokens: 100 });
beforeEach(() => { vi.clearAllMocks(); model.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("dispatches calculate, returns exact evidence to the next model round, then allows final", async () => {
  model.mockResolvedValueOnce(reply('{"action":"calculate","expression":"ceil(72000000/(47000*26))*26*47000-72000000"}'));
  model.mockImplementationOnce(async ({ query }) => {
    const receipts = JSON.parse(query.match(/<app_action_results>\n([\s\S]*?)\n<\/app_action_results>/)[1]);
    expect(JSON.parse(receipts.at(-1).output)).toMatchObject({ exact: "98000", scope: expect.stringContaining("Arithmetic only") });
    return reply('{"action":"final","answer":"98,000 VND surplus","files":[]}');
  });
  const onStep = vi.fn();
  const result = await runRuntimeAgent({ ...input, onStep });
  expect(result.answer).toBe("98,000 VND surplus");
  expect(onStep).toHaveBeenCalledWith(expect.objectContaining({ tool: "calculate", detail: expect.stringContaining("Exact result: 98000") }));
  expect(execInSandbox).not.toHaveBeenCalled();
  expect(model).toHaveBeenCalledTimes(2);
});

it("reports failed calculation and stops the remaining action batch", async () => {
  model.mockResolvedValueOnce(reply('{"action":"calculate","expression":"1/0"}\n{"action":"shell","command":"echo should-not-run"}'));
  model.mockImplementationOnce(async ({ query }) => {
    expect(query).toContain("Division by zero");
    expect(query).toContain("Skipped the remaining 1 action");
    return reply('{"action":"final","answer":"Calculation unavailable; check inputs.","files":[]}');
  });
  await runRuntimeAgent({ ...input });
  expect(execInSandbox).not.toHaveBeenCalled();
});

it("does not certify or rewrite arbitrary final prose", async () => {
  model.mockResolvedValueOnce(reply('{"action":"final","answer":"An unverified model claim.","files":[]}'));
  expect((await runRuntimeAgent({ ...input })).answer).toBe("An unverified model claim.");
  expect(model).toHaveBeenCalledTimes(1);
});

it("carries real SSE wire observations without Dify memory instead of repeating Python/echo until stall", async () => {
  const actual = await vi.importActual<typeof import("../../lib/project-agent/runtime/model")>("../../lib/project-agent/runtime/model");
  model.mockImplementation(actual.callRuntimeModel);
  vi.stubEnv("PROJECT_AGENT_RUNTIME_DIFY_API_URL", "https://dify.example.test/v1");
  vi.stubEnv("PROJECT_AGENT_RUNTIME_DIFY_API_KEY", "synthetic-test-key");
  vi.mocked(execInSandbox).mockResolvedValue({ output: "(no output)", exitCode: 0, timedOut: false });
  const bodies: Array<{ query: string; conversation_id?: string; user: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    const match = body.query.match(/<app_action_results>\n([\s\S]*?)\n<\/app_action_results>/);
    const receipts = match ? JSON.parse(match[1]) : [];
    // This simulated model-step app has NO conversation memory. Bare tool text would trigger echo probes.
    let action = { action: "shell", command: "echo ok" } as Record<string, unknown>;
    if (bodies.length === 1) action = { action: "shell", command: "python3 -c '(59*26*47000)-72000000'" };
    else if (body.query.includes("APP ACTION TRANSPORT") && body.query.includes("Compute supplied synthetic costs")) {
      const calculated = receipts.find((receipt: { action: string }) => receipt.action === "calculate");
      action = calculated
        ? { action: "final", answer: `${JSON.parse(calculated.output).exact} VND from app calculator`, files: [] }
        : { action: "calculate", expression: "59*26*47000-72000000" };
    }
    // Minimal streamed fetch response: jsdom does not guarantee the native Response class.
    const wire = Buffer.from(`data: ${JSON.stringify({ event: "message", answer: JSON.stringify(action), conversation_id: "synthetic-chat" })}\n\ndata: {"event":"message_end"}\n\n`);
    let read = false;
    return { ok: true, status: 200, body: { getReader: () => ({
      read: async () => read ? { done: true, value: undefined } :
        (read = true, { done: false, value: wire }),
    }) } } as unknown as Response;
  }));
  const onStep = vi.fn();
  const result = await runRuntimeAgent({ ...input, maxSteps: 9, onStep });
  expect(result.answer).toBe("98000 VND from app calculator");
  expect(bodies).toHaveLength(3);
  expect(bodies[1].query).toContain("(no output)");
  expect(bodies[1].query).toContain("python3");
  expect(bodies[2].query).toContain("98000");
  expect(bodies.every((body) => body.conversation_id === "synthetic-chat" && body.user === "synthetic")).toBe(true);
  expect(execInSandbox).toHaveBeenCalledTimes(1);
  expect(onStep.mock.calls.some(([step]) => step.tool === "stall_stop")).toBe(false);
  const detail = "Exact result: 98000; expression: 59*26*47000-72000000";
  expect(onStep).toHaveBeenCalledWith({ tool: "calculate", detail });
  // Match the existing task-log format and its 200-character detail limit.
  const log = [`2026-10-23T00:00:00Z using tool calculate :: ${detail.slice(0, 200)}`];
  expect(toPublicProjectAgentTask({ id: "synthetic-task", projectId: "synthetic-project", ownerEmail: "synthetic@example.test", prompt: "Synthetic", status: "running", createdAt: "", updatedAt: "", log }).progress).toContain("Exact result: 98000");
  expect(taskActivity(log)).toMatchObject([
    { label: "Calculated an expression", details: [expect.stringContaining("Exact result: 98000")] },
  ]);
});
