import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyEditSpec } from "@/lib/project-agent/edit-files";
import { buildRichFiles } from "@/lib/project-agent/rich-files";

describe("applyEditSpec", () => {
	it("replaces text across split runs in docx and keeps the package valid", async () => {
		const { files } = await buildRichFiles([{ type: "docx", title: "Report", blocks: [{ type: "paragraph", text: "Revenue grew 10% in Q3." }] }]);
		const zip = await JSZip.loadAsync(files[0].bytes);
		const xml = await zip.file("word/document.xml")!.async("string");
		// split the run so the phrase spans two runs
		zip.file("word/document.xml", xml.replace("Revenue grew 10% in Q3.", "Revenue grew </w:t></w:r><w:r><w:t>10% in Q3."));
		const source = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
		const result = await applyEditSpec({ replacements: [{ find: "grew 10%", replace: "grew 12%" }, { find: "nope", replace: "x" }] }, { name: "report.docx", bytes: source });
		expect(result.name).toBe("report_edited.docx");
		expect(result.summary[0]).toContain("grew 12%");
		expect(result.warnings[0]).toContain("nope");
		expect(await (await JSZip.loadAsync(result.bytes)).file("word/document.xml")!.async("string")).toContain("grew 12%");
	});

	it("edits xlsx cells, appends rows and reports before/after", async () => {
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet("Data");
		ws.addRow(["a", "b"]); ws.addRow([1, 2]);
		ws.getCell("A2").font = { bold: true };
		const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
		const result = await applyEditSpec({ filename: "data_v2", cells: [{ sheet: "Data", cell: "B2", value: 5 }], appendRows: [{ sheet: "Data", values: ["x", "=A2+B2"] }] }, { name: "data.xlsx", bytes });
		expect(result.name).toBe("data_v2.xlsx");
		expect(result.summary).toEqual(expect.arrayContaining([expect.stringContaining("Data!B2: 2 -> 5"), "Data: added row 3"]));
		const out = new ExcelJS.Workbook();
		await out.xlsx.load(result.bytes as unknown as ExcelJS.Buffer);
		expect(out.getWorksheet("Data")!.getCell("A2").font?.bold).toBe(true);
	});

	it("edits pptx slide text", async () => {
		const { files } = await buildRichFiles([{ type: "pptx", title: "T", slides: [{ title: "Deck" }, { title: "Old title", bullets: ["keep me"] }] }]);
		const result = await applyEditSpec({ replacements: [{ find: "Old title", replace: "New title" }] }, { name: "deck.pptx", bytes: files[0].bytes });
		expect(result.summary).toHaveLength(1);
	});
});

describe("applyEditSpec sheet fallback", () => {
	it("uses the only sheet when the agent guesses Sheet1", async () => {
		const wb = new ExcelJS.Workbook();
		wb.addWorksheet("Budget").addRow(["a"]);
		const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
		const result = await applyEditSpec({ cells: [{ sheet: "Sheet1", cell: "A1", value: "z" }] }, { name: "b.xlsx", bytes });
		expect(result.warnings).toEqual([]);
		expect(result.summary[0]).toContain("Budget!A1");
	});
});

describe("applyEditSpec text formats", () => {
	it("preserves the source extension and applies exact replacements", async () => {
		const result = await applyEditSpec({ replacements: [{ find: "draft", replace: "final" }] }, {
			name: "notes.md",
			bytes: new TextEncoder().encode("A draft with draft text."),
		});
		expect(result.name).toBe("notes_edited.md");
		expect(new TextDecoder().decode(result.bytes)).toBe("A final with final text.");
		expect(result.summary).toHaveLength(1);
	});

	it("rejects a JSON edit that breaks syntax", async () => {
		await expect(applyEditSpec({ replacements: [{ find: "1", replace: "x" }] }, {
			name: "data.json",
			bytes: new TextEncoder().encode('{"count":1}'),
		})).rejects.toThrow("would make .json invalid");
	});

	it("rejects invalid UTF-8 without returning partial output", async () => {
		await expect(applyEditSpec({}, { name: "notes.txt", bytes: new Uint8Array([0xff, 0xfe]) }))
			.rejects.toThrow("not valid UTF-8");
	});

	it("continues to reject PDF input without a format-specific edit adapter", async () => {
		await expect(applyEditSpec({}, { name: "scan.pdf", bytes: new TextEncoder().encode("%PDF-1.7") }))
			.rejects.toThrow("cannot edit .pdf files");
	});
});
