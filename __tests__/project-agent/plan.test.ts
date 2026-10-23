import { describe, expect, it } from "vitest";
import { parsePlanItems, planFromLog } from "@/lib/project-agent/plan";

describe("plan", () => {
	it("accepts strings and objects, bounds the list, rejects junk", () => {
		expect(parsePlanItems(["Read inputs", { text: "Build deck", status: "doing" }, { text: "x", status: "weird" }, "", 4])).toEqual([
			{ text: "Read inputs", status: "todo" }, { text: "Build deck", status: "doing" }, { text: "x", status: "todo" },
		]);
		expect(parsePlanItems(Array.from({ length: 30 }, (_, index) => `step ${index}`))).toHaveLength(12);
		expect(parsePlanItems([])).toBeNull();
		expect(parsePlanItems("nope")).toBeNull();
	});
	it("reads the latest plan from a task log", () => {
		const log = ['2026 plan :: [{"text":"a","status":"doing"}]', "2026 using tool sandbox_shell :: ls", '2026 plan :: [{"text":"a","status":"done"},{"text":"b","status":"doing"}]'];
		expect(planFromLog(log)).toEqual([{ text: "a", status: "done" }, { text: "b", status: "doing" }]);
		expect(planFromLog(["nothing"])).toBeUndefined();
		expect(planFromLog(["plan :: [broken"])).toBeUndefined();
	});
});

describe("plan action", () => {
	it("is parsed from the model reply and logged for the live checklist", async () => {
		const { parseRuntimeActions } = await import("@/lib/project-agent/runtime/actions");
		const { runPlanAction } = await import("@/lib/project-agent/runtime/plan-action");
		const parsed = parseRuntimeActions('{"action":"plan","items":["Read inputs",{"text":"Build deck","status":"doing"}]}');
		expect(parsed).toEqual([{ action: "plan", items: [{ text: "Read inputs", status: "todo" }, { text: "Build deck", status: "doing" }], note: undefined }]);
		expect(parseRuntimeActions('{"action":"plan","items":[]}')).toMatchObject({ error: expect.stringContaining("plan needs items") });
		const steps: Array<{ tool: string; detail: string }> = [];
		const action = (parsed as Array<{ action: "plan"; items: never[] }>)[0] as never;
		const result = runPlanAction({ onStep: (step: { tool: string; detail: string }) => steps.push(step) } as never, action);
		expect(result.text).toContain("0/2 done");
		expect(steps[0].tool).toBe("plan");
		expect(planFromLog([`2026 plan :: ${steps[0].detail}`])).toHaveLength(2);
	});
});
