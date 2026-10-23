import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildLintFixQuery, lintDocxText, lintPptx, lintXlsx } from "@/lib/project-agent/deterministic-review";

async function zipBytes(files: Record<string, string>): Promise<Uint8Array> {
	const zip = new JSZip();
	for (const [name, content] of Object.entries(files)) zip.file(name, content);
	return zip.generateAsync({ type: "uint8array" });
}
const slide = (inner: string) => `<p:sld><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
const run = (text: string) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;

describe("deterministic deliverable review", () => {
	it("flags empty, overflowing and placeholder slides but accepts picture-only slides", async () => {
		const bytes = await zipBytes({
			"ppt/slides/slide1.xml": slide(run("Title") + run("One point")),
			"ppt/slides/slide2.xml": slide(""),
			"ppt/slides/slide3.xml": slide(Array.from({ length: 12 }, (_, i) => run(`Point ${i} ` + "x".repeat(40))).join("")),
			"ppt/slides/slide4.xml": slide("<p:pic></p:pic>"),
			"ppt/slides/slide5.xml": slide(run("Lorem ipsum dolor")),
		});
		const issues = await lintPptx(bytes);
		expect(issues).toEqual(expect.arrayContaining([
			"slide 2 is empty",
			expect.stringContaining("slide 3 may overflow"),
			"slide 5 contains placeholder text",
		]));
		expect(issues.some((issue) => issue.startsWith("slide 4") || issue.startsWith("slide 1"))).toBe(false);
		expect(await lintPptx(await zipBytes({ "docProps/app.xml": "x" }))).toEqual(["presentation has no slides"]);
	});

	it("flags raw markdown table text but accepts real tables", async () => {
		const raw = await lintPptx(await zipBytes({ "ppt/slides/slide1.xml": slide(run("Region | Sales") + run("--- | ---") + run("North | 120k")) }));
		expect(raw.some((issue) => issue.includes("raw table markup"))).toBe(true);
		const real = await lintPptx(await zipBytes({ "ppt/slides/slide1.xml": slide("<a:tbl>" + run("Region") + run("North") + "</a:tbl>") }));
		expect(real).toEqual([]);
		const bigTable = "<a:tbl>" + Array.from({ length: 14 }, (_, i) => run(`Cell ${i}`)).join("") + "</a:tbl>";
		expect(await lintPptx(await zipBytes({ "ppt/slides/slide1.xml": slide(bigTable) }))).toEqual([]);
	});

	it("detects spreadsheet errors, empty workbooks and broken formulas via rendered text", async () => {
		const good = await zipBytes({ "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c r="A1"><v>1</v></c><c r="B1"><f>SUM(A1:A1)</f><v>1</v></c></row></sheetData></worksheet>' });
		expect(await lintXlsx(good, "Total 60")).toEqual([]);
		expect(await lintXlsx(good, "Total #DIV/0! and #NAME?")).toEqual([expect.stringContaining("#DIV/0!, #NAME?")]);
		const stored = await zipBytes({ "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c r="A1" t="e"><v>#REF!</v></c></row></sheetData></worksheet>' });
		expect(await lintXlsx(stored, "")).toContain("a cell holds the error #REF!");
		const empty = await zipBytes({ "xl/worksheets/sheet1.xml": "<worksheet><sheetData/></worksheet>" });
		expect(await lintXlsx(empty, "")).toContain("workbook has no data");
		expect(await lintXlsx(await zipBytes({ "docProps/core.xml": "x" }), "")).toEqual(["workbook has no sheets"]);
	});

	it("flags near-empty or placeholder documents", () => {
		expect(lintDocxText("  hi ")).toContain("document has almost no text");
		expect(lintDocxText("A full paragraph of real report content. {{customer_name}}")).toContain("document contains placeholder text");
		expect(lintDocxText("A full paragraph of real report content without placeholders.")).toEqual([]);
	});

	it("builds a short fix request that lists only files with problems", () => {
		const query = buildLintFixQuery({ prompt: "make a deck", userPrompt: "Make the Q1 deck" }, [
			{ file: "ok.xlsx", issues: [] },
			{ file: "deck.pptx", issues: ["slide 2 is empty"] },
		], 1);
		expect(query).toContain("- deck.pptx: slide 2 is empty");
		expect(query).not.toContain("ok.xlsx");
		expect(query).toContain("Make the Q1 deck");
		expect(query).toContain("fix round 1 of 2");
	});
});

describe("positioned text fit", () => {
	const box = (cx: number, cy: number, paragraphs: string[], size = 1800) => `<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr><p:txBody>${paragraphs.map((text) => `<a:p><a:r><a:rPr sz="${size}"/><a:t>${text}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
	it("accepts many short cards and flags a box whose text cannot fit", async () => {
		const cards = Array.from({ length: 4 }, () => box(2400000, 1100000, ["40%"], 4000) + box(2400000, 500000, ["Density"]) + box(2400000, 800000, ["Planning rule"], 1300)).join("");
		expect((await lintPptx(await zipBytes({ "ppt/slides/slide1.xml": slide(cards) }))).some((issue) => issue.includes("overflow"))).toBe(false);
		const crowded = box(3000000, 600000, Array.from({ length: 6 }, (_, i) => `Point ${i} with a fairly long explanation that wraps`));
		expect(await lintPptx(await zipBytes({ "ppt/slides/slide1.xml": slide(crowded) }))).toEqual(expect.arrayContaining([expect.stringContaining("slide 1 may overflow")]));
	});
});

describe("stored formula results", () => {
	it("flags formulas saved without a result and accepts stored ones", async () => {
		const sheet = (cells: string) => `<worksheet><sheetData><row r="1">${cells}</row></sheetData></worksheet>`;
		const empty = await lintXlsx(await zipBytes({ "xl/worksheets/sheet1.xml": sheet('<c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f><v></v></c><c r="C1"><f>A1*3</f></c>') }), "");
		expect(empty).toEqual(expect.arrayContaining([expect.stringContaining("2 formulas have no stored result")]));
		const stored = await lintXlsx(await zipBytes({ "xl/worksheets/sheet1.xml": sheet('<c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f><v>4</v></c>') }), "");
		expect(stored.some((issue) => issue.includes("no stored result"))).toBe(false);
	});
});

describe("workbook origin", () => {
	it("flags a workbook re-saved by LibreOffice", async () => {
		const sheet = '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>';
		const issues = await lintXlsx(await zipBytes({ "xl/worksheets/sheet1.xml": sheet, "docProps/app.xml": "<Properties><Application>LibreOffice/24.2</Application></Properties>" }), "");
		expect(issues).toEqual(expect.arrayContaining([expect.stringContaining("re-saved by LibreOffice")]));
	});
});
