import { describe, expect, it } from "vitest";
import { ANTHROPIC_FAST_SELECTOR, modelFamily, subAgentSelector } from "@/lib/project-agent/runtime/sub-agent-model";
import { parseRuntimeAction } from "@/lib/project-agent/runtime/actions";

describe("sub-agent model routing", () => {
	it("defaults workers to the fast model of the lead's family", () => {
		expect(subAgentSelector(undefined, undefined, "worker")).toBe(ANTHROPIC_FAST_SELECTOR);
		expect(subAgentSelector("anthropic/claude-opus-5", undefined, "worker")).toBe(ANTHROPIC_FAST_SELECTOR);
		expect(subAgentSelector("openai/gpt-5.6-sol", undefined, "worker")).toBe("openai/gpt-5.6-luna");
		expect(subAgentSelector("qwen/qwen3.8-max", undefined, "worker")).toBe("qwen/qwen3.7-flash");
	});

	it("keeps a lead that is already the fast model", () => {
		expect(subAgentSelector("openai/gpt-5.6-luna", "fast", "worker")).toBe("openai/gpt-5.6-luna");
		expect(subAgentSelector("qwen/qwen3.7-flash", undefined, "worker")).toBe("qwen/qwen3.7-flash");
	});

	it("defaults reviewers to another family", () => {
		expect(modelFamily(subAgentSelector(undefined, undefined, "reviewer"))).toBe("openai");
		expect(subAgentSelector("openai/gpt-5.6-terra", undefined, "reviewer")).not.toMatch(/^openai\//);
		expect(modelFamily(subAgentSelector("moonshotai/kimi-k3", "other", "worker"))).not.toBe("other");
	});

	it("runs on the lead's own model when asked", () => {
		expect(subAgentSelector("anthropic/claude-opus-5", "same", "worker")).toBe("anthropic/claude-opus-5");
		expect(subAgentSelector(undefined, "same", "reviewer")).toBeUndefined();
	});

	it("parses the model tier on delegate and ignores unknown values", () => {
		expect(parseRuntimeAction('{"action":"delegate","task":"read a.pdf","model":"same"}')).toMatchObject({ model: "same" });
		expect(parseRuntimeAction('{"action":"delegate","task":"read a.pdf","model":"gpt-9"}')).toMatchObject({ model: undefined });
	});
});
