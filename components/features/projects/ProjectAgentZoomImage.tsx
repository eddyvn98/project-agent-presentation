"use client";

import { useState, type ReactNode } from "react";
import { Brush } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../../ui/dialog";

/** Wraps a thumbnail so a click enlarges the image in a dialog on the same page instead of opening a new tab. */
export function ProjectAgentZoomImage({ src, alt, title, label, className, children, onMark }: { src: string; alt: string; title?: string; label: string; className?: string; children: ReactNode; onMark?: () => void }) {
	const [open, setOpen] = useState(false);
	const [zoom, setZoom] = useState(1);
	return (
		<>
			<Dialog open={open} onOpenChange={(value) => { setOpen(value); setZoom(1); }}>
				<DialogTrigger asChild><button type="button" title={title} aria-label={label} className={className}>{children}</button></DialogTrigger>
				<DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl overflow-auto p-2 sm:p-4">
					<DialogTitle className="pr-8">{alt || "Illustration"}</DialogTitle>
					<DialogDescription>Zoom to inspect details. Scroll to explore the image.</DialogDescription>
					<div className="flex flex-wrap items-center gap-2">
						<button type="button" className="min-h-10 rounded border px-3" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))} aria-label="Zoom out image">−</button>
						<output aria-live="polite" className="min-w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</output>
						<button type="button" className="min-h-10 rounded border px-3" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + 0.5))} aria-label="Zoom in image">+</button>
						<button type="button" className="min-h-10 rounded border px-3" onClick={() => setZoom(1)}>Reset</button>
					</div>
					{onMark && <button type="button" onClick={() => { setOpen(false); onMark(); }} className="justify-self-start inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-xs font-medium text-slate-700 shadow hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200" aria-label="Mark an area and request an image change"><Brush className="h-4 w-4" />Mark area</button>}
					{/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
					<div role="region" tabIndex={0} aria-label="Enlarged image" className="overflow-auto" style={{ maxHeight: "65dvh" }}>
						<img src={src} alt={alt} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto" }} />
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
