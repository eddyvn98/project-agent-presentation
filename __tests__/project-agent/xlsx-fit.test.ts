import { describe, expect, it } from "vitest";
import { fitSheetXml } from "@/lib/project-agent/xlsx-fit";

describe("fitSheetXml", () => {
	const base = '<worksheet xmlns="x"><sheetData/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><drawing r:id="rId1"/></worksheet>';
	it("adds fit-to-width page setup after the margins and a sheet property", () => {
		const out = fitSheetXml(base);
		expect(out).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
		expect(out.indexOf("<pageSetup")).toBeGreaterThan(out.indexOf("<pageMargins"));
		expect(out.indexOf("<pageSetup")).toBeLessThan(out.indexOf("<drawing"));
		expect(out).toContain('fitToWidth="1" fitToHeight="0" orientation="landscape"');
	});
	it("replaces an existing page setup and keeps other attributes", () => {
		const out = fitSheetXml('<worksheet><sheetPr><tabColor rgb="FF0000"/></sheetPr><pageMargins left="1"/><pageSetup paperSize="9" scale="50" orientation="portrait"/></worksheet>');
		expect(out).toContain('<tabColor rgb="FF0000"/><pageSetUpPr fitToPage="1"/></sheetPr>');
		expect(out).toContain('paperSize="9"');
		expect(out).not.toContain('scale="50"');
		expect(out).not.toContain('portrait');
	});
});
