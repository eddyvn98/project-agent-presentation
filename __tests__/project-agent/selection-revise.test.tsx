// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectAgentSelectionAsk } from "@/components/features/projects/ProjectAgentSelectionAsk";

afterEach(cleanup);

function Harness({ onRevise, onQuote }: { onRevise: (text: string, instruction: string, title: string) => void; onQuote: (text: string, note: string) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	return <div ref={ref}>
		<section data-writing-title="Weekly minutes"><p id="inside">Please resubmit the drawings by Friday.</p></section>
		<p id="outside">A normal answer paragraph with some text.</p>
		<ProjectAgentSelectionAsk containerRef={ref} onQuote={onQuote} onRevise={onRevise} />
	</div>;
}

async function select(id: string) {
	const node = document.getElementById(id)!.firstChild!;
	const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 18);
	const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
	Range.prototype.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 10, right: 150, bottom: 110, x: 100, y: 100, toJSON: () => ({}) });
	await act(async () => { fireEvent.mouseUp(document.getElementById(id)!); await new Promise((resolve) => setTimeout(resolve, 5)); });
}

describe("selection ask", () => {
	it("offers Revise for text inside a Writing card and needs an instruction", async () => {
		const onRevise = vi.fn(), onQuote = vi.fn();
		render(<Harness onRevise={onRevise} onQuote={onQuote} />);
		await select("inside");
		fireEvent.click(screen.getByRole("button", { name: "Reply" }));
		const revise = screen.getByRole("button", { name: "Revise this passage" }) as HTMLButtonElement;
		expect(revise.disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("Reply to the selected text"), { target: { value: "make it firmer" } });
		expect(revise.disabled).toBe(false);
		fireEvent.click(revise);
		expect(onRevise).toHaveBeenCalledWith("Please resubmit th", "make it firmer", "Weekly minutes");
		expect(onQuote).not.toHaveBeenCalled();
	});

	it("does not offer Revise for ordinary answer text", async () => {
		render(<Harness onRevise={vi.fn()} onQuote={vi.fn()} />);
		await select("outside");
		expect(screen.queryByLabelText("Reply to the selected text")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Reply" }));
		expect(screen.getByLabelText("Reply to the selected text")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Revise this passage" })).toBeNull();
	});
});
