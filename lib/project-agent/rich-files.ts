import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import sharp from "sharp";
import * as echarts from "echarts";
import {
	AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { DifyInlineFile } from "./dify-inline-output";

// The agent can answer with fenced ```ong-file JSON blocks; the app builds real Office files from them
// (native tables and charts), so deliverables do not depend on the Dify exporter plugins' limits.
const BLOCK = /```ong-file\s*\n([\s\S]*?)```/g;
const MAX_SPECS = 4;
const MAX_ROWS = 2000;
const PALETTE = ["2563EB", "F97316", "10B981", "8B5CF6", "EF4444", "06B6D4", "F59E0B", "64748B"];

export type RichChart = { type?: string; title?: string; categories?: unknown[]; series?: Array<{ name?: string; values?: unknown[] }> };
type RichTable = { columns?: unknown[]; rows?: unknown[][] };
type PptxSlide = { title?: string; subtitle?: string; bullets?: unknown[]; table?: RichTable; chart?: RichChart; notes?: string };
type DocxBlock = { type?: string; level?: number; text?: string; items?: unknown[]; columns?: unknown[]; rows?: unknown[][]; chart?: RichChart; caption?: string } & RichChart;
export type RichSpec = {
	type?: string; filename?: string; title?: string;
	slides?: PptxSlide[]; blocks?: DocxBlock[];
	sheets?: Array<{ name?: string; columns?: unknown[]; rows?: unknown[][]; chart?: RichChart }>;
};

const text = (value: unknown, max = 600) => (value == null ? "" : String(value)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const num = (value: unknown) => { const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const strings = (list: unknown, max = 60) => (Array.isArray(list) ? list.slice(0, max).map((item) => text(item, 120)) : []);
const grid = (table?: RichTable) => ({
	columns: strings(table?.columns, 20),
	rows: (Array.isArray(table?.rows) ? table!.rows!.slice(0, MAX_ROWS) : []).map((row) => (Array.isArray(row) ? row.slice(0, 20) : [])),
});

// While streaming, hide finished blocks and a block that is still being written.
export function hideRichFileBlocks(partial: string): string {
	const open = partial.lastIndexOf("```ong-file");
	let shown = open >= 0 && !partial.slice(open + 11).includes("```") ? partial.slice(0, open) : partial;
	shown = shown.replace(BLOCK, "");
	return shown.trim() ? shown : "Building your file…";
}

// The app verifies built files itself (render plus lint), so the agent's "I did not reopen the file" disclaimers are noise.
export function stripUnverifiedDisclaimers(text: string): string {
	const claim = /\b(?:haven't|have not|did not|didn't|not yet)\b[^.!?\n]{0,40}\b(?:reopened?|re-?checked?|checked|reviewed|verified|opened|inspected)\b|\bch\u01b0a\b[^.!?\n]{0,30}(?:m\u1edf l\u1ea1i|ki\u1ec3m tra|xem l\u1ea1i)|\u1ee8ng d\u1ee5ng s\u1ebd (?:\u00e1p d\u1ee5ng|hi\u1ec3n th\u1ecb|t\u1ef1)|\bthe app will (?:apply|show|verify|check)\b/iu;
	return text.split(/(?<=[.!?])[ \t]+/).filter((sentence) => !claim.test(sentence)).join(" ").trim() || text;
}

export function extractRichFileSpecs(answer: string): { text: string; specs: RichSpec[] } {
	const specs: RichSpec[] = [];
	const cleaned = answer.replace(BLOCK, (_all, body: string) => {
		if (specs.length < MAX_SPECS) {
			try { const parsed = JSON.parse(body) as RichSpec; if (parsed && typeof parsed === "object") specs.push(parsed); } catch { /* malformed block is dropped */ }
		}
		return "";
	});
	return { text: cleaned.replace(/\n{3,}/g, "\n\n").trim(), specs };
}

function baseName(spec: RichSpec, ext: string) {
	const raw = text(spec.filename || spec.title || "document", 80).replace(/\.(pptx|docx|xlsx)$/i, "").replace(/[\\/:*?"<>|\r\n\0]/g, " ").trim().replace(/\s+/g, "_");
	return `${raw || "document"}.${ext}`;
}

export async function renderChartPng(chart: RichChart, width = 1000, height = 560): Promise<Buffer> {
	const categories = strings(chart.categories, 60);
	const series = (chart.series ?? []).slice(0, 6).map((item) => ({ name: text(item.name, 60), values: (item.values ?? []).slice(0, 60).map(num) }));
	const kind = ["line", "pie", "bar"].includes(String(chart.type)) ? String(chart.type) : "bar";
	const instance = echarts.init(null as never, null, { renderer: "svg", ssr: true, width, height });
	instance.setOption({
		animation: false, backgroundColor: "#ffffff", color: PALETTE.map((c) => `#${c}`),
		textStyle: { fontFamily: "Helvetica, Arial, sans-serif" },
		title: chart.title ? { text: text(chart.title, 120), left: "center" } : undefined,
		legend: series.length > 1 || kind === "pie" ? { bottom: 0 } : undefined,
		tooltip: undefined,
		...(kind === "pie"
			? { series: [{ type: "pie", radius: "60%", label: { formatter: "{b}: {d}%" }, data: categories.map((name, i) => ({ name, value: series[0]?.values[i] ?? 0 })) }] }
			: { grid: { left: 60, right: 30, top: chart.title ? 60 : 30, bottom: 60 }, xAxis: { type: "category", data: categories }, yAxis: { type: "value" },
				series: series.map((item) => ({ name: item.name, type: kind, data: item.values, smooth: false })) }),
	});
	const svg = instance.renderToSVGString();
	instance.dispose();
	return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
}

function chartData(chart: RichChart) {
	const labels = strings(chart.categories, 60);
	const series = (chart.series ?? []).slice(0, 6).map((item, i) => ({ name: text(item.name, 60) || `Series ${i + 1}`, labels, values: (item.values ?? []).slice(0, labels.length).map(num) }));
	return series;
}

export async function buildPptx(spec: RichSpec): Promise<Uint8Array> {
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
	pptx.title = text(spec.title, 120);
	const font = "Calibri";
	const slides = (spec.slides ?? []).slice(0, 40);
	slides.forEach((item, index) => {
		const slide = pptx.addSlide();
		const title = text(item.title, 120);
		if (index === 0 && !item.table && !item.chart && !(item.bullets?.length)) {
			slide.background = { color: "1E3A8A" };
			slide.addText(title || text(spec.title, 120), { x: 0.8, y: 2.4, w: 11.7, h: 1.4, fontFace: font, fontSize: 40, bold: true, color: "FFFFFF", valign: "middle" });
			if (item.subtitle) slide.addText(text(item.subtitle, 200), { x: 0.8, y: 3.9, w: 11.7, h: 0.8, fontFace: font, fontSize: 20, color: "DBEAFE" });
			return;
		}
		slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: PALETTE[0] }, line: { color: PALETTE[0] } });
		slide.addText(title, { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontFace: font, fontSize: 28, bold: true, color: "0F172A", valign: "middle", fit: "shrink" });
		const bullets = (item.bullets ?? []).slice(0, 8).map((b) => text(b, 220)).filter(Boolean);
		const hasVisual = Boolean(item.table || item.chart);
		let top = 1.4;
		if (bullets.length) {
			const height = hasVisual ? Math.min(2.2, 0.5 * bullets.length + 0.2) : 5.4;
			slide.addText(bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.7, y: top, w: 11.9, h: height, fontFace: font, fontSize: hasVisual ? 16 : 20, color: "1E293B", valign: "top", paraSpaceAfter: 8, fit: "shrink" });
			if (hasVisual) top += height + 0.1;
		}
		const area = { x: 0.7, y: top, w: 11.9, h: 7.0 - top };
		if (item.table) {
			const { columns, rows } = grid(item.table);
			if (columns.length) {
				const body = rows.slice(0, 14).map((row, r) => columns.map((_, c) => ({ text: text(row[c], 80), options: { fontFace: font, fontSize: 13, color: "1E293B", fill: { color: r % 2 ? "F1F5F9" : "FFFFFF" }, align: typeof row[c] === "number" ? "right" as const : "left" as const, border: { type: "solid" as const, color: "CBD5E1", pt: 0.5 } } })));
				const head = columns.map((name) => ({ text: name, options: { bold: true, fontFace: font, fontSize: 13, color: "FFFFFF", fill: { color: PALETTE[0] }, border: { type: "solid" as const, color: PALETTE[0], pt: 0.5 } } }));
				slide.addTable([head, ...body], { x: area.x, y: area.y, w: area.w, colW: Array(columns.length).fill(area.w / columns.length), rowH: 0.38 });
			}
		}
		if (item.chart) {
			const series = chartData(item.chart);
			const kind = String(item.chart.type);
			const type = kind === "line" ? pptx.ChartType.line : kind === "pie" ? pptx.ChartType.pie : pptx.ChartType.bar;
			if (series.length) {
				slide.addChart(type, series, {
					...area, chartColors: PALETTE, showLegend: series.length > 1 || kind === "pie", legendPos: "b", legendFontSize: 12,
					showTitle: Boolean(item.chart.title), title: text(item.chart.title, 100), titleFontSize: 16,
					catAxisLabelFontSize: 12, valAxisLabelFontSize: 12, barDir: "col", showValue: kind === "pie", dataLabelFontSize: 12,
					...(kind === "pie" ? { showPercent: true, showValue: false } : {}),
				});
			}
		}
		if (item.notes) slide.addNotes(text(item.notes, 2000));
	});
	if (slides.length === 0) pptx.addSlide().addText(text(spec.title, 120) || "Presentation", { x: 1, y: 3, w: 11, h: 1, fontSize: 32 });
	const out = await pptx.write({ outputType: "uint8array" });
	return out as Uint8Array;
}

export async function buildDocx(spec: RichSpec): Promise<Uint8Array> {
	const children: Array<Paragraph | Table> = [];
	if (spec.title) children.push(new Paragraph({ text: text(spec.title, 160), heading: HeadingLevel.TITLE }));
	for (const block of (spec.blocks ?? []).slice(0, 300)) {
		const kind = String(block.type);
		if (kind === "heading") {
			const level = Math.min(3, Math.max(1, Number(block.level) || 1));
			children.push(new Paragraph({ text: text(block.text, 200), heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1], spacing: { before: 240, after: 120 } }));
		} else if (kind === "bullets") {
			for (const item of (block.items ?? []).slice(0, 60)) children.push(new Paragraph({ text: text(item, 800), bullet: { level: 0 } }));
		} else if (kind === "table") {
			const { columns, rows } = grid(block);
			if (columns.length) {
				const cell = (value: unknown, header: boolean) => new TableCell({
					children: [new Paragraph({ children: [new TextRun({ text: text(value, 200), bold: header, color: header ? "FFFFFF" : undefined, size: 20 })], alignment: typeof value === "number" ? AlignmentType.RIGHT : AlignmentType.LEFT })],
					shading: header ? { fill: PALETTE[0] } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 },
				});
				children.push(new Table({
					width: { size: 100, type: WidthType.PERCENTAGE },
					borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }, left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }, right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" } },
					rows: [new TableRow({ tableHeader: true, children: columns.map((c) => cell(c, true)) }), ...rows.slice(0, 200).map((row) => new TableRow({ children: columns.map((_, c) => cell(row[c], false)) }))],
				}));
				children.push(new Paragraph({ text: "" }));
			}
		} else if (kind === "chart") {
			const chart = (block.chart ?? block) as RichChart;
			const png = await renderChartPng(chart, 1000, 560);
			children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: png, transformation: { width: 600, height: 336 }, altText: { title: text(chart.title, 100) || "Chart", description: text(block.caption, 200) || "Chart", name: "chart" } })] }));
			if (block.caption) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: text(block.caption, 200), italics: true, size: 18 })] }));
		} else {
			children.push(new Paragraph({ children: [new TextRun({ text: text(block.text, 4000), size: 22 })], spacing: { after: 120 } }));
		}
	}
	if (children.length === 0) children.push(new Paragraph({ text: text(spec.title, 160) || "Document" }));
	const doc = new Document({ creator: "Project Agent", title: text(spec.title, 160), sections: [{ children }] });
	return new Uint8Array(await Packer.toBuffer(doc));
}

export async function buildXlsx(spec: RichSpec): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	for (const [index, sheet] of (spec.sheets ?? []).slice(0, 10).entries()) {
		const name = text(sheet.name || `Sheet${index + 1}`, 31).replace(/[\\/?*[\]:]/g, " ").trim() || `Sheet${index + 1}`;
		const ws = workbook.addWorksheet(name);
		const { columns, rows } = grid(sheet);
		if (columns.length) {
			const header = ws.addRow(columns);
			header.font = { bold: true, color: { argb: "FFFFFFFF" } };
			header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PALETTE[0]}` } };
			ws.views = [{ state: "frozen", ySplit: 1 }];
		}
		for (const row of rows) {
			ws.addRow(row.map((value) => (typeof value === "string" && value.startsWith("=") ? { formula: value.slice(1, 400) } : typeof value === "number" || value == null ? value : text(value, 1000))));
		}
		columns.forEach((title, c) => {
			const width = Math.max(title.length, ...rows.slice(0, 200).map((row) => text(row[c], 60).length)) + 2;
			ws.getColumn(c + 1).width = Math.min(48, Math.max(10, width));
		});
		if (sheet.chart) {
			const png = await renderChartPng(sheet.chart, 900, 500);
			const imageId = workbook.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: "png" });
			ws.addImage(imageId, { tl: { col: columns.length + 1, row: 1 }, ext: { width: 600, height: 333 } });
		}
	}
	if (workbook.worksheets.length === 0) workbook.addWorksheet("Sheet1");
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function buildRichFiles(specs: RichSpec[]): Promise<{ files: DifyInlineFile[]; errors: string[] }> {
	const files: DifyInlineFile[] = [];
	const errors: string[] = [];
	for (const spec of specs) {
		const type = String(spec.type).toLowerCase();
		try {
			if (type === "pptx") files.push({ name: baseName(spec, "pptx"), bytes: await buildPptx(spec) });
			else if (type === "docx") files.push({ name: baseName(spec, "docx"), bytes: await buildDocx(spec) });
			else if (type === "xlsx") files.push({ name: baseName(spec, "xlsx"), bytes: await buildXlsx(spec) });
			else if (type === "edit") continue; // applied by the caller against the attached source file
			else errors.push(`unknown file type "${text(spec.type, 20)}"`);
		} catch (error) {
			errors.push(`${type}: ${error instanceof Error ? error.message : "build failed"}`.slice(0, 200));
		}
	}
	return { files, errors };
}

export const RICH_FILE_INSTRUCTIONS = [
	"RICH FILES (preferred for any .pptx, .docx or .xlsx that needs tables, charts, or clear formatting): do NOT call the PPT, DOC, Excel Tools or Markdown Exporter plugins for these. Instead finish your reply with one fenced block per file, exactly in this form, with valid JSON and real values from the data (never invent numbers):",
	"```ong-file",
	'{"type":"pptx","filename":"Q3 Sales","title":"Q3 Sales Review","slides":[{"title":"Q3 Sales Review","subtitle":"Prepared for ..."},{"title":"Sales by region","bullets":["North leads with 120k"],"chart":{"type":"bar","title":"USD k","categories":["North","South"],"series":[{"name":"Q3","values":[120,95]}]}},{"title":"Details","table":{"columns":["Region","Sales"],"rows":[["North",120],["South",95]]}}]}',
	"```",
	'docx: {"type":"docx","filename":"Report","title":"...","blocks":[{"type":"heading","level":1,"text":"..."},{"type":"paragraph","text":"..."},{"type":"bullets","items":["..."]},{"type":"table","columns":["A","B"],"rows":[["x",1]]},{"type":"chart","chart":{"type":"line","categories":["Jan"],"series":[{"name":"Visits","values":[10]}]},"caption":"..."}]}',
	'xlsx: {"type":"xlsx","filename":"Data","sheets":[{"name":"Sheet1","columns":["Region","Sales"],"rows":[["North",120]],"chart":{"type":"bar","categories":["North"],"series":[{"name":"Sales","values":[120]}]}}]} (a string starting with = is a formula).',
	"The app renders and verifies the file after building it, so never say you have not checked it. Chart types: bar, line, pie. Slides: at most 6 bullets, one idea per slide, a title slide first. The app builds the file and the download link; after the block write a short summary of what the file contains. Keep using the normal tools for reading files, calculations and web research.",
].join("\n");
