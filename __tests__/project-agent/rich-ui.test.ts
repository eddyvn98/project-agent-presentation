import { describe, expect, it } from "vitest";
import { parseRichUiBlock } from "@/lib/project-agent/rich-ui";

describe("parseRichUiBlock", () => {
	it("parses kpis and drops incomplete items", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "kpis", items: [{ label: "Budget", value: "3 billion", tone: "success" }, { label: "", value: "x" }] }));
		expect(block).toMatchObject({ type: "kpis", items: [{ label: "Budget", value: "3 billion", tone: "success" }] });
	});
	it("coerces numeric chart strings and defaults the kind", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "chart", categories: ["A", "B"], series: [{ name: "Total", values: ["2.6", 3] }] }));
		expect(block).toMatchObject({ type: "chart", kind: "bar", series: [{ values: [2.6, 3] }] });
	});
	it("rejects incomplete chart values instead of inventing zeros", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "chart", categories: ["A", "B"], series: [{ name: "Total", values: ["2.6", "n/a"] }] }));
		expect(block).toBeNull();
	});
	it("parses safe interactive models and rejects executable expressions", () => {
		const valid = { type: "interactive", title: "Estimate", parameters: [{ id: "units", label: "Units", min: 1, max: 20, step: 1, initial: 5 }], outputs: [{ label: "Total", expression: { op: "mul", args: [{ var: "units" }, 125] } }] };
		expect(parseRichUiBlock(JSON.stringify(valid))).toMatchObject({ type: "interactive", title: "Estimate" });
		const unsafe = { ...valid, outputs: [{ label: "Total", expression: { op: "eval", args: ["alert(1)"] } }] };
		expect(parseRichUiBlock(JSON.stringify(unsafe))).toBeNull();
	});
	it("accepts only bounded knowledge checks", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "quiz", question: "What is 2 + 2?", options: ["3", "4", "5"], answerIndex: 1 }));
		expect(block).toMatchObject({ type: "quiz", question: "What is 2 + 2?", answerIndex: 1 });
		expect(parseRichUiBlock(JSON.stringify({ type: "quiz", question: "Choose", options: ["a", "b"], answerIndex: 4 }))).toBeNull();
	});
	it("rejects malformed json, unknown types and empty blocks", () => {
		expect(parseRichUiBlock("{not json")).toBeNull();
		expect(parseRichUiBlock(JSON.stringify({ type: "unknown" }))).toBeNull();
		expect(parseRichUiBlock(JSON.stringify({ type: "chart", categories: [], series: [] }))).toBeNull();
		expect(parseRichUiBlock(JSON.stringify({ type: "progress", value: 5, max: 0 }))).toBeNull();
	});
	it("keeps at most four options and flags the recommended one", () => {
		const items = Array.from({ length: 6 }, (_, index) => ({ title: `Option ${index}`, recommended: index === 1 }));
		const block = parseRichUiBlock(JSON.stringify({ type: "options", items }));
		expect(block && block.type === "options" && block.items.length).toBe(4);
		expect(block && block.type === "options" && block.items[1].recommended).toBe(true);
	});

	it("parses ask and followups blocks and drops empty ones", () => {
		const ask = parseRichUiBlock(JSON.stringify({ type: "ask", questions: [{ question: "Budget?", options: ["A", "B", ""], multi: true }, { question: "" }] }));
		expect(ask).toEqual({ type: "ask", title: undefined, questions: [{ question: "Budget?", options: ["A", "B"], multi: true }] });
		expect(parseRichUiBlock(JSON.stringify({ type: "ask", questions: [] }))).toBeNull();
		const followups = parseRichUiBlock(JSON.stringify({ type: "followups", items: [{ label: "Go deeper" }] }));
		expect(followups).toEqual({ type: "followups", items: [{ label: "Go deeper", prompt: "Go deeper" }] });
	});
});

describe("form block", () => {
	it("keeps typed fields, falls back to text without options and drops empty labels", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "form", title: "Survey", fields: [{ label: "Area", kind: "text", placeholder: "m2" }, { label: "Problem", kind: "choice", options: ["Few customers", "Low margin"] }, { label: "Channels", kind: "multi", options: ["Zalo"] }, { label: "No options", kind: "choice" }, { label: "" }] }));
		expect(block?.type).toBe("form");
		if (block?.type !== "form") return;
		expect(block.fields.map((field) => field.kind)).toEqual(["text", "choice", "multi", "text"]);
		expect(block.fields[3].options).toEqual([]);
	});

	it("rejects a form with no usable fields", () => {
		expect(parseRichUiBlock(JSON.stringify({ type: "form", fields: [{ label: "" }] }))).toBeNull();
	});
});
