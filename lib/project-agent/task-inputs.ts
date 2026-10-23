import { inferProjectAgentFileMimeType } from "./files";
import { isLargePdfInput } from "./large-input";

function configuredLimit(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export const PROJECT_AGENT_INPUT_MAX_FILES = configuredLimit("PROJECT_AGENT_INPUT_MAX_FILES", 20);
export const PROJECT_AGENT_INPUT_MAX_FILE_BYTES = configuredLimit("PROJECT_AGENT_INPUT_MAX_FILE_BYTES", 100 * 1024 * 1024);
export const PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES = configuredLimit("PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES", 512 * 1024 * 1024);
/** Large PDFs stream to disk and go straight to the sandbox (never to the model provider or memory), so they have their own, higher limits. */
export const PROJECT_AGENT_INPUT_MAX_PDF_BYTES = configuredLimit("PROJECT_AGENT_INPUT_MAX_PDF_BYTES", 1024 * 1024 * 1024);
export const PROJECT_AGENT_INPUT_MAX_PDF_TOTAL_BYTES = configuredLimit("PROJECT_AGENT_INPUT_MAX_PDF_TOTAL_BYTES", 2 * 1024 * 1024 * 1024);

/** Per-file limit by what the file is: a PDF may be much larger than other attachments. */
export function inputFileMaxBytes(file: { name: string; mimeType: string }): number {
	const pdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
	return pdf ? Math.max(PROJECT_AGENT_INPUT_MAX_PDF_BYTES, PROJECT_AGENT_INPUT_MAX_FILE_BYTES) : PROJECT_AGENT_INPUT_MAX_FILE_BYTES;
}

const DOCUMENT_MIME_TYPES = new Set([
	"application/pdf", "application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/json", "application/x-ndjson", "application/yaml", "application/xml", "text/xml", "text/csv", "text/tab-separated-values",
	// Emails: the email-work skill reads them in the sandbox (extract-msg for Outlook .msg).
	"message/rfc822", "application/vnd.ms-outlook",
]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function classifyProjectAgentInputFile(file: { name: string; type: string }): { mimeType: string; type: "document" | "image" } {
	const mimeType = inferProjectAgentFileMimeType(file.name, file.type || null).toLowerCase();
	if (mimeType === "image/svg+xml" && file.name.toLowerCase().endsWith(".svg")) return { mimeType, type: "document" };
	if (IMAGE_MIME_TYPES.has(mimeType)) return { mimeType, type: "image" };
	if (mimeType.startsWith("text/") || DOCUMENT_MIME_TYPES.has(mimeType)) return { mimeType, type: "document" };
	throw new Error(`Project Agent does not support the attached file format: ${file.name}`);
}

export interface ProjectAgentRequestedFile { id: string; name: string; mimeType: string; size: number; projectSourceId?: string }

/** Validates the already-uploaded files a client lists when it starts a task (ids from the upload route, sizes within the limits). */
export function parseProjectAgentRequestedFiles(value: unknown): { files: ProjectAgentRequestedFile[] } | { error: string; status: number } {
	const requested = value ?? [];
	if (!Array.isArray(requested) || requested.length > PROJECT_AGENT_INPUT_MAX_FILES) {
		return { error: `Attach no more than ${PROJECT_AGENT_INPUT_MAX_FILES} files to a Project Agent task`, status: 413 };
	}
	let totalBytes = 0, largePdfBytes = 0;
	const files: ProjectAgentRequestedFile[] = [];
	const ids = new Set<string>();
	for (const file of requested) {
		if (!file || typeof file.id !== "string" || typeof file.name !== "string" || typeof file.mimeType !== "string"
			|| !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > inputFileMaxBytes(file)) {
			return { error: "Invalid or oversized Project Agent attachment", status: 413 };
		}
		if (!/^[A-Za-z0-9_-]{3,128}$/.test(file.id) || ids.has(file.id) || !file.name.trim() || file.name.length > 255 || file.mimeType.length > 255) {
			return { error: "Invalid or duplicate Project Agent attachment", status: 400 };
		}
		ids.add(file.id);
		if (file.projectSourceId !== undefined && (typeof file.projectSourceId !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(file.projectSourceId))) {
			return { error: "Invalid Project source attachment", status: 400 };
		}
		if (isLargePdfInput(file)) largePdfBytes += file.size; else totalBytes += file.size;
		const projectSourceId = typeof file.projectSourceId === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(file.projectSourceId) ? file.projectSourceId : undefined;
		files.push({ id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, ...(projectSourceId ? { projectSourceId } : {}) });
	}
	if (totalBytes > PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES) {
		return { error: `Project Agent attachments exceed the ${PROJECT_AGENT_INPUT_MAX_TOTAL_BYTES / 1024 / 1024} MiB per-task limit`, status: 413 };
	}
	if (largePdfBytes > PROJECT_AGENT_INPUT_MAX_PDF_TOTAL_BYTES) {
		return { error: `Project Agent PDF attachments exceed the ${PROJECT_AGENT_INPUT_MAX_PDF_TOTAL_BYTES / 1024 / 1024} MiB per-task limit`, status: 413 };
	}
	return { files };
}
