import { randomUUID } from "crypto";
import path from "path";
import type { ProjectAgentTaskFile } from "./types";
import type { DifyInlineFile } from "./dify-inline-output";
import { INTERACTIVE_HTML_CSP, STATIC_HTML_CSP } from "./interactive-html";
import { writeProjectAgentFile } from "./task-store";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const INLINE_PREVIEW_TYPES = new Set(["application/pdf", "text/plain", "text/markdown", "text/csv", "text/tab-separated-values", "application/json", "application/x-ndjson", "application/xml", "application/yaml", "image/png", "image/jpeg", "image/webp", "image/gif"]);
const GENERATED_FILE_MIME_TYPES: Record<string, string> = {
	"html": "text/html", "htm": "text/html", "pdf": "application/pdf",
	"eml": "message/rfc822", "msg": "application/vnd.ms-outlook",
	"doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"ppt": "application/vnd.ms-powerpoint", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"txt": "text/plain", "md": "text/markdown", "csv": "text/csv", "tsv": "text/tab-separated-values", "json": "application/json",
	"jsonl": "application/x-ndjson", "xml": "application/xml", "yaml": "application/yaml", "yml": "application/yaml", "log": "text/plain",
	"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml",
};

interface DifyFileLink {
	label: string;
	url: string;
}

const GENERATED_FILE_NAME = /[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.(?:html?|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|png|jpe?g|webp|gif|jsonl?|xml|ya?ml|log|md)/giu;

function inferFileLabel(answer: string, url: URL, position: number, explicitLabel?: string): string {
	const pathName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
	if (explicitLabel && !/^https?:\/\//i.test(explicitLabel.trim())) return explicitLabel;
	const candidates = [...answer.slice(0, position).matchAll(GENERATED_FILE_NAME)].map((match) => match[0].trim());
	const extension = path.extname(pathName).toLowerCase();
	return candidates.reverse().find((name) => path.extname(name).toLowerCase() === extension) ?? explicitLabel ?? pathName;
}

function extractFileLinks(answer: string, origin: string): DifyFileLink[] {
	const files = new Map<string, DifyFileLink>();
	const candidates = new Map<string, { url: string; label?: string; position: number }>();
	for (const match of answer.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
		candidates.set(match[2], { url: match[2], label: match[1], position: match.index ?? 0 });
	}
	for (const match of answer.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
		const rawUrl = match[0].replace(/[.,;:!?]+$/, "");
		if (!candidates.has(rawUrl)) candidates.set(rawUrl, { url: rawUrl, position: match.index ?? 0 });
	}
	for (const candidate of candidates.values()) {
		try {
			const url = new URL(candidate.url);
			const segments = url.pathname.split("/");
			if (
				url.origin !== origin
				|| segments.length !== 4
				|| segments[1] !== "files"
				|| segments[2] !== "tools"
				|| !/^[A-Za-z0-9._-]+$/.test(segments[3])
			) continue;
			files.set(url.href, {
				label: inferFileLabel(answer, url, candidate.position, candidate.label),
				url: url.href,
			});
		} catch {
			continue;
		}
	}
	return [...files.values()];
}

export function safeFileName(label: string, fileUrl: string): string {
	let cleanLabel = label.replace(/[*`]/g, "").replace(/^download\s+/i, "").trim();
	// Link text like "Download chart: chart-q1.svg" -> keep only the file name at its end.
	const trailingName = cleanLabel.match(/([^\s:\\/]+\.[A-Za-z0-9]{2,5})\s*$/)?.[1];
	if (trailingName && trailingName !== cleanLabel) cleanLabel = trailingName;
	const basename = path.basename(cleanLabel || new URL(fileUrl).pathname.split("/").at(-1) || "agent-output.bin");
	return basename.replace(/[\\/\r\n\0]/g, "_").slice(0, 160) || "agent-output.bin";
}

async function readBoundedFile(response: Response, remainingBytes: number): Promise<Uint8Array> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > Math.min(MAX_FILE_BYTES, remainingBytes)) {
		throw new Error("Dify Agent output file exceeds the download limit");
	}
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > Math.min(MAX_FILE_BYTES, remainingBytes)) {
			await reader.cancel();
			throw new Error("Dify Agent output file exceeds the download limit");
		}
		chunks.push(value);
	}
	const result = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

export function findDifyGeneratedFileLinks(answer: string, origin: string): DifyFileLink[] {
	return extractFileLinks(answer, origin);
}

export function findDifyGeneratedFileLinksWithoutInlineDuplicates(
	answer: string,
	origin: string,
	inlineFiles: DifyInlineFile[],
): DifyFileLink[] {
	const inlineNames = new Set(inlineFiles.map((file) => path.basename(file.name).toLowerCase()));
	return extractFileLinks(answer, origin).filter((link) => !inlineNames.has(safeFileName(link.label, link.url).toLowerCase()));
}

export function hasUnreachableDifySandboxFileLink(answer: string, origin: string): boolean {
	for (const match of answer.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
		try {
			const url = new URL(match[0].replace(/[.,;:!?]+$/, ""));
			const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
			if (url.origin !== origin && isLoopback && /^\/files\/pat_[a-f0-9]{12}\/[^/]+$/i.test(url.pathname)) return true;
		} catch {
			continue;
		}
	}
	return false;
}

function sniffProjectAgentFileMimeType(bytes: Uint8Array): string | null {
	if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
	if (bytes.length >= 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "image/png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		const zipEntries = new TextDecoder().decode(bytes.slice(0, 64 * 1024));
		if (zipEntries.includes("word/document.xml")) return GENERATED_FILE_MIME_TYPES.docx;
		if (zipEntries.includes("xl/workbook.xml")) return GENERATED_FILE_MIME_TYPES.xlsx;
		if (zipEntries.includes("ppt/presentation.xml")) return GENERATED_FILE_MIME_TYPES.pptx;
	}
	const prefix = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^\uFEFF/, "").trimStart().toLowerCase();
	if (/^(?:<!doctype\s+html|<html[\s>])/i.test(prefix)) return "text/html";
	return null;
}

export function inferProjectAgentFileMimeType(fileName: string, contentType: string | null): string {
	const extension = path.extname(fileName).slice(1).toLowerCase();
	return GENERATED_FILE_MIME_TYPES[extension] ?? contentType?.split(";")[0]?.trim() ?? "application/octet-stream";
}

export function inferProjectAgentFileMetadata(fileName: string, contentType: string | null, bytes: Uint8Array): { name: string; mimeType: string } {
	const extension = path.extname(fileName).slice(1).toLowerCase();
	const responseType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	const mimeType = GENERATED_FILE_MIME_TYPES[extension]
		?? (responseType && responseType !== "application/octet-stream" ? responseType : null)
		?? sniffProjectAgentFileMimeType(bytes)
		?? (responseType || "application/octet-stream");
	const extensionFromMime = Object.entries(GENERATED_FILE_MIME_TYPES).find(([, mime]) => mime === mimeType)?.[0];
	const normalizedName = extensionFromMime && !GENERATED_FILE_MIME_TYPES[extension]
		? `${extension ? fileName.slice(0, -(extension.length + 1)) : fileName}.${extensionFromMime}`
		: fileName;
	return { name: normalizedName, mimeType };
}

export async function normalizeGeneratedOfficeFile(fileName: string, bytes: Uint8Array): Promise<Uint8Array> {
	if (!fileName.toLowerCase().endsWith(".xlsx") || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;
	try {
		const pkg = "jszip";
		const mod: any = await import(/* @vite-ignore */ pkg);
		const JSZip = mod.default || mod;
		const zip = await JSZip.loadAsync(bytes);
		const contentTypesFile = zip.file("[Content_Types].xml");
		if (!contentTypesFile) return bytes;
		const contentTypes = await contentTypesFile.async("string");
		const badNamespace = /(<Types\s+xmlns=")http:\/\/schemas\.openxmlformats\.org\/package\/2006\/relationships(")/;
		if (!badNamespace.test(contentTypes)) return bytes;
		zip.file("[Content_Types].xml", contentTypes.replace(badNamespace, "$1http://schemas.openxmlformats.org/package/2006/content-types$2"));
		return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
	} catch {
		return bytes;
	}
}

export function buildProjectAgentFileHeaders(file: Pick<ProjectAgentTaskFile, "name" | "mimeType" | "size">, preview: boolean, interactive = false): Record<string, string> {
	const asciiName = file.name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
	const isHtml = /\.html?$/i.test(file.name);
	const canPreviewInline = INLINE_PREVIEW_TYPES.has(file.mimeType) || isHtml;
	const headers: Record<string, string> = {
		"Content-Type": isHtml ? "text/html" : file.mimeType,
		"Content-Length": String(file.size),
		"Content-Disposition": `${preview && canPreviewInline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
	};
	if (preview && isHtml) {
		headers["Content-Security-Policy"] = interactive ? INTERACTIVE_HTML_CSP : STATIC_HTML_CSP;
	}
	return headers;
}

export async function cacheDifyGeneratedFiles(
	answer: string,
	taskId: string,
	projectId: string,
	apiUrl: string,
	apiKey: string,
	inlineFiles: DifyInlineFile[] = [],
): Promise<{ resultText: string; files: ProjectAgentTaskFile[] }> {
	const origin = new URL(apiUrl).origin;
	const links = findDifyGeneratedFileLinksWithoutInlineDuplicates(answer, origin, inlineFiles);
	const files: ProjectAgentTaskFile[] = [];
	const replacements = new Map<string, { name: string; path: string }>();
	let totalBytes = 0;

	for (const link of links) {
		const source = new URL(link.url);
		if (!source.searchParams.has("sign") && !source.searchParams.has("signature")) {
			throw new Error("Dify Agent returned an unsigned file link");
		}
		const response = await fetch(source, {
			headers: { Authorization: `Bearer ${apiKey}` },
			redirect: "manual",
			cache: "no-store",
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) throw new Error(`Dify Agent file download returned HTTP ${response.status}`);
		const downloaded = await readBoundedFile(response, MAX_TOTAL_BYTES - totalBytes);
		const id = randomUUID();
		const name = safeFileName(link.label, link.url);
		const bytes = await normalizeGeneratedOfficeFile(name, downloaded);
		if (bytes.byteLength > Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes)) {
			throw new Error("Dify Agent output file exceeds the download limit after Office package repair");
		}
		const metadata = inferProjectAgentFileMetadata(name, response.headers.get("content-type"), bytes);
		const file: ProjectAgentTaskFile = {
			id,
			name: metadata.name,
			mimeType: metadata.mimeType,
			size: bytes.byteLength,
		};
		await writeProjectAgentFile(taskId, id, bytes);
		files.push(file);
		totalBytes += bytes.byteLength;
		replacements.set(link.url, { name, path: `/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}/files/${id}` });
	}

	let resultText = answer;
	for (const [source, target] of replacements) {
		// A URL already inside a markdown link keeps the model's label; a bare URL becomes a Download link.
		resultText = resultText.replaceAll(`](${source})`, `](${target.path})`).replaceAll(source, `[Download ${target.name}](${target.path})`);
	}
	const inlineLinks: string[] = [];
	for (const inline of inlineFiles) {
		const name = path.basename(inline.name).replace(/[\\/\r\n\0]/g, "_").slice(0, 160);
		if (name && inline.resource) {
			const { boardId, resourceId, size } = inline.resource;
			files.push({ id: randomUUID(), name, mimeType: "application/pdf", size, resource: { boardId, resourceId } });
			inlineLinks.push(`[Download ${name}](/api/workspaces/${encodeURIComponent(boardId)}/resources/${encodeURIComponent(resourceId)})`);
			continue;
		}
		if (!name || inline.bytes.byteLength === 0) continue;
		const bytes = await normalizeGeneratedOfficeFile(name, inline.bytes);
		if (bytes.byteLength > Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes)) {
			throw new Error("Dify Agent inline output exceeds the download limit");
		}
		const id = randomUUID();
		const metadata = inferProjectAgentFileMetadata(name, null, bytes);
		const file: ProjectAgentTaskFile = {
			id,
			name: metadata.name,
			mimeType: metadata.mimeType,
			size: bytes.byteLength,
		};
		await writeProjectAgentFile(taskId, id, bytes);
		files.push(file);
		totalBytes += bytes.byteLength;
		inlineLinks.push(`[Download ${name}](/api/projects/${encodeURIComponent(projectId)}/agent/tasks/${encodeURIComponent(taskId)}/files/${id})`);
	}
	if (inlineLinks.length) resultText = stripNoLinkClaims(resultText);
	return { resultText, files };
}

// Exporter plugins hand the file straight to the app, so the model sometimes wrongly says it got no link; the app attaches the link itself.
export function stripNoLinkClaims(text: string): string {
	const claim = /\b(?:no|without|never)\b[^.!?\n]{0,40}\b(?:download )?(?:link|file)\b|\b(?:did not|didn't|cannot|can't|couldn't|could not)\b[^.!?\n]{0,40}\b(?:return|give|provide|produce)\b[^.!?\n]{0,30}\b(?:link|file)\b|\bhaven't (?:checked|reviewed|verified)\b[^.!?\n]{0,30}\b(?:saved )?file\b/i;
	return text.split(/(?<=[.!?])[ \t]+/).filter((sentence) => !claim.test(sentence)).join(" ").trim() || text;
}
