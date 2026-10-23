import { describe, expect, it } from "vitest";
import { parseRuntimeAction } from "@/lib/project-agent/runtime/actions";
import { tableMarkdownFrom } from "@/lib/project-agent/runtime/table-transcribe";

describe("transcribe_tables action", () => {
	it("parses a page list, as numbers or a comma string", () => {
		expect(parseRuntimeAction('{"action":"transcribe_tables","path":"inputs/a.pdf","pages":[82,"122"]}')).toMatchObject({ action: "transcribe_tables", pages: [82, 122] });
		expect(parseRuntimeAction('{"action":"transcribe_tables","path":"inputs/a.pdf","pages":"1, 2"}')).toMatchObject({ pages: [1, 2] });
	});
	it("rejects a call without pages or path", () => {
		expect(parseRuntimeAction('{"action":"transcribe_tables","path":"inputs/a.pdf"}')).toHaveProperty("error");
		expect(parseRuntimeAction('{"action":"transcribe_tables","pages":[1]}')).toHaveProperty("error");
	});
	it("takes the Markdown from the model's final answer", () => {
		const reply = JSON.stringify({ action: "final", answer: "| Mã | Tên |\n|---|---|\n| I.1 | Nhà ở |" });
		expect(tableMarkdownFrom(reply)).toBe("| Mã | Tên |\n|---|---|\n| I.1 | Nhà ở |");
		expect(tableMarkdownFrom("```markdown\n| a | b |\n|---|---|\n```")).toContain("| a | b |");
	});
});
