"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Download, ExternalLink, LayoutGrid, List, Maximize2, Minimize2, Play, SquareDashedMousePointer, X } from "lucide-react";

export type ViewerZoom = "fit" | 25 | 50 | 100 | 200;
const ZOOMS: ViewerZoom[] = [25, 50, 100, 200, "fit"];
const button = "inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Menu({ label, icon, children, align = "right" }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
		const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
		document.addEventListener("mousedown", away); document.addEventListener("keydown", escape);
		return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
	}, [open]);
	return <div ref={root} className="relative">
		<button type="button" className={button} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((value) => !value)}>{icon}<ChevronDown className="h-3 w-3" /></button>
		{open && <div role="menu" className={`absolute ${align === "left" ? "left-0" : "right-0"} top-9 z-30 min-w-40 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900`}>{children(() => setOpen(false))}</div>}
	</div>;
}
const item = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

export interface ViewerToolbarProps {
	fileName: string; view?: "list" | "grid"; onView?: (view: "list" | "grid") => void;
	editing?: boolean; onEditing?: (value: boolean) => void; zoom: ViewerZoom; onZoom: (zoom: ViewerZoom) => void;
	onPresent?: () => void; downloads: Array<{ label: string; href: string; name: string }>;
	onOpenEditor?: () => void; openingEditor?: boolean; expanded: boolean; onExpand: () => void; onClose: () => void;
}

/** Viewer header modelled on ChatGPT's document canvas: view and zoom menus, Request edits, present, download, expand. */
export function ProjectAgentViewerToolbar(props: ViewerToolbarProps) {
	const documentView = props.view !== undefined && props.onView !== undefined;
	return <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-slate-200 px-2 sm:gap-2 sm:px-3 dark:border-slate-800">
		<button type="button" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800" onClick={props.onClose} aria-label="Back to chat"><ArrowLeft className="h-4 w-4" />Chat</button>
		{documentView ? <Menu label="View" align="left" icon={props.view === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}>{(close) => <>
			<p className="truncate px-3 py-1.5 text-xs text-slate-500">{props.fileName}</p>
			<button type="button" role="menuitemradio" aria-checked={props.view === "list"} className={item} onClick={() => { props.onView?.("list"); close(); }}>Page view{props.view === "list" && <Check className="h-3.5 w-3.5" />}</button>
			<button type="button" role="menuitemradio" aria-checked={props.view === "grid"} className={item} onClick={() => { props.onView?.("grid"); close(); }}>Grid view{props.view === "grid" && <Check className="h-3.5 w-3.5" />}</button>
		</>}</Menu> : <strong className="min-w-0 flex-1 truncate px-2 text-sm">{props.fileName}</strong>}
		{props.onEditing && <button type="button" className={`${button} ${props.editing ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950" : ""}`} aria-pressed={props.editing} onClick={() => props.onEditing?.(!props.editing)} title="Mark an area and describe the change" aria-label="Request edits"><SquareDashedMousePointer className="h-3.5 w-3.5" /><span className="hidden sm:inline">Request edits</span></button>}
		{documentView && <span className="min-w-0 flex-1" />}
		<Menu label="Zoom" icon={<span className="tabular-nums">{props.zoom === "fit" ? "Fit" : `${props.zoom}%`}</span>}>{(close) => ZOOMS.map((zoom) => <button key={zoom} type="button" role="menuitemradio" aria-checked={props.zoom === zoom} className={item} onClick={() => { props.onZoom(zoom); close(); }}>{zoom === "fit" ? "Fit" : `${zoom}%`}{props.zoom === zoom && <Check className="h-3.5 w-3.5" />}</button>)}</Menu>
		{props.onPresent && <button type="button" className={button} onClick={props.onPresent} aria-label="Present" title="Present"><Play className="h-3.5 w-3.5" /></button>}
		<Menu label="Download" icon={<Download className="h-3.5 w-3.5" />}>{(close) => props.downloads.map((download) => <a key={download.href} role="menuitem" href={download.href} download={download.name} className={item} onClick={close}>{download.label}</a>)}</Menu>
		{props.onOpenEditor && <button type="button" className={button} onClick={props.onOpenEditor} disabled={props.openingEditor} title="Open in the web editor" aria-label="Open in the web editor"><ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">{props.openingEditor ? "Opening…" : "Edit"}</span></button>}
		<button type="button" className={`${button} hidden md:inline-flex`} onClick={props.onExpand} aria-label={props.expanded ? "Exit full width" : "Full width"} title={props.expanded ? "Exit full width" : "Full width"}>{props.expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
		<button type="button" className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={props.onClose} aria-label="Close preview"><X className="h-4 w-4" /></button>
	</header>;
}
