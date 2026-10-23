import { expect, it } from "vitest";
import { PROJECT_AGENT_PROMPT_MAX_CHARS, validateProjectAgentRequest } from "../../lib/project-agent/request-validation";
it.each([null, [], "text", {}, { prompt: 123 }, { prompt: " " }, { prompt: "ok", conversationId: {} }, { prompt: "ok", retryOfTaskId: " " }, { prompt: "ok", goal: [] }, { prompt: "ok", goal: { objective: "" } }, { prompt: "ok", goal: { objective: "test", condition: false } }])("rejects malformed task input %j", (body) => {
  expect(validateProjectAgentRequest(body)?.status).toBe(400);
});
it("bounds provider and displayed prompts independently", () => {
  expect(validateProjectAgentRequest({ prompt: "a".repeat(PROJECT_AGENT_PROMPT_MAX_CHARS) })).toBeNull();
  expect(validateProjectAgentRequest({ prompt: "a".repeat(PROJECT_AGENT_PROMPT_MAX_CHARS + 1) })?.status).toBe(413);
  expect(validateProjectAgentRequest({ prompt: "ok", userPrompt: "a".repeat(12001) })?.status).toBe(413);
  expect(validateProjectAgentRequest({ prompt: "ok", goal: { objective: "a".repeat(12001) } })?.status).toBe(413);
});
