"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, LayoutGrid, Presentation, Table2, X } from "lucide-react";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";
import { PanelModeTabs, PdfViewFrame, type PanelMode } from "./ProjectAgentPdfView";
import { officeEditorUrl } from "@/lib/office/catalog";

interface BoardBlock { id: string; type: string; label: string }

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function describe(id: string, block: { type?: string; data?: Record<string, unknown> }): BoardBlock | null {
	const data = block.data ?? {};
	if (block.type === "doc") return { id, type: "doc", label: text(String(data.html ?? "")).slice(0, 48) || "Document" };
	if (block.type === "table") return { id, type: "table", label: String(data.title || "Spreadsheet").slice(0, 48) };
	if (block.type === "slideDeck") return { id, type: "slideDeck", label: String(data.title || "Slide deck").slice(0, 48) };
	return null;
}

const ICONS: Record<string, typeof FileText> = { doc: FileText, table: Table2, slideDeck: Presentation };
const boardUrl = (boardId: string) => `/workspace?id=${encodeURIComponent(boardId)}`;
const editorUrl = (boardId: string, block: BoardBlock, embed: boolean) => block.type === "table"
	? `/workspace/table-editor?boardId=${encodeURIComponent(boardId)}&tableId=${encodeURIComponent(block.id)}${embed ? "&embed=1" : ""}`
	: block.type === "slideDeck"
		? officeEditorUrl("presentation", boardId, block.id)
		: `/workspace/doc-editor?boardId=${encodeURIComponent(boardId)}&docId=${encodeURIComponent(block.id)}${embed ? "&embed=1" : ""}`;
const exportUrl = (boardId: string, block: BoardBlock) => `/api/workspaces/${encodeURIComponent(boardId)}/export?format=${block.type === "doc" ? "docx" : "pptx"}&blockIds=${encodeURIComponent(JSON.stringify([block.id]))}`;

/** Agent-created Workspace files open in the existing side panel; slide decks launch their dedicated Studio. */
export function ProjectAgentWorkspaceCard({ boardId, refreshKey }: { boardId: string; refreshKey: string }) {
	const [title, setTitle] = useState("");
	const [blocks, setBlocks] = useState<BoardBlock[]>([]);
	const [openId, setOpenId] = useState<string | null>(null);
	const [mode, setMode] = useState<PanelMode>("edit");
	const show = (id: string, next: PanelMode) => { setMode(next); setOpenId(id); };
	useEffect(() => {
		let cancelled = false;
		void fetch(`/api/workspaces/${encodeURIComponent(boardId)}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((board) => {
			if (cancelled || !board) return;
			const all = (board.blocks ?? {}) as Record<string, { type?: string; data?: Record<string, unknown> }>;
			const order: string[] = Array.isArray(board.blockOrder) ? board.blockOrder : Object.keys(all);
			setTitle(String(board.title ?? ""));
			setBlocks(order.map((id) => (all[id] ? describe(id, all[id]) : null)).filter((item): item is BoardBlock => Boolean(item)));
		}).catch(() => {});
		return () => { cancelled = true; };
	}, [boardId, refreshKey]);
	const open = useMemo(() => blocks.find((block) => block.id === openId) ?? null, [blocks, openId]);
	return <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
		<div className="flex items-center gap-2 text-xs text-slate-500"><LayoutGrid className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{title || "Workspace board"}</span>
			<a href={boardUrl(boardId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-orange-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Open board</a></div>
		{blocks.length > 0 && <ul className="mt-2 space-y-1">{blocks.map((block) => {
			const Icon = ICONS[block.type] ?? FileText;
			const editable = block.type === "doc" || block.type === "table";
			return <li key={block.id} className="flex items-center gap-2 text-sm">
				<button type="button" onClick={() => block.type === "slideDeck"
					? window.open(editorUrl(boardId, block, false), "_blank", "noopener,noreferrer")
					: editable ? show(block.id, "edit") : show(block.id, "pdf")}
					className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"><Icon className="h-4 w-4 shrink-0 text-orange-600" /><span className="truncate">{block.label}</span></button>
				<button type="button" onClick={() => show(block.id, "pdf")} aria-label="View as PDF" title="View as PDF" className="rounded px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">PDF</button>
				{editable && <a href={editorUrl(boardId, block, false)} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" /></a>}
				{block.type !== "table" && <a href={exportUrl(boardId, block)} aria-label={block.type === "doc" ? "Download as Word" : "Download as PowerPoint"} title={block.type === "doc" ? "Download as Word" : "Download as PowerPoint"} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Download className="h-4 w-4" /></a>}
			</li>;
		})}</ul>}
		{open && <><style>{CANVAS_LAYOUT_STYLE}</style>
			<div data-project-agent-canvas="open" className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 md:w-[42vw] md:max-w-[1100px]" role="dialog" aria-modal="false" aria-label={open.label}>
			<header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 dark:border-gray-800"><strong className="min-w-0 flex-1 truncate text-sm">{open.label}</strong>{(open.type === "doc" || open.type === "table") && <PanelModeTabs mode={mode} onChange={setMode} />}
				<a href={editorUrl(boardId, open, false)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Expand in a new tab</a>
				<button type="button" onClick={() => setOpenId(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button></header>
			{(open.type === "doc" || open.type === "table") && <iframe key={open.id} src={editorUrl(boardId, open, true)} title={open.label} className={`min-h-0 flex-1 border-0 ${mode === "edit" ? "" : "hidden"}`} />}
			{(mode === "pdf" || open.type === "slideDeck") && <PdfViewFrame key={`${open.id}-pdf`} boardId={boardId} blockId={open.id} name={open.label} />}
		</div></>}
	</div>;
}
