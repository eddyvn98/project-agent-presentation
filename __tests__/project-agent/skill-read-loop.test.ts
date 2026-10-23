import { describe, expect, it, vi } from "vitest";
import { fulfillLargeProjectSourceRequests } from "@/lib/project-agent/large-source-agent-loop";

describe("skill reads in the agent loop", () => {
	it("feeds the skill text back to Dify and returns the final answer", async () => {
		const readSkill = vi.fn(async () => "[Skill: Aurora]\nCodeword ZEBRA-4417");
		const continueDify = vi.fn(async () => ({ answer: "The codeword is ZEBRA-4417.", conversationId: "c1" }));
		const result = await fulfillLargeProjectSourceRequests({
			message: { answer: '<project_skill_read>{"skillId":"s1"}</project_skill_read>', conversationId: "c1" },
			files: [], user: "u", ownerEmail: "user@example.com", projectId: "p1", endpoint: "e", apiKey: "k", readSkill, continueDify,
		});
		expect(readSkill).toHaveBeenCalledWith({ skillId: "s1", file: undefined });
		expect(continueDify.mock.calls[0][0].query).toContain("ZEBRA-4417");
		expect(result.answer).toBe("The codeword is ZEBRA-4417.");
	});
});
