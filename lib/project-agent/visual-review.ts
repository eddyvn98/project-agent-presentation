import { createCanvas } from "@napi-rs/canvas";
import { existsSync } from "fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { withPdfjs } from "./pdfjs-lock";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import { fitWorkbookToPageWidth } from "./xlsx-fit";
import { convertOfficeDocumentToPdf, isOfficeDocumentMimeType } from "@/lib/workspace/office-preview-conversion";

const PAGE_LIMIT = 16;
const LONG_FILE_SAMPLE = 8;
const LONG_FILE_CELL_WIDTH = 480;
const CELL_WIDTH = 720;
const HTML_HEIGHT_LIMIT = 12_000;
const TEXT_PREVIEW_LIMIT = 80_000;
const SVG_PREVIEW_LIMIT = 5 * 1024 * 1024;
const IMAGE_PREVIEW_WIDTH = 1920;
const IMAGE_PREVIEW_HEIGHT = 12_000;
const IMAGE_PIXEL_LIMIT = 40_000_000;
const REVIEW_CELL_WIDTH = 960;
const REVIEW_CELL_HEIGHT = 4_800;
const REVIEW_LABEL_HEIGHT = 52;
const DIRECT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "js", "jsx", "ts", "tsx", "css", "sql"]);
const PDFJS_PACKAGE_PATH = path.join(process.cwd(), "node_modules/pdfjs-dist");
GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(PDFJS_PACKAGE_PATH, "legacy/build/pdf.worker.mjs")).href;
const standardFontDataUrl = pathToFileURL(path.join(PDFJS_PACKAGE_PATH, "standard_fonts/")).href;

export interface VisualReviewImage {
	bytes: Buffer;
	label: string;
	pageCount?: number;
	readbackText?: string;
}

export async function buildVisualReviewContactSheet(
	images: Array<{ name: string; bytes: Buffer }>,
): Promise<Buffer> {
	if (!images.length) throw new Error("Project Agent visual review has no rendered previews");
	const cells = await Promise.all(images.map(async ({ name, bytes }) => {
		const image = await sharp(bytes, { limitInputPixels: IMAGE_PIXEL_LIMIT })
			.resize({ width: REVIEW_CELL_WIDTH, height: REVIEW_CELL_HEIGHT, fit: "inside", withoutEnlargement: true })
			.png().toBuffer();
		const metadata = await sharp(image).metadata();
		const label = Buffer.from(`<svg width="${REVIEW_CELL_WIDTH}" height="${REVIEW_LABEL_HEIGHT}"><rect width="100%" height="100%" fill="#111827"/><text x="16" y="34" fill="white" font-family="Arial,sans-serif" font-size="20">${escapeHtml(name.slice(0, 120))}</text></svg>`);
		const cell = await sharp({
			create: { width: REVIEW_CELL_WIDTH, height: REVIEW_LABEL_HEIGHT + (metadata.height ?? 1), channels: 4, background: "#e5e7eb" },
		}).composite([{ input: label, top: 0, left: 0 }, { input: image, top: REVIEW_LABEL_HEIGHT, left: 0 }]).png().toBuffer();
		return { bytes: cell, height: REVIEW_LABEL_HEIGHT + (metadata.height ?? 1) };
	}));
	const columns = Math.min(2, cells.length);
	const rows = Math.ceil(cells.length / columns);
	const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...cells.slice(row * columns, (row + 1) * columns).map((cell) => cell.height)));
	let top = 0;
	const composites = cells.map((cell, index) => {
		const row = Math.floor(index / columns);
		const result = { input: cell.bytes, left: (index % columns) * REVIEW_CELL_WIDTH, top };
		if (index % columns === columns - 1 || index === cells.length - 1) top += rowHeights[row];
		return result;
	});
	return sharp({
		create: { width: columns * REVIEW_CELL_WIDTH, height: rowHeights.reduce((sum, height) => sum + height, 0), channels: 4, background: "#e5e7eb" },
	}).composite(composites).png().toBuffer();
}

/** Every page of a short file; for a long one the cover, the first pages, the last page and an even spread between. */
export function samplePages(total: number): number[] {
	if (total <= PAGE_LIMIT) return Array.from({ length: total }, (_, index) => index + 1);
	const pages = new Set([1, 2, 3, total]);
	const step = (total - 1) / (LONG_FILE_SAMPLE - pages.size + 1);
	for (let index = 1; pages.size < LONG_FILE_SAMPLE; index += 1) pages.add(Math.min(total, Math.round(1 + index * step)));
	return [...pages].sort((a, b) => a - b);
}

async function renderPdf(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	return withPdfjs(() => renderPdfPages(bytes, label));
}

async function renderPdfPages(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, standardFontDataUrl }).promise;
	try {
		const sampled = new Set(samplePages(document.numPages));
		const longFile = document.numPages > PAGE_LIMIT;
		const cellWidth = longFile ? LONG_FILE_CELL_WIDTH : CELL_WIDTH;
		const rendered: Buffer[] = [];
		const readback: string[] = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
			const page = await document.getPage(pageNumber);
			const text = await page.getTextContent();
			readback.push(`[Page ${pageNumber}] ${text.items.map((item) => "str" in item ? item.str : "").join(" ")}`);
			if (!sampled.has(pageNumber)) continue;
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: Math.min(cellWidth / base.width, 1.5) });
			const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
			await page.render({ canvasContext: canvas.getContext("2d") as never, viewport }).promise;
			rendered.push(await sharp(canvas.toBuffer("image/png")).png().toBuffer());
		}
		const columns = Math.min(longFile ? 4 : 2, rendered.length);
		const rows = Math.ceil(rendered.length / columns);
		const cellHeight = Math.max(...await Promise.all(rendered.map(async (image) => (await sharp(image).metadata()).height ?? 1)));
		const composites = rendered.map((input, index) => ({ input, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight }));
		const contactSheet = await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 4, background: "#e5e7eb" } })
			.composite(composites).png().toBuffer();
		return {
			bytes: contactSheet,
			label: `${label} visual review (${document.numPages} pages${document.numPages > PAGE_LIMIT ? `; contact sheet shows ${sampled.size} sampled pages: ${[...sampled].join(", ")}` : ""})`,
			pageCount: document.numPages,
			readbackText: readback.join("\n").trim(),
		};
	} finally {
		await document.destroy();
	}
}

async function renderHtml(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	const systemChromium = process.env.CHROMIUM_PATH?.trim() || (process.platform === "linux" && existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
	const browser = await chromium.launch({
		headless: true,
		...(systemChromium ? { executablePath: systemChromium } : {}),
		args: ["--disable-dev-shm-usage", ...(process.env.PROJECT_AGENT_RENDER_NO_SANDBOX === "true" ? ["--no-sandbox"] : [])],
		env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", TMPDIR: "/tmp", LANG: "C.UTF-8" },
	});
	try {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			deviceScaleFactor: 1,
			javaScriptEnabled: process.env.PROJECT_AGENT_RENDER_JAVASCRIPT !== "false",
		});
		await context.route("**/*", (route) => route.request().url().startsWith("data:") || route.request().url().startsWith("blob:") ? route.continue() : route.abort());
		await context.addInitScript(() => {
			const deny = () => { throw new Error("Network access is disabled in Project Agent visual review"); };
			window.fetch = deny as typeof window.fetch;
			XMLHttpRequest.prototype.open = deny as typeof XMLHttpRequest.prototype.open;
			WebSocket.prototype.send = deny as typeof WebSocket.prototype.send;
		});
		const page = await context.newPage();
		page.setDefaultTimeout(15_000);
		await page.setContent(bytes.toString("utf8"), { waitUntil: "domcontentloaded", timeout: 15_000 });
		const dimensions = await page.evaluate(() => ({
			width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, 1024),
			height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 768),
			text: document.body.innerText,
		}));
		if (dimensions.width > 1920) throw new Error("HTML preview exceeds the 1920px visual-review width limit");
		if (dimensions.height > HTML_HEIGHT_LIMIT) throw new Error(`HTML preview exceeds the ${HTML_HEIGHT_LIMIT}px visual-review height limit`);
		await page.setViewportSize({ width: Math.min(Math.max(dimensions.width, 1024), 1920), height: Math.min(dimensions.height, 1400) });
		const png = await page.screenshot({ fullPage: true, type: "png", timeout: 15_000 });
		return {
			bytes: await sharp(png).resize({ width: 1440, height: HTML_HEIGHT_LIMIT, fit: "inside", withoutEnlargement: true }).png().toBuffer(),
			label: `${label} rendered preview`,
			readbackText: dimensions.text.trim(),
		};
	} finally {
		await browser.close();
	}
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
	}[character] ?? character));
}

async function renderText(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error(`Text preview could not decode ${label} as UTF-8`);
	}
	const excerpt = text.slice(0, TEXT_PREVIEW_LIMIT);
	const notice = text.length > excerpt.length ? "\n\n[Preview truncated; inspect the attached source for the remaining text.]" : "";
	const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#f3f4f6;color:#111827;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;border:1px solid #d1d5db;border-radius:8px}</style><pre>${escapeHtml(excerpt + notice)}</pre>`;
	const preview = await renderHtml(Buffer.from(html), label);
	return { ...preview, label: `${label} text preview`, readbackText: text };
}

async function renderSvg(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	if (bytes.byteLength > SVG_PREVIEW_LIMIT) throw new Error(`SVG preview exceeds the ${SVG_PREVIEW_LIMIT / 1024 / 1024} MiB limit`);
	const source = bytes.toString("utf8");
	if (!/<svg(?:\s|>)/i.test(source)) throw new Error(`SVG preview could not find an SVG document in ${label}`);
	const image = `data:image/svg+xml;base64,${bytes.toString("base64")}`;
	const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f3f4f6}img{display:block;max-width:100%;max-height:${HTML_HEIGHT_LIMIT}px;margin:auto;object-fit:contain;background:white}</style><img alt="SVG deliverable preview" src="${image}">`;
	const preview = await renderHtml(Buffer.from(html), label);
	return { ...preview, label: `${label} visual review` };
}

async function renderImage(bytes: Buffer, label: string): Promise<VisualReviewImage> {
	const preview = await sharp(bytes, { limitInputPixels: IMAGE_PIXEL_LIMIT, animated: false })
		.rotate()
		.resize({ width: IMAGE_PREVIEW_WIDTH, height: IMAGE_PREVIEW_HEIGHT, fit: "inside", withoutEnlargement: true })
		.png()
		.toBuffer();
	return { bytes: preview, label: `${label} visual review` };
}

// LibreOffice conversions overlap badly when several Agent tasks finish together, so run them one at a time
// and retry a failed conversion once before reporting it.
let officeConversionQueue: Promise<unknown> = Promise.resolve();
function convertOfficeExclusively(bytes: Buffer, name: string): ReturnType<typeof convertOfficeDocumentToPdf> {
	const run = async () => {
		const first = await convertOfficeDocumentToPdf(bytes, name);
		return first.status === "FAILED" ? convertOfficeDocumentToPdf(bytes, name) : first;
	};
	const next = officeConversionQueue.then(run, run);
	officeConversionQueue = next.catch(() => undefined);
	return next;
}

export async function renderProjectAgentFile(
	file: { name: string; mimeType: string },
	bytes: Buffer,
): Promise<VisualReviewImage> {
	const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
	if (DIRECT_IMAGE_TYPES.has(file.mimeType)) return renderImage(bytes, file.name);
	if (file.mimeType === "image/svg+xml" || extension === "svg") return renderSvg(bytes, file.name);
	if (file.mimeType === "text/html" || extension === "html" || extension === "htm") return renderHtml(bytes, file.name);
	if (file.mimeType.startsWith("text/") || file.mimeType === "application/json" || file.mimeType === "application/xml" || TEXT_EXTENSIONS.has(extension)) {
		return renderText(bytes, file.name);
	}
	let pdf = bytes;
	if (isOfficeDocumentMimeType(file.mimeType) || ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension)) {
		const converted = await convertOfficeExclusively(extension === "xlsx" ? await fitWorkbookToPageWidth(bytes) : bytes, file.name);
		if (converted.status === "UNSUPPORTED") throw new Error("LibreOffice is unavailable; Office visual review cannot run");
		if (converted.status === "FAILED") throw new Error(`Office visual review failed: ${converted.error.slice(0, 240)}`);
		pdf = converted.pdf;
	}
	if (file.mimeType === "application/pdf" || extension === "pdf" || pdf !== bytes) return renderPdf(pdf, file.name);
	throw new Error(`No visual renderer is available for ${file.name}`);
}
