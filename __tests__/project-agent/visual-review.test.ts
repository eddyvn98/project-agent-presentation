import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderProjectAgentFile } from "@/lib/project-agent/visual-review";

function makePdf(text: string): Buffer {
	const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
	];
	let source = "%PDF-1.4\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(source, "binary"));
		source += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xrefOffset = Buffer.byteLength(source, "binary");
	source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
	source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
	return Buffer.from(source, "binary");
}

describe("Project Agent saved-file visual review", () => {
	it("renders saved PDF and reads back its text", async () => {
		const review = await renderProjectAgentFile(
			{ name: "Project-QA-Loop.pdf", mimeType: "application/pdf" },
			makePdf("Project Agent readback OK"),
		);

		expect(review.readbackText).toContain("Project Agent readback OK");
		expect(review.label).toContain("1 pages");
		expect([...review.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	});

	it("renders saved HTML to an image and reads its visible text", async () => {
		const html = Buffer.from(`<!doctype html><html><body><main style="padding:24px;color:#123456">
			<h1>Quarterly report</h1><p>Revenue increased 12%.</p>
		</main></body></html>`);

		const review = await renderProjectAgentFile({ name: "report.html", mimeType: "text/html" }, html);
		const image = await sharp(review.bytes).metadata();

		expect(image.format).toBe("png");
		expect(image.width).toBeGreaterThan(0);
		expect(review.label).toContain("rendered preview");
		expect(review.readbackText).toContain("Quarterly report");
		expect(review.readbackText).toContain("Revenue increased 12%.");
	});

	it("does not execute generated HTML scripts when the host disables them", async () => {
		const previous = process.env.PROJECT_AGENT_RENDER_JAVASCRIPT;
		process.env.PROJECT_AGENT_RENDER_JAVASCRIPT = "false";
		try {
			const html = Buffer.from(`<!doctype html><body><p>Static output</p><script>document.body.innerHTML = "Executed script"</script>`);
			const review = await renderProjectAgentFile({ name: "untrusted.html", mimeType: "text/html" }, html);
			expect(review.readbackText).toContain("Static output");
			expect(review.readbackText).not.toContain("Executed script");
		} finally {
			if (previous === undefined) delete process.env.PROJECT_AGENT_RENDER_JAVASCRIPT;
			else process.env.PROJECT_AGENT_RENDER_JAVASCRIPT = previous;
		}
	});

	it("renders and reads back saved text and Markdown without interpreting it as HTML", async () => {
		const source = "# Report\n\nRevenue: 12%\n\n<script>alert('not executable')</script>";
		const review = await renderProjectAgentFile({ name: "report.md", mimeType: "text/markdown" }, Buffer.from(source));
		const image = await sharp(review.bytes).metadata();

		expect(image.format).toBe("png");
		expect(review.label).toContain("text preview");
		expect(review.readbackText).toBe(source);
	});

	it("renders saved SVG as a visual preview for diagram review", async () => {
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="#fff"/><text x="16" y="64">Project diagram</text></svg>');
		const review = await renderProjectAgentFile({ name: "diagram.svg", mimeType: "image/svg+xml" }, svg);
		const image = await sharp(review.bytes).metadata();

		expect(image.format).toBe("png");
		expect(review.label).toContain("visual review");
	});
});

describe("Project Agent image review", () => {
	it("decodes saved image bytes and creates a bounded PNG preview", async () => {
		const source = await sharp({
			create: { width: 8, height: 6, channels: 3, background: "#2563eb" },
		}).jpeg().toBuffer();
		const review = await renderProjectAgentFile({ name: "chart.jpg", mimeType: "image/jpeg" }, source);
		const metadata = await sharp(review.bytes).metadata();

		expect(review.label).toBe("chart.jpg visual review");
		expect(metadata.format).toBe("png");
		expect(metadata.width).toBe(8);
		expect(metadata.height).toBe(6);
	});

	it("rejects corrupt image bytes instead of letting the Agent claim visual review", async () => {
		await expect(renderProjectAgentFile(
			{ name: "broken.png", mimeType: "image/png" },
			Buffer.from("not an image"),
		)).rejects.toThrow();
	});
});
