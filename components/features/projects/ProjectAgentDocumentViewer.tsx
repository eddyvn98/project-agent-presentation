"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PdfPageCanvas, usePdfDocument } from "./usePdfDocument";
import { ProjectAgentPresentMode } from "./ProjectAgentPresentMode";
import { ProjectAgentRegionSelect, type PageRegion } from "./ProjectAgentRegionSelect";
import { ProjectAgentViewerToolbar, type ViewerZoom } from "./ProjectAgentViewerToolbar";

export interface DocumentViewerProps {
	pdfUrl: string; fileName: string; kind: "slides" | "pages";
	downloads: Array<{ label: string; href: string; name: string }>;
	editUrl?: string; expanded: boolean; onExpand: () => void; onClose: () => void;
	onRequestEdit: (page: number, region: PageRegion, note: string) => void;
	onDiscussPage: (page: number) => void;
}

/**
 * Slides and documents (rendered to PDF by LibreOffice) shown like ChatGPT's canvas: continuous pages with a page
 * rail, a grid view, zoom presets, a full-screen show for decks, and Request edits by marking an area of a page.
 */
export function ProjectAgentDocumentViewer(props: DocumentViewerProps) {
	const { doc, pages, error } = usePdfDocument(props.pdfUrl);
	const [view, setView] = useState<"list" | "grid">("list");
	const [zoom, setZoom] = useState<ViewerZoom>("fit");
	const [editing, setEditing] = useState(false);
	const [presenting, setPresenting] = useState<number | null>(null);
	const [current, setCurrent] = useState(1);
	const [visible, setVisible] = useState<Set<number>>(new Set([1, 2]));
	const [width, setWidth] = useState(0);
	const [openingEditor, setOpeningEditor] = useState(false);
	const [notice, setNotice] = useState("");
	const scroller = useRef<HTMLDivElement>(null);
	const refs = useRef(new Map<number, HTMLDivElement>());
	useEffect(() => {
		const element = scroller.current;
		if (!element) return;
		const observer = new ResizeObserver(() => setWidth(element.clientWidth));
		observer.observe(element); setWidth(element.clientWidth);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!pages.length || view !== "list") return;
		const near = new IntersectionObserver((entries) => setVisible((previous) => {
			const next = new Set(previous);
			for (const entry of entries) { const page = Number((entry.target as HTMLElement).dataset.page); if (entry.isIntersecting) next.add(page); }
			return next;
		}), { root: scroller.current, rootMargin: "800px 0px" });
		const focus = new IntersectionObserver((entries) => {
			const best = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
			if (best) setCurrent(Number((best.target as HTMLElement).dataset.page));
		}, { root: scroller.current, threshold: [0.3, 0.6, 0.9] });
		refs.current.forEach((element) => { near.observe(element); focus.observe(element); });
		return () => { near.disconnect(); focus.disconnect(); };
	}, [pages, view, zoom, width]);
	const pageWidth = (index: number) => {
		const info = pages[index];
		if (!info) return 0;
		return zoom === "fit" ? Math.max(200, width - 72) : (info.width * zoom) / 100;
	};
	const goTo = (page: number) => { setView("list"); requestAnimationFrame(() => refs.current.get(page)?.scrollIntoView({ behavior: "smooth", block: "start" })); };
	const openEditor = props.editUrl ? async () => {
		const editorWindow = window.open("about:blank", "_blank");
		setOpeningEditor(true); setNotice("");
		try {
			const response = await fetch(props.editUrl!, { method: "POST" }); const result = await response.json();
			if (!response.ok) throw new Error(result.error || "Could not open the editor");
			if (editorWindow) editorWindow.location.href = result.editorUrl; else window.location.assign(result.editorUrl);
		} catch (cause) { editorWindow?.close(); setNotice(cause instanceof Error ? cause.message : "Could not open the editor"); } finally { setOpeningEditor(false); }
	} : undefined;
	return <div className="flex min-h-0 flex-1 flex-col">
		<ProjectAgentViewerToolbar fileName={props.fileName} view={view} onView={setView} editing={editing} onEditing={setEditing} zoom={zoom} onZoom={setZoom}
			onPresent={doc && props.kind === "slides" ? () => setPresenting(current) : undefined} downloads={props.downloads} onOpenEditor={openEditor} openingEditor={openingEditor}
			expanded={props.expanded} onExpand={props.onExpand} onClose={props.onClose} />
		{(notice || editing) && <p role="status" className="shrink-0 border-b border-slate-200 bg-orange-50 px-4 py-1.5 text-xs text-orange-800 dark:border-slate-800 dark:bg-orange-950 dark:text-orange-200">{notice || "Drag over the area to change, then describe the change and press Send."}</p>}
		<div className="relative flex min-h-0 flex-1">
			{view === "list" && pages.length > 1 && <nav aria-label="Pages" className="absolute left-2 top-1/2 z-10 flex max-h-[80%] -translate-y-1/2 flex-col gap-1 overflow-y-auto py-1">
				{pages.map((_, index) => <button key={index} type="button" onClick={() => goTo(index + 1)} aria-label={`Go to ${props.kind === "slides" ? "slide" : "page"} ${index + 1}`} aria-current={current === index + 1 ? "page" : undefined} className={`h-0.5 rounded-full transition-all ${current === index + 1 ? "w-5 bg-slate-800 dark:bg-slate-100" : "w-3 bg-slate-300 hover:w-4 dark:bg-slate-600"}`} />)}
			</nav>}
			<div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
				{error && <p role="alert" className="mx-auto max-w-lg py-10 text-center text-sm text-slate-500">Could not render this file. Download it to view in a compatible application.</p>}
				{!error && !doc && <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing preview…</p>}
				{doc && view === "list" && <div className="flex flex-col items-center gap-4 px-9 py-6">
					{pages.map((info, index) => {
						const page = index + 1, w = pageWidth(index);
						return <div key={page} data-page={page} ref={(element) => { if (element) refs.current.set(page, element); else refs.current.delete(page); }} className="group relative shrink-0 bg-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" style={{ width: w, height: (w * info.height) / info.width }}>
							{visible.has(page) && w > 0 && <PdfPageCanvas doc={doc} page={page} width={w} />}
							{editing && <ProjectAgentRegionSelect onSubmit={(region, note) => { props.onRequestEdit(page, region, note); setEditing(false); setNotice(`Sent your change for the marked area of ${props.kind === "slides" ? "slide" : "page"} ${page} to the agent.`); }} />}
							{!editing && <button type="button" onClick={() => props.onDiscussPage(page)} className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] text-slate-600 opacity-0 shadow ring-1 ring-slate-200 transition-opacity group-hover:opacity-100 dark:bg-slate-900/90 dark:text-slate-300">Ask about {props.kind === "slides" ? "slide" : "page"} {page}</button>}
						</div>;
					})}
				</div>}
				{doc && view === "grid" && <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 p-6">
					{pages.map((_, index) => <button key={index} type="button" onClick={() => goTo(index + 1)} className="flex flex-col items-center gap-1 text-xs text-slate-500" aria-label={`Open ${props.kind === "slides" ? "slide" : "page"} ${index + 1}`}>
						<span className="block bg-white shadow-sm ring-1 ring-slate-200 hover:ring-2 hover:ring-orange-400 dark:ring-slate-700"><PdfPageCanvas doc={doc} page={index + 1} width={170} /></span>{index + 1}
					</button>)}
				</div>}
			</div>
		</div>
		{doc && presenting !== null && <ProjectAgentPresentMode doc={doc} pages={pages} start={presenting} onClose={(page) => { setPresenting(null); goTo(page); }} />}
	</div>;
}
