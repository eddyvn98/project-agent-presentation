import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildRichFiles, extractRichFileSpecs } from "@/lib/project-agent/rich-files";
import { lintPptx } from "@/lib/project-agent/deterministic-review";

const pptxSpec = {
	type: "pptx", filename: "Q3 Sales", title: "Q3",
	slides: [
		{ title: "Q3 Sales", subtitle: "Review" },
		{ title: "By region", bullets: ["North leads"], chart: { type: "bar", categories: ["N", "S"], series: [{ name: "Q3", values: [120, 95] }] } },
		{ title: "Table", table: { columns: ["Region", "Sales"], rows: [["North", 120], ["South", 95]] } },
	],
};

describe("rich file specs", () => {
	it("extracts ong-file blocks and strips them from the answer", () => {
		const { text, specs } = extractRichFileSpecs(`Here you go.\n\n\`\`\`ong-file\n${JSON.stringify(pptxSpec)}\n\`\`\`\n\nDone.\n\`\`\`ong-file\n{bad json\n\`\`\``);
		expect(specs).toHaveLength(1);
		expect(text).toBe("Here you go.\n\nDone.");
	});

	it("builds a pptx with a native chart and table that passes the deterministic lint", async () => {
		const { files, errors } = await buildRichFiles([pptxSpec]);
		expect(errors).toEqual([]);
		expect(files[0].name).toBe("Q3_Sales.pptx");
		const zip = await JSZip.loadAsync(files[0].bytes);
		expect(Object.keys(zip.files).some((n) => /ppt\/charts\/chart\d*\.xml/.test(n))).toBe(true);
		expect(await zip.file("ppt/slides/slide3.xml")!.async("string")).toContain("<a:tbl>");
		expect(await lintPptx(files[0].bytes)).toEqual([]);
	});

	it("builds docx with table and chart image, and xlsx with formulas", async () => {
		const { files, errors } = await buildRichFiles([
			{ type: "docx", title: "Report", blocks: [{ type: "heading", level: 1, text: "Intro" }, { type: "paragraph", text: "Hi" }, { type: "table", columns: ["A", "B"], rows: [["x", 1]] }, { type: "chart", chart: { type: "line", categories: ["Jan", "Feb"], series: [{ name: "V", values: [1, 2] }] } }] },
			{ type: "xlsx", filename: "d", sheets: [{ name: "S", columns: ["a", "b"], rows: [[1, 2], ["=A2+B2", 3]], chart: { type: "pie", categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } }] },
		]);
		expect(errors).toEqual([]);
		expect(files.map((f) => f.name)).toEqual(["Report.docx", "d.xlsx"]);
		const docx = await JSZip.loadAsync(files[0].bytes);
		expect(Object.keys(docx.files).some((n) => n.startsWith("word/media/"))).toBe(true);
		const xlsx = await JSZip.loadAsync(files[1].bytes);
		expect(await xlsx.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("<f>");
	});
});

describe("stripUnverifiedDisclaimers", () => {
	it("drops sentences saying the file was not reopened", async () => {
		const { stripUnverifiedDisclaimers } = await import("@/lib/project-agent/rich-files");
		expect(stripUnverifiedDisclaimers("Deck ready. I have not reopened the file to check it. Slide 2 has the table.")).toBe("Deck ready. Slide 2 has the table.");
		expect(stripUnverifiedDisclaimers("T\u00f4i ch\u01b0a m\u1edf l\u1ea1i file \u0111\u1ec3 ki\u1ec3m tra. N\u1ed9i dung g\u1ed3m 6 slide.")).toBe("N\u1ed9i dung g\u1ed3m 6 slide.");
	});
});

describe("stripUnverifiedDisclaimers wording", () => {
	it("handles the shorter phrasings the agent uses", async () => {
		const { stripUnverifiedDisclaimers } = await import("@/lib/project-agent/rich-files");
		expect(stripUnverifiedDisclaimers("Done. Tôi chưa mở lại bản mới để kiểm tra. Ứng dụng sẽ áp dụng chỉnh sửa. Two changes.")).toBe("Done. Two changes.");
	});
});
