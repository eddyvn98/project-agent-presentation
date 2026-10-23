import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { renderProjectAgentFile } from "@/lib/project-agent/visual-review";

describe("Project Agent Office previews", () => {
	it("reads and renders an exact generated XLSX workbook", async () => {
		const workbook = XLSX.utils.book_new();
		const sheet = XLSX.utils.aoa_to_sheet([
			["Quarter", "Revenue"],
			["Q1", 100],
			["Q2", 125],
		]);
		XLSX.utils.book_append_sheet(workbook, sheet, "Summary");
		const bytes = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
		const preview = await renderProjectAgentFile({
			name: "agent-review-probe.xlsx",
			mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}, bytes);

		expect(preview.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		expect(preview.readbackText).toContain("Revenue");
		expect(preview.readbackText).toContain("125");
		const outputPath = process.env.PROJECT_AGENT_OFFICE_PREVIEW_OUTPUT;
		if (outputPath) await writeFile(outputPath, preview.bytes);
	}, 60_000);
});
