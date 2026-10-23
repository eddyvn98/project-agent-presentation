import type { KnowledgeFile } from "@/stores/useProjectStore";
import * as projectCap from "@/lib/capabilities/project";
import { readProjectAgentTaskInputFile } from "./task-store";
import type { ProjectAgentTaskInputFile } from "./types";
import { PROJECT_AGENT_INPUT_MAX_FILE_BYTES, PROJECT_AGENT_INPUT_MAX_FILES, PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES } from "./task-inputs";

const MAX_FILE_BYTES = PROJECT_AGENT_INPUT_MAX_FILE_BYTES;
const MAX_TOTAL_BYTES = PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES;
const MAX_FILES = PROJECT_AGENT_INPUT_MAX_FILES;

export interface DifyChatFile {
	type: "document" | "image";
	transfer_method: "local_file";
	url: "";
	upload_file_id: string;
}

export async function uploadProjectAgentReviewFile(
	file: { name: string; mimeType: string },
	bytes: Buffer,
	user: string,
	chatEndpoint: string,
	apiKey: string,
	image: boolean,
): Promise<DifyChatFile> {
	if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`Project Agent review attachment exceeds ${MAX_FILE_BYTES / 1024 / 1024} MiB`);
	const form = new FormData();
	const imageType = file.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
	form.append("file", new Blob([new Uint8Array(bytes)], { type: image ? imageType : file.mimeType }), image ? `${file.name}.review.${imageType === "image/jpeg" ? "jpg" : "png"}` : file.name);
	form.append("user", user);
	const response = await fetch(uploadEndpoint(chatEndpoint), {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form,
		cache: "no-store",
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`Dify Project Agent review upload failed (${response.status})`);
	const result = await response.json().catch(() => null) as { id?: unknown } | null;
	if (typeof result?.id !== "string" || !result.id) throw new Error("Dify review upload response did not include an id");
	return { type: image ? "image" : "document", transfer_method: "local_file", url: "", upload_file_id: result.id };
}

import { isLargePdfInput } from "./large-input";

export async function uploadProjectAgentTaskInputFiles(
	files: ProjectAgentTaskInputFile[],
	taskId: string,
	user: string,
	chatEndpoint: string,
	apiKey: string,
): Promise<{ files: DifyChatFile[]; names: string[]; totalBytes: number }> {
	if (files.length > MAX_FILES) throw new Error(`Project Agent accepts up to ${MAX_FILES} task attachments`);
	const uploaded: DifyChatFile[] = [];
	const names: string[] = [];
	let totalBytes = 0;
	for (const file of files) {
		if (isLargePdfInput(file)) {
			names.push(file.name);
			continue;
		}
		if (file.size > MAX_FILE_BYTES || totalBytes + file.size > MAX_TOTAL_BYTES) {
			throw new Error(`Project Agent input files exceed the ${MAX_TOTAL_BYTES / 1024 / 1024} MiB total limit`);
		}
		const bytes = await readProjectAgentTaskInputFile(taskId, file.id);
		if (bytes.byteLength !== file.size) throw new Error(`Project Agent input file changed before processing: ${file.name}`);
		const isSvg = file.mimeType === "image/svg+xml" && file.name.toLowerCase().endsWith(".svg");
		if (isSvg) {
			names.push(file.name);
			totalBytes += bytes.byteLength;
			continue;
		}
		const form = new FormData();
		form.append("file", new Blob([new Uint8Array(bytes)], { type: file.mimeType }), file.name);
		form.append("user", user);
		const response = await fetch(uploadEndpoint(chatEndpoint), {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form,
			cache: "no-store",
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) throw new Error(`Dify Project Agent input upload failed (${response.status})`);
		const result = await response.json().catch(() => null) as { id?: unknown } | null;
		if (typeof result?.id !== "string" || !result.id) throw new Error("Dify Project Agent input upload response did not include an id");
		uploaded.push({ type: file.mimeType.startsWith("image/") ? "image" : "document", transfer_method: "local_file", url: "", upload_file_id: result.id });
		names.push(file.name);
		totalBytes += bytes.byteLength;
	}
	return { files: uploaded, names, totalBytes };
}

function uploadEndpoint(chatEndpoint: string): string {
	return chatEndpoint.replace(/\/chat-messages\/?$/, "/files/upload");
}

async function readSource(file: KnowledgeFile): Promise<{ buffer: Buffer; filename: string } | null> {
	if (file.fileType === "image") {
		const image = await projectCap.readKnowledgeImage(file.id);
		return image ? { buffer: image.buffer, filename: file.name } : null;
	}
	return projectCap.readKnowledgeOriginal(file.id);
}

async function uploadFile(
	file: KnowledgeFile,
	buffer: Buffer,
	filename: string,
	user: string,
	endpoint: string,
	apiKey: string,
): Promise<DifyChatFile> {
	const form = new FormData();
	form.append("file", new Blob([new Uint8Array(buffer)], { type: file.mimeType }), filename);
	form.append("user", user);
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form,
		cache: "no-store",
		signal: AbortSignal.timeout(30_000),
	});
	const raw = await response.text();
	if (!response.ok) throw new Error(`Dify Project Agent file upload failed (${response.status})`);
	let result: { id?: unknown };
	try { result = JSON.parse(raw) as { id?: unknown }; } catch { throw new Error("Dify Project Agent returned an invalid file upload response"); }
	if (typeof result.id !== "string" || !result.id) throw new Error("Dify Project Agent file upload response did not include an id");
	return {
		type: file.fileType === "image" ? "image" : "document",
		transfer_method: "local_file",
		url: "",
		upload_file_id: result.id,
	};
}

export async function uploadProjectKnowledgeFiles(
	files: KnowledgeFile[],
	user: string,
	chatEndpoint: string,
	apiKey: string,
	limits: { maxFiles?: number; maxTotalBytes?: number } = {},
): Promise<{ files: DifyChatFile[]; names: string[] }> {
	const readyFiles = files.filter((file) => file.status === "ready");
	const uploaded: DifyChatFile[] = [];
	const names: string[] = [];
	let totalBytes = 0;
	for (const file of readyFiles) {
		if (uploaded.length >= Math.max(0, limits.maxFiles ?? MAX_FILES)) break;
		const totalLimit = Math.max(0, limits.maxTotalBytes ?? MAX_TOTAL_BYTES);
		if (file.sizeBytes > MAX_FILE_BYTES || file.sizeBytes + totalBytes > totalLimit) continue;
		const source = await readSource(file);
		if (!source || source.buffer.byteLength > MAX_FILE_BYTES || totalBytes + source.buffer.byteLength > (limits.maxTotalBytes ?? MAX_TOTAL_BYTES)) continue;
		uploaded.push(await uploadFile(file, source.buffer, source.filename, user, uploadEndpoint(chatEndpoint), apiKey));
		names.push(source.filename);
		totalBytes += source.buffer.byteLength;
	}
	return { files: uploaded, names };
}
