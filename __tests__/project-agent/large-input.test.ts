import { describe, expect, it } from "vitest";
import { isLargePdfInput, LARGE_PDF_INPUT_BYTES } from "@/lib/project-agent/large-input";
import { buildProjectAgentInputReadback } from "@/lib/project-agent/input-file-context";

describe("large PDF inputs", () => {
	it("flags only PDFs above the threshold", () => {
		const big = LARGE_PDF_INPUT_BYTES + 1;
		expect(isLargePdfInput({ name: "a.pdf", mimeType: "application/pdf", size: big })).toBe(true);
		expect(isLargePdfInput({ name: "a.PDF", mimeType: "application/octet-stream", size: big })).toBe(true);
		expect(isLargePdfInput({ name: "a.pdf", mimeType: "application/pdf", size: 1000 })).toBe(false);
		expect(isLargePdfInput({ name: "a.docx", mimeType: "application/msword", size: big })).toBe(false);
	});
	it("readback points a large PDF at the pdf action without reading it", async () => {
		const text = await buildProjectAgentInputReadback([{ id: "00000000-0000-0000-0000-000000000000", name: "Bản vẽ.pdf", mimeType: "application/pdf", size: LARGE_PDF_INPUT_BYTES + 5 }], "pat_000000000000");
		expect(text).toContain("Large PDF");
		expect(text).toContain("inputs/Bản vẽ.pdf");
	});
});

describe("attachment limits for large PDFs", () => {
	it("lets a PDF be far larger than other attachments and counts it against its own total", async () => {
		const { inputFileMaxBytes, parseProjectAgentRequestedFiles, PROJECT_AGENT_INPUT_MAX_FILE_BYTES, PROJECT_AGENT_INPUT_MAX_PDF_BYTES } = await import("@/lib/project-agent/task-inputs");
		expect(inputFileMaxBytes({ name: "a.pdf", mimeType: "application/pdf" })).toBe(PROJECT_AGENT_INPUT_MAX_PDF_BYTES);
		expect(inputFileMaxBytes({ name: "a.docx", mimeType: "application/msword" })).toBe(PROJECT_AGENT_INPUT_MAX_FILE_BYTES);
		const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
		const pdf = { id: id(1), name: "S.pdf", mimeType: "application/pdf", size: 461 * 1024 * 1024 };
		expect(parseProjectAgentRequestedFiles([pdf, { ...pdf, id: id(2), name: "H.pdf", size: 115 * 1024 * 1024 }])).toHaveProperty("files");
		expect(parseProjectAgentRequestedFiles([{ id: id(3), name: "big.docx", mimeType: "application/msword", size: 461 * 1024 * 1024 }])).toHaveProperty("error");
		expect(parseProjectAgentRequestedFiles([{ ...pdf, size: PROJECT_AGENT_INPUT_MAX_PDF_BYTES + 1 }])).toHaveProperty("error");
	});
});
