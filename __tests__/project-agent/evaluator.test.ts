import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliverableEvaluator, parseVerdict } from "@/lib/project-agent/runtime/evaluator";
import type { RuntimeInput } from "@/lib/project-agent/runtime/run-agent";

const input = { chatId: "c", user: "u", query: "q", userPrompt: "Make a 3-slide deck in Vietnamese" } as RuntimeInput;

describe("deliverable evaluator", () => {
	beforeEach(() => vi.stubEnv("PROJECT_AGENT_EVALUATOR", "on"));
	afterEach(() => vi.unstubAllEnvs());
	it("parses verdicts and treats unclear ones as a pass", () => {
		expect(parseVerdict("PASS")).toEqual({ pass: true, issues: "" });
		expect(parseVerdict("FAIL: 1. Slide 2 is English")).toEqual({ pass: false, issues: "1. Slide 2 is English" });
		expect(parseVerdict("Looks fine overall").pass).toBe(true);
	});
	it("asks for one revision with the evaluator's issues, then stays quiet", async () => {
		const evaluator = new DeliverableEvaluator(1);
		const run = vi.fn().mockResolvedValue({ answer: "FAIL: 1. Slide 2 is English" });
		const first = await evaluator.check(run, input, "Done", ["outputs/deck.pptx"]);
		expect(first).toContain("Slide 2 is English");
		expect(run.mock.calls[0][0]).toMatchObject({ readOnly: true, depth: 1 });
		expect(run.mock.calls[0][0].query).toContain("Make a 3-slide deck in Vietnamese");
		expect(await evaluator.check(run, input, "Done", ["outputs/deck.pptx"])).toBeNull();
		expect(run).toHaveBeenCalledTimes(1);
	});
	it("counts runs per task across the automated-check rounds", async () => {
		const run = vi.fn().mockResolvedValue({ answer: "FAIL: 1. x" });
		const task = { ...input, taskId: "pat_round_test" };
		expect(await new DeliverableEvaluator(1).check(run, task, "a", ["outputs/a.docx"])).toContain("x");
		expect(await new DeliverableEvaluator(1).check(run, task, "a", ["outputs/a.docx"])).toBeNull();
		expect(run).toHaveBeenCalledTimes(1);
	});
	it("is off unless switched on", async () => {
		vi.stubEnv("PROJECT_AGENT_EVALUATOR", "");
		const run = vi.fn().mockResolvedValue({ answer: "FAIL: x" });
		expect(await new DeliverableEvaluator().check(run, input, "a", ["outputs/a.docx"])).toBeNull();
		expect(run).not.toHaveBeenCalled();
	});
	it("skips text answers, sub-agents, failures and the off switches", async () => {
		const run = vi.fn().mockResolvedValue({ answer: "FAIL: x" });
		expect(await new DeliverableEvaluator().check(run, input, "a", ["outputs/notes.md"])).toBeNull();
		expect(await new DeliverableEvaluator().check(run, { ...input, depth: 1 }, "a", ["outputs/a.docx"])).toBeNull();
		expect(await new DeliverableEvaluator().check(vi.fn().mockRejectedValue(new Error("x")), input, "a", ["outputs/a.docx"])).toBeNull();
		vi.stubEnv("PROJECT_AGENT_HARNESS_OFF", "evaluator");
		expect(await new DeliverableEvaluator().check(run, input, "a", ["outputs/a.docx"])).toBeNull();
		expect(run).not.toHaveBeenCalled();
	});
});
