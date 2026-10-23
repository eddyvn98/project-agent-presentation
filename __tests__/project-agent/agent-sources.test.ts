import { describe, expect, it } from "vitest";
import { applyNoteOps, describeTaskWork, extractAgentSideEffects } from "@/lib/project-agent/agent-sources";

describe("agent side effects", () => {
	it("extracts web sources and notes and strips the tags", () => {
		const answer = 'Done.\n<project_source_add>{"url":"https://example.com/a","title":"A","summary":"S","facts":["f1"]}</project_source_add><project_source_add>{"url":"javascript:x","summary":"bad"}</project_source_add><project_note>{"text":"Always cite DOI"}</project_note>';
		const result = extractAgentSideEffects(answer);
		expect(result.answer).toBe("Done.");
		expect(result.sources).toEqual([{ url: "https://example.com/a", title: "A", summary: "S", facts: ["f1"], replace: false }]);
		expect(result.notes).toEqual([{ op: "add", text: "Always cite DOI" }]);
	});

	it("hides an unfinished tag while streaming", () => {
		expect(extractAgentSideEffects('Hello <project_note>{"text":"par').answer).toBe("Hello");
	});

	it("describes the work from task log lines", () => {
		const entry = describeTaskWork({ prompt: "Find CLT papers", log: ["using tool web_search #abc :: cross laminated timber", "using tool web_search #abc :: cross laminated timber"] }, ["r.docx"], []);
		expect(entry).toContain("Find CLT papers");
		expect(entry).toContain("- web_search: cross laminated timber");
		expect(entry).toContain("created file: r.docx");
	});

	it("parses edit and remove operations and applies them by rule number", () => {
		const result = extractAgentSideEffects('x<project_note>{"replace":1,"text":"B"}</project_note><project_note>{"remove":2}</project_note><project_source_remove>{"url":"https://e.com"}</project_source_remove>');
		expect(result.notes).toEqual([{ op: "replace", line: 1, text: "B" }, { op: "remove", line: 2 }]);
		expect(result.removedUrls).toEqual(["https://e.com"]);
		expect(applyNoteOps(["a", "b", "c"], result.notes)).toEqual(["B", "c"]);
	});
});
