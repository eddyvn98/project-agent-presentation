import JSZip from "jszip";
import ExcelJS from "exceljs";
import type { RichSpec } from "./rich-files";
import { EDITABLE_TEXT_EXTENSIONS, editTextFile } from "./edit-text-files";

// Format-preserving edits of an uploaded docx/xlsx/pptx: the agent sends find/replace and cell edits,
// the app applies them to the original package and reports exactly what changed.
export type EditSpec = RichSpec & {
	source?: string;
	replacements?: Array<{ find?: string; replace?: string }>;
	cells?: Array<{ sheet?: string; cell?: string; value?: unknown }>;
	appendRows?: Array<{ sheet?: string; values?: unknown[] }>;
};

export interface EditResult { name: string; bytes: Uint8Array; summary: string[]; warnings: string[] }

const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnescape = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Replace inside one paragraph: join its text runs, and when the text changes keep the first run's formatting.
function replaceInParagraphs(xml: string, tag: "w" | "a", pairs: Array<[string, string]>, hits: number[]): string {
	const paragraph = new RegExp(`<${tag}:p(?:\\s[^>]*)?>[\\s\\S]*?</${tag}:p>`, "g");
	const run = new RegExp(`(<${tag}:t(?:\\s[^>]*)?>)([^<]*)(</${tag}:t>)`, "g");
	return xml.replace(paragraph, (para) => {
		const texts = [...para.matchAll(run)].map((match) => xmlUnescape(match[2]));
		if (texts.length === 0) return para;
		let joined = texts.join("");
		let changed = false;
		pairs.forEach(([find, replace], index) => {
			if (!find || !joined.includes(find)) return;
			hits[index] += joined.split(find).length - 1;
			joined = joined.split(find).join(replace);
			changed = true;
		});
		if (!changed) return para;
		let first = true;
		return para.replace(run, (_all, open: string, _text: string, close: string) => {
			if (!first) return `${open}${close}`;
			first = false;
			const opened = /xml:space=/.test(open) ? open : open.replace(`<${tag}:t`, `<${tag}:t xml:space="preserve"`);
			return `${opened}${xmlEscape(joined)}${close}`;
		});
	});
}

async function editPackage(bytes: Uint8Array, kind: "docx" | "pptx", spec: EditSpec): Promise<{ bytes: Uint8Array; summary: string[]; warnings: string[] }> {
	const zip = await JSZip.loadAsync(bytes);
	const pairs: Array<[string, string]> = (spec.replacements ?? []).slice(0, 100).map((item) => [String(item.find ?? ""), String(item.replace ?? "")]);
	const hits = pairs.map(() => 0);
	const parts = Object.keys(zip.files).filter((name) => kind === "docx"
		? /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)
		: /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(name));
	for (const name of parts) {
		const xml = await zip.file(name)!.async("string");
		const next = replaceInParagraphs(xml, kind === "docx" ? "w" : "a", pairs, hits);
		if (next !== xml) zip.file(name, next);
	}
	const summary: string[] = [];
	const warnings: string[] = [];
	pairs.forEach(([find, replace], index) => {
		if (hits[index] > 0) summary.push(`Replaced "${find.slice(0, 80)}" with "${replace.slice(0, 80)}" (${hits[index]} place${hits[index] === 1 ? "" : "s"})`);
		else warnings.push(`Text not found: "${find.slice(0, 80)}"`);
	});
	return { bytes: new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })), summary, warnings };
}

async function editWorkbook(bytes: Uint8Array, spec: EditSpec): Promise<{ bytes: Uint8Array; summary: string[]; warnings: string[] }> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
	const summary: string[] = [];
	const warnings: string[] = [];
	// The agent often guesses "Sheet1": fall back to the only sheet, or a case-insensitive match, instead of failing every edit.
	const sheetFor = (name?: string) => {
		if (!name) return workbook.worksheets[0];
		return workbook.getWorksheet(name)
			?? workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase())
			?? (workbook.worksheets.length === 1 ? workbook.worksheets[0] : undefined);
	};
	const sheetNames = () => workbook.worksheets.map((sheet) => sheet.name).join(", ");
	const asCell = (value: unknown): ExcelJS.CellValue => (typeof value === "string" && value.startsWith("=") ? { formula: value.slice(1, 400) } as ExcelJS.CellValue : typeof value === "number" || typeof value === "boolean" || value == null ? (value as ExcelJS.CellValue) : String(value).slice(0, 2000));
	for (const item of (spec.cells ?? []).slice(0, 500)) {
		const sheet = sheetFor(item.sheet);
		if (!sheet || !item.cell || !/^[A-Z]{1,3}[0-9]{1,7}$/.test(item.cell)) { if (warnings.length < 5) warnings.push(`Cell edit skipped (${item.sheet ?? "first sheet"}!${item.cell ?? "?"}); sheets in this file: ${sheetNames()}`); continue; }
		const cell = sheet.getCell(item.cell);
		const before = cell.value && typeof cell.value === "object" && "formula" in cell.value ? `=${(cell.value as { formula: string }).formula}` : String(cell.value ?? "");
		cell.value = asCell(item.value);
		summary.push(`${sheet.name}!${item.cell}: ${before.slice(0, 60) || "(empty)"} -> ${String(item.value).slice(0, 60)}`);
	}
	for (const item of (spec.appendRows ?? []).slice(0, 200)) {
		const sheet = sheetFor(item.sheet);
		if (!sheet || !Array.isArray(item.values)) { if (warnings.length < 5) warnings.push(`Row append skipped for ${item.sheet ?? "first sheet"}; sheets in this file: ${sheetNames()}`); continue; }
		const row = sheet.addRow(item.values.slice(0, 50).map(asCell));
		summary.push(`${sheet.name}: added row ${row.number}`);
	}
	const pairs = (spec.replacements ?? []).slice(0, 100);
	for (const pair of pairs) {
		const find = String(pair.find ?? "");
		let count = 0;
		if (find) workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
			if (typeof cell.value === "string" && cell.value.includes(find)) { cell.value = cell.value.split(find).join(String(pair.replace ?? "")); count += 1; }
		})));
		if (count > 0) summary.push(`Replaced "${find.slice(0, 80)}" with "${String(pair.replace ?? "").slice(0, 80)}" (${count} cell${count === 1 ? "" : "s"})`);
		else warnings.push(`Text not found: "${find.slice(0, 80)}"`);
	}
	return { bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), summary, warnings };
}

export async function applyEditSpec(spec: EditSpec, source: { name: string; bytes: Uint8Array }): Promise<EditResult> {
	const extension = source.name.split(".").at(-1)?.toLowerCase();
	if (extension && EDITABLE_TEXT_EXTENSIONS.has(extension)) {
		const edited = editTextFile(source.bytes, extension, spec);
		return { name: editedName(spec, source.name, extension), ...edited };
	}
	if (extension !== "docx" && extension !== "xlsx" && extension !== "pptx") throw new Error(`cannot edit .${extension} files`);
	const edited = extension === "xlsx" ? await editWorkbook(source.bytes, spec) : await editPackage(source.bytes, extension, spec);
	return { name: editedName(spec, source.name, extension), ...edited };
}

function editedName(spec: EditSpec, sourceName: string, extension: string): string {
	const stem = sourceName.replace(/\.[^.]+$/, "");
	const requested = String(spec.filename ?? "").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\r\n\0]/g, " ").trim().replace(/\s+/g, "_");
	return `${requested && requested !== stem ? requested : `${stem}_edited`}.${extension}`;
}

export const EDIT_FILE_INSTRUCTIONS = [
	"EDITING AN ATTACHED OFFICE FILE (.docx, .xlsx, .pptx): never rebuild it from scratch. Reply with one block and the app will apply the edit to the original file, keep its formatting, save a new version, and show the change list:",
	"```ong-file",
	'{"type":"edit","source":"report.docx","filename":"report_v2","replacements":[{"find":"exact old text from the file","replace":"new text"}],"cells":[{"sheet":"Sheet1","cell":"B2","value":123}],"appendRows":[{"sheet":"Sheet1","values":["x",1,"=B2*2"]}]}',
	"```",
	"Use find strings that appear exactly in the attached file read-back (short, unique phrases). cells/appendRows apply to .xlsx only. Say briefly what you changed and why.",
	"EDITING AN ATTACHED TEXT FILE (.txt, .md, .csv, .tsv, .json, .jsonl, .xml, .yaml, .yml, .log, .html): use the same ong-file edit block with source and exact replacements. The app edits the original UTF-8 text; JSON and JSONL are validated before saving. Do not use cells or appendRows for these files.",
].join("\n");
