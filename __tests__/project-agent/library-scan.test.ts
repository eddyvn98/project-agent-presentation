import { describe, expect, it } from "vitest";
import { embedsDocumentText } from "@/lib/project-agent/runtime/library";

describe("script library content scan", () => {
	it("keeps generic scripts", () => {
		const script = `# build a docx from a template\nimport sys\nfrom docx import Document\ndoc = Document(sys.argv[1])\nfor p in doc.paragraphs:\n    if p.style.name == "Heading 1":\n        print(p.text)\n`;
		expect(embedsDocumentText(script)).toBe(false);
	});
	it("rejects scripts with pasted prose", () => {
		const prose = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" ");
		expect(embedsDocumentText(`text = """${prose}"""\nprint(text)`)).toBe(true);
	});
	it("rejects scripts that scatter many sentences", () => {
		const sentence = "This is a full sentence copied out of the source document for the chapter body text";
		const script = Array.from({ length: 20 }, (_, index) => `add("${sentence} number ${index}")`).join("\n");
		expect(embedsDocumentText(script)).toBe(true);
	});
});
