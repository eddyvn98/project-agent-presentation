import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { inspectOffice } from "../../scripts/agent-bench-document-inspector.mjs";

async function deckWithSlides(slides: string[]) {
	const zip = new JSZip();
	slides.forEach((xml, index) => zip.file(`ppt/slides/slide${index + 1}.xml`, xml));
	zip.file("ppt/theme/theme1.xml", "<a:theme/>");
	return zip.generateAsync({ type: "nodebuffer" });
}

describe("document benchmark visual density", () => {
	it("counts native shapes as slide visuals", async () => {
		const visual = `<p:sld>${"<p:sp/>".repeat(3)}</p:sld>`;
		const textOnly = `<p:sld>${"<p:sp/>".repeat(2)}</p:sld>`;
		const { result, issues } = await inspectOffice(await deckWithSlides([visual, textOnly]), { kind: "pptx" });
		expect(result.shapesPerSlide).toEqual([3, 2]);
		expect(result.visualSlides).toBe(1);
		expect(issues).toEqual([]);
	});

	it("fails when more than half of the slides are text-only", async () => {
		const slides = [3, 2, 2, 1].map((count) => `<p:sld>${"<p:sp/>".repeat(count)}</p:sld>`);
		const { result, issues } = await inspectOffice(await deckWithSlides(slides), { kind: "pptx" });
		expect(result.textOnlySlides).toBe(3);
		expect(issues).toContain("3 of 4 slides are text-only; add a chart, table, picture or at least 3 shapes");
	});
});
