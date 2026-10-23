import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { readKnowledgeOriginal, readKnowledgeImage, readProjectAgentTaskInputFile, renderProjectAgentFile, withTpdfOcrPdf } = vi.hoisted(() => ({
	readKnowledgeOriginal: vi.fn(),
	readKnowledgeImage: vi.fn(),
	readProjectAgentTaskInputFile: vi.fn(),
	renderProjectAgentFile: vi.fn(),
	withTpdfOcrPdf: vi.fn(),
}));

vi.mock("@/lib/capabilities/project", () => ({ readKnowledgeOriginal, readKnowledgeImage }));
vi.mock("@/lib/project-agent/task-store", () => ({ readProjectAgentTaskInputFile }));
vi.mock("@/lib/project-agent/visual-review", () => ({ renderProjectAgentFile }));
vi.mock("@/lib/project-agent/tpdf-ocr-client", () => ({ withTpdfOcrPdf }));

import { uploadProjectAgentTaskInputFiles, uploadProjectKnowledgeFiles } from "@/lib/project-agent/dify-input-files";
import { buildProjectAgentInputReadback } from "@/lib/project-agent/input-file-context";

afterEach(() => {
	vi.restoreAllMocks();
	readKnowledgeOriginal.mockReset();
	readKnowledgeImage.mockReset();
	readProjectAgentTaskInputFile.mockReset();
	renderProjectAgentFile.mockReset();
	withTpdfOcrPdf.mockReset();
});

describe("uploadProjectKnowledgeFiles", () => {
	it("uploads ready source files to Dify and returns chat attachment references", async () => {
		readKnowledgeOriginal.mockResolvedValue({ buffer: Buffer.from("docx bytes"), filename: "plan.docx" });
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"dify-file-1"}', { status: 201 }));
		const result = await uploadProjectKnowledgeFiles([
			{ id: "kf_1234567", name: "plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileType: "text", sizeBytes: 10, status: "ready", uploadedAt: 1 },
		], "project_user", "https://dify.example/v1/chat-messages", "secret");

		expect(result.names).toEqual(["plan.docx"]);
		expect(result.files).toEqual([{ type: "document", transfer_method: "local_file", url: "", upload_file_id: "dify-file-1" }]);
		expect(fetchMock).toHaveBeenCalledWith("https://dify.example/v1/files/upload", expect.objectContaining({ method: "POST" }));
	});

	it("skips legacy files without retained originals", async () => {
		readKnowledgeOriginal.mockResolvedValue(null);
		const fetchMock = vi.spyOn(globalThis, "fetch");
		const result = await uploadProjectKnowledgeFiles([
			{ id: "kf_1234567", name: "legacy.pdf", mimeType: "application/pdf", fileType: "text", sizeBytes: 20, status: "ready", uploadedAt: 1 },
		], "project_user", "https://dify.example/v1/chat-messages", "secret");

		expect(result).toEqual({ files: [], names: [] });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps SVG source in the text readback instead of uploading it to Dify", async () => {
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>');
		readProjectAgentTaskInputFile.mockResolvedValue(svg);
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"dify-svg"}', { status: 201 }));
		const result = await uploadProjectAgentTaskInputFiles([
			{ id: "input_svg", name: "diagram.svg", mimeType: "image/svg+xml", size: svg.byteLength },
		], "pat_test", "project_user", "https://dify.example/v1/chat-messages", "secret");

		expect(result).toEqual({ files: [], names: ["diagram.svg"], totalBytes: svg.byteLength });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("buildProjectAgentInputReadback", () => {
	it("passes SVG source as XML text without rendering it", async () => {
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>FINAL42</text></svg>');
		readProjectAgentTaskInputFile.mockResolvedValue(svg);

		const result = await buildProjectAgentInputReadback([
			{ id: "input_svg", name: "diagram.svg", mimeType: "image/svg+xml", size: svg.byteLength },
		], "pat_test");

		expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg"><text>FINAL42</text></svg>');
		expect(renderProjectAgentFile).not.toHaveBeenCalled();
	});

	it("uses TPDF OCR for sparse scanned PDF attachments and keeps the page references", async () => {
		const pdf = Buffer.from("%PDF-original");
		const dir = await mkdtemp(join(tmpdir(), "agent-ocr-test-"));
		const ocrPath = join(dir, "searchable.pdf");
		await writeFile(ocrPath, "%PDF-searchable");
		readProjectAgentTaskInputFile.mockResolvedValue(pdf);
		renderProjectAgentFile.mockResolvedValueOnce({ readbackText: "[Page 1]", pageCount: 1 });
		renderProjectAgentFile.mockResolvedValueOnce({ readbackText: "[Page 1] invoice number INV-42", pageCount: 1 });
		withTpdfOcrPdf.mockImplementation(async (input) => input.work(ocrPath));

		try {
			const result = await buildProjectAgentInputReadback([
				{ id: "input_pdf", name: "scan.pdf", mimeType: "application/pdf", size: pdf.byteLength },
			], "pat_test", undefined, { email: "user@example.com", projectId: "project_123" });

			expect(result).toContain("[Page 1] invoice number INV-42");
			expect(withTpdfOcrPdf).toHaveBeenCalledWith(expect.objectContaining({ fileId: "input_pdf", fileName: "scan.pdf" }));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("falls back to the original PDF readback when TPDF OCR is unavailable", async () => {
		const pdf = Buffer.from("%PDF-original");
		readProjectAgentTaskInputFile.mockResolvedValue(pdf);
		renderProjectAgentFile.mockResolvedValue({ readbackText: "[Page 1]", pageCount: 1 });
		withTpdfOcrPdf.mockRejectedValue(new Error("bridge unavailable"));

		const result = await buildProjectAgentInputReadback([
			{ id: "input_pdf", name: "scan.pdf", mimeType: "application/pdf", size: pdf.byteLength },
		], "pat_test", undefined, { email: "user@example.com", projectId: "project_123" });

		expect(result).toContain("[Page 1]");
		expect(result).toContain("TPDF OCR was unavailable");
	});

	it("propagates cancellation instead of treating it as an OCR outage", async () => {
		const pdf = Buffer.from("%PDF-original");
		readProjectAgentTaskInputFile.mockResolvedValue(pdf);
		renderProjectAgentFile.mockResolvedValue({ readbackText: "[Page 1]", pageCount: 1 });
		withTpdfOcrPdf.mockRejectedValue(new Error("aborted"));
		const controller = new AbortController();
		controller.abort(new Error("task cancelled"));

		await expect(buildProjectAgentInputReadback([
			{ id: "input_pdf", name: "scan.pdf", mimeType: "application/pdf", size: pdf.byteLength },
		], "pat_test", undefined, { email: "user@example.com", projectId: "project_123" }, controller.signal)).rejects.toThrow("task cancelled");
	});
});
