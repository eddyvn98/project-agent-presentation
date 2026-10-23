// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectAgentInteractive } from "@/components/features/projects/ProjectAgentInteractive";
import { ProjectAgentQuiz } from "@/components/features/projects/ProjectAgentQuiz";
import { ProjectAgentTaskAnswer } from "@/components/features/projects/ProjectAgentTaskAnswer";
import { parseRichUiBlock } from "@/lib/project-agent/rich-ui";

afterEach(cleanup);

describe("Project Agent answer presentation", () => {
	it("offers an optional slide view for a long answer", () => {
		render(<ProjectAgentTaskAnswer markdown={"## Overview\nA summary.\n\n## Details\nMore detail."} sources={[]} resolveImage={() => null} presentation />);
		fireEvent.click(screen.getByRole("button", { name: "Present as slides" }));
		expect(screen.getByText("1 / 2")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
		expect(screen.getByRole("heading", { name: "Details" })).toBeTruthy();
	});

	it("evaluates slider output from the safe expression schema", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "interactive", title: "Estimate", parameters: [{ id: "units", label: "Units", min: 1, max: 20, step: 1, initial: 5 }], outputs: [{ label: "Total", unit: "units", expression: { op: "mul", args: [{ var: "units" }, 125] } }] }));
		if (block?.type !== "interactive") throw new Error("expected an interactive model");
		render(<ProjectAgentInteractive block={block} />);
		fireEvent.change(screen.getByRole("slider", { name: "Units" }), { target: { value: "6" } });
		expect(screen.getByText("750 units")).toBeTruthy();
	});

	it("provides accessible feedback for a validated knowledge check", () => {
		const block = parseRichUiBlock(JSON.stringify({ type: "quiz", question: "What is 2 + 2?", options: ["3", "4", "5"], answerIndex: 1 }));
		if (block?.type !== "quiz") throw new Error("expected a quiz");
		render(<ProjectAgentQuiz block={block} />);
		fireEvent.click(screen.getByRole("button", { name: "2. 4" }));
		expect(screen.getByRole("status").textContent).toContain("Correct");
	});
});
