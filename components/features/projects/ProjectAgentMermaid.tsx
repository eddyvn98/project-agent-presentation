"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type RenderedDiagram = { code: string; svg: string; width: number };
const CONTROL = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

export function ProjectAgentMermaid({ code, title, caption }: { code: string; title?: string; caption?: string }) {
	const [diagram, setDiagram] = useState<RenderedDiagram | null>(null);
	const [error, setError] = useState(false);
	const [open, setOpen] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [previewHeight, setPreviewHeight] = useState(0);
	const preview = useRef<HTMLDivElement>(null);
	const label = title || "Diagram";
	const ready = diagram?.code === code;

	useEffect(() => {
		let cancelled = false;
		setError(false);
		setOpen(false);
		setZoom(1);
		(async () => {
			try {
				const mermaid = (await import("mermaid")).default;
				mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
				const { svg } = await mermaid.render(`ong-ui-${Math.random().toString(36).slice(2, 9)}`, code);
				if (cancelled) return;
				const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
				const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
				const width = viewBox?.[2] || Number.parseFloat(root.getAttribute("width") || "") || 800;
				root.setAttribute("width", "100%");
				root.removeAttribute("height");
				root.setAttribute("style", "width:100%;max-width:none;height:auto");
				setDiagram({ code, svg: new XMLSerializer().serializeToString(root), width });
			} catch {
				if (!cancelled) setError(true);
			}
		})();
		return () => { cancelled = true; };
	}, [code]);

	function changeOpen(value: boolean) {
		if (value) {
			setPreviewHeight(preview.current?.getBoundingClientRect().height || 0);
			setZoom(1);
		}
		setOpen(value);
	}

	return (
		<figure className="not-prose my-5 min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
			<Dialog open={open && ready} onOpenChange={changeOpen}>
				<div className="mb-3 flex items-center justify-between gap-3">
					<figcaption className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</figcaption>
					{ready && <DialogTrigger asChild><button type="button" className={CONTROL} aria-label={`Enlarge ${label}`}><Maximize2 aria-hidden className="h-3.5 w-3.5" />Enlarge</button></DialogTrigger>}
				</div>
				{!ready && !error && <p role="status" className="animate-pulse text-xs text-slate-400">Rendering diagram…</p>}
				{error && <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-500">{code}</pre>}
				{ready && <div ref={preview} className="max-h-80 overflow-auto rounded-lg bg-white outline-none focus-visible:ring-2 focus-visible:ring-orange-500" role="region" aria-label={`${label}, scroll to explore`} tabIndex={0} style={open ? { height: previewHeight } : undefined}>
					{!open && <div className="flex w-max min-w-full justify-center">
						<button type="button" onClick={() => changeOpen(true)} aria-label={`Enlarge ${label}`} aria-haspopup="dialog" className="block shrink-0 cursor-zoom-in rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500" style={{ width: diagram.width }}>
							<div aria-hidden dangerouslySetInnerHTML={{ __html: diagram.svg }} />
						</button>
					</div>}
				</div>}
				{ready && <p className="mt-1 text-right text-[11px] text-slate-400">Scroll to explore · Enlarge for details</p>}
				<DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[96rem] flex-col overflow-hidden p-4 sm:p-6">
					<DialogTitle className="pr-8">{label}</DialogTitle>
					<DialogDescription>Scroll to explore the diagram. Use the zoom controls to adjust label size.</DialogDescription>
					<div className="flex flex-wrap items-center gap-2">
						<button type="button" className={CONTROL} aria-label="Zoom out diagram" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}><Minus aria-hidden className="h-4 w-4" /></button>
						<output aria-live="polite" className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</output>
						<button type="button" className={CONTROL} aria-label="Zoom in diagram" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><Plus aria-hidden className="h-4 w-4" /></button>
						<button type="button" className={CONTROL} onClick={() => setZoom(1)}><RotateCcw aria-hidden className="h-3.5 w-3.5" />Reset</button>
					</div>
					<div className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-3 outline-none focus-visible:ring-2 focus-visible:ring-orange-500" role="region" aria-label={`${label}, scrollable enlarged diagram`} tabIndex={0}>
						{ready && open && <div className="flex w-max min-w-full justify-center"><div role="img" aria-label={label} className="shrink-0" style={{ width: diagram.width * zoom }} dangerouslySetInnerHTML={{ __html: diagram.svg }} /></div>}
					</div>
				</DialogContent>
			</Dialog>
			{caption && <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{caption}</p>}
		</figure>
	);
}
