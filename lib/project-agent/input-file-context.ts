import { readFile } from "node:fs/promises";
import { renderProjectAgentFile } from "./visual-review";
import { withTpdfOcrPdf } from "./tpdf-ocr-client";
import { readProjectAgentTaskInputFile } from "./task-store";
import type { ProjectAgentTaskInputFile } from "./types";
import { isLargePdfInput, stagedInputName } from "./large-input";

const MAX_INPUT_READBACK_CHARS = 48_000;

/** Shares the character budget fairly: each file gets an equal part of what is left, so one long file cannot starve the rest. */
export async function buildProjectAgentInputReadback(
	files: ProjectAgentTaskInputFile[],
	taskId: string,
	maxChars = MAX_INPUT_READBACK_CHARS,
	identity?: { email: string; projectId: string },
	signal?: AbortSignal,
): Promise<string> {
	const sections: string[] = [];
	let remaining = maxChars;
	for (const [index, file] of files.entries()) {
		if (isLargePdfInput(file)) {
			sections.push(`File: ${file.name}\nLarge PDF (${Math.round(file.size / 1048576)} MB): not read into this message. It is in the sandbox as inputs/${stagedInputName(file.name)}; use the pdf action (info, search, text, images, health) on it.`);
			continue;
		}
		const bytes = await readProjectAgentTaskInputFile(taskId, file.id);
		if (bytes.byteLength !== file.size) throw new Error(`Project Agent input file changed before review: ${file.name}`);
		let text = readPlainText(file, bytes) ?? (file.mimeType.startsWith("image/") || /\.msg$/i.test(file.name) ? "" : (await renderProjectAgentFile(file, bytes)).readbackText ?? "");
		let textSource = "Text read from the exact attached original";
		let ocrNote = "";
		if (isPdf(file) && identity && looksScannedPdf(text)) {
			try {
				const ocr = await withTpdfOcrPdf({
					sourceBytes: bytes,
					fileId: file.id,
					fileName: file.name,
					identity,
					signal,
					work: async (path) => renderProjectAgentFile(file, await readFile(path)),
				});
				if (ocr.readbackText?.trim() && hasReadablePageText(ocr.readbackText)) {
					text = ocr.readbackText;
					textSource = "Text extracted by TPDF OCR from a processing copy; use page images to verify uncertain characters";
				}
				else ocrNote = "TPDF OCR completed but returned no readable text; inspect the original page images.";
			} catch {
				if (signal?.aborted) throw signal.reason ?? new Error("Project Agent task was cancelled");
				ocrNote = "TPDF OCR was unavailable; inspect the original page images.";
			}
		}
		const boundedText = text.slice(0, Math.max(1_500, Math.floor(remaining / (files.length - index))));
		remaining = Math.max(0, remaining - boundedText.length);
		sections.push([
			`File: ${file.name}`,
			...(ocrNote ? [ocrNote] : []),
			boundedText
				? `${textSource}${boundedText.length < text.length ? " (truncated)" : ""}:\n<source_file_text>\n${boundedText}\n</source_file_text>`
				: "No text layer was available. Inspect the directly attached original file; image attachments must be visually inspected.",
		].join("\n"));
	}
	return sections.join("\n\n");
}

function isPdf(file: ProjectAgentTaskInputFile): boolean {
	return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
}

function looksScannedPdf(text: string): boolean {
	const pageText = [...text.matchAll(/\[Page\s+\d+\]\s*([^\n]*)/gi)].map(([, value]) => value.trim());
	if (!pageText.length) return text.trim().length < 80;
	const sparsePages = pageText.filter((page) => page.replace(/\s/g, "").length < 20).length;
	return sparsePages / pageText.length >= 0.6;
}

function hasReadablePageText(text: string): boolean {
	const pages = [...text.matchAll(/\[Page\s+\d+\]\s*([^\n]*)/gi)].map(([, value]) => value.trim());
	return pages.length ? pages.some((page) => page.length > 0) : text.trim().length > 0;
}

function readPlainText(file: ProjectAgentTaskInputFile, bytes: Buffer): string | null {
	const extension = file.name.split(".").at(-1)?.toLowerCase();
	const isPlainText = file.mimeType.startsWith("text/")
		|| ["json", "jsonl", "xml", "svg", "csv", "tsv", "yaml", "yml", "log", "md", "markdown", "eml", "html", "htm"].includes(extension ?? "");
	if (!isPlainText) return null;
	try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
	catch { throw new Error(`Project Agent could not read ${file.name} as UTF-8 text`); }
}
