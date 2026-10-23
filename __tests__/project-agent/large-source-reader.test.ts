import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import XLSX from "xlsx";
import * as projectCap from "@/lib/capabilities/project";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { parseProjectSourceReadRequests, readProjectSourceExcerpt, stripProjectSourceReadRequests } from "@/lib/project-agent/large-source-reader";
import { fulfillLargeProjectSourceRequests } from "@/lib/project-agent/large-source-agent-loop";

const fileIds = ["kf_ab12345", "kf_cd12345"];

afterEach(async () => {
	await Promise.all(fileIds.map((fileId) => projectCap.deleteKnowledgeOriginal(fileId, "")));
});

describe("large Project source reader", () => {
	it("parses bounded tool requests and removes control tags from final answers", () => {
		const answer = `read <project_source_read>{"fileId":"kf_ab12345","kind":"pdf_pages","start":3,"end":5}</project_source_read>`;
		expect(parseProjectSourceReadRequests(answer)).toEqual([{ fileId: "kf_ab12345", kind: "pdf_pages", start: 3, end: 5, sheet: undefined, entry: undefined }]);
		expect(stripProjectSourceReadRequests(answer)).toBe("read");
	});

	it("reads only requested PDF pages through HTTP byte ranges", async () => {
		const fileId = fileIds[0];
		const bytes = await fs.readFile(path.join(process.cwd(), "public", "ai-workshop.pdf"));
		await projectCap.saveKnowledgeOriginal(fileId, bytes, "workshop.pdf");
		const file: KnowledgeFile = { id: fileId, projectId: "p1", name: "workshop.pdf", mimeType: "application/pdf", fileType: "text", sizeBytes: 60 * 1024 * 1024, status: "ready", isLargeSource: true, uploadedAt: Date.now() };
		const result = await readProjectSourceExcerpt(file, { fileId, kind: "pdf_pages", start: 2, end: 3 });
		expect(result.text).toContain("-- 2 of 77 --");
		expect(result.text).toContain("-- 3 of 77 --");
		expect(result.text).not.toContain("-- 1 of 77 --");
		expect(result.images).toHaveLength(2);
	});

	it("reads line ranges from large text sources without loading the full file", async () => {
		const fileId = fileIds[1];
		await fs.mkdir(path.join(process.cwd(), "data", "project-originals"), { recursive: true });
		const sourcePath = path.join(process.cwd(), "data", "project-originals", fileId);
		await fs.writeFile(sourcePath, "line one\nline two\nline three\n");
		await fs.writeFile(`${sourcePath}.name`, "notes.csv");
		const file: KnowledgeFile = { id: fileId, projectId: "p1", name: "notes.csv", mimeType: "text/csv", fileType: "text", sizeBytes: 60 * 1024 * 1024, status: "ready", isLargeSource: true, uploadedAt: Date.now() };
		const result = await readProjectSourceExcerpt(file, { fileId, kind: "lines", start: 2, end: 2 });
		expect(result.text).toBe("line two");
	});

	it("fulfills Agent read requests before returning the user-facing answer", async () => {
		const fileId = fileIds[1];
		const sourcePath = path.join(process.cwd(), "data", "project-originals", fileId);
		await fs.mkdir(path.dirname(sourcePath), { recursive: true });
		await fs.writeFile(sourcePath, "alpha\nbeta\ngamma\n");
		await fs.writeFile(`${sourcePath}.name`, "notes.csv");
		const file: KnowledgeFile = { id: fileId, projectId: "p1", name: "notes.csv", mimeType: "text/csv", fileType: "text", sizeBytes: 60 * 1024 * 1024, status: "ready", isLargeSource: true, uploadedAt: Date.now() };
		const result = await fulfillLargeProjectSourceRequests({
			message: { answer: `<project_source_read>{"fileId":"${fileId}","kind":"lines","start":2,"end":2}</project_source_read>`, conversationId: "conversation" },
			files: [file], user: "project-user", ownerEmail: "owner@example.com", projectId: "p1", endpoint: "https://dify.example/chat-messages", apiKey: "test-key",
			continueDify: async (input) => {
				expect(input.conversationId).toBe("conversation");
				expect(input.query).toContain("beta");
				return { answer: "The relevant row is beta.", conversationId: "conversation" };
			},
		});
		expect(result.answer).toBe("The relevant row is beta.");
	});

	it("lists Excel sheets and reads only the requested row window", async () => {
		const fileId = fileIds[0];
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name", "Value"], ["Revenue", "125"]]), "Summary");
		await projectCap.saveKnowledgeOriginal(fileId, Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), "report.xlsx");
		const file: KnowledgeFile = { id: fileId, projectId: "p1", name: "report.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileType: "text", sizeBytes: 60 * 1024 * 1024, status: "ready", isLargeSource: true, uploadedAt: Date.now() };
		const sheets = await readProjectSourceExcerpt(file, { fileId, kind: "xlsx_sheets" });
		const rows = await readProjectSourceExcerpt(file, { fileId, kind: "xlsx_rows", sheet: "Summary", start: 2, end: 2 });
		expect(sheets.text).toContain("Summary");
		expect(rows.text).toContain("Revenue");
		expect(rows.text).toContain("125");
	});
});
