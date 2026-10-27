import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ model: vi.fn(), checkpoint: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/model", () => ({ callRuntimeModel: mocks.model }));
vi.mock("../../lib/project-agent/runtime/context-checkpoint", () => ({
  readContextCheckpoint: mocks.checkpoint,
}));
import { COMPACT_AT_PROMPT_TOKENS, compactConversation } from "../../lib/project-agent/runtime/compact";

describe("L2: compacted runtime continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.model.mockResolvedValue({ answer: "Plan agreed: BLUE. Saved file /work/report.md." });
    mocks.checkpoint.mockResolvedValue("<app_context_checkpoint>file saved and verified</app_context_checkpoint>");
  });
  it("restarts from model summary plus app-observed checkpoint without losing the original task", async () => {
    const next = await compactConversation({
      firstQuery: "Generate the report and keep current design",
      user: "owner@example.test", conversationId: "model-old",
      modelSelector: "model-for-test", projectId: "project-a",
      chatId: "thread-a", taskId: "task-a",
    });
    expect(COMPACT_AT_PROMPT_TOKENS).toBeGreaterThanOrEqual(50_000);
    expect(next).toContain("Generate the report");
    expect(next).toContain("Plan agreed: BLUE");
    expect(next).toContain("/work/report.md");
    expect(next).toContain("file saved and verified");
    expect(next).toContain("Continue from the next step");
    expect(mocks.model).toHaveBeenCalledWith(expect.objectContaining({
      user: "owner@example.test", conversationId: "model-old",
      modelSelector: "model-for-test",
    }));
    expect(mocks.checkpoint).toHaveBeenCalledWith({
      projectId: "project-a", chatId: "thread-a",
    }, "task-a");
  });
  it("bounds overly long summaries and leaves missing checkpoint optional", async () => {
    mocks.model.mockResolvedValue({ answer: "X".repeat(20_000) });
    mocks.checkpoint.mockResolvedValue("");
    const next = await compactConversation({
      firstQuery: "Continue task", user: "user", conversationId: "old",
    });
    expect(next).toContain("X".repeat(6_000));
    expect(next).not.toContain("X".repeat(6_001));
    expect(next).not.toContain("<app_context_checkpoint>");
  });
});
