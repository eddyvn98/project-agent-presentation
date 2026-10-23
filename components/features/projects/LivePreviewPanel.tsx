"use client";

import { useState } from "react";
import { ExternalLink, Monitor, RotateCw, Smartphone, X } from "lucide-react";
import { CANVAS_LAYOUT_STYLE } from "./ProjectAgentFilePreview";

export interface LivePreviewItem { port: number; title: string; url: string }

/** The agent's running site beside the chat, in a frame with an opaque origin (no cookies or app access). */
export function LivePreviewPanel({ preview, ended, onReload, onClose }: { preview: LivePreviewItem; ended: boolean; onReload: () => void; onClose: () => void }) {
	const [device, setDevice] = useState<"desktop" | "phone">("desktop");
	const [frameKey, setFrameKey] = useState(0);
	const reload = () => { onReload(); setFrameKey((key) => key + 1); };
	const tool = "rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800";
	return <><style>{CANVAS_LAYOUT_STYLE}</style>
		<div data-project-agent-canvas="open" data-live-preview="open" className="fixed right-0 top-12 z-[70] flex h-[calc(100dvh-3rem)] w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-gray-950 md:w-[42vw]">
			<header className="flex h-12 shrink-0 items-center gap-1 border-b px-3 dark:border-gray-800">
				<strong className="min-w-0 flex-1 truncate text-sm">{preview.title}<span className="ml-2 text-xs font-normal text-slate-400">live</span></strong>
				<button type="button" aria-pressed={device === "desktop"} aria-label="Desktop size" title="Desktop size" onClick={() => setDevice("desktop")} className={`${tool} ${device === "desktop" ? "bg-slate-100 dark:bg-slate-800" : ""}`}><Monitor className="h-4 w-4" /></button>
				<button type="button" aria-pressed={device === "phone"} aria-label="Phone size" title="Phone size" onClick={() => setDevice("phone")} className={`${tool} ${device === "phone" ? "bg-slate-100 dark:bg-slate-800" : ""}`}><Smartphone className="h-4 w-4" /></button>
				<button type="button" aria-label="Reload preview" title="Reload preview" onClick={reload} className={tool}><RotateCw className="h-4 w-4" /></button>
				<a href={preview.url} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab" className={tool}><ExternalLink className="h-4 w-4" /></a>
				<button type="button" aria-label="Close preview" title="Close" onClick={onClose} className={tool}><X className="h-4 w-4" /></button>
			</header>
			{ended
				? <p role="status" className="p-6 text-sm text-slate-500">The server is not running any more. Ask the agent to start it again.</p>
				: <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-100 dark:bg-slate-900">
					<iframe key={frameKey} src={preview.url} title={preview.title} sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
						className={`h-full border-0 bg-white ${device === "phone" ? "w-[390px] max-w-full shadow-lg" : "w-full"}`} />
				</div>}
		</div></>;
}
