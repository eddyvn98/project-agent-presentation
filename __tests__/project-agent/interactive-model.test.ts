import { describe, expect, it } from "vitest";
import { evaluateExpression, parseInteractiveModel } from "@/lib/project-agent/interactive-model";

describe("Project Agent interactive model", () => {
	it("evaluates bounded expressions without executing code", () => {
		const model = parseInteractiveModel({
			type: "interactive", title: "Estimate",
			parameters: [{ id: "units", label: "Units", min: 1, max: 20, step: 1, initial: 5 }],
			outputs: [{ label: "Total", expression: { op: "mul", args: [{ var: "units" }, 125] } }],
		});
		expect(model).not.toBeNull();
		expect(evaluateExpression(model!.outputs[0].expression, { units: 5 })).toBe(625);
	});

	it("returns no number for division by zero or missing variables", () => {
		expect(evaluateExpression({ op: "div", args: [4, 0] }, {})).toBeNull();
		expect(evaluateExpression({ var: "missing" }, {})).toBeNull();
	});
});
