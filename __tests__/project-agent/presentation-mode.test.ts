import { describe, expect, it } from "vitest";
import { completedStreamingMarkdown, splitPresentationSections } from "@/lib/project-agent/presentation-mode";

describe("Project Agent presentation mode", () => {
	it("splits only at H2 headings outside fenced code", () => {
		const markdown = "Intro\n\n## First\nText\n\n```md\n## Not a section\n```\n\n## Second\nMore";
		expect(splitPresentationSections(markdown)).toHaveLength(3);
		expect(splitPresentationSections(markdown)[1]).toContain("## Not a section");
	});

	it("keeps an incomplete streaming block out of rendered Markdown", () => {
		expect(completedStreamingMarkdown("Answer\n\n```ong-ui\n{\"type\":")).toEqual({ text: "Answer\n", pending: true });
	});

	it("keeps a short answer as one full-answer section", () => {
		expect(splitPresentationSections("Short answer")).toEqual(["Short answer"]);
	});
});
