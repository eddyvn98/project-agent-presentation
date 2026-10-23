import type { WorkspaceBoardSnapshot, WorkspaceJson } from "@/lib/workspace-agent/contracts";
import { summarizeBoard } from "@/lib/workspace-agent/boardSummary";
import { summarizeRuntimeDoc } from "@/lib/workspace-agent/boardRichContentSummary";
import { exportBoardContent } from "@/lib/workspace/board-export-import";

const MAX_FULL_CHARS = 30_000;
const MAX_SLIDE_HTML = 6_000;
// Fields shown in the block line itself or only worth their space for requested blocks.
const LINE_FIELDS = new Set(["id", "type", "title", "description", "cells", "docText", "docTextTruncated", "docLines", "docReadError", "sheets", "sheetsTruncated"]);
const MAX_SHEET_LINES = 80;

const record = (value: unknown): WorkspaceJson => value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
const one = (text: unknown, max: number) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Sheet ids and names in full: table commands address sheets by exact id, so they must not fall into the cut-off extras. */
function sheetLine(row: WorkspaceJson): string {
	const sheets = Array.isArray(row.sheets) ? row.sheets.map(record) : [];
	if (!sheets.length) return "";
	const shown = sheets.slice(0, MAX_SHEET_LINES).map((sheet) => `${sheet.id} ${JSON.stringify(sheet.name)}${sheet.rows !== undefined ? ` ${sheet.rows}x${sheet.cols}` : ""}`).join("; ");
	return `\n    sheets (id name rows x cols): ${shown}${sheets.length > MAX_SHEET_LINES || row.sheetsTruncated ? "; more sheets exist" : ""}`;
}

function blockLine(row: WorkspaceJson): string {
	const extra = Object.fromEntries(Object.entries(row).filter(([key, value]) => !LINE_FIELDS.has(key) && value !== undefined && value !== ""));
	const detail = row.type === "doc" ? one(row.docText, 160) : one(row.title, 120);
	const note = one(row.description, 100);
	const extras = Object.keys(extra).length ? ` ${JSON.stringify(extra).slice(0, 500)}` : "";
	return `- ${row.id} [${row.type}] ${JSON.stringify(detail)}${note ? ` (${note})` : ""}${extras}${sheetLine(row)}`;
}

/** Full content of the requested blocks: Markdown export, plus the line ids of docs and the html of slides, which the edit commands address. */
function requestedContent(snapshot: WorkspaceBoardSnapshot, blockIds: string[]): string {
	const exported = exportBoardContent(snapshot as never, "markdown", blockIds);
	const blocks = record(snapshot.blocks);
	const parts: string[] = [exported.ok ? exported.export.content.slice(0, MAX_FULL_CHARS) : `Could not read these blocks: ${exported.error}`];
	for (const id of blockIds) {
		const block = record(blocks[id]);
		const data = record(block.data);
		if (block.type === "doc") {
			const lines = (summarizeRuntimeDoc(data).docLines as WorkspaceJson[] | undefined) ?? [];
			if (lines.length) parts.push(`Doc ${id} line ids (for lineId edits):\n${lines.map((line) => `${line.lineId}: ${one(line.text, 100)}`).join("\n")}`);
		} else if (block.type === "slideDeck") {
			const slides = record(data.slides);
			const order = Array.isArray(data.slideOrder) ? data.slideOrder.map(String) : Object.keys(slides);
			parts.push(`Deck ${id} slides (complete html; edit by sending the whole changed html):\n${order.map((slideId) => { const slide = record(slides[slideId]); const html = String(slide.html ?? ""); return `# ${slideId} "${one(slide.name, 80)}"${html.length > MAX_SLIDE_HTML ? " (html cut)" : ""}\n${html.slice(0, MAX_SLIDE_HTML)}${slide.presenterNotes ? `\nnotes: ${one(slide.presenterNotes, 600)}` : ""}`; }).join("\n")}`);
		}
	}
	return parts.join("\n\n");
}

/** A compact view of the board: revision, block ids, types and short content, connectors, frames; the requested blocks in full. */
export function formatBoardView(snapshot: WorkspaceBoardSnapshot, options: { canMutate: boolean; links: string; blockIds?: string[] }): string {
	const board = summarizeBoard(snapshot, options.canMutate, "");
	const rows = (board.blocks as WorkspaceJson[]) ?? [];
	const total = Object.keys(record(snapshot.blocks)).length;
	const connectors = (board.connectors as WorkspaceJson[]) ?? [];
	const frames = (board.frames as WorkspaceJson[]) ?? [];
	const lines = [
		`Board ${JSON.stringify(snapshot.title)}, revision ${snapshot.revision}, ${options.canMutate ? "you can edit it" : "view only: you cannot change it"}.`,
		options.links,
		total ? `Blocks (${total}${total > rows.length ? `, first ${rows.length} shown` : ""}):` : "The board is empty.",
		...rows.map(blockLine),
		...(connectors.length ? [`Connectors (${connectors.length}):`, ...connectors.slice(0, 30).map((item) => `- ${item.id}: ${item.fromBlockId} -> ${item.toBlockId}${item.label ? ` ${JSON.stringify(item.label)}` : ""}`)] : []),
		...(frames.length ? [`Frames: ${frames.slice(0, 20).map((item) => `${item.id} ${JSON.stringify(item.name)}`).join(", ")}`] : []),
	];
	if (options.blockIds?.length) lines.push("", "Requested blocks in full:", requestedContent(snapshot, options.blockIds));
	else if (rows.length) lines.push("", "Add blockIds to see the full content of blocks (docs, tables, slides) before editing them.");
	return lines.join("\n");
}
