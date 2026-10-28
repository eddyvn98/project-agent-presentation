import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  read: vi.fn(), update: vi.fn(), access: vi.fn(), start: vi.fn(),
  terminal: vi.fn(), cancelTurns: vi.fn(), reflect: vi.fn(),
  conversation: vi.fn(), runtimeEnabled: vi.fn(), compact: vi.fn(),
  log: vi.fn(), project: vi.fn(),
}));
vi.mock("../../lib/project-agent/task-store", () => ({
  readProjectAgentTask: m.read, updateProjectAgentTask: m.update,
  recordGuardedTerminalTask: m.log,
}));
vi.mock("@/lib/capabilities/project", () => ({ getProjectAccess: m.access,
  getProject: m.project }));
vi.mock("../../lib/project-agent/task-terminal-guard", () => ({
  markTaskRunningIfQueued: m.start,
  commitTaskTerminalIfActive: m.terminal,
}));
vi.mock("../../lib/project-agent/runtime/workspace-direct", () => ({
  cancelTaskWorkspaceTurns: m.cancelTurns,
}));
vi.mock("../../lib/project-agent/learning/reflect", () => ({ reflectOnTask: m.reflect }));
vi.mock("../../lib/project-agent/conversation", () => ({
  resolveDifyConversationId: m.conversation,
}));
vi.mock("../../lib/project-agent/runtime/run-agent", () => ({
  isRuntimeEnabled: m.runtimeEnabled, runRuntimeAgent: vi.fn(),
}));
vi.mock("../../lib/project-agent/auto-compact", () => ({ autoCompactIfNeeded: m.compact }));
vi.mock("../../lib/project-agent/visual-review", () => ({
  buildVisualReviewContactSheet: vi.fn(), renderProjectAgentFile: vi.fn(),
}));
vi.mock("../../lib/project-agent/deliverable-review", () => ({
  buildVisualReviewFiles: vi.fn(), buildVisualReviewQuery: vi.fn(),
  getReviewDecision: vi.fn(),
}));
vi.mock("../../lib/project-agent/reference-review", () => ({
  buildReferenceReview: vi.fn(),
}));
vi.mock("../../lib/project-agent/deterministic-review", () => ({
  buildLintFixQuery: vi.fn(), lintDeliverables: vi.fn(),
  uploadLintSheets: vi.fn(), MAX_LOCAL_FIX_ROUNDS: 2,
}));
// Keep startup/Stop tests focused on the real Dify orchestrator without
// loading optional Office, PDF, search, model or storage implementations.
vi.mock("../../lib/project-agent/auto-skills/worker", () => ({
  reconcileAutoSkillSources: vi.fn(),
}));
vi.mock("../../lib/project-agent/auto-skills/context", () => ({
  loadAutoSkillSet: vi.fn(),
}));
vi.mock("../../lib/project-agent/files", () => ({
  cacheDifyGeneratedFiles: vi.fn(), findDifyGeneratedFileLinks: vi.fn(), hasUnreachableDifySandboxFileLink: vi.fn(),
}));
vi.mock("../../lib/project-agent/dify-input-files", () => ({
  uploadProjectAgentTaskInputFiles: vi.fn(), uploadProjectKnowledgeFiles: vi.fn(),
}));
vi.mock("../../lib/project-agent/intent", () => ({
  requiresProjectAgentFileOutput: vi.fn(),
}));
vi.mock("../../lib/project-agent/input-file-context", () => ({
  buildProjectAgentInputReadback: vi.fn(),
}));
vi.mock("../../lib/project-agent/dify-stream", () => ({
  readDifyAgentMessage: vi.fn(), readDifyAgentAnswer: vi.fn(),
}));
vi.mock("../../lib/project-agent/dify-query", () => ({
  buildProjectAgentQuery: vi.fn(), getProjectAgentKnowledgeText: vi.fn(),
  PROJECT_AGENT_DELIVERABLE_QUALITY_GATE: "synthetic",
}));
vi.mock("../../lib/project-agent/large-source-agent-loop", () => ({
  fulfillLargeProjectSourceRequests: vi.fn(),
}));
vi.mock("../../lib/project-agent/large-source-reader", () => ({
  stripProjectSourceReadRequests: vi.fn(),
}));
vi.mock("../../lib/project-agent/project-chat-context", () => ({
  loadDefaultMemoryContext: vi.fn(), loadProjectChatContext: vi.fn(),
}));
vi.mock("../../lib/project-agent/task-context", () => ({
  loadProjectAgentTaskContext: vi.fn(),
}));
vi.mock("../../lib/project-agent/memory-coordination", () => ({
  coordinateMemorySources: vi.fn(),
}));
vi.mock("../../lib/project-agent/chat-recap", () => ({
  buildChatRecap: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/usage-pricing", () => ({
  routeModelSelector: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/g1-goal-check", () => ({
  isG1QaTask: vi.fn(), formatG1Receipt: vi.fn(),
}));
vi.mock("../../lib/project-agent/dify-calculator-bridge", () => ({
  callDifyWithCalculator: vi.fn(),
}));
vi.mock("../../lib/project-agent/retry-context", () => ({
  retryContext: vi.fn(),
}));
vi.mock("../../lib/project-agent/agent-sources", () => ({
  extractAgentSideEffects: vi.fn(), hideAgentTags: vi.fn(), describeTaskWork: vi.fn(), loadRunbookPrompt: vi.fn(), removeAgentWebSources: vi.fn(), saveAgentWebSources: vi.fn(), saveRunbookNotes: vi.fn(), saveTaskWorkLog: vi.fn(),
}));
vi.mock("../../lib/project-agent/project-skills", () => ({
  loadProjectSkillSet: vi.fn(), stripProjectSkillReadRequests: vi.fn(),
}));
vi.mock("../../lib/project-agent/personal-agent-memory", () => ({
  personalMemoryPrompt: vi.fn(),
}));
vi.mock("../../lib/project-agent/personal-agent-skills", () => ({
  personalSkillsPrompt: vi.fn(),
}));
vi.mock("../../lib/project-agent/harness-lab/attach", () => ({
  attachHarnessToQuery: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/policy", () => ({
  redactSecrets: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/workspace-direct-apply", () => ({
  newDirectState: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/workspace-task-progress", () => ({
  workspaceSaveReporter: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/prepare", () => ({
  describeWorkspace: vi.fn(),
}));
vi.mock("../../lib/project-agent/runtime/stage", () => ({
  stageInputs: vi.fn(),
}));
vi.mock("../../lib/project-agent/rich-files", () => ({
  hideRichFileBlocks: vi.fn(), stripUnverifiedDisclaimers: vi.fn(),
}));
vi.mock("../../lib/project-agent/learning/global-lessons", () => ({
  lessonsForTask: vi.fn(), lessonsPrompt: vi.fn(), recordLessonCandidates: vi.fn(),
}));
vi.mock("../../lib/project-agent/hindsight/memory", () => ({
  retainProjectHindsight: vi.fn(),
}));
vi.mock("../../lib/project-agent/xerj/agent-context", () => ({
  loadAgentSearchContext: vi.fn(),
}));
vi.mock("../../lib/project-agent/boot", () => ({ PROJECT_AGENT_BOOT_ID: "qa-boot" }));
import { getEndpoint, isProjectAgentDifyConfigured, projectAgentDifyUser,
  runProjectAgentTask } from "../../lib/project-agent/dify-agent";
const id = "pat_012345abcdef";
const task = { id, projectId: "qa-project", ownerEmail: "owner@example.test",
  prompt: "Synthetic request", userPrompt: "Synthetic request",
  status: "queued", files: [], cancelled: false };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PROJECT_AGENT_DIFY_API_URL", "https://dify.example.test/v1");
  vi.stubEnv("PROJECT_AGENT_DIFY_API_KEY", "synthetic-only");
  m.read.mockResolvedValue({ ...task });
  m.update.mockResolvedValue({ ...task });
  m.runtimeEnabled.mockReturnValue(false);
  m.conversation.mockResolvedValue(undefined);
  m.access.mockResolvedValue(null);
  m.terminal.mockResolvedValue(true);
  m.cancelTurns.mockResolvedValue(undefined);
  m.reflect.mockResolvedValue(undefined);
  m.log.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("Dify orchestration startup, owner and terminal fencing", () => {
  it("scopes provider identity across projects and owners", () => {
    expect(projectAgentDifyUser(" OWNER@EXAMPLE.TEST ", "project"))
      .toBe(projectAgentDifyUser("owner@example.test", "project"));
    expect(projectAgentDifyUser("owner@example.test", "a"))
      .not.toBe(projectAgentDifyUser("owner@example.test", "b"));
    expect(projectAgentDifyUser("a@example.test", "project"))
      .not.toBe(projectAgentDifyUser("b@example.test", "project"));
  });
  it("normalizes endpoint and fails closed without provider configuration", () => {
    expect(getEndpoint()).toBe("https://dify.example.test/v1/chat-messages");
    expect(isProjectAgentDifyConfigured()).toBe(true);
    vi.stubEnv("PROJECT_AGENT_DIFY_API_URL", "");
    expect(isProjectAgentDifyConfigured()).toBe(false);
    expect(() => getEndpoint()).toThrow(/not configured/);
  });
  it("never runs an unknown task", async () => {
    m.read.mockResolvedValueOnce(null);
    await expect(runProjectAgentTask(id)).rejects.toThrow(/task not found/i);
    expect(m.access).not.toHaveBeenCalled();
    expect(m.terminal).not.toHaveBeenCalled();
  });
  it("returns a failed terminal task without sending data when API key is absent", async () => {
    vi.stubEnv("PROJECT_AGENT_DIFY_API_KEY", "");
    m.read.mockResolvedValueOnce({ ...task }).mockResolvedValueOnce({
      ...task, status: "failed", error: "API key is not configured",
    });
    const result = await runProjectAgentTask(id);
    expect(result.status).toBe("failed");
    expect(m.terminal).toHaveBeenCalledWith(expect.objectContaining({ id }),
      "failed", expect.objectContaining({ error: expect.stringMatching(/API_KEY/) }));
    expect(m.access).not.toHaveBeenCalled();
    expect(m.cancelTurns).toHaveBeenCalledWith(id);
  });
  it("terminates when Project access was removed before starting", async () => {
    m.read.mockResolvedValueOnce({ ...task }).mockResolvedValueOnce({
      ...task, status: "failed",
    });
    const result = await runProjectAgentTask(id);
    expect(result.status).toBe("failed");
    expect(m.start).not.toHaveBeenCalled();
    expect(m.terminal).toHaveBeenCalledWith(expect.objectContaining({ id }),
      "failed", expect.objectContaining({ error: expect.stringMatching(/access was removed/) }));
    expect(m.cancelTurns).toHaveBeenCalledWith(id);
  });
  it("preserves an already-stopped task if guarded terminal CAS loses", async () => {
    m.terminal.mockResolvedValueOnce(false);
    m.read.mockResolvedValueOnce({ ...task }).mockResolvedValueOnce({
      ...task, cancelled: true, status: "failed", error: "Stopped",
    });
    const result = await runProjectAgentTask(id);
    expect(result.cancelled).toBe(true);
    expect(m.log).not.toHaveBeenCalled();
    expect(m.reflect).not.toHaveBeenCalled();
    expect(m.cancelTurns).toHaveBeenCalledWith(id);
  });
});
