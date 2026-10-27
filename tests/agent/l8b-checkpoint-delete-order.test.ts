import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ clean: vi.fn(), deleteRows: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/context-output-store", () => ({
  deleteContextScope: mock.clean,
}));
vi.mock("@/services/mongodb/projectAgentTasks.repo", () => ({
  deleteProjectAgentConversation: mock.deleteRows,
  findProjectAgentTaskByWorkspaceTurn: vi.fn(),
}));
import { deleteProjectAgentConversation } from "../../lib/project-agent/task-store";

const scope = { conversationId: "chat-qa" };
describe("L8B checkpoint cleanup is a required delete prerequisite", () => {
  beforeEach(() => {
    mock.clean.mockReset().mockResolvedValue(undefined);
    mock.deleteRows.mockReset().mockResolvedValue([]);
  });
  it("does not delete Mongo task rows if shared checkpoint cleanup fails", async () => {
    mock.clean.mockRejectedValue(new Error("Mongo unavailable"));
    await expect(deleteProjectAgentConversation("project-qa", "owner@test.example", scope))
      .rejects.toThrow("Mongo unavailable");
    expect(mock.deleteRows).not.toHaveBeenCalled();
  });
  it("removes shared checkpoint before Mongo chat rows", async () => {
    await deleteProjectAgentConversation("project-qa", "owner@test.example", scope);
    expect(mock.clean).toHaveBeenCalledWith({ projectId: "project-qa", chatId: "chat-qa" });
    expect(mock.deleteRows).toHaveBeenCalledTimes(1);
    expect(mock.clean.mock.invocationCallOrder[0])
      .toBeLessThan(mock.deleteRows.mock.invocationCallOrder[0]);
  });
});
