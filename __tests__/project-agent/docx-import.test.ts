import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { describe, expect, it } from "vitest";
import { docxToEditorHtml } from "@/lib/workspace/docx-import";

describe("docxToEditorHtml", () => {
	it("keeps headings, text with Vietnamese letters and tables", async () => {
		const doc = new Document({ sections: [{ children: [
			new Paragraph({ text: "Tổng hợp tài liệu", heading: HeadingLevel.HEADING_1 }), // vi-allow
			new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Đoạn ", bold: true }), new TextRun("văn bản.")] }), // vi-allow
			new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Tên")] }), new TableCell({ children: [new Paragraph("Giá")] })] })] }), // vi-allow
		] }] });
		const { html, notes } = await docxToEditorHtml(Buffer.from(await Packer.toBuffer(doc)));
		expect(html).toContain("<h1>Tổng hợp tài liệu</h1>"); // vi-allow
		expect(html).toContain("<strong>Đoạn </strong>"); // vi-allow
		expect(html).toContain('<p style="text-align: center">');
		expect(html).toContain("<table>");
		expect(notes.length).toBeGreaterThan(0);
	});
});
