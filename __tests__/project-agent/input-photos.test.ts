import { describe, expect, it } from "vitest";
import { MAX_PHOTO_SHEETS, PHOTOS_PER_SHEET, photoSheetNote, planPhotoSheets } from "@/lib/project-agent/runtime/input-photos";

describe("planPhotoSheets", () => {
	it("puts every photo on a numbered sheet in natural order and ignores other files", () => {
		const names = ["shop-10.jpg", "shop-2.jpg", "shop-1.jpg", "plan.pdf", "shop-3.png", "shop-4.jpg", "shop-5.jpg", "shop-6.jpg", "shop-7.jpg"];
		const plan = planPhotoSheets(names);
		expect(plan.sheets.map((sheet) => sheet.length)).toEqual([PHOTOS_PER_SHEET, 2]);
		expect(plan.sheets.flat().map((photo) => photo.name)).toEqual(["shop-1.jpg", "shop-2.jpg", "shop-3.png", "shop-4.jpg", "shop-5.jpg", "shop-6.jpg", "shop-7.jpg", "shop-10.jpg"]);
		expect(plan.sheets[1][0].label).toBe("7. shop-7.jpg");
		expect(plan.skipped).toEqual([]);
	});

	it("tells the agent about photos that do not fit on the sheets", () => {
		const names = Array.from({ length: PHOTOS_PER_SHEET * MAX_PHOTO_SHEETS + 2 }, (_, index) => `p-${index + 1}.jpg`);
		const plan = planPhotoSheets(names);
		expect(plan.sheets).toHaveLength(MAX_PHOTO_SHEETS);
		expect(plan.skipped).toEqual(["p-19.jpg", "p-20.jpg"]);
		const note = photoSheetNote(plan);
		expect(note).toContain("20 photo(s)");
		expect(note).toContain("p-19.jpg, p-20.jpg");
	});

	it("returns no sheets when nothing is a photo", () => {
		expect(planPhotoSheets(["a.pdf", "b.docx"]).sheets).toEqual([]);
	});
});
