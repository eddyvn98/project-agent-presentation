import { beforeEach, expect, it, vi } from "vitest";
const model = vi.hoisted(() => vi.fn());
// Isolate the real agent loop/parser/calculator from external services and file execution.
vi.mock("../../lib/project-agent/runtime/model", () => ({ callRuntimeModel: model, isConversationLostError: () => false, uploadRuntimeImage: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/steer", () => ({ takeSteerNotes: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/compact", () => ({ COMPACT_AT_PROMPT_TOKENS: 1000000, compactConversation: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/library", () => ({ saveScriptsOut: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/image-module", () => ({ generateImages: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/evaluator", () => ({ DeliverableEvaluator: class { async check() { return null; } } }));
vi.mock("../../lib/project-agent/runtime/web-fetch", () => ({ webFetch: vi.fn() }));
vi.mock("../../lib/project-agent/task-store", () => ({ writeProjectAgentFile: vi.fn() }));
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
import { runRuntimeAgent } from "../../lib/project-agent/runtime/run-agent";
import { execInSandbox } from "../../lib/project-agent/runtime/sandbox";
const input = { chatId: "synthetic-calc", user: "synthetic", query: "Compute supplied synthetic costs", conversationId: "synthetic-chat", depth: 1, maxSteps: 4 };
const reply = (answer: string) => ({ answer, conversationId: "synthetic-chat", promptTokens: 100 });
beforeEach(() => vi.clearAllMocks());

it("dispatches calculate, returns exact evidence to the next model round, then allows final", async () => {
  model.mockResolvedValueOnce(reply('{"action":"calculate","expression":"ceil(72000000/(47000*26))*26*47000-72000000"}'));
  model.mockImplementationOnce(async ({ query }) => {
    expect(JSON.parse(query)).toMatchObject({ exact: "98000", scope: expect.stringContaining("Arithmetic only") });
    return reply('{"action":"final","answer":"98,000 VND surplus","files":[]}');
  });
  const onStep = vi.fn();
  const result = await runRuntimeAgent({ ...input, onStep });
  expect(result.answer).toBe("98,000 VND surplus");
  expect(onStep).toHaveBeenCalledWith(expect.objectContaining({ tool: "calculate" }));
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
