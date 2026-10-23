"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { PdfRenderer } from "@/components/features/chat/file-preview-media-renderers";

export type PanelMode = "edit" | "pdf";

export const pdfViewUrl = (boardId: string, blockId: string, stamp: number) => `/api/workspaces/${encodeURIComponent(boardId)}/export?format=pdf&inline=1&blockIds=${encodeURIComponent(JSON.stringify([blockId]))}&t=${stamp}`;

/** Edit / PDF switch for the side panel: the PDF is what the exported file looks like, which the web editor can differ from. */
export function PanelModeTabs({ mode, onChange }: { mode: PanelMode; onChange: (mode: PanelMode) => void }) {
	const tab = (value: PanelMode, label: string) => <button type="button" onClick={() => onChange(value)} aria-pressed={mode === value} className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>{label}</button>;
	return <div role="group" aria-label="View mode" className="flex shrink-0 gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">{tab("edit", "Edit")}{tab("pdf", "PDF view")}</div>;
}

/** The exported file rendered as PDF, rebuilt each time it is opened or refreshed so it shows the latest saved edits. */
export function PdfViewFrame({ boardId, blockId, name }: { boardId: string; blockId: string; name: string }) {
	const [stamp, setStamp] = useState(() => Date.now());
	return <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-900">
		<div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
			<span>Rendered from the saved edits, the way the downloaded file will look.</span>
			<button type="button" onClick={() => setStamp(Date.now())} className="inline-flex shrink-0 items-center gap-1 text-orange-600 hover:underline"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
		</div>
		<div className="min-h-0 flex-1 overflow-hidden" aria-label={`PDF view of ${name}`}><PdfRenderer key={stamp} fileUrl={pdfViewUrl(boardId, blockId, stamp)} /></div>
	</div>;
}
