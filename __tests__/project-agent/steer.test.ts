import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTask: mocks.read }));

import { takeSteerNotes } from "@/lib/project-agent/runtime/steer";
import { withQuote, withQuotes } from "@/components/features/projects/useProjectAgentQueue";

describe("steer notes", () => {
	it("hands over only notes added since the last look", async () => {
		mocks.read.mockResolvedValue({ steerNotes: ["use 2023 edition"] });
		const first = await takeSteerNotes("pat_1", 0);
		expect(first.seen).toBe(1);
		expect(first.block).toContain("> use 2023 edition");
		expect((await takeSteerNotes("pat_1", 1)).block).toBe("");
		mocks.read.mockResolvedValue({ steerNotes: ["use 2023 edition", "line one\nline two"] });
		const next = await takeSteerNotes("pat_1", 1);
		expect(next.block).toContain("> line one\n> line two");
		expect(next.block).not.toContain("2023");
	});

	it("quotes a selected passage above the question", () => {
		expect(withQuote("Why?", "first\nsecond")).toBe("> first\n> second\n\nWhy?");
	});

	it("puts several selected passages, each with its comment, before the typed text", () => {
		expect(withQuotes("Compare them", [{ text: "one", note: "why?" }, { text: "two", note: "" }])).toBe("> one\n\nwhy?\n\n> two\n\nCompare them");
		expect(withQuotes("", [{ text: "one", note: "" }])).toBe("> one");
	});
});
