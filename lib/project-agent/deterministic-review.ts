import JSZip from "jszip";
import { slideTextFit } from "./pptx-fit";
import type { ProjectAgentTask } from "./types";
import { readProjectAgentFile } from "./task-store";
import { renderProjectAgentFile } from "./visual-review";
import { lintDocxLayout, lintTocPageNumbers } from "./docx-layout-lint";
import { uploadProjectAgentReviewFile, type DifyChatFile } from "./dify-input-files";
import { reviewDocxStructure, reviewPptxStructure, reviewXlsxStructure } from "./office-structure-review";

export const MAX_LOCAL_FIX_ROUNDS = 2;
const MAX_BULLETS = 7;
const MAX_SLIDE_CHARS = 700;
const SPREADSHEET_ERROR = /(#REF!|#NAME\?|#DIV\/0!|#VALUE!|#N\/A|#NUM!|#NULL!|Err:\d{3})/g;
const PLACEHOLDER = /(lorem ipsum|\{\{[^}]+\}\}|\[insert [^\]]+\]|TODO:)/i;

export interface DeliverableLint { file: string; issues: string[]; renderNote?: string; pageCount?: number; sheet?: Buffer }

function ext(name: string): string {
	return name.split(".").at(-1)?.toLowerCase() ?? "";
}

export async function lintPptx(bytes: Uint8Array, prompt = ""): Promise<string[]> {
	const zip = await JSZip.loadAsync(bytes);
	const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
		.sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
	if (slides.length === 0) return ["presentation has no slides"];
	const issues: string[] = [];
	for (const [index, name] of slides.entries()) {
		const xml = await zip.file(name)!.async("string");
		const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1].trim()).filter(Boolean);
		const hasVisual = /<p:pic\b|<a:tbl\b|<p:graphicFrame\b|<c:chart\b/.test(xml);
		const paragraphs = (xml.match(/<a:p>/g) ?? []).length;
		const chars = texts.join("").length;
		if (texts.length === 0 && !hasVisual) issues.push(`slide ${index + 1} is empty`);
		const hasTable = /<a:tbl\b/.test(xml);
		// Table cells are many short runs, so only the character budget (doubled) applies to slides with a real table.
		// Positioned text boxes (cards, timelines) are checked by fit; the run and paragraph counts apply only without geometry.
		const fit = slideTextFit(xml);
		const tooMuch = hasTable
			? chars > MAX_SLIDE_CHARS * 2
			: chars > MAX_SLIDE_CHARS || (fit.measured ? fit.overflow : texts.length > MAX_BULLETS + 4 || paragraphs > MAX_BULLETS + 6);
		if (tooMuch) {
			issues.push(`slide ${index + 1} may overflow (${texts.length} text runs, ${chars} characters); split or shorten it`);
		}
		if (!hasTable && texts.some((text) => /^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/.test(text) || (text.match(/\|/g) ?? []).length >= 2 || /\w \| \w/.test(text))) {
			issues.push(`slide ${index + 1} shows raw table markup as text; rewrite the table as short "label: value" bullets`);
		}
		if (PLACEHOLDER.test(texts.join(" "))) issues.push(`slide ${index + 1} contains placeholder text`);
	}
	issues.push(...await reviewPptxStructure(bytes, prompt));
	return [...new Set(issues)];
}

export async function lintXlsx(bytes: Uint8Array, renderedText: string, prompt = ""): Promise<string[]> {
	const issues: string[] = [];
	const zip = await JSZip.loadAsync(bytes);
	const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
	if (sheets.length === 0) return ["workbook has no sheets"];
	let cells = 0, unstored = 0;
	for (const name of sheets) {
		const xml = await zip.file(name)!.async("string");
		unstored += (xml.match(/<f\b[^>]*(?:\/>|>[^<]*<\/f>)\s*(?:<v\s*\/>|<v><\/v>|(?=<\/c>))/g) ?? []).length;
		cells += (xml.match(/<c\b[^>]*>(?:(?!<\/c>)[\s\S])*<(?:v|f|is)\b/g) ?? []).length;
		for (const match of xml.matchAll(/<c\b[^>]*t="e"[^>]*>(?:(?!<\/c>)[\s\S])*?<v>([^<]*)<\/v>/g)) issues.push(`a cell holds the error ${match[1]}`);
	}
	if (cells === 0) issues.push("workbook has no data");
	const application = await zip.file("docProps/app.xml")?.async("string") ?? "";
	if (/<Application>LibreOffice/i.test(application)) issues.push("the workbook was re-saved by LibreOffice, which drops frozen panes, data validation and other Excel features; deliver the file written by openpyxl and run python3 /work/.tools/xlsx_values.py on it");
	if (unstored) issues.push(`${unstored} formulas have no stored result, so previews and phone viewers show empty cells; run python3 /work/.tools/xlsx_values.py on the workbook`);
	// LibreOffice computed every formula while rendering; any error token in the rendered text is a broken formula.
	const rendered = [...new Set(renderedText.match(SPREADSHEET_ERROR) ?? [])];
	if (rendered.length) issues.push(`formulas evaluate to errors in the rendered sheet: ${rendered.join(", ")}`);
	issues.push(...await reviewXlsxStructure(bytes, prompt));
	return [...new Set(issues)];
}

export function lintDocxText(text: string): string[] {
	const issues: string[] = [];
	if (text.replace(/\s+/g, "").length < 20) issues.push("document has almost no text");
	if (PLACEHOLDER.test(text)) issues.push("document contains placeholder text");
	return issues;
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A TOC whose entries do not render shows only its heading (Word fills it after a manual field update, LibreOffice
 * never does). Level-1 headings should then appear twice in the rendered text: in the TOC and in the body.
 */
export async function lintDocxToc(bytes: Uint8Array, renderedText = ""): Promise<string[]> {
	const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string");
	if (!xml || !/<w:instrText[^>]*>\s*TOC\b/.test(xml)) return [];
	const headings = [...xml.matchAll(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)]
		.map((match) => normalize([...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((text) => text[1]).join("")).slice(0, 30))
		.filter((heading) => heading.length > 3);
	if (headings.length < 3 || !renderedText) return [];
	const rendered = normalize(renderedText);
	const listed = headings.filter((heading) => rendered.split(heading).length - 1 >= 2).length;
	return listed < Math.ceil(headings.length / 2) ? ["the table of contents renders without its entries (only its title shows); write the entry text (heading titles with page numbers) as static text inside the TOC field result instead of relying on a manual field update"] : [];
}

/** Cheap, deterministic checks on the exact saved bytes (no model call). Rendering failures are notes, not defects. */
export async function lintDeliverables(taskId: string, files: NonNullable<ProjectAgentTask["files"]>, prompt = ""): Promise<DeliverableLint[]> {
	const results: DeliverableLint[] = [];
	for (const file of files) {
		if (file.resource) continue;
		const bytes = await readProjectAgentFile(taskId, file.id);
		const lint: DeliverableLint = { file: file.name, issues: [] };
		let renderedText = "";
		try {
			const preview = await renderProjectAgentFile(file, bytes);
			renderedText = preview.readbackText ?? "";
			lint.pageCount = preview.pageCount;
			lint.sheet = preview.bytes;
		} catch (cause) {
			lint.renderNote = `preview unavailable: ${cause instanceof Error ? cause.message.slice(0, 160) : "render failed"}`;
		}
		try {
			const extension = ext(file.name);
			if (extension === "xlsx") lint.issues.push(...await lintXlsx(bytes, renderedText, prompt));
			else if (extension === "pptx") lint.issues.push(...await lintPptx(bytes, prompt));
			else if (extension === "docx") { if (renderedText) lint.issues.push(...lintDocxText(renderedText)); lint.issues.push(...await reviewDocxStructure(bytes, prompt), ...await lintDocxToc(bytes, renderedText), ...await lintDocxLayout(bytes, lint.pageCount), ...await lintTocPageNumbers(bytes, renderedText)); }
			else if (extension === "pdf" && renderedText.replace(/\s+/g, "").length < 20) lint.issues.push("PDF has no readable text");
		} catch (cause) {
			lint.issues.push(`file could not be opened: ${cause instanceof Error ? cause.message.slice(0, 120) : "corrupt file"}`);
		}
		results.push(lint);
	}
	return results;
}

/** Rendered contact sheets of the files with problems, so the agent sees what the app saw (at most two). */
export async function uploadLintSheets(problems: DeliverableLint[], user: string, endpoint: string, apiKey: string): Promise<DifyChatFile[]> {
	const sheets = problems.filter((lint) => lint.sheet).slice(0, 2);
	return Promise.all(sheets.map((lint) => uploadProjectAgentReviewFile({ name: `render-${lint.file}.png`, mimeType: "image/png" }, lint.sheet!, user, endpoint, apiKey, true)))
		.catch(() => []);
}

export function buildLintFixQuery(task: Pick<ProjectAgentTask, "prompt" | "userPrompt">, lints: DeliverableLint[], round: number): string {
	const lines = lints.filter((lint) => lint.issues.length).map((lint) => `- ${lint.file}: ${lint.issues.join("; ")}`);
	return [
		`Automated check of the saved file(s), fix round ${round} of ${MAX_LOCAL_FIX_ROUNDS}. The app opened each exact saved file and found these concrete problems:`,
		lines.join("\n"),
		`Original user request:\n${(task.userPrompt ?? task.prompt).slice(0, 4_000)}`,
		"When an image is attached it is the app's render of the saved file (for long files a sample of its pages, in order); look at it to confirm the defects. Fix only these problems and return the replacement file link(s) using the same exporter tool as before. Do not re-explain; do not create extra files.",
	].join("\n\n");
}
