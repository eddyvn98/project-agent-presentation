import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { lintDocxToc } from "@/lib/project-agent/deterministic-review";
import { estimateContextTokens } from "@/lib/project-agent/context-meter";

async function docx(body: string) {
	const zip = new JSZip();
	zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
	return zip.generateAsync({ type: "uint8array" });
}
const toc = '<w:p><w:r><w:instrText> TOC \\o "1-1" </w:instrText></w:r></w:p>';
const heading = (text: string) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const body = toc + ["Alpha chapter", "Beta chapter", "Gamma chapter"].map(heading).join("");

describe("lintDocxToc", () => {
	it("flags a TOC whose entries do not render", async () => expect(await lintDocxToc(await docx(body), "Contents Alpha chapter text Beta chapter text Gamma chapter text")).toHaveLength(1));
	it("accepts a TOC whose entries render", async () => expect(await lintDocxToc(await docx(body), "Alpha chapter Beta chapter Gamma chapter Alpha chapter Beta chapter Gamma chapter")).toEqual([]));
	it("ignores documents without a TOC", async () => expect(await lintDocxToc(await docx(heading("Alpha chapter")), "x")).toEqual([]));
	it("skips the check without rendered text", async () => expect(await lintDocxToc(await docx(body))).toEqual([]));
});

describe("estimateContextTokens", () => {
	it("keeps single-call runs as reported", () => expect(estimateContextTokens(40_000, 1)).toBe(40_000));
	it("converts a summed multi-round total to the final context size", () => expect(estimateContextTokens(3_600_000, 37)).toBeLessThan(200_000));
});
