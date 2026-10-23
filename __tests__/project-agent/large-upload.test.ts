import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
	cancelLargeUpload,
	createLargeUploadSession,
	finalizeLargeUpload,
	getLargeUploadSession,
	LARGE_KNOWLEDGE_THRESHOLD,
	LARGE_SOURCE_RETENTION_MS,
	LARGE_UPLOAD_CHUNK_BYTES,
	writeLargeUploadChunk,
} from "@/lib/project-knowledge-large-upload";

const created: { sessionId?: string; fileId?: string } = {};

afterEach(async () => {
	if (created.sessionId) await cancelLargeUpload(created.sessionId, "owner@example.com");
	if (created.fileId) {
		const root = path.join(process.cwd(), "data", "project-originals", created.fileId);
		await Promise.all([fs.rm(root, { force: true }), fs.rm(`${root}.name`, { force: true }), fs.rm(`${root}.expires`, { force: true })]);
	}
	created.sessionId = undefined;
	created.fileId = undefined;
});

describe("large Project source upload", () => {
	it("rejects files that do not cross the large-source threshold", async () => {
		await expect(createLargeUploadSession({
			projectId: "project-1",
			ownerEmail: "owner@example.com",
			name: "small.pdf",
			mimeType: "application/pdf",
			sizeBytes: LARGE_KNOWLEDGE_THRESHOLD,
		})).rejects.toThrow("between 50 MiB");
	});

	it("writes ordered upload chunks and finalizes a retained source", async () => {
		const sizeBytes = LARGE_KNOWLEDGE_THRESHOLD + 17;
		const session = await createLargeUploadSession({
			projectId: "project-1",
			ownerEmail: "owner@example.com",
			name: "large report.pdf",
			mimeType: "application/pdf",
			sizeBytes,
		});
		created.sessionId = session.id;
		created.fileId = session.fileId;
		expect(session.chunkCount).toBe(Math.ceil(sizeBytes / LARGE_UPLOAD_CHUNK_BYTES));
		for (let index = session.chunkCount - 1; index >= 0; index -= 1) {
			const expected = Math.min(LARGE_UPLOAD_CHUNK_BYTES, sizeBytes - index * LARGE_UPLOAD_CHUNK_BYTES);
			const result = await writeLargeUploadChunk(session.id, session.ownerEmail, index, Buffer.alloc(expected, index + 1));
			if (index > 0) expect(result.complete).toBe(false);
		}
		const result = await finalizeLargeUpload(session.id, session.ownerEmail);
		created.sessionId = undefined;
		const stored = await fs.readFile(path.join(process.cwd(), "data", "project-originals", result.session.fileId));
		expect(stored.byteLength).toBe(sizeBytes);
		expect(stored[0]).toBe(1);
		expect(stored[LARGE_UPLOAD_CHUNK_BYTES]).toBe(2);
		expect(result.expiresAt).toBeGreaterThanOrEqual(Date.now() + LARGE_SOURCE_RETENTION_MS - 1000);
		expect(await getLargeUploadSession(session.id)).toBeNull();
	});
});
