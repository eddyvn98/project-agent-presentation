import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { lintDocxLayout, lintTocPageNumbers } from "@/lib/project-agent/docx-layout-lint";
import { samplePages } from "@/lib/project-agent/visual-review";

async function docx(body: string) {
	const zip = new JSZip();
	zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
	return zip.generateAsync({ type: "uint8array" });
}
const cell = "<w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc>";
const table = (grid: number[], cells: number) => `<w:tbl><w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr>${cell.repeat(cells)}</w:tr></w:tbl>`;

describe("lintDocxLayout", () => {
	it("accepts a sane table", async () => expect(await lintDocxLayout(await docx(table([4000, 4000], 2)))).toEqual([]));
	it("flags a table without a grid", async () => expect(await lintDocxLayout(await docx(table([], 2)))).toHaveLength(1));
	it("flags a grid that does not match the cells", async () => expect(await lintDocxLayout(await docx(table([4000, 4000, 4000], 2)))).toHaveLength(1));
	it("flags narrow columns", async () => expect(await lintDocxLayout(await docx(table([200, 200], 2)))).toHaveLength(1));
	it("flags nearly empty pages", async () => expect((await lintDocxLayout(await docx("<w:t>hi</w:t>"), 40))[0]).toContain("40 pages"));
});

const heading = (level: number, text = "H") => `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
describe("heading hierarchy", () => {
	it("accepts consecutive levels", async () => expect(await lintDocxLayout(await docx(heading(1) + heading(2) + heading(3) + heading(2)))).toEqual([]));
	it("flags a skipped level", async () => expect((await lintDocxLayout(await docx(heading(1) + heading(3))))[0]).toContain("skips levels"));
});

describe("lintTocPageNumbers", () => {
	const body = ["Alpha chapter", "Beta chapter", "Gamma chapter"].map((text) => heading(1, text)).join("");
	const pages = (toc: string) => `[Page 2] ${toc}\n[Page 5] Alpha chapter body\n[Page 9] Beta chapter body\n[Page 14] Gamma chapter body`;
	it("flags numbers that differ from the render", async () => expect(await lintTocPageNumbers(await docx(body), pages("Alpha chapter ....... 3 Beta chapter ....... 4 Gamma chapter ....... 5"))).toHaveLength(1));
	it("accepts measured numbers", async () => expect(await lintTocPageNumbers(await docx(body), pages("Alpha chapter ....... 5 Beta chapter ....... 9 Gamma chapter ....... 14"))).toEqual([]));
});

describe("samplePages", () => {
	it("returns every page of a short file", () => expect(samplePages(5)).toEqual([1, 2, 3, 4, 5]));
	it("samples a long file including first and last pages", () => {
		const pages = samplePages(166);
		expect(pages).toHaveLength(8);
		expect(pages[0]).toBe(1);
		expect(pages.at(-1)).toBe(166);
	});
});
