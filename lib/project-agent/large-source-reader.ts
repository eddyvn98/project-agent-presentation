import { createServer } from "http";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { createInterface } from "readline";
import path from "path";
import { pathToFileURL } from "url";
import { withTpdfOcrPdf } from "./tpdf-ocr-client";
import { withPdfjs } from "./pdfjs-lock";
import { inflateRawSync } from "zlib";
import sharp from "sharp";
import * as projectCap from "@/lib/capabilities/project";
import type { KnowledgeFile } from "@/stores/useProjectStore";

const MAX_UNITS = 10;
const MAX_EXCERPT_CHARS = 30_000;
const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;

export type ProjectSourceReadRequest = {
	fileId: string;
	kind: "pdf_pages" | "pdf_ocr_pages" | "lines" | "docx_paragraphs" | "pptx_slides" | "xlsx_sheets" | "xlsx_rows" | "archive_list" | "archive_entry" | "image";
	start?: number;
	end?: number;
	sheet?: string;
	entry?: string;
};

export interface ProjectSourceExcerpt {
	fileId: string;
	name: string;
	text: string;
	images?: { name: string; bytes: Buffer }[];
}

function boundedRange(start: number | undefined, end: number | undefined): [number, number] {
	const from = Math.max(1, Math.floor(Number.isFinite(start) ? start! : 1));
	const to = Math.max(from, Math.floor(Number.isFinite(end) ? end! : from));
	if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to - from + 1 > MAX_UNITS) throw new Error(`Read at most ${MAX_UNITS} pages or units per request`);
	return [from, to];
}

async function readLines(filePath: string, start: number, end: number): Promise<string> {
	const stream = createReadStream(filePath, { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Infinity });
	const output: string[] = [];
	let index = 0;
	for await (const line of lines) {
		index += 1;
		if (index < start) continue;
		if (index > end || output.join("\n").length >= MAX_EXCERPT_CHARS) break;
		output.push(line.slice(0, MAX_EXCERPT_CHARS));
	}
	return output.join("\n").slice(0, MAX_EXCERPT_CHARS);
}

async function readRange(filePath: string, position: number, length: number): Promise<Buffer> {
	const buffer = Buffer.alloc(length);
	const handle = await fs.open(filePath, "r");
	try {
		const { bytesRead } = await handle.read(buffer, 0, length, position);
		return buffer.subarray(0, bytesRead);
	} finally { await handle.close(); }
}

async function readZipEntry(filePath: string, entryName: string): Promise<Buffer> {
	if (entryName.startsWith("/") || entryName.split(/[\\/]/).includes("..")) throw new Error("Invalid archive entry");
	const stat = await fs.stat(filePath);
	const tailLength = Math.min(stat.size, 65_557);
	const tail = await readRange(filePath, stat.size - tailLength, tailLength);
	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i -= 1) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
	if (eocd < 0) throw new Error("Could not read archive directory");
	const count = tail.readUInt16LE(eocd + 10);
	const directoryBytes = tail.readUInt32LE(eocd + 12);
	const directoryOffset = tail.readUInt32LE(eocd + 16);
	if (count > 20_000 || directoryBytes > MAX_ZIP_ENTRY_BYTES) throw new Error("Archive directory is too large to inspect safely");
	const directory = await readRange(filePath, directoryOffset, directoryBytes);
	let cursor = 0;
	for (let item = 0; item < count && cursor + 46 <= directory.length; item += 1) {
		if (directory.readUInt32LE(cursor) !== 0x02014b50) break;
		const method = directory.readUInt16LE(cursor + 10);
		const compressedSize = directory.readUInt32LE(cursor + 20);
		const uncompressedSize = directory.readUInt32LE(cursor + 24);
		const nameLength = directory.readUInt16LE(cursor + 28);
		const extraLength = directory.readUInt16LE(cursor + 30);
		const commentLength = directory.readUInt16LE(cursor + 32);
		const localOffset = directory.readUInt32LE(cursor + 42);
		const name = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
		cursor += 46 + nameLength + extraLength + commentLength;
		if (name !== entryName) continue;
		if (compressedSize > MAX_ZIP_ENTRY_BYTES || uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error("Requested archive part exceeds the 32 MiB safety limit");
		const local = await readRange(filePath, localOffset, 30);
		if (local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid archive entry header");
		const dataOffset = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
		const compressed = await readRange(filePath, dataOffset, compressedSize);
		const output = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_BYTES }) : null;
		if (!output) throw new Error(`Unsupported archive compression method: ${method}`);
		if (output.byteLength !== uncompressedSize) throw new Error("Archive entry size did not match its directory");
		return output;
	}
	throw new Error(`Archive does not contain ${entryName}`);
}

async function listZipEntries(filePath: string): Promise<string[]> {
	const stat = await fs.stat(filePath);
	const tailLength = Math.min(stat.size, 65_557);
	const tail = await readRange(filePath, stat.size - tailLength, tailLength);
	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i -= 1) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
	if (eocd < 0) throw new Error("Could not read archive directory");
	const count = tail.readUInt16LE(eocd + 10);
	const directoryBytes = tail.readUInt32LE(eocd + 12);
	const directoryOffset = tail.readUInt32LE(eocd + 16);
	if (count > 20_000 || directoryBytes > MAX_ZIP_ENTRY_BYTES) throw new Error("Archive directory is too large to inspect safely");
	const directory = await readRange(filePath, directoryOffset, directoryBytes);
	const names: string[] = [];
	let cursor = 0;
	for (let item = 0; item < count && cursor + 46 <= directory.length; item += 1) {
		if (directory.readUInt32LE(cursor) !== 0x02014b50) break;
		const nameLength = directory.readUInt16LE(cursor + 28);
		const extraLength = directory.readUInt16LE(cursor + 30);
		const commentLength = directory.readUInt16LE(cursor + 32);
		const name = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
		if (!name.endsWith("/")) names.push(name);
		cursor += 46 + nameLength + extraLength + commentLength;
	}
	return names.slice(0, 200);
}

function xmlText(value: string): string {
	return value.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

type PdfPagesRead = { text: string; images: { name: string; bytes: Buffer }[] };

function readPdfPages(filePath: string, name: string, start: number, end: number): Promise<PdfPagesRead> {
	return withPdfjs(() => readPdfPagesAlone(filePath, name, start, end));
}

async function readPdfPagesAlone(filePath: string, name: string, start: number, end: number): Promise<PdfPagesRead> {
	const stat = await fs.stat(filePath);
	const server = createServer((req, res) => {
		const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
		const headers = { "Accept-Ranges": "bytes", "Content-Type": "application/pdf", "Cache-Control": "no-store" };
		if (!range) {
			res.writeHead(200, { ...headers, "Content-Length": stat.size });
			if (req.method === "HEAD") res.end(); else createReadStream(filePath).pipe(res);
			return;
		}
		const from = Number(range[1]);
		const to = Math.min(Number(range[2] || stat.size - 1), stat.size - 1);
		if (from > to || from >= stat.size) { res.writeHead(416).end(); return; }
		res.writeHead(206, { ...headers, "Content-Length": to - from + 1, "Content-Range": `bytes ${from}-${to}/${stat.size}` });
		if (req.method === "HEAD") res.end(); else createReadStream(filePath, { start: from, end: to }).pipe(res);
	});
	await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Could not open PDF range reader");
	const { PDFParse } = await import("pdf-parse");
	// pdf-parse bundles pdfjs 5; the app's own pdfjs-dist 4 leaves its worker on globalThis, so hide it and pin the matching one.
	const priorWorker = (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;
	delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;
	PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs")).href);
	const parser = new PDFParse({ url: `http://127.0.0.1:${address.port}/source.pdf`, rangeChunkSize: 256 * 1024 });
	try {
		const result = await parser.getText({ first: start, last: end });
		const screenshots = await parser.getScreenshot({ first: start, last: Math.min(end, start + 2), imageBuffer: true, imageDataUrl: false, desiredWidth: 1400 });
		const images = await Promise.all(screenshots.pages.map(async (page) => ({
			name: `${name}.page-${page.pageNumber}`,
			bytes: await sharp(Buffer.from(page.data)).jpeg({ quality: 78 }).toBuffer(),
		})));
		return { text: result.text.slice(0, MAX_EXCERPT_CHARS), images };
	} finally {
		await parser.destroy();
		if (priorWorker) (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = priorWorker; else delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

export function parseProjectSourceReadRequests(answer: string): ProjectSourceReadRequest[] {
	const requests: ProjectSourceReadRequest[] = [];
	for (const [, raw] of answer.matchAll(/<project_source_read>([\s\S]*?)<\/project_source_read>/gi)) {
		try {
			const value = JSON.parse(raw) as Record<string, unknown>;
			if (typeof value.fileId !== "string" || !/^kf_[a-f0-9]{7,32}$/.test(value.fileId)) continue;
			const kinds = new Set(["pdf_pages", "pdf_ocr_pages", "lines", "docx_paragraphs", "pptx_slides", "xlsx_sheets", "xlsx_rows", "archive_list", "archive_entry", "image"]);
			if (typeof value.kind !== "string" || !kinds.has(value.kind)) continue;
			requests.push({ fileId: value.fileId, kind: value.kind as ProjectSourceReadRequest["kind"], start: typeof value.start === "number" ? value.start : undefined, end: typeof value.end === "number" ? value.end : undefined, sheet: typeof value.sheet === "string" ? value.sheet : undefined, entry: typeof value.entry === "string" ? value.entry : undefined });
		} catch { /* malformed model request is discarded */ }
	}
	return requests.slice(0, 3);
}

export function stripProjectSourceReadRequests(answer: string): string {
	return answer.replace(/<project_source_read>[\s\S]*?(?:<\/project_source_read>|$)/gi, "").trim();
}

export async function readProjectSourceExcerpt(
	file: KnowledgeFile,
	request: ProjectSourceReadRequest,
	identity?: { email: string; projectId: string; signal?: AbortSignal },
): Promise<ProjectSourceExcerpt> {
	if (!file.isLargeSource || file.id !== request.fileId) throw new Error("Requested source is unavailable");
	const source = await projectCap.getKnowledgeOriginalPath(file.id);
	if (!source) throw new Error("This source has expired; extend its storage or upload it again");
	const ext = path.extname(file.name).toLowerCase();
	const [start, end] = boundedRange(request.start, request.end);
	if (request.kind === "pdf_pages" && ext === ".pdf") {
		const result = await readPdfPages(source.path, file.name, start, end);
		return { fileId: file.id, name: file.name, ...result };
	}
	if (request.kind === "pdf_ocr_pages" && ext === ".pdf") {
		if (!identity) throw new Error("TPDF OCR requires the authenticated Project identity");
		const result = await withTpdfOcrPdf({
			sourcePath: source.path,
			fileId: file.id,
			fileName: file.name,
			identity: { email: identity.email, projectId: identity.projectId },
			signal: identity.signal,
			work: (ocrPdfPath) => readPdfPages(ocrPdfPath, file.name, start, end),
		});
		return { fileId: file.id, name: file.name, ...result };
	}
	if (request.kind === "lines" && [".txt", ".md", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml", ".log", ".html", ".htm", ".dxf", ".ifc"].includes(ext)) return { fileId: file.id, name: file.name, text: await readLines(source.path, start, end) };
	if (request.kind === "docx_paragraphs" && ext === ".docx") {
		const xml = (await readZipEntry(source.path, "word/document.xml")).toString("utf8");
		const paragraphs = [...xml.matchAll(/<w:p(?:\s|>)[\s\S]*?<\/w:p>/g)].map(([paragraph]) => xmlText([...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(([, text]) => text).join(" "))).filter(Boolean);
		return { fileId: file.id, name: file.name, text: paragraphs.slice(start - 1, end).join("\n").slice(0, MAX_EXCERPT_CHARS) };
	}
	if (request.kind === "pptx_slides" && ext === ".pptx") {
		const slides: string[] = [];
		for (let page = start; page <= end; page += 1) {
			const xml = (await readZipEntry(source.path, `ppt/slides/slide${page}.xml`)).toString("utf8");
			slides.push(`Slide ${page}: ${xmlText([...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(([, text]) => text).join(" "))}`);
		}
		return { fileId: file.id, name: file.name, text: slides.join("\n").slice(0, MAX_EXCERPT_CHARS) };
	}
	if ((request.kind === "xlsx_rows" || request.kind === "xlsx_sheets") && ext === ".xlsx") {
		const workbook = (await readZipEntry(source.path, "xl/workbook.xml")).toString("utf8");
		const sheetNames = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map(([, attrs]) => attrs.match(/\bname="([^"]+)"/)?.[1]).filter((name): name is string => Boolean(name));
		if (request.kind === "xlsx_sheets") return { fileId: file.id, name: file.name, text: `Sheets: ${sheetNames.join(", ")}` };
		if (!request.sheet) throw new Error("Choose a sheet after listing the workbook sheets");
		const rels = (await readZipEntry(source.path, "xl/_rels/workbook.xml.rels")).toString("utf8");
		const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map(([, attrs]) => ({ name: attrs.match(/\bname="([^"]+)"/)?.[1], id: attrs.match(/r:id="([^"]+)"/)?.[1] }));
		const sheet = sheets.find((item) => item.name === request.sheet);
		const target = sheet && [...rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map(([, attrs]) => ({ id: attrs.match(/\bId="([^"]+)"/)?.[1], target: attrs.match(/\bTarget="([^"]+)"/)?.[1] })).find((item) => item.id === sheet.id)?.target;
		if (!target) throw new Error(`Workbook has no sheet named ${request.sheet}`);
		const entry = path.posix.normalize(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
		const xml = (await readZipEntry(source.path, entry)).toString("utf8");
		const shared = await readZipEntry(source.path, "xl/sharedStrings.xml").then((raw) => [...raw.toString("utf8").matchAll(/<si(?:\s|>)[\s\S]*?<\/si>/g)].map(([item]) => xmlText([...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, value]) => value).join("")))).catch(() => [] as string[]);
		const rows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].filter(([, number]) => Number(number) >= start && Number(number) <= end).map(([, number, row]) => {
			const cells = [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(([, attrs, cell]) => {
				const value = xmlText(cell);
				const sharedIndex = Number(value);
				const resolved = attrs.match(/\bt="s"/) && Number.isInteger(sharedIndex) ? shared[sharedIndex] ?? value : value;
				return `${attrs.match(/\br="([^"]+)"/)?.[1] ?? "?"}=${resolved}`;
			});
			return `Row ${number}: ${cells.join(" | ")}`;
		});
		return { fileId: file.id, name: file.name, text: rows.join("\n").slice(0, MAX_EXCERPT_CHARS) };
	}
	if (request.kind === "archive_list" && ext === ".zip") return { fileId: file.id, name: file.name, text: (await listZipEntries(source.path)).join("\n") };
	if (request.kind === "archive_entry" && ext === ".zip" && request.entry) {
		return { fileId: file.id, name: file.name, text: (await readZipEntry(source.path, request.entry)).toString("utf8").slice(0, MAX_EXCERPT_CHARS) };
	}
	if (request.kind === "image" && [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
		const bytes = await sharp(source.path).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
		return { fileId: file.id, name: file.name, text: "Image resized for visual inspection.", images: [{ name: file.name, bytes }] };
	}
	throw new Error(`This file type does not support ${request.kind} reads yet`);
}
