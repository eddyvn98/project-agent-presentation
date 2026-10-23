import { expect, it, vi } from "vitest";
vi.mock("../../lib/project-agent/dify-input-files", () => ({ uploadProjectAgentReviewFile: vi.fn() }));
vi.mock("../../lib/project-agent/project-skills", () => ({ parseProjectSkillReadRequests: () => [], stripProjectSkillReadRequests: (s: string) => s }));
vi.mock("../../lib/project-agent/large-source-reader", () => ({
  parseProjectSourceReadRequests: (s: string) => s === "READ" ? [{ fileId: "kf-one", kind: "lines", start: 1, end: 3 }] : [],
  stripProjectSourceReadRequests: (s: string) => s,
  readProjectSourceExcerpt: vi.fn(async () => ({ name: "revenue.csv", fileId: "kf-one", text: "week1=24; week2=27" })),
}));
import { fulfillLargeProjectSourceRequests } from "../../lib/project-agent/large-source-agent-loop";

it("carries the original task into a memoryless source-read continuation", async () => {
  const wire: string[] = [];
  const result = await fulfillLargeProjectSourceRequests({
    message: { answer: "READ", conversationId: "dify-1", inlineFiles: [] },
    files: [{ id: "kf-one", name: "revenue.csv", isLargeSource: true, status: "ready" }] as never,
    user: "user", ownerEmail: "user@example.test", projectId: "p1", endpoint: "https://dify.test/v1/chat-messages", apiKey: "key",
    originalTask: "Compare revenue from week 1 to week 2 and report the increase",
    continueDify: async ({ query }) => {
      wire.push(query);
      expect(query).toContain("week1=24; week2=27");
      expect(query).toContain("Compare revenue from week 1 to week 2");
      return { answer: "Revenue increased by 3 million", conversationId: "dify-1", inlineFiles: [] };
    },
  });
  expect(wire).toHaveLength(1);
  expect(result.answer).toBe("Revenue increased by 3 million");
});
