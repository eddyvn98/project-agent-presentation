import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { reviewDocxStructure, reviewPptxStructure, reviewXlsxStructure } from "@/lib/project-agent/office-structure-review";

async function zipBytes(entries: Record<string, string>) {
	const zip = new JSZip();
	for (const [name, value] of Object.entries(entries)) zip.file(name, value);
	return zip.generateAsync({ type: "uint8array" });
}

const pptx = (transition = true) => zipBytes({
	"ppt/presentation.xml": '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
	"ppt/slides/slide1.xml": `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="100000" cy="100000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr><a:latin typeface="Aptos"/></a:rPr><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>${transition ? "<p:transition><p:fade/></p:transition>" : ""}<p:timing/></p:sld>`,
	"ppt/slides/_rels/slide1.xml.rels": '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
});

describe("Office structural review", () => {
	it("accepts a deck with layout, transition and requested entrance timing", async () => {
		expect(await reviewPptxStructure(await pptx(), "transition and entrance animation")).toEqual([]);
	});

	it("reports a missing transition only when requested", async () => {
		expect(await reviewPptxStructure(await pptx(false), "transition requested")).toContain("slide 1 is missing a transition");
		expect(await reviewPptxStructure(await pptx(false), "make a deck")).toEqual([]);
	});

	it("checks workbook charts, formulas, conditional formatting and frozen panes", async () => {
		const bytes = await zipBytes({
			"xl/worksheets/sheet1.xml": '<worksheet><sheetViews><sheetView><pane state="frozen" ySplit="1"/></sheetView></sheetViews><sheetData><row><c r="A1"><v>1</v></c><c r="A2"><f>A1*2</f><v>2</v></c></row></sheetData><conditionalFormatting sqref="A1"/></worksheet>',
			"xl/charts/chart1.xml": "<chart/>",
		});
		expect(await reviewXlsxStructure(bytes, "add chart and formulas for totals")).toEqual([]);
	});

	it("checks DOCX headings, TOC and page furniture when the report asks for them", async () => {
		const bytes = await zipBytes({
			"word/document.xml": '<w:document><w:body><w:p><w:pStyle w:val="Heading1"/><w:pPr/><w:r><w:instrText>TOC \\o "1-3"</w:instrText></w:r></w:p><w:sectPr><w:pgSz w:orient="landscape"/></w:sectPr></w:body></w:document>',
			"word/header1.xml": "<w:hdr/>", "word/footer1.xml": "<w:ftr/>",
		});
		expect(await reviewDocxStructure(bytes, "report heading TOC header footer landscape")).toEqual([]);
	});
});
